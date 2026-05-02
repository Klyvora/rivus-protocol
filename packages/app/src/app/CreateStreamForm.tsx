"use client";

import { useState } from "react";
import { RivusClient, parseAmount, fromNow, months, weeks, days } from "@rivus/sdk";
import type { StreamType, SignerFn } from "@rivus/sdk";

interface Props {
  sender: string;
  signer: SignerFn;
  onSuccess: () => void;
}

const PRESETS = [
  { label: "1 month", value: months(1) },
  { label: "3 months", value: months(3) },
  { label: "6 months", value: months(6) },
  { label: "1 year", value: months(12) },
];

export function CreateStreamForm({ sender, signer, onSuccess }: Props) {
  const [streamType, setStreamType] = useState<StreamType>("linear");
  const [recipient, setRecipient] = useState("");
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState(months(6));
  const [cliffDuration, setCliffDuration] = useState(months(1));
  const [stepInterval, setStepInterval] = useState(weeks(4));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const client = new RivusClient({
        network: (process.env.NEXT_PUBLIC_NETWORK ?? "testnet") as "testnet" | "mainnet",
        contractId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "",
      });

      const startTime = Math.floor(Date.now() / 1000);
      const endTime = fromNow(duration);

      const streamId = await client.createStream({
        sender,
        recipient,
        token,
        totalAmount: parseAmount(amount),
        startTime,
        endTime,
        streamType,
        cliffDuration: streamType === "cliff_linear" ? cliffDuration : 0,
        stepInterval: streamType === "stepped" ? stepInterval : 0,
        sign: signer,
      });

      setSuccess(`Stream #${streamId} created.`);
      setRecipient("");
      setAmount("");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create stream");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card space-y-5">
      <h2 className="text-base font-semibold text-white">New Stream</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Stream type tabs */}
        <div>
          <span className="label">Stream type</span>
          <div className="flex gap-2">
            {(["linear", "cliff_linear", "stepped"] as StreamType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setStreamType(t)}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                  streamType === t
                    ? "border-rivus-blue bg-rivus-blue/10 text-blue-400"
                    : "border-rivus-border text-gray-500 hover:border-gray-600"
                }`}
              >
                {t === "linear" ? "Linear" : t === "cliff_linear" ? "Cliff + Linear" : "Stepped"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Recipient address</label>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            required
            maxLength={56}
            placeholder="G..."
            className="input font-mono text-xs"
          />
        </div>

        <div>
          <label className="label">Token contract address</label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            placeholder="C... (SEP-41 token)"
            className="input font-mono text-xs"
          />
        </div>

        <div>
          <label className="label">Total amount</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            type="number"
            min="0"
            step="0.0000001"
            placeholder="1000.00"
            className="input"
          />
        </div>

        {/* Duration presets */}
        <div>
          <label className="label">Duration</label>
          <div className="flex gap-2 mb-2 flex-wrap">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setDuration(p.value)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  duration === p.value
                    ? "border-rivus-cyan bg-rivus-cyan/10 text-rivus-cyan"
                    : "border-rivus-border text-gray-500"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cliff duration (cliff_linear only) */}
        {streamType === "cliff_linear" && (
          <div>
            <label className="label">Cliff duration (seconds)</label>
            <input
              value={cliffDuration}
              onChange={(e) => setCliffDuration(parseInt(e.target.value))}
              required
              type="number"
              min="1"
              className="input"
            />
            <p className="text-xs text-gray-600 mt-1">
              No tokens unlock before this period ends.
            </p>
          </div>
        )}

        {/* Step interval (stepped only) */}
        {streamType === "stepped" && (
          <div>
            <label className="label">Step interval (seconds)</label>
            <input
              value={stepInterval}
              onChange={(e) => setStepInterval(parseInt(e.target.value))}
              required
              type="number"
              min="1"
              className="input"
            />
            <p className="text-xs text-gray-600 mt-1">
              One unlock chunk releases every {stepInterval}s.
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/30 rounded px-3 py-2">
            {error}
          </p>
        )}
        {success && (
          <p className="text-xs text-green-400 bg-green-950/20 border border-green-900/30 rounded px-3 py-2">
            {success}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full mt-1">
          {loading ? "Creating stream..." : "Create Stream"}
        </button>
      </form>
    </div>
  );
}