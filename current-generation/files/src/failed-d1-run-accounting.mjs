// One ledger finalization for a failed run, using its original reservation.
// Unknown costs remain unknown; reservations and measured debt never decrease.
export function createFailedD1RunAccounting({db,reservation_id,source_run_id,finalize_usage,now=Date.now}={}){
 if(typeof db?.usageSnapshot!=='function'||typeof finalize_usage!=='function'||!/^R2RUN:\d+:[a-f0-9]{16}$/.test(reservation_id||'')||!String(source_run_id||'')||typeof now!=='function')throw Error('EXACT_FAILED_RUN_ACCOUNTING_REQUIRED');
 let finalized=false,attempted=false;const usage=()=>{try{return db.usageSnapshot();}catch{return null;}};
 return{markFinalized(){finalized=true;},usage,async finalizeFailure(){
  if(finalized)return{status:'ALREADY_FINALIZED',new_SQL_attempts:0,reservation_never_reduced:true};
  if(attempted)return{status:'FAILURE_ACCOUNTING_ALREADY_ATTEMPTED',new_SQL_attempts:0,reservation_never_reduced:true};
  attempted=true;const before=usage();
  if(['requests','rows_read','rows_written','unknown_ops'].some(k=>!Number.isSafeInteger(before?.[k])||before[k]<0))return{status:'FAILURE_USAGE_NOT_CLOSED',new_SQL_attempts:0,reservation_never_reduced:true};
  try{
   const receipt=await finalize_usage(db,{reservationId:reservation_id,sourceRunId:String(source_run_id),now:now(),usage:before});
   if(receipt?.status!=='FINALIZED'||receipt.reservation_id!==reservation_id||receipt.unknown_ops!==before.unknown_ops||receipt.reservation_never_reduced!==true)throw Error('EXACT_FAILURE_FINALIZATION_RECEIPT_REQUIRED');
   finalized=true;return{status:'FAILED_RUN_NATIVE_USAGE_FINALIZED',reservation_id,unknown_ops_preserved:before.unknown_ops,receipt,usage_before:before,usage_after:usage(),new_SQL_attempts:1,reservation_never_reduced:true};
  }catch{
   return{status:'FAILURE_FINALIZATION_NOT_ACKNOWLEDGED',reservation_id,usage_before:before,usage_after:usage(),new_SQL_attempts:1,reservation_never_reduced:true,native_cost_not_guessed:true};
  }
 }};
}
