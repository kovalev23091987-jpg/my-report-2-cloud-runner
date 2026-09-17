import assert from "node:assert/strict";
import { buildFullEvidenceEnvelope } from "../src/full-evidence-contract.CHECKPOINT-full-evidence-shadow-production.mjs";
globalThis.buildFullEvidenceEnvelope = buildFullEvidenceEnvelope;
const { buildFullEvidenceShadowRecord } = await import("../src/full-evidence-shadow-model.CHECKPOINT-full-evidence-shadow-production.mjs");
const NOW=1800000000000;
const shadow={
  shadow_id:`${NOW}:ETHFI-USDT`,contract:"ETHFI-USDT",observed_ts:NOW,
  dc_shadow_long:64,dc_shadow_short:12,direction_hint:"LONG",stage:"SHADOW_OBSERVE_LONG_BIAS",
  eq:{status:"SHADOW_MEASURABLE",spread_bps:12.5,buy_impact_bps:4.2,sell_impact_bps:8.8},dq:{status:"HTX_CLOSED_EXTERNAL_CHAINS_MISSING",htx_coverage_pct:93.75},
  evidence_flags:{funding_pct:-0.05,price_1h_pct:1.2,price_4h_pct:2.5,price_24h_pct:4.1,oi_1h_change_pct:3.2,oi_4h_change_pct:8.1,futures_flow_1h_delta_pct:null,futures_flow_4h_delta_pct:4.4,spot_flow_delta_pct:null}
};
const pub={version:"public-evidence-adapters-v1",observed_ts:NOW,alias_verification:{aliases:{alias_candidate_safe:true},bybit:{verified:true,status:"CLOSED",exact_symbol:"ETHFIUSDT"},okx_swap:{verified:true,status:"CLOSED",exact_symbol:"ETHFI-USDT-SWAP"},okx_spot:{verified:true,status:"CLOSED",exact_symbol:"ETHFI-USDT"},binance_futures:{verified:true,status:"CLOSED",exact_symbol:"ETHFIUSDT"}},evidence:[
 {contract_code:"ETHFI-USDT",chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"funding_rate",source:"Bybit",venue:"BYBIT",market_type:"PERP",value:-0.001,unit:"rate",observed_ts:NOW,source_ts:NOW-60000,status:"CLOSED",coverage_pct:100,symbol_verified:true,alias_required:true,alias_verified:true,source_compatible:true,independence_group:"BYBIT_OFFICIAL_PUBLIC",primary_market_id:"ETHFIUSDT:BYBIT:PERP"},
 {contract_code:"ETHFI-USDT",chain:"MARKET_STRENGTH_SPOT",metric:"rs_vs_btc_4h",source:"OKX",venue:"OKX",market_type:"SPOT",value:2.3,unit:"pp",observed_ts:NOW,source_ts:NOW-60000,status:"CLOSED",coverage_pct:100,symbol_verified:true,alias_required:true,alias_verified:true,source_compatible:true,independence_group:"OKX_OFFICIAL_PUBLIC",primary_market_id:"ETHFI-USDT:OKX:SPOT"},
 {contract_code:"ETHFI-USDT",chain:"SMART_MONEY_ONCHAIN",metric:"chain_status",source:"EXTERNAL_EVIDENCE_REQUIRED",value:null,observed_ts:NOW,status:"NOT_CLOSED",coverage_pct:0,symbol_verified:true,alias_required:false,alias_verified:true,source_compatible:true},
 {contract_code:"ETHFI-USDT",chain:"SUPPORTING_RISK",metric:"chain_status",source:"EXTERNAL_EVIDENCE_REQUIRED",value:null,observed_ts:NOW,status:"NOT_CLOSED",coverage_pct:0,symbol_verified:true,alias_required:false,alias_verified:true,source_compatible:true},
]};
const r=buildFullEvidenceShadowRecord({shadow_decision:shadow,public_evidence:pub,now:NOW});
assert.equal(r.htx_execution_gate_closed,false);
assert.equal(r.fixed_decision_weights.CROSS_EXCHANGE_DERIVATIVES,35);
assert.equal(r.fixed_decision_weights.MARKET_STRENGTH_SPOT,30);
assert.deepEqual(r.missing_weighted_chains.sort(),["CROSS_EXCHANGE_DERIVATIVES","MARKET_STRENGTH_SPOT","SMART_MONEY_ONCHAIN","SUPPORTING_RISK"].sort());
assert.equal(r.chain_status.CROSS_EXCHANGE_DERIVATIVES.closure_status,"NOT_CLOSED");
assert.equal(r.chain_status.MARKET_STRENGTH_SPOT.closure_status,"NOT_CLOSED");
assert.equal(r.prior_htx_shadow.dc_shadow_long,64);
assert.equal(r.decision.dc_long,null);
assert.equal(r.decision.dc_short,null);
assert.equal(r.decision.live_probability,null);
assert.equal(r.decision.full_decision_eligible,false);
assert.equal(r.decision.validated,false);
assert.equal(r.decision.telegram_started,false);
assert.equal(r.safety.missing_data_coerced_to_zero,false);
assert.ok(r.evidence_compact.some(x=>x.metric==="htx_funding_pct" && x.value===-0.05));
assert.ok(r.evidence_compact.some(x=>x.metric==="htx_spread_bps" && x.value===12.5));
assert.ok(r.evidence_compact.some(x=>x.metric==="htx_futures_flow_1h_delta_pct" && x.value===null && x.status==="NOT_CLOSED"));

