export const NATIVE_SECTOR_VALIDATION_BATCHES=Object.freeze({
 INITIAL_NATIVE4:Object.freeze(['FIL','ALGO','STEEM','DASH']),
 REMAINING_NATIVE7:Object.freeze(['HBAR','XMR','XPL','CHZ','ICP','TAO','TIA']),
});
export const NATIVE_SECTOR_VALIDATION_RESERVATION=Object.freeze({rows_read:8000,rows_written:400});
export function nativeSectorValidationPlan(batch='INITIAL_NATIVE4'){
 if(!Object.hasOwn(NATIVE_SECTOR_VALIDATION_BATCHES,batch))throw Error('EXACT_MISSING_BATCH_REQUIRED');
 return{batch,symbols:NATIVE_SECTOR_VALIDATION_BATCHES[batch],maximum_provider_HTTP:16,D1_reservation:NATIVE_SECTOR_VALIDATION_RESERVATION,max_total_runs_day:2,max_per_batch_day:1,same_day_legacy_initial_retained:true,ordinary_source_cap:224,manual_reserve_consumed:false,shared_minute_cap:9,MAIN:0,Telegram:0,cold_scheduled_D1_with_two_once_batches:{rows_read:3357912,rows_written:67064},no_source_allowance_increase:true};
}
export async function reserveNativeSectorValidationBatch(db,{batch,id,now}={}){
 const plan=nativeSectorValidationPlan(batch),day=new Date(now).toISOString().slice(0,10);
 if(!/^NATIVE_SECTOR_VALIDATE:(?:INITIAL_NATIVE4|REMAINING_NATIVE7):\d+:\d+$/.test(id)||!id.startsWith('NATIVE_SECTOR_VALIDATE:'+batch+':')||!Number.isSafeInteger(now))throw Error('EXACT_BATCH_RESERVATION_REQUIRED');
 // One shared family, including the original legacy initial run. Neither a
 // new batch ID nor a rerun can reset it or repeat the four qualified assets.
 const grant=await db.prepare(`INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts)
 SELECT ?1,?2,?3,?4,'RESERVED',?5 WHERE
 COALESCE((SELECT SUM(reserve_rows_read) FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2),0)+?3<=3500000 AND
 COALESCE((SELECT SUM(reserve_rows_written) FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2),0)+?4<=70000 AND
 NOT EXISTS(SELECT 1 FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2 AND state='FINALIZED' AND COALESCE(unknown_ops,1)>0) AND
 (SELECT COUNT(*) FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2 AND reservation_id LIKE 'NATIVE_SECTOR_VALIDATE:%')<2 AND
 ((?6='INITIAL_NATIVE4' AND NOT EXISTS(SELECT 1 FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2 AND reservation_id LIKE 'NATIVE_SECTOR_VALIDATE:%')) OR
 (?6='REMAINING_NATIVE7' AND (SELECT COUNT(*) FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2 AND reservation_id LIKE 'NATIVE_SECTOR_VALIDATE:%' AND reservation_id NOT LIKE 'NATIVE_SECTOR_VALIDATE:REMAINING_NATIVE7:%')=1 AND
 NOT EXISTS(SELECT 1 FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2 AND reservation_id LIKE 'NATIVE_SECTOR_VALIDATE:REMAINING_NATIVE7:%')))`).bind(id,day,plan.D1_reservation.rows_read,plan.D1_reservation.rows_written,now,batch).run();
 return Number(grant?.meta?.changes??grant?.changes)===1;
}
