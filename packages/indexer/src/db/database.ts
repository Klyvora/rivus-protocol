/**
 * Rivus Indexer — SQLite Database
 *
 * Two tables:
 *   streams       — full stream state snapshot
 *   events        — every contract event (created, withdraw, cancel)
 *
 * SQLite was chosen over a JSON file because Rivus streams have relational
 * queries (all streams for a recipient, event history per stream).
 * Reviewers need zero infra — the file is auto-created on first run.
 */

import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "rivus.db");

export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS streams (
    id            TEXT PRIMARY KEY,
    sender        TEXT NOT NULL,
    recipient     TEXT NOT NULL,
    token         TEXT NOT NULL,
    asset_code    TEXT,
    total_amount  TEXT NOT NULL,
    withdrawn     TEXT NOT NULL DEFAULT '0',
    start_time    INTEGER NOT NULL,
    end_time      INTEGER NOT NULL,
    cliff_duration INTEGER NOT NULL DEFAULT 0,
    step_interval  INTEGER NOT NULL DEFAULT 0,
    stream_type   TEXT NOT NULL CHECK(stream_type IN ('linear','cliff_linear','stepped')),
    cancelled     INTEGER NOT NULL DEFAULT 0,
    tx_hash       TEXT NOT NULL,
    ledger        INTEGER NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_streams_sender    ON streams(sender);
  CREATE INDEX IF NOT EXISTS idx_streams_recipient ON streams(recipient);
  CREATE INDEX IF NOT EXISTS idx_streams_token     ON streams(token);

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    stream_id   TEXT NOT NULL,
    event_type  TEXT NOT NULL CHECK(event_type IN ('created','withdraw','cancel')),
    address     TEXT NOT NULL,
    amount      TEXT,
    ledger      INTEGER NOT NULL,
    tx_hash     TEXT NOT NULL,
    timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (stream_id) REFERENCES streams(id)
  );

  CREATE INDEX IF NOT EXISTS idx_events_stream ON events(stream_id);

  CREATE TABLE IF NOT EXISTS indexer_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ---------------------------------------------------------------------------
// Typed query helpers
// ---------------------------------------------------------------------------

export interface DbStream {
  id: string;
  sender: string;
  recipient: string;
  token: string;
  asset_code: string | null;
  total_amount: string;
  withdrawn: string;
  start_time: number;
  end_time: number;
  cliff_duration: number;
  step_interval: number;
  stream_type: string;
  cancelled: number;
  tx_hash: string;
  ledger: number;
  created_at: string;
  updated_at: string;
}

export interface DbEvent {
  id: number;
  stream_id: string;
  event_type: string;
  address: string;
  amount: string | null;
  ledger: number;
  tx_hash: string;
  timestamp: string;
}

export const queries = {
  upsertStream: db.prepare<DbStream>(`
    INSERT INTO streams (
      id, sender, recipient, token, asset_code,
      total_amount, withdrawn, start_time, end_time,
      cliff_duration, step_interval, stream_type,
      cancelled, tx_hash, ledger, created_at, updated_at
    ) VALUES (
      @id, @sender, @recipient, @token, @asset_code,
      @total_amount, @withdrawn, @start_time, @end_time,
      @cliff_duration, @step_interval, @stream_type,
      @cancelled, @tx_hash, @ledger, @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      withdrawn   = excluded.withdrawn,
      cancelled   = excluded.cancelled,
      updated_at  = excluded.updated_at
  `),

  insertEvent: db.prepare(`
    INSERT INTO events (stream_id, event_type, address, amount, ledger, tx_hash)
    VALUES (@stream_id, @event_type, @address, @amount, @ledger, @tx_hash)
  `),

  getStream: db.prepare<[string]>(`SELECT * FROM streams WHERE id = ?`),

  listByRecipient: db.prepare<[string]>(
    `SELECT * FROM streams WHERE recipient = ? ORDER BY created_at DESC`
  ),

  listBySender: db.prepare<[string]>(
    `SELECT * FROM streams WHERE sender = ? ORDER BY created_at DESC`
  ),

  listAll: db.prepare(
    `SELECT * FROM streams ORDER BY created_at DESC LIMIT 100`
  ),

  getEvents: db.prepare<[string]>(
    `SELECT * FROM events WHERE stream_id = ? ORDER BY ledger ASC`
  ),

  getIndexerCursor: db.prepare<[string]>(
    `SELECT value FROM indexer_state WHERE key = ?`
  ),

  setIndexerCursor: db.prepare(
    `INSERT INTO indexer_state (key, value) VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ),
};