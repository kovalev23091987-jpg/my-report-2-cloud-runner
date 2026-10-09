import {createHash} from 'node:crypto';

const stamp=v=>Number.isSafeInteger(v)&&v>=1e12?v:null;
const statuses=new Set(['CLOSED','DEFAULT_OWNER','SOURCE_UNSUPPORTED','MIGRATION_REQUIRED','READ_FAILED']);
const bridgeCodes=new Set(['UNAUTHORIZED','NOT_FOUND','POST_REQUIRED','DATA_DB_BINDING_MISSING','SQL_REQUIRED','BODY_TOO_LARGE','INVALID_JSON','INVALID_BATCH','UNSUPPORTED_OPERATION']);
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
 const output={schema:'my-report-2-canonical-run-output-v1',generation:context.generation,head:receipt.head,source:'schedule',run_id:receipt.source_run_id,status:'NOT_CLOSED',reason:receipt.reason,candidates:[],pre_analysis_failure:receipt,generated_at:receipt.failed_ts===null?null:new Date(receipt.failed_ts).toISOString(),secrets_included:false,alternative_manual_recalculation:false};
 let persisted=false;
 try{if(typeof write_result==='function'){await write_result(output);persisted=true;}}catch{}
 const error=new Error(`PERIODIC_ANALYTICS_OWNER_NOT_GITHUB:${status}`);
 error.pre_analysis_failure={...receipt,artifact_persisted:persisted};
 throw error;
}
