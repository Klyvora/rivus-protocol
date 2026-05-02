"use client";
import { useState } from "react";

interface Props {
  sender: string;
  onSuccess: () => void;
}

export function CreateStreamForm({ sender, onSuccess }: Props) {
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="card">
      <h2 className="text-base font-semibold mb-4">New Stream</h2>
      {submitted ? (
        <p className="text-green-400 text-sm">Stream submitted! Deploy the contract first to activate.</p>
      ) : (
        <button onClick={() => setSubmitted(true)} className="btn-primary w-full">
          Propose Stream (deploy contract first)
        </button>
      )}
      <p className="text-xs text-gray-600 mt-3">Sender: {sender.slice(0,8)}...</p>
    </div>
  );
}