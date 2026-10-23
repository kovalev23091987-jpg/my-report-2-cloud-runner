// GET-only version observations for one explicit native maintenance run.
// These bind counter code to the retained release; they do not prove a native
// reply, absence of transient deployment changes, or whole-day billing.
import {singleActiveVersion,selectedVersionSettings,workerSettingsFingerprint,rolloutDigest} from './htx-coordinated-rollout.mjs';
import {exactConfiguredSQLBridgeURL,SQL_BRIDGE_SCRIPT} from './installed-bridge-module-inspection.mjs';
export const RETENTION_SQL_BRIDGE_PROOF=Object.freeze({
 path:'checkpoints/free-storage-20261016/sql-bridge-counter-release-38934007309.json',
 sha256:'09e4349fc13140e2bc8059f7698ad3306dcd5ce3bcef66f561486019d021e651',
 run:'38934007309',head:'6312144055c64cba9fed3516d84c92390859635b',
 version_id:'7011c257-4bdc-4244-a858-42c30e8532ab',
 module_sha256:'06603b69686f7f14b62d1ab551af18555d4f506c4edd7cb7cee3ca58a1e904bf',
 settings_sha256:'05120adabd88e1efd64749dafe2b4749a971068ad740f86e816084d1198a6ded',
 crons_sha256:'4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
 immutable_script_etag:'faf47729620694c0e12f5c439fd5f22a15d42dbee42bc66625ff9c7e57ad8836'
});
export function parseRetentionSQLBridgeProof(raw){
 const p=RETENTION_SQL_BRIDGE_PROOF;if(rolloutDigest(raw)!==p.sha256)throw Error('EXACT_RETENTION_SQL_BRIDGE_RELEASE_BYTES_REQUIRED');
 const j=JSON.parse(raw),w=j.workers?.[0];
 if(j.schema!=='CURRENT_SQL_BRIDGE_COUNTER_REPAIR_RELEASE_V1'||j.status!=='CURRENT_SQL_BRIDGE_COUNTER_REPAIR_EXACTLY_INSTALLED'||j.head!==p.head||j.workers?.length!==1||w.name!==SQL_BRIDGE_SCRIPT||j.rollback?.length!==0||j.scope?.configured_bridge_matches_account_script!==true||j.scope?.configured_url_exported!==false||j.scope?.patched_module_sha256!==p.module_sha256||w.staged?.version_id!==p.version_id||w.expected_module_sha256!==p.module_sha256||['sourceHTTP','D1','SQL','MAIN','Telegram','Worker_invocations'].some(k=>j[k]!==0)||['version_id','module_sha256','settings_sha256','crons_sha256','immutable_script_etag'].some(k=>w.after?.[k]!==p[k]))throw Error('EXACT_RETENTION_SQL_BRIDGE_RELEASE_REQUIRED');
 return p;
}
export async function verifyRetentionSQLBridge({proof,...args}={}){
 if(proof!==RETENTION_SQL_BRIDGE_PROOF)throw Error('EXACT_RETENTION_BRIDGE_PROVENANCE_REQUIRED');
 return observeRetentionSQLBridge({...args,expected:proof});
}
// Pure observation comparator also accepts synthetic metadata expectations for
// controlled tests. The production entry above only accepts the parsed pin.
export async function observeRetentionSQLBridge({expected:proof,call,configured_bridge_url,stage,clock=Date.now}={}){
 if(!proof||['module_sha256','settings_sha256','crons_sha256','immutable_script_etag','sha256'].some(k=>!/^[a-f0-9]{64}$/.test(proof[k]||''))||typeof call!=='function'||!['before_SQL','after_SQL'].includes(stage))throw Error('EXACT_RETENTION_BRIDGE_PROVENANCE_REQUIRED');
 const started_ts=clock();
 if(stage==='before_SQL'){
  const subdomain=await call(SQL_BRIDGE_SCRIPT,'/subdomain');
  exactConfiguredSQLBridgeURL(configured_bridge_url,subdomain?.subdomain);
 }
 const [d,s,c]=await Promise.all([call(SQL_BRIDGE_SCRIPT,'/deployments'),call(SQL_BRIDGE_SCRIPT,'/settings'),call(SQL_BRIDGE_SCRIPT,'/schedules')]);
 const active=singleActiveVersion(d);if(active.version_id!==proof.version_id)throw Error('RETENTION_SQL_BRIDGE_VERSION_CHANGED');
 const v=await call(SQL_BRIDGE_SCRIPT,'/versions/'+active.version_id),effective=selectedVersionSettings(s,v);
 const schedules=Array.isArray(c)?c:c?.schedules;
 if(!Array.isArray(schedules)||v.id!==proof.version_id||v.resources?.script?.etag!==proof.immutable_script_etag||workerSettingsFingerprint(effective)!==proof.settings_sha256||rolloutDigest(schedules.map(r=>r.cron).sort())!==proof.crons_sha256)throw Error('RETENTION_SQL_BRIDGE_BINDINGS_OR_MODULE_CHANGED');
 const completed_ts=clock();if(!Number.isSafeInteger(started_ts)||!Number.isSafeInteger(completed_ts)||started_ts>completed_ts)throw Error('RETENTION_BRIDGE_OBSERVATION_CLOCK_REQUIRED');
 return{status:'EXACT_RETAINED_SQL_BRIDGE_VERSION_OBSERVED',stage,started_ts,completed_ts,name:SQL_BRIDGE_SCRIPT,version_id:proof.version_id,module_sha256:proof.module_sha256,settings_sha256:proof.settings_sha256,crons_sha256:proof.crons_sha256,immutable_script_etag:proof.immutable_script_etag,release_run:proof.run,release_raw_sha256:proof.sha256,module_basis:'SAME_IMMUTABLE_VERSION_AND_ETAG_AS_PRIOR_EXACT_NATIVE_MODULE',Cloudflare_GET:stage==='before_SQL'?5:4,SQL:0,configured_url_exported:false,secret_values_exported:false,transient_changes_excluded:false,native_reply_accepted:false,whole_day_closed:false};
}
// Final bridge metadata and cursor/release remain reserved before each write.
// Three GitHub guard requests per mutation, exactly as in the existing tool.
export function retentionMutationControlPlan({used,borrowed,bridge_postflight_pending=false,future_archive_controls=0,admitted_batch_bound=6}={}){
 if(!Number.isSafeInteger(used)||used<0||used>40||typeof borrowed!=='boolean'||typeof bridge_postflight_pending!=='boolean'||![0,6].includes(future_archive_controls)||!Number.isSafeInteger(admitted_batch_bound)||admitted_batch_bound<0||admitted_batch_bound>6)throw Error('EXACT_RETENTION_CONTROL_USAGE_REQUIRED');
 const postflight=bridge_postflight_pending?4:0,cleanup=borrowed?5:10,reserved=cleanup+postflight+future_archive_controls;
 return{max_control_HTTP:40,postflight_HTTP:postflight,cursor_and_release_HTTP:cleanup,future_archive_controls_HTTP:future_archive_controls,reserved_HTTP:reserved,admitted_batch_bound,max_mutation_batches:Math.min(admitted_batch_bound,Math.max(0,Math.floor((40-used-reserved)/3)))};
}
export function requireRetentionControlReserve(options,minimum_mutation_batches=1){
 if(!Number.isInteger(minimum_mutation_batches)||minimum_mutation_batches<0||minimum_mutation_batches>6)throw Error('EXACT_RETENTION_MINIMUM_GUARD_RESERVE_REQUIRED');
 const plan=retentionMutationControlPlan(options);
 if(plan.max_mutation_batches<minimum_mutation_batches||options.used+plan.reserved_HTTP+3*minimum_mutation_batches>40)throw Error('RETENTION_REMAINING_CONTROL_RESERVE_REQUIRED');
 return plan;
}

