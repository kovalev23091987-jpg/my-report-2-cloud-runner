import {singleActiveVersion,selectedVersionSettings,workerSettingsFingerprint,rolloutDigest} from './htx-coordinated-rollout.mjs';
export const DATED_RETENTION_QUALIFICATION=Object.freeze({day:'2026-10-16',not_before:Date.parse('2026-10-16T00:05:00Z'),expires:Date.parse('2026-10-16T00:25:00Z'),workflow:'Report2 one bounded native storage qualification',native_readers_run:'38797445363'});
export function requireDatedRetentionQualification({day,event,workflow,kind,execute,prefetch,native_qualification,now=Date.now()}={}){
 const p=DATED_RETENTION_QUALIFICATION;
 if(day!==p.day||event!=='workflow_dispatch'||workflow!==p.workflow||kind!=='canonical'||execute!==true||prefetch!==true||native_qualification!==true||!Number.isSafeInteger(now)||now<p.not_before||now>=p.expires)throw Error('EXACT_DATED_NATIVE_RETENTION_QUALIFICATION_REQUIRED');
 return{authorized:true,day:p.day,one_existing_shared_slot:true,extra_slot_granted:false,automatic_rotation_enabled:false};
}
export async function verifyExactArchiveReaderBindings({proof,call}={}){
 if(proof?.cloud_run!==DATED_RETENTION_QUALIFICATION.native_readers_run||proof.status!=='BOTH_FREE_ARCHIVE_READERS_EXACT_MODULES_BINDINGS_AND_CRONS_VERIFIED'||proof.writer_enabled!==false||proof.workers?.length!==2)throw Error('EXACT_NATIVE_ARCHIVE_READERS_PROOF_REQUIRED');
 const receipts=[];
 for(const [i,name] of ['my-report-2-hub','my-report-2-liq-forecast-history'].entries()){
  const p=proof.workers[i];if(p.name!==name||!p.after)throw Error('EXACT_NATIVE_ARCHIVE_READERS_PROOF_REQUIRED');
  const [d,s,crons]=await Promise.all([call(name,'/deployments'),call(name,'/settings'),call(name,'/schedules')]),active=singleActiveVersion(d);
  if(active.version_id!==p.after.version_id)throw Error('ARCHIVE_READER_VERSION_CHANGED_BEFORE_RETENTION');
  const v=await call(name,'/versions/'+active.version_id),effective=selectedVersionSettings(s,v),clock=(Array.isArray(crons)?crons:crons.schedules).map(r=>r.cron).sort();
  if(v.id!==active.version_id||workerSettingsFingerprint(effective)!==p.after.settings_sha256||rolloutDigest(clock)!==p.after.crons_sha256)throw Error('EXACT_CURRENT_ARCHIVE_READER_BINDINGS_REQUIRED');
  receipts.push({name,version_id:active.version_id,settings_sha256:p.after.settings_sha256,crons_sha256:p.after.crons_sha256,module_bound_by_same_immutable_version:true});
 }
 return{status:'EXACT_NATIVE_ARCHIVE_READER_BINDINGS_STILL_INSTALLED',workers:receipts,Cloudflare_GET:8,SQL:0,secret_values_exported:false};
}
