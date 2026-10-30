import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readPausedExecutorBounded} from '../../operator/paused-executor-bounded.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const a=read(process.argv[2]),own=read('checkpoints/CLOUD_PHASE_STATE_20261004.json').lease;
assert.equal(a.schema,'ROOT_TARGET_PLAN_CONNECTED_QUALIFICATION_ADMISSION_V1');
assert.equal(a.status,'ADMITTED_ONE_CONNECTED_TARGET_CASE_AND_BUILD');
assert.equal(a.Node_processes,1);assert.equal(a.max_cases,1);assert.equal(a.max_builds,1);
assert(own.owner===a.own_lease.owner&&!own.released&&Date.now()<a.expires_ts&&a.expires_ts<=own.expires_ts);
for(const[p,h]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
fs.writeFileSync(a.output+'.attempt',JSON.stringify({started_ts:Date.now(),authority_main:a.authority_main,Node:1,real_IO:0}),{flag:'wx',mode:0o600});
globalThis.fetch=()=>{throw Error('OFFLINE_NO_REAL_NETWORK');};
const report={schema:'ROOT_TARGET_PLAN_CONNECTED_CASE_V1',status:'STARTED',authority_main:a.authority_main,case_count:1,Node_processes:1,
 engine_calls:0,pure_plan_calls:0,pure_target_selector_calls:0,builds:0,mock_controller_calls:0,mock_Telegram_calls:0,native_SQL:0,Cloudflare_HTTP:0,market_HTTP:0,Telegram:0,installed:false,real_AUTO_SENT:false,stages:[]};
const save=()=>fs.writeFileSync(a.output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
const mark=(stage,data={})=>{report.stages.push({stage,...data});save();};
let stage='BUILD_EXACT_PROPOSED_GRAPH';
try{
 const base=read(a.base_artifact),predecessor=read(a.predecessor_artifact),proposed={...base.modules};
 assert.equal(base.manifest.implementation_pin.sha256,a.base_live_pin);assert.equal(base.manifest.module_count,76);
 for(const[n,v]of Object.entries(a.proposed_sources)){const s=fs.readFileSync(v.path,'utf8');assert.equal(sha(s),v.sha256,n);proposed[n]=s;}
 assert.equal(proposed['runtime/runner.mjs'],predecessor.modules['runtime/runner.mjs']);
 const {buildArtifact}=await import('../../runtime/build.mjs');
 const legacy=a.artifact_output+'.legacy';fs.writeFileSync(legacy,base.modules['legacy-worker.mjs'],{flag:'wx',mode:0o600});
 assert(!fs.existsSync(a.artifact_output));report.builds++;
 const manifest=buildArtifact({legacy_path:legacy,output_path:a.artifact_output,module_overrides:proposed}),bytes=fs.readFileSync(a.artifact_output),artifact=JSON.parse(bytes);
 const changed=Object.keys(artifact.modules).filter(n=>artifact.modules[n]!==base.modules[n]).sort();
 assert.deepEqual(changed,a.expected_changed_modules);assert.equal(manifest.module_count,76);assert.deepEqual(artifact.metadata,base.metadata);
 const dir=path.resolve(a.private_case_dir);fs.mkdirSync(dir,{recursive:true,mode:0o700});
 for(const[n,s]of Object.entries(artifact.modules)){const p=path.resolve(dir,n);assert(p.startsWith(dir+path.sep));fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});fs.writeFileSync(p,s,{flag:'wx',mode:0o600});}
 const load=n=>import(pathToFileURL(path.join(dir,n)).href);
 const [{analyzePump},{constructPlanDecision,selectJustifiedPlanTarget},{START_PROFILE:profile},{MemoryStore},{createDelivery,textHash}]=await Promise.all([
  load('analytics/index.mjs'),load('analytics/movement.mjs'),load('profile/start-v1.mjs'),load('runtime/store.mjs'),load('runtime/delivery.mjs')]);
 const call=input=>{assert(report.engine_calls<a.max_engine_calls);report.engine_calls++;const before=JSON.stringify(input),out=analyzePump(input);assert.equal(JSON.stringify(input),before);return out;};
 mark(stage,{artifact_sha256:sha(bytes),implementation_sha256:manifest.implementation_pin.sha256,changed_modules:changed,unchanged_modules:76-changed.length,
  qualified_v7_runner_reused_exactly:true,profile_same_bytes:artifact.modules['profile/start-v1.mjs']===base.modules['profile/start-v1.mjs']});

 stage='SAME_SAVED_INIT_IDOL_NEW_TARGET_POLICY';
 const actual=read(a.actual_packet),outcomes=[];
 for(const ticker of['INIT','IDOL']){
  const original=actual.latest_candidates.find(c=>c.instrument_id.endsWith(':'+ticker+'-USDT')).private_evidence.original;
  const out=call(structuredClone(original.input));assert.equal(out.rules_version,a.rules_version);
  if(ticker==='INIT'){assert.deepEqual(out.next_wave,original.analysis.next_wave);assert.equal(out.current_threshold_passed,false);assert.equal(out.automatic_eligible,false);}
  else{assert.equal(out.next_wave.impulse.start_ts,1793254200000);assert.equal(out.next_wave.impulse.low,0.01235);assert.equal(out.wave_state,'CALM_PULLBACK');}
  if(out.plan){assert(out.plan.potential_pct.minimum>=10);const ids=new Set(Object.values(original.input.facts).map(f=>f.fact_id));for(const id of [...out.plan.entry_zones,out.plan.exit_zone].flatMap(z=>z.basis_fact_ids))assert(ids.has(id),'UNBOUND_PLAN_FACT');}
  outcomes.push({ticker,wave_state:out.wave_state,current_threshold_passed:out.current_threshold_passed,automatic_eligible:out.automatic_eligible,ready:out.ready,reasons:out.reasons,
   target:out.plan?.exit_zone.basis_level?.price??out.plan_diagnostic?.target?.basis_level?.price??null,minimum_potential_pct:out.plan?.potential_pct.minimum??null,plan_code:out.plan_diagnostic?.code??null});
 }
 mark(stage,{outcomes,counterfactual:true,not_a_new_native_event:true,immutable_originals_unchanged:true});

 stage='INDEPENDENT_TARGET_AND_OBSTACLE_BOUNDARIES';
 const vectors=read(a.target_vectors);assert.equal(vectors.status,'UNEXECUTED_NOT_TEST_PASS');assert.equal(vectors.vectors.length,6);
 const factory=vectors.factory,vectorResults=[];
 const materialize=(v,variant={})=>{
  const step=factory.step_ms,T=factory.base_epoch_ms,rows=v.close_series.map((c,i)=>({open_ts:T+i*step,close_ts:T+(i+1)*step,open:c,close:c,high:c+0.2,low:c-0.2,closed:true}));
  assert(rows.length<=26);
  for(const[index,override]of Object.entries(factory.overrides))Object.assign(rows[Number(index)],override);
  const end=rows.at(-1).close_ts,at=end+1000;
  const fact=(id,value)=>({fact_id:id,status:'USABLE',event_ts:end,received_ts:end+500,expires_ts:end+90000,evidence_ref:id+':EXPLICIT_ARTIFICIAL_ADAPTER',value});
  const history=fact(factory.history_fact_id,rows.map(r=>[r.open_ts,r.open,r.high,r.low,r.close]));history.coverage={window_start:rows[0].open_ts};
  const core=fact(factory.core_fact_id,rows.slice(factory.core_slice_start_index));
  const resolve=value=>typeof value==='string'&&/^asof\+[0-9]+$/.test(value)?at+Number(value.slice(5)):value;
  for(const [f,changes]of[[history,variant.history_fact_overrides??v.history_fact_overrides],[core,variant.core_fact_overrides??v.core_fact_overrides]])for(const[k,val]of Object.entries(changes??{}))f[k]=resolve(val);
  const context={core_qualified:true,core_fact:core,core_rows:core.value,history_qualified:true,history_fact:history,...v.context_overrides,...variant.context_overrides};
  const movement={active:true,state:'CALM_PULLBACK',normal_range:2,pivots:[],impulse:{start_ts:T+factory.movement.seed_start_index*step,end_ts:T+factory.movement.seed_end_index*step,low:100},
   next_wave:{state:'CALM_PULLBACK',created_ts:T+factory.movement.created_at_index*step,expires_ts:at+factory.movement.expires_after_asof_ms,invalidation_price:100},target_context:context};
  if(variant.injected_supplied_pivots)movement.pivots=variant.injected_supplied_pivots.map(p=>({...p,event_ts:resolve(p.event_ts),known_ts:resolve(p.known_ts)}));
  return{movement,price:v.current_price,at};
 };
 const target=(name,x)=>{
  assert(report.pure_target_selector_calls<a.max_pure_target_selector_calls);report.pure_target_selector_calls++;
  const before=JSON.stringify(x),out=selectJustifiedPlanTarget(x.movement,x.price,0.5,profile,x.at);assert.equal(JSON.stringify(x),before);
  if(out.allowed){assert.equal(out.evidence.selection_before_entry_and_potential,true);assert(out.refs.every(id=>[factory.core_fact_id,factory.history_fact_id].includes(id)));}
  vectorResults.push({name,allowed:out.allowed,selected:out.pivot?.price??null,kind:out.kind??null,reason:out.reason??null});return out;
 };
 for(const v of vectors.vectors){
  if(v.id==='ENTRY_CROSSES10_TARGET_FIXED'){
   const selections=[];
   for(const p of v.entry_support_variants){const x=materialize(v);x.movement.pivots=[{kind:p.kind,price:p.price,event_ts:x.at-180000,known_ts:x.at-60000,fact_id:p.fact_id}];
    assert(report.pure_plan_calls<a.max_pure_plan_calls);report.pure_plan_calls++;
    const before=JSON.stringify(x),d=constructPlanDecision(x.movement,x.price,{position_limit_usdt:3000},factory.core_fact_id,0.01,profile,x.at);assert.equal(JSON.stringify(x),before);
    assert.equal(d.diagnostic.target?.basis_level?.price,114.2);assert.equal(d.diagnostic.target_assessment?.selection_before_entry_and_potential,true);selections.push(d.diagnostic.target.basis_level.price);
    if(p.price===102.5){assert(d.plan&&d.plan.potential_pct.minimum>=10);}else{assert.equal(d.plan,null);assert.equal(d.diagnostic.code,'NO_ENTRY_MEETS_OWNER_MINIMUM');}
    vectorResults.push({name:v.id+':'+p.price,plan_present:Boolean(d.plan),selected:selections.at(-1),code:d.diagnostic.code});
   }assert.equal(selections[0],selections[1]);continue;
  }
  if(v.id==='INVALID_FUTURE_UNBOUND_CONTEXT'){
   const injected=target(v.id+':INJECTED',materialize(v,v.variants[0]));assert(injected.allowed);assert.equal(injected.pivot.price,130.2);
   const historyBad=target(v.id+':HISTORY_FUTURE',materialize(v,v.variants[1]));assert(historyBad.allowed);assert.equal(historyBad.pivot.price,114.2);
   const coreBad=target(v.id+':CORE_FUTURE',materialize(v,v.variants[2]));assert.equal(coreBad.allowed,false);assert.equal(coreBad.reason,'TARGET_CORE_CONTEXT_UNBOUND');continue;
  }
  const out=target(v.id,materialize(v));assert(out.allowed,v.id);
  if(v.expected.selected_price!==undefined)assert.equal(out.pivot.price,v.expected.selected_price,v.id);
  if(v.expected.selected_kind)assert.equal(out.kind,v.expected.selected_kind,v.id);
  if(v.id==='HISTORICAL_RANGE_WITH_MINOR')assert.equal(out.intermediate.find(p=>p.price===114.2)?.obstacle_status,'MINOR_HIGHER_LOW_REACTION');
  if(v.id==='LATER_REBREACH_OR_UNRESOLVED')assert(out.pivot.price<=114.2&&out.pivot.price!==130.2);
  if(v.id==='HISTORY_MICRO_DOES_NOT_HIDE_WAVE')assert.equal(out.evidence.qualified_historical_ceilings,0);
 }
 mark(stage,{results:vectorResults,artificial:true,no_real_market_claim:true});

 stage='PRIOR_LOW_BREACH_HIDDEN_BY_CONFIRMATION_LAG';
 const priorDescriptor=read(a.prior_breach_vector);assert.equal(priorDescriptor.status,'EXPLICIT_ARTIFICIAL_UNEXECUTED');
 const priorCase=materialize({close_series:[118,120,126,130,126,122,114,106,90.2,106,108,100,104,106,105,95,110,108,107,105,107,108,106],current_price:106});
 priorCase.movement.next_wave.invalidation_price=90;priorCase.movement.impulse.low=90;
 for(const[index,high]of[[11,100.7],[12,112],[14,109.8]]){
  priorCase.movement.target_context.history_fact.value[index][2]=high;
  priorCase.movement.target_context.core_rows[index-factory.core_slice_start_index].high=high;
 }
 const preRepairSource=fs.readFileSync(a.pre_repair_movement,'utf8'),preRepairPath=path.join(dir,'analytics/prior-low-unqualified-preimage.mjs');
 fs.writeFileSync(preRepairPath,preRepairSource,{flag:'wx',mode:0o600});
 const {selectJustifiedPlanTarget:preRepairSelector}=await import(pathToFileURL(preRepairPath).href);
 const priorBefore=JSON.stringify(priorCase),bad=preRepairSelector(priorCase.movement,priorCase.price,0.5,profile,priorCase.at);
 report.pre_repair_selector_calls=1;assert.equal(JSON.stringify(priorCase),priorBefore);
 const corrected=target('PRIOR_LOW_BREACH_HIDDEN_BY_CONFIRMATION_LAG',priorCase);
 assert.equal(bad.pivot?.price,130.2);assert.equal(corrected.pivot?.price,110.2);assert.equal(corrected.kind,'NEARER_STRUCTURAL_BARRIER');
 mark(stage,{pre_repair_selected:bad.pivot.price,corrected_selected:corrected.pivot.price,prior_low_breach_no_longer_called_minor:true,
  complete_controlled_OHLC:true,unqualified_preimage_one_pure_selector_call:true,not_a_market_or_full_engine_fixture:true});

 stage='EXACT_NEW_CARD_TO_MEMORY_RECEIPT';
 const {input:fixture}=await import('../analytics/fixtures.mjs');
 const input=fixture();input.run_id='ARTIFICIAL_TARGET_PLAN_CONNECTED';input.run_purpose='ACCEPTANCE_TEST';
 const analysis=call(input);assert(analysis.ready&&analysis.automatic_eligible,JSON.stringify(analysis.reasons));assert(analysis.plan.potential_pct.minimum>=10);
 assert.equal(analysis.plan.exit_zone.target_assessment?.version,'JUSTIFIED_TARGETS_V1');
 assert(analysis.card_text.length<=4096);assert.match(analysis.card_text,/Карта ликвидаций недоступна/);assert.match(analysis.card_text,/ТЕСТ/);
 const store=new MemoryStore(),key='pump:analysis:'+sha(JSON.stringify(analysis)),pin=manifest.implementation_pin.sha256;
 await store.set(key,{analysis,input,saved_ts:input.analysis_ts,implementation_sha256:pin,evidence_class:'ARTIFICIAL'});
 const delivery=createDelivery({store,recipient:'12345',clock:()=>input.analysis_ts,revalidate:async()=>({valid:true}),send:async request=>{
  report.mock_Telegram_calls++;assert.equal(report.mock_Telegram_calls,1);assert.equal(request.text,analysis.card_text);
  return{ok:true,status:200,http_started_ts:input.analysis_ts,http_ack_received_ts:input.analysis_ts,http_clock_basis:'CALL_TO_FETCH_AND_PARSED_ACK_NOT_WIRE_TIMESTAMP',body:{ok:true,result:{message_id:987,chat:{id:12345},text:request.text}}};}});
 const queued=await delivery.enqueue({...analysis,source_input_key:key},{mode:'AUTO',expires_ts:input.analysis_ts+10000}),sent=await delivery.dispatch(queued.card_id),saved=await store.get('pump:card:'+queued.card_id);
 assert.equal(sent.state,'SENT');assert.equal(sent.receipt_readback,true);assert.equal(saved.text,analysis.card_text);assert.equal(saved.text_hash,await textHash(analysis.card_text));assert.equal(saved.receipt.message_id,'987');
 const {readSavedAutoObservation}=await import('../../operator/saved-auto-observation.mjs');
 const observed=await readSavedAutoObservation({store,implementation_sha256:pin,expected_recipient_sha256:sha('12345'),clock:()=>input.analysis_ts,include_executor:false});
 assert.equal(observed.first_genuine_same_original_SENT_observed,false);
 mark(stage,{mock_receipt_saved:true,exact_text_readback:true,real_Telegram:0,artificial_not_promoted_to_production:true,card_characters:analysis.card_text.length});

 stage='MALFORMED_EXECUTOR_NEVER_QUIESCENT';
 const malformed=[{}, {owner:''},{owner:'   '},{owner:0},{owner:false},[],false,undefined,'bad',Object.create({owner:null})];
 for(const value of malformed){let reads=0,waits=0;await assert.rejects(()=>readPausedExecutorBounded({store:{get:async()=>{reads++;return value;}},maximum_reads:6,wait_ms:20000,sleep:async()=>{waits++;}}),/EXECUTOR_STATE_INVALID_DO_NOT_DEPLOY/);assert.equal(reads,1);assert.equal(waits,0);}
 for(const value of[null,{owner:null}]){const d=await readPausedExecutorBounded({store:{get:async()=>value},maximum_reads:6,wait_ms:20000,sleep:async()=>assert.fail('FREE_MUST_NOT_WAIT')});assert.equal(d.status,'QUIESCENT_CODE_UPDATE_ALLOWED');assert.equal(d.executor_PK_reads,1);}
 mark(stage,{malformed_refused:malformed.length,valid_free_forms:2,no_real_SQL:true});

 stage='GENERATE_AND_CHECK_EXACT_ARTIFACT_NAMED_OPERATORS';
 const gen=a.operator_generation,artifactHash=sha(bytes);
 const once=(s,from,to)=>{assert.equal(s.split(from).length,2,'EXACT_GENERATION_PREIMAGE');return s.replace(from,to);};
 let gate=fs.readFileSync(gen.gate_preimage,'utf8');
 gate=once(gate,'37e4b0ed9cd5b243a94f7f56bc1ac683a7461fb1cc77570dae09379b00da0456',pin);
 gate=once(gate,'531699f31a0c71a6704da3f9648fa4bf142450b524c5942b60dfeaed7f3297d1',artifactHash);
 gate=gate.replaceAll('QUEUE_V7_LOOKUP_IDS','TARGET_PLAN_LOOKUP_IDS').replaceAll('createQueueV7NamedSqlException','createTargetPlanNamedSqlException')
  .replaceAll('OWNER_QUEUE_V7_INSTALL_AND_ACCEPTANCE_13_14_V1','OWNER_TARGET_PLAN_INSTALL_AND_ACCEPTANCE_13_14_V1')
  .replaceAll('QUEUE_V7','TARGET_PLAN').replaceAll('pump-queue-seed-v7-install-20261029-extra13','pump-target-plan-install-20261029-extra13')
  .replaceAll('pump-queue-seed-v7-auto-acceptance-20261029-extra14','pump-target-plan-auto-acceptance-20261029-extra14');
 fs.writeFileSync(gen.gate_output,gate,{flag:'wx',mode:0o600});
 for(const[kind,preimage,output]of[['install',gen.install_preimage,gen.install_output],['acceptance',gen.acceptance_preimage,gen.acceptance_output]]){
  let s=fs.readFileSync(preimage,'utf8').replaceAll('createQueueV7NamedSqlException','createTargetPlanNamedSqlException')
   .replaceAll('./queue-v7-owner13-14-sql-exception.mjs','./'+path.basename(gen.gate_output))
   .replaceAll('OWNER_QUEUE_V7_INSTALL_AND_ACCEPTANCE_13_14_V1','OWNER_TARGET_PLAN_INSTALL_AND_ACCEPTANCE_13_14_V1');
  new vm.SourceTextModule(s);fs.writeFileSync(output,s,{flag:'wx',mode:0o600});
 }
 const {createTargetPlanNamedSqlException,TARGET_PLAN_LOOKUP_IDS}=await import(pathToFileURL(path.resolve(gen.gate_output)).href);
 const now=Date.now(),operators=[];
 for(const n of[13,14]){
  const ad={mode:'LOOKUP',run_id:TARGET_PLAN_LOOKUP_IDS[n],implementation_sha256:n===13?a.base_live_pin:pin,native_query_cap:16,expires_ts:now+120000,
   lookup_single_exception:{schema:'OWNER_TARGET_PLAN_INSTALL_AND_ACCEPTANCE_13_14_V1',status:'APPROVED_BY_DIRECT_OWNER',extra_number:n,approval_message_sha256:'a'.repeat(64),owner_thread_id:'01a171f7-596e-7dc0-a82f-3e92f57f4ef6',day_utc:'2026-10-29',approved_run_ids:[TARGET_PLAN_LOOKUP_IDS[13],TARGET_PLAN_LOOKUP_IDS[14]],maximum_new_runs:2,exact_run_id:TARGET_PLAN_LOOKUP_IDS[n],target_artifact_sha256:artifactHash,previous_run_count:n-1,additional_runs:1,maximum_count_after:n,rows_read:500,rows_written:30,max_queries:16,approved_ts:now-1,expires_ts:now+60000}};
  const params=Array(17).fill(0);Object.assign(params,{0:'PUMP:LOOKUP:'+ad.run_id,1:'2026-10-29',2:500,3:30,15:1,16:10});
  const sql='INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(...) AND (?16=0 OR lookup_count<?17)';
  const f=createTargetPlanNamedSqlException(ad,now),bound=f(sql,params);assert.equal(bound.params[16],n);assert(bound.sql.includes('AND lookup_count='+(n-1)+' '));
  assert.throws(()=>f(sql,params));
  const wrong=structuredClone(ad);wrong.lookup_single_exception.target_artifact_sha256='b'.repeat(64);assert.throws(()=>createTargetPlanNamedSqlException(wrong,now));
 }
 for(const p of[gen.gate_output,gen.install_output,gen.acceptance_output])operators.push({path:p,sha256:sha(fs.readFileSync(p))});
 mark(stage,{generated_files:operators,exact_named_gates:2,changed_artifact_and_replay_rejected:true,real_owner13_14_approval:false,native_IO_admission:false});

 stage='EXACT_CHANGED_MODULE_CONTROLLER_MOCK';
 const template=fs.readFileSync(a.controller_template,'utf8'),accountId='70ee0af85191ea470e74c7383fdec772';
 let mockModules=structuredClone(base.modules),mutations=0;
 const settings={bindings:[{name:'PUMP_REPORT_ENABLED',type:'plain_text',text:'0'},{name:'PUMP_REPORT_DELIVERY_ENABLED',type:'plain_text',text:'1'},
  {name:'DATA_DB',type:'d1',id:'057a2847-2cc4-4e52-8534-1be1596d21d5'},...Array.from({length:18},(_,i)=>({name:'MOCK_KEEP_'+i,type:'plain_text',text:'UNCHANGED'}))],compatibility_date:'2026-09-11',compatibility_flags:[]};
 const settingsBefore=structuredClone(settings),boundary='----TARGET_PLAN_OFFLINE_ONLY';
 const multipart=value=>Object.entries(value).map(([name,text])=>'--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"; filename="'+name+'"\r\nContent-Type: application/javascript+module\r\n\r\n'+text+'\r\n').join('')+'--'+boundary+'--\r\n';
 const cloudflare={async request(request){
  report.mock_controller_calls++;assert(report.mock_controller_calls<=11);
  if(request.method==='GET')return{status:200,success:true,result:request.path.endsWith('/settings')?structuredClone(settings):request.path.endsWith('/schedules')?{schedules:request.path.includes('/my-report-2-hub/')?[{cron:'*/5 7-16 * * *'}]:[]}:multipart(mockModules)};
  assert.equal(request.method,'PUT');assert(request.path.endsWith('/my-report-2-hub/content'));assert.equal(request.rawBody,true);mutations++;
  const b=request.body.slice(0,request.body.indexOf('\r\n')),parts={};
  for(const part of request.body.split(b).slice(1,-1)){const split=part.indexOf('\r\n\r\n'),name=part.slice(0,split).match(/\bname="([^"]+)"/)[1];parts[name]=part.slice(split+4,-2);}
  assert.deepEqual(JSON.parse(parts.metadata),{main_module:'worker-entry.mjs'});delete parts.metadata;mockModules=parts;
  return{status:200,success:true,result:{}};
 }};
 const hashes=m=>Object.fromEntries(Object.entries(m).map(([n,s])=>[n,sha(s)]));
 const config={schema:'ROOT_PRODUCTION_CONTROL_PLANE_ADMISSION_V1',status:'ADMITTED_NOT_SPENT',maximum_attempts:1,action:'INSTALL',authority_main:a.authority_main,issued_ts:Date.now(),expires_ts:a.expires_ts,own_lease:a.own_lease,admin_HTTP_max:11,
  before_modules_sha256:hashes(base.modules),after_modules_sha256:hashes(artifact.modules),before_pin:a.base_live_pin,after_pin:pin,before_artifact_sha256:sha(fs.readFileSync(a.base_artifact)),after_artifact_sha256:artifactHash,after_rules_version:a.rules_version,main_module:artifact.metadata.main_module,
  install_module_overrides:Object.fromEntries(changed.map(n=>[n,artifact.modules[n]])),quiescence:{state:'FINALIZED',observation_status:'QUIESCENT_CODE_UPDATE_ALLOWED',executor_owner:null,implementation_sha256:a.base_live_pin,observed_ts:Date.now()}};
 const controller=Function('cloudflare','accountId','return ('+template.replace('__PUMP_CONFIG__',()=>JSON.stringify(config))+');')(cloudflare,accountId),proof=await controller();
 assert.equal(proof.state,'CONFIRMED_FULL',proof.error);assert.equal(report.mock_controller_calls,11);assert.equal(mutations,1);assert.deepEqual(mockModules,artifact.modules);assert.deepEqual(settings,settingsBefore);
 assert(Date.now()<a.expires_ts);assert.equal(report.engine_calls,3);assert.equal(report.builds,1);
 Object.assign(report,{status:'PASS',artifact_path:a.artifact_output,artifact_sha256:artifactHash,implementation_sha256:pin,module_count:76,changed_modules:changed.map(n=>({name:n,sha256:sha(artifact.modules[n])})),unchanged_modules:76-changed.length,
  generated_operator_files:operators,real_owner13_14_approval:false,profile_thresholds_caps_manual3_holds_old_report_schedules_unchanged:true,case_does_not_prove_native_READY_or_AUTO_delivery:true});
 mark('COMPLETE');console.log(JSON.stringify(report));
}catch(error){Object.assign(report,{status:'FAILED_PRESERVED_NO_AUTO_RETRY',failed_stage:stage,error_type:error.name,error_message:String(error.message).slice(0,240)});save();console.log(JSON.stringify({status:report.status,failed_stage:stage,error:report.error_message,engine_calls:report.engine_calls,builds:report.builds}));process.exitCode=1;}
