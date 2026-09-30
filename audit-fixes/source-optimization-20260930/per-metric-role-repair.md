# SOPT-06 — observed metric roles and publication proof

Base main: c51b4e0e549512d4e1a284793d35bb73cfca0fdb (accepted PR27).
No additional provider survey or HTTP probe is needed: this defect is local to verified exact-runtime source consumers.

## Evidence and correction of the earlier assessment

The PR27 acceptance note called source_role_view metadata-only. Follow-through to canonical-publication.mjs establishes that earlySourceRolesClosed uses it to authorize OBSERVE publication. That earlier scope assessment was incomplete. No claim is made that an actual bad trade or message occurred because of this defect.

Old behavior assigns every declared provider capability to any receipt and counts names as independent source families, including failed/no-metric receipts. Generic HTX snapshot presence becomes execution proof; substring aliases can falsely recognize unrelated source names. Actual OKX paths are missing and Bybit/Gate OI roles are omitted.

## Change

Separate declared capabilities from observed usable roles. Only explicitly mapped metrics with normalized exact-market identity, closed fact contract, finite value/unit, positive measured coverage, known quality, source clock and SLA can carry roles. No artificial zero. Explicit aliases only. Current OI is not OI trajectory. Funding periods, observation endpoints and incompatible windows cannot be combined as one comparable metric. Aggregator and direct copies of the same known upstream count as one origin; distinct origins are not a claim of statistical independence. Static source priority is not a predictive weight or demonstrated optimum.

OBSERVE publication and already-bound OBSERVE delivery revalidate actual receipt fields against canonical contract/time. Older capability-only metadata is not grandfathered as proof. HTX measured execution-gate fact is required; a generic successful futures fetch is insufficient. WAIT/ENTRY rules, scores, worker, weights, caps, schedule and paid-access policy are unchanged.

Regression fixtures now carry explicit synthetic exact-identity measurements; this does not create live signals. Actual cloud assembled-runtime tests and both ordinary post-release report modes remain required.

## Honest stopping rule (owner clarification 30 Sep 2026 15:05 local)

Do not repeat an unchanged investigation to chase an unattainable ideal. Classify each remaining requirement as implementable now, blocked by evidenced access/data/coverage, or requiring independent prospective observations. Reopen a blocked source only after a specific change (documented reset/recovery, new permitted data, access, or corrected identity). Do not equate a provider listing with a configured working connection; do not call all-source optimization complete after this subset. Exact clock provenance of inherited worker-derived facts and all uncovered metric mappings remain separate open review items.
