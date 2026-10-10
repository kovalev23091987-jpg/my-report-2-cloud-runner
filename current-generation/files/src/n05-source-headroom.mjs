// Read-only preflight avoids spending the caller's HTTP envelope on exhausted
// venues. Atomic existing reservations remain the authority after this check.
export async function n05SourceHasHeadroom(db,source,cap,now){
 if(!db?.prepare||!Number.isSafeInteger(now)||!Number.isSafeInteger(cap)||cap<1)return false;
 try{const row=await db.prepare('SELECT attempts FROM report2_evidence_source_daily WHERE source=?1 AND day_utc=?2 LIMIT 1').bind(source,new Date(now).toISOString().slice(0,10)).first();return row==null||Number.isSafeInteger(Number(row.attempts))&&Number(row.attempts)>=0&&Number(row.attempts)<cap;}catch{return false;}
}