// Two exact code-active identities. No logging-state policy or caller expected override.
const PAID_BRIDGE_SETTINGS_SHA256='05120adabd88e1efd64749dafe2b4749a971068ad740f86e816084d1198a6ded';
const PAID_BRIDGE_RUNTIME_SHA256='cf3bca9e631f2fa26b3bb242b9784c8ea557bf8ed64d00fdc87bf6c9d64b144a';
const PAID_BRIDGE_NAMES=Object.freeze(['DATA_DB','REPORT2_CLOUD_BRIDGE_TOKEN','REPORT2_DENO_BRIDGE_TOKEN']);
export const CORRELATED_RETENTION_SQL_BRIDGE_PROOF=Object.freeze({
 path:'checkpoints/report-producer-and-bridge-stage-connected-20261022/native-stage-receipt.json',
 sha256:'f010dc6368027ecc789d85d53609c96018fb7da961e9fad4a9e91e69996ac4a7',
 run:39810975433,head:'7fc1de9b64646c87f9dac5e9e5a65a40476e603f',
 version_id:'86f1bdc5-c7d7-4bbd-917b-cf60babc5a3e',module_sha256:'c327b49eb1ebb6a48ac86e1a99d55a3d861f6bc5a2c76dfd0c0d90be88026063',
 settings_sha256:PAID_BRIDGE_SETTINGS_SHA256,crons_sha256:RETENTION_SQL_BRIDGE_PROOF.crons_sha256,
 immutable_script_etag:'ac9d474832fa5a166a92032b19f42ee85bd4fb91b5066fd75da1877a8f051e29',
 runtime_sha256:PAID_BRIDGE_RUNTIME_SHA256,
 inner_proof_sha256:'85e815381e4ec8d2219928768d670b02c0c5f1e87332c89fdb6f93f8c20d2f22',inner_proof_bytes:6594,
 artifact_id:12440596410,artifact_digest:'sha256:afc58f96b07f5b272d8833307c467e4185b1ff09bd72a49f71613ece41fdd25f'
});
export function parseCorrelatedRetentionSQLBridgeProof(raw){
 const p=CORRELATED_RETENTION_SQL_BRIDGE_PROOF,o=RETENTION_SQL_BRIDGE_PROOF;
 if(rolloutDigest(raw)!==p.sha256)throw Error('EXACT_NATIVE_STAGE_SUMMARY_BYTES_REQUIRED');
 const j=JSON.parse(raw),oldKeys=['version_id','module_sha256','settings_sha256','crons_sha256','immutable_script_etag'];
 if(j.schema!=='ACTUAL_NATIVE_BRIDGE_STAGE_ONLY_RECEIPT_V1'||j.run!==p.run||j.head!==p.head||j.conclusion!=='success'||j.status!=='STAGED_OWN_VERSION_VERIFIED_ACTIVE_UNCHANGED'||j.reason!==null||j.known_upload_ack!==true||j.ownership_verified!==true||j.active_preservation_verified!==true||j.actual_upload_HTTP_attempts!==1||j.artifact?.id!==p.artifact_id||j.artifact.digest!==p.artifact_digest||j.artifact.members!==1||j.artifact.whole_ZIP_verified!==true||j.proof?.sha256!==p.inner_proof_sha256||j.proof.bytes!==p.inner_proof_bytes||oldKeys.some(k=>j.before?.[k]!==o[k]||j.after?.[k]!==o[k])||j.before?.deployment_id!==j.after?.deployment_id||j.before?.latest_uploaded_version!==o.version_id||j.after?.latest_uploaded_version!==p.version_id||['before','after','staged'].some(k=>j[k]?.runtime_sha256!==p.runtime_sha256||rolloutDigest(j[k]?.binding_names)!==rolloutDigest(PAID_BRIDGE_NAMES))||oldKeys.filter(k=>k!=='crons_sha256').some(k=>j.staged?.[k]!==p[k])||Object.hasOwn(j.staged,'crons_sha256')||j.staged?.module_readback_basis!=='EXACT_LATEST_UPLOAD_SOURCE_BYTES'||j.staged?.ownership_basis!=='KNOWN_UPLOAD_ACK_PLUS_EXACT_NATIVE_READBACK'||['native_SQL','Worker_invocations','sourceHTTP','MAIN','Telegram','activation_attempts','settings_mutations','delete_attempts'].some(k=>j[k]!==0)||j.old_unknown_recovered!==false||j.current_Telegram_restored!==false||j.source_body_or_secret_exported!==false)throw Error('EXACT_NATIVE_STAGE_OWNERSHIP_AND_OLD_PRESERVATION_REQUIRED');
 return p;
}
import {correlatedLogsIntent} from './htx-coordinated-rollout.mjs';
// ROOT must bind the actual known-PATCH-ACK accepted artifact before H is usable.
// NULL is intentionally fail-closed, never an unpinned default grant.
export const CORRELATED_RETENTION_LOGGING_PROOF=Object.freeze({
 path:'checkpoints/current86-correlated-logging-connected-20261023/paid-compatibility-logging-proof.json',
 sha256:null,run:null,head:null
});
export function createRetentionSQLBridgeCompatibility({old_release_bytes,staged_receipt_bytes,logging_receipt_bytes}={}){
 const old=parseRetentionSQLBridgeProof(old_release_bytes),next=parseCorrelatedRetentionSQLBridgeProof(staged_receipt_bytes);
 let logging=null;
 if(logging_receipt_bytes!==undefined){
  const p=CORRELATED_RETENTION_LOGGING_PROOF,raw=Buffer.isBuffer(logging_receipt_bytes)?logging_receipt_bytes:typeof logging_receipt_bytes==='string'?Buffer.from(logging_receipt_bytes):null;
  if(!raw||raw.length>65536||!/^[a-f0-9]{64}$/.test(p.sha256||'')||!/^\d+$/.test(String(p.run||''))||!/^[a-f0-9]{40}$/.test(p.head||'')||rolloutDigest(raw)!==p.sha256)throw Error('RETENTION_LOGGING_EXACT_ACCEPTED_PROOF_REQUIRED');
  const j=JSON.parse(raw.toString('utf8')),i=j.intent,b=j.before,a=j.after,hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
  if(j.schema!=='CURRENT86_LOGGING_ONLY_OPERATION_V1'||j.status!=='CURRENT86_LOGGING_KNOWN_ACK_AND_EXACT_READBACK'||String(j.run)!==String(p.run)||j.head!==p.head||j.known_patch_ACK!==true||j.logging_qualified!==true||j.intent_before_IO!==true||j.mutation_attempts!==1||['native_SQL','Worker_invocations','sourceHTTP','MAIN','Telegram'].some(k=>j[k]!==0)||j.old_unknown_recovered!==false||j.day_hold_removed!==false||!plain(i)||!plain(b)||!plain(a))throw Error('RETENTION_LOGGING_KNOWN_ACK_PROOF_REQUIRED');
  if(b.version_id!==next.version_id||a.version_id!==next.version_id||!/^([a-f0-9]{8}-){1}[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(b.deployment_id||'')||a.deployment_id!==b.deployment_id||b.settings_sha256!==PAID_BRIDGE_SETTINGS_SHA256||i.actual_before_settings_sha256!==PAID_BRIDGE_SETTINGS_SHA256||!hex(i.baseline_without_observability_sha256)||!hex(i.prospective_settings_sha256)||a.settings_sha256!==i.prospective_settings_sha256||b.settings_without_observability_sha256!==i.baseline_without_observability_sha256||a.settings_without_observability_sha256!==i.baseline_without_observability_sha256||typeof i.baseline_observability_present!=='boolean'||!Object.hasOwn(i,'baseline_observability')||!i.baseline_observability_present&&i.baseline_observability!==null||i.baseline_observability!==null&&!plain(i.baseline_observability)||!plain(i.desired_observability)||rolloutDigest(i.desired_observability)!==i.desired_digest)throw Error('RETENTION_LOGGING_EXACT_BASELINE_AND_INTENT_REQUIRED');
  for(const x of [b,a])if(x.module_sha256!==next.module_sha256||x.immutable_script_etag!==next.immutable_script_etag||x.runtime_sha256!==PAID_BRIDGE_RUNTIME_SHA256||x.crons_sha256!==next.crons_sha256||rolloutDigest(x.binding_names)!==rolloutDigest([...PAID_BRIDGE_NAMES].sort()))throw Error('RETENTION_LOGGING_SOURCE_IDENTITY_REQUIRED');
  logging=j;
 }
 let state='NEW',selected=null,selectedDeployment=null,selectedSettings=null;
 return Object.freeze({async observe({call,configured_bridge_url,stage,clock=Date.now}={}){
  if(typeof call!=='function'||typeof clock!=='function'||!['before_SQL','after_SQL'].includes(stage)||stage==='before_SQL'&&state!=='NEW'||stage==='after_SQL'&&state!=='READY')throw Error('RETENTION_COMPATIBILITY_EXACT_STAGE_SEQUENCE_REQUIRED');
  state=stage==='before_SQL'?'READING_BEFORE':'READING_AFTER';
  try{
   const started_ts=clock();if(!Number.isSafeInteger(started_ts)||started_ts<0)throw Error('RETENTION_COMPATIBILITY_CLOCK_REQUIRED');
   if(stage==='before_SQL'){const subdomain=await call(SQL_BRIDGE_SCRIPT,'/subdomain');exactConfiguredSQLBridgeURL(configured_bridge_url,subdomain?.subdomain);}
   const [d,s,c]=await Promise.all([call(SQL_BRIDGE_SCRIPT,'/deployments'),call(SQL_BRIDGE_SCRIPT,'/settings'),call(SQL_BRIDGE_SCRIPT,'/schedules')]);
   const active=singleActiveVersion(d);
   if(stage==='before_SQL'){
    selected=active.version_id===old.version_id?old:active.version_id===next.version_id?next:null;
    if(!selected)throw Error('RETENTION_COMPATIBILITY_FOREIGN_VERSION');selectedDeployment=active.deployment_id;
   }
   if(active.version_id!==selected.version_id||active.deployment_id!==selectedDeployment)throw Error('RETENTION_COMPATIBILITY_SELECTED_IDENTITY_CHANGED');
   const v=await call(SQL_BRIDGE_SCRIPT,'/versions/'+selected.version_id),effective=selectedVersionSettings(s,v),schedules=Array.isArray(c)?c:c?.schedules;
   const settingsHash=workerSettingsFingerprint(effective);
   if(settingsHash!==PAID_BRIDGE_SETTINGS_SHA256){
    if(!logging||selected.version_id!==next.version_id||selectedDeployment!==logging.before.deployment_id)throw Error('RETENTION_LOGGING_CURRENT86_PROOF_REQUIRED');
    const i=logging.intent,baseline={...effective};
    if(i.baseline_observability_present)baseline.observability=i.baseline_observability;else delete baseline.observability;
    const {observability,...nonObservability}=effective,desired=correlatedLogsIntent(baseline),H=workerSettingsFingerprint({...baseline,observability:desired});
    if(workerSettingsFingerprint(baseline)!==PAID_BRIDGE_SETTINGS_SHA256||rolloutDigest(nonObservability)!==i.baseline_without_observability_sha256||rolloutDigest(desired)!==i.desired_digest||rolloutDigest(observability)!==rolloutDigest(desired)||settingsHash!==H||H!==i.prospective_settings_sha256||H!==logging.after.settings_sha256)throw Error('RETENTION_LOGGING_EXACT_OBSERVABILITY_ONLY_REQUIRED');
   }
   if(stage==='before_SQL')selectedSettings=settingsHash;else if(settingsHash!==selectedSettings)throw Error('RETENTION_COMPATIBILITY_SELECTED_SETTINGS_CHANGED');
   if(!Array.isArray(schedules)||v.id!==selected.version_id||v.resources?.script?.etag!==selected.immutable_script_etag||rolloutDigest(v.resources?.script_runtime)!==PAID_BRIDGE_RUNTIME_SHA256||rolloutDigest(schedules.map(r=>r.cron).sort())!==selected.crons_sha256||rolloutDigest(effective.bindings.map(b=>b.name).sort())!==rolloutDigest(PAID_BRIDGE_NAMES))throw Error('RETENTION_COMPATIBILITY_EXACT_SETTINGS_RUNTIME_BINDING_REQUIRED');
   const completed_ts=clock();if(!Number.isSafeInteger(completed_ts)||completed_ts<started_ts)throw Error('RETENTION_COMPATIBILITY_CLOCK_REQUIRED');
   state=stage==='before_SQL'?'READY':'DONE';
   return Object.freeze({status:'EXACT_RETAINED_SQL_BRIDGE_VERSION_OBSERVED',stage,name:SQL_BRIDGE_SCRIPT,version_id:selected.version_id,deployment_id:selectedDeployment,module_sha256:selected.module_sha256,settings_sha256:settingsHash,crons_sha256:selected.crons_sha256,immutable_script_etag:selected.immutable_script_etag,runtime_sha256:PAID_BRIDGE_RUNTIME_SHA256,started_ts,completed_ts,Cloudflare_GET:stage==='before_SQL'?5:4,SQL:0,configured_url_exported:false,secret_values_exported:false,module_basis:'EXACT_ACCEPTED_IMMUTABLE_VERSION_AND_ETAG',same_selected_run_identity:true,compatibility_role:'CODE_ACTIVE_CURRENT_SETTINGS_ONLY',logging_settings_allowed:false,admission:false,transient_changes_excluded:false,native_reply_accepted:false,whole_day_closed:false});
  }catch(error){state='FAILED';throw error;}
 }});
}
const EXACT_COMPATIBLE_CONSUMERS=Object.freeze({
 'tools/run-paid-sliding-history-20261018.mjs':'a8ff9e5f91fcf14f45c66c843d4ecc9f7d06f16c439cf144f74951dda528840b',
 'tools/recover-lossless-retained-history-20261014.mjs':'4cace44d78bc0c6054bcc17d9de9697a2b959fe4880222facef35fc46a251684'
});
export async function attestRetentionSQLBridgeCompatibility({repo_root}={}){
 const filesystem=await import('node:fs/promises'),paths=await import('node:path');
 if(typeof repo_root!=='string'||!paths.isAbsolute(repo_root))throw Error('RETENTION_COMPATIBILITY_ACTUAL_REPO_REQUIRED');
 const root=await filesystem.realpath(repo_root),modulePath='runner/retention-bridge-provenance.mjs';
 const wanted=[modulePath,...Object.keys(EXACT_COMPATIBLE_CONSUMERS),RETENTION_SQL_BRIDGE_PROOF.path,CORRELATED_RETENTION_SQL_BRIDGE_PROOF.path],raw={};
 for(const p of wanted){const filename=paths.join(root,p),stat=await filesystem.lstat(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>131072)throw Error('RETENTION_COMPATIBILITY_BOUNDED_REAL_FILE_REQUIRED');const bytes=await filesystem.readFile(filename);if(bytes.length>131072)throw Error('RETENTION_COMPATIBILITY_BOUNDED_REAL_FILE_REQUIRED');raw[p]=bytes;}
 for(const [p,h]of Object.entries(EXACT_COMPATIBLE_CONSUMERS))if(rolloutDigest(raw[p])!==h)throw Error('RETENTION_COMPATIBILITY_ACTUAL_CONSUMER_MISMATCH');
 const old=parseRetentionSQLBridgeProof(raw[RETENTION_SQL_BRIDGE_PROOF.path]),next=parseCorrelatedRetentionSQLBridgeProof(raw[CORRELATED_RETENTION_SQL_BRIDGE_PROOF.path]);
 return Object.freeze({status:'EXACT_TWO_CONSUMERS_CODE_ACTIVE_COMPATIBILITY',compatibility_module_sha256:rolloutDigest(raw[modulePath]),consumer_sha256:EXACT_COMPATIBLE_CONSUMERS,old_identity:old,new_identity:next,stage_receipt_sha256:next.sha256,inner_stage_proof_sha256:next.inner_proof_sha256,Cloudflare_GET:0,SQL:0,logging_settings_allowed:false,admission:false});
}
