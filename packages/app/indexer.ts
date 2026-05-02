const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002/api/v1";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export interface ApiStream {
  id: string;
  sender: string;
  recipient: string;
  token: string;
  assetCode: string | null;
  totalAmount: string;
  withdrawn: string;
  startTime: number;
  endTime: number;
  cliffDuration: number;
  stepInterval: number;
  streamType: string;
  cancelled: boolean;
  txHash: string;
  ledger: number;
  createdAt: string;
}

export interface ApiEvent {
  id: number;
  streamId: string;
  eventType: string;
  address: string;
  amount: string | null;
  ledger: number;
  txHash: string;
  timestamp: string;
}

export const indexer = {
  listStreams: (params?: { recipient?: string; sender?: string }) => {
    const qs = params?.recipient
      ? `?recipient=${params.recipient}`
      : params?.sender
      ? `?sender=${params.sender}`
      : "";
    return get<{ streams: ApiStream[] }>(`/streams${qs}`);
  },
  getStream: (id: string) => get<{ stream: ApiStream }>(`/streams/${id}`),
  getHistory: (id: string) =>
    get<{ stream: ApiStream; events: ApiEvent[] }>(`/streams/${id}/history`),
  getClaimable: (id: string) =>
    get<{ streamId: string; claimable: string; withdrawn: string; totalAmount: string }>(
      `/streams/${id}/claimable`
    ),
};