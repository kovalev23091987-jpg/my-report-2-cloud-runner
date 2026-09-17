import assert from 'node:assert/strict';
import { buildFullEvidenceEnvelope } from '../src/full-evidence-contract.mjs';
globalThis.buildFullEvidenceEnvelope = buildFullEvidenceEnvelope;
const { buildFullEvidenceShadowRecord } = await import('../src/full-evidence-shadow-model.mjs');

const NOW=1800000000000;
const contract='TEST-USDT';
const shadow={
  shadow_id:`${NOW}:${contract}`,contract,observed_ts:NOW,
  htx_execution_gate_closed:true,
  eq:{status:'SHADOW_MEASURABLE',spread_bps:8,buy_impact_bps:2,sell_impact_bps:3},
  dq:{status:'INSUFFICIENT',htx_coverage_pct:75},
  evidence_flags:{
    funding_pct:-0.04,
    funding_interval_hours:4,
    price_1h_pct:0.6,price_4h_pct:1.4,price_24h_pct:2.2,
    oi_1h_change_pct:2.4,oi_4h_change_pct:5.1,
    futures_flow_1h_delta_pct:null,futures_flow_4h_delta_pct:null,
    spot_flow_delta_pct:3.3,
  },
};
const baseExternal={contract_code:contract,observed_ts:NOW,source_ts:NOW-60_000,max_age_sec:7200,status:'CLOSED',coverage_pct:100,symbol_verified:true,alias_required:true,alias_verified:true,asset_identity_verified:true,source_compatible:true};
const evidence=[
  {...baseExternal,chain:'CROSS_EXCHANGE_DERIVATIVES',metric:'funding_rate',source:'Bybit',venue:'BYBIT',market_type:'PERP',value:-0.0002,unit:'rate',independence_group:'BYBIT_OFFICIAL_PUBLIC',primary_market_id:'TESTUSDT:BYBIT:PERP',settlement_period:'4h'},
];
for(const [metric,value] of Object.entries({rs_vs_btc_1h:0.4,rs_vs_eth_1h:0.3,rs_vs_btc_4h:0.9,rs_vs_eth_4h:0.8,rs_vs_btc_24h:1.2,rs_vs_eth_24h:1.1})){
  evidence.push({...baseExternal,chain:'MARKET_STRENGTH_SPOT',metric,source:'OKX',venue:'OKX',market_type:'SPOT',value,unit:'pp',independence_group:'OKX_OFFICIAL_PUBLIC',primary_market_id:'TEST-USDT:OKX:SPOT'});
}
// Supporting chains intentionally missing: must remain advisory later, not needed to prove Chain2/3 closure here.
evidence.push({contract_code:contract,chain:'SMART_MONEY_ONCHAIN',metric:'chain_status',source:'EXTERNAL_EVIDENCE_REQUIRED',value:null,observed_ts:NOW,status:'NOT_CLOSED',coverage_pct:0,symbol_verified:true,alias_required:false,alias_verified:true,source_compatible:true});
evidence.push({contract_code:contract,chain:'SUPPORTING_RISK',metric:'chain_status',source:'EXTERNAL_EVIDENCE_REQUIRED',value:null,observed_ts:NOW,status:'NOT_CLOSED',coverage_pct:0,symbol_verified:true,alias_required:false,alias_verified:true,source_compatible:true});
const publicEvidence={version:'public-evidence-adapters-v1',observed_ts:NOW,alias_verification:{aliases:{alias_candidate_safe:true}},evidence};
const r=buildFullEvidenceShadowRecord({shadow_decision:shadow,public_evidence:publicEvidence,now:NOW});
assert.equal(r.htx_execution_gate_closed,true);
assert.equal(r.chain_status.CROSS_EXCHANGE_DERIVATIVES.chain_closed,true,'HTX + one independent external funding venue + factual HTX OI/price trajectory must close Chain2');
assert.deepEqual(r.chain_status.CROSS_EXCHANGE_DERIVATIVES.venues.sort(),['BYBIT','HTX']);
assert.equal(r.chain_status.MARKET_STRENGTH_SPOT.chain_closed,true,'six synchronized RS windows + factual HTX spot flow must close Chain3');
assert.deepEqual(r.missing_weighted_chains.sort(),['SMART_MONEY_ONCHAIN','SUPPORTING_RISK'].sort());
console.log(JSON.stringify({ok:true,suite:'chain23-closure-regression',chain2:r.chain_status.CROSS_EXCHANGE_DERIVATIVES,chain3:r.chain_status.MARKET_STRENGTH_SPOT,missing:r.missing_weighted_chains},null,2));
