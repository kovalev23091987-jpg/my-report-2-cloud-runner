// BS: one counterfactual AUTO path over original DOOD241 facts. Prepared, never a native event.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const out=path.join(repo,'pump-report/handoffs/analytics/package-bs/attempt2');
const privateOut=path.join(out,'.private');
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=p=>fs.readFileSync(path.resolve(repo,p));
const read=p=>JSON.parse(bytes(p));
const clone=structuredClone;
const save=(name,value,priv=false)=>fs.writeFileSync(path.join(priv?privateOut:out,name),JSON.stringify(value,null,2)+'\n');
const report={schema:'BS_ONE_CONNECTED_AUTO_ORIGINAL_ACTUAL_V1',status:'STARTED',Node:1,new_connected_cases:1,Node_attempt_number:2,aggregate_Node_attempts:2,logical_cases_total:1,
  evidence_class:'ARTIFICIAL',scenario_class:'CONTROLLED_SAVED_FACT_REPLAY',counterfactual:true,native_event:false,native_AUTO_SENT:false,
  actual_Telegram:0,sourceHTTP:0,nativeSQL:0,build:0,deploy:0,old_tests:0,
  AUTO_execute:0,MANUAL_execute:0,runner_engine_calls:0,delivery_recheck_engine_calls:0,MOCK_send:0,
  phases:[],limitations:['Single known DOOD wave, not cold-start intake or whole550 coverage.',
    'Saved source-boundary facts and synthetic offline budget state are not provider/native admissions or actual billed cost.',
    'A transport MOCK receipt is never an actual Telegram SENT. Existing real MANUAL241 is historical evidence only.',
    'Snapshot queue projection and original analysis clock are separate; no expired fact is refreshed.',
    'Default worker/environment, delivery-enabled flags, provider transport and sendSavedTelegram wrapper are not invoked.',
    'History branch reuses the original-context AUTO analysis; a real later AUTO reads the postmanual next_wave. Any divergence is not an actual duplicate bug.']};
