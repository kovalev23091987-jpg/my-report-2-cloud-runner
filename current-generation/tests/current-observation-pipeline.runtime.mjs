import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {SQLiteDB} from '../../telegram-repair-tests/sqlite-db.mjs';
const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const imp=name=>import(pathToFileURL(path.join(root,'src',name)));
const adapter=await imp('canonical-runtime-adapter.mjs');
const pub=await imp('canonical-publication.mjs');
const lifecycle=await imp('v3-telegram-lifecycle-sidecar.mjs');
const {prepareLifecycleTransition}=await imp('v3-telegram-runtime.mjs');
const {runBoundTelegramDeliverySidecar}=await imp('bound-telegram-delivery-sidecar.mjs');
const {sealProspectiveOpportunity}=await imp('prospective-opportunity-view.mjs');
const original=JSON.parse(gunzipSync(fs.readFileSync('batch-source/current1628/exact-current-data.json.gz')));
const source=JSON.parse(gunzipSync(fs.readFileSync('batch-source/pipeline1628/exact-current-data.json.gz')));
assert.equal(original.source_cloud_run,37470725751);assert.equal(source.source_cloud_run,original.source_cloud_run);
assert.equal(source.status,'EXACT_CURRENT_PUBLIC_DATA_READ');
const row=original.rows.find(r=>r.contract_code==='FIL-USDT'),old=row.canonical;
const actual=source.pipeline_rows.find(r=>r.contract===row.contract_code);
const h=source.handoffs.results.find(r=>r.contract_code===row.contract_code);
const feature=original.early.find(r=>r.contract===row.contract_code).feature;
const receipt=old.metadata.scenario_plan_transfer.fallback_receipt;
const proof={schema:'CURRENT_OBSERVATION_PIPELINE_COMPONENT_REPLAY_V1',scope:'RETAINED_SOURCE_FACTS_AT_ORIGINAL_CLOCK; RECONSTRUCTED_ADAPTER_ENVELOPE_AND_LOCAL_PUBLICATION; INJECTED_RELAY_ONLY',sourceHTTP:0,MAIN:0,production_D1:0,Telegram:0,fresh_SENT:false,source_cloud_run:original.source_cloud_run,source_head:original.source_head,run_id:original.run_id,snapshot_id:old.snapshot_id,original_fingerprint:old.analytical_fingerprint,cases:[]};
globalThis.fetch=async()=>{throw Error('LIVE_NETWORK_FORBIDDEN');};
// The missing original producer envelope is reconstructed explicitly from its
// sealed direction receipt. Original price, range, score and source clocks are
// retained; this is a component replay, never a new market/publication run.
function input(){const er=old.metadata.direction_resolution.early_receipt;
 return {contract:row.contract_code,run_id:old.run_id,snapshot_id:old.snapshot_id,observed_ts:old.observed_ts,
  discovery_row:{contract:row.contract_code,current_price:old.current_price,early_candidate_bridge:true,early_candidate_wave_id:h.wave_id,wave_id:h.wave_id,early_candidate_quality_0_100:feature.early_detection_quality_0_100,
   early_candidate_receipt:{status:'CLOSED',contract:row.contract_code,wave_id:h.wave_id,source_ts:er.source_ts,available_at:er.available_at,direction_hint:feature.direction_hint,direction_state:feature.direction_state,evidence:[{status:'CLOSED',side:feature.direction_hint}]}},
  publication_shadow:{entry_signal:{state:'REJECTED'}},
  opportunity:{observed_ts:receipt.producer_observed_ts,newest_event:{event_id:receipt.event_id,event_close_ts:receipt.event_close_ts,candle:{high:receipt.event_high,low:receipt.event_low},minute_decomposition:{classification_allowed:receipt.anomaly_candle_closed}}},
  internal_market_context:{internal_only:true,evidence_v2:{evidence:old.metadata.internal_market_context.evidence_v2.evidence.filter(r=>r.block_id==='N10')}}};
}
function candidate(){const rebuilt=adapter.buildRuntimeCanonicalBundle(input()).canonical;
 // Keep all independently retained factual output and role receipts unchanged.
 // Only the tested plan/state transfer is composed into a local hypothetical row.
 const c=structuredClone(old);for(const k of ['state','entry','trigger','invalidation','targets'])c[k]=rebuilt[k];
 c.metadata.scenario_plan_transfer=rebuilt.metadata.scenario_plan_transfer;
 c.metadata.technical_move_potential=rebuilt.metadata.technical_move_potential;
 c.metadata.price_recheck_policy=rebuilt.metadata.price_recheck_policy;
 c.analytical_fingerprint=pub.canonicalFingerprint(c);return c;
}
function args(c,patch={}){const er=old.metadata.direction_resolution.early_receipt;
 return {handoff:{...h,handoff_direction:h.direction,deep_started_ts:h.started_ts,deep_completed_ts:h.completed_ts,deep_error:h.error_text},
  early:{contract_code:row.contract_code,wave_id:h.wave_id,first_seen_ts:h.scan_ts,last_seen_ts:er.source_ts,lifecycle_stage:JSON.parse(h.current_state_json),direction_hint:feature.direction_hint,direction_state:feature.direction_state,early_detection_quality_0_100:feature.early_detection_quality_0_100},
  shadow:actual.shadow[0],final:actual.final[0]??null,now_ts:h.completed_ts+100,dispatch_enabled:true,canonical_required:true,
  canonical:{publication_id:'LOCAL-COMPONENT:'+old.snapshot_id,contract_code:row.contract_code,run_id:c.run_id,snapshot_id:c.snapshot_id,wave_id:h.wave_id,direction:c.direction,canonical_state:c.state,observed_ts:c.observed_ts,created_ts:c.observed_ts+10,analytical_fingerprint:c.analytical_fingerprint,canonical_json:JSON.stringify(c)},...patch};}
