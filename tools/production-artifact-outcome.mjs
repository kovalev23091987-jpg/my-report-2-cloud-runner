import {verifySameRunDeliveryProof} from '../current-generation/files/src/same-run-delivery-proof.mjs';
const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
export function auditProductionArtifact({output,proof,expected_head}={}){
 if(output?.schema!=='my-report-2-canonical-run-output-v1'||output.head!==expected_head||!/^[a-f0-9]{40}$/.test(expected_head)||typeof output.run_id!=='string'||!output.run_id)throw Error('SOURCE_ARTIFACT_BINDING_REQUIRED');
 const base={schema:'AUTOMATIC_DELIVERY_ARTIFACT_AUDIT_V1',head:output.head,run_id:output.run_id,exact_SENT:0,actual_ENTRY:0,sourceHTTP:0,D1:0,Telegram:0,project_complete:false};
 if(output.status==='NOT_CLOSED'&&output.pre_analysis_failure){
  const f=output.pre_analysis_failure;
  if(f.schema!=='PRE_ANALYSIS_FAILURE_RECEIPT_V1'||f.head!==expected_head||f.source_run_id!==output.run_id||f.reason!==output.reason||!Array.isArray(output.candidates)||output.candidates.length!==0||f.market_conditions_evaluated!==false||f.full_analysis_completed!==false||f.entry_authorized!==false||f.source_clock_refreshed!==false||f.task_writes!==0||!Number.isSafeInteger(f.started_ts)||!Number.isSafeInteger(f.failed_ts)||f.failed_ts<f.started_ts||proof?.cases?.some(c=>c.exact_SENT===true||c.actual_ENTRY===true))throw Error('PRE_ANALYSIS_REFUSAL_BINDING_REQUIRED');
  const u=f.d1_attempt_usage,n=f.native_daily_aggregate;
  return {...base,status:'EXACT_PRE_ANALYSIS_REFUSAL_ARTIFACT_VERIFIED',reason:output.reason,stage:f.stage,admission_status:f.status,started_ts:f.started_ts,failed_ts:f.failed_ts,market_conditions_evaluated:false,full_analysis_completed:false,entry_authorized:false,task_writes:0,source_clock_refreshed:false,attempt_usage:u?{attempted_statements:count(u.attempted_statements),measured_rows_read_subtotal:count(u.measured_rows_read_subtotal),measured_rows_written_subtotal:count(u.measured_rows_written_subtotal),unknown_operations:count(u.unknown_operations),row_totals_closed:u.row_totals_closed===true,total_rows_read:u.row_totals_closed===true?count(u.total_rows_read):null,total_rows_written:u.row_totals_closed===true?count(u.total_rows_written):null}:null,native_daily_aggregate:n?{day_utc:n.day_utc,status:n.status,run_count:count(n.run_count),reserved_rows_read:count(n.reserved_rows_read),reserved_rows_written:count(n.reserved_rows_written),measured_rows_read:count(n.measured_rows_read),measured_rows_written:count(n.measured_rows_written),unknown_operations:count(n.unknown_operations),unfinished_reservations:count(n.unfinished_reservations)}:null,usage_scope:'ORIGINAL_RECEIPT_ONLY;NO_NEW_D1_READ;UNKNOWN_USAGE_NOT_RECONSTRUCTED'};
 }
 if(proof)return verifySameRunDeliveryProof({output,proof,expected_head});
 return {...base,status:'EXACT_DELIVERY_RECEIPT_NOT_AVAILABLE',canonical_status:output.status};
}
