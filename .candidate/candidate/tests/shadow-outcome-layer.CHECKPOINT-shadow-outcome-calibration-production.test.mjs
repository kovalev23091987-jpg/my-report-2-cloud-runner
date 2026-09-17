import assert from "node:assert/strict";
import { buildShadowOutcomeRecord, SHADOW_OUTCOME_RULES_VERSION } from "../src/shadow-outcome-model.mjs";

const T0 = 1800000000000;
function points(prices) {
  return prices.map((price, i) => ({ ts: T0 + i * 5 * 60 * 1000, price }));
}

const candidateLong = {
  shadow_id: `${T0}:TEST-USDT`,
  contract_code: "TEST-USDT",
  observed_ts: T0,
  rules_version: "shadow-dc-eq-dq-v1",
  direction_hint: "LONG",
  dc_long: 80,
  dc_short: 10,
  eq_status: "SHADOW_MEASURABLE",
  dq_status: "PARTIAL",
  stage: "SHADOW_OBSERVE_LONG_BIAS",
};

const oneHourLong = buildShadowOutcomeRecord({
  candidate: candidateLong,
  horizon_hours: 1,
  points: points([100, 101, 99, 102, 103, 98, 100, 104, 105, 103, 106, 105, 107]),
  computed_ts: T0 + 70 * 60 * 1000,
});
assert.equal(oneHourLong.outcome_rules_version, SHADOW_OUTCOME_RULES_VERSION);
assert.equal(oneHourLong.status, "CLOSED_FACTUAL");
assert.equal(oneHourLong.reference_price, 100);
assert.equal(oneHourLong.outcome_price, 107);
assert.equal(oneHourLong.directional_return_pct, 7);
assert.equal(oneHourLong.mfe_directional_pct_snapshot, 7);
assert.equal(oneHourLong.mae_directional_pct_snapshot, -2);
assert.equal(oneHourLong.direction_correct, true);
assert.equal(oneHourLong.interpolation_used, false);
assert.equal(oneHourLong.calibration_only, true);
assert.equal(oneHourLong.live_promotion_allowed, false);
assert.equal(oneHourLong.automatic_weight_tuning_enabled, false);

// Anti-look-ahead: entry must use the latest factual point at/before the signal,
// never a post-signal point. Horizon must use the earliest point at/after target.
const antiLookAheadCandidate = {
  ...candidateLong,
  shadow_id: `${T0 + 2 * 60 * 1000}:ANTI-USDT`,
  contract_code: "ANTI-USDT",
  observed_ts: T0 + 2 * 60 * 1000,
};
const antiLookAhead = buildShadowOutcomeRecord({
  candidate: antiLookAheadCandidate,
  horizon_hours: 1,
  points: [
    { ts: T0, price: 100 },
    { ts: T0 + 5 * 60 * 1000, price: 150 }, // after signal: forbidden as reference
    { ts: T0 + 60 * 60 * 1000, price: 90 }, // before target: forbidden as outcome
    { ts: T0 + 65 * 60 * 1000, price: 110 }, // first point after target
    { ts: T0 + 70 * 60 * 1000, price: 130 },
  ],
  computed_ts: T0 + 80 * 60 * 1000,
});
assert.equal(antiLookAhead.status, "CLOSED_FACTUAL");
assert.equal(antiLookAhead.reference_scan_ts, T0);
assert.equal(antiLookAhead.reference_price, 100);
assert.equal(antiLookAhead.reference_offset_sec, -120);
assert.equal(antiLookAhead.outcome_scan_ts, T0 + 65 * 60 * 1000);
assert.equal(antiLookAhead.outcome_price, 110);
assert.equal(antiLookAhead.target_offset_sec, 180);

const candidateShort = { ...candidateLong, shadow_id: `${T0}:SHORT-USDT`, contract_code: "SHORT-USDT", direction_hint: "SHORT" };
const oneHourShort = buildShadowOutcomeRecord({
  candidate: candidateShort,
  horizon_hours: 1,
  points: points([100, 99, 101, 98, 97, 102, 100, 96, 95, 97, 94, 95, 93]),
  computed_ts: T0 + 70 * 60 * 1000,
});
assert.equal(oneHourShort.status, "CLOSED_FACTUAL");
assert.equal(oneHourShort.directional_return_pct, 7);
assert.equal(oneHourShort.mfe_directional_pct_snapshot, 7);
assert.equal(oneHourShort.mae_directional_pct_snapshot, -2);
assert.equal(oneHourShort.direction_correct, true);

const missing = buildShadowOutcomeRecord({
  candidate: candidateLong,
  horizon_hours: 4,
  points: [{ ts: T0, price: 100 }],
  computed_ts: T0 + 5 * 60 * 60 * 1000,
});
assert.equal(missing.status, "INSUFFICIENT_FACTUAL_HISTORY");
assert.equal(missing.outcome_price, null);
assert.equal(missing.raw_return_pct, null);
assert.equal(missing.interpolation_used, false);

const neutral = buildShadowOutcomeRecord({
  candidate: { ...candidateLong, direction_hint: "NEUTRAL" },
  horizon_hours: 1,
  points: points([100, 101]),
});
assert.equal(neutral.status, "SKIPPED_NON_DIRECTIONAL");

const nullPrice = buildShadowOutcomeRecord({
  candidate: candidateLong,
  horizon_hours: 1,
  points: [{ ts: T0, price: null }, { ts: T0 + 60 * 60 * 1000, price: 110 }],
});
assert.equal(nullPrice.status, "INSUFFICIENT_FACTUAL_HISTORY");
assert.equal(nullPrice.reference_price, null);

console.log(JSON.stringify({
  ok: true,
  suite: "shadow-outcome-layer",
  assertions: "factual 1h outcome, anti-look-ahead reference/target selection, directional LONG/SHORT semantics, snapshot MFE/MAE, missing-data null preservation, no interpolation, no live promotion"
}, null, 2));
