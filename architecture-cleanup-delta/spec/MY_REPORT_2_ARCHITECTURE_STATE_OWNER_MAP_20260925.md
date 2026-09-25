# MY REPORT 2 — ARCHITECTURE STATE OWNER MAP — 2026-09-25

Status: `CANDIDATE_ONLY / LOCAL_IMPLEMENTATION`

| State | Single owner | Consumers | Rule |
|---|---|---|---|
| Source deployment stage | `source-registry.mjs` + `state-contract.mjs` enum | canonical/reporting | PRODUCTION/CANDIDATE/SHADOW/etc is not runtime usability |
| Runtime source availability | `capability-registry.mjs` using `state-contract.mjs` | cross-venue selection | no factual metadata/attempt => unusable |
| Free-source runtime summary | `source-registry.mjs::buildFreeSourceRuntimeSummary` | worker -> canonical adapter | computed once; adapter does not recompute |
| Entry blocker reason | `reason-registry.mjs` + `funnel-diagnostics.mjs` | canonical/manual/Telegram | machine code + full RU + short RU |
| Canonical decision state | existing canonical router/result | both formatters | unchanged strategy/thresholds |
| User rendering | manual/Telegram formatters only | user | no raw internal code/status leak |

Unknown reason becomes `UNKNOWN_INTERNAL_REASON`, forces safe output rendering and never exposes the raw internal code.
