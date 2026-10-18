// Portable opaque tokens: no Node imports in the Workers budget guard.
// Only the authenticated evidence loader issues a proof handle; plain JSON
// and caller flags cannot create a registered native reconciliation.
const proofs=new WeakMap(),receipts=new WeakMap();
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const day=x=>new Date(x).toISOString().slice(0,10);
const requireFact=(condition,message)=>{if(!condition)throw Error(message);};
const signature=d=>JSON.stringify(['day_utc','run_count','reserved_rows_read','reserved_rows_written','measured_rows_read','measured_rows_written','unknown_ops','unfinished_count'].map(k=>d?.[k]));
export function registerVerifiedNativeDayProof(handle,context){proofs.set(handle,context);return handle;}
export function nativeReconciliationQueryBinding(handle,now){
 const p=proofs.get(handle);return p&&integer(now)&&day(now)===handle.day_utc?handle.reservation_id:null;
}
// Trusted build-time transfer only. The Node evidence loader must first
// authenticate the original files. Environment JSON and caller flags never
// issue a handle. The emitted Worker still has to match its live ledger row.
export function nativeReconciliationProofMaterial(handle,now){
 const p=proofs.get(handle);if(!p||!nativeReconciliationQueryBinding(handle,now))return null;
 return JSON.parse(JSON.stringify({handle,context:p}));
}
export function nativeReconciliationAtomicWitness({handle,now,current_usage}={}){
 const p=proofs.get(handle);
 if(!p||!nativeReconciliationQueryBinding(handle,now)||current_usage?.unknown_ops!==0)return null;
 const e=p.receipt;
 if(!integer(p.started)||!integer(p.end)||p.end<p.started||!integer(p.expected_reserve?.rows_read)||p.expected_reserve.rows_read<1||!integer(p.expected_reserve?.rows_written)||p.expected_reserve.rows_written<1||!integer(e?.measured_rows_read)||!integer(e?.measured_rows_written_accounted)||!integer(e?.measured_requests_accounted)||!integer(handle.historical_unknown_operations)||handle.historical_unknown_operations<1)return null;
 return Object.freeze({reservation_id:handle.reservation_id,source_run_id:handle.source_run_id,day_utc:handle.day_utc,started_ts:p.started,completed_ts_max:p.end,min_reserve_rows_read:p.expected_reserve.rows_read,min_reserve_rows_written:p.expected_reserve.rows_written,measured_rows_read:e.measured_rows_read,measured_rows_written:e.measured_rows_written_accounted,measured_requests:e.measured_requests_accounted,unknown_ops:handle.historical_unknown_operations,manifest_sha256:handle.manifest_sha256});
}
export function bindNativeDayReconciliation({handle,daily,source_row,current_usage}={}){
 const p=proofs.get(handle);if(!p)return null;
 try{
  const r=typeof source_row==='string'?JSON.parse(source_row):source_row,e=p.receipt;
  requireFact(daily?.ok===true&&daily.day_utc===handle.day_utc&&daily.unknown_ops===handle.historical_unknown_operations&&daily.run_count>=1,'EXACT_CURRENT_DAY_UNKNOWN_SET_REQUIRED');
  requireFact(integer(current_usage?.unknown_ops)&&current_usage.unknown_ops===0,'CURRENT_INVOCATION_NATIVE_USAGE_MUST_BE_CLOSED');
  requireFact(r?.reservation_id===handle.reservation_id&&r.day_utc===handle.day_utc&&r.source_run_id===handle.source_run_id&&r.state==='FINALIZED'&&r.started_ts===p.started&&integer(r.completed_ts)&&r.completed_ts>=p.started&&r.completed_ts<=p.end,'FRESH_EXACT_NATIVE_SOURCE_ROW_REQUIRED');
  requireFact(r.measured_rows_read===e.measured_rows_read&&r.measured_rows_written===e.measured_rows_written_accounted&&r.measured_requests===e.measured_requests_accounted&&r.unknown_ops===handle.historical_unknown_operations,'ORIGINAL_LEDGER_VALUES_MUST_REMAIN_UNCHANGED');
  requireFact(integer(p.expected_reserve?.rows_read)&&p.expected_reserve.rows_read>0&&integer(p.expected_reserve.rows_written)&&p.expected_reserve.rows_written>0&&r.reserve_rows_read>=p.expected_reserve.rows_read&&r.reserve_rows_written>=p.expected_reserve.rows_written&&daily.reserved_rows_read>=r.reserve_rows_read&&daily.reserved_rows_written>=r.reserve_rows_written&&daily.measured_rows_read>=r.measured_rows_read&&daily.measured_rows_written>=r.measured_rows_written,'NO_RESERVATION_REFUND_OR_COST_REDUCTION');
  const receipt=Object.freeze({...handle,schema:'BOUND_NATIVE_AGGREGATE_COST_RECONCILIATION_V1',status:'AGGREGATE_BILLABLE_COST_CLOSED',historical_unknown_operations_preserved:r.unknown_ops,original_reservation_preserved:true,new_or_unmatched_unknown_authorized:false});receipts.set(receipt,signature(daily));return receipt;
 }catch{return null;}
}
export function nativeDayUnknownCostIndependentlyClosed(daily){
 return Boolean(daily?.native_cost_reconciliation&&receipts.get(daily.native_cost_reconciliation)===signature(daily));
}
