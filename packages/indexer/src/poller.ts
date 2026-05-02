/**
 * Rivus Indexer — Horizon Contract Event Poller
 *
 * Polls Soroban RPC for StreamManager contract events on a configurable
 * interval and persists them to the local SQLite database.
 *
 * Events watched:
 *   CREATED  — new stream created
 *   WITHDRAW — recipient withdrew claimable tokens
 *   CANCEL   — sender cancelled a stream
 */

import { SorobanRpc, scValToNative } from "@stellar/stellar-sdk";
import { queries } from "./db/database.js";

const RPC_URLS: Record<string, string> = {
  testnet: "https://soroban-testnet.stellar.org",
  mainnet: "https://soroban-mainnet.stellar.org",
};

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? "10000", 10);
const NETWORK = process.env.STELLAR_NETWORK ?? "testnet";
const CONTRACT_ID = process.env.STREAM_MANAGER_CONTRACT_ID ?? "";

export async function startPoller() {
  if (!CONTRACT_ID) {
    console.warn(
      "[poller] STREAM_MANAGER_CONTRACT_ID not set — poller will not run."
    );
    return;
  }

  const server = new SorobanRpc.Server(RPC_URLS[NETWORK]);
  console.log(
    `[poller] Watching contract ${CONTRACT_ID} on ${NETWORK} every ${POLL_INTERVAL_MS}ms`
  );

  const poll = async () => {
    try {
      // Retrieve the last processed ledger from persistent state
      const cursorRow = queries.getIndexerCursor.get("last_ledger") as
        | { value: string }
        | undefined;
      const startLedger = cursorRow ? parseInt(cursorRow.value, 10) + 1 : 1;

      const response = await server.getEvents({
        startLedger,
        filters: [
          {
            type: "contract",
            contractIds: [CONTRACT_ID],
          },
        ],
        limit: 100,
      });

      if (!response.events || response.events.length === 0) {
        return;
      }

      let maxLedger = startLedger;

      for (const event of response.events) {
        const ledger = event.ledger;
        if (ledger > maxLedger) maxLedger = ledger;

        const topicSymbols = event.topic.map((t) => {
          try {
            return scValToNative(t) as string;
          } catch {
            return "";
          }
        });

        const eventType = topicSymbols[0];
        const address = String(topicSymbols[1] ?? "");

        let parsed: Record<string, unknown> = {};
        try {
          parsed = scValToNative(event.value) as Record<string, unknown>;
        } catch {
          // Non-structured event value — skip
          continue;
        }

        const txHash = event.txHash ?? "";
        const now = new Date().toISOString();

        if (eventType === "CREATED") {
          const streamId = String(parsed.stream_id);
          queries.upsertStream.run({
            id: streamId,
            sender: String(parsed.sender ?? address),
            recipient: String(parsed.recipient ?? ""),
            token: "",
            asset_code: null,
            total_amount: String(parsed.total_amount ?? "0"),
            withdrawn: "0",
            start_time: 0,
            end_time: 0,
            cliff_duration: 0,
            step_interval: 0,
            stream_type: String(parsed.stream_type ?? "linear"),
            cancelled: 0,
            tx_hash: txHash,
            ledger,
            created_at: now,
            updated_at: now,
          });
          queries.insertEvent.run({
            stream_id: streamId,
            event_type: "created",
            address,
            amount: String(parsed.total_amount ?? ""),
            ledger,
            tx_hash: txHash,
          });
        } else if (eventType === "WITHDRAW") {
          const streamId = String(parsed.stream_id);
          queries.upsertStream.run({
            id: streamId,
            sender: "",
            recipient: address,
            token: "",
            asset_code: null,
            total_amount: "0",
            withdrawn: String(parsed.amount ?? "0"),
            start_time: 0,
            end_time: 0,
            cliff_duration: 0,
            step_interval: 0,
            stream_type: "linear",
            cancelled: 0,
            tx_hash: txHash,
            ledger,
            created_at: now,
            updated_at: now,
          });
          queries.insertEvent.run({
            stream_id: streamId,
            event_type: "withdraw",
            address,
            amount: String(parsed.amount ?? ""),
            ledger,
            tx_hash: txHash,
          });
        } else if (eventType === "CANCEL") {
          const streamId = String(parsed.stream_id);
          queries.upsertStream.run({
            id: streamId,
            sender: address,
            recipient: "",
            token: "",
            asset_code: null,
            total_amount: "0",
            withdrawn: "0",
            start_time: 0,
            end_time: 0,
            cliff_duration: 0,
            step_interval: 0,
            stream_type: "linear",
            cancelled: 1,
            tx_hash: txHash,
            ledger,
            created_at: now,
            updated_at: now,
          });
          queries.insertEvent.run({
            stream_id: streamId,
            event_type: "cancel",
            address,
            amount: null,
            ledger,
            tx_hash: txHash,
          });
        }
      }

      queries.setIndexerCursor.run({ key: "last_ledger", value: String(maxLedger) });
      console.log(`[poller] Processed ${response.events.length} events up to ledger ${maxLedger}`);
    } catch (err) {
      console.error("[poller] Error:", err);
    }
  };

  // Run immediately, then on interval
  await poll();
  setInterval(() => void poll(), POLL_INTERVAL_MS);
}