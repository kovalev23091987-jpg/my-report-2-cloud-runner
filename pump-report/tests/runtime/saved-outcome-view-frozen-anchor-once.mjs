import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {MemoryStore} from '../../runtime/store.mjs';
import {readSavedOutcome} from '../../runtime/saved-outcome.mjs';
import {readSavedOutcome as beforeFrozenGuard} from '../../.private/outcome-view-20261027/connected-worker-reviewed-graph/runtime/saved-outcome.mjs';
import {readSavedOutcome as beforeReview} from '../../.private/outcome-view-20261027/connected-worker-v2-graph/runtime/saved-outcome.mjs';
import {formatSavedOutcomeView} from '../../analytics/outcome-presentation.mjs';
import {plusTenPrice} from '../../analytics/math.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const own=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
assert.equal(a.status,'ADMITTED_ONE_SAVED_OUTCOME_VIEW_CONNECTED_CASE');
assert(own.owner===a.own_lease.owner&&!own.released&&Date.now()<a.expires_ts&&a.expires_ts<=own.expires_ts);
for(const [p,h]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
const cachedBytes=fs.readFileSync(a.cached_baseline);assert.equal(sha(cachedBytes),a.cached_baseline_sha256);
const cached=JSON.parse(cachedBytes).cases.find(c=>c.case_id==='AIN_AUTO_20261026_READY_STALE');
const analysis=structuredClone(cached.baseline_analysis),input=structuredClone(cached.input);
assert(analysis.ready);assert.equal(analysis.analysis_ts,input.analysis_ts);
const key='pump:analysis:'+sha(JSON.stringify(analysis)),T=analysis.analysis_ts,deadline=T+14400000;
const signal_id='pump:signal:'+analysis.instrument.instrument_id+':'+analysis.wave_id;
const journalKey='pump:journal:'+analysis.instrument.instrument_id+':'+analysis.wave_id;
const origin={instrument_id:analysis.instrument.instrument_id,asset_id:analysis.instrument.asset_id,wave_id:analysis.wave_id,
 signal_id,t0:T,reference_price:analysis.reference_price,rules_version:analysis.rules_version,profile_version:analysis.profile_version,
 mode:analysis.mode,map_mode:'NO_MAP',evidence_class:'OBSERVED',run_purpose:'PRODUCTION',ready:true};
const signal={...origin,origin,instrument:analysis.instrument,analysis_key:key,map_mode:'WITHOUT_MAP',deadline_ts:deadline};
const journal={frozen_anchor:{immutable:true,analysis_id:key,analysis_sha256:key.slice(-64),origin}};
const outcome={signal_id,wave_id:analysis.wave_id,mode:analysis.mode,map_mode:'WITHOUT_MAP',rules_version:analysis.rules_version,
 t0:T,reference_price:analysis.reference_price,target_price:plusTenPrice(analysis.reference_price),deadline_ts:deadline,
 status:'HIT',hit_ts:T+60000,hit_interval:null,drawdown_before_hit_pct:null,drawdown_total_pct:null,
 coverage:{complete:false,covered_until_ts:deadline},reasons:['PRE_HIT_COVERAGE_INCOMPLETE'],scenario_outcome:null};
// Only delivery/statistics persistence is artificial. Original market facts,
// plan and clocks are the unchanged cached historical input, never live IO.
fs.writeFileSync(a.proof_path+'.attempt',JSON.stringify({started_ts:Date.now(),fixture_class:'ARTIFICIAL_SAVED_OUTCOME_ROWS_WITH_CACHED_GENUINE_ORIGINAL'}),{flag:'wx',mode:0o600});
globalThis.fetch=()=>{throw Error('REAL_NETWORK_FORBIDDEN');};
const makeStore=async({savedOutcome=outcome,withAnchor=true}={})=>{
 const s=new MemoryStore();await s.set(key,{analysis,input,evidence_class:'OBSERVED'});
 if(withAnchor){await s.set(journalKey,journal);await s.set(signal_id,signal);}
 if(savedOutcome)await s.set('pump:outcome:'+signal_id,savedOutcome);return s;
};
let arms=0;
async function view(s,now=deadline+1000){const before=JSON.stringify([...s.rows]);let reads=0;const out=await readSavedOutcome({store:{get:async k=>{reads++;return s.get(k);}},analysis_key:key,clock:()=>now});assert.equal(JSON.stringify([...s.rows]),before);assert(reads<=4);assert.equal(out.native_PK_reads,reads);arms++;return out;}
const hit=await view(await makeStore());assert.equal(hit.status,'RESULT');assert.equal(hit.outcome.status,'HIT');
const hitText=formatSavedOutcomeView(hit);assert.match(hitText,/достигнута/);assert.match(hitText,/снижение.*неизвестно/);assert.match(hitText,/прибыль пользователя не подтверждены/);
const miss=await view(await makeStore({savedOutcome:{...outcome,status:'MISS',hit_ts:null,coverage:{complete:true,covered_until_ts:deadline},reasons:[],drawdown_total_pct:12}}));assert.equal(miss.outcome.status,'MISS');assert.match(formatSavedOutcomeView(miss),/не достигнута/);
const unknown=await view(await makeStore({savedOutcome:{...outcome,status:'UNKNOWN',hit_ts:null,reasons:['INSUFFICIENT_HISTORY_COVERAGE']}}));assert.equal(unknown.outcome.status,'UNKNOWN');assert.match(formatSavedOutcomeView(unknown),/Исход неизвестен/);
const pending=await view(await makeStore({savedOutcome:null}),T+1000);assert.equal(pending.status,'PENDING');
const absent=await view(await makeStore({savedOutcome:null}));assert.equal(absent.status,'NOT_CHECKED');
const unanchored=await view(await makeStore({withAnchor:false,savedOutcome:null}));assert.equal(unanchored.status,'ANCHOR_PENDING');
const otherStore=await makeStore();const other='pump:analysis:'+'a'.repeat(64);await otherStore.set(journalKey,{frozen_anchor:{...journal.frozen_anchor,analysis_id:other}});await otherStore.set(signal_id,{...signal,analysis_key:other});const otherView=await view(otherStore);assert.equal(otherView.status,'OTHER_ANCHOR');assert.equal(otherView.outcome,null);
const conflict=await view(await makeStore({savedOutcome:{...outcome,t0:T+1}}));assert.equal(conflict.status,'QUARANTINED');
const earlyMiss=await view(await makeStore({savedOutcome:{...outcome,status:'MISS',hit_ts:null,coverage:{complete:true,covered_until_ts:T+1000}}}),T+1000);assert.equal(earlyMiss.status,'QUARANTINED');
let invalidReads=0;await assert.rejects(readSavedOutcome({store:{get:()=>{invalidReads++;}},analysis_key:'pump:resources'}),/EXACT_SAVED_OUTCOME_ORIGINAL_REQUIRED/);assert.equal(invalidReads,0);arms++;


const badNoHit={...outcome,status:'MISS',hit_ts:null,coverage:{complete:false,no_hit_period_covered:true,covered_until_ts:deadline},reasons:[]};
const oldMiss=await beforeReview({store:await makeStore({savedOutcome:badNoHit}),analysis_key:key,clock:()=>deadline+1000});assert.equal(oldMiss.status,'RESULT');arms++;
assert.equal((await view(await makeStore({savedOutcome:badNoHit}))).status,'QUARANTINED');
const validNoHit={...badNoHit,coverage:{...badNoHit.coverage,no_hit_basis:'ENCLOSING_CLOSED_MINUTE_BARS_ALL_HIGHS_BELOW_TARGET'}};
assert.equal((await view(await makeStore({savedOutcome:validNoHit}))).outcome.status,'MISS');
const mapConflict=await makeStore({savedOutcome:{...outcome,map_mode:'WITH_MAP'}});await mapConflict.set(signal_id,{...signal,map_mode:'WITH_MAP'});
assert.equal((await beforeReview({store:mapConflict,analysis_key:key,clock:()=>deadline+1000})).status,'RESULT');arms++;
assert.equal((await view(mapConflict)).status,'QUARANTINED');
const notReadyOrigin={...origin,ready:false},notReadySignal=await makeStore();await notReadySignal.set(signal_id,{...signal,origin:notReadyOrigin});await notReadySignal.set(journalKey,{frozen_anchor:{...journal.frozen_anchor,origin:notReadyOrigin}});
assert.equal((await beforeReview({store:notReadySignal,analysis_key:key,clock:()=>deadline+1000})).status,'RESULT');arms++;
assert.equal((await view(notReadySignal)).status,'QUARANTINED');


const notFrozen=await makeStore();await notFrozen.set(journalKey,{frozen_anchor:{...journal.frozen_anchor,immutable:false}});
assert.equal((await beforeFrozenGuard({store:notFrozen,analysis_key:key,clock:()=>deadline+1000})).status,'RESULT');arms++;
assert.equal((await view(notFrozen)).status,'QUARANTINED');

const baseBytes=fs.readFileSync(a.base_artifact);assert.equal(sha(baseBytes),a.base_artifact_sha256);const base=JSON.parse(baseBytes);
const graph=path.resolve(a.private_graph);fs.mkdirSync(graph,{mode:0o700});
const modules={...base.modules};for(const [n,p]of Object.entries(a.module_overrides))modules[n]=fs.readFileSync(p,'utf8');
for(const [n,s]of Object.entries(modules)){const p=path.resolve(graph,n);assert(p.startsWith(graph+path.sep));fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});fs.writeFileSync(p,s,{flag:'wx',mode:0o600});}
const {createPumpWorker}=await import(pathToFileURL(path.join(graph,'runtime/worker.mjs')));
const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,state TEXT,started_ts INTEGER,measured_rows_read INTEGER,measured_rows_written INTEGER,unknown_ops INTEGER,source_run_id TEXT,measured_requests INTEGER,completed_ts INTEGER); CREATE INDEX idx_report2_runner_budget_day ON report2_runner_budget_ledger_shadow(day_utc); CREATE TABLE pump_report_state_v1(state_key TEXT PRIMARY KEY,value_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated_ts INTEGER NOT NULL);');
const initial=await makeStore(),insert=sql.prepare('INSERT INTO pump_report_state_v1 VALUES(?,?,0,?)');for(const [k,v]of initial.rows)insert.run(k,JSON.stringify(v),Date.now());
let localQueries=0;
const db={prepare(query){
 return {bind(...params){
  return {async all(){
   localQueries++;const st=sql.prepare(query);st.setAllowBareNamedParameters(true);
   const named=Object.fromEntries(params.map((v,i)=>[String(i+1),v]));
   if(st.columns().length)return {success:true,results:st.all(named),meta:{rows_read:1,rows_written:0,changes:0}};
   const r=st.run(named);return {success:true,results:[],meta:{rows_read:1,rows_written:Number(r.changes),changes:Number(r.changes)}};
  }};
 }};
}};
const env={DATA_DB:db,PUMP_CONTROL_KEY:'ARTIFICIAL_PRIVATE_KEY',PUMP_REPORT_ENABLED:'1',PUMP_REPORT_DELIVERY_ENABLED:'1',TELEGRAM_CHAT_ID:'ARTIFICIAL_NEVER_SENT',TELEGRAM_BOT_TOKEN:'ARTIFICIAL_NEVER_USED'};
const worker=createPumpWorker(),call=body=>new Request('https://artificial.invalid/pump/outcome',{method:'POST',headers:{'x-pump-control-key':env.PUMP_CONTROL_KEY,'content-type':'application/json'},body:JSON.stringify(body)});
const badAuth=await worker.fetch(new Request('https://artificial.invalid/pump/outcome',{method:'POST'}),env,{});assert.equal(badAuth.status,401);assert.equal(localQueries,0);arms++;
const badKey=await worker.fetch(call({analysis_key:'pump:resources'}),env,{});assert.equal(badKey.status,400);assert.equal(localQueries,0);arms++;
const unknownParam=await worker.fetch(call({analysis_key:key,publish:true}),env,{});assert.equal(unknownParam.status,400);assert.equal(localQueries,0);arms++;
const beforeRows=sql.prepare('SELECT * FROM pump_report_state_v1 ORDER BY state_key').all();
const response=await worker.fetch(call({analysis_key:key}),env,{}),body=await response.json();
assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.status,'RESULT');assert.equal(body.outcome.status,'HIT');assert.equal(body.native_receipt.state,'FINALIZED');assert.equal(body.native_receipt.reservation_id.startsWith('PUMP:LOOKUP:'),true);assert.match(body.outcome_response_text,/достигнута/);assert(localQueries<=16);assert.deepEqual(sql.prepare('SELECT * FROM pump_report_state_v1 ORDER BY state_key').all(),beforeRows);arms++;
assert.equal(arms,23);sql.close();
const proof={schema:'ROOT_SAVED_OUTCOME_VIEW_CONNECTED_CASE_V3',status:'PASS',case_count:1,arms,fixture_class:'ARTIFICIAL_LOCAL_SQLITE_AND_SAVED_OUTCOME_ROWS_WITH_CACHED_GENUINE_ORIGINAL',cached_baseline_sha256:a.cached_baseline_sha256,worker_graph_base_sha256:a.base_artifact_sha256,local_SQLite_queries:localQueries,worker_requests:4,max_business_PK_reads:4,invalid_auth_or_params_before_SQL:true,old_original_facts_plan_clocks_and_business_rows_unchanged:true,partial_MISS_requires_original_no_hit_basis:true,map_mode_and_ready_origin_bound_to_original:true,before_after_review_counterexamples:4,frozen_anchor_immutable_true_required:true,UNKNOWN_not_changed_to_HIT_or_MISS:true,other_anchor_not_attributed_to_requested_original:true,market_analyze_calls:0,outcome_evaluation_calls:0,actual_native_SQL:0,provider_HTTP:0,Telegram:0,actual_current_AUTO_SENT:false,production_deployed:false};
fs.writeFileSync(a.proof_path,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));
