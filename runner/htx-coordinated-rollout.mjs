// Coordinated weekly activation is deliberately separate from catalog approval.
// A superset may be staged in history before Node adopts it. No source call,
// cron change, schema change or loss of a previous history digest is allowed.
import {createHash} from 'node:crypto';
import {PRIVATE_CANONICAL_DATABASES} from './private-canonical-history.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])])):v;
export const rolloutDigest=v=>digest(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(stable(v)));
export const WEEKLY_ROLLOUT_POLICY=Object.freeze({account:'70ee0af85191ea470e74c7383fdec772',wrangler:'4.151.0',http:{whole_job:164,hot:96,background:56,statistics:12},manual_HTTP_reserved:24,max_control_HTTP:58,max_cloudflare_HTTP:82,rollback_HTTP_reserved:16,min_lease_headroom_ms:600000,collector:'my-report-2-hub',workers:['my-report-2-free-history','my-report-2-liq-forecast-history']});
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
export function singleActiveVersion(result){
 const d=result?.deployments?.[0];
 if(!UUID.test(d?.id||'')||d.strategy!=='percentage'||d.versions?.length!==1||d.versions[0]?.percentage!==100||!UUID.test(d.versions[0]?.version_id||''))throw Error('EXACT_SINGLE_ACTIVE_WORKER_VERSION_REQUIRED');
 return{deployment_id:d.id,version_id:d.versions[0].version_id};
}
export function workerSettingsFingerprint(settings,runtime){
 if(!Array.isArray(settings?.bindings))throw Error('EXACT_WORKER_BINDINGS_REQUIRED');
 // Include values in the private fingerprint, never in an exported proof.
 const bindings=[...settings.bindings].map(b=>stable(b)).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
 // The settings endpoint may expand default runtime fields after an upload.
 // Compare their effective values from the selected immutable version, while
 // retaining every other settings field and every binding in the fingerprint.
 const effective=runtime?{compatibility_date:runtime.compatibility_date?.slice(0,10),compatibility_flags:runtime.compatibility_flags||[],usage_model:runtime.usage_model,limits:runtime.limits||{}}:{};
 return rolloutDigest({...settings,...effective,bindings});
}
export function selectedVersionSettings(settings,version){
 if(!UUID.test(version?.id||'')||!Array.isArray(version.resources?.bindings)||!version.resources?.script_runtime)throw Error('EXACT_SELECTED_VERSION_SETTINGS_REQUIRED');
 const {bindings,compatibility_date,compatibility_flags,usage_model,limits,annotations,...nonVersioned}=settings,r=version.resources.script_runtime;
 // /settings and /content/v2 describe the latest upload, which may be dormant.
 // Version annotations are provenance, not operational settings. Every other
 // non-versioned field is retained, including unknown future fields.
 return{...nonVersioned,bindings:version.resources.bindings,compatibility_date:r.compatibility_date?.slice(0,10),compatibility_flags:r.compatibility_flags||[],usage_model:r.usage_model,limits:r.limits||{}};
}
export function bindWorkerModule({active_version,latest_uploaded_version,live_sha256,retained}={}){
 if(!UUID.test(active_version||''))throw Error('EXACT_ACTIVE_MODULE_ID_REQUIRED');
 if(active_version===latest_uploaded_version&&/^[a-f0-9]{64}$/.test(live_sha256||''))return{module_sha256:live_sha256,module_readback_basis:'ACTIVE_EQUALS_LATEST_UPLOAD_EXACT_BYTES'};
 if(retained?.version_id===active_version&&/^[a-f0-9]{64}$/.test(retained.module_sha256||''))return{module_sha256:retained.module_sha256,module_readback_basis:'EXACT_IMMUTABLE_VERSION_PRIOR_NATIVE_DIGEST'};
 throw Error('LATEST_UPLOAD_IS_NOT_ACTIVE_MODULE_PROOF');
}
export function runtimeSettingsSerializationHashes(settings,runtime){
 const defaults={compatibility_date:runtime?.compatibility_date?.slice(0,10),compatibility_flags:runtime?.compatibility_flags||[],usage_model:runtime?.usage_model,limits:runtime?.limits||{}};let variants=[settings];
 for(const [key,value] of Object.entries(defaults))if(value!==undefined&&Object.hasOwn(settings,key)&&rolloutDigest(settings[key])===rolloutDigest(value))variants=[...variants,...variants.map(v=>{const next={...v};delete next[key];return next;})];
 // Only serialization of fields equal to the immutable active runtime varies.
 // Bindings, variables, secrets, placement and other settings never vary.
 return[...new Set(variants.map(v=>workerSettingsFingerprint(v)))];
}
export function resumeOwnUnactivatedCollector({prior,current,expected_module_sha256,latest_uploaded_version,staged_operational_settings_sha256}={}){
 const w=prior?.workers?.[0];
 if(prior?.schema!=='CURRENT_PUBLIC_COLLECTOR_MODULE_REPAIR_V1'||prior.status!=='WEEKLY_NOT_ACTIVATED_OR_OWN_ACTIVATIONS_ROLLED_BACK'||prior.reason!=='WORKER_MOVED_BEFORE_ACTIVATION'||prior.sourceHTTP!==0||prior.D1!==0||prior.MAIN!==0||prior.Telegram!==0||prior.production_scope_changed!==false||prior.workers?.length!==1||w.name!==WEEKLY_ROLLOUT_POLICY.collector||w.activation_intent||w.staged?.activated!==false||!UUID.test(w.staged.version_id||'')||w.staged.version_id!==latest_uploaded_version||w.before?.version_id!==current.version_id||w.before?.deployment_id!==current.deployment_id||w.before?.module_sha256!==current.module_sha256||w.before?.crons_sha256!==current.crons_sha256||JSON.stringify(w.before?.binding_names)!==JSON.stringify(current.binding_names)||!(current.runtime_serialization_hashes?.includes(w.before?.settings_sha256)||staged_operational_settings_sha256===current.settings_sha256&&/^[a-f0-9]{64}$/.test(staged_operational_settings_sha256||''))||w.expected_module_sha256!==expected_module_sha256||prior.scope?.patched_module_sha256!==expected_module_sha256)throw Error('EXACT_OWN_UNACTIVATED_COLLECTOR_RECEIPT_REQUIRED');
 return{version_id:w.staged.version_id,activated:false,reused_exact_unactivated_version:true,original_head:prior.head};
}
export function historyVersionMetadata({settings,runtime,config,main_module,head}={}){
 if(!/^[a-f0-9]{40}$/.test(head||'')||!/^[-a-zA-Z0-9_.]+\.js$/.test(main_module||'')||settings?.compatibility_date!==config?.compatibility_date)throw Error('EXACT_HISTORY_BUILD_METADATA_REQUIRED');
 const actual=settings.bindings,configured=config.d1_databases;
 // Existing deployments may have the separately qualified archive pool. A
 // weekly universe rollout preserves these exact bindings, and cannot invent
 // one, substitute another DB, or drop a still-readable archive location.
 const optional=configured?.some(b=>b.binding==='CANONICAL_ARCHIVE_DB'&&b.database_id===PRIVATE_CANONICAL_DATABASES.LEGACY.uuid)?Object.entries(PRIVATE_CANONICAL_DATABASES).filter(([slot])=>slot!=='LEGACY').map(([,d])=>({binding:d.binding,database_id:d.uuid})):[];
 const expected=Array.isArray(configured)?[...configured,...optional.filter(e=>actual?.some(b=>b.name===e.binding)&&!configured.some(b=>b.binding===e.binding))]:configured;
 // Unexpected bindings require a separately reviewed adapter, not a deployment
 // which silently drops a variable or inherits from another uploaded version.
 if(!Array.isArray(actual)||!Array.isArray(expected)||actual.length!==expected.length||actual.some(b=>b.type!=='d1'||expected.filter(e=>e.binding===b.name&&e.database_id===(b.id??b.database_id)).length!==1)||new Set(actual.map(b=>b.name)).size!==actual.length)throw Error('EXACT_HISTORY_D1_BINDINGS_REQUIRED');
 if(!['standard','bundled'].includes(runtime?.usage_model)||runtime.compatibility_date?.slice(0,10)!==settings.compatibility_date||JSON.stringify([...(runtime.compatibility_flags||[])].sort())!==JSON.stringify([...(settings.compatibility_flags||[])].sort()))throw Error('EXACT_EXISTING_HISTORY_RUNTIME_REQUIRED');
 if(runtime.migration_tag||runtime.exports&&Object.values(runtime.exports).some(e=>e?.storage||e?.container))throw Error('STATEFUL_HISTORY_MIGRATION_NOT_ALLOWED');
 return{main_module,compatibility_date:settings.compatibility_date,compatibility_flags:settings.compatibility_flags||[],usage_model:runtime.usage_model,...(runtime.limits?{limits:runtime.limits}:{}),bindings:actual.map(b=>({name:b.name,type:'d1',id:b.id??b.database_id})),keep_bindings:[],annotations:{'workers/commit_sha':head,'workers/message':'Exact weekly HTX scope; preserve previous history readers'}};
}
export function collectorVersionMetadata({settings,runtime,head,active_version,latest_uploaded_version}={}){
 if(!UUID.test(active_version||'')||active_version!==latest_uploaded_version)throw Error('COLLECTOR_INHERIT_REQUIRES_LATEST_UPLOADED_ACTIVE_VERSION');
 const d1=settings?.bindings?.filter(b=>b.type==='d1'),config={compatibility_date:settings?.compatibility_date,d1_databases:[{binding:'DATA_DB',database_id:'057a2847-2cc4-4e52-8534-1be1596d21d5'},{binding:'CANONICAL_ARCHIVE_DB',database_id:'f66e7081-0e67-49a2-8f69-68af00cdaf92'}]};
 const metadata=historyVersionMetadata({settings:{...settings,bindings:d1},runtime,config,main_module:'worker.js',head});
 const names=new Set();for(const b of settings.bindings){if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(b.name||'')||!b.type||names.has(b.name))throw Error('COLLECTOR_EXACT_BINDING_NAMES_REQUIRED');names.add(b.name);}
 // Inherit every non-D1 binding by exact name from the just-verified active
 // latest version. No secret or variable value is exported or re-entered.
 metadata.bindings=settings.bindings.map(b=>b.type==='d1'?{name:b.name,type:'d1',id:b.id??b.database_id}:{name:b.name,type:'inherit'});
 return metadata;
}
export async function readSingleWorkerModule(response){
 if(response.headers.get('content-type')?.includes('multipart/')){
  const form=await response.formData(),files=[...form.values()].filter(v=>typeof v!=='string'&&/\.(?:m?js)$/.test(v.name));
  if(files.length!==1)throw Error('EXACT_SINGLE_BUNDLED_WORKER_MODULE_REQUIRED');
  let source_maps=0;
  for(const [field,v] of form){
   if(typeof v==='string'||v===files[0]||v.name==='metadata')continue;
   // Native layout38788123301 contains exactly the JS entry and its matching
   // non-executable Source Map. Debug metadata is not another runtime module.
   if(field!==files[0].name+'.map'||v.name!==field||v.type!=='application/source-map'||v.size>2000000||++source_maps!==1)throw Error('EXACT_SINGLE_BUNDLED_WORKER_MODULE_REQUIRED');
   let map;try{map=JSON.parse(await v.text());}catch{throw Error('EXACT_NONEXECUTABLE_SOURCE_MAP_REQUIRED');}
   if(map?.version!==3||!Array.isArray(map.sources)||map.sources.some(s=>typeof s!=='string')||typeof map.mappings!=='string'||map.file!==undefined&&map.file!==files[0].name)throw Error('EXACT_NONEXECUTABLE_SOURCE_MAP_REQUIRED');
  }
  return Buffer.from(await files[0].arrayBuffer());
 }
 return Buffer.from(await response.arrayBuffer());
}
export function verifySupersetHistory({previous_targets,targets,previous_manifests,manifests,manifest_sha256}={}){
 if(!Array.isArray(previous_targets)||!previous_targets.length||!Array.isArray(targets)||new Set(targets).size!==targets.length||previous_targets.some(c=>!targets.includes(c))||!Array.isArray(previous_manifests)||!Array.isArray(manifests)||!manifests.some(m=>m.sha256===manifest_sha256&&m.target_count===targets.length)||previous_manifests.some(p=>!manifests.some(m=>m.sha256===p.sha256&&m.target_count===p.target_count)))throw Error('WEEKLY_HISTORY_SUPERSET_AND_PRIOR_MANIFESTS_REQUIRED');
 return{status:'SUPERSET_AND_PREVIOUS_HISTORY_DIGESTS_PRESERVED',target_count:targets.length,previous_count:previous_targets.length,manifest_sha256};
}
function exactState(a,b){return a.version_id===b.version_id&&a.deployment_id===b.deployment_id&&a.module_sha256===b.module_sha256&&a.settings_sha256===b.settings_sha256&&a.crons_sha256===b.crons_sha256;}
export async function coordinateWeeklyRollout({plan,adapter,guard,save=async()=>{},execute=false,clock=Date.now}={}){
 const collectorPatch=plan?.kind==='collector_patch',names=collectorPatch?[WEEKLY_ROLLOUT_POLICY.collector]:WEEKLY_ROLLOUT_POLICY.workers;
 if(!plan||plan.kind&&!collectorPatch||!/^[a-f0-9]{40}$/.test(plan.head||'')||plan.connected?.head!==plan.head||plan.connected?.status!==(collectorPatch?'EXACT_MAIN_CURRENT_COLLECTOR_SOURCE_QUALIFIED':'EXACT_WEEKLY_CONNECTED_CHECK_SUCCESS')||!Number.isSafeInteger(plan.connected.run)||plan.scope?.status!==(collectorPatch?'EXACT_HUB_PREFIX_PRESERVED_CURRENT_TAIL_PATCH':'SUPERSET_AND_PREVIOUS_HISTORY_DIGESTS_PRESERVED')||plan.workers?.length!==names.length||plan.workers.some((w,i)=>w.name!==names[i]||!/^[a-f0-9]{64}$/.test(w.module_sha256||'')))throw Error('EXACT_CONNECTED_WEEKLY_ROLLOUT_PLAN_REQUIRED');
 const proof={schema:collectorPatch?'CURRENT_PUBLIC_COLLECTOR_MODULE_REPAIR_V1':'HTX_COORDINATED_WEEKLY_ROLLOUT_V1',head:plan.head,expected_main:plan.expected_main,connected:plan.connected,scope:plan.scope,execute,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,history_discarded:false,source_clocks_refreshed:false,production_scope_changed:false,workers:[],rollback:[],started_ts:clock()};
 const persist=()=>save(structuredClone(proof));let collector,changed=[];
 try{
  await guard({min_headroom_ms:WEEKLY_ROLLOUT_POLICY.min_lease_headroom_ms});
  if(!collectorPatch){collector=await adapter.readCollector();if(collector.status!=='EXACT_CURRENT_UNIVERSE_NEUTRAL_COLLECTOR')throw Error('COLLECTOR_CURRENT_EXACT_READBACK_REQUIRED');proof.collector=collector;}
  for(const worker of plan.workers){
   await guard();const before=await adapter.snapshot(worker);if(worker.required_before&&!exactState(worker.required_before,before))throw Error('WORKER_MOVED_AFTER_PATCH_PREPARATION');proof.workers.push({name:worker.name,before,expected_module_sha256:worker.module_sha256});
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
   const observed=await adapter.snapshot(w);if(!exactState(row.before,observed)){row.pre_activation_observed=observed;throw Error('WORKER_MOVED_BEFORE_ACTIVATION');}
   row.activation_intent={version_id:row.staged.version_id,ts:clock()};changed.push(i);await persist();
   // Persist intent before transport: an ambiguous response is read back and
   // may be rolled back only if our exact uploaded version is now active.
   await adapter.activate(w,row.staged.version_id);
   row.after=await adapter.snapshot(w);
   if(row.after.version_id!==row.staged.version_id||row.after.module_sha256!==w.module_sha256||row.after.settings_sha256!==row.before.settings_sha256||row.after.crons_sha256!==row.before.crons_sha256)throw Error('EXACT_HISTORY_ACTIVATION_READBACK_REQUIRED');
   await persist();
  }
  await guard();
  if(!collectorPatch){const afterCollector=await adapter.readCollector();if(!exactState(collector,afterCollector)||afterCollector.status!==collector.status)throw Error('COLLECTOR_CHANGED_DURING_WEEKLY_ROLLOUT');}
  // Recheck the first history after the second; a successful intermediate
  // read is not proof of the final coordinated state.
  for(let i=0;i<plan.workers.length;i++)if(!exactState(proof.workers[i].after,await adapter.snapshot(plan.workers[i])))throw Error('HISTORY_MOVED_AFTER_ACTIVATION');
  await guard();proof.status=collectorPatch?'CURRENT_COLLECTOR_EXACT_MODULE_AND_BINDINGS_REPAIRED':'ALL_CONNECTED_WORKERS_EXACT_NODE_SCOPE_MERGE_READY';proof.production_activation_allowed=true;proof.completed_ts=clock();await persist();return proof;
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
