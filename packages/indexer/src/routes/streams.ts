/**
 * Rivus Indexer — REST Routes
 *
 * GET  /api/v1/streams                   List all streams (last 100)
 * GET  /api/v1/streams?recipient=G...    Filter by recipient
 * GET  /api/v1/streams?sender=G...       Filter by sender
 * GET  /api/v1/streams/:id               Get one stream by ID
 * GET  /api/v1/streams/:id/history       Full event history for a stream
 * GET  /api/v1/streams/:id/claimable     Real-time claimable (off-chain calc)
 */

import { FastifyPluginAsync } from "fastify";
import { queries, DbStream, DbEvent } from "../db/database.js";
import { computeClaimable } from "@rivus/sdk";

function serializeStream(row: DbStream) {
  return {
    id: row.id,
    sender: row.sender,
    recipient: row.recipient,
    token: row.token,
    assetCode: row.asset_code,
    totalAmount: row.total_amount,
    withdrawn: row.withdrawn,
    startTime: row.start_time,
    endTime: row.end_time,
    cliffDuration: row.cliff_duration,
    stepInterval: row.step_interval,
    streamType: row.stream_type,
    cancelled: row.cancelled === 1,
    txHash: row.tx_hash,
    ledger: row.ledger,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeEvent(row: DbEvent) {
  return {
    id: row.id,
    streamId: row.stream_id,
    eventType: row.event_type,
    address: row.address,
    amount: row.amount,
    ledger: row.ledger,
    txHash: row.tx_hash,
    timestamp: row.timestamp,
  };
}

export const streamRoutes: FastifyPluginAsync = async (fastify) => {
  // List streams — with optional recipient/sender filter
  fastify.get<{
    Querystring: { recipient?: string; sender?: string };
  }>("/streams", async (request) => {
    const { recipient, sender } = request.query;

    let rows: DbStream[];
    if (recipient) {
      rows = queries.listByRecipient.all(recipient) as DbStream[];
    } else if (sender) {
      rows = queries.listBySender.all(sender) as DbStream[];
    } else {
      rows = queries.listAll.all() as DbStream[];
    }

    return { streams: rows.map(serializeStream) };
  });

  // Single stream
  fastify.get<{ Params: { id: string } }>("/streams/:id", async (request, reply) => {
    const row = queries.getStream.get(request.params.id) as DbStream | undefined;
    if (!row) return reply.status(404).send({ error: "Stream not found" });
    return { stream: serializeStream(row) };
  });

  // Event history for a stream
  fastify.get<{ Params: { id: string } }>(
    "/streams/:id/history",
    async (request, reply) => {
      const row = queries.getStream.get(request.params.id) as DbStream | undefined;
      if (!row) return reply.status(404).send({ error: "Stream not found" });

      const events = queries.getEvents.all(request.params.id) as DbEvent[];
      return {
        stream: serializeStream(row),
        events: events.map(serializeEvent),
      };
    }
  );

  // Real-time claimable (pure off-chain calculation)
  fastify.get<{ Params: { id: string } }>(
    "/streams/:id/claimable",
    async (request, reply) => {
      const row = queries.getStream.get(request.params.id) as DbStream | undefined;
      if (!row) return reply.status(404).send({ error: "Stream not found" });

      const claimable = computeClaimable({
        totalAmount: BigInt(row.total_amount),
        withdrawn: BigInt(row.withdrawn),
        startTime: row.start_time,
        endTime: row.end_time,
        cliffDuration: row.cliff_duration,
        stepInterval: row.step_interval,
        streamType: row.stream_type,
        cancelled: row.cancelled === 1,
      });

      return {
        streamId: row.id,
        claimable: claimable.toString(),
        withdrawn: row.withdrawn,
        totalAmount: row.total_amount,
      };
    }
  );
};