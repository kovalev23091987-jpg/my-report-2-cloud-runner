# MY REPORT 2 — CONSOLIDATED REMAINING CANDIDATE — 2026-09-25

Parent: `history-collector-health-candidate-v1-20260925` @ `506be05148a148071a001b39164833473bf515f9`.
Production/main guard: `08d98579c5ecbeb4de426ffeb1160f25ece52708`.

This is the intentionally large consolidation pass requested by Vladimir.

Runtime changes in one overlay:
- R017: owner-authorized monthly collapse protection at inclusive -97%, using already-fetched HTX daily candles; no new hot-cycle external call.
- R042: one explicit 10-domain evidence contract in canonical metadata; missing optional evidence remains EXPLICIT_MISSING, never zero.
- R051: add 15m and 30m factual **measurement horizons** to the existing Opportunity outcome engine. This does not manufacture historical rows and does not close publication inputs by itself.
- R078: bounded allowlist-only official JSON event fetcher. It is not auto-enabled without a project/exchange allowlist and does not assume a universal free unlock source.

One consolidated factual audit rechecks every remaining requirement:
R005/R007/R008/R017/R027/R042/R048/R051/R056/R071/R078/R083/R084/R092/R093.

Owner authorization is recorded but cannot create missing factual fee values, holding plans, Alchemy credentials, source receipts, natural effect cases or calibration contexts.

After CI, the owner-local launcher applies only a safe GitHub main protection subset:
- enforce admins;
- disallow force pushes;
- disallow deletion;
- require linear history.
It deliberately does NOT require a CI context that does not yet exist on protected production/main. Therefore R092 may remain PARTIAL until a stable required CI workflow can be promoted safely.

No production code promotion is performed.
