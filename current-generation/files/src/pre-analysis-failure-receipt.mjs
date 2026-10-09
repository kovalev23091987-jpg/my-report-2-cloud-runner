import {createHash} from 'node:crypto';

const stamp=v=>Number.isSafeInteger(v)&&v>=1e12?v:null;
const statuses=new Set(['CLOSED','DEFAULT_OWNER','SOURCE_UNSUPPORTED','MIGRATION_REQUIRED','READ_FAILED']);
const bridgeCodes=new Set(['UNAUTHORIZED','NOT_FOUND','POST_REQUIRED','DATA_DB_BINDING_MISSING','SQL_REQUIRED','BODY_TOO_LARGE','INVALID_JSON','INVALID_BATCH','UNSUPPORTED_OPERATION']);
const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
export function summarizeD1AttemptUsage(usage){
 const values=['requests','rows_read','rows_written','unknown_ops'].map(k=>count(usage?.[k]));
 if(values.some(x=>x===null))return null;
 const [requests,reads,writes,unknown]=values;
 return {attempted_statements:requests,measured_rows_read_subtotal:reads,measured_rows_written_subtotal:writes,unknown_operations:unknown,row_totals_closed:unknown===0,total_rows_read:unknown===0?reads:null,total_rows_written:unknown===0?writes:null};
}
export function schedulerReadFailure(error){
 const message=typeof error==='string'?error:'';
 const invalid=message.match(/^D1_BRIDGE_INVALID_JSON_HTTP_(\d{3})$/);
 const http=message.match(/^D1_BRIDGE_FAILURE:HTTP_(\d{3})$/);
 const bridge=message.match(/^D1_BRIDGE_FAILURE:([A-Z_]+)$/);
 return {family:message==='D1_BRIDGE_TIMEOUT'?'D1_BRIDGE_TIMEOUT':invalid?'D1_BRIDGE_INVALID_JSON':http||message.startsWith('D1_BRIDGE_FAILURE:')?'D1_BRIDGE_FAILURE':'UNCLASSIFIED_READ_FAILURE',http_status:invalid||http?Number((invalid||http)[1]):null,bridge_code:bridge&&bridgeCodes.has(bridge[1])?bridge[1]:null,error_fingerprint:message?createHash('sha256').update(message).digest('hex'):null,raw_error_exported:false};
}

// Persist an infrastructure/policy refusal before the runner throws. This is
// neither a market snapshot nor a task mutation, and cannot authorize delivery.
export async function enforcePeriodicOwnership({ownership,context={},write_result}={}){
 if(ownership?.allowed===true)return;
 const status=statuses.has(ownership?.status)?ownership.status:'OWNERSHIP_NOT_CLOSED';
 const receipt={schema:'PRE_ANALYSIS_FAILURE_RECEIPT_V1',stage:'PERIODIC_ANALYTICS_OWNERSHIP_READ',status,reason:status==='READ_FAILED'?'SCHEDULER_OWNER_READ_FAILED':status==='MIGRATION_REQUIRED'?'SCHEDULER_OWNER_SCHEMA_MISSING':'PERIODIC_ANALYTICS_OWNERSHIP_NOT_CONFIRMED',source_run_id:/^\d{1,20}$/.test(String(context.source_run_id))?String(context.source_run_id):null,head:/^[a-f0-9]{40}$/.test(String(context.head))?context.head:null,task_id:/^RCHK:[a-f0-9]{40}$/.test(String(context.task_id))?context.task_id:null,trigger_only:context.trigger_only===true,started_ts:stamp(context.started_ts),failed_ts:stamp(context.failed_ts),owner:ownership?.owner==='GITHUB_ACTIONS'?'GITHUB_ACTIONS':ownership?.owner?'OTHER_OWNER':null,actor:ownership?.actor==='GITHUB_ACTIONS'?'GITHUB_ACTIONS':'OTHER_ACTOR',read_failure:status==='READ_FAILED'?schedulerReadFailure(ownership?.error):null,market_conditions_evaluated:false,full_analysis_completed:false,entry_authorized:false,task_writes:0,source_clock_refreshed:false};
 receipt.d1_attempt_usage=summarizeD1AttemptUsage(context.d1_usage);
 const output={schema:'my-report-2-canonical-run-output-v1',generation:context.generation,head:receipt.head,source:'schedule',run_id:receipt.source_run_id,status:'NOT_CLOSED',reason:receipt.reason,candidates:[],pre_analysis_failure:receipt,generated_at:receipt.failed_ts===null?null:new Date(receipt.failed_ts).toISOString(),secrets_included:false,alternative_manual_recalculation:false};
 let persisted=false;
 try{if(typeof write_result==='function'){await write_result(output);persisted=true;}}catch{}
 const error=new Error(`PERIODIC_ANALYTICS_OWNER_NOT_GITHUB:${status}`);
 error.pre_analysis_failure={...receipt,artifact_persisted:persisted};
 throw error;
}

