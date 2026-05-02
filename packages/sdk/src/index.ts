/**
 * @rivus/sdk
 * The payment streaming primitive for Soroban.
 *
 * @example
 * import { RivusClient, months, fromNow, parseAmount } from "@rivus/sdk";
 */

export { RivusClient } from "./client";
export type {
  RivusConfig,
  Stream,
  StreamType,
  StreamProgress,
  CreateStreamParams,
  WithdrawParams,
  CancelParams,
  SignerFn,
  IndexerStream,
  WithdrawalEvent,
} from "./types/index.js";

export {
  seconds,
  minutes,
  hours,
  days,
  weeks,
  months,
  years,
  nowSeconds,
  fromNow,
  humanDuration,
  formatAmount,
  parseAmount,
  computeClaimable,
} from "./utils/time";