// Owner19Oct: a TTL-only notification is not useful. Reject known unsent
// expiry notices from the already selected row, even if its binding is gone.
// This never changes task lifetime or authorizes another market event.
export const OWNER_EXPIRY_NOTICE_DISABLED='OWNER_TTL_NOTICE_DISABLED';
export function ownerSilentExpiryDispatch(row){
 if(!row||!['PENDING','FAILED_RETRYABLE'].includes(row.state)||row.lifecycle_event!=='IDEA_REMOVED'||
  typeof row.message_hash!=='string'||row.message_hash.length>16384)return false;
 let r;try{r=JSON.parse(row.message_hash);}catch{return false;}
 return r?.schema==='LIFECYCLE_REMOVAL_RECEIPT_V1'&&r.market_snapshot===false&&
  r.reason==='ORIGINAL_TTL_EXPIRED'&&r.contract===row.contract&&
  r.direction===row.direction&&r.wave_id===row.wave_id;
}
