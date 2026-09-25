# MY REPORT 2 — OUTPUT SURFACE CONTRACT DELTA — 2026-09-25

Parent verified candidate: `validation-acceptance-candidate-v2-20260925` @ `7bd9fd6113e30fcbcaabea05ed7148167729d630`.
Production/main guard: `08d98579c5ecbeb4de426ffeb1160f25ece52708`.

Targets: R019, R020, R022, R023, R028, R029, R030, R036, R037, R058.

Changes are output-only:
- manual exact source-unavailable phrase and internal-terminology fail-closed guard;
- one worthy early-candidate line in compact Telegram;
- explicit surface contract proving one canonical snapshot/fingerprint feeds two distinct formatters;
- score labels, snapshot time, Telegram limits and early sections are accepted only from runtime output proof;
- Worker already returns `canonical_analytical_bundle`; this candidate proves that downstream runtime bundle includes the two surfaces.

Not targeted:
- R027 manual ChatGPT command trigger remains separate because repository runtime does not itself prove a chat product command invocation.
- R060 previous-snapshot diff remains separate.

Safety: no D1 write/migration, no Telegram network send or recipient change, no source calls, no strategy/Hard Gate/weight/threshold/probability change, no auto execution, no production promotion.


## V2 packaging correction
- V1 branch SHA: `e2fea63511ff023b344e1c2a9c477c0749de76c8`.
- V1 Node24 run `36170830945` passed exact parent/main guard, runtime reconstruction, overlay apply and overlay idempotency/safety.
- Failure occurred at `node --check runtime/src/canonical-runtime-adapter.mjs`.
- Root cause: V1 apply script concatenated the new import with a **literal** `\n` sequence, producing invalid JavaScript source.
- V2 changes only that apply-script string to a real newline.
- Formatter logic, canonical surface contract, tests and runtime target content are otherwise unchanged from V1.
- V2 starts directly from the last green Validation Acceptance V2 SHA `7bd9fd6113e30fcbcaabea05ed7148167729d630`; it does not inherit failed V1.


## V3 user-surface hardening
- V2 branch SHA: `9098e20ce22496db19f18054553d9c88ff707bdb`.
- V2 Node24 run `36171496325` passed reconstruction, overlay safety/idempotency, focused tests, retained suites, inherited runtime regression and Telegram/TZ10.1 retention.
- Runtime proof failed only R020/R028/R030 because the live fixture used technical run id `OUT:WAIT_FOR_TRIGGER`.
- Manual formatter still printed raw `run_id` as `Запуск: ...`; the new R019 internal-code guard correctly rejected that output.
- V3 removes technical `run_id` from the **user-facing manual report**. Snapshot time remains and continues to identify the analytical snapshot for the user.
- The fail-closed internal terminology guard is not weakened.
- Telegram logic, score labels, limits, early-candidate line, source-unavailable phrase, canonical fingerprint and all trading/source logic remain unchanged from V2.
- V3 again starts directly from the last green Validation Acceptance V2 SHA `7bd9fd6113e30fcbcaabea05ed7148167729d630` and does not inherit failed V1/V2 branches.
