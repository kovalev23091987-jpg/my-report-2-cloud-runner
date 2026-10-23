import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createVersionBoundWorkerReader} from '../runner/cloudflare-version-bound-readback.mjs';
import {makeGithubControl} from '../runner/github-bounded-phase-lease.mjs';
import {readMirrorContext,assertMirrorOwner} from '../runner/github-four-mirror-cas.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {coordinateWeeklyRollout,rolloutDigest,WEEKLY_ROLLOUT_POLICY as P,singleActiveVersion,selectedVersionSettings} from '../runner/htx-coordinated-rollout.mjs';
import {boundedControlBody,exactConfiguredSQLBridgeURL,SQL_BRIDGE_SCRIPT} from '../runner/installed-bridge-module-inspection.mjs';
import {RETENTION_SQL_BRIDGE_PROOF} from '../runner/retention-bridge-provenance.mjs';
import {addExactSQLBridgeCostCorrelation,sqlBridgeCounterVersionMetadata} from '../runner/sql-bridge-counter-repair.mjs';
// Purpose-built, non-versioned SQL-bridge logging configuration. No SQL/provider IO.
export function correlatedLogsIntent(settings){
 const plain=x=>x&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
 if(!plain(settings))throw Error('BRIDGE_SCRIPT_SETTINGS_REQUIRED');
 const before=settings.observability;if(before!==null&&before!==undefined&&!plain(before))throw Error('BRIDGE_OBSERVABILITY_SHAPE');
 const old=before??{},logs=old.logs??{};if(!plain(logs))throw Error('BRIDGE_LOGS_SHAPE');
 if(logs.destinations!==undefined&&(!Array.isArray(logs.destinations)||logs.destinations.some(x=>x!=='cloudflare')))throw Error('BRIDGE_EXTERNAL_LOG_DESTINATION_REFUSED');
 if(old.enabled!==true&&old.traces?.enabled===true)throw Error('BRIDGE_DORMANT_TRACES_NOT_AUTHORIZED');
 return{...old,enabled:true,head_sampling_rate:1,logs:{...logs,enabled:true,head_sampling_rate:1,invocation_logs:false,persist:true,destinations:['cloudflare']}};
}
export function correlatedLogsMatch(actual,desired){
 if(!actual||actual.enabled!==true||actual.head_sampling_rate!==1||!actual.logs||actual.logs.enabled!==true||actual.logs.head_sampling_rate!==1||actual.logs.invocation_logs!==false||actual.logs.persist!==true||JSON.stringify(actual.logs.destinations)!==JSON.stringify(['cloudflare']))return false;
 const equal=(a,b)=>rolloutDigest(a)===rolloutDigest(b);
 return Object.entries(desired).every(([k,v])=>k==='logs'?Object.entries(v).every(([n,x])=>equal(actual.logs[n],x)):equal(actual[k],v));
}
export async function configureCorrelatedBridgeLogs({readScript,readDeployment,patch,readOperational,guard,save,admit,expected_version,expected_deployment,baseline_operational_hash,operationalWithoutObservabilityHash}={}){
 const proof={schema:'CORRELATED_BRIDGE_LOG_CONFIGURATION_V1',status:'LOGS_NOT_ACTIVATED',native_SQL:0,Worker_invocations:0,sourceHTTP:0,MAIN:0,Telegram:0,new_or_old_unknown_reconciled:false,mutation_attempts:0};
 let before,desired,patchAttempted=false,foreignDeployment=false,postDeploymentAttempted=false;
 const persist=()=>save(structuredClone(proof));
 const sameDeployment=d=>d?.version_id===expected_version&&d.deployment_id===expected_deployment;
 try{
  await guard();if(admit(8)!==true)throw Error('BRIDGE_LOGS_CONTROL_HEADROOM');
  before=await readScript();desired=correlatedLogsIntent(before);const deployment=await readDeployment();if(!sameDeployment(deployment))throw Error('BRIDGE_LOGS_VERSION_MOVED');
  proof.before_observability=before.observability??null;proof.desired_observability=desired;await persist();
  if(correlatedLogsMatch(before.observability,desired)){proof.status='LOGS_ALREADY_MATCHED';await persist();return proof;}
  await guard();if(admit(6)!==true)throw Error('BRIDGE_LOGS_CONTROL_HEADROOM');proof.status='LOGS_PATCH_INTENT';proof.mutation_attempts=1;await persist();patchAttempted=true;
  try{await patch(desired);}catch{proof.patch_ACK_unknown=true;}
  // One native readback resolves a lost settings reply; never retry the patch.
  const after=await readOperational();proof.after_observability=after.observability??null;
  if(operationalWithoutObservabilityHash(after)!==baseline_operational_hash)throw Error('BRIDGE_OTHER_SETTINGS_CHANGED');
  if(!correlatedLogsMatch(after.observability,desired))throw Error('BRIDGE_LOGS_READBACK_NOT_CLOSED');
  postDeploymentAttempted=true;const post=await readDeployment();if(!sameDeployment(post)){foreignDeployment=true;throw Error('BRIDGE_LOGS_VERSION_MOVED_AFTER_PATCH');}
  proof.status='CORRELATED_COST_LOGS_ENABLED_NATIVE_READBACK';proof.no_external_destination=true;proof.invocation_logs=false;proof.retention_or_future_delivery_guaranteed=false;await persist();return proof;
 }catch(error){
  proof.reason=/^[A-Z0-9_]+$/.test(error?.message||'')?error.message:'BRIDGE_LOGS_CONFIGURATION_NOT_CLOSED';
  if(patchAttempted&&before&&desired&&!foreignDeployment&&!postDeploymentAttempted){
   try{
    await guard();if(admit(4)!==true)throw Error('BRIDGE_LOGS_RESTORE_HEADROOM');if(!sameDeployment(await readDeployment()))throw Error('BRIDGE_FOREIGN_VERSION_NOT_OVERWRITTEN');const current=await readScript();
    if(rolloutDigest(current.observability??null)!==rolloutDigest(desired))throw Error('BRIDGE_FOREIGN_OBSERVABILITY_NOT_OVERWRITTEN');
    proof.restore_intent=true;await persist();await patch(before.observability??null);const restored=await readScript();
    if(rolloutDigest(restored.observability??null)!==rolloutDigest(before.observability??null))throw Error('BRIDGE_LOGS_RESTORE_READBACK_UNKNOWN');proof.observability_restored=true;
   }catch(restoreError){proof.observability_restored=false;proof.restore_reason=/^[A-Z0-9_]+$/.test(restoreError?.message||'')?restoreError.message:'BRIDGE_LOGS_RESTORE_NOT_CLOSED';}
  }
  proof.status=patchAttempted?'BRIDGE_LOGS_CONFIGURATION_PARTIAL_OR_RESTORED':'LOGS_NOT_ACTIVATED';await persist();return proof;
 }
}