function database(){const db=new SQLiteDB();db.sqlite.exec(fs.readFileSync('post-v7-consolidated/liquidation/unified-delivery-base/migrations.sql','utf8'));
 const prepare=db.prepare.bind(db);db.prepare=sql=>{const s=prepare(sql);s.sql=sql;return s;};
 db.batch=async statements=>{db.sqlite.exec('BEGIN IMMEDIATE');try{const rs=statements.map(s=>({success:true,meta:{changes:Number(db.sqlite.prepare(s.sql).run(...(s.args||[])).changes)}}));db.sqlite.exec('COMMIT');return rs;}catch(e){db.sqlite.exec('ROLLBACK');throw e;}};return db;}
test('retained actual row is unchanged, rejected and never silently resent',()=>{const before=JSON.stringify(old);assert.equal(pub.canonicalFingerprint(old),old.analytical_fingerprint);assert.equal(old.state,'REJECTED');assert.equal(pub.assessActionability({canonical:old,lifecycle_event:'OBSERVE'}).deliver,false);assert.equal(JSON.stringify(old),before);
 assert.equal(receipt.reason,'CANCELLATION_ALREADY_TRUE_AT_SNAPSHOT');assert.equal(actual.shadow[0].direction_hint,'LONG');assert.equal(actual.shadow[0].dc_long,39.62);assert.equal(feature.direction_hint,'SHORT');assert.equal(feature.early_detection_quality_0_100,82);proof.cases.push({case:'ACTUAL_PRIOR_REJECTION_RETAINED',final_rows_in_original_lifecycle_window:actual.final.length});});
