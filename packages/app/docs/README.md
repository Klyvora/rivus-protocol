# Rivus Protocol

**The payment streaming primitive for the Soroban ecosystem.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Network: Testnet](https://img.shields.io/badge/Stellar-Testnet-06b6d4)](https://stellar.org)
[![Built with Turborepo](https://img.shields.io/badge/Monorepo-Turborepo-blueviolet)](https://turbo.build)
[![Drips Wave 5](https://img.shields.io/badge/Drips-Wave%205-orange)](https://drips.network)

## Live Deployment

| | |
|---|---|
| **Network** | Stellar Testnet |
| **Contract ID** | `CBVR6NVBTC4QKICSMTLX663PE7KOSACQOXZ6HPK3VBSORBHJ22D7ZW27` |
| **Explorer** | [View on Stellar Expert](https://stellar.expert/explorer/testnet/contract/CBVR6NVBTC4QKICSMTLX663PE7KOSACQOXZ6HPK3VBSORBHJ22D7ZW27) |
| **WASM Hash** | `d8256db7e64cb3844104c27173fc6e20a92aa988e09527fd4e37e75e7b613e90` |

---

## The Problem

Every Stellar project that needs token vesting, contributor payroll, subscription billing, or milestone-based grant disbursement builds it manually today. Teams write off-chain scripts, use time-locked transactions, or simply trust a custodian to release funds on schedule.

None of those approaches are trustless. None are composable. None are open-source infrastructure another project can build on.

Ethereum has had Sablier since 2019 — a protocol with over $1B streamed. Soroban has nothing equivalent.

Rivus fills that gap.

---

## What Rivus Does

Rivus is an on-chain payment streaming protocol. A sender locks tokens into a stream. The recipient withdraws their accrued share at any time. The smart contract enforces the rate — no custodian, no trust required.

Three stream types cover every real use case:

**Linear** — tokens unlock at a constant rate per second from start to end. Use for payroll and continuous grants.

**Cliff + Linear** — zero unlock for a defined period, then linear. Use for contributor vesting where you want a commitment period before any tokens flow.

**Stepped** — unlocks in equal chunks at fixed intervals (every 30 days, every wave cycle). Use for milestone-based disbursement. This maps directly to how Drips structures funding waves.

---

## Architecture

Four packages, each with a single clear responsibility:

```
rivus-protocol/
├── packages/
│   ├── contracts/     Rust / Soroban — StreamManager contract
│   ├── sdk/           TypeScript — @rivus/sdk (the core deliverable)
│   ├── indexer/       Node.js / Fastify — Horizon event watcher + REST API
│   └── app/           Next.js 14 — developer dashboard
```

### Why four packages?

The SDK is the primary product. It is a standalone npm package any Stellar developer installs independently:

```bash
npm install @rivus/sdk
```

That single line gives them full access to create, withdraw, cancel, and query streams with a typed TypeScript API. No raw XDR. No manual Soroban invocations. No Horizon query parsing.

The contract, indexer, and app are the infrastructure that makes the SDK reliable and demonstrable — but the SDK is what compounds across the ecosystem.

---

## The SDK

```typescript
import { RivusClient, months, fromNow, parseAmount } from "@rivus/sdk";
import { signTransaction } from "@stellar/freighter-api";

const rivus = new RivusClient({
  network: "testnet",
  contractId: "CXXXXXXX...",
});

// 6-month linear stream of 1000 USDC
const streamId = await rivus.createStream({
  sender: "GABCD...",
  recipient: "GEFGH...",
  token: "USDC_CONTRACT_ADDRESS",
  totalAmount: parseAmount("1000"),
  startTime: Math.floor(Date.now() / 1000),
  endTime: fromNow(months(6)),
  streamType: "linear",
  sign: (xdr) => signTransaction(xdr, { network: "TESTNET" }),
});

// Recipient checks claimable balance
const claimable = await rivus.getClaimable(streamId);

// Recipient withdraws
await rivus.withdraw({ streamId, sign: freighterSigner });
```

---

## Quick Start for Reviewers

### Prerequisites

- Node.js 20+
- Rust + `wasm32-unknown-unknown` target
- Stellar CLI: `cargo install --locked stellar-cli --features opt`
- Freighter browser extension

### Install

```bash
git clone https://github.com/Klyvora/rivus-protocol.git
cd rivus-protocol
npm install
```

### Build the contract

```bash
cd packages/contracts
stellar contract build
```

### Run the indexer

```bash
cp packages/indexer/.env.example packages/indexer/.env
# Set STREAM_MANAGER_CONTRACT_ID in .env
npm run indexer
# API at http://localhost:3002
```

### Run the dashboard

```bash
cp packages/app/.env.example packages/app/.env.local
npm run app
# Dashboard at http://localhost:3000
```

### Run everything

```bash
npm run dev
```

### Deploy to Testnet

```bash
stellar keys generate deployer --network testnet --fund
cd packages/contracts
./deploy.sh
```

---

## Indexer API

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/v1/streams` | All streams (last 100) |
| `GET` | `/api/v1/streams?recipient=G...` | Streams for a recipient |
| `GET` | `/api/v1/streams?sender=G...` | Streams created by a sender |
| `GET` | `/api/v1/streams/:id` | Single stream |
| `GET` | `/api/v1/streams/:id/history` | Full event history |
| `GET` | `/api/v1/streams/:id/claimable` | Real-time claimable (off-chain) |

---

## Why Stellar Wave 5?

Three reasons this belongs in Wave 5 and not later.

First, Soroban mainnet is live. DeFi and DAO projects are starting to build seriously on Stellar right now. They need composable primitives. Rivus is the first one purpose-built for streaming value.

Second, the timing matches how Drips works. Drips disburses grants in waves — a stepped stream is exactly how Drips would fund a project if Rivus existed on Stellar. This is infrastructure Drips would use natively.

Third, the SDK model creates compounding value. Every Stellar project that installs `@rivus/sdk` adds another node to the protocol's network effect. This is not a one-time grant deliverable. It is ongoing ecosystem infrastructure.

---

## Security Model

- Withdrawal: only the recipient receives streamed tokens, regardless of who calls `withdraw`.
- Cancellation: only the sender can cancel. Settlement is atomic — earned tokens go to recipient, unearned return to sender in the same transaction.
- No oracle dependency: claimable amounts are calculated from ledger timestamps alone.
- Auth enforcement: every mutating function calls `require_auth()`.

---

## Repository

GitHub: [https://github.com/Klyvora/rivus-protocol](https://github.com/Klyvora/rivus-protocol)

Organization: [Klyvora](https://github.com/Klyvora) | Maintainer: [@mubking](https://github.com/mubking)

---

## License

MIT