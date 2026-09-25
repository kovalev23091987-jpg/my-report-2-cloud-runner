# MY REPORT 2 — EXISTING SOURCE PRESELECTION ROUTER DELTA — 2026-09-25

Parent verified candidate: `existing-source-hyperliquid-recorder-candidate-v2-20260925` @ `497b12dd6c6547b0753b56e2bbec79376e2e660c`.
Production/main guard: `08d98579c5ecbeb4de426ffeb1160f25ece52708`.

Targets:
- R009: dynamic primary source selection by completeness/freshness/authority/health before final candidate selection, with HTX execution mandatory and non-substitutable.
- R010: explicit capability metadata receipt retaining provider, venue, mapping, market type, units, interval, history coverage, freshness, coverage, health, authority and last success.
- R056: general cached cross-venue per-metric router consumed by the existing early-candidate bridge before shortlist sorting.

Design:
- no new external call in the preselection path; only cached `full_evidence_shadow_log` receipts are used;
- no D1 write/migration;
- existing HTX Futures >=100k turnover gate stays before the router effect and external volume cannot substitute;
- source-selection scoring is not a trading/strategy weight;
- existing +7 cross-venue context boost is preserved; this delta does not change thresholds, Hard Gates, strategy weights or probabilities;
- factual D1 audit may close R056 only if a real early row has a contemporaneous routed receipt; otherwise R056 stays PARTIAL without failing the candidate.
