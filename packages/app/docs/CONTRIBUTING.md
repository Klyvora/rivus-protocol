# Contributing to Rivus Protocol

Rivus is open-source infrastructure. Every contribution makes payment streaming more reliable for every Stellar developer who depends on it.

---

## Before You Start

Read the [README](./README.md) to understand the four-package architecture. The SDK is the primary deliverable — changes that touch `packages/sdk` are the highest-leverage contributions.

Check [Issues](https://github.com/Klyvora/rivus-protocol/issues) for `good first issue` or `help wanted` labels before opening new work.

For significant changes, open a discussion issue first. This saves effort on both sides.

---

## Setup

```bash
git clone https://github.com/Klyvora/rivus-protocol.git
cd rivus-protocol
npm install
npm run dev
```

---

## Branch Naming

| Branch | Purpose |
|--------|---------|
| `main` | Stable, deployable |
| `develop` | Integration — all PRs target here |
| `feat/<name>` | New features |
| `fix/<name>` | Bug fixes |
| `chore/<name>` | Tooling, deps, docs |

Always branch from `develop`.

---

## Code Style

**Rust:** Run `cargo fmt` before committing.

**TypeScript:** Prettier with project defaults. Run `npx prettier --write .` before committing.

No em dashes anywhere in code or documentation. Use a plain hyphen or restructure the sentence.

---

## Open Contribution Paths

These are specific, scoped items ready for community contributors:

**SDK: Additional stream types** — Exponential vesting (tokens unlock faster over time) is the next natural stream type. Requires contract changes and SDK updates.

**SDK: Multi-asset batching** — One `createStream` call that opens streams in multiple assets simultaneously.

**Indexer: PostgreSQL adapter** — Replace SQLite with Postgres for production deployments. Keep SQLite as the default for zero-infra local use.

**App: Stream analytics view** — Total value streamed, active stream count, asset breakdown. Use the indexer API.

**App: Cancel stream UI** — Sender-side cancel with a confirmation modal showing the pro-rata split.

**Docs: Integration examples** — Short code examples showing Rivus integrated with real Stellar ecosystem projects (soroswap, specific anchors).

**Tests: E2E with Soroban sandbox** — Integration tests that run the full create/withdraw/cancel lifecycle against a local sandbox.

---

## Pull Request Checklist

- PR is focused on one concern only
- If the contract changed: include `cargo test` output
- If the SDK changed: include `npm test` output from `packages/sdk`
- If an API route changed: update the route table in `README.md`
- `npm run lint` passes before pushing

One maintainer review required before merge.

---

## Contact

Maintainer: [@mubking](https://github.com/mubking)

Organization: [github.com/Klyvora](https://github.com/Klyvora)

---

## License

Contributions are licensed under [MIT](./LICENSE).