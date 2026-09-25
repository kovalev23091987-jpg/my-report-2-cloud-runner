# MY REPORT 2 — FREE API / RESOURCE BUDGET — 2026-09-25

Status: `CANDIDATE_ONLY / BUDGET_FAIL_CLOSED / NOT_PRODUCTION`

## Hot cycle

Existing bounded hot-cycle constants are preserved:

- Stage0 external requests: 4
- one Deep Check: ~39
- Smart Money lane: 1
- current bounded total: 44
- existing free external request guard: 50
- reserved headroom: 6
- **Free Sources DELTA added hot-cycle external requests: 0**
- Free Sources DELTA hot-cycle D1 writes: 0

No external Free Source call is introduced directly into the worker hot loop. The worker receives only already-available receipts/summary. This preserves the existing scheduler and request guard.

## Why raw history is not persisted

For only `20 coins × 2 markets × 1440 minutes` the raw minute footprint is **57,600 rows/day** before indexes or other processes. Over 30 days this is **1,728,000 minute rows**; over 90 days **5,184,000 rows**. Raw trades/aggTrades would be much larger. Therefore:

- do not store every trade in D1;
- store bounded aggregates, anomaly events, feature receipts, source status and outcomes;
- use archive files only in maintenance/backcheck;
- use detailed trade reconstruction only for selected anomaly windows/candidates.

## Binance archive lane

- archive is delayed and never substitutes realtime;
- verify `.CHECKSUM` before use;
- Spot and USD-M are separate;
- 1m is the primary reconstruction substrate; 3m/5m native files can be used as bounded cross-checks instead of downloading all combinations for every asset;
- 30d is baseline; 60–90d only if request/storage budget allows;
- prefer monthly archives plus recent daily deltas where applicable;
- trades/aggTrades are pulled for selected event windows, not for the entire HTX universe.

## Bounded candidate validation calls

- `free-source-live-probe`: maximum 12 public calls, timeout 8s each, no secrets, D1, Telegram or trading. V4 spends one of the 12 calls on a Spot archive ZIP checksum verification and uses a small DefiLlama health payload.
- `incremental-coverage-measurement`: maximum 4 calls (HTX active Futures universe, Bitget Futures instruments, Bitget Spot instruments, Coinbase products), no writes/no enablement/no voting.
- D1 funnel replay: read-only, existing row limits, writes/unknown ops must remain zero.

## Source quota policy

- GoPlus: official support page states free 30 calls/min; V3 bounded Node24 probe returned 200 keyless. Candidate budget remains at one bounded probe / selected-candidate use only; no retry storm and no automatic Hard Gate.
- Hyperliquid: use weighted public Info calls only on bounded candidate/known-address sets; never whole-market address scanning.
- Bitget/Coinbase/Deribit: measurement first; no polling all HTX symbols until incremental benefit is proven.
- CoinGecko/GeckoTerminal keyless: optional/low-frequency only; never critical production polling dependency.
- Alchemy Free: account/key required; no calls until owner approval. Compute units, not “requests”, are the governing quota.
- No automatic payment, quota upgrade or retry storm.

## Retry/cache/recovery policy

Shared cache; batching where official API supports it; bounded parallelism; exponential backoff; circuit-break on repeated failures; sequence/gap recovery where supported; event/trade dedupe; restart checkpoints. `BUDGET_EXHAUSTED`, `RATE_LIMITED`, `TIMEOUT`, `STALE`, `NOT_CONFIGURED` and `UNSUPPORTED` remain distinct states.

Continuous public-WS collector status remains exactly `PARTIAL_REALTIME_COVERAGE`.
