import Fastify from "fastify";
import cors from "@fastify/cors";
import { streamRoutes } from "./routes/streams.js";
import { startPoller } from "./poller.js";

const PORT = parseInt(process.env.PORT ?? "3002", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

const server = Fastify({ logger: true });

await server.register(cors, {
  origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
});

await server.register(streamRoutes, { prefix: "/api/v1" });

server.get("/health", async () => ({
  status: "ok",
  service: "rivus-indexer",
  network: process.env.STELLAR_NETWORK ?? "testnet",
}));

try {
  await server.listen({ host: HOST, port: PORT });
  console.log(`\n  Rivus Indexer running at http://${HOST}:${PORT}\n`);
  await startPoller();
} catch (err) {
  server.log.error(err);
  process.exit(1);
}