export async function enforceDailyAnalysisAdmission({admission,context={},write_result}={}){
 if(admission?.allowed===true)return;
 const safeStatus=v=>typeof v==='string'&&/^[A-Z0-9_]{1,80}$/.test(v)?v:'NOT_CLOSED';
 const daily=admission?.daily||{},receipt={schema:'PRE_ANALYSIS_FAILURE_RECEIPT_V1',stage:context.trigger_admission===true?'D1_TRIGGER_RECHECK_ADMISSION':'D1_DAY_PREACTION_ADMISSION',status:safeStatus(admission?.status),reason:context.trigger_admission===true?'D1_TRIGGER_BUDGET_NOT_CLOSED':'D1_DAILY_ADMISSION_NOT_CLOSED',source_run_id:/^\d{1,20}$/.test(String(context.source_run_id))?String(context.source_run_id):null,head:/^[a-f0-9]{40}$/.test(String(context.head))?context.head:null,task_id:/^RCHK:[a-f0-9]{40}$/.test(String(context.task_id))?context.task_id:null,trigger_only:context.trigger_only===true,started_ts:stamp(context.started_ts),failed_ts:stamp(context.failed_ts),daily:{status:safeStatus(daily.status),unknown_operations:count(daily.unknown_ops),reserved_rows_read:count(daily.reserved_rows_read),reserved_rows_written:count(daily.reserved_rows_written),unfinished_reservations:count(daily.unfinished_count)},d1_attempt_usage:summarizeD1AttemptUsage(context.d1_usage),market_conditions_evaluated:false,full_analysis_completed:false,entry_authorized:false,task_writes:0,source_clock_refreshed:false};
 receipt.daily_usage_scope=['NATIVE_DAILY_AGGREGATE','ADAPTIVE_ADMISSION_POLICY_INPUTS'].includes(context.daily_usage_scope)?context.daily_usage_scope:'UNSPECIFIED';
 const native=context.native_d1_daily;
 receipt.native_daily_aggregate=native&&typeof native==='object'?{status:safeStatus(native.status),day_utc:typeof native.day_utc==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(native.day_utc)?native.day_utc:null,run_count:count(native.run_count),reserved_rows_read:count(native.reserved_rows_read),reserved_rows_written:count(native.reserved_rows_written),measured_rows_read:count(native.measured_rows_read),measured_rows_written:count(native.measured_rows_written),unknown_operations:count(native.unknown_ops),unfinished_reservations:count(native.unfinished_count)}:null;
 const output={schema:'my-report-2-canonical-run-output-v1',generation:context.generation,head:receipt.head,source:['schedule','manual','manual_recovery'].includes(context.source)?context.source:'schedule',run_id:receipt.source_run_id,status:'NOT_CLOSED',reason:receipt.reason,candidates:[],pre_analysis_failure:receipt,generated_at:receipt.failed_ts===null?null:new Date(receipt.failed_ts).toISOString(),secrets_included:false,alternative_manual_recalculation:false};
 let persisted=false;try{if(typeof write_result==='function'){await write_result(output);persisted=true;}}catch{}
 const error=new Error(`D1_DAY_PREACTION_BUDGET_BLOCKED:${receipt.status}`);error.pre_analysis_failure={...receipt,artifact_persisted:persisted};throw error;
}
