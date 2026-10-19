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
export function retentionMutationControlPlan({used,borrowed,bridge_postflight_pending=false,future_archive_controls=0}={}){
 if(!Number.isSafeInteger(used)||used<0||used>40||typeof borrowed!=='boolean'||typeof bridge_postflight_pending!=='boolean'||![0,6].includes(future_archive_controls))throw Error('EXACT_RETENTION_CONTROL_USAGE_REQUIRED');
 const postflight=bridge_postflight_pending?4:0,cleanup=borrowed?5:10,reserved=cleanup+postflight+future_archive_controls;
 return{max_control_HTTP:40,postflight_HTTP:postflight,cursor_and_release_HTTP:cleanup,future_archive_controls_HTTP:future_archive_controls,reserved_HTTP:reserved,max_mutation_batches:Math.min(6,Math.max(0,Math.floor((40-used-reserved)/3)))};
}
export function requireRetentionControlReserve(options,minimum_mutation_batches=1){
 if(!Number.isInteger(minimum_mutation_batches)||minimum_mutation_batches<0||minimum_mutation_batches>6)throw Error('EXACT_RETENTION_MINIMUM_GUARD_RESERVE_REQUIRED');
 const plan=retentionMutationControlPlan(options);
 if(options.used+plan.reserved_HTTP+3*minimum_mutation_batches>40)throw Error('RETENTION_REMAINING_CONTROL_RESERVE_REQUIRED');
 return plan;
}
