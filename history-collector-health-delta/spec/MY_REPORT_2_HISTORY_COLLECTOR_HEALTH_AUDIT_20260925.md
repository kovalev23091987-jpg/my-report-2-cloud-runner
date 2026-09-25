# MY REPORT 2 — HISTORY + COLLECTOR HEALTH AUDIT — 2026-09-25

Parent verified candidate: `snapshot-diff-candidate-v3-20260925` @ `933067cad9b713c0ec6f21e8c12f6a7d3b09998c`.
Production/main guard: `08d98579c5ecbeb4de426ffeb1160f25ece52708`.

Targets:
- R039: factual Opportunity event-history depth >=30 days, with existing bounded MAINTENANCE lane and no hot-cycle history calls.
- R048: per-collector proof for Stage0, V3 early, V3 feature/microstructure and Opportunity: runtime producer, real persisted rows, freshness, measured coverage, dedup/primary-key proof, downstream consumer, pipeline health and recovery/fallback contract.

This candidate is validation-only: no runtime source modification and no D1 write.

Truth rules:
- R039 closes only if `opportunity_shadow_event` itself spans >=30 days. 60–90d is reported as preferred, not fabricated.
- R048 closes only if every required facet is true for every collector. A recent reconnect incident is reported separately; absence of a failure to recover from is not invented.
- Continuous coverage remains `PARTIAL_REALTIME_COVERAGE` unless separately proven full.
