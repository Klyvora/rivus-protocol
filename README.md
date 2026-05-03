# Rivus Protocol

**Payment streaming primitive for the Soroban ecosystem**

Rivus Protocol is an open-source, non-custodial payment streaming infrastructure built on Soroban (Stellar Smart Contracts). It lets senders lock funds into a stream and release them to receivers continuously over time -- second by second -- based on ledger timestamps. No lump sums. No trust required.

Built as part of **Drips Wave 5**.

---

## What It Does

Traditional payments move money in discrete events. Rivus treats payment as a continuous flow. Once a stream is created, the smart contract calculates unlocked funds using elapsed ledger time, allowing receivers to withdraw what they have earned at any point before the stream ends.

Core capabilities:
- Create time-bound payment streams between any two Stellar accounts
- Withdraw streamed funds at any point during an active stream
- Cancel a stream early and reclaim unstreamed funds (sender only)
- Compatible with any SAC-compliant token (USDC, XLM, stablecoins)

---

## Repository Structure

This repo is a monorepo managed with **Turborepo**.

```
rivus-protocol/
├── packages/          # All protocol packages live here
├── package.json       # Root workspace config
├── package-lock.json
├── turbo.json         # Turborepo pipeline config
└── LICENSE
```

---

## Prerequisites

Make sure you have the following installed:

- [Rust](https://www.rust-lang.org/tools/install) + `wasm32-unknown-unknown` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/stellar-cli) (formerly Soroban CLI)
- [Node.js](https://nodejs.org/) v18+
- npm v9+

Install the Rust WASM target:
```bash
rustup target add wasm32-unknown-unknown
```

---

## Getting Started

Clone the repo and install dependencies:

```bash
git clone https://github.com/Klyvora/rivus-protocol.git
cd rivus-protocol
npm install
```

Build all packages:
```bash
npm run build
```

Run tests:
```bash
npm run test
```

---

## Testnet Deployment

Live contract deployments are available on the Stellar testnet. See the `packages` directory for contract IDs and deployment details added in the latest commit.

To deploy your own instance on testnet:

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/rivus.wasm \
  --source YOUR_SECRET_KEY \
  --network testnet
```

---

## How Streaming Works

When a stream is created, the contract locks the total payment amount. Unlocked balance is calculated as:

```
Unlocked = TotalAmount x (CurrentLedgerTime - StartTime) / (EndTime - StartTime)
```

The receiver can call `withdraw` at any time to claim their unlocked balance. The sender can call `cancel` to terminate the stream early and recover the remaining locked funds.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Write tests for any new logic
4. Submit a pull request against `main`

All PRs must pass existing tests before review. Run `cargo test` inside any contract package before submitting.

---

## License

This project is licensed under the terms in the [LICENSE](./LICENSE) file.

---

## Acknowledgments

Built on [Soroban](https://stellar.org/soroban) -- the smart contract platform on the Stellar network. Submitted as part of the Drips Wave 5 contributor program.
