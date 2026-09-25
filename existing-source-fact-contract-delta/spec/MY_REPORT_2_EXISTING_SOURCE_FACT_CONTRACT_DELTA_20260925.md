# MY REPORT 2 — EXISTING SOURCE FACT CONTRACT DELTA — 2026-09-25

Parent verified candidate: `31ada6f72d6f7dd36615478922dbc45309322b28` (`existing-source-closure-audit-candidate-v1-20260925`).
Production/main guard: `08d98579c5ecbeb4de426ffeb1160f25ece52708`.

Purpose:
- close R069/R080 at the existing receipt -> consumer -> canonical boundary without D1 rewrite;
- normalize inherited CEX facts into a complete explicit contract;
- keep USD/USDT/USDC distinct, normalize s/ms/us timestamps, forbid ticker-only identity;
- use explicit `NOT_APPLICABLE_CEX` rather than inventing chain/contract/mint;
- carry quality from the factual snapshot envelope, preserve coverage/freshness/raw/normalized values;
- never convert missing/budget/stale/divergence to zero.

No source family, no worker copy, no hot-cycle request, no D1 migration/write, no Telegram send, no strategy/weight/threshold/Hard Gate change, no auto trading, no live probability.
R075/R083/R084/R092/R093 are not claimed closed by this delta.
