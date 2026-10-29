import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),actualNow=Date.now();
assert.equal(a.status,'ADMITTED_ONE_AFFECTED_OFFLINE_CASE');
assert(actualNow<a.expires_ts&&a.expires_ts<=a.own_lease.expires_ts);
assert.equal(sha(fs.readFileSync(process.argv[1])),a.script_sha256);
const phase=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8'));
assert.equal(phase.lease.owner,a.own_lease.owner);assert.notEqual(phase.lease.released,true);
for(const [p,h]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
const baseBytes=fs.readFileSync(a.base_artifact_file);assert.equal(sha(baseBytes),a.base_artifact_sha256);
const base=JSON.parse(baseBytes);assert.equal(base.manifest.implementation_pin.sha256,a.base_pin);
fs.mkdirSync(a.output_dir,{recursive:true,mode:0o700});
const attempt=path.join(a.output_dir,'attempt.json'),fd=fs.openSync(attempt,'wx',0o600);
const proof={schema:'ROOT_SURPLUS_CAUSE_AFFECTED_CASE_V1',state:'ATTEMPTED',authority_main:a.authority_main,evidence_class:'ARTIFICIAL_OFFLINE_ACCEPTANCE_TEST',Node:1,build:0,engine:0,budget_comparisons:0,runner_comparisons:0,projection_guards:0,market_HTTP:0,Telegram:0,native_SQL:0,Cloudflare:0,deployed:false};
const save=()=>{fs.ftruncateSync(fd,0);fs.writeSync(fd,JSON.stringify(proof,null,2)+'\n',0,'utf8');fs.fsyncSync(fd);};save();
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('REAL_HTTP_FORBIDDEN');};
try{
  const {buildArtifact}=await import(pathToFileURL(path.resolve('pump-report/runtime/build.mjs')));
  const legacy=path.join(a.output_dir,'legacy-base.mjs');fs.writeFileSync(legacy,base.modules['legacy-worker.mjs'],{flag:'wx',mode:0o600});
  const overrides={...base.modules};for(const p of a.changed_modules)overrides[p]=fs.readFileSync('pump-report/'+p,'utf8');
  const artifactFile=path.join(a.output_dir,'artifact.json');const manifest=buildArtifact({legacy_path:legacy,output_path:artifactFile,module_overrides:overrides});proof.build=1;save();
  const artifactBytes=fs.readFileSync(artifactFile),artifact=JSON.parse(artifactBytes),changed=Object.keys(artifact.modules).filter(p=>artifact.modules[p]!==base.modules[p]).sort();
  assert.equal(manifest.module_count,78);assert.deepEqual(changed,[...a.changed_modules,'runtime/implementation-pin.mjs'].sort());
  const unchanged=Object.keys(base.modules).filter(p=>artifact.modules[p]===base.modules[p]);assert.equal(unchanged.length,73);
  proof.artifact={path:artifactFile,sha256:sha(artifactBytes),implementation_sha256:manifest.implementation_pin.sha256,module_count:78,changed,unchanged:73,module_sha256:Object.fromEntries(Object.entries(artifact.modules).map(([n,s])=>[n,sha(s)]))};save();
  const trees={};for(const [label,art]of Object.entries({before:base,after:artifact})){
    const dir=path.join(a.output_dir,label);for(const [name,source]of Object.entries(art.modules)){const p=path.join(dir,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,source,{flag:'wx',mode:0o600});}
    const read=n=>import(pathToFileURL(path.join(dir,n)));
    trees[label]={...(await read('runtime/budget.mjs')),...(await read('runtime/store.mjs')),...(await read('runtime/production-policy.mjs')),...(await read('runtime/runner.mjs')),...(await read('runtime/automatic-summary.mjs')),...(await read('runtime/candidate-diagnostics.mjs')),...(await read('contracts/index.mjs'))};
  }
  const now=Date.parse('2026-10-29T12:30:00Z'),day='2026-10-29',period=Date.parse('2026-10-29T12:00:00Z'),id='00000000-0000-4000-8000-000000000001',candidate='BINGX:USDT_M:123:TEST-USDT';
  const policy={version:'pump-unassigned-candidate-hold-v1',enabled:true,activation_decision_ref:'ARTIFICIAL_EXISTING_APPROVAL',max_grants_per_day:24,max_grants_per_run:1,max_retained_records:200,native_remaining_floor:{requests:600,rows_read:600,rows_written:140}};
  const strip=v=>Array.isArray(v)?v.map(strip):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>k!=='surplus_limit').map(([k,w])=>[k,strip(w)])):v;
  const grantsFor=c=>{const grants={};for(let i=0;i<c.total;i++){
    const today=i<c.today,run=c.sameRun&&i===0?id:'other-'+i,coin=c.existing&&i===0?candidate:'BINGX:USDT_M:'+(1000+i)+':OTHER'+i+'-USDT',d=today?day:'2026-10-28',created=today?now-60000:Date.parse(d+'T12:00:00Z');
    grants[run+'|'+coin]={version:policy.version,run_id:run,candidate_id:coin,day:d,state:c.existing&&i===0?c.existing:'CLOSED',created_ts:created,original_http:12,remaining_http:11,consumed_http:1,
      original_by_provider:{BINGX:10,TELEGRAM:1},remaining_by_provider:{BINGX:9,TELEGRAM:1},consumed_by_provider:{BINGX:1,TELEGRAM:0},logical_spent:true,activation_decision_ref:policy.activation_decision_ref,native_evidence_ref:'ARTIFICIAL#PUMP:AUTO:'+run,native_expires_ts:created+900000,hold_until_ts:Date.parse(d+'T00:00:00Z')+86400000,closed_ts:created+1,unused_hold_retained_until:Date.parse(d+'T00:00:00Z')+86400000};
  }return grants;};
  async function fixture(t,c){
    const store=new t.MemoryStore(),counts={get:0,atomic:0};const get=store.get.bind(store),atomic=store.atomic.bind(store);
    store.get=async k=>{counts.get++;return get(k);};store.atomic=async(k,fn)=>{counts.atomic++;return atomic(k,fn);};
    const state={schema:'PUMP_SHARED_RESOURCE_V1',days:{[day]:0,'2026-10-28':50},providers:{BINGX:{days:{[day]:0,'2026-10-28':50},months:{'2026-10':50}},TELEGRAM:{days:{[day]:0},months:{'2026-10':0}}},outstanding:{},unknown:{OLD_UNKNOWN:{cost:1}},automatic_surplus_grants:grantsFor(c),
      automatic_plans:{[day]:{schema:'PUMP_PLANNED_AUTOMATIC_DAY_V1',day,created_ts:now,baseline_charged:0,protected_at_creation:102,fraction:0.8,limit:638,charged:0}},
      automatic_candidate_allocations:{[day]:{version:'pump-even-day-deep-v2',created_ts:now,first_period:String(period),remaining_periods:5,http_upper_bound:12,http_by_provider:{BINGX:10,TELEGRAM:1},candidates_per_period:3,baseline_auto_charged:0}},
      automatic_deep_pacing:{[day]:{[String(period)]:{version:'pump-even-day-deep-v2',day,key:String(period),created_ts:now,limit:36,charged:0,candidate_count:c.baseAvailable?0:3,carried_in:0,maximum:3,issued_before:0}}}};
    await store.set('pump:resources',state);
    store.admission={evidence_ref:'ARTIFICIAL#PUMP:AUTO:'+id,expires_ts:now+840000,max_requests:800,max_rows_read:5000,max_rows_written:300};
    store.finalization_reserve={requests:2,rows_read:2,rows_written:1};store.usage=()=>({requests:c.lowNative?300:0,rows_read:0,rows_written:0,unknown_ops:0});
    const policies={BINGX:{version:'ARTIFICIAL',evidence_ref:'ARTIFICIAL',project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10,per_second_cap:1},TELEGRAM:{version:'ARTIFICIAL',evidence_ref:'ARTIFICIAL',project_daily_cap:47,project_monthly_cap:1457,per_minute_cap:10,delivery_source:false,outcome_source:false}};
    const admission={provider_policy_version:'ARTIFICIAL',expires_ts:now+900000,run_purpose:'PRODUCTION',planned_load_fraction:0.8,candidate_pacing:t.PRODUCTION_PLAN.candidate_pacing,future_candidates:t.PRODUCTION_PLAN.future_candidates,candidate_surplus:policy};
    const budget=t.createUnifiedBudget({store,run_id:id,mode:'AUTO',clock:()=>now,policies,protected_reserves:{http_by_provider:{BINGX:54,TELEGRAM:0},delivery_http:24,outcomes_http:24},admission});
    counts.get=0;counts.atomic=0;return{store,budget,counts,state};
  }
  const cases=[
    {name:'saved58_current5_same_run_only',total:58,today:5,sameRun:true,expect:['SAME_RUN_GRANT_LIMIT']},
    {name:'daily24_without_history_limit',total:28,today:24,expect:['UTC_DAY_GRANT_LIMIT']},
    {name:'retained200_without_daily_or_run',total:200,today:5,expect:['RETAINED_RECORD_LIMIT']},
    {name:'all_three_causes',total:200,today:24,sameRun:true,expect:['RETAINED_RECORD_LIMIT','UTC_DAY_GRANT_LIMIT','SAME_RUN_GRANT_LIMIT']},
    {name:'new_surplus_still_allowed',total:58,today:0,expect:null},
    {name:'open_idempotent',total:1,today:1,sameRun:true,existing:'OPEN',expect:null},
    {name:'closed_not_reissued',total:1,today:1,sameRun:true,existing:'CLOSED',expect:null},
    {name:'unknown_not_reissued',total:1,today:1,sameRun:true,existing:'UNKNOWN',expect:null},
    {name:'native_capacity_refusal_unchanged',total:58,today:0,lowNative:true,expect:null},
    {name:'base_admission_not_blocked_by200',total:200,today:5,baseAvailable:true,expect:null}
  ];
  proof.cases=[];
  for(const c of cases){
    const b=await fixture(trees.before,c),n=await fixture(trees.after,c),args={candidate_id:candidate,http_upper_bound:12,http_by_provider:{BINGX:10,TELEGRAM:1}};
    const old=await b.budget.admitCandidate(args),next=await n.budget.admitCandidate(args);
    assert.deepEqual(strip(next),old,c.name+' primaryresult');
    const beforeState=await b.store.get('pump:resources'),afterState=await n.store.get('pump:resources');assert.deepEqual(afterState,beforeState,c.name+' state');assert.deepEqual(n.counts,b.counts,c.name+' storecalls');
    if(c.expect){assert.deepEqual(next.surplus_limit.reasons,c.expect);assert.deepEqual(afterState,n.state);assert(Buffer.byteLength(JSON.stringify(next.surplus_limit))<=512);}
    else assert(!next.surplus_limit);
    if(c.name==='new_surplus_still_allowed'||c.name==='open_idempotent'||c.baseAvailable)assert.equal(next.allowed,true);
    else assert.equal(next.allowed,false);
    const summary=trees.after.autoRunSummary({run_id:id,status:'INCOMPLETE',checked:[],manual:[],delivery:[],errors:[],deferred:[{instrument_id:candidate,source_coverage:{status:'NOT_CHECKED',reason:next.reason,detail:next.detail,surplus_limit:next.surplus_limit}}]},manifest.implementation_pin.sha256);
    if(c.expect)assert.deepEqual(summary.candidate_diagnostics.deferred[0].surplus_limit,next.surplus_limit);
    else assert(!summary.candidate_diagnostics.deferred[0].surplus_limit);
    proof.cases.push({name:c.name,primary_result_and_state_and_storecalls_equal:true,allowed:next.allowed,detail:next.detail??null,reasons:next.surplus_limit?.reasons??null});proof.budget_comparisons++;save();
  }
  const diag=proof.cases.find(c=>c.reasons)?.reasons;assert(diag);
  const valid={schema:'PUMP_SURPLUS_LIMIT_DIAGNOSTIC_V1',observed_ts:now,utc_day:day,retained_count:58,day_count:5,run_count:1,limits:{retained:200,day:24,run:1},reasons:['SAME_RUN_GRANT_LIMIT']};
  const mutations=[{...valid,retained_count:201},{...valid,day_count:59},{...valid,run_count:-1},{...valid,reasons:['UTC_DAY_GRANT_LIMIT']},{...valid,limits:{...valid.limits,retained:201}},{...valid,observed_ts:Number.MAX_SAFE_INTEGER},{...valid,utc_day:'not-a-day'},{...valid,reasons:['SAME_RUN_GRANT_LIMIT','SAME_RUN_GRANT_LIMIT']}];
  for(const d of mutations){assert.equal(trees.after.surplusLimitProjection(d),null);proof.projection_guards++;save();}
  const poisoned={...valid,secret_path:'DO_NOT_LEAK',raw:{private:'DO_NOT_LEAK'}};assert(!JSON.stringify(trees.after.surplusLimitProjection(poisoned)).includes('DO_NOT_LEAK'));proof.projection_guards++;save();
  const instrument={instrument_id:candidate,asset_id:'BINGX_UNDERLYING:TEST',native_symbol:'TEST-USDT',base:'TEST',venue:'BINGX',market_type:'PERPETUAL',quote:'USDT',settle:'USDT',classification_status:'VERIFIED_CRYPTO'};
  const produced={};for(const [label,t]of Object.entries(trees)){
    const f=await fixture(t,cases[0]);let analyze=0,core=0,drains=0;
    const price=t.createFact({fact_id:'ARTIFICIAL_PRICE',instrument_id:candidate,kind:'price',value:100,unit:'USDT_PER_BASE',event_ts:now,received_ts:now,expires_ts:now+30000,source:'ARTIFICIAL',status:'USABLE'});
    const sources={getCore:async()=>{core++;throw Error('DEFERRED_MUST_NOT_REQUEST_CORE');},getCatalog:async()=>({instruments:[instrument],unqualified:[],coverage:{status:'USABLE'}}),getOverview:async()=>({observations:[{instrument,facts:{price},reported_change_pct:30}],coverage:{status:'USABLE'}}),getOutcomeHistory:async()=>{throw Error('NO_OUTCOMES_IN_THIS_CASE');}};
    const runner=t.createPumpRunner({store:f.store,sources,analyzePump:()=>{analyze++;throw Error('DEFERRED_MUST_NOT_ANALYZE');},evaluateOutcome:()=>{throw Error('NO_OUTCOMES');},budget:f.budget,delivery:{pending:async()=>[],drain:async()=>{drains++;return[];}},clock:()=>now,evidence_class:'ARTIFICIAL',run_purpose:'ACCEPTANCE_TEST'});
    const r=await runner.execute({mode:'AUTO',run_id:id,publish:false});const saved=await f.store.get('pump:run:'+id);assert.deepEqual(saved,r);
    assert.equal(core,0);assert.equal(analyze,0);assert.equal(drains,1);assert.equal(r.deferred.length,1);assert.equal(r.checked.length,0);
    produced[label]={run:r,resources:await f.store.get('pump:resources'),summary:t.autoRunSummary(saved,label==='before'?a.base_pin:manifest.implementation_pin.sha256)};
  }
  assert.deepEqual(strip(produced.after.run),produced.before.run);assert.deepEqual(produced.after.resources,produced.before.resources);
  assert.deepEqual(produced.after.summary.candidate_diagnostics.deferred[0].surplus_limit.reasons,['SAME_RUN_GRANT_LIMIT']);
  proof.runner_comparisons=1;proof.actual_saved_runner_path_preserved=true;proof.changed_gates_or_caps_or_archiving=false;
  proof.state='PASS';proof.finished_ts=Date.now();save();
  fs.writeFileSync(a.result_file,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});
}catch(error){proof.state='FAILED_NO_AUTO_RETRY';proof.error=String(error.stack??error).slice(0,3000);proof.finished_ts=Date.now();save();fs.writeFileSync(a.result_file,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});process.exitCode=1;}
finally{globalThis.fetch=originalFetch;fs.closeSync(fd);}
console.log(JSON.stringify({state:proof.state,error:proof.error??null,Node:proof.Node,build:proof.build,budget_comparisons:proof.budget_comparisons,runner_comparisons:proof.runner_comparisons,projection_guards:proof.projection_guards,artifact:proof.artifact?{sha256:proof.artifact.sha256,pin:proof.artifact.implementation_sha256,modules:78,changed:proof.artifact.changed}:null,market_HTTP:0,Telegram:0,native_SQL:0}));
