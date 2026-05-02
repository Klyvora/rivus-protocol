//! # StreamManager — Rivus Protocol
//!
//! The on-chain payment streaming primitive for Soroban.
//!
//! ## Stream Types
//!
//! **Linear** — tokens unlock at a constant rate per second from start to end.
//! Use for: payroll, contributor grants, recurring subscriptions.
//!
//! **CliffLinear** — zero unlock before the cliff timestamp, then linear
//! from the cliff to the end time. Use for: team token vesting,
//! contributor onboarding with a probation period.
//!
//! **Stepped** — unlocks in equal chunks at fixed intervals (e.g. every
//! 30 days). Use for: milestone-based grant disbursement, wave-style
//! funding (maps directly to how Drips structures waves).
//!
//! ## Security Model
//! - Only the sender can cancel a stream.
//! - Only the recipient can withdraw from a stream.
//! - Withdrawal is pro-rata: the contract calculates the claimable
//!   amount from ledger time alone. No oracle needed.
//! - Cancellation settles atomically: unclaimed tokens return to sender,
//!   earned tokens transfer to recipient in the same transaction.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    token, Address, Env, String,
};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum StreamType {
    /// Constant rate from start_time to end_time
    Linear,
    /// No unlock before cliff_time, then linear to end_time
    CliffLinear,
    /// Fixed chunk every step_interval seconds
    Stepped,
}

#[contracttype]
#[derive(Clone)]
pub struct Stream {
    pub id: u64,
    pub sender: Address,
    pub recipient: Address,
    /// SEP-41 token contract address
    pub token: Address,
    /// Total deposited amount (in stroops / base units)
    pub total_amount: i128,
    /// Amount already withdrawn by recipient
    pub withdrawn: i128,
    /// Unix timestamp (seconds) when stream starts
    pub start_time: u64,
    /// Unix timestamp (seconds) when stream ends
    pub end_time: u64,
    /// Only used for CliffLinear: seconds from start_time before any unlock
    pub cliff_duration: u64,
    /// Only used for Stepped: interval in seconds between each unlock chunk
    pub step_interval: u64,
    pub stream_type: StreamType,
    pub cancelled: bool,
}

#[contracttype]
pub enum DataKey {
    StreamCount,
    Stream(u64),
}

// ---------------------------------------------------------------------------
// Events (emitted for the Rivus indexer)
// ---------------------------------------------------------------------------

#[contracttype]
pub struct StreamCreatedEvent {
    pub stream_id: u64,
    pub sender: Address,
    pub recipient: Address,
    pub total_amount: i128,
    pub stream_type: String,
}

#[contracttype]
pub struct WithdrawEvent {
    pub stream_id: u64,
    pub recipient: Address,
    pub amount: i128,
    pub remaining: i128,
}

#[contracttype]
pub struct CancelEvent {
    pub stream_id: u64,
    pub refund_to_sender: i128,
    pub paid_to_recipient: i128,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct StreamManager;

#[contractimpl]
impl StreamManager {
    // -----------------------------------------------------------------------
    // Write functions
    // -----------------------------------------------------------------------

    /// Create a new payment stream.
    ///
    /// The sender must approve this contract to spend `total_amount` of
    /// `token` before calling this function (standard SEP-41 allowance).
    ///
    /// # Arguments
    /// * `sender`         — who funds and can cancel the stream
    /// * `recipient`      — who receives the streamed tokens
    /// * `token`          — SEP-41 token contract address
    /// * `total_amount`   — total tokens locked into the stream
    /// * `start_time`     — Unix timestamp when streaming begins
    /// * `end_time`       — Unix timestamp when streaming ends
    /// * `stream_type`    — Linear | CliffLinear | Stepped
    /// * `cliff_duration` — seconds before unlock begins (CliffLinear only)
    /// * `step_interval`  — seconds per step chunk (Stepped only)
    pub fn create_stream(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        total_amount: i128,
        start_time: u64,
        end_time: u64,
        stream_type: StreamType,
        cliff_duration: u64,
        step_interval: u64,
    ) -> u64 {
        sender.require_auth();

        // Guards
        if total_amount <= 0 {
            panic!("total_amount must be positive");
        }
        if end_time <= start_time {
            panic!("end_time must be after start_time");
        }
        if stream_type == StreamType::CliffLinear && cliff_duration == 0 {
            panic!("cliff_duration required for CliffLinear");
        }
        if stream_type == StreamType::Stepped && step_interval == 0 {
            panic!("step_interval required for Stepped");
        }

        // Pull tokens from sender into this contract
        let token_client = token::Client::new(&env, &token);
        token_client.transfer_from(
            &env.current_contract_address(),
            &sender,
            &env.current_contract_address(),
            &total_amount,
        );

        // Persist stream
        let mut count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::StreamCount)
            .unwrap_or(0u64);

