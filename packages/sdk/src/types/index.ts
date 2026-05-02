/**
 * @rivus/sdk — Type Definitions
 */

export type StreamType = "linear" | "cliff_linear" | "stepped";

export type NetworkPassphrase =
  | "Test SDF Network ; September 2015"
  | "Public Global Stellar Network ; September 2015";

export interface RivusConfig {
  /** "testnet" | "mainnet" */
  network: "testnet" | "mainnet";
  /** Override the default Soroban RPC URL */
  rpcUrl?: string;
  /** The deployed StreamManager contract ID */
  contractId: string;
}

// ---------------------------------------------------------------------------
// Stream data shapes
// ---------------------------------------------------------------------------

export interface Stream {
  id: string;
  sender: string;
  recipient: string;
  /** SEP-41 token contract address */
  token: string;
  /** Human-readable asset code for display (e.g. "USDC") */
  assetCode?: string;
  /** Total amount deposited in base units (stroops) */
  totalAmount: bigint;
  /** Amount already withdrawn */
  withdrawn: bigint;
  /** Unix timestamp (seconds) */
  startTime: number;
  /** Unix timestamp (seconds) */
  endTime: number;
  /** Seconds from startTime before any unlock (cliff_linear only) */
  cliffDuration: number;
  /** Seconds between each unlock chunk (stepped only) */
  stepInterval: number;
  streamType: StreamType;
  cancelled: boolean;
}

export interface StreamProgress {
  streamId: string;
  claimable: bigint;
  totalAmount: bigint;
  withdrawn: bigint;
  percentVested: number;
  isEnded: boolean;
  isCancelled: boolean;
}

// ---------------------------------------------------------------------------
// Function input shapes
// ---------------------------------------------------------------------------

export interface CreateStreamParams {
  /** Funding wallet address */
  sender: string;
  /** Receiving wallet address */
  recipient: string;
  /** SEP-41 token contract address */
  token: string;
  /** Total tokens to stream, in base units */
  totalAmount: bigint;
  /** Unix timestamp stream starts */
  startTime: number;
  /** Unix timestamp stream ends */
  endTime: number;
  streamType: StreamType;
  /** Required for cliff_linear: seconds before unlock begins */
  cliffDuration?: number;
  /** Required for stepped: seconds between chunk releases */
  stepInterval?: number;
}

export interface WithdrawParams {
  streamId: string;
  /** Signer function — receives XDR, returns signed XDR */
  sign: SignerFn;
}

export interface CancelParams {
  streamId: string;
  sender: string;
  sign: SignerFn;
}

// ---------------------------------------------------------------------------
// Signer abstraction (works with Freighter or any wallet)
// ---------------------------------------------------------------------------

/**
 * A function that receives an unsigned XDR transaction and returns
 * the signed XDR string. Compatible with Freighter and any custodial signer.
 *
 * @example Freighter
 * const sign: SignerFn = (xdr) => signTransaction(xdr, { network: "TESTNET" });
 */
export type SignerFn = (xdr: string) => Promise<string>;

// ---------------------------------------------------------------------------
// Indexer API response shapes (matches @rivus/indexer routes)
// ---------------------------------------------------------------------------

export interface IndexerStream extends Stream {
  createdAt: string;
  updatedAt: string;
  txHash: string;
}

export interface WithdrawalEvent {
  streamId: string;
  recipient: string;
  amount: bigint;
  timestamp: string;
  txHash: string;
  ledger: number;
}