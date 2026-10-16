import {singleActiveVersion,selectedVersionSettings,workerSettingsFingerprint,rolloutDigest} from './htx-coordinated-rollout.mjs';
export const DATED_RETENTION_QUALIFICATION=Object.freeze({day:'2026-10-16',not_before:Date.parse('2026-10-16T00:05:00Z'),expires:Date.parse('2026-10-16T00:25:00Z'),workflow:'Report2 one bounded native storage qualification',native_readers_run:'38797445363'});
export const CURRENT_ARCHIVE_READER_PROOF=Object.freeze({run:'38901929896',head:'e0f136f64a93cb241a0841477c247efc1c4001fa',path:'checkpoints/free-storage-20261016/counter-release-38901929896.json',sha256:'c65eedc0ead4d7ad64bcdd1958a44745a0788def3d438c5ef96cf316631b91c5'});
export function parseCurrentArchiveReaderProof(raw){
 const p=CURRENT_ARCHIVE_READER_PROOF;if(rolloutDigest(raw)!==p.sha256)throw Error('EXACT_CURRENT_READER_NATIVE_PROOF_HASH_REQUIRED');
 const proof=JSON.parse(raw);
 if(proof.cloud_run!==p.run||proof.head!==p.head||proof.status!=='BOTH_FREE_ARCHIVE_READERS_EXACT_MODULES_BINDINGS_AND_CRONS_VERIFIED'||proof.writer_enabled!==false||proof.automatic_rotation_enabled!==false||proof.manual_current_main_repair!==true||proof.workers?.length!==2||['sourceHTTP','D1','MAIN','Telegram','existing_rows_modified'].some(k=>proof[k]!==0))throw Error('EXACT_CURRENT_READER_NATIVE_PROOF_REQUIRED');
 for(const [i,name]of ['my-report-2-hub','my-report-2-liq-forecast-history'].entries()){
  const w=proof.workers[i];if(w.name!==name||w.after?.version_id!==w.staged?.version_id||w.after?.module_sha256!==w.expected_module_sha256||w.after?.settings_sha256!==w.before?.settings_sha256||w.after?.settings_sha256!==w.expected_settings_sha256||w.after?.crons_sha256!==w.before?.crons_sha256)throw Error('EXACT_UNCHANGED_CURRENT_READER_BINDINGS_REQUIRED');
 }return proof;
}
export function requireDatedRetentionQualification({day,event,workflow,kind,execute,prefetch,native_qualification,now=Date.now()}={}){
 const p=DATED_RETENTION_QUALIFICATION;
 if(day!==p.day||event!=='workflow_dispatch'||workflow!==p.workflow||kind!=='canonical'||execute!==true||prefetch!==true||native_qualification!==true||!Number.isSafeInteger(now)||now<p.not_before||now>=p.expires)throw Error('EXACT_DATED_NATIVE_RETENTION_QUALIFICATION_REQUIRED');
 return{authorized:true,day:p.day,one_existing_shared_slot:true,extra_slot_granted:false,automatic_rotation_enabled:false};
}
export async function verifyExactArchiveReaderBindings({proof,call,expected_reader_run=DATED_RETENTION_QUALIFICATION.native_readers_run}={}){
 if(![DATED_RETENTION_QUALIFICATION.native_readers_run,CURRENT_ARCHIVE_READER_PROOF.run].includes(expected_reader_run)||proof?.cloud_run!==expected_reader_run||proof.status!=='BOTH_FREE_ARCHIVE_READERS_EXACT_MODULES_BINDINGS_AND_CRONS_VERIFIED'||proof.writer_enabled!==false||proof.workers?.length!==2)throw Error('EXACT_NATIVE_ARCHIVE_READERS_PROOF_REQUIRED');
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
