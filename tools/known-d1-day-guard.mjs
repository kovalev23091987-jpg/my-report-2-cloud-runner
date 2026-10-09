import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL} from 'node:url';

export function evaluateKnownD1DayGuard({proof,retainedAudit,retainedSource,archive_digest,now_ts,generation}={}){
 const required=reason=>({blocked:false,status:'NATIVE_ADMISSION_REQUIRED',reason,sourceHTTP:0,D1:0,Telegram:0});
 if(!Number.isSafeInteger(now_ts)||now_ts<0)return required('CURRENT_CLOCK_REQUIRED');
 if(proof?.schema!=='ACTUAL_AUTOMATIC_PRODUCTION_ARTIFACT_AUDIT_20261009_V1'||proof.audit_artifact_digest!==archive_digest||!/^sha256:[a-f0-9]{64}$/.test(archive_digest||'')||!isDeepStrictEqual(proof.actual_audit,retainedAudit)||!isDeepStrictEqual(proof.source,retainedSource))return required('VERIFIED_RETAINED_AUDIT_REQUIRED');
 const a=retainedAudit,s=retainedSource,n=a?.native_daily_aggregate;
 if(a?.status!=='EXACT_PRE_ANALYSIS_REFUSAL_ARTIFACT_VERIFIED'||a.admission_status!=='UNMEASURED_FINALIZED_USAGE'||!['D1_TRIGGER_BUDGET_NOT_CLOSED','D1_DAILY_ADMISSION_NOT_CLOSED'].includes(a.reason)||a.run_id!==String(s?.source_cloud_run)||a.head!==s?.source_head||!/^[a-f0-9]{40}$/.test(a.head||'')||!/^sha256:[a-f0-9]{64}$/.test(s?.source_artifact_digest||'')||a.exact_SENT!==0||a.actual_ENTRY!==0||a.market_conditions_evaluated!==false||a.full_analysis_completed!==false||a.entry_authorized!==false||a.source_clock_refreshed!==false||a.task_writes!==0||!Number.isSafeInteger(a.failed_ts)||a.failed_ts>now_ts||!Number.isSafeInteger(n?.unknown_operations)||n.unknown_operations<1)return required('EXACT_ORIGINAL_UNKNOWN_COST_REFUSAL_REQUIRED');
 const day=new Date(now_ts).toISOString().slice(0,10);
 if(n.day_utc!==day||new Date(a.failed_ts).toISOString().slice(0,10)!==day)return required('ORIGINAL_REFUSAL_NOT_THIS_UTC_DAY');
 if(generation!=='MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M')return required('CURRENT_GENERATION_REQUIRED');
 return {blocked:true,status:'RETAINED_SAME_DAY_UNKNOWN_D1_COST_BLOCK',day_utc:day,original_refusal:{run_id:a.run_id,head:a.head,failed_ts:a.failed_ts,reason:a.reason,artifact_id:s.source_artifact_id,artifact_digest:s.source_artifact_digest,audit_cloud_run:proof.audit_cloud_run,audit_artifact_digest:archive_digest},native_daily_aggregate:{...n},sourceHTTP:0,D1:0,Telegram:0,market_conditions_evaluated:false,entry_authorized:false,source_clock_refreshed:false,next_day_requires_native_measured_admission:true};
}

export function buildKnownDayRefusalOutput({guard,head,run_id,generation,now_ts,source='schedule'}={}){
 if(!guard?.blocked||!/^[a-f0-9]{40}$/.test(head||'')||!/^\d+$/.test(String(run_id||'')))throw Error('EXACT_CURRENT_RUN_REQUIRED');
 const reason='D1_KNOWN_SAME_DAY_UNKNOWN_COST_BLOCK';
 return {schema:'my-report-2-canonical-run-output-v1',generation,head,source,run_id:String(run_id),status:'NOT_CLOSED',reason,candidates:[],pre_analysis_failure:{schema:'PRE_ANALYSIS_FAILURE_RECEIPT_V1',stage:'RETAINED_D1_UNKNOWN_COST_DAY_GUARD',status:guard.status,reason,head,source_run_id:String(run_id),task_id:null,trigger_only:false,started_ts:now_ts,failed_ts:now_ts,market_conditions_evaluated:false,full_analysis_completed:false,entry_authorized:false,task_writes:0,source_clock_refreshed:false,d1_attempt_usage:{attempted_statements:0,measured_rows_read_subtotal:0,measured_rows_written_subtotal:0,unknown_operations:0,row_totals_closed:true,total_rows_read:0,total_rows_written:0},daily_usage_scope:'RETAINED_ORIGINAL_NATIVE_DAILY_AGGREGATE;NO_CURRENT_NATIVE_READ',native_daily_aggregate:guard.native_daily_aggregate,retained_refusal_source:guard.original_refusal,native_admission_rechecked:false,next_day_requires_native_measured_admission:true},generated_at:new Date(now_ts).toISOString(),secrets_included:false,alternative_manual_recalculation:false};
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const root=path.resolve(process.argv[2]||'.'),now_ts=Date.now(),generation=process.env.REPORT2_CURRENT_GENERATION;
 let guard={blocked:false,status:'NATIVE_ADMISSION_REQUIRED',reason:'NO_VERIFIED_LOCAL_REFUSAL',sourceHTTP:0,D1:0,Telegram:0};
 try{
  const proof=JSON.parse(fs.readFileSync(path.join(root,'checkpoints/ACTUAL_AUTOMATIC_PRODUCTION_ARTIFACT_AUDIT_20261009.json'))),p=path.resolve(root,proof.retained);
  if(!p.startsWith(path.join(root,'checkpoints')+path.sep))throw Error('EXACT_RETAINED_CHECKPOINT_REQUIRED');
  const b=fs.readFileSync(p);if(b.length>4*1024*1024)throw Error('BOUNDED_RETAINED_AUDIT_REQUIRED');
  const read=n=>JSON.parse(execFileSync('unzip',['-p',p,n],{maxBuffer:1024*1024}).toString());
  guard=evaluateKnownD1DayGuard({proof,retainedAudit:read('automatic-delivery-audit.json'),retainedSource:read('source-artifact.json'),archive_digest:'sha256:'+createHash('sha256').update(b).digest('hex'),now_ts,generation});
 }catch{}
 if(guard.blocked){fs.mkdirSync(path.join(root,'runtime'),{recursive:true});fs.writeFileSync(path.join(root,'runtime/report2-run-result.json'),JSON.stringify(buildKnownDayRefusalOutput({guard,head:process.env.GITHUB_SHA,run_id:process.env.GITHUB_RUN_ID,generation,now_ts}),null,2)+'\n');}
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`blocked=${guard.blocked}\n`);
 console.log(JSON.stringify(guard));
}
