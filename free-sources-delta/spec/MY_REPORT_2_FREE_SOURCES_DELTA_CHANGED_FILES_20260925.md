# MY REPORT 2 — FREE SOURCES DELTA — CHANGED / ADDED FILES — 2026-09-25

## Existing unified candidate files modified by this DELTA

- `src/worker.js`
- `src/capability-registry.mjs`
- `src/canonical-analytical-result.mjs`
- `src/canonical-runtime-adapter.mjs`
- `src/manual-report-formatter.mjs`
- `src/telegram-compact-formatter.mjs`

These are installed only after the retained unified overlay and are hash-guarded by the Free Sources overlay manifest.

## New runtime modules

- `src/asset-identity.mjs`
- `src/binance-public-data-history.mjs`
- `src/goplus-security-adapter.mjs`
- `src/blockchain-event-classifier.mjs`
- `src/solana-rpc-adapter.mjs`
- `src/dex-pool-bridge.mjs`
- `src/resource-budget.mjs`
- `src/funnel-diagnostics.mjs`
- `src/source-registry.mjs`
- `src/alchemy-evm-adapter.mjs`
- `src/official-event-receipt.mjs`
- `src/market-measurement-adapters.mjs`
- `src/provider-context-normalizers.mjs`
- `src/runtime-status-semantics.mjs`

## Candidate-only validation / maintenance

- `maintenance/free-source-live-probe.mjs`
- `maintenance/incremental-coverage-measurement.mjs`
- `validation/free-sources-funnel-replay.mjs`
- `.github/workflows/free-sources-delta-candidate-validation.yml`

## New tests

- `asset-identity.test.mjs`
- `binance-history.test.mjs`
- `blockchain-solana.test.mjs`
- `canonical-free-sources-e2e.test.mjs`
- `dex-risk-provider.test.mjs`
- `funnel-replay-static.test.mjs`
- `incremental-coverage.test.mjs`
- `measurement-events.test.mjs`
- `source-registry.test.mjs`
- `status-budget-funnel.test.mjs`
- `worker-free-sources-wiring.test.mjs`

## Reused, not rebuilt

Existing capability registry, production cross-venue adapters/router, Stage0, V3, Fast Move Watch, Opportunity Intelligence, MultiWave, bounded Deep Check scheduler, microstructure writer/consumer, early-candidate bridge, TZ10.1 execution/cost path, canonical analytical result, Telegram formatter and manual formatter are reused. No second engine/router/report pipeline was added.