test('new qualified observation uses newer exact range without changing interest, direction, clocks or targets',()=>{const c=candidate();assert.equal(c.state,'OBSERVE');assert.equal(c.direction,old.direction);assert.deepEqual(c.scores,old.scores);assert.equal(c.trigger.value,1.0763);assert.equal(c.invalidation.price,1.2109);assert.equal(c.trigger.expires_ts,old.observed_ts+1800000);assert.deepEqual(c.targets,[]);assert.equal(c.metadata.scenario_plan_transfer.fallback_receipt.replaced_historical_fallback_reason,receipt.reason);assert.equal(c.metadata.direction_resolution.authorized_entry_direction,'UNKNOWN');assert.equal(pub.assessActionability({canonical:c,lifecycle_event:'OBSERVE'}).deliver,true);proof.cases.push({case:'CURRENT_RANGE_REPLACES_UNUSABLE_HISTORICAL_FALLBACK',level:c.trigger.value,cancel:c.invalidation.price,score:c.scores.coin_interest_0_100});});
test('routed cancellation, missing event time, newer event and invalid range remain rejected',()=>{for(const mutate of [x=>{x.publication_shadow.entry_signal.trigger={value:receipt.selected_trigger_price,cancel_condition:'price>'+receipt.cancellation_price};},x=>{x.opportunity.newest_event.event_close_ts=null;},x=>{x.opportunity.newest_event.event_close_ts=old.observed_ts;},x=>{x.internal_market_context.evidence_v2.evidence[0].expires_at=old.observed_ts;},x=>{x.internal_market_context.evidence_v2.evidence=[];},x=>{x.discovery_row.early_candidate_receipt.direction_state='DIRECTION_NOT_CLOSED';},x=>{x.discovery_row.early_candidate_quality_0_100=69;},x=>{x.publication_shadow.entry_signal.hard_veto=true;}]){const x=structuredClone(input());mutate(x);assert.equal(adapter.buildRuntimeCanonicalBundle(x).canonical.state,'REJECTED');}proof.cases.push({case:'ROUTED_CANCEL_CLOCK_RANGE_DIRECTION_SCORE_VETO_REFUSALS',count:8});});
test('a timely prospective anomaly retains its real cancellation and cannot be replaced',()=>{const x=input(),end=old.observed_ts-1000,start=end-900000;
 const live=sealProspectiveOpportunity({contract:row.contract_code,exchange:'HTX',event_id:'CONTROLLED-PROSPECTIVE',timestamp:start,event_close_ts:end,timeframe:'15m',threshold_path:'WATCH_THRESHOLD',candle:{open:1.1,close:1.1,high:receipt.event_high,low:receipt.event_low},minute_decomposition:{status:'CLOSED',classification_allowed:true,event_start_ts:start,event_close_ts:end,expected_one_minute_bars:15,one_minute_bars:15,missing_or_incomplete:false},statistical_episode_id:'CONTROLLED-EPISODE',prospective_observation_only:true,independent_sample:false,outcome_scoring_eligible:false},{contract:row.contract_code,observed_ts:old.observed_ts});assert.ok(live);x.opportunity.live_observation_event=live;const c=adapter.buildRuntimeCanonicalBundle(x).canonical;assert.equal(c.state,'REJECTED');assert.equal(c.metadata.scenario_plan_transfer.fallback_receipt.reason,'CANCELLATION_ALREADY_TRUE_AT_SNAPSHOT');});