        let stream = Stream {
            id: count,
            sender: sender.clone(),
            recipient: recipient.clone(),
            token,
            total_amount,
            withdrawn: 0,
            start_time,
            end_time,
            cliff_duration,
            step_interval,
            stream_type: stream_type.clone(),
            cancelled: false,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Stream(count), &stream);

        count += 1;
        env.storage()
            .instance()
            .set(&DataKey::StreamCount, &count);

        let type_str = match stream_type {
            StreamType::Linear => String::from_str(&env, "linear"),
            StreamType::CliffLinear => String::from_str(&env, "cliff_linear"),
            StreamType::Stepped => String::from_str(&env, "stepped"),
        };

        env.events().publish(
            (symbol_short!("CREATED"), sender.clone()),
            StreamCreatedEvent {
                stream_id: count - 1,
                sender,
                recipient,
                total_amount,
                stream_type: type_str,
            },
        );

        count - 1
    }

    /// Withdraw claimable tokens to the recipient.
    /// Can be called by anyone but tokens always go to the recipient.
    pub fn withdraw(env: Env, stream_id: u64) -> i128 {
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .expect("stream not found");

        if stream.cancelled {
            panic!("stream is cancelled");
        }

        let claimable = Self::compute_claimable(&env, &stream);
        if claimable == 0 {
            panic!("nothing to withdraw");
        }

        stream.withdrawn += claimable;
        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        let token_client = token::Client::new(&env, &stream.token);
        token_client.transfer(
            &env.current_contract_address(),
            &stream.recipient,
            &claimable,
        );

        let remaining = stream.total_amount - stream.withdrawn;

        env.events().publish(
            (symbol_short!("WITHDRAW"), stream.recipient.clone()),
            WithdrawEvent {
                stream_id,
                recipient: stream.recipient,
                amount: claimable,
                remaining,
            },
        );

        claimable
    }

