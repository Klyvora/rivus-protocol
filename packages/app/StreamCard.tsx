"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { computeClaimable, formatAmount, humanDuration } from "@rivus/sdk";
import type { SignerFn } from "@rivus/sdk";
import { RivusClient } from "@rivus/sdk";
import type { ApiStream } from "@/lib/indexer";

interface Props {
  stream: ApiStream;
  currentWallet: string | null;
  signer: SignerFn | null;
  onRefresh: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  linear: "Linear",
  cliff_linear: "Cliff + Linear",
  stepped: "Stepped",
};

const TYPE_COLORS: Record<string, string> = {
  linear: "bg-blue-950/50 text-blue-400 border-blue-900/30",
  cliff_linear: "bg-purple-950/50 text-purple-400 border-purple-900/30",
  stepped: "bg-amber-950/50 text-amber-400 border-amber-900/30",
};

function truncate(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function StreamCard({ stream, currentWallet, signer, onRefresh }: Props) {
  const [claimable, setClaimable] = useState(0n);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const calc = () => {
      const c = computeClaimable({
        totalAmount: BigInt(stream.totalAmount),
        withdrawn: BigInt(stream.withdrawn),
        startTime: stream.startTime,
        endTime: stream.endTime,
        cliffDuration: stream.cliffDuration,
        stepInterval: stream.stepInterval,
        streamType: stream.streamType,
        cancelled: stream.cancelled,
      });
      setClaimable(c);
    };
    calc();
    const timer = setInterval(calc, 5000);
    return () => clearInterval(timer);
  }, [stream]);

  const total = BigInt(stream.totalAmount);
  const withdrawn = BigInt(stream.withdrawn);
  const percentComplete =
    total > 0n ? Number(((withdrawn + claimable) * 10000n) / total) / 100 : 0;

  const isRecipient = currentWallet === stream.recipient;
  const now = Math.floor(Date.now() / 1000);
  const isEnded = now >= stream.endTime;
  const remaining = stream.endTime - Math.min(now, stream.endTime);

  const handleWithdraw = async () => {
    if (!signer) return;
    setWithdrawing(true);
    setError(null);
    try {
      const client = new RivusClient({
        network: (process.env.NEXT_PUBLIC_NETWORK ?? "testnet") as "testnet" | "mainnet",
        contractId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "",
      });
      await client.withdraw({ streamId: stream.id, sign: signer });
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Withdraw failed");
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-gray-500">#{stream.id}</span>
            <span
              className={clsx(
                "badge border",
                TYPE_COLORS[stream.streamType] ?? "bg-gray-900 text-gray-400 border-gray-800"
              )}
            >
              {TYPE_LABELS[stream.streamType] ?? stream.streamType}
            </span>
            {stream.cancelled && (
              <span className="badge border bg-red-950/50 text-red-400 border-red-900/30">
                Cancelled
              </span>
            )}
            {isEnded && !stream.cancelled && (
              <span className="badge border bg-green-950/50 text-green-400 border-green-900/30">
                Ended
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono">
            {truncate(stream.sender)} &rarr;{" "}
            <span className={clsx(isRecipient && "text-rivus-cyan")}>
              {truncate(stream.recipient)}
              {isRecipient && " (you)"}
            </span>
          </p>
        </div>

        <div className="text-right">
          <p className="text-lg font-bold text-white">
            {formatAmount(total, 7, stream.assetCode ?? "")}
          </p>
          <p className="text-xs text-gray-500">total</p>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>{percentComplete.toFixed(1)}% vested</span>
          {!isEnded && <span>{humanDuration(remaining)} left</span>}
        </div>
        <div className="progress-bar">
          <div
            className="h-full bg-gradient-to-r from-rivus-blue to-rivus-cyan rounded-full transition-all duration-500"
            style={{ width: `${Math.min(percentComplete, 100)}%` }}
          />
        </div>
      </div>

      {/* Claimable row */}
      <div className="flex items-center justify-between bg-rivus-bg rounded-lg px-4 py-3">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Claimable now</p>
          <p className="text-lg font-bold text-rivus-cyan">
            {formatAmount(claimable, 7, stream.assetCode ?? "")}
          </p>
        </div>

        {isRecipient && !stream.cancelled && claimable > 0n && signer && (
          <button
            onClick={handleWithdraw}
            disabled={withdrawing}
            className="btn-primary"
          >
            {withdrawing ? "Withdrawing..." : "Withdraw"}
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/30 rounded px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}