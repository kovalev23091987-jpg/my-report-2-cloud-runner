// Coordinated weekly activation is deliberately separate from catalog approval.
// A superset may be staged in history before Node adopts it. No source call,
// cron change, schema change or loss of a previous history digest is allowed.
import {createHash} from 'node:crypto';
const digest=b=>createHash('sha256').update(b).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])])):v;
export const rolloutDigest=v=>digest(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(stable(v)));
export const WEEKLY_ROLLOUT_POLICY=Object.freeze({account:'70ee0af85191ea470e74c7383fdec772',wrangler:'4.151.0',http:{whole_job:164,hot:96,background:56,statistics:12},manual_HTTP_reserved:24,max_control_HTTP:68,max_cloudflare_HTTP:72,rollback_HTTP_reserved:16,min_lease_headroom_ms:600000,collector:'my-report-2-hub',workers:['my-report-2-free-history','my-report-2-liq-forecast-history']});
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
export function singleActiveVersion(result){
 const d=result?.deployments?.[0];
 if(!UUID.test(d?.id||'')||d.strategy!=='percentage'||d.versions?.length!==1||d.versions[0]?.percentage!==100||!UUID.test(d.versions[0]?.version_id||''))throw Error('EXACT_SINGLE_ACTIVE_WORKER_VERSION_REQUIRED');
 return{deployment_id:d.id,version_id:d.versions[0].version_id};
}
export function workerSettingsFingerprint(settings){
 if(!Array.isArray(settings?.bindings))throw Error('EXACT_WORKER_BINDINGS_REQUIRED');
 // Include values in the private fingerprint, never in an exported proof.
 const bindings=[...settings.bindings].map(b=>stable(b)).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
 return rolloutDigest({...settings,bindings});
}
export function historyVersionMetadata({settings,runtime,config,main_module,head}={}){
 if(!/^[a-f0-9]{40}$/.test(head||'')||!/^[-a-zA-Z0-9_.]+\.js$/.test(main_module||'')||settings?.compatibility_date!==config?.compatibility_date)throw Error('EXACT_HISTORY_BUILD_METADATA_REQUIRED');
 const actual=settings.bindings,expected=config.d1_databases;
 // Unexpected bindings require a separately reviewed adapter, not a deployment
 // which silently drops a variable or inherits from another uploaded version.
 if(!Array.isArray(actual)||!Array.isArray(expected)||actual.length!==expected.length||actual.some(b=>b.type!=='d1'||expected.filter(e=>e.binding===b.name&&e.database_id===(b.id??b.database_id)).length!==1)||new Set(actual.map(b=>b.name)).size!==actual.length)throw Error('EXACT_HISTORY_D1_BINDINGS_REQUIRED');
 if(!['standard','bundled'].includes(runtime?.usage_model)||runtime.compatibility_date?.slice(0,10)!==settings.compatibility_date||JSON.stringify([...(runtime.compatibility_flags||[])].sort())!==JSON.stringify([...(settings.compatibility_flags||[])].sort()))throw Error('EXACT_EXISTING_HISTORY_RUNTIME_REQUIRED');
 if(runtime.migration_tag||runtime.exports&&Object.values(runtime.exports).some(e=>e?.storage||e?.container))throw Error('STATEFUL_HISTORY_MIGRATION_NOT_ALLOWED');
 return{main_module,compatibility_date:settings.compatibility_date,compatibility_flags:settings.compatibility_flags||[],usage_model:runtime.usage_model,...(runtime.limits?{limits:runtime.limits}:{}),bindings:actual.map(b=>({name:b.name,type:'d1',id:b.id??b.database_id})),keep_bindings:[],annotations:{'workers/commit_sha':head,'workers/message':'Exact weekly HTX scope; preserve previous history readers'}};
}
export function verifySupersetHistory({previous_targets,targets,previous_manifests,manifests,manifest_sha256}={}){
 if(!Array.isArray(previous_targets)||!previous_targets.length||!Array.isArray(targets)||new Set(targets).size!==targets.length||previous_targets.some(c=>!targets.includes(c))||!Array.isArray(previous_manifests)||!Array.isArray(manifests)||!manifests.some(m=>m.sha256===manifest_sha256&&m.target_count===targets.length)||previous_manifests.some(p=>!manifests.some(m=>m.sha256===p.sha256&&m.target_count===p.target_count)))throw Error('WEEKLY_HISTORY_SUPERSET_AND_PRIOR_MANIFESTS_REQUIRED');
 return{status:'SUPERSET_AND_PREVIOUS_HISTORY_DIGESTS_PRESERVED',target_count:targets.length,previous_count:previous_targets.length,manifest_sha256};
}
function exactState(a,b){return a.version_id===b.version_id&&a.deployment_id===b.deployment_id&&a.module_sha256===b.module_sha256&&a.settings_sha256===b.settings_sha256&&a.crons_sha256===b.crons_sha256;}
export async function coordinateWeeklyRollout({plan,adapter,guard,save=async()=>{},execute=false,clock=Date.now}={}){
 if(!plan||!/^[a-f0-9]{40}$/.test(plan.head||'')||plan.connected?.head!==plan.head||plan.connected?.status!=='EXACT_WEEKLY_CONNECTED_CHECK_SUCCESS'||!Number.isSafeInteger(plan.connected.run)||plan.scope?.status!=='SUPERSET_AND_PREVIOUS_HISTORY_DIGESTS_PRESERVED'||plan.workers?.length!==2||plan.workers.some((w,i)=>w.name!==WEEKLY_ROLLOUT_POLICY.workers[i]||!/^[a-f0-9]{64}$/.test(w.module_sha256||'')))throw Error('EXACT_CONNECTED_WEEKLY_ROLLOUT_PLAN_REQUIRED');
 const proof={schema:'HTX_COORDINATED_WEEKLY_ROLLOUT_V1',head:plan.head,expected_main:plan.expected_main,connected:plan.connected,scope:plan.scope,execute,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,history_discarded:false,source_clocks_refreshed:false,production_scope_changed:false,workers:[],rollback:[],started_ts:clock()};
 const persist=()=>save(structuredClone(proof));let collector,changed=[];
 try{
  await guard({min_headroom_ms:WEEKLY_ROLLOUT_POLICY.min_lease_headroom_ms});
  collector=await adapter.readCollector();if(collector.status!=='EXACT_CURRENT_UNIVERSE_NEUTRAL_COLLECTOR')throw Error('COLLECTOR_CURRENT_EXACT_READBACK_REQUIRED');proof.collector=collector;
  for(const worker of plan.workers){
   await guard();const before=await adapter.snapshot(worker);proof.workers.push({name:worker.name,before,expected_module_sha256:worker.module_sha256});
  }
  await persist();
  if(!execute){proof.status='EXACT_CONNECTED_PLAN_AND_ROLLBACK_ORIGINALS_QUALIFIED';await persist();return proof;}
  // Upload both immutable versions without sending live traffic to either.
  for(let i=0;i<plan.workers.length;i++){
   await guard();adapter.requireHeadroom(WEEKLY_ROLLOUT_POLICY.rollback_HTTP_reserved+10);
   const w=plan.workers[i],row=proof.workers[i];
   if(!exactState(row.before,await adapter.snapshot(w)))throw Error('WORKER_MOVED_BEFORE_STAGE');
   row.staged=await adapter.stage(w,row.before);if(!UUID.test(row.staged?.version_id||''))throw Error('STAGED_VERSION_ACK_REQUIRED');await persist();
  }
  for(let i=0;i<plan.workers.length;i++){
   await guard();adapter.requireHeadroom(WEEKLY_ROLLOUT_POLICY.rollback_HTTP_reserved+6);
   const w=plan.workers[i],row=proof.workers[i];
   if(!exactState(row.before,await adapter.snapshot(w)))throw Error('WORKER_MOVED_BEFORE_ACTIVATION');
   row.activation_intent={version_id:row.staged.version_id,ts:clock()};changed.push(i);await persist();
   // Persist intent before transport: an ambiguous response is read back and
   // may be rolled back only if our exact uploaded version is now active.
   await adapter.activate(w,row.staged.version_id);
   row.after=await adapter.snapshot(w);
   if(row.after.version_id!==row.staged.version_id||row.after.module_sha256!==w.module_sha256||row.after.settings_sha256!==row.before.settings_sha256||row.after.crons_sha256!==row.before.crons_sha256)throw Error('EXACT_HISTORY_ACTIVATION_READBACK_REQUIRED');
   await persist();
  }
  await guard();const afterCollector=await adapter.readCollector();
  if(!exactState(collector,afterCollector)||afterCollector.status!==collector.status)throw Error('COLLECTOR_CHANGED_DURING_WEEKLY_ROLLOUT');
  // Recheck the first history after the second; a successful intermediate
  // read is not proof of the final coordinated state.
  for(let i=0;i<plan.workers.length;i++)if(!exactState(proof.workers[i].after,await adapter.snapshot(plan.workers[i])))throw Error('HISTORY_MOVED_AFTER_ACTIVATION');
  await guard();proof.status='ALL_CONNECTED_WORKERS_EXACT_NODE_SCOPE_MERGE_READY';proof.production_activation_allowed=true;proof.completed_ts=clock();await persist();return proof;
 }catch(error){
  proof.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:'WEEKLY_ROLLOUT_ERROR';
  for(const i of changed.reverse()){
   const w=plan.workers[i],row=proof.workers[i];
   try{
    await guard();const current=await adapter.snapshot(w);
    if(exactState(current,row.before)){proof.rollback.push({name:w.name,status:'ORIGINAL_STILL_ACTIVE'});continue;}
    if(current.version_id!==row.staged.version_id||current.settings_sha256!==row.before.settings_sha256||current.crons_sha256!==row.before.crons_sha256)throw Error('FOREIGN_WORKER_STATE_NOT_OVERWRITTEN');
    await adapter.activate(w,row.before.version_id);const restored=await adapter.snapshot(w);
    if(restored.version_id!==row.before.version_id||restored.module_sha256!==row.before.module_sha256||restored.settings_sha256!==row.before.settings_sha256||restored.crons_sha256!==row.before.crons_sha256)throw Error('ROLLBACK_EXACT_READBACK_REQUIRED');
    proof.rollback.push({name:w.name,status:'ORIGINAL_VERSION_AND_SETTINGS_RESTORED',version_id:restored.version_id});
   }catch(e){proof.rollback.push({name:w.name,status:'ROLLBACK_NOT_ACKNOWLEDGED',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'ROLLBACK_ERROR'});}
   await persist();
  }
  proof.status=proof.rollback.some(r=>r.status==='ROLLBACK_NOT_ACKNOWLEDGED')?'WEEKLY_PARTIAL_STATE_REQUIRES_EXACT_RESUME':'WEEKLY_NOT_ACTIVATED_OR_OWN_ACTIVATIONS_ROLLED_BACK';proof.production_activation_allowed=false;proof.completed_ts=clock();await persist();error.rollout_receipt=proof;throw error;
 }
}
