// Cloudflare's unversioned content/settings endpoints follow the latest upload.
// Traffic is bound by /deployments. Never attach a dormant upload's bytes or
// bindings to the active version merely because its deployment stayed still.
import {singleActiveVersion,selectedVersionSettings,bindWorkerModule,readSingleWorkerModule,workerSettingsFingerprint,rolloutDigest} from './htx-coordinated-rollout.mjs';
export function createVersionBoundWorkerReader({call}={}){
 const modules=new Map(),versions=new Map(),settingsByVersion=new Map();
 const key=(name,id)=>name+':'+id;
 const seed=(name,row)=>{const bound=bindWorkerModule({active_version:row.version_id,retained:row});modules.set(key(name,row.version_id),{...bound,version_id:row.version_id});};
 async function latestBytes(name,expected){
  const before=(await call(name,'/versions?per_page=1')).items?.[0]?.id;
  if(expected&&before!==expected)throw Error('EXACT_LATEST_UPLOAD_REQUIRED');
  const bytes=await readSingleWorkerModule(await call(name,'/content/v2',{raw:true}));
  if((await call(name,'/versions?per_page=1')).items?.[0]?.id!==before)throw Error('LATEST_UPLOAD_MOVED_DURING_CONTENT_READ');
  return{version_id:before,bytes,module_sha256:rolloutDigest(bytes)};
 }
 async function read(worker){
  const name=worker.name,[deployments,settings,schedules]=await Promise.all([call(name,'/deployments'),call(name,'/settings'),call(name,'/schedules')]),active=singleActiveVersion(deployments),k=key(name,active.version_id);
  const crons=(Array.isArray(schedules)?schedules:schedules.schedules)?.map(s=>s.cron).sort();
  if(JSON.stringify(crons)!==JSON.stringify([...worker.crons].sort()))throw Error('EXACT_WORKER_CRONS_REQUIRED');
  if(!versions.has(k)){const v=await call(name,'/versions/'+active.version_id);if(v.id!==active.version_id)throw Error('EXACT_SELECTED_VERSION_REQUIRED');versions.set(k,v);}
  const version=versions.get(k),effective=selectedVersionSettings(settings,version);settingsByVersion.set(k,effective);
  if(!modules.has(k)){
   const latest=await latestBytes(name,active.version_id),confirmed=singleActiveVersion(await call(name,'/deployments'));
   if(confirmed.deployment_id!==active.deployment_id||confirmed.version_id!==active.version_id)throw Error('ACTIVE_DEPLOYMENT_MOVED_DURING_MODULE_READ');
   modules.set(k,{...bindWorkerModule({active_version:active.version_id,latest_uploaded_version:latest.version_id,live_sha256:latest.module_sha256}),version_id:active.version_id,bytes:latest.bytes});
  }
  const m=modules.get(k);
  return{...active,module_sha256:m.module_sha256,module_readback_basis:m.module_readback_basis,settings_sha256:workerSettingsFingerprint(effective),crons_sha256:rolloutDigest(crons),binding_names:effective.bindings.map(b=>b.name).sort(),crons,settings_key_sha256:Object.fromEntries(Object.entries(effective).map(([k,v])=>[k,rolloutDigest(v)])),effective_runtime:version.resources.script_runtime,immutable_script_etag:version.resources.script?.etag??null};
 }
 return{read,seed,latestBytes,module:(name,id)=>modules.get(key(name,id)),settings:(name,id)=>settingsByVersion.get(key(name,id)),version:(name,id)=>versions.get(key(name,id))};
}
