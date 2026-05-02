"use client";
import { useState } from "react";
import type { ApiStream } from "@/lib/indexer";

interface Props {
  stream: ApiStream;
  currentWallet: string | null;
  onRefresh: () => void;
}

function truncate(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function StreamCard({ stream, currentWallet, onRefresh }: Props) {
  const [loading, setLoading] = useState(false);
  const total = parseInt(stream.totalAmount) / 1e7;
  const withdrawn = parseInt(stream.withdrawn) / 1e7;
  const pct = total > 0 ? Math.min((withdrawn / total) * 100, 100).toFixed(1) : "0.0";

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className="font-mono text-xs text-gray-500">#{stream.id}</span>
          <span className="ml-2 badge bg-blue-900/40 text-blue-400 border border-blue-800/30">{stream.streamType}</span>
          {stream.cancelled && <span className="ml-2 badge bg-red-900/40 text-red-400 border border-red-800/30">Cancelled</span>}
        </div>
        <p className="text-lg font-bold text-white">{total.toFixed(2)} {stream.assetCode ?? ""}</p>
      </div>
      <p className="text-xs font-mono text-gray-400">{truncate(stream.sender)} → <span className={currentWallet === stream.recipient ? "text-cyan-400" : ""}>{truncate(stream.recipient)}{currentWallet === stream.recipient ? " (you)" : ""}</span></p>
      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-500">{pct}% withdrawn</p>
    </div>
  );
}