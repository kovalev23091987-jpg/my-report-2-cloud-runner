import {archiveLiquidationForecasts} from './liquidation-forecast-archive.mjs';
import {nativeMeasuredD1,sumNativeUsage} from './native-measured-d1.mjs';
import {createPrivateCanonicalRestorer} from '../../current-generation/files/src/private-canonical-history.mjs';
import {evaluateWithinRunReservation,finalizeRunUsage} from '../../runner/d1-preaction-budget-guard.mjs';

export const PRIVATE_FORECAST_POLICY=Object.freeze({max_rows:8,max_runs_day:24,rows_read:5000,rows_written:80,max_daily_reads:3500000,max_daily_writes:70000});
const HOUR=3_600_000;
export async function reservePrivateForecastBudget(db,{scheduled_ts,now}={}){
 const p=PRIVATE_FORECAST_POLICY;
 if(!Number.isSafeInteger(scheduled_ts)||scheduled_ts<=0||!Number.isSafeInteger(now)||now<scheduled_ts||now-scheduled_ts>HOUR)throw Error('PRIVATE_FORECAST_HOURLY_CLOCK_REQUIRED');
 const id='PRIVATE_FORECAST:'+Math.floor(scheduled_ts/HOUR),day=new Date(now).toISOString().slice(0,10);
 const result=await db.prepare(`INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts)
 SELECT ?1,?2,?3,?4,'RESERVED',?5 WHERE
 COALESCE((SELECT SUM(reserve_rows_read) FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2),0)+?3<=?6 AND
 COALESCE((SELECT SUM(reserve_rows_written) FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2),0)+?4<=?7 AND
 NOT EXISTS(SELECT 1 FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2 AND state='FINALIZED' AND COALESCE(unknown_ops,1)>0) AND
 (SELECT COUNT(*) FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2 AND reservation_id LIKE 'PRIVATE_FORECAST:%')<?8`).bind(id,day,p.rows_read,p.rows_written,now,p.max_daily_reads,p.max_daily_writes,p.max_runs_day).run();
 const changes=Number(result?.meta?.changes);
 if(changes!==1)return{allowed:false,status:changes===0?'PRIVATE_FORECAST_DAY_BOUND_OR_DUPLICATE':'PRIVATE_FORECAST_ADMISSION_ACK_INVALID'};
 const row=await db.prepare('SELECT reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1 LIMIT 1').bind(id).first();
 if(row?.state!=='RESERVED'||row.day_utc!==day||row.reserve_rows_read!==p.rows_read||row.reserve_rows_written!==p.rows_written)throw Error('PRIVATE_FORECAST_RESERVATION_READBACK_REQUIRED');
 return{allowed:true,status:'ATOMIC_SHARED_DAY_RESERVED',reservation_id:id};
}

export async function runPrivateForecastConsumer({source_db,archive_db,private_db,scheduled_ts=Date.now(),clock=Date.now}={}){
 const source=nativeMeasuredD1(source_db),archive=nativeMeasuredD1(archive_db),privateArchive=nativeMeasuredD1(private_db);
 const p=PRIVATE_FORECAST_POLICY,usage=()=>sumNativeUsage(source,archive,privateArchive);
 const admit=e=>evaluateWithinRunReservation({reservation:p,currentUsage:usage(),extraRowsRead:e.rows_read,extraRowsWritten:e.rows_written+3});
 const admission=await reservePrivateForecastBudget(source,{scheduled_ts,now:clock()});
 if(!admission.allowed)return{...admission,status:admission.status,D1:usage(),sourceHTTP:0,report_effect:false,telegram_effect:false,weight_effect:false};
 let result,error;
 try{
  const reader=createPrivateCanonicalRestorer({archive_db:privateArchive,db_admit:admit,max_rows:p.max_rows});
  result=await archiveLiquidationForecasts({source_db:source,archive_db:archive,restore_canonical_row:reader.restore,db_admit:admit,scheduled_ts,clock});
 }catch(caught){error=caught;result={status:'FORECAST_RETRY_REQUIRED',reason:String(caught?.message||'PRIVATE_FORECAST_ERROR'),source_http:0,report_effect:false,telegram_effect:false,weight_effect:false};}
 const before=usage();
 const finalized_usage=await finalizeRunUsage(source,{reservationId:admission.reservation_id,sourceRunId:admission.reservation_id,now:clock(),usage:before});
 // The returned native counters include the final UPDATE's actual billing;
 // the conservative reservation is the account safety limit in the ledger.
 return{...result,admission,finalized_usage,D1:usage(),private_D1:privateArchive.usageSnapshot(),cursor_retry_required:!!error,sourceHTTP:0};
}
