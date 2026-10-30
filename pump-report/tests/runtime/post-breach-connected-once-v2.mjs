import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildArtifact} from '../../runtime/build.mjs';
import {preparePostBreachInstallPackage} from '../../operator/prepare-post-breach-install-package.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const a=read(process.argv[2]),lease=read('checkpoints/CLOUD_PHASE_STATE_20261004.json').lease;
assert.equal(a.schema,'ROOT_POST_BREACH_CONNECTED_OFFLINE_ADMISSION_V1');assert.equal(a.status,'ADMITTED_NOT_SPENT');
assert.equal(a.maximum_attempts,1);assert.equal(a.Node_processes,1);assert.equal(a.max_builds,1);
assert.equal(lease.owner,a.own_lease.owner);assert(Date.now()<a.expires_ts&&a.expires_ts<=lease.expires_ts);
for(const[p,h]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
assert.equal(sha(fs.readFileSync(a.base_artifact)),a.base_artifact_sha256);
fs.mkdirSync(a.private_case_dir,{recursive:false,mode:0o700});
const attempt=path.join(a.private_case_dir,'attempt.json');
fs.writeFileSync(attempt,JSON.stringify({state:'STARTED',Node:1,no_auto_retry:true}),{flag:'wx',mode:0o600});
globalThis.fetch=()=>{throw Error('OFFLINE_NETWORK_FORBIDDEN');};
const r={schema:'ROOT_POST_BREACH_CONNECTED_CASE_V1',status:'STARTED',authority_main:a.authority_main,Node:1,builds:0,
 engine_calls:0,pure_movement_calls:0,pure_cause_calls:0,guard_checks:0,queue_checks:0,operator_syntax_checks:0,named_gate_constructor_calls:0,named_sql_transform_calls:0,mock_CF_requests:0,mock_Telegram:0,
 native_SQL:0,Cloudflare_HTTP:0,market_HTTP:0,Telegram:0,real_AUTO_SENT:false,stages:[]};
const save=()=>fs.writeFileSync(a.output,JSON.stringify(r,null,2)+'\n');
const mark=(stage,details={})=>{r.stages.push({stage,...details});save();};
let stage='EXACT_FROZEN_BUILD';
try{
 const base=read(a.base_artifact),legacyArtifactPath=path.join(a.private_case_dir,'legacy-worker.mjs');
 fs.writeFileSync(legacyArtifactPath,base.modules['legacy-worker.mjs'],{flag:'wx',mode:0o600});
 const overrides={...base.modules};
 for(const[name,p]of Object.entries(a.new_sources))overrides[name]=fs.readFileSync(p,'utf8');
 const artifactPath=path.join(a.private_case_dir,'artifact.json');r.builds++;
 buildArtifact({legacy_path:legacyArtifactPath,output_path:artifactPath,module_overrides:overrides});
 const bytes=fs.readFileSync(artifactPath),artifact=JSON.parse(bytes),pin=artifact.manifest.implementation_pin.sha256;
 const changed=Object.keys(artifact.modules).filter(n=>base.modules[n]!==artifact.modules[n]).sort();
 assert.deepEqual(changed,a.expected_changed_modules);assert.deepEqual(artifact.metadata,base.metadata);
 assert(Object.keys(base.modules).every(n=>Object.hasOwn(artifact.modules,n)));
 assert.equal(artifact.modules['analytics/index.mjs'],base.modules['analytics/index.mjs'].replace("export const RULES_VERSION='pump-analytics-v7-targets-20261029';","export const RULES_VERSION='"+a.rules_version+"';"));
 const targetMarker='export function selectJustifiedPlanTarget';
 assert.equal(artifact.modules['analytics/movement.mjs'].slice(artifact.modules['analytics/movement.mjs'].indexOf(targetMarker)),base.modules['analytics/movement.mjs'].slice(base.modules['analytics/movement.mjs'].indexOf(targetMarker)));
 const dir=path.join(a.private_case_dir,'modules');fs.mkdirSync(dir);
 for(const[n,s]of Object.entries(artifact.modules)){const p=path.join(dir,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s,{flag:'wx',mode:0o600});}
 const load=n=>import(pathToFileURL(path.join(dir,n)).href);
 const [{analyzePump,RULES_VERSION},{analyzeMovement},{provePostBreachCause},{waveLifetimeValid},{START_PROFILE:profile},queue,{MemoryStore},{createDelivery,textHash},{createOutcomeJournal}]=await Promise.all([
  load('analytics/index.mjs'),load('analytics/movement.mjs'),load('analytics/post-breach-wave.mjs'),load('contracts/wave-lifetime.mjs'),
  load('profile/start-v1.mjs'),load('runtime/candidate-priority.mjs'),load('runtime/store.mjs'),load('runtime/delivery.mjs'),load('runtime/outcome-journal.mjs')]);
 assert.equal(RULES_VERSION,a.rules_version);
 mark(stage,{artifact_path:artifactPath,artifact_sha256:sha(bytes),implementation_sha256:pin,module_count:artifact.manifest.module_count,
  changed_modules:changed,unchanged_before_modules:Object.keys(base.modules).filter(n=>base.modules[n]===artifact.modules[n]).length});
 const engine=input=>{assert(r.engine_calls<a.max_engine_calls);r.engine_calls++;const before=JSON.stringify(input),out=analyzePump(input,profile);assert.equal(JSON.stringify(input),before);return out;};

 stage='POST_BREACH_NEW_BEHAVIOR';
 const {createPostBreachVectors,BZ45_VECTOR_STATUS}=await import(pathToFileURL(path.resolve(a.vector_factory)).href);
 assert.equal(BZ45_VECTOR_STATUS,'UNEXECUTED_ARTIFICIAL_FACTORIES_NOT_MARKET_PROOF');
 const vectors=createPostBreachVectors({profile}),cache=new Map(),results=[];let firstWave=null,firstFixture=null;
 for(const v of vectors){
  const x=v.continueWith?v.continueWith(firstWave):v,expected=v.expected;
  const before=JSON.stringify(x.input);
  assert(r.pure_cause_calls<a.max_pure_cause_calls);r.pure_cause_calls++;
  const cause=provePostBreachCause(x.input,x.rows,profile);
  if(cause&&Number.isSafeInteger(x.expected_breach_close)){
    const witness=x.rows.find(row=>row.close_ts===x.expected_breach_close);
    assert(witness,v.id);assert.equal(cause.terminal_event_ts,x.expected_breach_close,v.id);
    assert.equal(cause.breach_open_ts,witness.open_ts);assert.equal(cause.breach_close_ts,witness.close_ts);assert.equal(cause.breach_low,witness.low);
    assert.equal(cause.protected_base,x.input.previous_wave.invalidation_price);assert.equal(cause.prior_cancelled_ts,x.input.previous_wave.cancelled_ts);
    assert.equal(cause.proof_received_ts,x.input.facts.candles.received_ts);assert.equal(cause.rearm_decided_ts,x.input.analysis_ts);
    assert.equal(cause.cause_fact_id,x.input.facts.candles.fact_id);assert.equal(cause.cause_evidence_ref,x.input.facts.candles.evidence_ref);
  }
  if(Object.hasOwn(expected,'proved_cause')){assert.equal(cause,expected.proved_cause,v.id);results.push({id:v.id,status:'PASS',cause_proved:Boolean(cause)});continue;}
  const key=sha(JSON.stringify({input:x.input,rows:x.rows,price:x.price}));
  let out=cache.get(key);
  if(!out){assert(r.pure_movement_calls<a.max_pure_movement_calls);r.pure_movement_calls++;out=analyzeMovement(x.input,x.rows,x.price,x.ticker,profile);cache.set(key,out);}
  assert.equal(JSON.stringify(x.input),before,v.id);
  if(expected.new_distinct_wave||expected.new_id_differs_from_prior){assert(out.next_wave&&out.wave_id!==x.input.previous_wave.wave_id,v.id);assert(out.next_wave.post_breach_rearm,v.id);}
  if(expected.new_post_breach_marker===false)assert.equal(out.next_wave?.post_breach_rearm,undefined,v.id);
  if(expected.state)assert.equal(out.state,expected.state,v.id);
  if(expected.reason)assert(out.reasons.includes(expected.reason),v.id+':'+JSON.stringify(out.reasons));
  if(expected.old_cancelled_preserved||expected.no_reanchor)assert.deepEqual(out.next_wave,x.input.previous_wave,v.id);
  if(expected.same_old_wave_id)assert.equal(out.wave_id,x.input.previous_wave.wave_id,v.id);
  if(expected.created_equals_current_analysis||expected.created_equals_later_analysis)assert.equal(out.next_wave.created_ts,x.input.analysis_ts,v.id);
  if(expected.anchor_equals_selected_impulse_end||expected.expiry_from_anchor){assert.equal(out.next_wave.lifetime_anchor_ts,out.impulse.end_ts);assert.equal(out.next_wave.expires_ts,out.impulse.end_ts+profile.wave_max_age_ms);}
  if(expected.receipt_after_prior_cancel_allowed)assert(out.next_wave.post_breach_rearm.proof_received_ts>out.next_wave.post_breach_rearm.prior_cancelled_ts,v.id);
  if(expected.cancelled_equals_current_analysis)assert.equal(out.next_wave.cancelled_ts,x.input.analysis_ts,v.id);
  if(expected.old_expiry_unchanged)assert.equal(out.next_wave.expires_ts,x.input.previous_wave.expires_ts,v.id);
  if(expected.same_seed_anchor_and_expiry){assert.equal(out.next_wave.impulse.start_ts,firstWave.impulse.start_ts);assert.equal(out.next_wave.lifetime_anchor_ts,firstWave.lifetime_anchor_ts);assert.equal(out.next_wave.expires_ts,firstWave.expires_ts);}
  if(expected.identity_origin_anchor_created_expiry_unchanged)for(const k of ['wave_id','post_breach_rearm','lifetime_anchor_ts','created_ts','expires_ts'])assert.deepEqual(out.next_wave[k],firstWave[k],v.id+':'+k);
  if(expected.qualification_not_inherited_from_predecessor)assert(!JSON.stringify(out.next_wave.qualification).includes('OLD_QUALIFICATION_MUST_NOT_TRANSFER'));
  if(expected.new_id_contains_post_breach_version)assert(out.wave_id.includes(':POST_BREACH_V1:'));
  if(expected.raw_fact_status_unchanged)assert.equal(x.input.facts.candles.status,expected.raw_fact_status_unchanged);
  if(v.id==='known_closed_cause_and_late_receipt'){firstWave=structuredClone(out.next_wave);firstFixture=x;}
  results.push({id:v.id,status:'PASS',state:out.state,wave_id:out.wave_id,reasons:out.reasons,anchor:out.next_wave?.lifetime_anchor_ts??null,expiry:out.next_wave?.expires_ts??null,cause_proved:Boolean(cause),artificial:true});
 }
 assert(firstWave&&firstFixture);mark(stage,{vectors:results,unique_movement_inputs:cache.size,old_accepted_suites_replayed:0});

 stage='SHARED_CLOCK_AND_QUEUE_COUNTEREXAMPLES';
 const guard=(w,expected,name)=>{assert(r.guard_checks<a.max_guard_checks);r.guard_checks++;assert.equal(waveLifetimeValid(w,firstFixture.input.analysis_ts,profile),expected,name);};
 guard(firstWave,true,'valid_new_geometry');
 for(const[name,mutate]of [
  ['late_receipt_must_contain_closed_seed',w=>{w.post_breach_rearm.proof_received_ts=w.impulse.end_ts-1;}],
  ['no_late_asof_plus4h_reset',w=>{w.expires_ts=w.created_ts+profile.wave_max_age_ms;}],
  ['partial_new_marker_no_legacy_fallback',w=>{delete w.post_breach_rearm;}]
 ]){const w=structuredClone(firstWave);mutate(w);guard(w,false,name);}
 const legacy=structuredClone(firstWave);delete legacy.lifetime_anchor_ts;delete legacy.post_breach_rearm;legacy.expires_ts=legacy.created_ts+profile.wave_max_age_ms;guard(legacy,true,'legacy_clock_unchanged');
 const at=firstFixture.input.analysis_ts,metadata=queue.queueWaveMetadata(firstWave,firstWave.instrument_id,at,profile);r.queue_checks++;
 assert.equal(queue.queueWaveState(metadata,at,profile),'LIVE');r.queue_checks++;
 assert.equal(queue.queueWaveState(metadata,firstWave.expires_ts,profile),'EXPIRED');r.queue_checks++;
 const invalid=structuredClone(firstWave);delete invalid.post_breach_rearm;
 const cleared=queue.queueWaveMetadata(invalid,firstWave.instrument_id,at,profile);r.queue_checks++;
 const merged={...metadata,...cleared};assert.equal(queue.queueWaveState(merged,at,profile),'UNKNOWN');r.queue_checks++;
 assert.equal(merged.wave_lifetime_kind,null);assert.equal(merged.wave_lifetime_anchor_ts,null);assert.equal(merged.wave_expires_ts,null);
 const legacyMetadata=queue.queueWaveMetadata(legacy,legacy.instrument_id,at,profile);r.queue_checks++;
 assert.equal(queue.queueWaveState({...metadata,...legacyMetadata},at,profile),'LIVE');r.queue_checks++;
 mark(stage,{invalid_wave_clears_prior_BOUND_LIVE_to_UNKNOWN:true,legacy_and_new_anchor_geometry_separate:true,clock_checks:r.guard_checks,queue_checks:r.queue_checks});

 stage='SAME_SAVED_IDOL_AND_EXPLICIT_COUNTERFACTUAL';
 const packet=read(a.private_actual14),candidate=packet.latest_candidates.find(c=>c.instrument_id.endsWith(':IDOL-USDT')),original=candidate.private_evidence.original;
 assert.equal(sha(fs.readFileSync(a.private_actual14)),a.private_actual14_sha256);
 const actualInput=structuredClone(original.input),oldResult=engine(actualInput);
 assert.equal(oldResult.wave_id,original.analysis.wave_id);assert.equal(oldResult.wave_state,'CANCELLED');assert.equal(oldResult.ready,false);
 assert.equal(oldResult.next_wave.created_ts,original.analysis.next_wave.created_ts);
 assert.equal(oldResult.next_wave.expires_ts,original.analysis.next_wave.expires_ts);
 assert.deepEqual(oldResult.next_wave.impulse,original.analysis.next_wave.impulse);
 const nextInput=structuredClone(original.input);nextInput.previous_wave=structuredClone(original.analysis.next_wave);
 const rearm=engine(nextInput);
 if(rearm.next_wave?.post_breach_rearm){assert.notEqual(rearm.wave_id,nextInput.previous_wave.wave_id);assert.equal(rearm.next_wave.created_ts,nextInput.analysis_ts);assert.equal(rearm.next_wave.expires_ts,rearm.next_wave.impulse.end_ts+profile.wave_max_age_ms);}
 else assert.equal(rearm.ready,false);
 mark(stage,{evidence_class:'CACHED_ORIGINAL_AND_EXPLICIT_COUNTERFACTUAL_NOT_NATIVE',actual_saved_input_old_wave_stays_CANCELLED:{ready:oldResult.ready,reasons:oldResult.reasons},
  counterfactual_same_facts_CANCELLED_previous:{ready:rearm.ready,reasons:rearm.reasons,wave_id:rearm.wave_id,post_breach:Boolean(rearm.next_wave?.post_breach_rearm),plan_diagnostic:rearm.plan_diagnostic},
  original_file_immutable_sha256:a.private_actual14_sha256,current_freshness_not_claimed:true});

 stage='ARTIFICIAL_NEW_WAVE_PLAN_TO_SAME_TEXT_RECEIPT';
 const positiveInput=structuredClone(firstFixture.input),support=positiveInput.facts.candles.value.find(row=>row.open_ts===1800000000000-120*60000);
 assert(support);support.high=104.2;positiveInput.run_id='ARTIFICIAL_POST_BREACH_CONNECTED';positiveInput.run_purpose='ACCEPTANCE_TEST';
 const analysis=engine(positiveInput);
 assert(analysis.ready&&analysis.automatic_eligible,JSON.stringify({reasons:analysis.reasons,diagnostic:analysis.plan_diagnostic}));
 assert(analysis.next_wave.post_breach_rearm);assert(analysis.plan.potential_pct.minimum>=10);
 assert(analysis.card_text.length<=4096);assert.match(analysis.card_text,/Карта ликвидаций недоступна/);
 const store=new MemoryStore(),key='pump:analysis:'+sha(JSON.stringify(analysis)),oldJournalKey='pump:journal:'+analysis.instrument.instrument_id+':'+positiveInput.previous_wave.wave_id;
 const oldJournal={schema:'ARTIFICIAL_OLD_CANCELLED_JOURNAL',terminal:{state:'CANCELLED',event_ts:positiveInput.previous_wave.cancelled_ts}};
 await store.set(oldJournalKey,oldJournal);
 await store.set(key,{analysis,input:positiveInput,saved_ts:positiveInput.analysis_ts,implementation_sha256:pin,evidence_class:'ARTIFICIAL'});
 const journal=createOutcomeJournal({store,profile,clock:()=>positiveInput.analysis_ts,evidence_class:'ARTIFICIAL'});
 await journal.remember(analysis,positiveInput,key,{defer_index:true});
 assert.deepEqual(await store.get(oldJournalKey),oldJournal);
 const newJournal=await store.get('pump:journal:'+analysis.instrument.instrument_id+':'+analysis.wave_id);
 assert.equal(newJournal.wave_expires_ts,analysis.next_wave.lifetime_anchor_ts+profile.wave_max_age_ms);
 const delivery=createDelivery({store,recipient:'12345',clock:()=>positiveInput.analysis_ts,revalidate:async()=>({valid:true}),send:async req=>{
  r.mock_Telegram++;assert.equal(r.mock_Telegram,1);assert.equal(req.text,analysis.card_text);
  return{ok:true,status:200,http_started_ts:positiveInput.analysis_ts,http_ack_received_ts:positiveInput.analysis_ts,http_clock_basis:'CALL_TO_FETCH_AND_PARSED_ACK_NOT_WIRE_TIMESTAMP',
   body:{ok:true,result:{message_id:987,chat:{id:12345},text:req.text}}};}});
 const card=await delivery.enqueue({...analysis,source_input_key:key},{mode:'AUTO',expires_ts:positiveInput.analysis_ts+10000}),sent=await delivery.dispatch(card.card_id),saved=await store.get('pump:card:'+card.card_id);
 assert.equal(sent.state,'SENT');assert.equal(sent.receipt_readback,true);assert.equal(saved.text,analysis.card_text);assert.equal(saved.text_hash,await textHash(analysis.card_text));
 const {readSavedAutoObservation}=await import('../../operator/saved-auto-observation.mjs');
 const observed=await readSavedAutoObservation({store,implementation_sha256:pin,expected_recipient_sha256:sha('12345'),clock:()=>positiveInput.analysis_ts,include_executor:false});
 assert.equal(observed.first_genuine_same_original_SENT_observed,false);
 mark(stage,{evidence_class:'ARTIFICIAL_NOT_NATIVE',support_fixture:'one explicit closed HIGH104.2 at T-120min, no product threshold change',ready:true,
  old_cancelled_journal_preserved:true,new_journal_expiry_from_seed:true,minimum_potential_pct:analysis.plan.potential_pct.minimum,
  exact_text_and_memory_receipt_readback:true,real_Telegram:0,artificial_not_promoted_to_production:true});

 stage='EXACT_ARTIFACT_OPERATOR_AND_CONTROLLER_PACKAGE';
 const generated=preparePostBreachInstallPackage({base_artifact:base,artifact,artifact_sha256:sha(bytes),rules_version:RULES_VERSION});
 for(const f of generated.files)if(f.path.endsWith('.mjs')){assert(r.operator_syntax_checks<a.max_operator_syntax_checks);r.operator_syntax_checks++;new vm.SourceTextModule(fs.readFileSync(f.path,'utf8'));}
 const {createPostBreachNamedSqlException,POST_BREACH_LOOKUP_IDS}=await import(pathToFileURL(path.resolve('pump-report/operator/post-breach-owner15-16-sql-exception.mjs')).href);
 const now=Date.now(),gateCases=[],gate=(ad)=>{assert(r.named_gate_constructor_calls<a.max_named_gate_constructor_calls);r.named_gate_constructor_calls++;return createPostBreachNamedSqlException(ad,now);};
 for(const n of[15,16]){
  const ad={mode:'LOOKUP',run_id:POST_BREACH_LOOKUP_IDS[n],implementation_sha256:n===15?base.manifest.implementation_pin.sha256:pin,native_query_cap:16,expires_ts:now+120000,
   lookup_single_exception:{schema:'OWNER_POST_BREACH_INSTALL_AND_ACCEPTANCE_15_16_V1',status:'APPROVED_BY_DIRECT_OWNER',extra_number:n,approval_message_sha256:'a'.repeat(64),
    owner_thread_id:'01a171f7-596e-7dc0-a82f-3e92f57f4ef6',day_utc:'2026-10-29',approved_run_ids:[POST_BREACH_LOOKUP_IDS[15],POST_BREACH_LOOKUP_IDS[16]],maximum_new_runs:2,
    exact_run_id:POST_BREACH_LOOKUP_IDS[n],target_artifact_sha256:sha(bytes),previous_run_count:n-1,additional_runs:1,maximum_count_after:n,
    rows_read:500,rows_written:30,max_queries:16,approved_ts:now-1,expires_ts:now+60000}};
  const params=Array(17).fill(0);Object.assign(params,{0:'PUMP:LOOKUP:'+ad.run_id,1:'2026-10-29',2:500,3:30,15:1,16:10});
  const sql='INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(...) AND (?16=0 OR lookup_count<?17)',f=gate(ad);r.named_sql_transform_calls++;const bound=f(sql,params);
  assert.equal(bound.params[16],n);assert(bound.sql.includes('AND lookup_count='+(n-1)+' '));r.named_sql_transform_calls++;assert.throws(()=>f(sql,params));
  for(const mutate of [x=>{x.lookup_single_exception.target_artifact_sha256='b'.repeat(64);},x=>{x.lookup_single_exception.previous_run_count--;},x=>{x.lookup_single_exception.status='NOT_APPROVED';},x=>{x.lookup_single_exception.expires_ts=now-1;}]){
   const bad=structuredClone(ad);mutate(bad);assert.throws(()=>gate(bad));}
  gateCases.push({extra:n,mock_only:true,replay_wrongartifact_wrongcount_unapproved_expired_refused:true});
 }
 const template=fs.readFileSync('pump-report/operator/cloudflare-post-breach-control.template.js','utf8'),accountId='70ee0af85191ea470e74c7383fdec772';
 let mockModules=structuredClone(base.modules),mutations=0;
 const settings={bindings:[{name:'PUMP_REPORT_ENABLED',type:'plain_text',text:'0'},{name:'PUMP_REPORT_DELIVERY_ENABLED',type:'plain_text',text:'1'},
  {name:'DATA_DB',type:'d1',id:'057a2847-2cc4-4e52-8534-1be1596d21d5'},...Array.from({length:18},(_,i)=>({name:'MOCK_KEEP_'+i,type:'plain_text',text:'UNCHANGED'}))],compatibility_date:'2026-09-11',compatibility_flags:[]};
 const beforeSettings=structuredClone(settings),boundary='----POST_BREACH_OFFLINE_ONLY';
 const multipart=m=>Object.entries(m).map(([n,s])=>'--'+boundary+'\r\nContent-Disposition: form-data; name="'+n+'"; filename="'+n+'"\r\nContent-Type: application/javascript+module\r\n\r\n'+s+'\r\n').join('')+'--'+boundary+'--\r\n';
 const cloudflare={async request(req){r.mock_CF_requests++;assert(r.mock_CF_requests<=a.max_mock_CF_requests);
  if(req.method==='GET')return{status:200,success:true,result:req.path.endsWith('/settings')?structuredClone(settings):req.path.endsWith('/schedules')?{schedules:req.path.includes('/my-report-2-hub/')?[{cron:'*/5 7-16 * * *'}]:[]}:multipart(mockModules)};
  assert.equal(req.method,'PUT');assert(req.path.endsWith('/my-report-2-hub/content'));mutations++;
  const b=req.body.slice(0,req.body.indexOf('\r\n')),parts={};for(const part of req.body.split(b).slice(1,-1)){const cut=part.indexOf('\r\n\r\n'),n=part.slice(0,cut).match(/\bname="([^"]+)"/)[1];parts[n]=part.slice(cut+4,-2);}
  assert.deepEqual(JSON.parse(parts.metadata),{main_module:'worker-entry.mjs'});delete parts.metadata;mockModules=parts;return{status:200,success:true,result:{}};}};
 const hashes=m=>Object.fromEntries(Object.entries(m).map(([n,s])=>[n,sha(s)]));
 const config={schema:'ROOT_PRODUCTION_CONTROL_PLANE_ADMISSION_V1',status:'ADMITTED_NOT_SPENT',maximum_attempts:1,action:'INSTALL',authority_main:a.authority_main,
  issued_ts:Date.now(),expires_ts:a.expires_ts,own_lease:a.own_lease,admin_HTTP_max:11,before_modules_sha256:hashes(base.modules),after_modules_sha256:hashes(artifact.modules),
  before_pin:base.manifest.implementation_pin.sha256,after_pin:pin,before_artifact_sha256:sha(fs.readFileSync(a.base_artifact)),after_artifact_sha256:sha(bytes),
  after_rules_version:RULES_VERSION,main_module:'worker-entry.mjs',install_module_overrides:Object.fromEntries(changed.map(n=>[n,artifact.modules[n]])),
  quiescence:{state:'FINALIZED',observation_status:'QUIESCENT_CODE_UPDATE_ALLOWED',executor_owner:null,implementation_sha256:base.manifest.implementation_pin.sha256,observed_ts:Date.now()}};
 const ctl=Function('cloudflare','accountId','return ('+template.replace('__PUMP_CONFIG__',()=>JSON.stringify(config))+');')(cloudflare,accountId),proof=await ctl();
 assert.equal(proof.state,'CONFIRMED_FULL',proof.error);assert.equal(r.mock_CF_requests,11);assert.equal(mutations,1);assert.deepEqual(mockModules,artifact.modules);assert.deepEqual(settings,beforeSettings);
 mark(stage,{generated_files:generated.files,named_gate_cases:gateCases,owner_15_16_approval:false,native_IO_admission:false,mock_controller_requests:r.mock_CF_requests,all21bindings_and3schedules_preserved:true});
 Object.assign(r,{status:'PASS',artifact_path:artifactPath,artifact_sha256:sha(bytes),implementation_sha256:pin,module_count:artifact.manifest.module_count,changed_modules:changed,generated_files:generated.files,
  approved_policy_only_not_native_installation:true,full_TZ_complete:false,first_genuine_AUTO_SENT:false});
 mark('COMPLETE');fs.writeFileSync(attempt,JSON.stringify({state:'COMPLETED',status:'PASS',result_sha256:sha(fs.readFileSync(a.output)),no_auto_retry:true}));
 console.log(JSON.stringify({status:r.status,Node:r.Node,builds:r.builds,engine_calls:r.engine_calls,artifact_sha256:r.artifact_sha256,implementation_sha256:pin,module_count:r.module_count,real_IO:0}));
}catch(error){Object.assign(r,{status:'FAILED_PRESERVED_NO_AUTO_RETRY',failed_stage:stage,error_type:error.name,error_message:String(error.message).slice(0,300)});save();fs.writeFileSync(attempt,JSON.stringify({state:r.status,failed_stage:stage,no_auto_retry:true}));console.log(JSON.stringify({status:r.status,failed_stage:stage,error:r.error_message,engine_calls:r.engine_calls,builds:r.builds}));process.exitCode=1;}
