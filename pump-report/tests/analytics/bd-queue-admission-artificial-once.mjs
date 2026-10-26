// Exactly one ROOT-admitted new ARTIFICIAL queue scenario, baseline/fixed once.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const handoff=resolve(repo,'pump-report/handoffs/analytics/package-bd');
const privateDir='/private/tmp/pump-bd-one-case-1793014556000';
const hash=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value);
const save=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const calls={baseline_execute:0,fixed_execute:0,full_analytics_engine:0};
const checks={};
const T=Date.parse('2026-10-26T09:00:00Z'); // ARTIFICIAL case clock only.
const instrument=tag=>({instrument_id:'BINGX:USDT_M:ARTIFICIAL_BD_'+tag,asset_id:'ARTIFICIAL_BD:'+tag,native_symbol:'BD_'+tag+'-USDT',base:'BD_'+tag,venue:'BINGX',market_type:'PERPETUAL',quote:'USDT',settle:'USDT',classification_status:'VERIFIED_CRYPTO'});
const OLD=instrument('ENDED'),NEW=instrument('NEW'),instruments=[OLD,NEW];
const oldRecord={instrument_id:OLD.instrument_id,first_seen:T-180*60000,last_seen:T-300000,last_checked_ts:T-120*60000,next_check_ts:T-115*60000,last_status:'REJECTED',reported_day_growth:0,preliminary_growth:0,active_wave:false,movement_event_ts:T-300*60000,entry_zones:[],entry_distance_pct:null,confirmed_core_count:0,core_expires_ts:T-1,fixture_history_marker:'KEEP_ARTIFICIAL_ENDED_RECORD'};

