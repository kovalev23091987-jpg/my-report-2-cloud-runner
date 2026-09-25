import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEarlyCandidateBridge, normalizeEarlyBridgeReceipt } from '../src/early-candidate-bridge.mjs';

const NOW=1_800_000_000_000;
function stage0(contract,{turnover=500000,move24=4}={}){
  return {
    contract_code:contract,
    turnover_24h_usdt:turnover,
    data_status:'CLOSED',
    freshness:{stale:false,market_age_sec:10},
    quality:{market_present:true,history_available:true},
    symbol_fingerprint:{resolution_status:'RESOLVED_HTX_EXACT'},
    instrument_scope:{classification:'CRYPTO_CONFIRMED'},
    transitions:{'24h':{price_change_pct:move24}},
  };
}
function early(contract,{quality=80,domains=['OI_ACCELERATION','RELATIVE_STRENGTH'],micro=false}={}){
  const evidence=domains.map((domain)=>({domain,side:'BOTH',status:'CLOSED'}));
  const fusion=micro?{status:'CLOSED'}:{status:'PARTIAL'};
  return {
    contract_code:contract,wave_id:`W:${contract}`,lifecycle_stage:'PRE_IMPULSE_WATCH',direction_hint:'LONG',direction_state:'LONG_WATCH',
    early_detection_quality_0_100:quality,long_evidence_domain_count:domains.length,short_evidence_domain_count:0,
    last_seen_ts:NOW-60_000,feature_observed_ts:NOW-60_000,shadow_only:1,
    feature_json:JSON.stringify({feature_fusion:fusion}),evidence_json:JSON.stringify(evidence),
  };
}
function base(shortlist=[]){return {mode:'BASE',parameters:{max_shortlist:24},counts:{shortlist:shortlist.length},shortlist,contract_telemetry:[],decision:{generated:false}};}
function dq(contracts){return {queue:contracts.map(contract=>({contract}))};}

test('early anomaly raises priority and injects eligible coin without bypassing gates',()=>{
  const scan={contracts:[stage0('AAA-USDT'),stage0('BBB-USDT')]};
  const out=applyEarlyCandidateBridge({discovery_prefilter:base([{contract:'BBB-USDT',priority_rank:1,anomaly_flags:['1h:price_change_pct','1h:oi_change_pct'],anomaly_flags_count:2}]),scan,deep_check_queue:dq(['AAA-USDT','BBB-USDT']),early_rows:[early('AAA-USDT')],now:NOW});
  assert.equal(out.shortlist[0].contract,'AAA-USDT');
  assert.equal(out.shortlist[0].priority_rank,1);
  assert.equal(out.shortlist[0].early_candidate_bridge,true);
  assert.ok(out.shortlist[0].anomaly_flags.length>=2);
  assert.equal(out.early_bridge.hard_gates_bypassed,false);
  assert.equal(out.decision.generated,false);
});

test('without eligible anomaly priority is not raised',()=>{
  const scan={contracts:[stage0('AAA-USDT'),stage0('BBB-USDT')]};
  const weak=early('AAA-USDT',{domains:['OI_ACCELERATION']});
  const out=applyEarlyCandidateBridge({discovery_prefilter:base([{contract:'BBB-USDT',priority_rank:1,anomaly_flags:['a','b'],anomaly_flags_count:2}]),scan,deep_check_queue:dq(['AAA-USDT','BBB-USDT']),early_rows:[weak],now:NOW});
  assert.equal(out.shortlist[0].contract,'BBB-USDT');
  assert.equal(out.counts.early_bridge_accepted,0);
});

test('pump >=20% is routed away from early bridge and 19.99% remains eligible',()=>{
  const pump=applyEarlyCandidateBridge({discovery_prefilter:base([]),scan:{contracts:[stage0('AAA-USDT',{move24:20})]},deep_check_queue:dq(['AAA-USDT']),early_rows:[early('AAA-USDT')],now:NOW});
  assert.equal(pump.counts.early_bridge_accepted,0);
  assert.equal(pump.early_bridge.rejected[0].reason,'PUMP_ROUTE_GTE_20PCT_NOT_EARLY');
  const earlyMove=applyEarlyCandidateBridge({discovery_prefilter:base([]),scan:{contracts:[stage0('AAA-USDT',{move24:19.99})]},deep_check_queue:dq(['AAA-USDT']),early_rows:[early('AAA-USDT')],now:NOW});
  assert.equal(earlyMove.counts.early_bridge_accepted,1);
});

test('microstructure evidence changes operational priority and reason',()=>{
  const scan={contracts:[stage0('MICRO-USDT'),stage0('PLAIN-USDT')]};
  const micro=early('MICRO-USDT',{quality:75,domains:['OI_ACCELERATION','ORDERFLOW_ABSORPTION'],micro:true});
  const plain=early('PLAIN-USDT',{quality:75,domains:['OI_ACCELERATION','RELATIVE_STRENGTH'],micro:false});
  const out=applyEarlyCandidateBridge({discovery_prefilter:base([]),scan,deep_check_queue:dq(['MICRO-USDT','PLAIN-USDT']),early_rows:[plain,micro],now:NOW});
  assert.equal(out.shortlist[0].contract,'MICRO-USDT');
  assert.equal(out.shortlist[0].microstructure_priority_confirmed,true);
  assert.match(out.shortlist[0].bridge_reason,/microstructure/);
  assert.ok(out.shortlist[0].early_candidate_operational_priority_0_100>out.shortlist[1].early_candidate_operational_priority_0_100);
});

test('freshness and current technical eligibility fail closed',()=>{
  const stale={...early('AAA-USDT'),last_seen_ts:NOW-60*60_000,feature_observed_ts:NOW-60*60_000};
  assert.equal(normalizeEarlyBridgeReceipt(stale,{now:NOW}).priority_eligible,false);
  const out=applyEarlyCandidateBridge({discovery_prefilter:base([]),scan:{contracts:[stage0('AAA-USDT')]},deep_check_queue:dq([]),early_rows:[early('AAA-USDT')],now:NOW});
  assert.equal(out.counts.early_bridge_accepted,0);
});
