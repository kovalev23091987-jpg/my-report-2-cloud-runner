import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPumpRunner as proposedRunner} from '../../runtime/runner.mjs';
import {createPumpRunner as baselineRunner} from '../../.private/failure-fairness-20261027/baseline/runtime/runner.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {BudgetRefusal} from '../../runtime/budget.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {createReviewedNativeScopeRegistry} from '../../registry/native-reviewed550.mjs';
import {BINGX_IDENTITY_REGISTRY} from '../../registry/index.mjs';
import {autoRunSummary} from '../../runtime/automatic-summary.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const admit=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const own=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
assert.equal(admit.status,'ADMITTED_ONE_NEW_CONNECTED_FAILURE_FAIRNESS_CASE');
assert.ok(Date.now()<admit.expires_ts&&admit.expires_ts<=own.expires_ts&&own.owner===admit.own_lease.owner&&!own.released);
for(const [p,h]of Object.entries(admit.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
const bytes=fs.readFileSync(admit.private_snapshot);assert.equal(sha(bytes),admit.private_snapshot_sha256);
const actual=JSON.parse(bytes),decision=actual.known_run.candidate_selection[0],T=decision.as_of_ts;
const rows=decision.leaders.slice(0,2);assert.equal(rows[0].instrument_id,'BINGX:USDT_M:104199:SI-USDT');
assert.equal(rows[1].instrument_id,'BINGX:USDT_M:101382:BULLA-USDT');
const registry=createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY);
const instruments=rows.map(r=>registry.resolve({native_symbol:r.instrument_id.split(':').at(-1)}).instrument);
fs.writeFileSync(admit.proof_path+'.attempt',JSON.stringify({state:'ARTIFICIAL_FAILURE_WITH_SAVED_QUEUE_PROJECTION',started_ts:Date.now(),real_IO:0}),{flag:'wx',mode:0o600});
globalThis.fetch=()=>{throw Error('NO_REAL_NETWORK_IN_FAIRNESS_CASE');};

async function run(makeRunner,kind){
 let now=T,allowed=0,sourceCalls=[],engineCalls=0,firstResult;
 const store=new MemoryStore();if(kind==='NATIVE_UNKNOWN')store.usage=()=>({unknown_ops:1});
 const queue=Object.fromEntries(rows.map(r=>[r.instrument_id,{instrument_id:r.instrument_id,first_seen:r.first_seen,last_checked_ts:r.last_checked_ts,next_check_ts:r.next_check_ts,movement_event_ts:r.movement_event_ts,preliminary_growth:r.preliminary_growth_pct,reported_day_growth:r.reported_day_growth_pct,active_wave:r.active_wave,entry_zones:[]} ]));
 await store.set('pump:candidate-queue',queue);await store.set('pump:resources',actual.project_resources);
 const terminal={wave_id:'ARTIFICIAL_TERMINAL_UNCHANGED',state:'CANCELLED',created_ts:T-18000000,expires_ts:T-3600000};
 await store.set('pump:wave:'+rows[0].instrument_id,terminal);
 // Synthetic source prices reproduce only the saved discovery percentages.
 // They are artificial transport fixtures, never asserted as market evidence.
 const oldSlot=Math.floor(T/60000)*60000-60000;
 await store.set('pump:overview-index',[oldSlot]);
 await store.set('pump:overview:'+oldSlot,rows.map(r=>({id:r.instrument_id,last:100/(1+r.preliminary_growth_pct/100),event_ts:oldSlot,status:'USABLE'})));
 const sources={
  getCatalog:async()=>({instruments,unqualified:[],coverage:{status:'CHECKED'}}),
  getOverview:async({instruments:list})=>({observations:list.map(i=>({instrument:i,reported_change_pct:rows.find(r=>r.instrument_id===i.instrument_id).reported_day_growth_pct,facts:{price:{status:'USABLE',instrument_id:i.instrument_id,value:100,unit:'USDT_PER_BASE',event_ts:now,received_ts:now,expires_ts:now+30000}}})),coverage:{status:'CHECKED'}}),
  getCore:async({instrument})=>{sourceCalls.push(instrument.instrument_id);if(kind==='GLOBAL')throw new BudgetRefusal('PROVIDER_BACKOFF');throw Object.assign(Error('ARTIFICIAL_SOURCE_CORE_FAILURE'),{code:'ARTIFICIAL_SOURCE_CORE_FAILURE'});}
 };
 let mode='AUTO';
 const budget={setMode:m=>{mode=m;},admitCandidate:async()=>{allowed++;return kind==='NOT_ADMITTED'||allowed%2===0?{allowed:false,reason:'PROTECTED_DAY_RESERVE',detail:'ARTIFICIAL_STOP_AFTER_ONE_ATTEMPT'}:{allowed:true};},summary:()=>({mode,total:0,lanes:{hot:0},limits:{manual_http_run_reserve:0,http_per_run:164,lanes:{hot:164}}})};
 const delivery={pending:async()=>[],drain:async()=>[],dispatch:async()=>{assert.fail('NO_SEND_IN_FAILURE_CASE');}};
 const runner=makeRunner({store,sources,budget,delivery,profile:START_PROFILE,clock:()=>now,await_source_window:async()=>{if(kind==='SOURCE_WINDOW')throw Error('ARTIFICIAL_SOURCE_WINDOW_FAILURE');},analyzePump:()=>{engineCalls++;assert.fail('NO_ANALYSIS_FROM_ARTIFICIAL_FAILURE');},evaluateOutcome:()=>{assert.fail('NO_OUTCOME_FROM_ARTIFICIAL_FAILURE');}});
 firstResult=await runner.execute({mode:'AUTO',run_id:'ARTIFICIAL_FAILURE_FIRST',publish:false});
 const afterFirst=await store.get('pump:candidate-queue');
 assert.equal(afterFirst[rows[0].instrument_id].last_checked_ts,rows[0].last_checked_ts,'failure is not a completed analysis');
 assert.equal(afterFirst[rows[0].instrument_id].movement_event_ts,rows[0].movement_event_ts,'no source clock rewrite');
 assert.deepEqual(await store.get('pump:wave:'+rows[0].instrument_id),terminal,'no terminal revival');
 assert.deepEqual(await store.get('pump:resources'),actual.project_resources,'old spends and all holds retained');
 if(kind!=='NOT_ADMITTED'){
  now+=START_PROFILE.candidate_recheck_ms;allowed=0;
  await runner.execute({mode:'AUTO',run_id:'ARTIFICIAL_FAILURE_SECOND',publish:false});
 }
 assert.equal(engineCalls,0);
 return {sourceCalls,failed_ts:afterFirst[rows[0].instrument_id].last_failed_admitted_attempt_ts??null,firstResult};
}

const baseline=await run(baselineRunner,'LOCAL');
assert.deepEqual(baseline.sourceCalls,[rows[0].instrument_id,rows[0].instrument_id],JSON.stringify(baseline.firstResult));
const proposal=await run(proposedRunner,'LOCAL');
assert.deepEqual(proposal.sourceCalls,[rows[0].instrument_id,rows[1].instrument_id]);assert.equal(proposal.failed_ts,T);
const globalFailure=await run(proposedRunner,'GLOBAL');assert.equal(globalFailure.failed_ts,null);
const noAdmission=await run(proposedRunner,'NOT_ADMITTED');assert.equal(noAdmission.failed_ts,null);assert.equal(noAdmission.sourceCalls.length,0);
const nativeUnknown=await run(proposedRunner,'NATIVE_UNKNOWN');assert.equal(nativeUnknown.failed_ts,null);
const sourceWindow=await run(proposedRunner,'SOURCE_WINDOW');assert.equal(sourceWindow.failed_ts,null);assert.equal(sourceWindow.sourceCalls.length,0);
const summary=autoRunSummary(proposal.firstResult,'1'.repeat(64));
assert.deepEqual(summary.candidate_failures,[{instrument_id:rows[0].instrument_id,failure_stage:'SOURCE_CORE',error_type:'Error',failed_admitted_attempt:true}]);
assert.equal(summary.counts.analysis_results,0);assert.equal(summary.delivery.reported_occurrences,0);
const result={schema:'ROOT_FAILED_ADMITTED_FAIRNESS_AFFECTED_CASE_V1',status:'PASS',cases:1,arms:6,original_snapshot_sha256:admit.private_snapshot_sha256,observed_run_id:actual.known_run_id,source_evidence:'OBSERVED_QUEUE_PROJECTION_PLUS_EXPLICIT_ARTIFICIAL_FAILURE_AND_PRICES',historical_SI_exception_claimed:false,baseline_selected:baseline.sourceCalls,proposal_selected:proposal.sourceCalls,global_budget_failure_not_penalized:globalFailure.failed_ts===null,nonadmitted_not_penalized:noAdmission.failed_ts===null,native_unknown_and_source_window_not_penalized:nativeUnknown.failed_ts===null&&sourceWindow.failed_ts===null,last_checked_source_clocks_terminal_state_and_all_resource_records_preserved:true,safe_failure_stage_in_summary:true,engine_calls:0,real_HTTP:0,native_SQL:0,Telegram:0,production_deployed:false};
fs.writeFileSync(admit.proof_path,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));
