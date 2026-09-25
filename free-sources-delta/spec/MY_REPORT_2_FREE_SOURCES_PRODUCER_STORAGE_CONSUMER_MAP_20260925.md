# MY REPORT 2 — PRODUCER → STORAGE → CONSUMER → OUTPUT MAP — 2026-09-25

Status: `CANDIDATE_ONLY / NO_SECOND_PIPELINE / NOT_PRODUCTION`

## Reused canonical path

`source producer → normalized typed fact/receipt → existing cache/D1 or bounded maintenance artifact → existing capability/cross-venue/early consumer → existing Stage0/V3/Opportunity/Deep Check → one canonical analytical result → compact Telegram + full manual formatter`.

The Free Sources DELTA does not add a second router, early engine, scheduler, Decision Layer or reporting pipeline.

| Block/source | Producer | Persistence | Consumer/feature | Decision effect | Canonical/report proof | Current closure |
|---|---|---|---|---|---|---|
| HTX execution/turnover | Existing production HTX adapter | Existing receipts/D1 | Stage0/Deep Check/TZ execution | Mandatory execution and >=100k HTX Futures turnover gate | Existing canonical path | PRODUCTION |
| Binance Spot fallback | Production `public-evidence-adapters` cross-venue overlay | Existing public-evidence receipts | Cross-venue Spot chain | Can close external Spot gap (ONG) without inventing HTX Spot | Existing production tests/checkpoint | PRODUCTION |
| Existing microstructure | Public WS writer | D1 aggregate rows | feature fusion → V3 early → early bridge | Priority/reason only; no Hard Gate bypass | Prior microstructure full-chain E2E | PRODUCTION/PARTIAL_REALTIME_COVERAGE |
| Binance Public Data Archive | Candidate maintenance downloader/normalizer | Maintenance aggregates/features/events; not raw all-trade D1 | Opportunity/backcheck feature builder (next bridge) | Intended to refine anomaly hypothesis/history | V3 probe found filename defect; V4 official naming + real checksum verification prepared | PARTIAL — live checksum then consumer/rank proof pending |
| GoPlus | Keyless candidate request + normalizer; V3 live 200 | Candidate probe receipt; slow-changing cache/persistence planned | Existing Supporting Risk slot | Advisory only, never automatic rejection | Adapter tests + live reachability proof | PARTIAL — persistence/consumer/canonical effect pending |
| Alchemy EVM | Candidate bounded RPC adapter | Selected event receipts only | Existing Supporting/on-chain slot | Advisory evidence after classification | Event semantic tests | BLOCKED — key/live/storage pending |
| Solana RPC | Candidate bounded RPC | Selected signatures/decoded events only | Existing Supporting/on-chain slot | Advisory evidence; unsupported explicit | Identity/event tests | PARTIAL — live/storage/consumer pending |
| Bitget | Candidate measurement plan | CI measurement artifact only | Source utility evaluator | No decision effect before measured benefit | No user-visible effect | SHADOW |
| Coinbase | Candidate measurement plan | CI measurement artifact only | Source utility evaluator | No decision effect before measured benefit | No user-visible effect | SHADOW |
| Hyperliquid extension | Existing recorder + candidate public method plan | Existing recorder receipts | Existing Smart Money consumer | Metric receipt may support; no global liquidation claim | Existing source policy + new measurement tests | PARTIAL extension |
| DEX Screener + GeckoTerminal | Candidate pool normalizer/deduper | Bounded pool observations | Existing Spot/Supporting context slot (pending) | Same pool counts once; buys not net inflow | Tests prove semantics only | PARTIAL |
| DefiLlama | Candidate context normalizer | Bounded advisory context | Supporting context (pending) | TVL USD move not automatically inflow | Tests prove semantics only | PARTIAL |
| Official events | Candidate event receipt schema | Bounded verified event receipts | Supporting context (pending) | Can explain catalyst/risk; no rumor | Receipt validation test | PARTIAL |
| Cost blockers | Existing TZ10.1 cost assessment + candidate funnel diagnostics | Existing final decision / immutable publication inputs | Publication gate + blocker summary | Missing fee/future funding remains UNKNOWN, never zero | Canonical/manual/Telegram blocker wiring + replay driver | PARTIAL until remote read-only counts |
| Free-source summary | No new network producer in hot path; consumes existing receipts only | Canonical metadata, no new D1 table | Existing canonical runtime adapter | Data-quality/explanation only | New same-snapshot E2E reaches both formatters | LOCAL WIRED |

## Integration acceptance rule

A source is only upgraded to `IMPLEMENTED_AND_WIRED` when a test/proof can show:

`real response → identity → normalized receipt → persistence/cache → consumer reads it → fixture/source change changes intended feature/priority/state/reason → Deep Check → canonical result → both outputs`.

A module file or successful HTTP response alone is insufficient.