    /// Cancel a stream. Only the sender can call this.
    /// Earned tokens go to the recipient immediately.
    /// Unearned tokens return to the sender.
    pub fn cancel(env: Env, sender: Address, stream_id: u64) {
        sender.require_auth();

        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .expect("stream not found");

        if stream.sender != sender {
            panic!("only the stream sender can cancel");
        }
        if stream.cancelled {
            panic!("already cancelled");
        }

        let earned = Self::compute_claimable(&env, &stream);
        let refund = stream.total_amount - stream.withdrawn - earned;

        stream.cancelled = true;
        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        let token_client = token::Client::new(&env, &stream.token);

        // Pay recipient their earned share
        if earned > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &stream.recipient,
                &earned,
            );
        }

        // Refund unearned to sender
        if refund > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &stream.sender,
                &refund,
            );
        }

        env.events().publish(
            (symbol_short!("CANCEL"), sender),
            CancelEvent {
                stream_id,
                refund_to_sender: refund,
                paid_to_recipient: earned,
            },
        );
    }

    // -----------------------------------------------------------------------
    // Read-only views
    // -----------------------------------------------------------------------

    pub fn get_stream(env: Env, stream_id: u64) -> Stream {
        env.storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .expect("stream not found")
    }

    pub fn get_claimable(env: Env, stream_id: u64) -> i128 {
        let stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .expect("stream not found");
        Self::compute_claimable(&env, &stream)
    }

    pub fn get_stream_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::StreamCount)
            .unwrap_or(0u64)
    }

    // -----------------------------------------------------------------------
    // Internal: claimable calculation
    // -----------------------------------------------------------------------

    fn compute_claimable(env: &Env, stream: &Stream) -> i128 {
        if stream.cancelled {
            return 0;
        }

        let now = env.ledger().timestamp();

        if now < stream.start_time {
            return 0;
        }

        let vested = match stream.stream_type {
            StreamType::Linear => {
                Self::linear_vested(stream, now)
            }
            StreamType::CliffLinear => {
                let cliff_end = stream.start_time + stream.cliff_duration;
                if now < cliff_end {
                    0
                } else {
                    // Linear from cliff_end to end_time
                    let duration = stream.end_time.saturating_sub(cliff_end) as i128;
                    if duration == 0 {
                        stream.total_amount
                    } else {
                        let elapsed = now.min(stream.end_time).saturating_sub(cliff_end) as i128;
                        (stream.total_amount * elapsed) / duration
                    }
                }
            }
            StreamType::Stepped => {
                let duration = stream.end_time.saturating_sub(stream.start_time);
                if stream.step_interval == 0 || duration == 0 {
                    return 0;
                }
                let total_steps = duration / stream.step_interval;
                if total_steps == 0 {
                    return 0;
                }
                let amount_per_step = stream.total_amount / total_steps as i128;
                let elapsed = now.min(stream.end_time).saturating_sub(stream.start_time);
                let steps_completed = (elapsed / stream.step_interval) as i128;
                (steps_completed * amount_per_step).min(stream.total_amount)
            }
        };

        (vested - stream.withdrawn).max(0)
    }

    fn linear_vested(stream: &Stream, now: u64) -> i128 {
        let duration = stream.end_time.saturating_sub(stream.start_time) as i128;
        if duration == 0 {
            return stream.total_amount;
        }
        let elapsed = now.min(stream.end_time).saturating_sub(stream.start_time) as i128;
        (stream.total_amount * elapsed) / duration
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup_env() -> (Env, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, StreamManager);
        (env, contract_id)
    }

    #[test]
    fn test_linear_claimable_midpoint() {
        let (env, contract_id) = setup_env();
        let client = StreamManagerClient::new(&env, &contract_id);

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token = Address::generate(&env); // mock token

        let now = env.ledger().timestamp();
        let duration = 1000u64;

        client.create_stream(
            &sender,
            &recipient,
            &token,
            &1_000_000i128,
            &now,
            &(now + duration),
            &StreamType::Linear,
            &0u64,
            &0u64,
        );

        // Advance ledger to midpoint
        env.ledger().with_mut(|l| l.timestamp = now + 500);
        let claimable = client.get_claimable(&0u64);
        assert_eq!(claimable, 500_000i128);
    }

    #[test]
    fn test_cliff_linear_before_cliff() {
        let (env, contract_id) = setup_env();
        let client = StreamManagerClient::new(&env, &contract_id);

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token = Address::generate(&env);

        let now = env.ledger().timestamp();

        client.create_stream(
            &sender,
            &recipient,
            &token,
            &1_000_000i128,
            &now,
            &(now + 1000),
            &StreamType::CliffLinear,
            &500u64, // 500s cliff
            &0u64,
        );

        // Before cliff: nothing claimable
        env.ledger().with_mut(|l| l.timestamp = now + 400);
        assert_eq!(client.get_claimable(&0u64), 0i128);

        // After cliff: partial unlock
        env.ledger().with_mut(|l| l.timestamp = now + 750);
        let claimable = client.get_claimable(&0u64);
        assert!(claimable > 0);
    }

    #[test]
    fn test_stepped_stream() {
        let (env, contract_id) = setup_env();
        let client = StreamManagerClient::new(&env, &contract_id);

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token = Address::generate(&env);

        let now = env.ledger().timestamp();

        // 4 steps of 250s, 250_000 each = 1_000_000 total
        client.create_stream(
            &sender,
            &recipient,
            &token,
            &1_000_000i128,
            &now,
            &(now + 1000),
            &StreamType::Stepped,
            &0u64,
            &250u64,
        );

        // After 1 step
        env.ledger().with_mut(|l| l.timestamp = now + 260);
        assert_eq!(client.get_claimable(&0u64), 250_000i128);

        // After 2 steps
        env.ledger().with_mut(|l| l.timestamp = now + 510);
        assert_eq!(client.get_claimable(&0u64), 500_000i128);
    }

    #[test]
    #[should_panic(expected = "only the stream sender can cancel")]
    fn test_cancel_by_non_sender_panics() {
        let (env, contract_id) = setup_env();
        let client = StreamManagerClient::new(&env, &contract_id);

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let intruder = Address::generate(&env);
        let token = Address::generate(&env);

        let now = env.ledger().timestamp();
        client.create_stream(
            &sender,
            &recipient,
            &token,
            &1_000_000i128,
            &now,
            &(now + 1000),
            &StreamType::Linear,
            &0u64,
            &0u64,
        );

        client.cancel(&intruder, &0u64);
    }
}