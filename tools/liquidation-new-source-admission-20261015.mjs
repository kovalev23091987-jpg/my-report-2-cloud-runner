export const NEW_LIQ_SOURCE_RESEARCH=Object.freeze({family:'LIQ_NEW_SOURCE_VALIDATE',maximum_provider_HTTP:3,max_runs_day:1,reservation:Object.freeze({rows_read:2500,rows_written:40}),planned_day:Object.freeze({rows_read:3415780,rows_written:69778}),limits:Object.freeze({rows_read:3500000,rows_written:70000})});

export async function reserveNewLiquidationSourceResearch(db,{id,now}={}){
 if(!/^LIQ_NEW_SOURCE_VALIDATE:\d+:\d+$/.test(id||'')||!Number.isSafeInteger(now)||now<=0)throw Error('EXACT_NEW_LIQ_RESEARCH_REQUIRED');
 const p=NEW_LIQ_SOURCE_RESEARCH,day=new Date(now).toISOString().slice(0,10);
 // One new-source qualification, not a renamed retention or manual allowance.
 // Every existing family remains in the same native daily sums.
 const ack=await db.prepare(`INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts)
 SELECT ?1,?2,?3,?4,'RESERVED',?5 FROM (
 SELECT COALESCE(SUM(reserve_rows_read),0) AS reads,COALESCE(SUM(reserve_rows_written),0) AS writes,
 COALESCE(SUM(CASE WHEN state='FINALIZED' AND COALESCE(unknown_ops,1)>0 THEN 1 ELSE 0 END),0) AS unknown_count,
 COALESCE(SUM(CASE WHEN reservation_id LIKE 'LIQ_NEW_SOURCE_VALIDATE:%' THEN 1 ELSE 0 END),0) AS prior_count
 FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2)
 WHERE reads+?3<=?6 AND writes+?4<=?7 AND unknown_count=0 AND prior_count<?8`).bind(id,day,p.reservation.rows_read,p.reservation.rows_written,now,p.limits.rows_read,p.limits.rows_written,p.max_runs_day).run();
 if(ack?.meta?.changes!==1)return{allowed:false,status:'NEW_LIQ_SHARED_DAY_NOT_ADMITTED'};
 const row=await db.prepare('SELECT day_utc,reserve_rows_read,reserve_rows_written,state FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1 LIMIT 1').bind(id).first();
 if(row?.state!=='RESERVED'||row.day_utc!==day||row.reserve_rows_read!==p.reservation.rows_read||row.reserve_rows_written!==p.reservation.rows_written)throw Error('NEW_LIQ_RESERVATION_READBACK_REQUIRED');
 return{allowed:true,status:'ATOMIC_SHARED_DAY_RESERVED',reservation:p.reservation};
}
