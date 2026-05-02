"use client";
import { useState, useCallback } from "react";

export function useFreighter() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const freighter = await import("@stellar/freighter-api");
      const connected = await freighter.isConnected();
      if (!connected) {
        setError("Freighter not found. Install it at freighter.app");
        return;
      }
      const key = await freighter.getPublicKey();
      if (!key) {
        setError("Could not get public key. Unlock Freighter and try again.");
        return;
      }
      setPublicKey(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => setPublicKey(null), []);

  const signer = async (xdr: string) => {
    const freighter = await import("@stellar/freighter-api");
    const result = await freighter.signTransaction(xdr, { network: "TESTNET" });
    return result;
  };

  return { publicKey, connected: !!publicKey, loading, error, connect, disconnect, signer };
}