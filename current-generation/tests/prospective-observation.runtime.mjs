import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const runtime=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const imp=p=>import(pathToFileURL(path.join(runtime,'src',p)).href);
const helper=await imp('prospective-opportunity-view.mjs');
const engine=await imp('opportunity-intelligence-engine.mjs');
const before=await imp('opportunity-before-prospective-test.mjs');
const adapter=await imp('canonical-runtime-adapter.mjs');
const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/actual-prospective-episode-37405375170.json.gz',import.meta.url))));
assert.equal(fixture.sourceHTTP,0);assert.equal(fixture.is_new_live_source_acceptance,false);
const digest=v=>createHash('sha256').update(v).digest('hex');
function replayBars(r){
 let prior=null,prev=null;
 return r.minutes.map(m=>{
  assert.equal(m.contract,r.contract);assert.equal(m.contract_size,r.contract_size);
  assert.equal(m.factual_count,m.fills.length);assert.equal(digest(JSON.stringify(m.fills)),m.raw_sha256);
  assert.ok(m.observed_ts<=r.canonical_cutoff&&m.source_ts<=r.canonical_cutoff);
  if(prev!==null)assert.equal(m.start_ts,prev+60000);prev=m.start_ts;
  const fills=m.fills.slice().sort((a,b)=>a.ts-b.ts||a.id.localeCompare(b.id));
  for(const f of fills){assert.ok(f.ts>=m.start_ts&&f.ts<m.start_ts+60000);assert.ok(f.price>0&&f.contracts>0);assert.ok(Math.abs(f.quote_usdt-f.price*f.contracts*r.contract_size)<1e-7*Math.max(1,f.quote_usdt));}
  if(!fills.length){assert.ok(prior!==null);return{ts:m.start_ts,open:prior,high:prior,low:prior,close:prior,volume:0,closed:true,replay_basis:'VERIFIED_EMPTY_MINUTE_PRIOR_ACTUAL_FILL'};}
  const prices=fills.map(f=>f.price);prior=prices.at(-1);
  return{ts:m.start_ts,open:prices[0],high:Math.max(...prices),low:Math.min(...prices),close:prior,volume:fills.reduce((s,f)=>s+f.quote_usdt,0),closed:true,replay_basis:'VERIFIED_RETAINED_RAW_FILLS_NOT_ORIGINAL_EXCHANGE_CANDLE_BODY'};
 });
}
const replays=new Map();
test('retained raw inputs preserve every historical engine output on the same original clocks',()=>{
 for(const r of fixture.rows){
  const bars=replayBars(r);assert.equal(bars.length,360);
  const input={contract:r.contract,now:r.event_observed_ts,primary:{one_minute:bars}};
  const old=before.buildOpportunityShadowAnalysis(input),next=engine.buildOpportunityShadowAnalysis(input);
  const {live_observation_event,...rest}=next;
  assert.deepEqual(rest,old,'prospective handoff must not alter historical samples, scores or statistics');
  if(r.contract==='WIF-USDT'){
   assert.ok(live_observation_event,'real retained raw inputs must reach the producer current-event handoff');
   assert.equal(live_observation_event.event_close_ts,1791252900000);
   assert.ok(Math.abs(live_observation_event.volume_ratio_median-r.original_event.related_signals.at(-1).volume_ratio_median)<1e-10);
   assert.equal(live_observation_event.candle.high,.2482);assert.equal(live_observation_event.candle.low,.246);
   assert.ok(helper.readProspectiveOpportunity(next,{contract:r.contract,decision_ts:r.canonical_cutoff}));
  }else assert.equal(live_observation_event,undefined);
  replays.set(r.contract,{r,bars,next});
 }
});
let live;
test('actual latest WIF related signal has a complete timely 15 minute source window; stale QNT does not',()=>{
 for(const r of fixture.rows){
  const {bars}=replays.get(r.contract);
  const related=r.original_event.related_signals.at(-1);
  const window=bars.filter(b=>b.ts>=related.timestamp&&b.ts<related.event_close_ts);
  const raw={...r.original_event,event_id:related.signal_event_id,timestamp:related.timestamp,event_close_ts:related.event_close_ts,timeframe:related.timeframe,threshold_path:related.threshold_path,candle:{open:window[0]?.open,high:Math.max(...window.map(b=>b.high)),low:Math.min(...window.map(b=>b.low)),close:window.at(-1)?.close}};
  const chosen=helper.selectProspectiveRawAnomaly([raw],[r.original_event],{contract:r.contract,observed_ts:r.event_observed_ts});
  if(r.contract==='QNT-USDT'){assert.equal(chosen,null);continue;}
  assert.equal(window.length,15);assert.equal(chosen.event_close_ts,1791252900000);
  assert.equal(chosen.statistical_episode_id,r.original_event.event_id);
  live=helper.sealProspectiveOpportunity({...chosen,minute_decomposition:{status:'CLOSED',classification_allowed:true,event_start_ts:chosen.timestamp,event_close_ts:chosen.event_close_ts,expected_one_minute_bars:15,one_minute_bars:15,missing_or_incomplete:false}},{contract:r.contract,observed_ts:r.event_observed_ts});
  assert.ok(live);assert.equal(live.candle.high,.2482);assert.equal(live.candle.low,.246);
  assert.ok(helper.readProspectiveOpportunity({live_observation_event:live},{contract:r.contract,decision_ts:r.canonical_cutoff}));
  assert.equal(live.independent_sample,false);assert.equal(live.score_contribution,0);assert.equal(live.entry_authorized,false);
 }
});
test('consumer handoff builds conditions only when an independently qualified direction already exists',()=>{
 const r=fixture.rows.find(r=>r.contract==='WIF-USDT'),ts=r.canonical_cutoff;
 // Controlled consumer qualification is a regression, not an actual live trading claim.
 const qualify=direction_state=>({contract:r.contract,current_price:.24735,early_candidate_bridge:true,wave_id:'controlled',early_candidate_wave_id:'controlled',early_candidate_quality_0_100:82,early_candidate_direction_hint:'SHORT',early_candidate_receipt:{status:'CLOSED',contract:r.contract,wave_id:'controlled',source_ts:ts-1000,available_at:ts-1000,direction_hint:'SHORT',direction_state,evidence:[{status:'CLOSED',side:'SHORT'}]}});
 const assess=(discovery_row,opportunity)=>adapter.buildRuntimeCanonicalBundle({contract:r.contract,run_id:'retained-regression-not-live',snapshot_id:'retained-regression-not-live',observed_ts:ts,discovery_row,publication_shadow:{entry_signal:{state:'REJECTED',direction:'SHORT'}},opportunity}).canonical;
 const opportunity={newest_event:r.original_event,live_observation_event:live};
 const qualified=assess(qualify('SHORT_WATCH'),opportunity);
 assert.equal(qualified.state,'OBSERVE');assert.equal(qualified.entry.min_price,.246);
 assert.equal(qualified.trigger.value,.246);assert.equal(qualified.invalidation.price,.2482);
 assert.equal(qualified.metadata.prospective_observation_receipt.source_ts,1791252900000);
 assert.equal(qualified.metadata.prospective_observation_receipt.independent_vote_added,false);
 const conflict=assess(qualify('BIDIRECTIONAL_REQUIRES_DEEP_RESOLUTION'),opportunity);
 assert.equal(conflict.state,'REJECTED');assert.equal(conflict.direction,null);
 assert.equal(conflict.entry,null);assert.equal(conflict.metadata.score_basis.selected,'NOT_CLOSED');
 assert.equal(r.source_direction_resolution.status,'UNKNOWN');assert.equal(r.source_score_basis.selected,'NOT_CLOSED');
});
test('fresh view rejects expiry, later-known facts, foreign identities, inverse and incomplete minute evidence',()=>{
 const r=fixture.rows.find(r=>r.contract==='WIF-USDT'),opts={contract:r.contract,decision_ts:r.canonical_cutoff};
 const read=e=>helper.readProspectiveOpportunity({live_observation_event:e},opts);
 assert.equal(read({...live,available_at:opts.decision_ts+1}),null);
 assert.equal(read({...live,contract:'QNT-USDT'}),null);
 assert.equal(read({...live,contract:'WIF-USD'}),null);
 assert.equal(read({...live,entry_authorized:true}),null);
 assert.equal(read({...live,minute_decomposition:{...live.minute_decomposition,missing_or_incomplete:true}}),null);
 assert.equal(helper.readProspectiveOpportunity({live_observation_event:live},{...opts,decision_ts:live.event_close_ts+600001}),null);
});
