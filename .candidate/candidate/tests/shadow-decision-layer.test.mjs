import assert from "node:assert/strict";
import { buildShadowDecisionTelemetry, SHADOW_DECISION_RULES_VERSION } from "../src/shadow-decision-model.mjs";

function closedCoverage() {
  return {
    futures: {
      htx_futures_liquidity: "closed",
      htx_futures_order_flow: "closed",
      htx_open_interest: "closed",
      htx_funding: "closed",
    },
    trajectory: {
      price_5m: "closed",
      price_15m: "closed",
      price_1h: "closed",
      price_4h: "closed",
      price_24h: "closed",
      flow_1h: "closed",
      flow_4h: "closed",
      flow_24h: "closed",
      oi_1h: "closed",
      oi_4h: "closed",
      oi_24h: "closed",
      funding_current: "closed",
      funding_history: "closed",
    },
  };
}

function evidence(direction = "long", sufficiency = "SUFFICIENT") {
  const c = closedCoverage();
  const sign = direction === "long" ? 1 : -1;
  return {
    contract: "TEST-USDT",
    now: 1800000000000,
    futures: {
      status: "fulfilled",
      data: {
        coverage: c.futures,
        funding: { funding_rate_pct: direction === "long" ? -0.05 : 0.05 },
        liquidity: {
          spread_bps: 4,
          buy_market_impact: { impact_bps: 7, fill_ratio_pct: 100 },
          sell_market_impact: { impact_bps: 8, fill_ratio_pct: 100 },
        },
      },
    },
    spot: {
      status: "fulfilled",
      data: {
        quality_status: "GREEN",
        order_flow: {
          windows: {
            "1h": {
              delta_pct_of_turnover: sign * 18,
              cvd_delta_reliable: true,
              cvd_delta_quality: {
                status: "COMPLETE", reliable: true, trade_count_exact_match: true,
                raw_record_integrity_complete: true, record_integrity: { complete: true },
              },
            },
          },
        },
      },
    },
    trajectory: {
      status: "fulfilled",
      data: {
        coverage: c.trajectory,
        windows: {
          "1h": {
            price: { change_pct: sign * 2.2 },
            order_flow: {
              delta_pct_of_turnover: sign * 18,
              cvd_delta_reliable: true,
              cvd_delta_quality: {
                status: "COMPLETE", reliable: true, trade_count_exact_match: true,
                raw_record_integrity_complete: true, record_integrity: { complete: true },
              },
            },
            open_interest: { contracts: { change_pct: 7 } },
            derived: { absorption_candidate: { value: direction === "long" } },
          },
          "4h": {
            price: { change_pct: sign * 5.1 },
            order_flow: {
              delta_pct_of_turnover: sign * 17,
              cvd_delta_reliable: true,
              cvd_delta_quality: {
                status: "COMPLETE", reliable: true, trade_count_exact_match: true,
                raw_record_integrity_complete: true, record_integrity: { complete: true },
              },
            },
            open_interest: { contracts: { change_pct: 9 } },
            derived: { absorption_candidate: { value: false } },
          },
          "24h": { price: { change_pct: sign * 9 } },
        },
      },
    },
    history: { status: "fulfilled", data: { series: [{ ts: 1 }] } },
    dataSufficiency: { overall: sufficiency },
  };
}

const long = buildShadowDecisionTelemetry(evidence("long"));
assert.equal(long.rules_version, SHADOW_DECISION_RULES_VERSION);
assert.equal(long.direction_hint, "LONG");
assert.ok(long.dc_shadow_long > long.dc_shadow_short);
assert.equal(long.eq.status, "SHADOW_MEASURABLE");
assert.equal(long.dq.status, "HTX_CLOSED_EXTERNAL_CHAINS_MISSING");
assert.equal(long.stage, "SHADOW_OBSERVE_LONG_BIAS");
assert.equal(long.probability, null);
assert.equal(long.full_decision_eligible, false);
assert.equal(long.actual_decision_generated, false);
assert.equal(long.validated, false);
assert.equal(long.telegram_started, false);
assert.equal(long.live_execution_allowed, false);
assert.ok(long.required_missing_chains.includes("cross_exchange_derivatives"));
assert.ok(long.required_missing_chains.includes("smart_money_onchain"));

