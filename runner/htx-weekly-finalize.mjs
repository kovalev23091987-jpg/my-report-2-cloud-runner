// Preserve the receipt and release only the own lease even when native usage
// finalization fails. No quota reset, refund or implicit production activation.
export async function closeWeeklyQualification(out,{admitted=false,finalize_usage,usage_snapshot,whole_summary,has_own_lease=false,release_lease,now=Date.now,limits={reads:4000,writes:160}}={}){
 let failed=false;
 try{
  if(admitted)out.finalized_usage=await finalize_usage();
  if(usage_snapshot){out.D1=usage_snapshot();if(out.D1.unknown_ops||out.D1.rows_read>limits.reads||out.D1.rows_written>limits.writes){out.status='WEEKLY_D1_ENVELOPE_NOT_CLOSED';out.production_activation_status='DENIED_UNKNOWN_OR_EXCESS_NATIVE_D1';failed=true;}}
 }catch{
  out.usage_finalization_failed=true;out.status='WEEKLY_D1_FINALIZATION_NOT_ACKNOWLEDGED';out.production_activation_status='DENIED_UNACKNOWLEDGED_NATIVE_USAGE';failed=true;
 }
 out.whole_http=whole_summary();
 try{
  if(has_own_lease){out.lease_release=await release_lease();if(out.lease_release?.status!=='OWN_WEEKLY_LEASE_RELEASED'){out.own_lease_release_not_confirmed=true;failed=true;}}
 }catch{out.own_lease_release_not_confirmed=true;failed=true;}
 out.production_scope_changed=false;out.completed_ts=now();
 return{exit_code:failed||(out.sourceHTTP>0&&Boolean(out.reason))?1:0,receipt:out};
}
