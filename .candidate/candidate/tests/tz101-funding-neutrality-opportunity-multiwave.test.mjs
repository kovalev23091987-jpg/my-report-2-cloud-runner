import test from "node:test";
import assert from "node:assert/strict";
import { detectOiFlushRebuild } from "../src/opportunity-intelligence-engine.mjs";
import { deriveCampaignEvidence } from "../src/multi-wave-campaign-engine.mjs";

const H = 3_600_000;
const NOW = Date.UTC(2026,8,17,8,0,0);

function structuralFlush(funding) {
  const oi = [100,98,90,91,96].map((volume,i)=>({ts:NOW-4*H+i*H,volume}));
  const price = [100,97,95,98,103].map((close,i)=>({ts:NOW-4*H+i*H,close}));
  return detectOiFlushRebuild({oi_series:oi,price_hourly:price,funding});
}

test("post-flush structural setup is invariant to funding sign or absence", () => {
  const variants = [
    {current:{funding_rate:-0.001}},
    {current:{funding_rate:0.001}},
    {current:{funding_rate:0}},
    null,
  ];
  const rows = variants.map(structuralFlush);
  for (const row of rows) {
    assert.equal(row.detected,true);
    assert.equal(row.setup_shadow,true);
    assert.equal(row.setup_label,"POST_FLUSH_REBUILD_RECLAIM_SETUP_SHADOW");
    assert.equal(row.funding_directional_vote,false);
    assert.equal(row.missing_fields.includes("funding"),false);
  }
});

function opportunity(direction) {
  const isLong = direction === "LONG";
  return {
    newest_event:{
      event_id:"E",
      control_group:false,
      market_flow:{status:"OK",delta:isLong?-50:50},
      relative_strength:{status:"OK",improving:isLong},
      spot_perp_basis:{status:"OK",htx_basis_pct:isLong?-0.2:0.2},
      oi_flush_rebuild:{status:"OK",detected:true,setup_shadow:true,oi_rebuild_pct:5},
      post_event_current:{
        status:"OK",
        low_held:isLong,
        high_held:!isLong,
        reclaim_detected:isLong,
        ease_supply_exhaustion:isLong,
        ease_demand_exhaustion:!isLong,
        event_volume_per_hour:1000,
        post_event_volume_per_hour:500,
      },
      liquidity_sweep:{side:isLong?"LOW":"HIGH",reclaim_detected:true},
      volume_ratio_median:4,
      body_range_ratio:0.2,
      cross_exchange:{cross_exchange_confirmed:true},
    }
  };
}

for (const direction of ["LONG","SHORT"]) {
  test(`Multi-Wave ${direction} evidence counts are invariant to funding sign/regime`, () => {
    const variants = [
      {status:"OK",current_rate:-0.001,funding_regime_change:"NEGATIVE_DEEPENING"},
      {status:"OK",current_rate:0.001,funding_regime_change:"POSITIVE_DEEPENING"},
      {status:"OK",current_rate:0,funding_regime_change:"STABLE"},
      {status:"MISSING",current_rate:null,funding_regime_change:null},
    ];
    const rows = variants.map(funding_metrics => deriveCampaignEvidence({
      opportunity:opportunity(direction),
      funding_metrics,
      independence:{regime:"IDIOSYNCRATIC_REGIME_WATCH"},
      retest:{second_reclaim:true},
      direction,
    }));
    for (const row of rows) {
      assert.equal(row.early.funding_crowding_or_deepening,false);
      assert.equal(row.next_impulse.funding_reloads_crowding,false);
    }
    assert.deepEqual(rows.map(r=>r.early_count), Array(rows.length).fill(rows[0].early_count));
    assert.deepEqual(rows.map(r=>r.next_impulse_count), Array(rows.length).fill(rows[0].next_impulse_count));
  });
}
