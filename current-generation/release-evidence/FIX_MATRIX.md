# Fix matrix F01–F51

Evidence date: 2026-09-28. `LOCAL_CLOSED` means the effective V5 overlay and its consumer test pass. It does not mean production deployment or natural market acceptance. `PARTIAL` and `BLOCKED` are not release-complete states.

| ID | Status | Effective evidence | Remaining condition |
|---|---|---|---|
| F01 | PARTIAL_BLOCKED_HUB | `runtime-control.mjs`, `analytics-lease.mjs`, `analytics-lease.test.mjs` fence the GitHub analytics owner. | Exact live Hub bundle/bindings are required to prove and remove the legacy decision writer. |
| F02 | LOCAL_CLOSED | `workflow-job-gate.test.mjs` and `runner/preflight-role-gate.mjs` prove stop before checkout/decrypt/network. | Production cutover only. |
| F03 | PARTIAL_BLOCKED_HUB | `run-health.mjs` and `run-health.test.mjs` derive terminal health after final events. | Live Hub watchdog/KV binding is not available. |
| F04 | PARTIAL_BLOCKED_HUB | `strict-delivery-binding.mjs` permits removal only after confirmed delivered ENTRY. | Exact relay/lifecycle replacement requires the live Hub bundle. |
| F05 | PARTIAL_BLOCKED_HUB | `commands-delivery.test.mjs` requires positive message ID and matching recipient; ambiguous timeout is not retried. | Natural Telegram receipt and live relay cutover. |
| F06 | PARTIAL_BLOCKED_HUB | Immutable publication/dispatch/payload identities and expired-delivery reconciliation pass locally. | Live relay receipt lookup needs the exact Hub handler. |
| F07 | LOCAL_CLOSED_RUNTIME | `candidate-task-queue.mjs` keys attempts by contract/wave/task; old terminal waves do not block a new wave. | Operational backlog measurement. |
| F08 | PARTIAL_OUTPUT_CONTRACT | Durable manual result binding and completion are wired and tested. | A missing visible ticker cannot be added where the frozen approved format has no slot (`BLOCKED_OUTPUT_CONTRACT`). |
| F09 | WAITING_NATURAL_EVIDENCE | Generation-specific publication/dispatch contracts exist. | First natural V5 WAIT/ENTRY/removal and exact Telegram receipt. |
| F10 | LOCAL_CLOSED_RUNTIME | Final direction authorization and upstream veto are wired in `worker.js`; `market-contracts.test.mjs`. | Natural decision evidence. |
| F11 | LOCAL_CLOSED_RUNTIME | Typed side-specific HTX bid/ask reference and execution receipt reach canonical input; fallback price is stripped. | Natural decision evidence. |
| F12 | PARTIAL_COLLECTOR_BLOCKED | Sharded history contracts and real 24h semantics pass. | Five-minute public collector and its live limit receipt require Hub deployment. |
| F13 | LOCAL_CORE | Closed-candle/actual-window contracts reject synthetic 5m/15m windows. | Short-window completeness awaits the collector. |
| F14 | PARTIAL_MEASURED | Wave queue, 4-light/8-total plan and bounded burst pass; controlled run 36363772673 measured one cycle. | Operational expiry/starvation measurements and two additional measured cycles. |
| F15 | LOCAL_CLOSED | Bounded enrichment treats missing OI as unknown, never zero or positive evidence. | Live source receipt. |
| F16 | LOCAL_CLOSED | `analytical-integrity.mjs` and target tests separate calculated geometry from observed/proven levels. | None locally. |
| F17 | LOCAL_CLOSED | Prospective anchor and measured minimum 5% move policy are wired; stale candle cannot create proof. | Natural prospective sample. |
| F18 | LOCAL_CLOSED | Explicit metric mapper replaces fallback 58; error/unknown contributes zero. | None locally. |
| F19 | PARTIAL_NATURAL_DATA | Interest/readiness/completeness are separate; completeness is not predictive quality. | Predictive quality remains statistically unproven. |
| F20 | LOCAL_CLOSED | Unsigned deterministic source distribution passes reachability tests over 100k seeds. | None locally. |
| F21 | LOCAL_CLOSED | gTrade has an independent three-call lane admitted before transport. | Authorized live receipt. |
| F22 | LOCAL_CLOSED | OKX depth requires exact catalog contract units and fails closed without them. | Authorized live receipt. |
| F23 | LOCAL_CLOSED | Exact address/chain provenance, Solana case and venue instrument contracts pass. | Registry coverage remains partial. |
| F24 | LOCAL_CLOSED | Source time, observation time and freshness are distinct; stale data is not relabelled fresh. | None locally. |
| F25 | LOCAL_CLOSED | Cache-before-fetch, single in-flight refresh, timeout and backoff tests pass. | Live cache hit receipt. |
| F26 | LOCAL_CLOSED | Counts/signatures are direction-neutral; liquidation presence cannot become an automatic bullish vote. | None locally. |
| F27 | LOCAL_CLOSED | Upstream/event/dependency-family dedup precedes scoring. | None locally. |
| F28 | PARTIAL_KEY_AND_PROBE | 0xArchive route/cost plan and atomic reservation fail closed on unknown cost. | Existing key plus one authorized idempotent cost probe. |
| F29 | LOCAL_PARTIAL_COVERAGE | Short probes are explicitly `PARTIAL`; no module claims a continuous full liquidation stream. | Continuous completeness is intentionally unavailable without a permitted service. |
| F30 | PARTIAL_SMOKE_PENDING | Source identities, lifecycle receipts and EvidenceV2 consumer contracts exist. | Selected adapters still require sanitized live smoke receipts. |
| F31 | LOCAL_CORE | `outcome-v2.mjs` admits only exact SENT receipts and anchors to the first fresh executable HTX quote. | Natural delivered cohort. |
| F32 | LOCAL_CORE | Outcome path completeness uses closed one-minute history, not snapshot extrema. | Natural mature path. |
| F33 | LOCAL_CLOSED | Due-settlement cursor skips unusable rows and terminates irrecoverable windows as censored. | Operational backlog receipt. |
| F34 | PARTIAL_MEASUREMENT | Settlement is capped at eight mature horizons per cycle. | Backlog age/drain measurement under natural load. |
| F35 | LOCAL_CLOSED | MFE/MAE use one-minute high/low; same-candle TP+SL is ambiguous. | None locally. |
| F36 | LOCAL_CLOSED | Liquidation labels require exact zone touch, not a generic 0.5% move. | Natural samples. |
| F37 | LOCAL_CLOSED | Fixed historical endpoints are used or the sample is censored. | Natural samples. |
| F38 | LOCAL_CLOSED_FACTOR_ONE | Independent wave/upstream grouping replaces pseudo-N20; legacy 20-row auto-weighting is disabled. | At least 200 prospective groups and all T16.5 gates. |
| F39 | LOCAL_CLOSED | Canonical source/family IDs round-trip forecast→outcome→factor. | Natural samples. |
| F40 | LOCAL_CLOSED | Block, family and chain caps apply together; missing families are not redistributed. | None locally. |
| F41 | PARTIAL_NATURAL_DATA | Prospective full/without-source paired attribution contract exists. | Required independent holdout sample is unavailable. |
| F42 | LOCAL_CLOSED | `GENERATION.json` and quota tests prove 13,330 worst case and 12,090 scheduled-plus-burst requests. | None locally. |
| F43 | LOCAL_CLOSED | Atomic provider/attempt/reservation keys and conservative timeout accounting pass concurrency tests. | None locally. |
| F44 | PARTIAL_BLOCKED_HUB | GitHub analytics fencing and common run usage ledger are active; cloud run had zero unknown operations. | All Hub actors and migrations cannot be verified without the live bundle/bindings. |
| F45 | LOCAL_CLOSED_PLAN | Catalog/retry calls are included in the same pre-admitted source plan. | Live receipt. |
| F46 | LOCAL_CLOSED | Venue catalog cache has per-venue TTL, bounded timeout and cache-first behavior. | Live receipt. |
| F47 | LOCAL_CLOSED | Dependency freshness and whole-source deadlines are enforced; TTL is not stretched to force CLOSED. | Live receipt. |
| F48 | LOCAL_CLOSED_RUNTIME | Commands persist before concurrency; aged queued work is recovered after two minutes; expired work is terminal; duplicates do not rerun paid work. | Operational recovery receipt after V5 cutover. |
| F49 | PARTIAL | Release manifest, exact worker hash, rollback, cloud receipt and truthful blockers exist. | Hub evidence, remaining live receipts and natural gates. |
| F50 | PARTIAL_SMOKE_PENDING | All N01–N17 have typed EvidenceV2 consumer contracts, caps and fixture tests. | Several transports are not yet live-wired and every selected adapter needs a smoke receipt. |
| F51 | LOCAL_CORE | Gross/net costs, remaining path, hold and invalidation are distinct; no automatic trading was added. | Natural outcome sample. |

No `PARTIAL`, `BLOCKED`, `WAITING`, or `LOCAL_CORE` row may be represented as fully deployed or naturally accepted.