// A weighted chain is CLOSED only after its minimum evidence set is present.
const shadowClosed=structuredClone(shadow);
shadowClosed.htx_execution_gate_closed=true;
shadowClosed.evidence_flags.spot_flow_delta_pct=1.25;
const pubClosed=structuredClone(pub);
for (const row of pubClosed.evidence) {
  if (row.alias_required === true) row.asset_identity_verified = true;
  if (row.metric === "funding_rate") row.settlement_period = "1h";
  if (row.status === "CLOSED") row.max_age_sec = 7200;
}
pubClosed.evidence.push(
 {contract_code:"ETHFI-USDT",chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"funding_rate",source:"Binance",venue:"BINANCE",market_type:"PERP",value:-0.0008,unit:"rate",observed_ts:NOW,source_ts:NOW-60000,status:"CLOSED",coverage_pct:100,symbol_verified:true,alias_required:true,alias_verified:true,asset_identity_verified:true,source_compatible:true,independence_group:"BINANCE_OFFICIAL_PUBLIC",primary_market_id:"ETHFIUSDT:BINANCE:PERP",settlement_period:"1h"},
 {contract_code:"ETHFI-USDT",chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"oi_change_1h",source:"Bybit",venue:"BYBIT",market_type:"PERP",value:3.2,unit:"pct",observed_ts:NOW,source_ts:NOW-60000,status:"CLOSED",coverage_pct:100,symbol_verified:true,alias_required:true,alias_verified:true,asset_identity_verified:true,source_compatible:true,independence_group:"BYBIT_OFFICIAL_PUBLIC",primary_market_id:"ETHFIUSDT:BYBIT:PERP"},
 {contract_code:"ETHFI-USDT",chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"price_change_4h",source:"Binance",venue:"BINANCE",market_type:"PERP",value:2.1,unit:"pct",observed_ts:NOW,source_ts:NOW-60000,status:"CLOSED",coverage_pct:100,symbol_verified:true,alias_required:true,alias_verified:true,asset_identity_verified:true,source_compatible:true,independence_group:"BINANCE_OFFICIAL_PUBLIC",primary_market_id:"ETHFIUSDT:BINANCE:PERP"}
);
for (const row of pubClosed.evidence) if (row.status === "CLOSED") row.max_age_sec = 7200;
for (const [metric,value] of Object.entries({rs_vs_btc_1h:0.2,rs_vs_eth_1h:0.3,rs_vs_btc_4h:1.1,rs_vs_eth_4h:1.2,rs_vs_btc_24h:2.1,rs_vs_eth_24h:2.2})) {
  pubClosed.evidence.push({contract_code:"ETHFI-USDT",chain:"MARKET_STRENGTH_SPOT",metric,source:"OKX",venue:"OKX",market_type:"SPOT",value,unit:"pp",observed_ts:NOW,source_ts:NOW-60000,max_age_sec:7200,status:"CLOSED",coverage_pct:100,symbol_verified:true,alias_required:true,alias_verified:true,asset_identity_verified:true,source_compatible:true,independence_group:"OKX_OFFICIAL_PUBLIC",primary_market_id:"ETHFI-USDT:OKX:SPOT"});
}
const closed=buildFullEvidenceShadowRecord({shadow_decision:shadowClosed,public_evidence:pubClosed,now:NOW});
assert.equal(closed.chain_status.CROSS_EXCHANGE_DERIVATIVES.chain_closed,true);
assert.equal(closed.chain_status.CROSS_EXCHANGE_DERIVATIVES.closure_status,"CLOSED");
assert.equal(closed.chain_status.MARKET_STRENGTH_SPOT.chain_closed,true);
assert.equal(closed.chain_status.MARKET_STRENGTH_SPOT.closure_status,"CLOSED");
assert.equal(closed.htx_execution_gate_closed,true);
assert.deepEqual(closed.missing_weighted_chains.sort(),["SMART_MONEY_ONCHAIN","SUPPORTING_RISK"].sort());

console.log(JSON.stringify({ok:true,suite:"full-evidence-shadow-model",assertions:"HTX gate, fixed weights preserved, strict Chain2/3 minimum closure sets, sparse evidence stays partial, Chain4/5 missing kept missing, prior HTX proxy separated from full DC, null preservation, zero live/validated/Telegram/execution"},null,2));
