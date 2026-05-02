/**
 * Duration helpers — convert human-readable time to seconds.
 * All Soroban timestamps are Unix seconds, so these keep call sites readable.
 *
 * @example
 * createStream({ duration: months(6), ... })
 */

export const seconds = (n: number): number => n;
export const minutes = (n: number): number => n * 60;
export const hours = (n: number): number => n * 3_600;
export const days = (n: number): number => n * 86_400;
export const weeks = (n: number): number => n * 604_800;
export const months = (n: number): number => Math.round(n * 2_629_746); // avg 30.44 days
export const years = (n: number): number => Math.round(n * 31_556_952); // avg 365.25 days

/** Returns current Unix timestamp in seconds */
export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** Returns a future Unix timestamp n seconds from now */
export const fromNow = (durationSeconds: number): number =>
  nowSeconds() + durationSeconds;

/**
 * Format a stream duration into a human-readable string.
 * @example humanDuration(2629746) => "~1 month"
 */
export function humanDuration(seconds: number): string {
  if (seconds >= 31_556_952) {
    return `~${(seconds / 31_556_952).toFixed(1)} yr`;
  }
  if (seconds >= 2_629_746) {
    return `~${Math.round(seconds / 2_629_746)} mo`;
  }
  if (seconds >= 604_800) {
    return `~${Math.round(seconds / 604_800)} wk`;
  }
  if (seconds >= 86_400) {
    return `${Math.round(seconds / 86_400)} d`;
  }
  if (seconds >= 3_600) {
    return `${Math.round(seconds / 3_600)} hr`;
  }
  return `${seconds} s`;
}

/**
 * Format stroops (base units) into a decimal string.
 * Stellar uses 7 decimal places by default.
 */
export function formatAmount(
  stroops: bigint,
  decimals = 7,
  symbol = ""
): string {
  const factor = BigInt(10 ** decimals);
  const whole = stroops / factor;
  const frac = stroops % factor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const display = fracStr ? `${whole}.${fracStr}` : whole.toString();
  return symbol ? `${display} ${symbol}` : display;
}

/**
 * Parse a decimal string into stroops.
 * @example parseAmount("100.5", 7) => 1005000000n
 */
export function parseAmount(value: string, decimals = 7): bigint {
  const [whole = "0", frac = ""] = value.split(".");
  const fracPadded = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole) * BigInt(10 ** decimals) + BigInt(fracPadded);
}

/**
 * Calculate real-time claimable amount without a network call.
 * Matches the Soroban contract logic exactly.
 */
export function computeClaimable(stream: {
  totalAmount: bigint;
  withdrawn: bigint;
  startTime: number;
  endTime: number;
  cliffDuration: number;
  stepInterval: number;
  streamType: string;
  cancelled: boolean;
}): bigint {
  if (stream.cancelled) return 0n;

  const now = nowSeconds();
  if (now < stream.startTime) return 0n;

  const { totalAmount, withdrawn, startTime, endTime, streamType } = stream;

  let vested = 0n;

  if (streamType === "linear") {
    const duration = BigInt(endTime - startTime);
    if (duration === 0n) return totalAmount - withdrawn;
    const elapsed = BigInt(Math.min(now, endTime) - startTime);
    vested = (totalAmount * elapsed) / duration;
  } else if (streamType === "cliff_linear") {
    const cliffEnd = startTime + stream.cliffDuration;
    if (now < cliffEnd) {
      vested = 0n;
    } else {
      const duration = BigInt(endTime - cliffEnd);
      if (duration === 0n) {
        vested = totalAmount;
      } else {
        const elapsed = BigInt(Math.min(now, endTime) - cliffEnd);
        vested = (totalAmount * elapsed) / duration;
      }
    }
  } else if (streamType === "stepped") {
    const totalDuration = endTime - startTime;
    if (stream.stepInterval === 0 || totalDuration === 0) return 0n;
    const totalSteps = BigInt(Math.floor(totalDuration / stream.stepInterval));
    if (totalSteps === 0n) return 0n;
    const amountPerStep = totalAmount / totalSteps;
    const elapsed = Math.min(now, endTime) - startTime;
    const stepsCompleted = BigInt(Math.floor(elapsed / stream.stepInterval));
    vested = (stepsCompleted * amountPerStep < totalAmount)
      ? stepsCompleted * amountPerStep
      : totalAmount;
  }

  const claimable = vested - withdrawn;
  return claimable > 0n ? claimable : 0n;
}