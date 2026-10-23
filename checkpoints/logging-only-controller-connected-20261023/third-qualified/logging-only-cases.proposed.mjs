// ONE new callable, author UNEXECUTED. No old test exports or live entrypoint.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const hash=x=>createHash('sha256').update(x).digest('hex');
export async function runLoggingOnlyControllerCases({repo_root}={}){
 const groups=[],cases=[];
 try{
  const root=resolve(repo_root),prefix='checkpoints/logging-only-controller-connected-20261023/third-qualified';
  const binding=JSON.parse(await readFile(join(root,prefix,'target-bindings.json'),'utf8')),text=await readFile(join(root,binding.target));assert.equal(text.length,binding.after.bytes);assert.equal(hash(text),binding.after.sha256);
  const wf=await readFile(join(root,binding.workflow_target.path));assert.equal(wf.length,binding.workflow_target.after.bytes);assert.equal(hash(wf),binding.workflow_target.after.sha256);
  const closure=JSON.parse(await readFile(join(root,prefix,'public-closure-pins.json'),'utf8'));
  for(const [file,pin]of Object.entries(closure.files)){const bytes=await readFile(join(root,file));const target=file===binding.target?binding.after:pin;assert.equal(bytes.length,target.bytes,file);assert.equal(hash(bytes),target.sha256,file);}
  const api=await import(pathToFileURL(join(root,binding.target)).href),shared=await import(pathToFileURL(join(root,'runner/htx-coordinated-rollout.mjs')).href);
  const digest=shared.rolloutDigest,settingsHash=shared.workerSettingsFingerprint,canonical=x=>JSON.stringify(x),clone=structuredClone;
  const uuid='00000000-0000-4000-8000-000000000001',dep='00000000-0000-4000-8000-000000000002',version='86f1bdc5-c7d7-4bbd-917b-cf60babc5a3e';
  function fixture(options={}){
   const before={compatibility_date:'2026-09-15',usage_model:'standard',bindings:[{name:'DATA_DB',type:'d1',id:'057a2847-2cc4-4e52-8534-1be1596d21d5'},{name:'REPORT2_CLOUD_BRIDGE_TOKEN',type:'secret_text'},{name:'REPORT2_DENO_BRIDGE_TOKEN',type:'secret_text'}],observability:{enabled:false,logs:{enabled:false,invocation_logs:false,persist:false,destinations:['cloudflare']}}};
   if(options.external)before.observability.logs.destinations=['external'];
   if(options.noop)before.observability=api.correlatedLogsIntent(before);
   const context={schema:'CURRENT86_LOGGING_ONLY_CONTEXT_V1',operation_id:uuid,baseline_receipt_sha256:'6858cf03767b4703baadcfa89798f3f975ae63381e65afd7cafa023b1a2e2cc4',expected_version:version,expected_deployment:dep,before_effective_settings:before,expected_before_settings_sha256:settingsHash(before),owner_approval_reference:'CONTROLLED_NOT_OWNER_APPROVAL'};
   if(options.beforeConflict)context.expected_before_settings_sha256='0'.repeat(64);
   const calls={script:0,deployment:0,patch:0,operational:0,guard:0,admit:0,saves:[]};let saved=null,saveFailed=false,desired=null;
   const callbacks={logging_only:context,
    readScript:async()=>{calls.script++;return clone(before);},
    readDeployment:async()=>{calls.deployment++;return{version_id:version,deployment_id:options.foreignPost&&calls.deployment>1?'00000000-0000-4000-8000-000000000003':dep};},
    guard:async()=>{calls.guard++;if(options.guardFail)throw Error('CONTROLLED_GUARD_REFUSED');},
    admit:()=>{calls.admit++;return !(options.denyAt===calls.admit);},
    save:async proof=>{calls.saves.push(proof.status);if(!saveFailed&&proof.status===options.saveFailAt){saveFailed=true;throw Error('CONTROLLED_SAVE_FAILURE');}saved=clone(proof);},
    patch:async observability=>{calls.patch++;assert.equal(calls.patch,1,'no second/restoration PATCH');assert.equal(saved.status,'LOGGING_ONLY_PATCH_INTENT_SAVED');assert(saved.intent);assert.equal(saved.intent.max_PATCH_attempts,1);desired=clone(observability);assert.equal(saved.intent.PATCH_JSON_sha256,digest(JSON.stringify({observability})));assert.equal(saved.intent.prospective_settings_sha256,settingsHash({...before,observability}));if(options.unknown)throw Error('CONTROLLED_PATCH_TIMEOUT');return{schema:'CURRENT86_LOG_PATCH_ACK_V1',operation_id:options.wrongAck?'00000000-0000-4000-8000-000000000009':uuid,request_json_sha256:saved.intent.PATCH_JSON_sha256,HTTP_status:200,CF_success:true,body_sha256:'c'.repeat(64),result_sha256:'d'.repeat(64),received_ts:1792763000000};},
    readOperational:async()=>{calls.operational++;if(options.observationFail)throw Error('CONTROLLED_OBSERVATION_FAILED');const after={...clone(before),observability:clone(desired)};if(options.nonObsConflict)after.usage_model='bundled';if(options.obsConflict)after.observability.logs.destinations=['external'];return after;}};
   return{context,calls,callbacks,get_saved:()=>saved,run:()=>api.configureCorrelatedBridgeLogs(callbacks)};
  }
  const noGrant=p=>{for(const key of ['native_provenance_qualified','native_admission_qualified','logging_settings_allowed','known_activation_ACK','activation_ownership_verified','old_unknown_recovered','day_hold_removed','current_Telegram_restored'])assert.equal(p[key],false,key);assert.equal(p.restore_PATCH_attempts,0);assert.equal(p.activation_attempts,0);assert.equal(p.native_SQL,0);assert.equal(p.MAIN,0);assert.equal(p.Telegram,0);};
  const run=async(name,fn)=>{await fn();cases.push(name);};const group=async(name,fn)=>{const start=cases.length;await fn();groups.push({name,status:'CONTROLLED_PASS',cases:cases.slice(start)});};
  await group('explicit mode separates logging and disables old default',async()=>{
   await run('missing mode remains OFF',async()=>assert.equal(api.correlatedBridgeExecutionMode({}),'OFF'));
   await run('logging only selects explicit isolated entry',async()=>assert.equal(api.correlatedBridgeExecutionMode({EXECUTE_CORRELATED_LOGGING_ONLY:'true'}),'EXECUTE_CORRELATED_LOGGING_ONLY'));
   await run('mixed activation and logging refuses',async()=>assert.throws(()=>api.correlatedBridgeExecutionMode({EXECUTE_CORRELATED_LOGGING_ONLY:'true',EXECUTE_CORRELATED_EXISTING_ACTIVATION:'true'}),/MIXED_MODE/));
  });
  await group('known PATCH exact intent and readback',async()=>{
   await run('onePATCH after saved intent and computed H only',async()=>{const f=fixture(),before=canonical(f.context.before_effective_settings),p=await f.run();assert.equal(p.status,'LOGGING_ONLY_KNOWN_PATCH_EXACT_READBACK');assert.equal(f.calls.patch,1);assert.equal(f.calls.operational,1);assert.equal(f.calls.deployment,2);assert.equal(p.known_patch_ACK,true);assert.equal(p.after_settings_sha256,p.intent.prospective_settings_sha256);assert.equal(p.after_without_observability_sha256,p.intent.baseline_without_observability_sha256);assert.equal(p.log_contract.persist,true);assert.deepEqual(p.log_contract.destinations,['cloudflare']);assert.equal(p.log_contract.head_sampling_rate,1);assert.equal(p.log_contract.invocation_logs,false);assert.equal(canonical(f.context.before_effective_settings),before);noGrant(p);});
  });
  await group('unknown PATCH may observe once then stops',async()=>{
   for(const observationFail of [false,true])await run('unknown ACK observation '+(observationFail?'fails':'matches H')+' is never adopted',async()=>{const f=fixture({unknown:true,observationFail}),p=await f.run();assert.equal(p.status,'LOGGING_ONLY_UNKNOWN_PATCH_ACK_STOP');assert.equal(p.known_patch_ACK,false);assert.equal(p.patch_ACK_unknown,true);assert.equal(p.unknown_observation_attempts,1);assert.equal(f.calls.patch,1);assert.equal(f.calls.operational,1);assert.equal(f.calls.deployment,1);assert.equal(p.new_CF_actions_allowed,false);if(!observationFail)assert.equal(p.unknown_observation.matches_prospective,true);noGrant(p);});
   await run('wrong ACK operation is unknown, not permission',async()=>{const f=fixture({wrongAck:true}),p=await f.run();assert.equal(p.status,'LOGGING_ONLY_UNKNOWN_PATCH_ACK_STOP');assert.equal(p.known_patch_ACK,false);assert.equal(f.calls.patch,1);assert.equal(f.calls.operational,1);noGrant(p);});
  });
  await group('known reply mismatch never restores',async()=>{
   for(const key of ['nonObsConflict','obsConflict','foreignPost'])await run(key+' stops without another PATCH',async()=>{const f=fixture({[key]:true}),p=await f.run();assert.equal(p.status,'LOGGING_ONLY_PARTIAL_STOP');assert.equal(p.known_patch_ACK,true);assert.equal(f.calls.patch,1);noGrant(p);});
  });
  await group('persistence boundaries precede next IO',async()=>{
   await run('intent save failure sends noPATCH',async()=>{const f=fixture({saveFailAt:'LOGGING_ONLY_PATCH_INTENT_SAVED'}),p=await f.run();assert.equal(p.status,'LOGGING_ONLY_NOT_ADMITTED');assert.equal(f.calls.patch,0);assert.equal(f.calls.operational,0);noGrant(p);});
   await run('known reply save failure retains reply and performs no next read',async()=>{const f=fixture({saveFailAt:'LOGGING_ONLY_KNOWN_PATCH_REPLY_SAVED'}),p=await f.run();assert.equal(p.status,'LOGGING_ONLY_PARTIAL_STOP');assert.equal(p.known_patch_ACK,true);assert.equal(p.proof_persistence_failed,true);assert(p.patch_reply);assert.equal(f.calls.patch,1);assert.equal(f.calls.operational,0);noGrant(p);});
  });
  await group('denials do not become a native grant',async()=>{
   for(const options of [{beforeConflict:true},{external:true},{guardFail:true},{denyAt:1},{denyAt:2}])await run('precondition refusal '+JSON.stringify(options),async()=>{const f=fixture(options),p=await f.run();assert.equal(p.status,'LOGGING_ONLY_NOT_ADMITTED');assert.equal(f.calls.patch,0);assert.equal(f.calls.operational,0);noGrant(p);});
  });
  await group('already matched is zero-write and not new H qualification',async()=>{
   await run('no-op remains one readonly observation of configured state',async()=>{const f=fixture({noop:true}),p=await f.run();assert.equal(p.status,'LOGGING_ONLY_ALREADY_MATCHED_NO_WRITE');assert.equal(f.calls.patch,0);assert.equal(f.calls.operational,0);assert.equal(p.before_only_no_new_H_qualification,true);noGrant(p);});
  });
  return{schema:'LOGGING_ONLY_NEW_CONTROLLER_CONTROLLED_RESULT_V1',group_count:groups.length,case_count:cases.length,groups,provider_HTTP:0,native_CF:0,native_SQL:0,MAIN:0,Telegram:0,old625_624_cases:0,native_entry_invoked:false,full_native_transport_or_owner_policy_qualified:false,actual_H_qualified:false,author_execution:'UNEXECUTED'};
 }catch(error){error.partial_result={schema:'LOGGING_ONLY_NEW_CONTROLLED_PARTIAL_V1',group_count:groups.length,case_count:cases.length,groups,cases,provider_HTTP:0,native_CF:0,native_SQL:0,MAIN:0,Telegram:0};throw error;}
}
