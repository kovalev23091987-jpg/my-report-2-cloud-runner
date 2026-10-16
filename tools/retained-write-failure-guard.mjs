// Reuse exact same-day infrastructure evidence without a provider/SQL probe.
// This is a refusal receipt, never a successful report or a quota reset.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const GENERATION='MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M';
const hash=b=>createHash('sha256').update(b).digest('hex');
const count=n=>Number.isSafeInteger(n)&&n>=0;
const required=reason=>({blocked:false,status:'NATIVE_ADMISSION_REQUIRED',reason,sourceHTTP:0,D1:0,Telegram:0});
const sameDay=(a,b)=>new Date(a).toISOString().slice(0,10)===new Date(b).toISOString().slice(0,10);
function verifiedRelocation(p){
 const sample=Array.isArray(p?.compacted)?p.compacted.slice(0,4):[];
 return p?.status==='PROTECTED_REJECTED_BODIES_COMPACTED_EXACTLY'&&count(p.completed_ts)&&p.completed_ts>=1e12&&p.canonical_rows_modified>0&&count(p.physical_bytes_reclaimed)&&p.physical_bytes_reclaimed>0&&p.primary_database_bytes_before-p.primary_database_bytes_after===p.physical_bytes_reclaimed&&p.physical_database_free_bytes_measured===true&&p.D1?.unknown_ops===0&&['requests','rows_read','rows_written'].every(k=>count(p.D1[k]))&&Array.isArray(p.compacted)&&p.compacted.length===p.canonical_rows_modified&&Array.isArray(p.native_readbacks)&&p.native_readbacks.length>=Math.min(4,p.canonical_rows_modified)&&Array.isArray(p.native_preflight)&&p.native_preflight.length>=Math.min(4,p.canonical_rows_modified)&&p.native_preflight.every(r=>r.exact_original_verified===true&&r.primary_still_unmodified===true)&&sample.every(r=>p.native_readbacks.includes(r.publication_id)&&p.native_preflight.some(s=>s.publication_id===r.publication_id&&s.raw_sha256===r.raw_sha256))&&p.reference_or_statistic_rows_modified===0&&p.publication_rows_deleted===0;
}
export function evaluateRetainedWriteFailureGuard({manifest,report,delivery,relocation=null,now_ts,generation}={}){
 if(!count(now_ts)||now_ts<1e12)return required('CURRENT_CLOCK_REQUIRED');
 if(generation!==GENERATION||manifest?.schema!=='RETAINED_NATIVE_WRITE_FAILURE_GUARD_V1'||manifest.generation!==generation)return required('CURRENT_RETAINED_WRITE_FAILURE_REQUIRED');
 const s=manifest.source,f=report?.post_analysis_control_failure,u=f?.d1_attempt_usage;
 if(!Number.isSafeInteger(s?.cloud_run)||s.cloud_run<=0||!Number.isSafeInteger(s.artifact_id)||s.artifact_id<=0||!/^sha256:[a-f0-9]{64}$/.test(s.artifact_digest||'')||!/^[a-f0-9]{40}$/.test(s.head||'')||report?.schema!=='my-report-2-canonical-run-output-v1'||report.generation!==generation||report.head!==s.head||report.run_id!==s.run_id||report.source!=='schedule'||report.status!=='NOT_CLOSED'||report.reason!=='D1_POST_CYCLE_RESERVATION_EXCEEDED'||f?.schema!=='POST_ANALYSIS_CONTROL_FAILURE_V1'||f.head!==s.head||f.run_id!==s.run_id||f.reason!==report.reason||!count(f.failed_ts)||f.failed_ts>now_ts||!count(u?.unknown_operations)||u.unknown_operations<1||u.row_totals_closed!==false||u.total_rows_read!==null||u.total_rows_written!==null||!count(u.measured_rows_read_subtotal)||!count(u.measured_rows_written_subtotal)||!count(u.attempted_statements)||!Array.isArray(report.candidates)||report.candidates.length!==0||report.canonical_persistence_audit?.present_candidate_count!==0||!Array.isArray(report.canonical_persistence_audit.missing_contracts)||!report.canonical_persistence_audit.missing_contracts.length||f.new_entry_authorized!==false)return required('EXACT_UNMEASURED_WRITE_FAILURE_REQUIRED');
 if(!sameDay(f.failed_ts,now_ts))return required('ORIGINAL_WRITE_FAILURE_NOT_THIS_UTC_DAY');
 const failures=f.unmeasured_operation_receipts;
 if(!Array.isArray(failures)||failures.length!==u.unknown_operations||!failures.every(r=>['canonical_publication_shadow','full_evidence_shadow_log'].includes(r.target)&&r.sql_kind==='INSERT'&&r.http_status===500&&r.failure_class==='BRIDGE_RESPONSE_NOT_CLOSED'&&count(r.observed_ts)&&r.observed_ts<=f.failed_ts&&sameDay(r.observed_ts,f.failed_ts)))return required('EXACT_NATIVE_INSERT_FAILURE_RECEIPTS_REQUIRED');
 if(delivery?.schema!=='SAME_RUN_DELIVERY_PROOF_V1'||delivery.head!==s.head||delivery.generation!==generation||delivery.run_id!==s.run_id||delivery.status!=='NO_EXACT_SAME_RUN_SENT_CAPTURED'||!Array.isArray(delivery.cases)||delivery.cases.length!==0)return required('EXACT_FAILED_RUN_DELIVERY_BINDING_REQUIRED');
 if(relocation&&verifiedRelocation(relocation)&&relocation.completed_ts>f.failed_ts&&relocation.completed_ts<=now_ts)return required('LATER_EXACT_RELOCATION_REQUIRES_NATIVE_ADMISSION');
 return{blocked:true,status:'RETAINED_SAME_DAY_NATIVE_WRITE_FAILURE_BLOCK',kind:'RETAINED_NATIVE_WRITE_FAILURE',day_utc:new Date(now_ts).toISOString().slice(0,10),original_refusal:{run_id:s.run_id,head:s.head,failed_ts:f.failed_ts,reason:report.reason,cloud_run:s.cloud_run,artifact_id:s.artifact_id,artifact_digest:s.artifact_digest,unknown_operations:u.unknown_operations,measured_rows_read_subtotal:u.measured_rows_read_subtotal,measured_rows_written_subtotal:u.measured_rows_written_subtotal,row_totals_closed:false,total_rows_read:null,total_rows_written:null},native_daily_aggregate:null,sourceHTTP:0,D1:0,Telegram:0,market_conditions_evaluated:false,entry_authorized:false,source_clock_refreshed:false,exchange_limit_exhaustion_claimed:false,current_capacity_inferred:false,next_day_requires_native_measured_admission:true};
}
function checkpoint(root,p){
 if(typeof p!=='string'||!p.startsWith('checkpoints/')||p.includes('\\'))throw Error('BOUNDED_CHECKPOINT_REQUIRED');
 const target=path.resolve(root,p);if(!target.startsWith(path.join(root,'checkpoints')+path.sep))throw Error('BOUNDED_CHECKPOINT_REQUIRED');return target;
}
function verifiedFile(root,descriptor){
 if(!descriptor||!/^[a-f0-9]{64}$/.test(descriptor.gzip_sha256||'')||!/^[a-f0-9]{64}$/.test(descriptor.raw_sha256||''))throw Error('EXACT_FILE_DIGEST_REQUIRED');
 const zipped=fs.readFileSync(checkpoint(root,descriptor.path));if(zipped.length>2*1024*1024||hash(zipped)!==descriptor.gzip_sha256)throw Error('EXACT_FILE_DIGEST_REQUIRED');
 const raw=gunzipSync(zipped,{maxOutputLength:2*1024*1024});if(hash(raw)!==descriptor.raw_sha256)throw Error('EXACT_FILE_DIGEST_REQUIRED');return JSON.parse(raw);
}
export function loadRetainedWriteFailureGuard({root,now_ts=Date.now(),generation}={}){
 root=path.resolve(root||'.');
 try{
  const raw=fs.readFileSync(checkpoint(root,'checkpoints/CURRENT_RETAINED_NATIVE_WRITE_FAILURE_GUARD_20261016.json'));if(raw.length>65536)throw Error('BOUNDED_MANIFEST_REQUIRED');
  const manifest=JSON.parse(raw),report=verifiedFile(root,manifest.source?.report),delivery=verifiedFile(root,manifest.source?.delivery);
  let relocation=null;
  // A later relocation must have its exact native original, not a timestamp or
  // an unverified success flag. Bad/missing remediation never opens the gate.
  try{const rawStatus=fs.readFileSync(checkpoint(root,manifest.current_relocation_pointer));if(rawStatus.length>2*1024*1024)throw Error('BOUNDED_STATUS_REQUIRED');const current=JSON.parse(rawStatus).active_working_state?.latest_native_relocation;if(current?.proof&&/^[a-f0-9]{64}$/.test(current.proof_raw_sha256||'')){const bytes=fs.readFileSync(checkpoint(root,current.proof));if(bytes.length<=2*1024*1024&&hash(bytes)===current.proof_raw_sha256){const candidate=JSON.parse(bytes);if(Number(candidate.run)===Number(current.run))relocation=candidate;}}}catch{}
  return evaluateRetainedWriteFailureGuard({manifest,report,delivery,relocation,now_ts,generation});
 }catch{return required('NO_VERIFIED_LOCAL_WRITE_FAILURE');}
}
export function buildRetainedWriteFailureOutput({guard,head,run_id,generation,now_ts,source='schedule'}={}){
 if(guard?.blocked!==true||guard.kind!=='RETAINED_NATIVE_WRITE_FAILURE'||generation!==GENERATION||!/^[a-f0-9]{40}$/.test(head||'')||!/^\d+$/.test(String(run_id||''))||!count(now_ts)||now_ts<1e12||!sameDay(guard.original_refusal.failed_ts,now_ts))throw Error('EXACT_CURRENT_WRITE_REFUSAL_RUN_REQUIRED');
 const reason='D1_KNOWN_SAME_DAY_NATIVE_WRITE_FAILURE_BLOCK';
 return{schema:'my-report-2-canonical-run-output-v1',generation,head,source,run_id:String(run_id),status:'NOT_CLOSED',reason,candidates:[],pre_analysis_failure:{schema:'PRE_ANALYSIS_FAILURE_RECEIPT_V1',stage:'RETAINED_D1_NATIVE_WRITE_FAILURE_GUARD',status:guard.status,reason,head,source_run_id:String(run_id),task_id:null,trigger_only:false,started_ts:now_ts,failed_ts:now_ts,market_conditions_evaluated:false,full_analysis_completed:false,entry_authorized:false,task_writes:0,source_clock_refreshed:false,d1_attempt_usage:{attempted_statements:0,measured_rows_read_subtotal:0,measured_rows_written_subtotal:0,unknown_operations:0,row_totals_closed:true,total_rows_read:0,total_rows_written:0},daily_usage_scope:'EXACT_RETAINED_FAILED_RUN;NO_CURRENT_NATIVE_READ;NOT_DAILY_TOTAL',native_daily_aggregate:null,retained_refusal_source:guard.original_refusal,native_admission_rechecked:false,exchange_limit_exhaustion_claimed:false,next_day_requires_native_measured_admission:true},generated_at:new Date(now_ts).toISOString(),secrets_included:false,alternative_manual_recalculation:false};
}