let stage='ENTRY',locked=false;
const mark=(name,value={})=>{stage=name;report.phases.push({name,...value});save('BS_AFFECTED_RESULT.json',report);};
try{
  fs.mkdirSync(privateOut,{recursive:true});
  const lock=fs.openSync(path.join(out,'BS_NODE_ONCE.lock'),'wx');locked=true;
  fs.writeFileSync(lock,'BS one invocation entered; every failure is preserved; no blind rerun\n');fs.closeSync(lock);
  save('BS_AFFECTED_RESULT.json',report);
  assert.equal(process.argv.length,3,'EXACT_ROOT_ADMISSION_PATH_REQUIRED');
  const admission=read(process.argv[2]);
  assert.equal(admission.status,'ROOT_BS_ONE_CONNECTED_AUTO_CASE_ATTEMPT2_AUTHORIZED');
  assert.equal(admission.Node_invocations,1);assert.equal(admission.AUTO_execute,1);assert.equal(admission.MANUAL_execute,0);
  assert.equal(admission.real_engine_calls_upper_bound,3);assert.equal(admission.active_wave_projection_authorized,true);
  assert.equal(admission.synthetic_budget_day_spent,400);assert.equal(admission.already_sent_manual_branch_authorized,true);
  assert.ok(Date.now()<admission.own_expires_ts&&Date.now()<admission.root_expires_ts,'LIVE_LEASE_REQUIRED');
  assert.equal(admission.test_sha256,sha(fs.readFileSync(fileURLToPath(import.meta.url))));
  const auth=read('pump-report/handoffs/analytics/package-bs/attempt2/BS_EXECUTION_AUTHORITY.json');
  assert.equal(auth.own_owner,admission.own_owner);assert.equal(auth.all4_equal,true);
  assert.equal(auth.own_exact_bytes_match,true);assert.equal(auth.own_actual_ref_match,true);
  assert.equal(auth.owner_paused,false);assert.equal(auth.fence,false);
  assert.ok(Date.now()-auth.checked_ts>=0&&Date.now()-auth.checked_ts<=90000,'FRESH_AUTHORITY_REQUIRED');
  assert.equal(auth.authority_main,admission.authority_main);
  const manifestPath='pump-report/handoffs/analytics/package-bs/BS_EXACT71_TRANSITIVE_MODULE_MANIFEST_V1.json';
  assert.equal(sha(bytes(manifestPath)),admission.transitive_manifest_sha256);
  const modules=read(manifestPath);
  assert.equal(modules.implementation_pin,'75fe60f7ddd92bc4c055a4d6865209ea0420f2218865ba6cb9a8f5e031c70e1a');
  assert.equal(sha(bytes(modules.root_manifest_path)),admission.root_frozen_manifest_sha256);
  assert.equal(admission.root_frozen_manifest_sha256,'1d239c50c3b8f47926e37fe16fa03a2f53d37fe39c34175b623ba6eea7933378');
  const firstFailurePath='pump-report/handoffs/analytics/package-bs/BS_ATTEMPT1_FROZEN_FAILURE_V1.json';
  assert.equal(sha(bytes(firstFailurePath)),admission.first_failure_manifest_sha256);
  const firstFailure=read(firstFailurePath);assert.equal(firstFailure.engine,0);assert.equal(firstFailure.Node,1);
  report.first_failure_manifest_sha256=admission.first_failure_manifest_sha256;
  const protectedFiles=[...modules.all_modules,...admission.frozen_input_files,...firstFailure.files];
  for(const f of protectedFiles){assert.equal(sha(bytes(f.path)),f.sha256,'FROZEN_BYTES_CHANGED:'+f.path);assert.equal(bytes(f.path).length,f.bytes);}
  assert.equal(sha(bytes(admission.F610_final_manifest_path)),admission.F610_final_manifest_sha256);
  assert.equal(admission.original_input_sha256,'14e18a8cd4c880de9916bcc55d2fa2e71b4d544f2ddbd8fb4f1f5310218a6d16');
  const inputPath='pump-report/.private/handoffs/sources/F610/original-input-exact.json';
  assert.equal(sha(bytes(inputPath)),admission.original_input_sha256);
  assert.ok(process.execArgv.includes('/private/tmp/pump-e-native-http-forbidden.mjs'),'NETWORK_FORBIDDEN_PRELOAD_REQUIRED');
  assert.equal(sha(fs.readFileSync('/private/tmp/pump-e-native-http-forbidden.mjs')),'7a57d4036d30146735628cb4013f69721fa7cb6794932362f3a2155e36cb6783');
  globalThis.fetch=async()=>{throw Error('BS_REAL_FETCH_FORBIDDEN');};
  const base=path.resolve(repo,modules.module_root),load=n=>import(pathToFileURL(path.join(base,n)).href);
  const [{createPumpRunner},{createDelivery,textHash},{revalidatePumpCard},{MemoryStore},{analyzePump,evaluateOutcome},
    {START_PROFILE},{createUnifiedBudget,RESOURCE_LIMITS},{productionAdmission,productionPolicies,PRODUCTION_PLAN},
    {PROVIDER_POLICIES,PROVIDER_POLICY_VERSION,PROTECTED_HTTP},{createRetainedCapsuleWriter},
    {createSourceEvidenceAdmission},{BINGX_IDENTITY_REGISTRY},{createReviewedNativeScopeRegistry},
    {withReviewedFundingQuoteRegistry},{candidatePriority}]=await Promise.all([
      load('runtime/runner.mjs'),load('runtime/delivery.mjs'),load('runtime/worker.mjs'),load('runtime/store.mjs'),
      load('analytics/index.mjs'),load('profile/start-v1.mjs'),load('runtime/budget.mjs'),load('runtime/production-policy.mjs'),
      load('runtime/provider-policy.mjs'),load('runtime/retained-capsules.mjs'),load('runtime/source-evidence-admission.mjs'),
      load('registry/index.mjs'),load('registry/native-reviewed550.mjs'),load('registry/funding-quote-profile.mjs'),load('runtime/candidate-priority.mjs')]);
  // Only named exports are used. The default worker and native environment are never invoked.
  const original=read(inputPath),source=read('pump-report/.private/observations/owner-dood-sent241-readback-result.json');
  const evidence=source.observation.private_evidence,queue=read('pump-report/.private/handoffs/sources/F610/queue-rows-exact.json');
  const pacing=read('pump-report/.private/handoffs/sources/F610/deep-pacing-exact.json');
  const originalFingerprint=sha(Buffer.from(JSON.stringify(original)));
  assert.deepEqual(original,evidence.original.input);assert.equal(original.mode,'MANUAL');
  assert.equal(original.analysis_ts,1793008557222);assert.ok(original.previous_wave);
  assert.equal(source.completed_ts,1793009234253);assert.equal(evidence.card.state,'SENT');assert.equal(evidence.card.message_id,'241');
  const minimumExpiry=Math.min(...['price','candles','orderbook'].map(k=>original.facts[k].expires_ts));
  assert.equal(minimumExpiry,1793008571193);assert.ok(evidence.card.receipt.confirmed_ts<minimumExpiry);
  assert.equal(original.facts.ticker_24h.value.change_pct,null);
  assert.equal(START_PROFILE.automatic_growth.day_pct,20);assert.equal(START_PROFILE.automatic_growth.short_pct,10);
  assert.equal(PRODUCTION_PLAN.candidate_surplus.max_retained_records,200);assert.equal(PRODUCTION_PLAN.candidate_surplus.max_grants_per_day,24);
  assert.equal(RESOURCE_LIMITS.project_http_day,900);assert.equal(RESOURCE_LIMITS.http_per_run,164);
  const registry=withReviewedFundingQuoteRegistry(createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY));
  const assess=createSourceEvidenceAdmission(registry);
  assert.equal(assess(original.instrument).eligible,true,'REAL_SOURCE_EVIDENCE_ADMISSION_REQUIRED');
  const snapshot=Object.entries(queue).map(([name,row])=>({name,due:row.next_check_ts<=source.completed_ts,
    prequeue_eligible:row.active_wave===true||row.reported_day_growth>=START_PROFILE.automatic_growth.day_pct*START_PROFILE.prequeue_threshold_fraction||
      typeof row.preliminary_growth==='number'&&row.preliminary_growth>=START_PROFILE.automatic_growth.short_pct*START_PROFILE.prequeue_threshold_fraction,
    price_expired:row.price_expires_ts<source.completed_ts,core_expired:row.core_expires_ts<source.completed_ts,
    ...candidatePriority(row,source.completed_ts,{profile:START_PROFILE})}));
  const bucket=pacing['2026-10-26']['1793008800000'];
  const boundary={snapshot_completed_ts:source.completed_ts,slot_created_ts:bucket.created_ts,DOOD_next_check_ts:queue.DOOD.next_check_ts,
    due_minus_slot_ms:queue.DOOD.next_check_ts-bucket.created_ts,analysis_to_remember_ms:queue.DOOD.last_checked_ts-original.analysis_ts,
    candidate_count:bucket.candidate_count,maximum:bucket.maximum,hypothesis_only:true,exact_slot_queue_write_history_known:false};
  assert.equal(boundary.due_minus_slot_ms,49);assert.equal(boundary.analysis_to_remember_ms,658);
  mark('A_SNAPSHOT_PROJECTION_NO_ENGINE',{clock:source.completed_ts,rows:snapshot,boundary});

  let now=original.analysis_ts;const clock=()=>now;
  const store=new MemoryStore(),calls={},engineInputs=[],rechecks=[],transport=[];
  const note=(name,args)=>{calls[name]=(calls[name]??0)+1;return args;};
  const instrument=clone(original.instrument),id=instrument.instrument_id,run_id='BS_AUTO_ORIGINAL_DOOD241_COUNTERFACTUAL';
  assert.equal(admission.counterfactual_run_id,run_id);
  // Synthetic offline ledger, never a rewrite/refund of the actual 13:07 ledger.
  const day=new Date(now).toISOString().slice(0,10),month=day.slice(0,7);
  await store.set('pump:resources',{days:{[day]:400},providers:{BINGX:{days:{[day]:400},months:{[month]:400},recent:[]}}});
  await store.set('pump:wave:'+id,clone(original.previous_wave));
  await store.set('pump:active-instruments',[id]); // Explicit ROOT-approved projection from exact previous_wave.
  assert.equal(await store.get('pump:candidate-queue'),null,'QUEUE_MUST_BE_BUILT_BY_DISCOVERY');
  const policyBefore=JSON.stringify({PRODUCTION_PLAN,START_PROFILE,RESOURCE_LIMITS,PROTECTED_HTTP});
  const budget=createUnifiedBudget({store,run_id,mode:'AUTO',clock,policies:productionPolicies(PROVIDER_POLICIES),protected_reserves:PROTECTED_HTTP,
    admission:productionAdmission({evidence_ref:'BS_SYNTHETIC_OFFLINE_FORECAST_NOT_NATIVE',expires_ts:now+120000},PROVIDER_POLICY_VERSION,{mode:'AUTO'})});
  const sources={
    async getCatalog(args){note('getCatalog',args);return {instruments:[clone(instrument)],unqualified:[],coverage:{status:'COMPLETE',expected:1,checked:1,scope:'EXACT_SAVED_DOOD_ONLY'}};},
    async getOverview(args){note('getOverview',args);assert.equal(args.instruments.length,1);assert.equal(args.instruments[0].instrument_id,id);
      return {observations:[{instrument:clone(instrument),preliminary:true,reported_change_pct:null,facts:{price:clone(original.facts.price),ticker_24h:clone(original.facts.ticker_24h)}}],coverage:{status:'CHECKED',expected:1,checked:1,scope:'SAVED_BOUNDARY_MOCK_NOT_NEW_HTTP'}};},
    async getDayGrowth(args){note('getDayGrowth',args);return {facts:{growth_24h:clone(original.facts.growth_24h)}};},
    async getCore(args){note('getCore',args);assert.equal(args.instrument.instrument_id,id);assert.equal(args.mode,'AUTO');
      if(args.purpose==='DELIVERY'){assert.equal(args.force_refresh,true);assert.deepEqual(args.only_facts,['price','orderbook']);return {facts:{price:clone(original.facts.price),orderbook:clone(original.facts.orderbook)},coverage:clone(evidence.manual.source_coverage)};}
      return {facts:Object.fromEntries(['price','candles','orderbook'].map(k=>[k,clone(original.facts[k])])),coverage:clone(evidence.manual.source_coverage)};},
    async getLiquidations(args){note('getLiquidations',args);return clone(original.liquidations);},
    async getOptional(args){note('getOptional',args);return {facts:Object.fromEntries(['trades','open_interest','funding'].filter(k=>Object.hasOwn(original.facts,k)).map(k=>[k,clone(original.facts[k])]))};},
    async getOutcomeHistory(){throw Error('BS_OUTCOME_SOURCE_NOT_AUTHORIZED');}
  };
  const countedEngine=(input,profile)=>{report.runner_engine_calls++;engineInputs.push(clone(input));return analyzePump(input,profile);};
  const recipient='BS_MOCK_RECIPIENT';
  const delivery=createDelivery({store,clock,recipient,revalidate:async card=>{
    report.delivery_recheck_engine_calls++;const answer=await revalidatePumpCard({card,store,sources,clock,profile:START_PROFILE});
    rechecks.push({valid:answer.valid,reason:answer.reason,clock:clock(),source_input_key:card.analysis.source_input_key});return answer;
  },send:async request=>{report.MOCK_send++;transport.push(clone(request));return {ok:true,body:{ok:true,result:{message_id:987654321,chat:{id:recipient},text:request.text,date:Math.floor(clock()/1000)}}};}});
  const retained=createRetainedCapsuleWriter({store,implementation_sha256:modules.implementation_pin,evidence_class:'ARTIFICIAL'});
  const runner=createPumpRunner({store,sources,analyzePump:countedEngine,evaluateOutcome,budget,delivery,profile:START_PROFILE,clock,
    evidence_class:'ARTIFICIAL',run_purpose:original.run_purpose,retained_features:retained,assess_source_evidence:assess,
    await_source_window:async args=>{note('await_source_window',args);assert.equal(args.provider,'BINGX');assert.equal(args.cost,10);}});
  report.AUTO_execute++;stage='B_AUTO_EXECUTE';
  const result=await runner.execute({mode:'AUTO',run_id,publish:true});
  save('BS_PRIVATE_FULL_PIPELINE.json',{original_input_sha256:admission.original_input_sha256,result,engineInputs,rechecks,transport,store:[...store.rows]},true);
  // Save actual first result before assertions; an unexpected refusal is retained, never forced READY.
  mark('B_AUTO_EXECUTE_RETURNED',{status:result.status,errors:result.errors,checked:result.checked.length,manual:result.manual.length,
    selection:result.candidate_selection,calls,runner_engine_calls:report.runner_engine_calls,delivery_recheck_engine_calls:report.delivery_recheck_engine_calls,MOCK_send:report.MOCK_send});
  assert.equal(result.status,'COMPLETE');assert.equal(result.manual.length,0);assert.equal(result.checked.length,1);
  assert.equal(report.runner_engine_calls,2);assert.equal(report.delivery_recheck_engine_calls,1);assert.equal(report.MOCK_send,1);
  const checked=result.checked[0],analysis=checked.analysis;
  assert.equal(analysis.mode,'AUTO');assert.equal(analysis.ready,true);assert.equal(analysis.automatic_eligible,true);assert.equal(analysis.analysis_ts,original.analysis_ts);
  assert.equal(checked.candidate_quota.base_per_period,1);assert.equal(checked.candidate_quota.issued,1);
  assert.equal(checked.delivery.state,'SENT');assert.equal(checked.delivery.message_id,'987654321');assert.equal(checked.delivery.receipt_readback,true);
  const saved=await store.get(checked.analysis_key),expected=clone(original);expected.mode='AUTO';expected.run_id=run_id;
  assert.deepEqual(saved.input,expected,'ONLY_MODE_RUNID_MAY_DIFFER_IN_FINAL_INPUT');
  assert.deepEqual(saved.analysis,analysis);assert.equal(saved.evidence_class,'ARTIFICIAL');
  const card=await store.get('pump:card:'+checked.delivery.card_id);
  assert.equal(card.analysis.source_input_key,checked.analysis_key);assert.equal(card.mode,'AUTO');assert.equal(card.text,analysis.card_text);
  assert.equal(card.text,transport[0].text);assert.equal(card.text_hash,await textHash(card.text));assert.equal(card.receipt.text_hash,card.text_hash);
  assert.equal(card.publication_registered,true);assert.equal(card.state,'SENT');assert.equal(card.message_id,'987654321');
  assert.ok(rechecks[0].valid);assert.equal(calls.getCatalog,1);assert.equal(calls.getOverview,2);assert.equal(calls.getCore,2);
  assert.equal(calls.getDayGrowth,1);assert.equal(calls.getOptional,1);assert.equal(calls.getLiquidations,1);
  const builtQueue=await store.get('pump:candidate-queue');assert.equal(builtQueue[id].reported_day_growth,null);
  assert.equal(builtQueue[id].last_status,'READY');assert.equal(builtQueue[id].active_wave,true);
  mark('B_REAL_ENGINE_SAVE_RECHECK_MOCK_RECEIPT_READBACK',{clock:now,ready:analysis.ready,automatic_eligible:analysis.automatic_eligible,
    analysis_key:checked.analysis_key,analysis_sha256:sha(Buffer.from(JSON.stringify(analysis))),card_id:card.card_id,text_hash:card.text_hash,
    card_length:card.text.length,receipt_readback:checked.delivery.receipt_readback,MOCK_only:true,base_quota:checked.candidate_quota,
    source_evidence_real:true,original_values_clocks_equal:true,active_wave_projection:true,cold_start_intake_proved:false});

  // Separate delivery-history branch: no new engine or second AUTO execute.
  now=evidence.card.receipt.confirmed_ts;assert.equal(now,1793008561961);assert.ok(now<minimumExpiry);
  const history=new MemoryStore(),manualCard=clone(evidence.card),manualBefore=JSON.stringify(manualCard);
  const waveKey='pump:delivery-wave:'+manualCard.analysis.instrument.instrument_id+':'+manualCard.analysis.wave_id;
  const sameWave=analysis.wave_id===manualCard.analysis.wave_id;
  await history.set('pump:card:'+manualCard.card_id,manualCard);
  await history.set(waveKey,{primary_card_id:manualCard.card_id,updates:[],card_by_hash:{[manualCard.text_hash]:manualCard.card_id}});
  let duplicateSend=0,duplicateRecheck=0;
  const previousDelivery=createDelivery({store:history,clock,recipient:manualCard.recipient,
    revalidate:async()=>{duplicateRecheck++;throw Error('ALREADY_SENT_MUST_SKIP_RECHECK');},
    send:async()=>{duplicateSend++;throw Error('ALREADY_SENT_MUST_NOT_SEND');}});
  const decision=await previousDelivery.enqueue({...analysis,source_input_key:checked.analysis_key},{mode:'AUTO',expires_ts:minimumExpiry,update_kind:analysis.update_kind??null});
  // A legitimate new wave/substantial update needs another recheck/send admission.
  // Preserve that decision instead of forcing duplicate or exceeding the 3-engine/1-MOCK-send bound.
  const dispatched=decision.duplicate?await previousDelivery.dispatch(decision.card_id):{state:'NOT_DISPATCHED_ADMISSION_BOUND',card_id:decision.card_id};
  save('BS_PRIVATE_DUPLICATE_HISTORY.json',{decision,dispatched,store:[...history.rows]},true);
  if(decision.duplicate){assert.equal(decision.card_id,manualCard.card_id);assert.equal(dispatched.state,'SENT');}
  assert.equal(duplicateSend,0);assert.equal(duplicateRecheck,0);assert.equal(JSON.stringify(await history.get('pump:card:'+manualCard.card_id)),manualBefore);
  report.manual_history_result=decision.duplicate?'EXISTING_SENT_SUPPRESSES_DUPLICATE':'NEW_WAVE_OR_UPDATE_DECISION_REQUIRES_REVIEW';
  mark('C_MANUAL241_HISTORY_EFFECT',{clock:now,duplicate:decision.duplicate,reason:decision.reason??null,same_wave:sameWave,
    update_kind:analysis.update_kind??null,dispatch_state:dispatched.state,returns_historical_SENT241:decision.duplicate,
    new_send:duplicateSend,new_recheck:duplicateRecheck,manual_card_unchanged:true,
    pointer_fixture_derived_from_actual_card:true,native_pointer_readback:false,second_engine_run:false,
    actual_later_AUTO_reads_postmanual_next_wave:true,actual_duplicate_bug_proved:false});
  assert.equal(sha(Buffer.from(JSON.stringify(original))),originalFingerprint);
  assert.equal(JSON.stringify({PRODUCTION_PLAN,START_PROFILE,RESOURCE_LIMITS,PROTECTED_HTTP}),policyBefore);
  for(const f of protectedFiles)assert.equal(sha(bytes(f.path)),f.sha256,'POSTRUN_FROZEN_BYTES_CHANGED:'+f.path);
  assert.equal(sha(bytes(manifestPath)),admission.transitive_manifest_sha256);
  assert.equal(sha(bytes(modules.root_manifest_path)),admission.root_frozen_manifest_sha256);
  assert.equal(sha(bytes(admission.F610_final_manifest_path)),admission.F610_final_manifest_sha256);
  assert.equal(sha(bytes(inputPath)),admission.original_input_sha256);
  assert.equal(report.runner_engine_calls+report.delivery_recheck_engine_calls,3);
  report.status='PASS_COUNTERFACTUAL_AUTO_PATH_MOCK_ONLY';report.real_engine_calls=3;
  report.first_blocked_step=null;report.native_AUTO_SENT=false;report.actual_past_day_cause_proved=false;
  report.original_input_sha256=admission.original_input_sha256;report.implementation_pin=modules.implementation_pin;
  report.completed_wall_utc=new Date().toISOString();save('BS_AFFECTED_RESULT.json',report);
  process.stdout.write(JSON.stringify({status:report.status,Node:1,AUTO_execute:1,real_engine_calls:3,MOCK_send:1,actualTelegram:0,nativeSQL:0,sourceHTTP:0})+'\n');
}catch(error){
  report.status='FAIL_PRESERVED_NO_AUTOMATIC_RERUN';report.failure_stage=stage;
  report.failure={name:error.name,code:error.code??null,message:String(error.message).slice(0,300)};
  report.completed_wall_utc=new Date().toISOString();
  if(locked){fs.mkdirSync(privateOut,{recursive:true});save('BS_PRIVATE_FAILURE.json',{stack:error.stack,report},true);save('BS_AFFECTED_RESULT.json',report);}
  process.stderr.write(JSON.stringify({status:report.status,stage,error_name:error.name,code:error.code??null})+'\n');process.exitCode=1;
}