export function requireExistingPaidBridgeConsumer(retained=RETENTION_SQL_BRIDGE_PROOF){
 // Paid maintenance currently accepts one exact bridge identity. Do not change
 // that native bridge until a separately qualified compatible binding exists.
 if(retained?.module_sha256!=='c327b49eb1ebb6a48ac86e1a99d55a3d861f6bc5a2c76dfd0c0d90be88026063')throw Error('PAID_RETENTION_EXACT_BRIDGE_REBIND_REQUIRED_BEFORE_ROLLOUT');
 return true;
}
export async function rolloutCorrelatedBridge(){
 const repo='kovalev23091987-jpg/my-report-2-cloud-runner',dir='audit-output/bridge-correlated-cost-release',head=process.env.EXPECTED_MAIN,owner=process.env.BORROW_EXISTING_OWNER,prefix='checkpoints/bridge-correlated-cost-connected-20261022',scopePrefix='OWNER_FIVE_ACTIVE_DIRECTIONS.BRIDGE_CORRELATED_COST_RECEIPTS_CONNECTED_20261022.';
 const budget=createUnifiedHttpBudget(P.http);let github_HTTP=0,cloudflare_HTTP=0,gh,proof,codeProof,logsProof,settings,runtime,failureReason=null;
 await fs.mkdir(dir,{recursive:true});
 const admit=kind=>{const used=kind==='github'?github_HTTP:cloudflare_HTTP;if(used>=40||budget.summary().remaining<=24)throw Error('BRIDGE_CORRELATION_CONTROL_HTTP_BOUND');const lane=kind==='cloudflare'&&budget.summary().used.background<56?'background':'hot';if(!budget.reserve({logical_request_id:'BRIDGE_CORRELATION_RELEASE:'+kind+':'+used,lane,attempts:1}).allowed)throw Error('BRIDGE_CORRELATION_CONTROL_HTTP_BOUND');if(kind==='github')github_HTTP++;else cloudflare_HTTP++;};
 const headroom=n=>40-cloudflare_HTTP>=n&&budget.summary().remaining-24>=n;
 const save=async()=>{proof={schema:'CORRELATED_SQL_BRIDGE_NATIVE_RELEASE_V1',head,status:logsProof?.status??(codeProof?.production_activation_allowed?'CORRELATION_CODE_INSTALLED_LOGS_NOT_QUALIFIED':'CORRELATION_RELEASE_NOT_CLOSED'),code:codeProof??null,logging:logsProof??null,github_HTTP,cloudflare_HTTP,whole_HTTP:budget.summary(),manual_HTTP_reserved:24,native_SQL:0,Worker_invocations:0,sourceHTTP:0,MAIN:0,Telegram:0,old_unknown_reconciled:false,day_hold_removed:false,secret_values_exported:false,future_log_delivery_qualified:false,reason:failureReason};await fs.writeFile(dir+'/proof.json',JSON.stringify(proof,null,2)+'\n');};
 async function cf(suffix,{method='GET',body,raw=false}={}){
  const get=/^\/(?:deployments|settings|script-settings|schedules|subdomain|versions\?per_page=1|versions\/[a-f0-9-]{36}|content\/v2)$/.test(suffix),post=suffix==='/versions?bindings_inherit=strict'&&body instanceof FormData||suffix==='/deployments'&&body?.strategy==='percentage'&&body.versions?.length===1&&body.versions[0]?.percentage===100,patch=suffix==='/script-settings'&&body&&Object.keys(body).join() ==='observability';
  if(!(method==='GET'&&get&&body===undefined||method==='POST'&&post||method==='PATCH'&&patch))throw Error('BRIDGE_CORRELATION_CONTROL_ROUTE_DENIED');
  if(method!=='GET')await guard();admit('cloudflare');const url=`https://api.cloudflare.com/client/v4/accounts/${P.account}/workers${suffix==='/subdomain'?'/subdomain':'/scripts/'+SQL_BRIDGE_SCRIPT+suffix}`;
  const r=await fetch(url,{method,headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok){await r.body?.cancel();throw Error('BRIDGE_CORRELATION_CONTROL_HTTP_'+r.status);}const bytes=await boundedControlBody(r,raw?6500000:262144);if(raw)return new Response(bytes,{headers:{'content-type':r.headers.get('content-type')||'application/octet-stream'}});let j;try{j=JSON.parse(bytes.toString('utf8'));}catch{throw Error('BRIDGE_CORRELATION_CONTROL_JSON');}if(j.success!==true||j.result===undefined||j.result===null)throw Error('BRIDGE_CORRELATION_CONTROL_ACK');return j.result;
 }
 async function guard({min_headroom_ms=30000}={}){const ctx=await readMirrorContext(gh,{expected_main:head,maximum_blob_reads:0}),x=assertMirrorOwner(ctx,owner,Date.now(),scopePrefix);if(x.lease.expires_ts-Date.now()<min_headroom_ms||!x.lease.scope.includes('/script-settings'))throw Error('EXACT_BRIDGE_CORRELATION_SCOPE_REQUIRED');}
 try{
  if(process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_SHA!==head||!process.env.CLOUDFLARE_API_TOKEN||!/^\d+$/.test(process.env.CONNECTED_RUN||'')||process.env.EXECUTE_CORRELATED_COST_RELEASE!=='true')throw Error('EXACT_CURRENT_CORRELATED_BRIDGE_RELEASE_REQUIRED');
  gh=makeGithubControl({repository:repo,token:process.env.GITHUB_TOKEN,fetch_impl:(url,opt)=>{if(opt.method!=='GET'&&!(url==='https://api.github.com/graphql'&&opt.method==='POST'&&!String(opt.body).includes('mutation')))throw Error('BRIDGE_CORRELATION_GITHUB_READ_ONLY');admit('github');return fetch(url,{...opt,redirect:'error'});}});
  await guard({min_headroom_ms:600000});
  const qualified=JSON.parse(await fs.readFile(prefix+'/qualification-receipt.json','utf8')),planPins=JSON.parse(await fs.readFile(prefix+'/qualification-scope.json','utf8'));
  const [run,wf,automatic]=await Promise.all([gh.call('actions/runs/'+process.env.CONNECTED_RUN),gh.call('actions/workflows/liq-assembled-offline-20261012.yml'),gh.call('actions/runs?head_sha='+head+'&per_page=30')]);
  if(qualified.run_id!==run.id||qualified.head!==run.head_sha||run.workflow_id!==wf.id||run.status!=='completed'||run.conclusion!=='success'||qualified.actual_SPEC_pass!==1||qualified.actual_SPEC_fail!==0||!automatic.workflow_runs?.some(x=>x.workflow_id===wf.id&&x.event==='push'&&x.head_sha===head&&x.status==='completed'&&x.conclusion==='success'))throw Error('CURRENT_CORRELATION_COMMON_AND_AUTOMATIC_MAIN_REQUIRED');
  for(const p of ['runner/report2-d1-adapter.mjs','runner/native-query-cost-journal.mjs','runner/sql-bridge-counter-repair.mjs','tools/rollout-correlated-sql-bridge-20261022.mjs'])if(rolloutDigest(await fs.readFile(p))!==planPins.files[p])throw Error('QUALIFIED_CORRELATION_SOURCE_PIN_CHANGED');
  requireExistingPaidBridgeConsumer();
  const identity=exactConfiguredSQLBridgeURL(process.env.REPORT2_D1_BRIDGE_URL,(await cf('/subdomain')).subdomain),reader=createVersionBoundWorkerReader({call:(name,path,opt)=>{if(name!==SQL_BRIDGE_SCRIPT)throw Error('EXACT_SQL_BRIDGE_REQUIRED');return cf(path,opt);}});
  const snapshot=async()=>{const state=await reader.read({name:SQL_BRIDGE_SCRIPT,crons:[]});if(!settings){settings=reader.settings(SQL_BRIDGE_SCRIPT,state.version_id);runtime=reader.version(SQL_BRIDGE_SCRIPT,state.version_id).resources.script_runtime;}return state;};
  const before=await snapshot();if(before.version_id!=='7011c257-4bdc-4244-a858-42c30e8532ab'||before.module_sha256!=='06603b69686f7f14b62d1ab551af18555d4f506c4edd7cb7cee3ca58a1e904bf')throw Error('EXACT_STRICT06603_NATIVE_BRIDGE_REQUIRED');
  const original=reader.module(SQL_BRIDGE_SCRIPT,before.version_id).bytes,patch=addExactSQLBridgeCostCorrelation(original.toString('utf8')),expected=Buffer.from(patch.source);
  if(Object.entries(process.env).filter(([k,v])=>/TOKEN|SECRET|KEY/.test(k)&&typeof v==='string'&&v.length>=12).some(([,v])=>expected.includes(Buffer.from(v))))throw Error('BRIDGE_CORRELATION_SECRET_EXPORT_DENIED');
  const worker={name:SQL_BRIDGE_SCRIPT,module_sha256:rolloutDigest(expected),required_before:before},adapter={snapshot,requireHeadroom:n=>{if(!headroom(n))throw Error('BRIDGE_CORRELATION_ROLLBACK_HEADROOM');},stage:async(w,b)=>{const latest=(await cf('/versions?per_page=1')).items?.[0]?.id,metadata=sqlBridgeCounterVersionMetadata({settings,runtime,head,active_version:b.version_id,latest_uploaded_version:latest});metadata.annotations['workers/message']='Exact bounded cost correlation '+head;const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.set('bridge-worker.js',new Blob([expected],{type:'application/javascript+module'}),'bridge-worker.js');const v=await cf('/versions?bindings_inherit=strict',{method:'POST',body:form});return{version_id:v.id,activated:false};},activate:(w,id)=>cf('/deployments',{method:'POST',body:{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Exact bounded cost correlation '+head}}})};
  // Existing rollback engine status names are its adapter contract. The outer receipt identifies this new correlation purpose.
  const plan={kind:'sql_bridge_counter_patch',head,expected_main:head,connected:{status:'EXACT_MAIN_SQL_BRIDGE_COUNTER_REPAIR_QUALIFIED',head,run:run.id,url:run.html_url,qualified_common_head:run.head_sha,purpose:'FUTURE_CORRELATED_COST_METADATA'},scope:{status:'EXACT_SQL_BRIDGE_SQL_PARAMS_AUTH_AND_LIMITS_PRESERVED',...identity,original_module_sha256:before.module_sha256,patched_module_sha256:worker.module_sha256,correlation:patch.proof},workers:[worker]};
  await coordinateWeeklyRollout({plan,adapter,guard,save:async x=>{codeProof=x;await save();},execute:true});
  if(!codeProof?.production_activation_allowed)throw Error('CORRELATION_CODE_READBACK_REQUIRED');const active=codeProof.workers[0].after,version=reader.version(SQL_BRIDGE_SCRIPT,active.version_id),without=x=>{const {observability,...rest}=x;return rolloutDigest(rest);};
  logsProof=await configureCorrelatedBridgeLogs({readScript:()=>cf('/script-settings'),readDeployment:async()=>singleActiveVersion(await cf('/deployments')),patch:observability=>cf('/script-settings',{method:'PATCH',body:{observability}}),readOperational:async()=>selectedVersionSettings(await cf('/settings'),version),guard,save:async x=>{logsProof=x;await save();},admit:headroom,expected_version:active.version_id,expected_deployment:active.deployment_id,baseline_operational_hash:without(settings),operationalWithoutObservabilityHash:without});
  await save();if(!['CORRELATED_COST_LOGS_ENABLED_NATIVE_READBACK','LOGS_ALREADY_MATCHED'].includes(logsProof.status))process.exitCode=1;
 }catch(e){failureReason=/^[A-Z0-9_]+$/.test(e.message)?e.message:'BRIDGE_CORRELATION_RELEASE_ERROR';await save();process.exitCode=1;}
 console.log(JSON.stringify({status:proof?.status,github_HTTP,cloudflare_HTTP,native_SQL:0,Worker_invocations:0,sourceHTTP:0,MAIN:0,Telegram:0}));return proof;
}

// Stage immutable bytes only. Upload ACK is the ownership carrier; GET annotations are not assumed.
export async function stageCorrelatedSQLBridgeOnly({plan,adapter,guard,save,clock=Date.now}={}){
 const codes=new Set(['STAGE_PLAN_REQUIRED','STAGE_CLOCK_NOT_CLOSED','STAGE_HEADROOM_OR_SCOPE_NOT_CLOSED','STAGE_SAFE_SNAPSHOT_REQUIRED','STAGE_OLD_PAID_IDENTITY_REQUIRED','STAGE_FOREIGN_DORMANT_LATEST','STAGE_INTENT_SAVE_NOT_CLOSED','STAGE_NATIVE_READBACK_NOT_CLOSED','STAGE_ACTIVE_OR_SETTINGS_CHANGED','STAGE_LATEST_MOVED','STAGE_FINAL_SAVE_NOT_CLOSED']);
 const fail=c=>{throw Object.assign(Error(c),{stage_code:c});},hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),id=v=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v),time=v=>Number.isSafeInteger(v)&&v>=1e12&&v<=8640000000000000;
 const expected='c327b49eb1ebb6a48ac86e1a99d55a3d861f6bc5a2c76dfd0c0d90be88026063',names=['DATA_DB','REPORT2_CLOUD_BRIDGE_TOKEN','REPORT2_DENO_BRIDGE_TOKEN'];
 const proof={schema:'CORRELATED_SQL_BRIDGE_STAGE_ONLY_V1',status:'STAGE_ONLY_NOT_CLOSED',head:null,owner:null,operation_id:null,upload_attempts:0,known_upload_ack:false,ownership_verified:false,active_preservation_verified:null,before:null,after:null,intent:null,staged:null,observed_after_unknown_ACK:null,reason:null,activation_attempts:0,settings_mutations:0,delete_attempts:0,native_SQL:0,Worker_invocations:0,sourceHTTP:0,MAIN:0,Telegram:0,old_unknown_recovered:false,Paid_identity_changed:false,native_activation_or_future_reconciliation_qualified:false,proof_persisted:false};
 let attempted=false,afterAttempted=false,phase='PLAN',previousClock=null;
 const now=()=>{let n;try{n=clock();}catch{fail('STAGE_CLOCK_NOT_CLOSED');}if(!time(n)||previousClock!==null&&n<previousClock)fail('STAGE_CLOCK_NOT_CLOSED');previousClock=n;return n;};
 const persist=async code=>{try{const copy=structuredClone({...proof,proof_persisted:true});if(Buffer.byteLength(JSON.stringify(copy))>16384)throw Error('BOUND');await save(copy);proof.proof_persisted=true;}catch{proof.proof_persisted=false;fail(code);}};
 const boundary=async(label,minimum_CF,minimum_GH)=>{phase=label;const n=now();if(plan.lease_expires_ts-n<30000)fail('STAGE_HEADROOM_OR_SCOPE_NOT_CLOSED');try{await guard({phase:label,min_headroom_ms:30000,minimum_CF,minimum_GH});}catch{fail('STAGE_HEADROOM_OR_SCOPE_NOT_CLOSED');}if(plan.lease_expires_ts-now()<30000)fail('STAGE_HEADROOM_OR_SCOPE_NOT_CLOSED');};
 const snapshot=x=>{
  if(!x||!id(x.version_id)||!id(x.deployment_id)||!id(x.latest_uploaded_version)||!['module_sha256','settings_sha256','crons_sha256','runtime_sha256'].every(k=>hex(x[k]))||!hex(x.immutable_script_etag)||!Array.isArray(x.binding_names)||rolloutDigest([...x.binding_names].sort())!==rolloutDigest(names))fail('STAGE_SAFE_SNAPSHOT_REQUIRED');
  return Object.fromEntries(['version_id','deployment_id','module_sha256','settings_sha256','crons_sha256','runtime_sha256','binding_names','latest_uploaded_version','immutable_script_etag'].map(k=>[k,k==='binding_names'?[...x[k]].sort():x[k]]));
 };
 const oldIdentity=x=>['version_id','module_sha256','settings_sha256','crons_sha256','immutable_script_etag'].every(k=>x[k]===RETENTION_SQL_BRIDGE_PROOF[k]);
 const preserved=(a,b)=>['version_id','deployment_id','module_sha256','settings_sha256','crons_sha256','runtime_sha256','immutable_script_etag','binding_names'].every(k=>rolloutDigest(a[k])===rolloutDigest(b[k]));
 const observation=x=>{
  if(x===null||x===undefined)return null;
  const latest=x.observed_latest_version??x.latest_uploaded_version;
  if(!id(latest))return{observation_closed:false};
  return{observed_latest_version:latest,module_sha256:hex(x.module_sha256)?x.module_sha256:null,created_on_ts:time(x.created_on_ts)?x.created_on_ts:null,metadata_sha256:hex(x.metadata_sha256)?x.metadata_sha256:null,ownership_verified:false,observation_closed:hex(x.module_sha256)};
 };
 try{
  const started=now();
  if(!plan||!/^[a-f0-9]{40}$/.test(plan.head||'')||typeof plan.owner!=='string'||plan.owner.length>128||!/^CODEX:ACTIVE105_SOURCE_RELIABILITY:\d{13}$/.test(plan.owner)||!uuid(plan.operation_id)||!time(plan.lease_expires_ts)||plan.lease_expires_ts-started>90*60000||plan.lease_expires_ts-started<30000||plan.candidate_module_sha256!==expected||typeof guard!=='function'||typeof save!=='function'||!['snapshot','stage','readStaged','reconcileOwnStage'].every(k=>typeof adapter?.[k]==='function'))fail('STAGE_PLAN_REQUIRED');
  Object.assign(proof,{head:plan.head,owner:plan.owner,operation_id:plan.operation_id,started_ts:started});
  await boundary('BEFORE_SNAPSHOT',24,28);proof.before=snapshot(await adapter.snapshot({phase:'before'}));
  if(!oldIdentity(proof.before))fail('STAGE_OLD_PAID_IDENTITY_REQUIRED');
  if(proof.before.latest_uploaded_version!==proof.before.version_id)fail('STAGE_FOREIGN_DORMANT_LATEST');
  const annotations={'workers/tag':'R2STAGE:'+plan.operation_id,'workers/commit_sha':plan.head,'workers/message':'Stage only '+plan.owner+' '+plan.operation_id};
  proof.intent={operation_id:plan.operation_id,owner:plan.owner,head:plan.head,operation_started_ts:started,saved_before_upload_ts:now(),candidate_module_sha256:expected,annotations,request_annotations_sha256:rolloutDigest(annotations),annotations_are_REQUEST_ONLY:true,GET_annotations_assumed:false};
  proof.status='STAGE_ONLY_UPLOAD_INTENT';await persist('STAGE_INTENT_SAVE_NOT_CLOSED');
  await boundary('UPLOAD',16,20);proof.upload_attempts=1;attempted=true;let ack=null;
  try{ack=await adapter.stage({plan:structuredClone(plan),before:structuredClone(proof.before),intent:structuredClone(proof.intent)});}catch{proof.upload_ACK_unknown=true;}
  if(id(ack?.version_id)&&ack.activated===false){
   if(ack.version_id===proof.before.version_id)fail('STAGE_NATIVE_READBACK_NOT_CLOSED');
   proof.known_upload_ack=true;proof.upload_ack={version_id:ack.version_id,activated:false,ownership_basis:'ACTUAL_OWN_UPLOAD_RESPONSE_ID',request_metadata_sha256:hex(ack.request_metadata_sha256)?ack.request_metadata_sha256:null};
   await boundary('READ_STAGED',10,12);const staged=await adapter.readStaged({version_id:ack.version_id,intent:structuredClone(proof.intent),before:structuredClone(proof.before)});
   if(!staged||staged.version_id!==ack.version_id||staged.latest_uploaded_version!==ack.version_id||staged.module_sha256!==expected||staged.module_readback_basis!=='EXACT_LATEST_UPLOAD_SOURCE_BYTES'||!hex(staged.immutable_script_etag)||!hex(staged.settings_sha256)||!hex(staged.runtime_sha256)||staged.settings_sha256!==proof.before.settings_sha256||staged.runtime_sha256!==proof.before.runtime_sha256||!Array.isArray(staged.binding_names)||rolloutDigest([...staged.binding_names].sort())!==rolloutDigest(proof.before.binding_names))fail('STAGE_NATIVE_READBACK_NOT_CLOSED');
   const observed=now(),created=time(staged.created_on_ts)?staged.created_on_ts:null;
   proof.staged={version_id:staged.version_id,module_sha256:staged.module_sha256,module_readback_basis:staged.module_readback_basis,immutable_script_etag:staged.immutable_script_etag,settings_sha256:staged.settings_sha256,runtime_sha256:staged.runtime_sha256,binding_names:[...staged.binding_names].sort(),metadata_sha256:hex(staged.metadata_sha256)?staged.metadata_sha256:null,created_on_ts:created,created_clock_status:created===null?'UNKNOWN':created<started||created>observed?'OUTSIDE_CLIENT_OBSERVATION_WINDOW':'WITHIN_CLIENT_OBSERVATION_WINDOW',observed_ts:observed,clock_is_ownership_or_billing_proof:false,ownership_basis:'KNOWN_UPLOAD_ACK_PLUS_EXACT_NATIVE_READBACK'};
  }else{
   proof.upload_ACK_unknown=true;await boundary('OBSERVE_UNKNOWN_ACK',10,12);
   try{proof.observed_after_unknown_ACK=observation(await adapter.reconcileOwnStage({intent:structuredClone(proof.intent),before:structuredClone(proof.before)}));}catch{proof.unknown_ACK_observation_not_closed=true;}
   proof.status='STAGE_ACK_UNKNOWN_OWNERSHIP_UNRESOLVED';
  }
  await boundary('AFTER_SNAPSHOT',5,6);afterAttempted=true;proof.after=snapshot(await adapter.snapshot({phase:'after'}));proof.active_preservation_verified=preserved(proof.before,proof.after);
  if(!proof.active_preservation_verified)fail('STAGE_ACTIVE_OR_SETTINGS_CHANGED');
  if(proof.known_upload_ack){if(proof.after.latest_uploaded_version!==proof.upload_ack.version_id)fail('STAGE_LATEST_MOVED');proof.ownership_verified=true;proof.status='STAGED_OWN_VERSION_VERIFIED_ACTIVE_UNCHANGED';}
  proof.completed_ts=now();await persist('STAGE_FINAL_SAVE_NOT_CLOSED');return structuredClone(proof);
 }catch(error){
  proof.reason=codes.has(error?.stage_code)?error.stage_code:'STAGE_CONTROL_NOT_CLOSED';proof.failed_phase=phase;proof.status=attempted&&!proof.known_upload_ack?'STAGE_ACK_UNKNOWN_OWNERSHIP_UNRESOLVED':'STAGE_ONLY_NOT_CLOSED';proof.ownership_verified=false;
  if(attempted&&!afterAttempted&&proof.before){try{await boundary('AFTER_UNCLOSED_STAGE',5,6);afterAttempted=true;proof.after=snapshot(await adapter.snapshot({phase:'after'}));proof.active_preservation_verified=preserved(proof.before,proof.after);}catch{proof.active_preservation_verified=null;}}
  try{proof.completed_ts=now();}catch{proof.completed_ts=null;}
  try{await persist('STAGE_FINAL_SAVE_NOT_CLOSED');}catch{proof.proof_persisted=false;}
  return structuredClone(proof);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await rolloutCorrelatedBridge();
