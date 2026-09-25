import test from 'node:test';import assert from 'node:assert/strict';
import {buildRuntimeCanonicalBundle} from '../src/canonical-runtime-adapter.mjs';
const now=1_800_000_000_000;
test('one runtime canonical result feeds two different formatters with identical fingerprint',()=>{
 const b=buildRuntimeCanonicalBundle({contract:'ABC-USDT',run_id:'run1',snapshot_id:'snap1',observed_ts:now,
  discovery_row:{contract:'ABC-USDT',early_candidate_bridge:true,early_candidate_quality_0_100:82,early_candidate_operational_priority_0_100:78,early_candidate_wave_id:'w1',early_candidate_evidence_domains:['VOLUME_ACCELERATION','ORDERFLOW_ABSORPTION'],microstructure_priority_confirmed:true,microstructure_priority_domains:['ORDERFLOW_ABSORPTION'],rolling_24h_change_pct:19.99,htx_futures_turnover_gate:{status:'CLOSED',allowed:true,turnover_usd_equivalent:200000}},
  opportunity:{version:'opp',status:'CLOSED',newest_event:{event_id:'e',timeframe:'15m',event_close_ts:now-60000,minute_decomposition:{classification_allowed:true,one_minute_bars:15},early_anomaly_classification:{accumulation:{evidence_score:70}}}},
  publication_shadow:{entry_signal:{state:'WAIT_FOR_TRIGGER',direction:'LONG',reason:'PRICE_OUTSIDE_ENTRY_AREA',trigger:{metric:'price',operator:'>=',value:10,unit:'USDT',expires_ts:now+600000,cancel_condition:'price>11'}},score_interval:{score_lower_bound:64},scenario_plan:{entry_area_min_price:10,entry_area_max_price:11,execution_reference_price:9.8,invalidation:'9.1 USDT',target_price:12},publication_gate:{status:'NOT_CLOSED'}},
  public_evidence:{evidence:[]},liquidation_intelligence:{projected_clusters:[]},data_sufficiency:{classification:'PARTIAL'},
 });
 assert.equal(b.status,'CLOSED');assert.equal(b.telegram.ok,true);assert.equal(b.manual.ok,true);assert.equal(b.telegram.analytical_fingerprint,b.manual.analytical_fingerprint);assert.notEqual(b.telegram.message,b.manual.text);assert.match(b.manual.text,/РАННИЕ КАНДИДАТЫ ДО ДВИЖЕНИЯ/);assert.equal(b.canonical.scores.entry_readiness_0_100,null);
});