await mkdir(privateDir,{recursive:true});
await save(resolve(handoff,'affected-start.json'),{schema:'BD_ONE_QUEUE_CASE_START_V1',case_state:'SPENT_BEFORE_EXECUTION',started_utc:new Date().toISOString(),script_executions:1,controlled_cases:1,ARTIFICIAL_NO_NATIVE_MARKET_FACTS:true,baseline_execute_max:1,fixed_execute_max:1,native_HTTP_MCP_SQL_TG_LOOKUP:0});
try{
  const input=JSON.parse(await readFile(resolve(handoff,'frozen-inputs.json'),'utf8'));
  const admissionBytes=await readFile(resolve(handoff,'ROOT_ONE_CASE_ADMISSION.json'));
  const admission=JSON.parse(admissionBytes);
  assert.equal(admission.status,'ADMITTED_NOT_SPENT');assert.equal(admission.case_count,1);
  assert.ok(admission.expires_ts>Date.now());
  assert.equal(admission.baseline.runner_sha256,'806c9bc83a69d125d1b72eaaf8495d7342912e0fc92776d776e7db3078f97dfd');
  assert.equal(admission.fixed.runner_sha256,'03f8f0cfb13ed86e64500b681f9b33e500bee7630d67b955296c316597bce722');
  const artifactBytes=await readFile(input.artifact_path);assert.equal(hash(artifactBytes),input.artifact_sha256);
  const artifact=JSON.parse(artifactBytes);assert.equal(Object.keys(artifact.modules).length,66);
  for(const row of input.all_module_digests){
    const before=await readFile(resolve(input.baseline_root,row.path)),after=await readFile(resolve(input.fixed_root,row.path));
    assert.equal(hash(before),row.baseline_sha256);assert.equal(hash(after),row.fixed_sha256);
    assert.equal(before.toString('utf8'),artifact.modules[row.path]);
    if(row.path!=='runtime/runner.mjs')assert.equal(after.toString('utf8'),before.toString('utf8'));
  }
  assert.ok(!input.allowed_import_closure.includes('analytics/index.mjs'));
  assert.ok(!input.allowed_import_closure.includes('runtime/worker.mjs'));
  assert.ok(!input.allowed_import_closure.some(p=>p.startsWith('sources/')));
  const beforeText=await readFile(resolve(input.baseline_root,'runtime/runner.mjs'),'utf8');
  const fixedText=await readFile(resolve(input.fixed_root,'runtime/runner.mjs'),'utf8');
  const section=(text,start,end)=>text.slice(text.indexOf(start),text.indexOf(end));
  const staticChecks={
    exact_active_wave_OR_current_near:fixedText.includes('(r.active_wave===true||prequeueNear(r.reported_day_growth,r.preliminary_growth))'),
    discovery_reuses_same_near:fixedText.includes('const near=prequeueNear(row.reported_change_pct,change);'),
    existing_thresholds_only:fixedText.includes("const prequeueNear=(reported,change)=>(typeof reported==='number'&&reported>=profile.automatic_growth.day_pct*profile.prequeue_threshold_fraction)||(change!==null&&change>=profile.automatic_growth.short_pct*profile.prequeue_threshold_fraction);"),
    manual_functions_exact:section(beforeText,'  async function enqueueManual','  async function updateDiscovery')===section(fixedText,'  async function enqueueManual','  async function updateDiscovery'),
    analysis_manual_execute_cleanup_tail_exact:beforeText.slice(beforeText.indexOf('  async function rememberAnalysis'))===fixedText.slice(fixedText.indexOf('  async function rememberAnalysis')),
    all_other65_modules_exact:input.all_module_digests.filter(x=>x.path!=='runtime/runner.mjs').every(x=>x.baseline_sha256===x.fixed_sha256),
    no_priority_profile_manual_carry_module_change:['runtime/candidate-priority.mjs','profile/start-v1.mjs','runtime/budget.mjs','runtime/future-candidate-reserve.mjs','runtime/production-policy.mjs'].every(n=>{const r=input.all_module_digests.find(x=>x.path===n);return r.baseline_sha256===r.fixed_sha256;})
  };
  await save(resolve(handoff,'static-diff-receipt.json'),{schema:'BD_STATIC_CHECKS_WITHIN_ONE_CASE_V1',checks:staticChecks,active_pullback_preserved_by_OR:true,no_active_or_manual_extra_case_executed:true});
  for(const value of Object.values(staticChecks))assert.ok(value);

  async function executeVariant(label,root){
    const {createPumpRunner}=await import(pathToFileURL(resolve(root,'runtime/runner.mjs')).href);
    const {MemoryStore}=await import(pathToFileURL(resolve(root,'runtime/store.mjs')).href);
    const store=new MemoryStore(),events=[];
    const event=(kind,extra={})=>{const row={seq:events.length+1,kind,...extra};events.push(row);return row;};
    await store.set('pump:candidate-queue',{[OLD.instrument_id]:structuredClone(oldRecord)});
    await store.set('pump:active-instruments',[]);
    await store.set('pump:overview-index',[T-300000]);
    await store.set('pump:overview:'+(T-300000),instruments.map(i=>({id:i.instrument_id,last:1,event_ts:T-300000,reported_change_pct:i.instrument_id===OLD.instrument_id?0:20,status:'USABLE'})));
    await store.set('pump:wave:'+OLD.instrument_id,{wave_id:'ARTIFICIAL_BD_CANCELLED_WAVE',instrument_id:OLD.instrument_id,state:'CANCELLED',created_ts:T-5*3600000,expires_ts:T-3600000,cancelled_ts:T-2*3600000,impulse:{end_ts:T-5*3600000}});
    let mode='AUTO',lastEvidence=null,issued=null,admissionAttempts=0;
    const budget={setMode:next=>{mode=next;},summary:()=>({run_id:'ARTIFICIAL_BD_'+label,mode,total:0,lanes:{hot:0,background:0,statistics:0},candidates:{},liquidations:0,unknown:0,receipts:[],limits:{http_per_run:164,manual_http_run_reserve:24,lanes:{hot:96,background:56,statistics:12}}}),
      admitCandidate:async cost=>{
        admissionAttempts++;if(admissionAttempts>2)throw Error('UNEXPECTED_EXTRA_ADMISSION_ATTEMPT');
        assert.ok(lastEvidence);assert.equal(cost.http_upper_bound,12);
        const row=event('fake_admitCandidate',{instrument_id:lastEvidence.instrument_id,source_evidence_seq:lastEvidence.seq,accepted:issued===null,http_upper_bound:cost.http_upper_bound});
        if(issued)return {allowed:false,reason:'PROTECTED_DAY_RESERVE',detail:'ARTIFICIAL_ONE_LOGICAL_PLACE_EXHAUSTED'};
        issued={ticket_id:'ARTIFICIAL_BD_'+label+'_TICKET1',instrument_id:lastEvidence.instrument_id,admission_seq:row.seq};
        return {allowed:true,candidate_quota:{maximum:1,issued:1,remaining:0,never_refunded:true}};
      },reserve:async()=>{throw Error('HTTP_RESERVE_FORBIDDEN');},finalize:async()=>{throw Error('HTTP_FINALIZE_FORBIDDEN');}};
    const price=i=>({fact_id:'ARTIFICIAL_BD_PRICE_'+label+'_'+i.base,instrument_id:i.instrument_id,kind:'price',status:'USABLE',value:1,unit:'USDT_PER_BASE',event_ts:T,received_ts:T,expires_ts:T+30000,origin:'ESTIMATED',source:'ARTIFICIAL_STUB_NO_PROVIDER'});
    const sources={getCatalog:async()=>{event('stub_catalog');return {instruments,unqualified:[],coverage:{status:'CHECKED'}};},
      getOverview:async args=>{
        if(args.purpose==='DISCOVERY')event('stub_discovery',{instrument_ids:args.instruments.map(i=>i.instrument_id)});
        else {assert.equal(args.instruments.length,1);assert.ok(issued);assert.equal(args.instruments[0].instrument_id,issued.instrument_id);event('stub_candidate_overview',{instrument_id:args.instruments[0].instrument_id,ticket_id:issued.ticket_id});}
        return {observations:args.instruments.map(i=>({instrument:i,facts:{price:price(i)},reported_change_pct:i.instrument_id===OLD.instrument_id?0:20})),coverage:{status:'CHECKED'}};
      },getCore:async({instrument:i})=>{assert.ok(issued);assert.equal(i.instrument_id,issued.instrument_id);event('stub_getCore',{instrument_id:i.instrument_id,ticket_id:issued.ticket_id});return {facts:{},coverage:{status:'USABLE'}};},
      getOptional:async()=>{throw Error('UNEXPECTED_OPTIONAL_IO');},getLiquidations:async()=>{throw Error('UNEXPECTED_MAP_IO');}};
    const delivery={pending:async()=>[],drain:async()=>[],enqueue:async()=>{throw Error('TELEGRAM_ENQUEUE_FORBIDDEN');},dispatch:async()=>{throw Error('TELEGRAM_DISPATCH_FORBIDDEN');}};
    const runner=createPumpRunner({store,sources,budget,delivery,clock:()=>T,run_purpose:'PRODUCTION',evidence_class:'ARTIFICIAL_BD',assess_source_evidence:i=>{lastEvidence=event('assess_source_evidence',{instrument_id:i.instrument_id});return {eligible:true};},
      analyzePump:input=>{event('analysis_stub_NOT_FULL_ENGINE',{instrument_id:input.instrument.instrument_id});return {run_id:input.run_id,mode:input.mode,run_purpose:input.run_purpose,analysis_ts:T,instrument:input.instrument,reference_price:1,ready:false,automatic_eligible:false,status:'REJECTED',reasons:['ARTIFICIAL_NO_SIGNAL'],wave_id:input.previous_wave?.wave_id??null,wave_state:input.previous_wave?.state??null,previous_wave:input.previous_wave,next_wave:input.previous_wave,plan:null};},
      evaluateOutcome:()=>{throw Error('NO_SIGNAL_OUTCOME_EXPECTED');}});
    calls[label+'_execute']++;
    const result=await runner.execute({mode:'AUTO',run_id:'ARTIFICIAL_BD_'+label,publish:false});
    await save(resolve(privateDir,label+'-full-artificial-result.json'),result);
    const queue=await store.get('pump:candidate-queue'),saved=await store.get('pump:run:ARTIFICIAL_BD_'+label),executor=await store.get('pump:executor');
    const out={schema:'BD_ARTIFICIAL_VARIANT_RECEIPT_V1',variant:label,ARTIFICIAL_NOT_NATIVE_AUTO:true,run_status:result.status,issued_ticket:issued,logical_places_issued:issued?1:0,admission_attempts:admissionAttempts,
      checked_ids:result.checked.map(x=>x.analysis?.instrument.instrument_id),deferred:result.deferred??[],errors:result.errors,
      fake_CORE_ids:events.filter(x=>x.kind==='stub_getCore').map(x=>x.instrument_id),analysis_stub_ids:events.filter(x=>x.kind==='analysis_stub_NOT_FULL_ENGINE').map(x=>x.instrument_id),events,
      old_row:queue[OLD.instrument_id],new_row:queue[NEW.instrument_id],saved_run_exact:json(saved)===json(result),saved_run_sha256:hash(json(saved)),executor_owner_null:executor?.owner===null,native_HTTP_MCP_SQL_TG_LOOKUP:0};
    await save(resolve(handoff,label+'-result.json'),out);return out;
  }
  const baseline=await executeVariant('baseline',input.baseline_root);
  const fixed=await executeVariant('fixed',input.fixed_root);
  checks.baseline_ticket_attributed_to_ended=baseline.issued_ticket.instrument_id===OLD.instrument_id&&json(baseline.fake_CORE_ids)===json([OLD.instrument_id]);
  checks.fixed_ticket_attributed_to_new=fixed.issued_ticket.instrument_id===NEW.instrument_id&&json(fixed.fake_CORE_ids)===json([NEW.instrument_id]);
  checks.one_logical_place_each=baseline.logical_places_issued===1&&fixed.logical_places_issued===1;
  checks.one_completed_check_each=baseline.checked_ids.length===1&&fixed.checked_ids.length===1;
  checks.baseline_new_deferred_after_spent_ticket=baseline.admission_attempts===2&&baseline.deferred.length===1&&baseline.deferred[0].instrument_id===NEW.instrument_id;
  checks.fixed_ended_not_admitted=fixed.admission_attempts===1&&fixed.deferred.length===0;
  checks.old_record_preserved_in_fixed=fixed.old_row?.fixture_history_marker===oldRecord.fixture_history_marker&&fixed.old_row.first_seen===oldRecord.first_seen;
  checks.old_checked_clock_untouched_in_fixed=fixed.old_row.last_checked_ts===oldRecord.last_checked_ts&&fixed.old_row.next_check_ts===oldRecord.next_check_ts;
  checks.old_current_non_near_retained=fixed.old_row.active_wave===false&&fixed.old_row.reported_day_growth===0&&fixed.old_row.preliminary_growth===0;
  checks.new_current_near_20=fixed.new_row.reported_day_growth===20;
  checks.baseline_updates_old_checked_clock=baseline.old_row.last_checked_ts===T;
  checks.fixed_updates_new_checked_clock=fixed.new_row.last_checked_ts===T;
  checks.both_runs_saved_and_executor_released=baseline.saved_run_exact&&fixed.saved_run_exact&&baseline.executor_owner_null&&fixed.executor_owner_null;
  checks.stub_analysis_only=json(baseline.analysis_stub_ids)===json([OLD.instrument_id])&&json(fixed.analysis_stub_ids)===json([NEW.instrument_id]);
  checks.attribution_follows_actual_call_sequence=[baseline,fixed].every(v=>{
    const accepted=v.events.find(x=>x.kind==='fake_admitCandidate'&&x.accepted),evidence=v.events.find(x=>x.seq===accepted.source_evidence_seq),overview=v.events.find(x=>x.kind==='stub_candidate_overview'),core=v.events.find(x=>x.kind==='stub_getCore');
    return evidence.instrument_id===v.issued_ticket.instrument_id&&overview.instrument_id===evidence.instrument_id&&core.instrument_id===evidence.instrument_id&&evidence.seq<accepted.seq&&accepted.seq<overview.seq&&overview.seq<core.seq;
  });
  for(const value of Object.values(checks))assert.ok(value);
  assert.deepEqual(calls,{baseline_execute:1,fixed_execute:1,full_analytics_engine:0});
  const result={schema:'BD_ONE_CONNECTED_QUEUE_CASE_RESULT_V1',status:'PASS',script_executions:1,controlled_cases:1,calls,checks,static_checks:staticChecks,
    fixture_kind:'ARTIFICIAL_TWO_ROW_QUEUE_NOT_DOOD_OR_KIMCHI',fixture_clock:T,old_static_score:120,new_static_score:20,
    baseline_selected:baseline.issued_ticket.instrument_id,fixed_selected:fixed.issued_ticket.instrument_id,logical_places_per_branch:1,
    baseline_receipt_sha256:hash(json(baseline)),fixed_receipt_sha256:hash(json(fixed)),ROOT_admission_sha256:hash(admissionBytes),
    actual_admitCandidate_has_no_instrument_arg:'Attribution uses immediately preceding real checkInstrument source-evidence callback and matching candidate overview/getCore, not an invented budget API parameter.',
    accepted_old_suites_replayed:false,native_AUTO_SENT_or550coverage_proven:false,native_HTTP_MCP_SQL_TG_Worker_deploy_CONTROL_LOOKUP:0,ROOT_runtime_modified_by_BD:false,private_artificial_results:privateDir};
  await save(resolve(handoff,'affected-result.json'),result);
  process.stdout.write(JSON.stringify({status:'PASS',controlled_cases:1,calls,baseline_selected:result.baseline_selected,fixed_selected:result.fixed_selected,logical_places_per_branch:1,native:0})+'\n');
}catch(error){
  await save(resolve(handoff,'affected-failure.json'),{schema:'BD_ONE_CASE_FAILURE_V1',calls,checks,error_name:error.name,error_message:error.message,do_not_rerun:true,native:0});throw error;
}
