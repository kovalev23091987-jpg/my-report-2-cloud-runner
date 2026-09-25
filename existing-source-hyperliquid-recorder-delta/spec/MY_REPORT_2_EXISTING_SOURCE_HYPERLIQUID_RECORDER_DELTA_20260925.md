# MY REPORT 2 — HYPERLIQUID EXISTING RECORDER EXTENSION — 2026-09-25

Parent verified candidate:
`41376c8e4738d70330801f94d663aa170cd360a6`.

Production/main guard:
`08d98579c5ecbeb4de426ffeb1160f25ece52708`.

Purpose: close R075 without creating a second recorder or a new source family.

Design:
- keep the existing Smart Money recorder slot at exactly **1 external request per Deep Check**;
- when `BYKARANTELI_API_KEY` is configured, preserve the existing ByKaranteli path and make **zero** Hyperliquid calls;
- when ByKaranteli is not configured, use that same one-request slot for a deterministic Hyperliquid method rotation:
  `metaAndAssetCtxs -> fundingHistory -> l2Book -> clearinghouseState`;
- `clearinghouseState` uses an explicitly configured sample address when present, otherwise the zero address as a negative-control sample;
- address observations are always sample-only; they are never a global position/liquidation map;
- position changes use the existing `classifyHyperliquidPositionChange` semantics with bounded warm-recorder memory; first observation is baseline only;
- Hyperliquid receipts are advisory-only, no directional vote, no Hard Gate, no automatic voting;
- the factual current method receipt reaches Source Registry and the existing canonical/manual/Telegram consumer.

Safety:
- no production promotion;
- no D1 schema migration and no new D1 write;
- no Telegram send/recipient change;
- no Cloudflare deploy;
- no strategy/Decision Layer/Hard Gate/weight/threshold change;
- no auto trading / validated signal / live probability;
- no new source family;
- no second recorder;
- hot-cycle external request delta = 0.


## V2 focused-test isolation correction
- V1 branch SHA: `96497da6a8d9872e7fc0ee9b8cbb24434a5acf23`.
- V1 Node24 run `36158160534` passed exact parent/main guards, runtime reconstruction and R075 overlay safety/idempotency.
- Focused suite result: `7 PASS / 1 FAIL`.
- The sole failure was test-state contamination: an earlier `clearinghouseState` case initialized the same zero-address/BTC in-memory key, so the later case correctly returned `UNCHANGED` rather than the test's expected first-observation `BASELINE_ESTABLISHED`.
- V2 changes only that test to use a distinct sample address.
- Runtime overlay/module/consumer/registry/worker patch are unchanged from V1.
- V2 again starts from the last verified Fact Contract SHA `41376c8e4738d70330801f94d663aa170cd360a6`; it does not inherit the failed V1 commit.
