# MY REPORT 2 — VALIDATION ACCEPTANCE DELTA — 2026-09-25

Parent verified candidate: `existing-source-preselection-router-candidate-v1-20260925` @ `788b4e71ab71d98dee5e98cc5241295784ebbb7a`.
Production/main guard: `08d98579c5ecbeb4de426ffeb1160f25ece52708`.

This candidate is **validation-only**. It changes no runtime source file.

Targets:
- R051: prove actual storage schema for decision/state/gates/reasons/cost inputs plus factual 15m/30m/1h/4h/24h outcome horizons and MFE/MAE. Missing cost rows remain explicit and are never invented.
- R052: require factual remote no-lookahead checks and a real negative-control group.
- R053: report factual score ceiling/lost moves/filter/precision numbers and explicitly retain NOT_CLOSED/null for recall or forecast when denominator/context does not exist.
- R054: expand Integration Coverage Proof across early bridge, opportunity decomposition, microstructure, preselection, source registry, rich fact contract, Hyperliquid recorder, existing supporting-source consumers, measured shadow sources and history/sequence consumers.

Acceptance may legitimately leave any requirement PARTIAL. CI success means the read-only audit and regressions ran safely; requirement closure is decided from the artifact facts.

Safety:
- no D1 write/migration;
- no production promotion;
- no Telegram send/recipient change;
- no Cloudflare deploy;
- no strategy/Hard Gate/weight/threshold change;
- no auto trading / validated signal / live probability;
- no new source family.


## V2 R054 audit semantics correction
- Parent V1 SHA: `5bc388f5ebcea8c61b50edeac3374fa44344ea9a`.
- V1 Node24 run `36165917009` was fully green and proved R052/R053.
- R054 integration audit was `9/10`; the only failure was `bitget_coinbase_deribit_coverage:fixture_effect`.
- Live proof already returned exact Deribit utility decision `DISABLED_NO_DIRECT_ALTCOIN_SIGNAL`.
- V1 stored that string directly in `fixture_effect`; coverage closure requires strict boolean `true`, so the explicit factual disabled decision was incorrectly treated as a gap.
- V2 changes **only the validation audit** to require exact equality with `DISABLED_NO_DIRECT_ALTCOIN_SIGNAL`, yielding a boolean proof.
- Runtime files, source enablement, routing, thresholds, weights and production are unchanged.
