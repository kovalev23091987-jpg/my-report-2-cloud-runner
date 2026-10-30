import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const a=read(process.argv[2]),own=read('checkpoints/CLOUD_PHASE_STATE_20261004.json').lease;
assert.equal(a.status,'ADMITTED_ONE_QUEUE_INITIAL_SEED_CASE_AND_BUILD');
assert(a.max_cases===1&&a.max_builds===1&&a.Node_processes===1);
assert(own.owner===a.own_lease.owner&&!own.released&&Date.now()<a.expires_ts&&a.expires_ts<=own.expires_ts);
for(const [p,h]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
fs.writeFileSync(a.output+'.attempt',JSON.stringify({started_ts:Date.now(),authority_main:a.authority_main,Node:1,real_IO:0}),{flag:'wx',mode:0o600});
globalThis.fetch=()=>{throw Error('OFFLINE_NO_REAL_FETCH');};
const report={schema:'ROOT_QUEUE_INITIAL_SEED_CONNECTED_CASE_V1',status:'STARTED',authority_main:a.authority_main,
  case_count:1,Node_processes:1,engine_calls:0,pure_movement_calls:0,runner_executions:0,builds:0,mock_controller_calls:0,
  native_SQL:0,Cloudflare_HTTP:0,market_HTTP:0,Telegram:0,installed:false,real_AUTO_SENT:false,stages:[]};
const save=()=>fs.writeFileSync(a.output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
const mark=(stage,data={})=>{report.stages.push({stage,...data});save();};
let stage='SNAPSHOT';
try{
  const base=read(a.base_artifact),proposed={...base.modules};
  assert.equal(base.manifest.module_count,76);assert.equal(base.manifest.implementation_pin.sha256,a.base_live_pin);
  for(const [name,entry]of Object.entries(a.proposed_sources)){
    const s=fs.readFileSync(entry.path,'utf8');assert.equal(sha(s),entry.sha256,name);proposed[name]=s;
  }
  for(const [label,modules]of [['baseline',base.modules],['proposed',proposed]]){
    const dir=path.resolve(a.private_case_dir,label);fs.mkdirSync(dir,{recursive:true,mode:0o700});
    for(const [name,text]of Object.entries(modules)){
      const p=path.resolve(dir,name);assert(p.startsWith(dir+path.sep));fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});
      fs.writeFileSync(p,text,{flag:'wx',mode:0o600});
    }
  }
  const load=(label,name)=>import(pathToFileURL(path.resolve(a.private_case_dir,label,name)).href);
  const [oldModel,newModel,{START_PROFILE:profile},{MemoryStore},{createPumpRunner:oldRunner},{createPumpRunner:newRunner},
    {createReviewedNativeScopeRegistry},{BINGX_IDENTITY_REGISTRY},{candidatePriority}]=await Promise.all([
    load('baseline','analytics/index.mjs'),load('proposed','analytics/index.mjs'),load('baseline','profile/start-v1.mjs'),
    load('baseline','runtime/store.mjs'),load('baseline','runtime/runner.mjs'),load('proposed','runtime/runner.mjs'),
    load('baseline','registry/native-reviewed550.mjs'),load('baseline','registry/index.mjs'),load('baseline','runtime/candidate-priority.mjs')]);
  const actual=read(a.actual_packet),events=read(a.actual_log_packet).events;
  const original=id=>actual.latest_candidates.find(c=>c.instrument_id.endsWith(':'+id+'-USDT')).private_evidence.original;
  const idol=original('IDOL'),init=original('INIT');
  const call=(model,input)=>{assert(report.engine_calls<a.max_engine_calls);report.engine_calls++;return model.analyzePump(structuredClone(input));};
  const sameExceptRules=(x,y)=>assert.deepEqual({...x,rules_version:y.rules_version},y);

  stage='ACTUAL_FIRST_IDOL_SEED';
  assert.equal(idol.input.previous_wave,null);
  const oldIdol=call(oldModel,idol.input);assert.deepEqual(oldIdol,idol.analysis);
  assert.deepEqual(oldIdol.reasons,['PLAN_INVALIDATED']);
  const newIdol=call(newModel,idol.input);
  assert.equal(newIdol.next_wave.impulse.start_ts,1793254200000);
  assert.equal(newIdol.next_wave.impulse.end_ts,1793254500000);
  assert.equal(newIdol.next_wave.impulse.low,0.01235);
  assert(Math.abs(newIdol.next_wave.impulse.ratio-2.332643025195846)<1e-12);
  assert(!['CANCELLED','EXPIRED'].includes(newIdol.wave_state));
  assert.equal(newIdol.next_wave.created_ts,idol.input.analysis_ts);
  assert.equal(newIdol.next_wave.expires_ts-newIdol.next_wave.created_ts,profile.wave_max_age_ms);
  assert.equal(newIdol.rules_version,'pump-analytics-v7-initial-seed-20261029');
  mark(stage,{old_state:oldIdol.wave_state,new_state:newIdol.wave_state,new_ready:newIdol.ready,
    new_reasons:newIdol.reasons,new_plan_minimum:newIdol.plan?.potential_pct?.minimum??null,
    counterfactual:true,not_a_new_native_event:true,original_facts_and_clocks_unchanged:true});

  stage='ACTUAL_RETAINED_INIT_UNCHANGED';
  assert(init.input.previous_wave!==null);const newInit=call(newModel,init.input);sameExceptRules(newInit,init.analysis);
  mark(stage,{same_except_rules_version:true,target_min10_and_existing_previous_wave_unchanged:true});

  stage='NARROW_FIRST_NULL_COLD_FALLBACK';
  // An explicitly controlled single-pulse path: every volume-qualified seed
  // is subsequently breached, but the first confirmed structural base holds.
  // Actual F610 has nine intact candidates and is intentionally NOT used to
  // pretend this guard was observed in that historical manual event.
  const cold=structuredClone(idol.input),minute=60000,end=Math.floor(cold.analysis_ts/minute)*minute;
  const prototype=cold.facts.candles.value[0],coldRows=[];let prior=100;
  for(let n=0;n<125;n++){
    const close=n<70?100+0.2*Math.sin(n*Math.PI/3):n<75?100+(n-69)*6:n<85?129:n<90?125:n===90?95:n===91?100:n===92?110:n===93?120:132+(n-94)*0.1;
    const row={...structuredClone(prototype),open_ts:end-(125-n)*minute,close_ts:end-(124-n)*minute,
      open:prior,close,high:Math.max(prior,close)+0.5,low:n===90?90:Math.min(prior,close)-0.5,
      volume_native:n>=70&&n<75?5000:n>=75?200:1000,volume_base:null,turnover_quote:null};
    if(n===60)row.high=104;
    coldRows.push(row);prior=close;
  }
  cold.previous_wave=null;cold.facts.candles={...cold.facts.candles,value:coldRows,fact_id:'ARTIFICIAL_COLD_FALLBACK_ONLY',
    event_ts:end,received_ts:cold.analysis_ts,expires_ts:cold.analysis_ts+90000,evidence_ref:'ARTIFICIAL_ONLY_NO_MARKET_CLAIM'};
  const [{analyzeMovement:oldMovement},{analyzeMovement:newMovement}]=await Promise.all([
    load('baseline','analytics/movement.mjs'),load('proposed','analytics/movement.mjs')]);
  report.pure_movement_calls++;
  const beforeCold=oldMovement(cold,coldRows,prior,null,profile);
  report.pure_movement_calls++;
  const afterCold=newMovement(cold,coldRows,prior,null,profile);
  assert(report.pure_movement_calls<=a.max_pure_movement_calls);
  assert(beforeCold.active&&beforeCold.next_wave?.cold_first_structural_base,'CONTROLLED_GUARD_MUST_EXERCISE_VIABLE_COLD_BASE');
  assert.deepEqual(afterCold,beforeCold);
  mark(stage,{same_movement_result:true,state:beforeCold.state,active:beforeCold.active,
    controlled_ohlc_quantity_previous_null:true,not_F610_or_actual_market_event:true,old_full_BY_suite_not_repeated:true});

  stage='REAL_QUEUE_COMPETITION_WITH_PROTECTED_BUDGET';
  const diagnostic=events.find(e=>e.summary?.run_id==='f9a691bf-4adc-4514-bfa6-2371d8265090').summary.candidate_diagnostics.decisions[0];
  const T=diagnostic.as_of_ts,ids=diagnostic.leaders.map(r=>r.instrument_id),registry=createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY);
  const instruments=Object.fromEntries(ids.map(id=>{const e=registry.resolve({native_symbol:id.split(':').at(-1)});assert.equal(e.instrument.instrument_id,id);return [id,e.instrument];}));
  const gpsol=ids.find(id=>id.endsWith(':GPSOL-USDT')),dacity=ids.find(id=>id.endsWith(':DACITY-USDT')),
    veil=ids.find(id=>id.endsWith(':VEIL-USDT')),iid=ids.find(id=>id.endsWith(':INIT-USDT')),idolId=ids.find(id=>id.endsWith(':IDOL-USDT'));
  const projected=Object.fromEntries(diagnostic.leaders.map(r=>[r.instrument_id,{
    instrument_id:r.instrument_id,first_seen:r.first_seen,last_checked_ts:r.last_checked_ts,next_check_ts:r.next_check_ts,
    active_wave:r.active_wave,preliminary_growth:r.preliminary_growth_pct,reported_day_growth:r.reported_day_growth_pct,
    movement_event_ts:r.movement_event_ts,price_expires_ts:r.price_expires_ts,entry_distance_pct:null,confirmed_core_count:0
  }]));
  for(const r of diagnostic.leaders)assert(Math.abs(candidatePriority(projected[r.instrument_id],T,{profile}).score-r.score)<1e-9);
  async function run(make,kind){
    assert(report.runner_executions<5);report.runner_executions++;
    const store=new MemoryStore(),q=structuredClone(projected),recorded=[],baselineResources=structuredClone(actual.project_resources);
    let catalog=ids.filter(id=>id!==gpsol),coreCalls=0;
    if(kind==='NEAR_ONLY_FALLBACK')catalog=[dacity];
    if(kind==='STALE_STRONG_HINTS'){q[veil].price_expires_ts=T-1;q[idolId].price_expires_ts=T-1;}
    if(kind==='FRESH_SOURCE_INELIGIBLE_LEADER'){q[gpsol].price_expires_ts=T+30000;catalog=ids;}
    await store.set('pump:candidate-queue',q);await store.set('pump:active-instruments',[]);await store.set('pump:resources',baselineResources);
    const sources={getCatalog:async()=>({instruments:catalog.map(id=>instruments[id]),unqualified:[],coverage:{status:'CHECKED',scope:'CONTROLLED_FROZEN_CATALOG'}}),
      getOverview:async()=>({observations:[],coverage:{status:'CHECKED',scope:'CONTROLLED_EMPTY_DISCOVERY_PRESERVES_QUEUE_PROJECTION'}}),
      getCore:async()=>{coreCalls++;assert.fail('NO_CORE_BEFORE_POSITIVE_BUDGET');}};
    const budget={setMode:()=>{},admitCandidate:async x=>{recorded.push(x);return {allowed:false,reason:'PROTECTED_DAY_RESERVE',detail:'CONTROLLED_UNCHANGED_REFUSAL'};},
      summary:()=>({total:0,lanes:{hot:0},limits:{manual_http_run_reserve:0,http_per_run:164,lanes:{hot:164}}})};
    const delivery={pending:async()=>[],drain:async()=>[],enqueue:()=>assert.fail('NO_READY_FIXTURE'),dispatch:()=>assert.fail('NO_SEND')};
    const runner=make({store,sources,budget,delivery,profile,clock:()=>T,analyzePump:()=>assert.fail('NO_ENGINE_BEFORE_POSITIVE_BUDGET'),
      evaluateOutcome:()=>assert.fail('NO_OUTCOME'),assess_source_evidence:i=>({eligible:i.instrument_id!==gpsol})});
    const result=await runner.execute({mode:'AUTO',run_id:'CONTROLLED_QUEUE_'+kind,publish:false});
    assert.equal(recorded.length,1);assert.equal(coreCalls,0);assert.equal(result.checked.length,0);
    assert.equal(recorded[0].http_upper_bound,12);assert.deepEqual(await store.get('pump:resources'),baselineResources);
    return {kind,selected:recorded[0].candidate_id,budget_refusal_unchanged:true,core_calls:coreCalls};
  }
  const queueResults=[await run(oldRunner,'ACTUAL_OLD_ORDER'),await run(newRunner,'PROPOSED_ORDER'),await run(newRunner,'NEAR_ONLY_FALLBACK'),
    await run(newRunner,'STALE_STRONG_HINTS'),await run(newRunner,'FRESH_SOURCE_INELIGIBLE_LEADER')];
  assert.equal(queueResults[0].selected,dacity);assert.equal(queueResults[1].selected,veil);assert.equal(queueResults[2].selected,dacity);
  assert.equal(queueResults[3].selected,iid);assert.equal(queueResults[4].selected,veil);
  mark(stage,{results:queueResults,real_leader_projection_only:true,queue_metadata_omissions_and_controlled_variants_explicit:true,
    source_ineligible_GPSOL_is_controlled_variant:true,no_immutable_originals_or_resources_rewritten:true});

  stage='ONE_ARTIFACT_BUILD';
  const {buildArtifact}=await import('../../runtime/build.mjs');
  const legacy=a.artifact_output+'.legacy';fs.writeFileSync(legacy,base.modules['legacy-worker.mjs'],{flag:'wx',mode:0o600});
  assert(!fs.existsSync(a.artifact_output));report.builds++;assert.equal(report.builds,1);
  const manifest=buildArtifact({legacy_path:legacy,output_path:a.artifact_output,module_overrides:proposed}),artifactBytes=fs.readFileSync(a.artifact_output),artifact=JSON.parse(artifactBytes);
  const changed=Object.keys(artifact.modules).filter(n=>artifact.modules[n]!==base.modules[n]).sort();
  assert.deepEqual(changed,['analytics/index.mjs','analytics/movement.mjs','runtime/implementation-pin.mjs','runtime/runner.mjs']);
  assert.equal(manifest.module_count,76);assert.deepEqual(artifact.metadata,base.metadata);
  for(const [name,entry]of Object.entries(a.proposed_sources))assert.equal(sha(artifact.modules[name]),entry.sha256,name);

  stage='EXACT_FOUR_DELTA_CONTROLLER_MOCK';
  const template=fs.readFileSync(a.controller_template,'utf8'),accountId='70ee0af85191ea470e74c7383fdec772';
  let mockModules=structuredClone(base.modules),mutations=0;
  const settings={bindings:[{name:'PUMP_REPORT_ENABLED',type:'plain_text',text:'0'},{name:'PUMP_REPORT_DELIVERY_ENABLED',type:'plain_text',text:'1'},
    {name:'DATA_DB',type:'d1',id:'057a2847-2cc4-4e52-8534-1be1596d21d5'},...Array.from({length:18},(_,i)=>({name:'MOCK_KEEP_'+i,type:'plain_text',text:'UNCHANGED'}))],compatibility_date:'2026-09-11',compatibility_flags:[]};
  const settingsBefore=structuredClone(settings),boundary='----QUEUE_INITIAL_SEED_OFFLINE';
  const multipart=value=>Object.entries(value).map(([name,text])=>'--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"; filename="'+name+'"\r\nContent-Type: application/javascript+module\r\n\r\n'+text+'\r\n').join('')+'--'+boundary+'--\r\n';
  const cloudflare={async request(request){
    report.mock_controller_calls++;
    if(request.method==='GET')return {status:200,success:true,result:request.path.endsWith('/settings')?structuredClone(settings):request.path.endsWith('/schedules')?{schedules:request.path.includes('/my-report-2-hub/')?[{cron:'*/5 7-16 * * *'}]:[]}:multipart(mockModules)};
    assert.equal(request.method,'PUT');assert(request.path.endsWith('/my-report-2-hub/content'));assert.equal(request.rawBody,true);mutations++;
    const b=request.body.slice(0,request.body.indexOf('\r\n')),parts={};
    for(const part of request.body.split(b).slice(1,-1)){const split=part.indexOf('\r\n\r\n'),name=part.slice(0,split).match(/\bname="([^"]+)"/)[1];parts[name]=part.slice(split+4,-2);}
    assert.deepEqual(JSON.parse(parts.metadata),{main_module:'worker-entry.mjs'});delete parts.metadata;mockModules=parts;
    return {status:200,success:true,result:{}};
  }};
  const hashes=m=>Object.fromEntries(Object.entries(m).map(([n,s])=>[n,sha(s)]));
  const config={schema:'ROOT_PRODUCTION_CONTROL_PLANE_ADMISSION_V1',status:'ADMITTED_NOT_SPENT',maximum_attempts:1,
    action:'INSTALL',authority_main:a.authority_main,issued_ts:Date.now(),expires_ts:a.expires_ts,own_lease:a.own_lease,admin_HTTP_max:11,
    before_modules_sha256:hashes(base.modules),after_modules_sha256:hashes(artifact.modules),before_pin:a.base_live_pin,after_pin:manifest.implementation_pin.sha256,
    before_artifact_sha256:sha(fs.readFileSync(a.base_artifact)),after_artifact_sha256:sha(artifactBytes),after_rules_version:'pump-analytics-v7-initial-seed-20261029',main_module:artifact.metadata.main_module,install_module_overrides:Object.fromEntries(changed.map(n=>[n,artifact.modules[n]])),
    quiescence:{state:'FINALIZED',observation_status:'QUIESCENT_CODE_UPDATE_ALLOWED',executor_owner:null,implementation_sha256:a.base_live_pin,observed_ts:Date.now()}};
  const controller=Function('cloudflare','accountId','return ('+template.replace('__PUMP_CONFIG__',()=>JSON.stringify(config))+');')(cloudflare,accountId);
  const proof=await controller();assert.equal(proof.state,'CONFIRMED_FULL',proof.error);
  assert.equal(report.mock_controller_calls,11);assert.equal(mutations,1);assert.deepEqual(mockModules,artifact.modules);assert.deepEqual(settings,settingsBefore);
  assert(Date.now()<a.expires_ts);
  Object.assign(report,{status:'PASS',artifact_path:a.artifact_output,artifact_sha256:sha(artifactBytes),implementation_sha256:manifest.implementation_pin.sha256,
    module_count:76,changed_modules:changed.map(n=>({name:n,sha256:sha(artifact.modules[n])})),unchanged_modules:72,
    profile_thresholds_caps_manual3_holds_legacy_schedules_unchanged:true,target_policy_unchanged_pending_owner:true,
    case_does_not_prove_current_native_READY_or_delivery:true,only_pin_self_generated_after_tested_graph:true});
  mark('COMPLETE');console.log(JSON.stringify(report));
}catch(error){
  Object.assign(report,{status:'FAILED_PRESERVED_NO_AUTO_RETRY',failed_stage:stage,error_type:error.name,error_message:String(error.message).slice(0,240)});
  save();console.log(JSON.stringify({status:report.status,stage,error_type:error.name,message:String(error.message).slice(0,240),engine_calls:report.engine_calls,builds:report.builds}));process.exitCode=1;
}
