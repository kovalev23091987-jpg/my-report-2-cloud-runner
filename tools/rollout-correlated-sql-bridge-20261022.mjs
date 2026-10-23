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
import {workerSettingsFingerprint} from '../runner/htx-coordinated-rollout.mjs';
export function createCorrelatedStageNativeAdapter({cf,head,owner,configured_bridge_matches_account_script,secret_values=[],saveTransportIntent}={}){
 if(typeof cf!=='function'||typeof saveTransportIntent!=='function'||configured_bridge_matches_account_script!==true||!/^[a-f0-9]{40}$/.test(head||'')||typeof owner!=='string'||!Array.isArray(secret_values))throw Error('NATIVE_STAGE_ADAPTER_BINDING_REQUIRED');
 let settings=null,runtime=null,originalBytes=null,expectedBytes=null;
 const reader=createVersionBoundWorkerReader({call:(name,path,opt)=>{if(name!==SQL_BRIDGE_SCRIPT)throw Error('NATIVE_STAGE_EXACT_WORKER_REQUIRED');return cf(path,opt);}});
 const nativeCreated=v=>{const s=v?.metadata?.created_on;if(typeof s!=='string'||s.length>64)return null;const n=Date.parse(s);return Number.isSafeInteger(n)&&n>=1e12&&n<=8640000000000000?n:null;};
  const worker={name:SQL_BRIDGE_SCRIPT,crons:[]};
  const snapshot=async({phase})=>{
   const state=await reader.read(worker),version=reader.version(SQL_BRIDGE_SCRIPT,state.version_id),currentSettings=reader.settings(SQL_BRIDGE_SCRIPT,state.version_id),latest=(await cf('/versions?per_page=1')).items?.[0]?.id;
   if(phase==='before'){
    settings=currentSettings;runtime=version.resources.script_runtime;originalBytes=reader.module(SQL_BRIDGE_SCRIPT,state.version_id)?.bytes;
    if(!Buffer.isBuffer(originalBytes)||rolloutDigest(originalBytes)!==RETENTION_SQL_BRIDGE_PROOF.module_sha256)throw Error('NATIVE_STAGE_EXACT_ORIGINAL_BYTES_REQUIRED');
    expectedBytes=Buffer.from(addExactSQLBridgeCostCorrelation(originalBytes.toString('utf8')).source);
    if(rolloutDigest(expectedBytes)!=='c327b49eb1ebb6a48ac86e1a99d55a3d861f6bc5a2c76dfd0c0d90be88026063')throw Error('NATIVE_STAGE_EXACT_CANDIDATE_REQUIRED');
    if(secret_values.some(v=>typeof v==='string'&&v.length>=12&&expectedBytes.includes(Buffer.from(v))))throw Error('NATIVE_STAGE_SECRET_EXPORT_DENIED');
   }
   return{version_id:state.version_id,deployment_id:state.deployment_id,module_sha256:state.module_sha256,settings_sha256:state.settings_sha256,crons_sha256:state.crons_sha256,runtime_sha256:rolloutDigest(version.resources.script_runtime),binding_names:state.binding_names,latest_uploaded_version:latest,immutable_script_etag:state.immutable_script_etag};
  };
  const describeStaged=async(version,bytes)=>{
   if(!version||typeof version.id!=='string'||version.id!==bytes.version_id||!version.resources?.script_runtime)throw Error('NATIVE_STAGE_VERSION_SOURCE_BINDING_REQUIRED');
   const currentSettings=selectedVersionSettings(await cf('/settings'),version);
   return{version_id:version.id,latest_uploaded_version:bytes.version_id,module_sha256:bytes.module_sha256,module_readback_basis:'EXACT_LATEST_UPLOAD_SOURCE_BYTES',created_on_ts:nativeCreated(version),metadata_sha256:version.metadata&&typeof version.metadata==='object'&&!Array.isArray(version.metadata)?rolloutDigest(version.metadata):null,settings_sha256:workerSettingsFingerprint(currentSettings),runtime_sha256:rolloutDigest(version.resources.script_runtime),binding_names:currentSettings.bindings.map(x=>x.name).sort(),immutable_script_etag:version.resources.script?.etag??null};
  };
  const adapter={snapshot,
   stage:async({plan,before,intent})=>{
    const latest=(await cf('/versions?per_page=1')).items?.[0]?.id,metadata=sqlBridgeCounterVersionMetadata({settings,runtime,head,active_version:before.version_id,latest_uploaded_version:latest});
    metadata.annotations={...metadata.annotations,...intent.annotations};const metadataText=JSON.stringify(metadata);
    const transportIntent={schema:'NATIVE_STAGE_UPLOAD_TRANSPORT_INTENT_V1',operation_id:plan.operation_id,head,owner,script:SQL_BRIDGE_SCRIPT,metadata_json_utf8_sha256:rolloutDigest(Buffer.from(metadataText)),module_sha256:rolloutDigest(expectedBytes),module_bytes:expectedBytes.length,annotations_sha256:rolloutDigest(metadata.annotations),request_metadata_hash_is_not_multipart_wire_hash:true,configured_bridge_matches:configured_bridge_matches_account_script,upload_transport_intent_saved:false};
    await saveTransportIntent(structuredClone(transportIntent));const form=new FormData();form.set('metadata',new Blob([metadataText],{type:'application/json'}));form.set('bridge-worker.js',new Blob([expectedBytes],{type:'application/javascript+module'}),'bridge-worker.js');
    transportIntent.upload_transport_intent_saved=true;await saveTransportIntent(structuredClone(transportIntent));const v=await cf('/versions?bindings_inherit=strict',{method:'POST',body:form});
    return{version_id:v.id,activated:false,request_metadata_sha256:transportIntent.metadata_json_utf8_sha256};
   },
   readStaged:async({version_id})=>{const version=await cf('/versions/'+version_id),bytes=await reader.latestBytes(SQL_BRIDGE_SCRIPT,version_id);return describeStaged(version,bytes);},
   reconcileOwnStage:async()=>{const bytes=await reader.latestBytes(SQL_BRIDGE_SCRIPT),version=await cf('/versions/'+bytes.version_id);return describeStaged(version,bytes);}
  };
 return adapter;
}
// The stage-only native entry uses existing authenticated version readers.
// It never calls the bridge HTTP handler, deployment API or script settings PATCH.
export async function runCorrelatedBridgeStageOnly(){
 const repo='kovalev23091987-jpg/my-report-2-cloud-runner',dir='audit-output/bridge-correlated-cost-stage',prefix='checkpoints/report-producer-and-bridge-stage-connected-20261022',head=process.env.EXPECTED_MAIN,owner=process.env.BORROW_EXISTING_OWNER,scopePrefix='OWNER_FIVE_ACTIVE_DIRECTIONS.REPORT_PRODUCER_CORRELATION_AND_BRIDGE_STAGE_ONLY_20261022.';
 const budget=createUnifiedHttpBudget(P.http);let github_HTTP=0,cloudflare_HTTP=0,gh,stageProof=null,transportIntent=null,outerReason=null,actual_upload_HTTP_attempts=0;
 await fs.mkdir(dir,{recursive:true});
 const save=async p=>{
  if(p)stageProof=structuredClone(p);
  const value={schema:'CORRELATED_SQL_BRIDGE_NATIVE_STAGE_CONTROL_V1',head,owner,status:stageProof?.status??'NATIVE_STAGE_NOT_STARTED',reason:outerReason,stage:stageProof,transport_intent:transportIntent,actual_upload_HTTP_attempts,metadata_hash_basis:'STABLE_CANONICAL_VERSION_METADATA_NOT_RAW_REPLY',local_intent_crash_durability_qualified:false,github_HTTP,cloudflare_HTTP,whole_HTTP:budget.summary(),manual_HTTP_reserved:24,native_SQL:0,Worker_invocations:0,sourceHTTP:0,MAIN:0,Telegram:0,activation_attempts:0,settings_mutations:0,delete_attempts:0,old_unknown_recovered:false,current_Telegram_restored:false,secret_values_exported:false,source_body_exported:false,native_transient_changes_excluded:false};
  const text=JSON.stringify(value,null,2)+'\n';if(Buffer.byteLength(text)>131072)throw Error('NATIVE_STAGE_PROOF_BOUND');await fs.writeFile(dir+'/proof.tmp',text);await fs.rename(dir+'/proof.tmp',dir+'/proof.json');
 };
 const reserve=kind=>{const used=kind==='github'?github_HTTP:cloudflare_HTTP;if(used>=40||budget.summary().remaining<=24)throw Error('NATIVE_STAGE_CONTROL_HTTP_BOUND');const lane=kind==='cloudflare'&&budget.summary().used.background<56?'background':'hot';if(!budget.reserve({logical_request_id:'NATIVE_BRIDGE_STAGE:'+kind+':'+used,lane,attempts:1}).allowed)throw Error('NATIVE_STAGE_CONTROL_HTTP_BOUND');if(kind==='github')github_HTTP++;else cloudflare_HTTP++;};
 async function guard({min_headroom_ms=30000,minimum_CF=0,minimum_GH=0}={}){
  const context=await readMirrorContext(gh,{expected_main:head,maximum_blob_reads:0}),checked=assertMirrorOwner(context,owner,Date.now(),scopePrefix);
  if(checked.lease.expires_ts-Date.now()<min_headroom_ms||40-cloudflare_HTTP<minimum_CF||40-github_HTTP<minimum_GH||budget.summary().remaining-24<minimum_CF+minimum_GH)throw Error('NATIVE_STAGE_OWN_SCOPE_OR_HEADROOM_REQUIRED');
 }
 async function cf(suffix,{method='GET',body,raw=false}={}){
  const read=/^\/(?:deployments|settings|schedules|subdomain|versions\?per_page=1|versions\/[a-f0-9-]{36}|content\/v2)$/.test(suffix),upload=suffix==='/versions?bindings_inherit=strict'&&body instanceof FormData;
  if(!(method==='GET'&&read&&body===undefined||method==='POST'&&upload))throw Error('NATIVE_STAGE_ROUTE_DENIED');
  await guard();reserve('cloudflare');
  const url=`https://api.cloudflare.com/client/v4/accounts/${P.account}/workers${suffix==='/subdomain'?'/subdomain':'/scripts/'+SQL_BRIDGE_SCRIPT+suffix}`;
  if(method==='POST')actual_upload_HTTP_attempts++;
  const r=await fetch(url,{method,headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},...(body?{body}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok){await r.body?.cancel();throw Error('NATIVE_STAGE_CONTROL_HTTP_'+r.status);}const bytes=await boundedControlBody(r,raw?6500000:262144);
  if(raw)return new Response(bytes,{headers:{'content-type':r.headers.get('content-type')||'application/octet-stream'}});
  let j;try{j=JSON.parse(bytes.toString('utf8'));}catch{throw Error('NATIVE_STAGE_REPLY_JSON_NOT_CLOSED');}if(j.success!==true||j.result===undefined||j.result===null)throw Error('NATIVE_STAGE_REPLY_ACK_REQUIRED');return j.result;
 }
 try{
  if(process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_SHA!==head||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_RUN_ATTEMPT!=='1'||process.env.EXECUTE_CORRELATED_COST_STAGE!=='true'||process.env.EXECUTE_CORRELATED_COST_RELEASE==='true'||process.env.EXECUTE_SQL_BRIDGE_REPAIR==='true'||process.env.READ_ONLY_BRIDGE_INSPECTION==='true'||!process.env.CLOUDFLARE_API_TOKEN||!/^\d+$/.test(process.env.CONNECTED_RUN||''))throw Error('EXACT_CURRENT_NATIVE_STAGE_MODE_REQUIRED');
  gh=makeGithubControl({repository:repo,token:process.env.GITHUB_TOKEN,fetch_impl:(url,opt)=>{if(opt.method!=='GET'&&!(url==='https://api.github.com/graphql'&&opt.method==='POST'&&!String(opt.body).includes('mutation')))throw Error('NATIVE_STAGE_GITHUB_READ_ONLY');reserve('github');return fetch(url,{...opt,redirect:'error'});}});
  await guard({min_headroom_ms:600000});
  const qualified=JSON.parse(await fs.readFile(prefix+'/qualification-receipt.json','utf8')),pins=JSON.parse(await fs.readFile(prefix+'/qualification-scope.json','utf8'));
  const [run,wf,automatic]=await Promise.all([gh.call('actions/runs/'+process.env.CONNECTED_RUN),gh.call('actions/workflows/liq-assembled-offline-20261012.yml'),gh.call('actions/runs?head_sha='+head+'&per_page=30')]);
  if(qualified.run_id!==run.id||qualified.head!==run.head_sha||run.workflow_id!==wf.id||run.status!=='completed'||run.conclusion!=='success'||qualified.actual_SPEC_pass!==1||qualified.actual_SPEC_fail!==0||!automatic.workflow_runs?.some(x=>x.workflow_id===wf.id&&x.event==='push'&&x.head_sha===head&&x.status==='completed'&&x.conclusion==='success'))throw Error('NATIVE_STAGE_CURRENT_CODE_QUALIFICATION_REQUIRED');
  for(const q of ['current-generation/files/runner-main.mjs','runner/report2-d1-adapter.mjs','runner/native-query-cost-journal.mjs','runner/sql-bridge-counter-repair.mjs','runner/cloudflare-version-bound-readback.mjs','runner/retention-bridge-provenance.mjs','tools/rollout-correlated-sql-bridge-20261022.mjs','.github/workflows/current-bridge-module-inspection-20261016.yml'])if(rolloutDigest(await fs.readFile(q))!==pins.files[q])throw Error('NATIVE_STAGE_QUALIFIED_SOURCE_PIN_CHANGED');
  const context=gh.mirror_context,lease=assertMirrorOwner(context,owner,Date.now(),scopePrefix).lease,operation_id=globalThis.crypto.randomUUID();
  const identity=exactConfiguredSQLBridgeURL(process.env.REPORT2_D1_BRIDGE_URL,(await cf('/subdomain')).subdomain);
  const adapter=createCorrelatedStageNativeAdapter({cf,head,owner,configured_bridge_matches_account_script:identity.configured_bridge_matches_account_script,secret_values:Object.entries(process.env).filter(([k,v])=>/TOKEN|SECRET|KEY/.test(k)&&typeof v==='string'&&v.length>=12).map(([,v])=>v),saveTransportIntent:async x=>{transportIntent=x;await save();}});
  stageProof=await stageCorrelatedSQLBridgeOnly({plan:{head,owner,operation_id,lease_expires_ts:lease.expires_ts,candidate_module_sha256:'c327b49eb1ebb6a48ac86e1a99d55a3d861f6bc5a2c76dfd0c0d90be88026063'},adapter,guard,save,clock:Date.now});
  await save();if(stageProof.status!=='STAGED_OWN_VERSION_VERIFIED_ACTIVE_UNCHANGED')process.exitCode=1;
 }catch(error){outerReason=/^[A-Z0-9_]+$/.test(error?.message||'')?error.message:'NATIVE_STAGE_CONTROL_NOT_CLOSED';try{await save();}catch{}process.exitCode=1;}
 console.log(JSON.stringify({status:stageProof?.status??'NATIVE_STAGE_NOT_STARTED',reason:outerReason,head,github_HTTP,cloudflare_HTTP,activation_attempts:0,settings_mutations:0,native_SQL:0,Worker_invocations:0,sourceHTTP:0,MAIN:0,Telegram:0}));return stageProof;
}

const EXISTING_ACTIVATION_SOURCE_BINDING=Object.freeze({"module_path":"runner/retention-bridge-provenance.mjs","module_sha256":"f25b2e35e30a6457e5322b72b069c904c3bc2ce9de1956eb292d6238036f79c2","consumer_sha256":{"tools/run-paid-sliding-history-20261018.mjs":"d6e1d3ffb5b011d1686536521a2abf80ecc9dec23f9b86b41745e043899b177c","tools/recover-lossless-retained-history-20261014.mjs":"1335612c4b492cb75142f523e864aa4cc98c81b3dd32a64da850f6891f76b2f4"}});
// PROPOSED append to the existing CLI. Author execution: ZERO.
// SOURCE binding is a frozen literal in source-binding.mjs.txt, never a caller option.
import activationPath from 'node:path';
import {attestRetentionSQLBridgeCompatibility,observeRetentionSQLBridge} from '../runner/retention-bridge-provenance.mjs';
const EXISTING_ACTIVATION_IDENTITIES=Object.freeze({
 old_version:'7011c257-4bdc-4244-a858-42c30e8532ab',old_deployment:'8cd9ba38-b819-49ce-9ff2-e1e7f3e8541b',old_module:'06603b69686f7f14b62d1ab551af18555d4f506c4edd7cb7cee3ca58a1e904bf',old_etag:'faf47729620694c0e12f5c439fd5f22a15d42dbee42bc66625ff9c7e57ad8836',
 new_version:'86f1bdc5-c7d7-4bbd-917b-cf60babc5a3e',new_module:'c327b49eb1ebb6a48ac86e1a99d55a3d861f6bc5a2c76dfd0c0d90be88026063',new_etag:'ac9d474832fa5a166a92032b19f42ee85bd4fb91b5066fd75da1877a8f051e29',
 settings:'05120adabd88e1efd64749dafe2b4749a971068ad740f86e816084d1198a6ded',crons:'4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',runtime:'cf3bca9e631f2fa26b3bb242b9784c8ea557bf8ed64d00fdc87bf6c9d64b144a',
 binding_names:Object.freeze(['DATA_DB','REPORT2_CLOUD_BRIDGE_TOKEN','REPORT2_DENO_BRIDGE_TOKEN']),stage_summary:'f010dc6368027ecc789d85d53609c96018fb7da961e9fad4a9e91e69996ac4a7'
});
export async function activateExistingCorrelatedBridge({plan,repo_root,adapter,guard,save,clock=Date.now}={}){
 const I=EXISTING_ACTIVATION_IDENTITIES,B=EXISTING_ACTIVATION_SOURCE_BINDING;
 const id=x=>typeof x==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(x),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),time=x=>Number.isSafeInteger(x)&&x>=1e12&&x<=8640000000000000;
 const fail=code=>{throw Object.assign(Error(code),{activation_code:code});};
 const p={schema:'EXISTING_CORRELATED_BRIDGE_ACTIVATION_V1',status:'EXISTING_ACTIVATION_NOT_STARTED',head:null,owner:null,operation_id:null,compatibility:null,before:null,prospective_logging_settings:null,staged:null,pre_activation:null,intent:null,activation_attempts:0,known_activation_ACK:false,activation_ownership_verified:false,after:null,unknown_ACK_observation:null,rollback_attempts:0,rollback:null,reason:null,proof_persisted:false,upload_attempts:0,settings_mutations:0,delete_attempts:0,native_SQL:0,Worker_invocations:0,sourceHTTP:0,MAIN:0,Telegram:0,logging_settings_changed:false,old_unknown_recovered:false,day_hold_removed:false,global_crash_durable_once_qualified:false,transient_changes_excluded:false};
 let previous=null,phase='PLAN',attempted=false,known=false,postVerified=false,finalGuardAttempted=false;
 const now=()=>{let n;try{n=clock();}catch{fail('EXISTING_ACTIVATION_CLOCK_REQUIRED');}if(!time(n)||previous!==null&&n<previous)fail('EXISTING_ACTIVATION_CLOCK_REQUIRED');previous=n;return n;};
 const persist=async()=>{try{const c=structuredClone({...p,proof_persisted:true});if(Buffer.byteLength(JSON.stringify(c))>24576)throw Error('BOUND');await save(c);p.proof_persisted=true;}catch{p.proof_persisted=false;fail('EXISTING_ACTIVATION_SAVE_NOT_CLOSED');}};
 const boundary=async(label,minimum_CF,minimum_GH,final_fresh=false)=>{phase=label;if(final_fresh)finalGuardAttempted=true;const min_headroom_ms=Math.max(30000,(minimum_CF+minimum_GH)*2000+30000);if(plan.lease_expires_ts-now()<min_headroom_ms)fail('EXISTING_ACTIVATION_SCOPE_OR_TAIL_REQUIRED');try{await guard({phase:label,minimum_CF,minimum_GH,min_headroom_ms,final_fresh});}catch{fail('EXISTING_ACTIVATION_SCOPE_OR_TAIL_REQUIRED');}if(plan.lease_expires_ts-now()<min_headroom_ms)fail('EXISTING_ACTIVATION_SCOPE_OR_TAIL_REQUIRED');};
 const safe=x=>{
  if(!x||!id(x.version_id)||!id(x.deployment_id)||!['settings_sha256','crons_sha256','runtime_sha256','immutable_script_etag'].every(k=>hex(x[k]))||x.module_sha256!==null&&!hex(x.module_sha256)||x.latest_uploaded_version!==null&&!id(x.latest_uploaded_version)||!Array.isArray(x.binding_names)||x.binding_names.length!==3||x.binding_names.some(n=>typeof n!=='string'||n.length>64))fail('EXISTING_ACTIVATION_SAFE_METADATA_REQUIRED');
  return Object.fromEntries(['version_id','deployment_id','module_sha256','module_readback_basis','settings_sha256','crons_sha256','runtime_sha256','immutable_script_etag','latest_uploaded_version','binding_names'].map(k=>[k,k==='binding_names'?[...x[k]].sort():k==='module_readback_basis'?(['SAME_IMMUTABLE_VERSION_AND_ETAG_AS_PRIOR_EXACT_NATIVE_MODULE','SAME_IMMUTABLE_VERSION_AND_ETAG_AS_PREACTIVATION_NATIVE_SOURCE','EXACT_LATEST_UPLOAD_SOURCE_BYTES','UNKNOWN_VERSION_NO_MODULE_CLAIM'].includes(x[k])?x[k]:null):x[k]]));
 };
 const matches=(x,kind,latest=true)=>x?.version_id===I[kind+'_version']&&x.module_sha256===I[kind+'_module']&&x.immutable_script_etag===I[kind+'_etag']&&x.settings_sha256===I.settings&&x.crons_sha256===I.crons&&x.runtime_sha256===I.runtime&&rolloutDigest(x.binding_names)===rolloutDigest(I.binding_names)&&(!latest||x.latest_uploaded_version===I.new_version);
 const ack=(x,target)=>{if(!id(x?.deployment_id)||x.version_id!==target||x.response_basis!=='EXACT_OWN_POST_DEPLOYMENTS_RESPONSE')return null;return{deployment_id:x.deployment_id,version_id:x.version_id,response_basis:x.response_basis};};
 const reason=e=>typeof e?.activation_code==='string'&&/^EXISTING_ACTIVATION_[A-Z0-9_]+$/.test(e.activation_code)?e.activation_code:'EXISTING_ACTIVATION_CONTROL_NOT_CLOSED';
 async function conditionalRollback(){
  p.rollback={status:'OWN_ROLLBACK_NOT_STARTED',ownership_verified:false};
  try{
   await boundary('ROLLBACK_PRECHECK',11,12);const current=safe(await adapter.readActive());p.rollback.precheck=current;
   if(!matches(current,'new')||current.deployment_id!==p.activation_ack.deployment_id){p.status='EXISTING_ACTIVATION_FOREIGN_CHANGE_STOP';p.rollback.status='FOREIGN_OR_CHANGED_STATE_NOT_OVERWRITTEN';return;}
   p.rollback.intent={target_version:I.old_version,only_own_deployment:p.activation_ack.deployment_id,owner:p.owner,head:p.head,operation_id:p.operation_id,saved_before_transport_ts:now()};await persist();
   await boundary('ROLLBACK_DEPLOY',6,7);p.rollback_attempts=1;let r=null;
   try{r=ack(await adapter.deploy({action:'ROLLBACK_OWN',version_id:I.old_version,intent:structuredClone(p.rollback.intent)}),I.old_version);}catch{p.rollback.ACK_unknown=true;}
   if(!r)p.rollback.ACK_unknown=true;else p.rollback.ack=r;
   await boundary('ROLLBACK_READBACK',5,6);p.rollback.after=safe(await adapter.readActive());
   if(!r){p.status='EXISTING_ACTIVATION_ROLLBACK_ACK_UNKNOWN_STOP';p.rollback.status='ROLLBACK_ACK_UNKNOWN_NO_RETRY';p.rollback.old_version_observed=matches(p.rollback.after,'old');return;}
   if(!matches(p.rollback.after,'old')||p.rollback.after.deployment_id!==r.deployment_id){p.status='EXISTING_ACTIVATION_ROLLBACK_NOT_CLOSED';p.rollback.status='EXACT_ROLLBACK_READBACK_NOT_CLOSED';return;}
   p.rollback.status='EXACT_OWN_OLD_VERSION_RESTORED';p.rollback.ownership_verified=true;p.status='EXISTING_ACTIVATION_OWN_ROLLBACK_VERIFIED';
  }catch(e){p.rollback.reason=reason(e);p.rollback.status=p.rollback_attempts?'ROLLBACK_NOT_CLOSED_STOP':'ROLLBACK_GUARD_OR_OBSERVATION_STOP';p.status=p.rollback.ACK_unknown?'EXISTING_ACTIVATION_ROLLBACK_ACK_UNKNOWN_STOP':'EXISTING_ACTIVATION_KNOWN_ACK_NOT_CLOSED';}
 }
 try{
  const start=now();
  if(!plan||!/^[a-f0-9]{40}$/.test(plan.head||'')||!/^CODEX:ACTIVE105_SOURCE_RELIABILITY:\d{13}$/.test(plan.owner||'')||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(plan.operation_id||'')||!time(plan.lease_expires_ts)||plan.lease_expires_ts-start>90*60000||plan.lease_expires_ts-start<600000||typeof repo_root!=='string'||typeof guard!=='function'||typeof save!=='function'||!['before','readStaged','recheckBefore','deploy','readActive'].every(k=>typeof adapter?.[k]==='function'))fail('EXISTING_ACTIVATION_PLAN_REQUIRED');
  Object.assign(p,{head:plan.head,owner:plan.owner,operation_id:plan.operation_id,started_ts:start});
  // This real filesystem attestation executes before any adapter/CF call.
  phase='REAL_SOURCE_COMPATIBILITY';const root=await fs.realpath(repo_root),moduleBytes=await fs.readFile(activationPath.join(root,B.module_path));
  if(rolloutDigest(moduleBytes)!==B.module_sha256)fail('EXISTING_ACTIVATION_SOURCE_MODULE_PIN_CHANGED');
  const a=await attestRetentionSQLBridgeCompatibility({repo_root:root});
  if(a?.status!=='EXACT_TWO_CONSUMERS_CODE_ACTIVE_COMPATIBILITY'||a.compatibility_module_sha256!==B.module_sha256||rolloutDigest(a.consumer_sha256)!==rolloutDigest(B.consumer_sha256)||a.stage_receipt_sha256!==I.stage_summary||a.logging_settings_allowed!==false||a.admission!==false||a.old_identity?.version_id!==I.old_version||a.old_identity?.module_sha256!==I.old_module||a.new_identity?.version_id!==I.new_version||a.new_identity?.module_sha256!==I.new_module)fail('EXISTING_ACTIVATION_SOURCE_COMPATIBILITY_NOT_CLOSED');
  p.compatibility={status:a.status,compatibility_module_sha256:a.compatibility_module_sha256,consumer_sha256:structuredClone(a.consumer_sha256),stage_receipt_sha256:a.stage_receipt_sha256,logging_settings_allowed:false,admission:false};
  await boundary('BEFORE_METADATA',33,34);const before=await adapter.before();p.before=safe(before);if(!matches(p.before,'old',false)||p.before.deployment_id!==I.old_deployment)fail('EXISTING_ACTIVATION_OLD_PAID_METADATA_REQUIRED');
  const projected=before.prospective_logging_settings;
  if(projected?.selected_version===p.before.version_id&&projected.baseline_settings_sha256===p.before.settings_sha256&&hex(projected.prospective_settings_sha256)&&projected.projected_not_native_poststate===true&&projected.logging_settings_admitted===false)p.prospective_logging_settings={selected_version:p.before.version_id,baseline_settings_sha256:p.before.settings_sha256,prospective_settings_sha256:projected.prospective_settings_sha256,projected_not_native_poststate:true,logging_settings_admitted:false};
  else p.prospective_logging_projection_unavailable=true;
  await boundary('READ_STAGED',28,29);const staged=await adapter.readStaged();
  if(!staged||staged.version_id!==I.new_version||staged.latest_uploaded_version!==I.new_version||staged.module_sha256!==I.new_module||staged.module_readback_basis!=='EXACT_LATEST_UPLOAD_SOURCE_BYTES'||staged.immutable_script_etag!==I.new_etag||staged.settings_sha256!==I.settings||staged.runtime_sha256!==I.runtime||staged.crons_sha256!==I.crons||rolloutDigest(staged.binding_names)!==rolloutDigest(I.binding_names))fail('EXISTING_ACTIVATION_STAGED_SOURCE_NOT_CLOSED');
  p.staged={version_id:I.new_version,latest_uploaded_version:I.new_version,module_sha256:I.new_module,module_readback_basis:staged.module_readback_basis,immutable_script_etag:I.new_etag,settings_sha256:I.settings,runtime_sha256:I.runtime,crons_sha256:I.crons,binding_names:[...I.binding_names],ownership_basis:'PRIOR_KNOWN_UPLOAD_ACK_AND_EXACT_NATIVE_STAGE_SUMMARY',stage_summary_sha256:I.stage_summary};
  await boundary('PRE_ACTIVATION',22,23);p.pre_activation=safe(await adapter.recheckBefore());
  if(!matches(p.pre_activation,'old')||p.pre_activation.deployment_id!==p.before.deployment_id)fail('EXISTING_ACTIVATION_PRESTATE_MOVED');
  p.intent={target_version:I.new_version,module_sha256:I.new_module,source_stage_summary_sha256:I.stage_summary,expected_previous_deployment:p.before.deployment_id,owner:p.owner,head:p.head,operation_id:p.operation_id,saved_before_transport_ts:now(),retry_unknown:false};p.status='EXISTING_ACTIVATION_DEPLOY_INTENT';await persist();
  await boundary('DEPLOY_EXISTING',17,18);attempted=true;p.activation_attempts=1;let response=null;
  try{response=ack(await adapter.deploy({action:'ACTIVATE_EXISTING',version_id:I.new_version,intent:structuredClone(p.intent)}),I.new_version);}catch{p.activation_ACK_unknown=true;}
  if(!response||response.deployment_id===p.before.deployment_id){
   p.activation_ACK_unknown=true;p.status='EXISTING_ACTIVATION_ACK_UNKNOWN_STOP';
   try{await boundary('OBSERVE_UNKNOWN_DEPLOY',5,6);p.unknown_ACK_observation=safe(await adapter.readActive());}catch{p.unknown_ACK_observation_not_closed=true;}
  }else{
   known=true;p.known_activation_ACK=true;p.activation_ack=response;await persist();
   await boundary('POST_ACTIVATION',16,17);p.after=safe(await adapter.readActive());
   if(!matches(p.after,'new')||p.after.deployment_id!==response.deployment_id)fail('EXISTING_ACTIVATION_POSTSTATE_NOT_CLOSED');
   postVerified=true;p.activation_ownership_verified=true;p.status='EXISTING_CORRELATED_VERSION_ACTIVATED_NATIVE_METADATA_VERIFIED';
  }
  await boundary('FINAL',0,1,true);p.completed_ts=now();await persist();return structuredClone(p);
 }catch(e){
  p.reason=reason(e);p.failed_phase=phase;p.activation_ownership_verified=false;
  if(!attempted)p.status='EXISTING_ACTIVATION_NOT_STARTED';else if(!known)p.status='EXISTING_ACTIVATION_ACK_UNKNOWN_STOP';else p.status='EXISTING_ACTIVATION_KNOWN_ACK_NOT_CLOSED';
  if(known&&!postVerified)await conditionalRollback();
  if(!finalGuardAttempted){try{await boundary('FINAL_UNCLOSED',0,1,true);}catch{p.final_scope_not_closed=true;}}
  try{p.completed_ts=now();}catch{p.completed_ts=null;}
  try{await persist();}catch{p.proof_persisted=false;}
  return structuredClone(p);
 }
}

