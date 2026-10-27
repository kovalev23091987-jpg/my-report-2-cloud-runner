// BY: one empty-state AUTO counterfactual. Execute only with precise ROOT admission.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const out=path.join(repo,'pump-report/handoffs/analytics/package-by');
const privateOut=path.join(out,'.private');
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=p=>fs.readFileSync(path.resolve(repo,p));
const read=p=>JSON.parse(bytes(p));
const clone=structuredClone;
const save=(name,value,priv=false)=>fs.writeFileSync(path.join(priv?privateOut:out,name),JSON.stringify(value,null,2)+'\n');
const report={schema:'BY_ONE_COLD_CONNECTED_ACTUAL_V1',status:'STARTED',evidence_class:'ARTIFICIAL',counterfactual:true,
  scenario_class:'EMPTY_PROJECT_SAVED_FACT_REPLAY_WITH_ARTIFICIAL_DISCOVERY_CARRIER',native_event:false,native_AUTO_SENT:false,
  Node:1,new_connected_cases:1,AUTO_execute:0,MANUAL_execute:0,runner_engine_calls:0,delivery_recheck_engine_calls:0,MOCK_send:0,
  actual_Telegram:0,sourceHTTP:0,nativeSQL:0,build:0,deploy:0,old_tests:0,phases:[],
  limitations:['Historical reported_change_pct is NOT_RETAINED. The separate discovery carrier is ARTIFICIAL, not an observed source fact.',
    'Original facts retain every value, unit, status and clock. Analysis time is frozen at the original as-of, never shifted earlier.',
    'Original previous_wave is deliberately absent from the empty project. This is a cold-state counterfactual, not the original MANUAL event.',
    'Synthetic MemoryStore budget is a forecast fixture; actual quotas, spent, unknowns and reserves are untouched.',
    'One saved instrument does not establish current catalog coverage, historical intake, actual native AUTO SENT, or future plan profit.',
    'No second growth observation, wave seed, active membership seed, READY stub, provider transport or native environment is used.']};
