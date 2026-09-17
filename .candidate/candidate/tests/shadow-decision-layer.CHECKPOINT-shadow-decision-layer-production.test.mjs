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
        order_flow: { delta_pct_of_turnover: sign * 18 },
      },
    },
    trajectory: {
      status: "fulfilled",
      data: {
        coverage: c.trajectory,
        windows: {
          "1h": {
            price: { change_pct: sign * 2.2 },
            order_flow: { delta_pct_of_turnover: sign * 18 },
            open_interest: { contracts: { change_pct: 7 } },
            derived: { absorption_candidate: { value: direction === "long" } },
          },
          "4h": {
            price: { change_pct: sign * 5.1 },
            order_flow: { delta_pct_of_turnover: sign * 17 },
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

console.log(JSON.stringify({
  ok: true,
  suite: "shadow-decision-layer",
  assertions: "separate Long/Short shadow telemetry, EQ/DQ fail-closed, missing-chain guard, zero live decision/validation/Telegram"
}, null, 2));
