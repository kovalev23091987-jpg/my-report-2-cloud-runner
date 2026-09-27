# My Report 2 — free liquidation extension research

**NOT DEPLOYED. NOT A PRODUCTION INSTALLER.** Continues the existing liquidation task on the last verified Report 2 V7 base. No changes to main, Cloudflare, D1, Telegram recipients, strategy weights or execution.

See `docs/IMPLEMENTATION_STATUS_RU.md` for the Russian source/limit/status matrix. Main last verified: `f7c5c77acfc2640c2c9b396d61560d33bf4fa263`.

## Reproduce locally (Node 24)

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run replay
```

Tests use captured public responses plus explicitly marked synthetic negative fixtures. Snapshot-replay evaluation time is the original receipt window, not today's clock. Do not present replay output as a new live map.

Optional explicit read-only live probe:

```sh
npm run probe:native
```

This makes a bounded public FIL discovery/native-account read (maximum 10 requests including the native instrument catalog). It does not trade or send Telegram. Keyless LiqFlow use stops automatically at the announced 2026-10-27 cutover; do not bypass key requirements. Production scheduling still requires proper shared-account quota admission and approval of source mapping.

`src/local-proof-store.mjs` is a **local SQLite proof**, not a migration for production D1. The two-consumer data-read test is not proof of the project's actual manual/Telegram renderer integration.

## Important boundaries

* Position-derived liquidation prices are conditional; these are neither certain price targets nor complete exchange censuses.
* All new source output is context/research only; ENTRY, scores and order execution are never created here.
* LiqFlow's own buckets remain quarantined from decision use due to unresolved native cross-margin discrepancies. Its public accounts can be used for discovery, then independently re-read at the native exchange.
* USD, USDC and provider-reported units stay distinct. GMX decimal30 values and gTrade collateral conversion are handled explicitly.
* 0xArchive MCP access does not prove REST credentials or route-credit budget. Do not hardcode a credit cost of one.
* Full original HTTP receipts remain in the research workspace. The portable archive retains only necessary market-data fixtures and receipt hashes; full copyrighted provider webpages and dependencies are not redistributed.
* Do not upload provider raw fixtures to the public project repository without checking redistribution rights. This archive is for internal user research.

The original V7 incomplete installer is not updated by this archive and must not be treated as a completed liquidation rollout.