let stage='ENTRY',locked=false;
const mark=(name,value={})=>{stage=name;report.phases.push({name,...value});save('BY_AFFECTED_RESULT.json',report);};
try{
  fs.mkdirSync(privateOut,{recursive:true});
  const lock=fs.openSync(path.join(out,'BY_NODE_ONCE.lock'),'wx');locked=true;
  fs.writeFileSync(lock,'BY one invocation entered. Preserve every failure; no automatic rerun.\n');fs.closeSync(lock);
  save('BY_AFFECTED_RESULT.json',report);
  assert.equal(process.argv.length,3,'EXACT_ROOT_ADMISSION_PATH_REQUIRED');
  const admission=read(process.argv[2]);
  assert.equal(admission.status,'ROOT_BY_ONE_COLD_CONNECTED_CASE_AUTHORIZED');
  for(const [key,value] of Object.entries({Node_invocations:1,AUTO_execute:1,MANUAL_execute:0,real_engine_calls_upper_bound:3,MOCK_send_upper_bound:1,sourceHTTP:0,nativeSQL:0,actual_Telegram:0,build:0,deploy:0}))assert.equal(admission[key],value,key);
  assert.equal(admission.empty_project_state_authorized,true);
  assert.equal(admission.artificial_discovery_reported_change_pct,20);
  assert.equal(admission.synthetic_budget_day_spent,400);
  assert.equal(admission.original_previous_wave_omitted,true);
  assert.ok(Date.now()<admission.own_expires_ts&&Date.now()<admission.root_expires_ts,'LIVE_LEASE_REQUIRED');
  assert.equal(admission.test_sha256,sha(fs.readFileSync(fileURLToPath(import.meta.url))));
  const auth=read('pump-report/handoffs/analytics/package-by/BY_EXECUTION_AUTHORITY.json');
  for(const key of ['own_owner','authority_main'])assert.equal(auth[key],admission[key]);
  for(const key of ['all4_equal','own_exact_bytes_match','own_actual_ref_match'])assert.equal(auth[key],true,key);
  assert.equal(auth.owner_paused,false);assert.equal(auth.fence,false);
  assert.ok(Date.now()-auth.checked_ts>=0&&Date.now()-auth.checked_ts<=90000,'FRESH_AUTHORITY_REQUIRED');
  const manifestPath='pump-report/handoffs/analytics/package-by/BY_EXACT72_MODULE_MANIFEST_V1.json';
  assert.equal(sha(bytes(manifestPath)),admission.module_manifest_sha256);
  const modules=read(manifestPath);
  assert.equal(modules.implementation_pin,'690fae17addd12ee60e111738b255dce267f6cf2af6827d506c4bd724d51f031');
  assert.equal(modules.module_count,72);assert.equal(modules.all_modules.length,72);
  const frozenPath='pump-report/handoffs/analytics/package-by/BY_FROZEN_INPUT_MANIFEST_V1.json';
  assert.equal(sha(bytes(frozenPath)),admission.frozen_input_manifest_sha256);
  const frozen=read(frozenPath),protectedFiles=[...modules.all_modules,...frozen.files];
  for(const f of protectedFiles){assert.equal(sha(bytes(f.path)),f.sha256,'FROZEN_BYTES_CHANGED:'+f.path);assert.equal(bytes(f.path).length,f.bytes);}
  const inputPath='pump-report/.private/handoffs/sources/F610/original-input-exact.json';
  assert.equal(sha(bytes(inputPath)),'14e18a8cd4c880de9916bcc55d2fa2e71b4d544f2ddbd8fb4f1f5310218a6d16');
  assert.ok(process.execArgv.includes('/private/tmp/pump-e-native-http-forbidden.mjs'),'NETWORK_FORBIDDEN_PRELOAD_REQUIRED');
  assert.equal(sha(fs.readFileSync('/private/tmp/pump-e-native-http-forbidden.mjs')),'7a57d4036d30146735628cb4013f69721fa7cb6794932362f3a2155e36cb6783');
  globalThis.fetch=async()=>{throw Error('BY_REAL_FETCH_FORBIDDEN');};
  const base=path.resolve(repo,modules.module_root),load=n=>import(pathToFileURL(path.join(base,n)).href);
  const [{createPumpRunner},{createDelivery,textHash},{revalidatePumpCard},{MemoryStore},{analyzePump,evaluateOutcome},
    {START_PROFILE},{createUnifiedBudget,RESOURCE_LIMITS},{productionAdmission,productionPolicies,PRODUCTION_PLAN},
    {PROVIDER_POLICIES,PROVIDER_POLICY_VERSION,PROTECTED_HTTP},{createRetainedCapsuleWriter},{emptyMap},
    {createSourceEvidenceAdmission},{BINGX_IDENTITY_REGISTRY},{createReviewedNativeScopeRegistry},{withReviewedFundingQuoteRegistry}]=await Promise.all([
      load('runtime/runner.mjs'),load('runtime/delivery.mjs'),load('runtime/worker.mjs'),load('runtime/store.mjs'),load('analytics/index.mjs'),
      load('profile/start-v1.mjs'),load('runtime/budget.mjs'),load('runtime/production-policy.mjs'),load('runtime/provider-policy.mjs'),
      load('runtime/retained-capsules.mjs'),load('contracts/index.mjs'),load('runtime/source-evidence-admission.mjs'),load('registry/index.mjs'),
      load('registry/native-reviewed550.mjs'),load('registry/funding-quote-profile.mjs')]);
  const original=read(inputPath),originalFingerprint=sha(Buffer.from(JSON.stringify(original)));
  assert.equal(original.analysis_ts,1793008557222);assert.equal(original.mode,'MANUAL');assert.ok(original.previous_wave);
  assert.equal(original.facts.ticker_24h.value.change_pct,null);
  assert.equal(START_PROFILE.automatic_growth.day_pct,20);assert.equal(START_PROFILE.automatic_growth.short_pct,10);
  const policyBefore=JSON.stringify({START_PROFILE,PRODUCTION_PLAN,RESOURCE_LIMITS,PROTECTED_HTTP});
  const registry=withReviewedFundingQuoteRegistry(createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY));
  const assess=createSourceEvidenceAdmission(registry);assert.equal(assess(original.instrument).eligible,true,'REAL_SOURCE_EVIDENCE_ADMISSION_REQUIRED');
  const now=original.analysis_ts,clock=()=>now,store=new MemoryStore(),calls={},engineInputs=[],engineOutputs=[],rechecks=[],transport=[];
  const instrument=clone(original.instrument),id=instrument.instrument_id,run_id='BY_AUTO_COLD_ORIGINAL_DOOD241_COUNTERFACTUAL';
  assert.equal(admission.counterfactual_run_id,run_id);
  const note=name=>{calls[name]=(calls[name]??0)+1;};
  assert.equal(store.rows.size,0,'PROJECT_MUST_START_EMPTY');
  for(const key of ['pump:candidate-queue','pump:wave:'+id,'pump:active-instruments','pump:overview-index'])assert.equal(await store.get(key),null,key);
  const day=new Date(now).toISOString().slice(0,10),month=day.slice(0,7);
  await store.set('pump:resources',{days:{[day]:400},providers:{BINGX:{days:{[day]:400},months:{[month]:400},recent:[]}}});
  assert.deepEqual([...store.rows.keys()],['pump:resources'],'ONLY_SYNTHETIC_BUDGET_MAY_BE_SEEDED');
  const budget=createUnifiedBudget({store,run_id,mode:'AUTO',clock,policies:productionPolicies(PROVIDER_POLICIES),protected_reserves:PROTECTED_HTTP,
    admission:productionAdmission({evidence_ref:'BY_ARTIFICIAL_OFFLINE_FORECAST_NOT_NATIVE',expires_ts:now+120000},PROVIDER_POLICY_VERSION,{mode:'AUTO'})});
  const sources={
    async getCatalog(){note('getCatalog');return {instruments:[clone(instrument)],unqualified:[],coverage:{status:'COMPLETE',expected:1,checked:1,scope:'EXACT_SAVED_DOOD_ONLY'}};},
    async getOverview(args){note('getOverview');assert.equal(args.instruments.length,1);assert.equal(args.instruments[0].instrument_id,id);
      // This carrier is separate from immutable ticker_24h and used only for the first discovery.
      return {observations:[{instrument:clone(instrument),preliminary:true,reported_change_pct:args.purpose==='DISCOVERY'?20:null,
        facts:{price:clone(original.facts.price),ticker_24h:clone(original.facts.ticker_24h)}}],coverage:{status:'CHECKED',expected:1,checked:1,scope:'ARTIFICIAL_CARRIER_SAVED_FACT_BOUNDARY'}};},
    async getDayGrowth(){note('getDayGrowth');return {facts:{growth_24h:clone(original.facts.growth_24h)}};},
    async getCore(args){note('getCore');assert.equal(args.instrument.instrument_id,id);assert.equal(args.mode,'AUTO');
      if(args.purpose==='DELIVERY'){assert.equal(args.force_refresh,true);assert.deepEqual(args.only_facts,['price','orderbook']);
        return {facts:{price:clone(original.facts.price),orderbook:clone(original.facts.orderbook)},coverage:{status:'CHECKED',scope:'SAVED_FACT_BOUNDARY_MOCK'}};}
      return {facts:Object.fromEntries(['price','candles','orderbook'].map(k=>[k,clone(original.facts[k])])),coverage:{status:'CHECKED',scope:'SAVED_FACT_BOUNDARY_MOCK'}};},
    async getLiquidations(){note('getLiquidations');return clone(original.liquidations);},
    async getOptional(){note('getOptional');return {facts:Object.fromEntries(['trades','open_interest','funding'].filter(k=>Object.hasOwn(original.facts,k)).map(k=>[k,clone(original.facts[k])]))};},
    async getOutcomeHistory(){throw Error('BY_OUTCOME_SOURCE_NOT_AUTHORIZED');}
  };
  const countedEngine=(input,profile)=>{assert.ok(report.runner_engine_calls<2,'RUNNER_ENGINE_BOUND');report.runner_engine_calls++;
    assert.equal(input.analysis_ts,original.analysis_ts);assert.equal(input.previous_wave,null,'NO_PREVIOUS_WAVE_SEED');
    for(const [key,fact] of Object.entries(input.facts))assert.deepEqual(fact,original.facts[key],'ORIGINAL_FACT_CHANGED:'+key);
    engineInputs.push(clone(input));const result=analyzePump(input,profile);engineOutputs.push(clone(result));return result;};
  const recipient='BY_MOCK_RECIPIENT';
  const delivery=createDelivery({store,clock,recipient,revalidate:async card=>{
    assert.equal(report.delivery_recheck_engine_calls,0);report.delivery_recheck_engine_calls++;
    const answer=await revalidatePumpCard({card,store,sources,clock,profile:START_PROFILE});rechecks.push(clone(answer));return answer;
  },send:async request=>{assert.equal(report.MOCK_send,0);report.MOCK_send++;transport.push(clone(request));
    return {ok:true,body:{ok:true,result:{message_id:987654322,chat:{id:recipient},text:request.text,date:Math.floor(clock()/1000)}}};}});
  const retained=createRetainedCapsuleWriter({store,implementation_sha256:modules.implementation_pin,evidence_class:'ARTIFICIAL'});
  const runner=createPumpRunner({store,sources,analyzePump:countedEngine,evaluateOutcome,budget,delivery,profile:START_PROFILE,clock,
    evidence_class:'ARTIFICIAL',run_purpose:original.run_purpose,retained_features:retained,assess_source_evidence:assess,
    await_source_window:async args=>{note('await_source_window');assert.equal(args.provider,'BINGX');assert.equal(args.cost,10);}});
  mark('EMPTY_STATE_CONFIRMED',{candidate_queue_empty:true,wave_empty:true,active_membership_empty:true,history_empty:true,
    synthetic_budget_only:true,artificial_discovery_carrier:20,original_previous_wave_omitted:true,clock_frozen:true});
  report.AUTO_execute++;stage='AUTO_EXECUTE';const result=await runner.execute({mode:'AUTO',run_id,publish:true});
  save('BY_PRIVATE_FULL_PIPELINE.json',{result,engineInputs,engineOutputs,rechecks,transport,store:[...store.rows]},true);
  mark('REAL_RUNNER_RETURNED',{status:result.status,checked:result.checked.length,manual:result.manual.length,calls,
    runner_engine_calls:report.runner_engine_calls,delivery_recheck_engine_calls:report.delivery_recheck_engine_calls,MOCK_send:report.MOCK_send});
  assert.equal(result.manual.length,0);assert.ok(report.runner_engine_calls+report.delivery_recheck_engine_calls<=3);assert.ok(report.MOCK_send<=1);
  const checked=result.checked[0],analysis=checked?.analysis;
  const saved=checked?.analysis_key?await store.get(checked.analysis_key):null;
  if(analysis){
    assert.ok(saved,'IMMUTABLE_ANALYSIS_MUST_BE_SAVED');assert.deepEqual(saved.analysis,analysis);assert.equal(saved.evidence_class,'ARTIFICIAL');
    assert.equal(saved.input.mode,'AUTO');assert.equal(saved.input.run_id,run_id);assert.equal(saved.input.previous_wave,null);
    assert.equal(saved.input.analysis_ts,original.analysis_ts);assert.deepEqual(saved.input.instrument,original.instrument);
    for(const [key,fact] of Object.entries(saved.input.facts))assert.deepEqual(fact,original.facts[key],'SAVED_ORIGINAL_FACT_CHANGED:'+key);
    assert.deepEqual(saved.input,engineInputs.at(-1));
  }
  const queue=await store.get('pump:candidate-queue'),queued=queue?.[id];
  assert.ok(queued,'DISCOVERY_MUST_BUILD_QUEUE');assert.equal(queued.first_seen,now);assert.equal(queued.preliminary_growth,null);
  assert.equal(queued.reported_day_growth,20);assert.equal(calls.getCatalog,1);
  report.discovery_created_queue=true;report.source_evidence_real=true;report.original_fact_values_units_status_clocks_equal=true;
  report.first_blocked_step=!checked?'CANDIDATE_NOT_CHECKED':!analysis?'CANDIDATE_ADMISSION':!analysis.ready?'ANALYTICS_NOT_READY':!analysis.automatic_eligible?'AUTO_ELIGIBILITY':checked.delivery?.state!=='SENT'?'DELIVERY':null;
  report.analysis_status=analysis?.status??null;report.analysis_reasons=analysis?.reasons??[];
  report.wave_state=analysis?.wave_state??null;report.current_threshold_passed=analysis?.current_threshold_passed??null;
  report.saved_analysis=Boolean(saved);report.saved_card=false;report.advance_pullback_plan_proved=false;
  if(!report.first_blocked_step){
    const card=await store.get('pump:card:'+checked.delivery.card_id);
    assert.equal(report.runner_engine_calls,2);assert.equal(report.delivery_recheck_engine_calls,1);assert.equal(report.MOCK_send,1);
    assert.equal(card.analysis.source_input_key,checked.analysis_key);assert.equal(card.text,analysis.card_text);assert.equal(card.text,transport[0].text);
    assert.equal(card.text_hash,await textHash(card.text));assert.equal(card.receipt.text_hash,card.text_hash);
    assert.equal(card.state,'SENT');assert.equal(card.message_id,'987654322');assert.equal(checked.delivery.receipt_readback,true);
    assert.equal(card.publication_registered,true);assert.equal(rechecks[0].valid,true);
    assert.ok(analysis.plan.entry_zones.length>0);assert.ok(analysis.plan.entry_zones.every(z=>z.upper<analysis.reference_price));
    assert.ok(analysis.plan.potential_pct.minimum>=10);assert.equal(analysis.liquidity.status,'USABLE');
    report.saved_card=true;report.advance_pullback_plan_proved=true;report.receipt_readback=true;
    report.text_hash=card.text_hash;report.plan_potential_minimum=analysis.plan.potential_pct.minimum;
    report.entry_zones_below_current_price=true;report.second_growth_observation_used=false;
    report.status='PASS_COLD_COUNTERFACTUAL_MOCK_PATH_ONLY';
  }else{
    report.status='COLD_PATH_BLOCK_PRESERVED';report.refusal_reason=checked?.source_coverage?.reason??null;
    report.no_forced_READY=true;report.positive_delivery_goal_proved=false;
  }
  assert.equal(sha(Buffer.from(JSON.stringify(original))),originalFingerprint);
  assert.equal(JSON.stringify({START_PROFILE,PRODUCTION_PLAN,RESOURCE_LIMITS,PROTECTED_HTTP}),policyBefore);
  for(const f of protectedFiles)assert.equal(sha(bytes(f.path)),f.sha256,'POSTRUN_FROZEN_BYTES_CHANGED:'+f.path);
  assert.equal(sha(bytes(manifestPath)),admission.module_manifest_sha256);assert.equal(sha(bytes(frozenPath)),admission.frozen_input_manifest_sha256);
  report.real_engine_calls=report.runner_engine_calls+report.delivery_recheck_engine_calls;
  report.implementation_pin=modules.implementation_pin;report.completed_wall_utc=new Date().toISOString();save('BY_AFFECTED_RESULT.json',report);
  process.stdout.write(JSON.stringify({status:report.status,first_blocked_step:report.first_blocked_step,real_engine_calls:report.real_engine_calls,MOCK_send:report.MOCK_send,sourceHTTP:0,nativeSQL:0,actualTelegram:0})+'\n');
}catch(error){
  report.status='FAIL_PRESERVED_NO_AUTOMATIC_RERUN';report.failure_stage=stage;
  report.failure={name:error.name,code:error.code??null,message:String(error.message).slice(0,300)};report.completed_wall_utc=new Date().toISOString();
  if(locked){save('BY_PRIVATE_FAILURE.json',{stack:error.stack,report},true);save('BY_AFFECTED_RESULT.json',report);}
  process.stderr.write(JSON.stringify({status:report.status,stage,error_name:error.name,code:error.code??null})+'\n');process.exitCode=1;
}
