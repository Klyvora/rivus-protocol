"use client";

import { useCallback, useEffect, useState } from "react";
import { useFreighter } from "@/lib/useFreighter";
import { indexer, type ApiStream } from "@/lib/indexer";
import { StreamCard } from "@/components/StreamCard";
import { CreateStreamForm } from "@/components/CreateStreamForm";

function truncate(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function Page() {
  const { publicKey, connected, loading: walletLoading, error: walletError, connect, disconnect, signer } = useFreighter();
  const [streams, setStreams] = useState<ApiStream[]>([]);
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [fetching, setFetching] = useState(false);

  const fetchStreams = useCallback(async () => {
    if (!publicKey) return;
    setFetching(true);
    try {
      const key = tab === "incoming" ? "recipient" : "sender";
      const data = await indexer.listStreams({ [key]: publicKey });
      setStreams(data.streams);
    } catch {
      setStreams([]);
    } finally {
      setFetching(false);
    }
  }, [publicKey, tab]);

  useEffect(() => {
    void fetchStreams();
  }, [fetchStreams]);

  const activeStreams = streams.filter((s) => !s.cancelled);
  const totalReceiving = activeStreams
    .filter((s) => s.recipient === publicKey)
    .reduce((acc, s) => acc + BigInt(s.totalAmount), 0n);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-rivus-border bg-rivus-card/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-rivus-blue to-rivus-cyan flex items-center justify-center text-xs font-bold">
              R
            </div>
            <span className="font-semibold text-base tracking-tight">
              Rivus <span className="text-rivus-blue">Protocol</span>
            </span>
            <span className="badge bg-rivus-blue/10 text-rivus-blue border border-rivus-blue/20">
              TESTNET
            </span>
          </div>

          {connected && publicKey ? (
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-rivus-green" />
              <span className="font-mono text-xs text-gray-400">{truncate(publicKey)}</span>
              <button onClick={disconnect} className="text-xs text-gray-600 hover:text-red-400 transition-colors">
                Disconnect
              </button>
            </div>
          ) : (
            <button onClick={connect} disabled={walletLoading} className="btn-primary">
              {walletLoading ? "Connecting..." : "Connect Freighter"}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
        {!connected ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-16 h-16 rounded-2xl bg-rivus-card border border-rivus-border flex items-center justify-center text-2xl mb-6">
              ~
            </div>
            <h1 className="text-2xl font-bold mb-2">Payment Streaming for Soroban</h1>
            <p className="text-gray-500 max-w-md mb-8 text-sm leading-relaxed">
              Create vesting schedules, payroll streams, and milestone-based grants on Stellar.
              Connect your Freighter wallet to get started.
            </p>
            <button onClick={connect} disabled={walletLoading} className="btn-primary">
              {walletLoading ? "Connecting..." : "Connect Freighter"}
            </button>
            {walletError && <p className="text-red-400 text-xs mt-4">{walletError}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: create form */}
            <div className="lg:col-span-1">
              <CreateStreamForm
                sender={publicKey!}
                signer={signer}
                onSuccess={fetchStreams}
              />

              <div className="mt-4 card">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                  Total receiving
                </p>
                <p className="text-xl font-bold text-rivus-cyan">
                  {(Number(totalReceiving) / 1e7).toFixed(2)}
                </p>
                <p className="text-xs text-gray-600">across {activeStreams.length} active streams</p>
              </div>
            </div>

            {/* Right: stream list */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-3">
                {(["incoming", "outgoing"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                      tab === t
                        ? "border-rivus-blue text-white"
                        : "border-transparent text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
                <button
                  onClick={fetchStreams}
                  disabled={fetching}
                  className="ml-auto text-xs text-gray-600 hover:text-rivus-blue transition-colors"
                >
                  {fetching ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {streams.length === 0 ? (
                <div className="card text-center py-12">
                  <p className="text-gray-600 text-sm">No {tab} streams found.</p>
                </div>
              ) : (
                streams.map((s) => (
                  <StreamCard
                    key={s.id}
                    stream={s}
                    currentWallet={publicKey}
                    signer={signer}
                    onRefresh={fetchStreams}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-rivus-border py-5 text-center">
        <p className="text-xs text-gray-700">
          Rivus Protocol — open source on{" "}
          <a
            href="https://github.com/Klyvora/rivus-protocol"
            target="_blank"
            rel="noopener noreferrer"
            className="text-rivus-blue hover:underline"
          >
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}