test('qualified canonical SHORT survives opposite unqualified telemetry but legacy route is unchanged',()=>{const c=candidate(),x=args(c),derived=lifecycle.deriveLifecycleContext(x);assert.equal(derived.status,'CLOSED',JSON.stringify(derived));assert.equal(derived.ctx.direction,'SHORT');assert.equal(derived.ctx.direction_destroyed,false);assert.equal(derived.ctx.direction_confirmed,false);assert.equal(derived.ctx.useful_observation,true);const legacy=lifecycle.deriveLifecycleContext({...x,canonical_required:false});assert.equal(legacy.status,'RISK_BLOCKED');assert.equal(legacy.reason,'DIRECTION_DESTROYED');proof.cases.push({case:'QUALIFIED_CANONICAL_NOT_UNQUALIFIED_TELEMETRY',status:derived.status,entry_authorized:false});});
test('true final conflict, hard veto, invalidated risk, terminal lifecycle and insufficient data still block',()=>{const c=candidate();for(const patch of [
 {final:{contract_code:row.contract_code,observation_ts:old.observed_ts,persisted_ts:old.observed_ts+10,direction:'LONG',directional_quality:'CLOSED'}},
 {final:{contract_code:row.contract_code,observation_ts:old.observed_ts,persisted_ts:old.observed_ts+10,hard_veto:1}},
 {final:{contract_code:row.contract_code,observation_ts:old.observed_ts,persisted_ts:old.observed_ts+10,risk_state:'INVALIDATED'}},
 {final:{contract_code:row.contract_code,observation_ts:old.observed_ts,persisted_ts:old.observed_ts+10,direction:'NEUTRAL',directional_quality:'CLOSED'}},
 {shadow:{...actual.shadow[0],dq_status:'INSUFFICIENT'}}]){const r=lifecycle.deriveLifecycleContext(args(c,patch));assert.equal(r.status,'RISK_BLOCKED',JSON.stringify(r));}
 const x=args(c);x.early.lifecycle_stage='INVALIDATED';assert.notEqual(lifecycle.deriveLifecycleContext(x).status,'CLOSED');
 const prior=lifecycle.deriveLifecycleContext(args(c,{previous:{direction:'SHORT',status:'OBSERVE',wave_id:h.wave_id},final:{contract_code:row.contract_code,observation_ts:old.observed_ts,persisted_ts:old.observed_ts+10,hard_veto:1}}));assert.equal(prior.status,'CLOSED');assert.equal(prior.ctx.removal_reason,'HARD_VETO');});
test('same-snapshot approved output passes local persistence, binding, injected relay and dedup as one chain',async()=>{const c=candidate(),x=args(c),derived=lifecycle.deriveLifecycleContext(x);assert.equal(derived.status,'CLOSED');const db=database();try{
 const saved=await pub.persistCanonicalSnapshot(db,{canonical:c,wave_id:h.wave_id,now_ts:old.observed_ts+10});assert.ok(saved.publication_id);const transition=await prepareLifecycleTransition(db,derived.ctx,x.now_ts);assert.equal(transition.current_status,'OBSERVE',JSON.stringify(transition));assert.ok(transition.dispatch);
 let calls=0;const options={enabled:true,source_run_id:c.run_id,now_ts:x.now_ts+1,relay_url:'https://controlled.invalid/relay',relay_key:'CONTROLLED-NONSECRET',fetch_impl:async(url,request)=>{calls++;assert.equal(JSON.parse(request.body).text,pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'}).text);return{ok:true,status:200,json:async()=>({ok:true,status:'SENT',message_id:9002})};}};
 const sent=await runBoundTelegramDeliverySidecar(db,options);assert.equal(sent.sent,1,JSON.stringify(sent));const dispatch=db.sqlite.prepare('SELECT state,telegram_message_id FROM v3_telegram_dispatch_shadow').get();assert.equal(dispatch.state,'SENT');assert.equal(dispatch.telegram_message_id,'9002');assert.equal((await runBoundTelegramDeliverySidecar(db,options)).sent,0);assert.equal(calls,1);proof.cases.push({case:'COMPOSED_LOCAL_PIPELINE',injected_message_id:9002,relay_invocations:calls,duplicates:0,production_sent:false});
 }finally{db.close();}});
test('retained NIL remains without a closed direction and cannot use this repair',()=>{const nil=original.rows.find(r=>r.contract_code==='NIL-USDT').canonical;assert.equal(nil.direction,null);assert.equal(pub.assessActionability({canonical:nil,lifecycle_event:'OBSERVE'}).deliver,false);proof.cases.push({case:'NIL_ACTUAL_REFUSAL_PRESERVED'});});
test.after(()=>{fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/current-observation-pipeline-proof.json',JSON.stringify(proof,null,2)+'\n');});
