import { describe, it, expect } from 'vitest';
import {
  days,
  weeks,
  months,
  humanDuration,
  formatAmount,
  parseAmount,
  computeClaimable,
  nowSeconds,
} from "./time.js";

describe("duration helpers", () => {
  it("days(1) = 86400", () => expect(days(1)).toBe(86_400));
  it("weeks(1) = 604800", () => expect(weeks(1)).toBe(604_800));
  it("months(1) ~ 2629746", () => expect(months(1)).toBe(2_629_746));
});

describe("formatAmount", () => {
  it("formats 10_000_000 as 1", () =>
    expect(formatAmount(10_000_000n)).toBe("1"));
  it("formats 15_000_000 as 1.5", () =>
    expect(formatAmount(15_000_000n)).toBe("1.5"));
  it("appends symbol", () =>
    expect(formatAmount(10_000_000n, 7, "USDC")).toBe("1 USDC"));
});

describe("parseAmount", () => {
  it("parses '1' to 10_000_000n", () =>
    expect(parseAmount("1")).toBe(10_000_000n));
  it("parses '1.5' correctly", () =>
    expect(parseAmount("1.5")).toBe(15_000_000n));
  it("round trips with formatAmount", () => {
    const raw = 123_456_789n;
    expect(parseAmount(formatAmount(raw))).toBe(raw);
  });
});

describe("humanDuration", () => {
  it("formats days", () => expect(humanDuration(days(3))).toBe("3 d"));
  it("formats months", () => expect(humanDuration(months(6))).toBe("~6 mo"));
  it("formats years", () => expect(humanDuration(months(24))).toBe("~2.0 yr"));
});

describe("computeClaimable", () => {
  const base = {
    withdrawn: 0n,
    cliffDuration: 0,
    stepInterval: 0,
    cancelled: false,
  };

  it("returns 0 before stream starts", () => {
    const now = nowSeconds();
    expect(
      computeClaimable({
        ...base,
        totalAmount: 1_000_000n,
        startTime: now + 1000,
        endTime: now + 2000,
        streamType: "linear",
      })
    ).toBe(0n);
  });

  it("returns full amount after linear stream ends", () => {
    const now = nowSeconds();
    expect(
      computeClaimable({
        ...base,
        totalAmount: 1_000_000n,
        startTime: now - 2000,
        endTime: now - 1,
        streamType: "linear",
      })
    ).toBe(1_000_000n);
  });

  it("returns 0 for cliff_linear before cliff", () => {
    const now = nowSeconds();
    expect(
      computeClaimable({
        ...base,
        totalAmount: 1_000_000n,
        startTime: now - 100,
        endTime: now + 900,
        streamType: "cliff_linear",
        cliffDuration: 500,
      })
    ).toBe(0n);
  });

  it("returns per-step amount for stepped stream", () => {
    const now = nowSeconds();
    // 4 steps of 250s, just past step 2
    const claimable = computeClaimable({
      ...base,
      totalAmount: 1_000_000n,
      startTime: now - 510,
      endTime: now + 490,
      streamType: "stepped",
      stepInterval: 250,
    });
    expect(claimable).toBe(500_000n);
  });

  it("returns 0 for cancelled stream", () => {
    const now = nowSeconds();
    expect(
      computeClaimable({
        ...base,
        totalAmount: 1_000_000n,
        startTime: now - 500,
        endTime: now + 500,
        streamType: "linear",
        cancelled: true,
      })
    ).toBe(0n);
  });
});