export function createExistingCorrelatedActivationNativeAdapter({cf,configured_bridge_url,saveTransportIntent}={}){
 if(typeof cf!=='function'||typeof configured_bridge_url!=='string'||typeof saveTransportIntent!=='function')throw Error('EXISTING_ACTIVATION_ADAPTER_BINDING_REQUIRED');
 const I=EXISTING_ACTIVATION_IDENTITIES,reader=createVersionBoundWorkerReader({call:(name,route,options)=>{if(name!==SQL_BRIDGE_SCRIPT)throw Error('EXISTING_ACTIVATION_EXACT_WORKER_REQUIRED');return cf(route,options);}});
 let capture={};
 const call=async(name,route)=>{if(name!==SQL_BRIDGE_SCRIPT)throw Error('EXISTING_ACTIVATION_EXACT_WORKER_REQUIRED');const x=await cf(route);if(route==='/deployments')capture.d=x;else if(route==='/settings')capture.s=x;else if(route==='/schedules')capture.c=x;else if(route.startsWith('/versions/'))capture.v=x;return x;};
 const describe=(active,settings,schedules,version,latest)=>{
  const effective=selectedVersionSettings(settings,version),crons=(Array.isArray(schedules)?schedules:schedules?.schedules)?.map(x=>x.cron).sort();if(!Array.isArray(crons)||version.id!==active.version_id)throw Error('EXISTING_ACTIVATION_METADATA_BINDING_REQUIRED');
  const old=version.id===I.old_version&&version.resources?.script?.etag===I.old_etag,next=version.id===I.new_version&&version.resources?.script?.etag===I.new_etag;
  return{...active,module_sha256:old?I.old_module:next?I.new_module:null,module_readback_basis:old?'SAME_IMMUTABLE_VERSION_AND_ETAG_AS_PRIOR_EXACT_NATIVE_MODULE':next?'SAME_IMMUTABLE_VERSION_AND_ETAG_AS_PREACTIVATION_NATIVE_SOURCE':'UNKNOWN_VERSION_NO_MODULE_CLAIM',settings_sha256:workerSettingsFingerprint(effective),crons_sha256:rolloutDigest(crons),runtime_sha256:rolloutDigest(version.resources.script_runtime),binding_names:effective.bindings.map(x=>x.name).sort(),immutable_script_etag:version.resources?.script?.etag??null,latest_uploaded_version:latest};
 };
 async function old(stage,latest){
  capture={};await observeRetentionSQLBridge({expected:RETENTION_SQL_BRIDGE_PROOF,call,configured_bridge_url,stage});
  const state=describe(singleActiveVersion(capture.d),capture.s,capture.c,capture.v,latest?(await cf('/versions?per_page=1')).items?.[0]?.id:null);
  if(stage==='before_SQL'){
   try{const effective=selectedVersionSettings(capture.s,capture.v),observability=correlatedLogsIntent(effective);state.prospective_logging_settings={selected_version:state.version_id,baseline_settings_sha256:state.settings_sha256,prospective_settings_sha256:workerSettingsFingerprint({...effective,observability}),projected_not_native_poststate:true,logging_settings_admitted:false};}
   catch{state.prospective_logging_settings=null;}
  }
  return state;
 }
 return{
  before:()=>old('before_SQL',false),recheckBefore:()=>old('after_SQL',true),
  async readStaged(){
   const version=await cf('/versions/'+I.new_version),bytes=await reader.latestBytes(SQL_BRIDGE_SCRIPT,I.new_version),settings=await cf('/settings'),schedules=await cf('/schedules'),effective=selectedVersionSettings(settings,version),crons=(Array.isArray(schedules)?schedules:schedules?.schedules)?.map(x=>x.cron).sort();
   if(version.id!==I.new_version||!Array.isArray(crons))throw Error('EXISTING_ACTIVATION_STAGED_METADATA_REQUIRED');
   return{version_id:version.id,latest_uploaded_version:bytes.version_id,module_sha256:bytes.module_sha256,module_readback_basis:'EXACT_LATEST_UPLOAD_SOURCE_BYTES',immutable_script_etag:version.resources?.script?.etag??null,settings_sha256:workerSettingsFingerprint(effective),runtime_sha256:rolloutDigest(version.resources.script_runtime),crons_sha256:rolloutDigest(crons),binding_names:effective.bindings.map(x=>x.name).sort()};
  },
  async readActive(){const d=await cf('/deployments'),s=await cf('/settings'),c=await cf('/schedules'),active=singleActiveVersion(d),v=await cf('/versions/'+active.version_id),latest=(await cf('/versions?per_page=1')).items?.[0]?.id;return describe(active,s,c,v,latest);},
  async deploy({action,version_id,intent}){
   if(!['ACTIVATE_EXISTING','ROLLBACK_OWN'].includes(action)||version_id!==(action==='ACTIVATE_EXISTING'?I.new_version:I.old_version)||intent?.target_version!==version_id)throw Error('EXISTING_ACTIVATION_TRANSPORT_INTENT_REQUIRED');
   const body={strategy:'percentage',versions:[{version_id,percentage:100}],annotations:{'workers/message':(action==='ACTIVATE_EXISTING'?'Activate existing ':'Rollback own ')+intent.operation_id}};
   await saveTransportIntent({action,target_version:version_id,operation_id:intent.operation_id,owner:intent.owner,head:intent.head,expected_previous_deployment:intent.expected_previous_deployment??intent.only_own_deployment,request_JSON_sha256:rolloutDigest(body),transport_intent_saved_before_POST:true,annotations_NOT_ownership_proof:true});
   const r=await cf('/deployments',{method:'POST',body}),a=singleActiveVersion({deployments:[r]});
   if(a.version_id!==version_id)throw Error('EXISTING_ACTIVATION_TRANSPORT_ACK_UNKNOWN');return{...a,response_basis:'EXACT_OWN_POST_DEPLOYMENTS_RESPONSE'};
  }
 };
}
// Actual transport/control factory for the new path. Same factory is exercised
// with CONTROLLED HTTP by the one new callable. No production identity override.
import {fullRawBasis} from '../runner/github-four-mirror-cas.mjs';
export async function existingActivationDeadlineResponse(fetch_impl,url,options={},limit=262144){
 const deadline=AbortSignal.timeout(2000),signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline;
 let reader=null,abortListener;
 const aborted=new Promise((resolve,reject)=>{abortListener=()=>{if(reader)void reader.cancel().catch(()=>{});reject(Error('EXISTING_ACTIVATION_TRANSPORT_DEADLINE'));};signal.addEventListener('abort',abortListener,{once:true});});
 try{
  signal.throwIfAborted();
  const response=await Promise.race([fetch_impl(url,{...options,signal}),aborted]);signal.throwIfAborted();
  const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>limit))throw Error('EXISTING_ACTIVATION_REPLY_BOUND');
  if(!response.body)throw Error('EXISTING_ACTIVATION_REPLY_BODY_REQUIRED');reader=response.body.getReader();let size=0;const parts=[];
  for(;;){const r=await Promise.race([reader.read(),aborted]);signal.throwIfAborted();if(r.done)break;size+=r.value.byteLength;if(size>limit)throw Error('EXISTING_ACTIVATION_REPLY_BOUND');parts.push(Buffer.from(r.value));}
  return new Response(Buffer.concat(parts,size),{status:response.status,statusText:response.statusText,headers:response.headers});
 }catch(error){if(signal.aborted)throw Error('EXISTING_ACTIVATION_TRANSPORT_DEADLINE');throw error;}
 finally{signal.removeEventListener('abort',abortListener);if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{}}}
}
export function createExistingActivationNativeControl({repo_root,head,owner,github_token,cloudflare_token,fetch_impl=globalThis.fetch,clock=Date.now}={}){
 const repo='kovalev23091987-jpg/my-report-2-cloud-runner',scopePrefix='OWNER_FIVE_ACTIVE_DIRECTIONS.CORRELATED_BRIDGE_EXISTING_VERSION_ACTIVATION_20261022.',prefix='checkpoints/correlated-bridge-existing-version-activation-connected-20261022',I=EXISTING_ACTIVATION_IDENTITIES;
 if(typeof repo_root!=='string'||!/^[a-f0-9]{40}$/.test(head||'')||!/^CODEX:ACTIVE105_SOURCE_RELIABILITY:\d{13}$/.test(owner||'')||typeof github_token!=='string'||typeof cloudflare_token!=='string'||typeof fetch_impl!=='function'||typeof clock!=='function')throw Error('EXISTING_ACTIVATION_CONTROL_BINDING_REQUIRED');
 const budget=createUnifiedHttpBudget(P.http);let github_HTTP=0,cloudflare_HTTP=0,forward_attempts=0,rollback_attempts=0,forward_ACK_deployment=null,internal_deadline_ts=null;
 const reserve=kind=>{const used=kind==='github'?github_HTTP:cloudflare_HTTP;if(used>=40||budget.summary().remaining<=24)throw Error('EXISTING_ACTIVATION_CONTROL_HTTP_BOUND');const lane=kind==='cloudflare'&&budget.summary().used.background<56?'background':'hot';if(!budget.reserve({logical_request_id:'EXISTING_BRIDGE_ACTIVATION:'+kind+':'+used,lane,attempts:1}).allowed)throw Error('EXISTING_ACTIVATION_CONTROL_HTTP_BOUND');if(kind==='github')github_HTTP++;else cloudflare_HTTP++;};
 const gh=makeGithubControl({repository:repo,token:github_token,initial_raw_basis:fullRawBasis(repo_root),clock,fetch_impl:(url,opt)=>{if(opt.method!=='GET'&&!(url==='https://api.github.com/graphql'&&opt.method==='POST'&&!String(opt.body).includes('mutation')))throw Error('EXISTING_ACTIVATION_GITHUB_READ_ONLY');reserve('github');return existingActivationDeadlineResponse(fetch_impl,url,{...opt,redirect:'error'});}});
 function check(context,{minimum_CF=0,minimum_GH=0,min_headroom_ms=30000}={}){
  const x=assertMirrorOwner(context,owner,clock(),scopePrefix);
  if(context.head!==head||!x.lease.scope.includes('NO_RETRY_UNKNOWN_DEPLOY')||x.lease.expires_ts-clock()<min_headroom_ms||internal_deadline_ts!==null&&internal_deadline_ts-clock()<min_headroom_ms||40-cloudflare_HTTP<minimum_CF||40-github_HTTP<minimum_GH||budget.summary().remaining-24<minimum_CF+minimum_GH)throw Error('EXISTING_ACTIVATION_OWN_SCOPE_OR_HEADROOM_REQUIRED');return x;
 }
 async function freshGuard(options={}){const c=await readMirrorContext(gh,{expected_main:head,maximum_blob_reads:0,now:clock()});return check(c,options);}
 // This local check is expressly NOT a new fresh snapshot. Every CF below gets
 // its own freshGuard before reserve/transport. The final check is fresh too.
 async function phaseGuard(options={}){if(internal_deadline_ts===null)throw Error('EXISTING_ACTIVATION_EXECUTION_START_REQUIRED');check(gh.mirror_context,options);if(options.final_fresh)await freshGuard({min_headroom_ms:options.min_headroom_ms});}
 async function initialize({connected_run,execution_run}={}){
  await freshGuard({min_headroom_ms:600000});
  if(!/^\d+$/.test(String(connected_run||''))||!/^\d+$/.test(String(execution_run||'')))throw Error('EXISTING_ACTIVATION_COMMON_AND_EXECUTION_RUN_REQUIRED');
  const q=JSON.parse(await fs.readFile(activationPath.join(repo_root,prefix,'qualification-receipt.json'),'utf8')),pins=JSON.parse(await fs.readFile(activationPath.join(repo_root,prefix,'qualification-scope.json'),'utf8'));
  const [run,wf,automatic,execution]=await Promise.all([gh.call('actions/runs/'+connected_run),gh.call('actions/workflows/liq-assembled-offline-20261012.yml'),gh.call('actions/runs?head_sha='+head+'&per_page=30'),gh.call('actions/runs/'+execution_run)]);
  if(q.run_id!==run.id||q.head!==run.head_sha||run.workflow_id!==wf.id||run.status!=='completed'||run.conclusion!=='success'||q.actual_SPEC_pass!==1||q.actual_SPEC_fail!==0||!automatic.workflow_runs?.some(x=>x.workflow_id===wf.id&&x.event==='push'&&x.head_sha===head&&x.status==='completed'&&x.conclusion==='success'))throw Error('EXISTING_ACTIVATION_CURRENT_COMMON_AND_AUTOMATIC_MAIN_REQUIRED');
  const started=typeof execution?.run_started_at==='string'&&execution.run_started_at.length<=64?Date.parse(execution.run_started_at):NaN;
  if(String(execution?.id)!==String(execution_run)||execution.head_sha!==head||execution.head_branch!=='main'||execution.path!=='.github/workflows/current-bridge-module-inspection-20261016.yml'||execution.event!=='workflow_dispatch'||execution.run_attempt!==1||execution.status!=='in_progress'||!Number.isSafeInteger(started)||started>clock()||clock()>=started+300000)throw Error('EXISTING_ACTIVATION_EXECUTION_START_REQUIRED');
  internal_deadline_ts=started+300000;
  for(const path of ['current-generation/files/runner-main.mjs','runner/report2-d1-adapter.mjs','runner/native-query-cost-journal.mjs','runner/sql-bridge-counter-repair.mjs','runner/cloudflare-version-bound-readback.mjs','runner/retention-bridge-provenance.mjs','tools/run-paid-sliding-history-20261018.mjs','tools/recover-lossless-retained-history-20261014.mjs','tools/rollout-correlated-sql-bridge-20261022.mjs','.github/workflows/current-bridge-module-inspection-20261016.yml'])if(rolloutDigest(await fs.readFile(activationPath.join(repo_root,path)))!==pins.files?.[path])throw Error('EXISTING_ACTIVATION_QUALIFIED_SOURCE_PIN_CHANGED');
  return check(gh.mirror_context).lease;
 }
 async function cf(route,{method='GET',body,raw=false}={}){
  if(internal_deadline_ts===null)throw Error('EXISTING_ACTIVATION_EXECUTION_START_REQUIRED');
  const read=/^\/(?:deployments|settings|schedules|subdomain|versions\?per_page=1|versions\/[a-f0-9-]{36}|content\/v2)$/.test(route),post=route==='/deployments'&&body?.strategy==='percentage'&&body.versions?.length===1&&body.versions[0]?.percentage===100&&[I.new_version,I.old_version].includes(body.versions[0].version_id)&&Object.keys(body).every(k=>['strategy','versions','annotations'].includes(k))&&Object.keys(body.annotations??{}).every(k=>k==='workers/message');
  if(!(method==='GET'&&read&&body===undefined||method==='POST'&&post))throw Error('EXISTING_ACTIVATION_CONTROL_ROUTE_DENIED');
  const target=method==='POST'?body.versions[0].version_id:null;
  if(target===I.new_version&&(forward_attempts!==0||rollback_attempts!==0)||target===I.old_version&&(!forward_ACK_deployment||rollback_attempts!==0))throw Error('EXISTING_ACTIVATION_NO_RETRY_OR_UNOWNED_ROLLBACK');
  await freshGuard({minimum_CF:1});reserve('cloudflare');
  if(target===I.new_version)forward_attempts++;if(target===I.old_version)rollback_attempts++;
  const url=`https://api.cloudflare.com/client/v4/accounts/${P.account}/workers${route==='/subdomain'?'/subdomain':'/scripts/'+SQL_BRIDGE_SCRIPT+route}`;
  const r=await existingActivationDeadlineResponse(fetch_impl,url,{method,headers:{authorization:'Bearer '+cloudflare_token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error'},raw?6500000:262144);
  if(!r.ok){await r.body?.cancel();throw Error('EXISTING_ACTIVATION_HTTP_NOT_CLOSED');}const bytes=await boundedControlBody(r,raw?6500000:262144);
  if(raw)return new Response(bytes,{headers:{'content-type':r.headers.get('content-type')||'application/octet-stream'}});
  let j;try{j=JSON.parse(bytes.toString('utf8'));}catch{throw Error('EXISTING_ACTIVATION_REPLY_JSON_NOT_CLOSED');}if(j.success!==true||j.result===undefined||j.result===null)throw Error('EXISTING_ACTIVATION_REPLY_ACK_REQUIRED');
  if(target===I.new_version){try{const a=singleActiveVersion({deployments:[j.result]});if(a.version_id===I.new_version)forward_ACK_deployment=a.deployment_id;}catch{}}
  return j.result;
 }
 return{initialize,cf,guard:phaseGuard,metrics:()=>({github_HTTP,cloudflare_HTTP,forward_attempts,rollback_attempts,whole_HTTP:budget.summary(),manual_HTTP_reserved:24,internal_run_started_plus_5min_deadline_ts:internal_deadline_ts,internal_deadline_NOT_platform_kill_guarantee:true,new_path_transport_deadline_ms:2000,local_phase_checks_are_not_fresh_snapshots:true,every_CF_attempt_has_separate_fresh_GH_guard:true})};
}

export async function runExistingCorrelatedBridgeActivation(){
 const repo='kovalev23091987-jpg/my-report-2-cloud-runner',dir='audit-output/bridge-existing-version-activation',head=process.env.EXPECTED_MAIN,owner=process.env.BORROW_EXISTING_OWNER;
 let control=null,activation=null,transport_intent=null,outerReason=null;
 await fs.mkdir(dir,{recursive:true});
 const save=async value=>{
  if(value)activation=structuredClone(value);
  const receipt={schema:'EXISTING_CORRELATED_BRIDGE_NATIVE_ACTIVATION_CONTROL_V1',head,owner,status:activation?.status??'EXISTING_ACTIVATION_NOT_STARTED',activation,transport_intent,reason:outerReason,...control?.metrics(),native_SQL:0,Worker_invocations:0,sourceHTTP:0,MAIN:0,Telegram:0,upload_attempts:0,settings_mutations:0,delete_attempts:0,logging_settings_changed:false,old_unknown_recovered:false,day_hold_removed:false,current_Telegram_restored:false,source_body_exported:false,secret_values_exported:false,local_intent_crash_durability_qualified:false,global_crash_durable_once_qualified:false};
  const text=JSON.stringify(receipt,null,2)+'\n';if(Buffer.byteLength(text)>131072)throw Error('EXISTING_ACTIVATION_PROOF_BOUND');await fs.writeFile(dir+'/proof.tmp',text);await fs.rename(dir+'/proof.tmp',dir+'/proof.json');
 };
 try{
  if(process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_SHA!==head||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_RUN_ATTEMPT!=='1'||process.env.EXECUTE_CORRELATED_EXISTING_ACTIVATION!=='true'||['EXECUTE_CORRELATED_COST_STAGE','EXECUTE_CORRELATED_COST_RELEASE','EXECUTE_SQL_BRIDGE_REPAIR','READ_ONLY_BRIDGE_INSPECTION'].some(k=>process.env[k]==='true')||!process.env.CLOUDFLARE_API_TOKEN||!process.env.GITHUB_TOKEN)throw Error('EXISTING_ACTIVATION_EXACT_CURRENT_MODE_REQUIRED');
  control=createExistingActivationNativeControl({repo_root:process.cwd(),head,owner,github_token:process.env.GITHUB_TOKEN,cloudflare_token:process.env.CLOUDFLARE_API_TOKEN});
  const lease=await control.initialize({connected_run:process.env.CONNECTED_RUN,execution_run:process.env.GITHUB_RUN_ID});
  const adapter=createExistingCorrelatedActivationNativeAdapter({cf:control.cf,configured_bridge_url:process.env.REPORT2_D1_BRIDGE_URL,saveTransportIntent:async value=>{transport_intent=structuredClone(value);await save();}});
  activation=await activateExistingCorrelatedBridge({plan:{head,owner,lease_expires_ts:lease.expires_ts,operation_id:globalThis.crypto.randomUUID()},repo_root:process.cwd(),adapter,guard:control.guard,save});
  await save();if(activation.status!=='EXISTING_CORRELATED_VERSION_ACTIVATED_NATIVE_METADATA_VERIFIED')process.exitCode=1;
 }catch(e){outerReason=/^EXISTING_ACTIVATION_[A-Z0-9_]+$/.test(e?.message||'')?e.message:'EXISTING_ACTIVATION_CONTROL_NOT_CLOSED';try{await save();}catch{}process.exitCode=1;}
 console.log(JSON.stringify({status:activation?.status??'EXISTING_ACTIVATION_NOT_STARTED',head,...control?.metrics(),native_SQL:0,Worker_invocations:0,sourceHTTP:0,MAIN:0,Telegram:0,upload_attempts:0,settings_mutations:0}));return activation;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.env.EXECUTE_CORRELATED_EXISTING_ACTIVATION==='true'&&['EXECUTE_CORRELATED_COST_STAGE','EXECUTE_CORRELATED_COST_RELEASE','EXECUTE_SQL_BRIDGE_REPAIR','READ_ONLY_BRIDGE_INSPECTION'].some(k=>process.env[k]==='true'))throw Error('EXISTING_ACTIVATION_MIXED_MODE_REFUSED');await(process.env.EXECUTE_CORRELATED_EXISTING_ACTIVATION==='true'?runExistingCorrelatedBridgeActivation():process.env.EXECUTE_CORRELATED_COST_STAGE==='true'?runCorrelatedBridgeStageOnly():rolloutCorrelatedBridge());}