const short = buildShadowDecisionTelemetry(evidence("short"));
assert.equal(short.direction_hint, "SHORT");
assert.ok(short.dc_shadow_short > short.dc_shadow_long);
assert.equal(short.stage, "SHADOW_OBSERVE_SHORT_BIAS");

const bad = evidence("long", "INSUFFICIENT");
bad.futures.data.coverage.htx_futures_liquidity = "not_closed";
bad.spot.data.quality_status = "YELLOW";
const insufficient = buildShadowDecisionTelemetry(bad);
assert.equal(insufficient.dq.status, "INSUFFICIENT");
assert.equal(insufficient.eq.status, "NOT_CLOSED");
assert.equal(insufficient.stage, "OBSERVE_DATA_INSUFFICIENT");
assert.equal(insufficient.actual_decision_generated, false);
assert.equal(insufficient.telegram_started, false);

const empty = buildShadowDecisionTelemetry({ contract: "EMPTY-USDT", now: 1800000000100 });
assert.equal(empty.direction_hint, "NEUTRAL");
assert.equal(empty.dc_shadow_long, null);
assert.equal(empty.dc_shadow_short, null);
assert.equal(empty.full_decision_eligible, false);
assert.equal(empty.probability, null);

const unverifiedDelta = evidence("long");
unverifiedDelta.futures.data.funding.funding_rate_pct = 0;
for (const key of ["1h", "4h", "24h"]) {
  unverifiedDelta.trajectory.data.windows[key].price.change_pct = 0;
}
for (const key of ["1h", "4h"]) {
  const flow = unverifiedDelta.trajectory.data.windows[key].order_flow;
  flow.delta_pct_of_turnover = 100;
  flow.cvd_delta_reliable = false;
  flow.cvd_delta_quality = { status: "INCOMPLETE_OR_UNVERIFIED" };
}
const spotFlow = unverifiedDelta.spot.data.order_flow.windows["1h"];
spotFlow.delta_pct_of_turnover = 100;
spotFlow.cvd_delta_reliable = false;
spotFlow.cvd_delta_quality = { status: "INCOMPLETE_OR_UNVERIFIED" };
const deltaBlocked = buildShadowDecisionTelemetry(unverifiedDelta);
assert.equal(deltaBlocked.direction_hint, "NEUTRAL");
assert.equal(deltaBlocked.feature_contributions.futures_flow_1h_delta_pct.available, false);
assert.equal(deltaBlocked.feature_contributions.futures_flow_4h_delta_pct.available, false);
assert.equal(deltaBlocked.feature_contributions.spot_flow_delta_pct.available, false);
assert.equal(deltaBlocked.evidence_flags.futures_flow_1h_delta_pct, null);
assert.equal(deltaBlocked.evidence_flags.spot_flow_delta_pct, null);

const contradictoryDelta = evidence("long");
for (const key of ["1h", "4h"]) {
  contradictoryDelta.trajectory.data.windows[key].order_flow.cvd_delta_quality.status =
    "INCOMPLETE_OR_UNVERIFIED";
}
contradictoryDelta.spot.data.order_flow.windows["1h"].cvd_delta_quality.status =
  "INCOMPLETE_OR_UNVERIFIED";
const contradictionBlocked = buildShadowDecisionTelemetry(contradictoryDelta);
assert.equal(contradictionBlocked.feature_contributions.futures_flow_1h_delta_pct.available, false);
assert.equal(contradictionBlocked.feature_contributions.futures_flow_4h_delta_pct.available, false);
assert.equal(contradictionBlocked.feature_contributions.spot_flow_delta_pct.available, false);

console.log(JSON.stringify({
  ok: true,
  suite: "shadow-decision-layer",
  assertions: "separate Long/Short shadow telemetry, EQ/DQ fail-closed, missing-chain guard, zero live decision/validation/Telegram"
}, null, 2));
