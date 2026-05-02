"use client";
import { useState, useCallback } from "react";
import { isConnected, getPublicKey, requestAccess, signTransaction } from "@stellar/freighter-api";
import type { SignerFn } from "@rivus/sdk";

export function useFreighter() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!(await isConnected())) {
        setError("Freighter not found. Install it at freighter.app");
        return;
      }
      await requestAccess();
      setPublicKey(await getPublicKey());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => setPublicKey(null), []);

  const signer: SignerFn = useCallback(
    (xdr: string) =>
      signTransaction(xdr, {
        network: process.env.NEXT_PUBLIC_NETWORK?.toUpperCase() ?? "TESTNET",
      }),
    []
  );

  return { publicKey, connected: !!publicKey, loading, error, connect, disconnect, signer };
}