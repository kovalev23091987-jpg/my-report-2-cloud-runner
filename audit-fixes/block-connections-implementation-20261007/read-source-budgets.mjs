import fs from 'node:fs/promises';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../../runner/d1-preaction-budget-guard.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),day=new Date(now).toISOString().slice(0,10),id='SOURCE_BUDGET_READBACK:'+process.env.GITHUB_RUN_ID;
const policies=[['GITHUB_OFFICIAL_RELEASES',12,8,6*60*60_000],['XRPL_NATIVE_SUPPLY',24,null,20*60_000],['STELLAR_NATIVE_SUPPLY',24,null,6*60*60_000],['CHAIN_RPC',720,null,20*60_000],['OFFICIAL_EVENTS',288,null,60*60_000]];
const out={schema:'EXACT_SOURCE_DAILY_BUDGET_READBACK_20261007_V1',head:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,observed_ts:now,day_utc:day,sourceHTTP:0,MAIN:0,Telegram:0,trading:0,source_quota_mutations:0,quota_resets:0,families:[],status:'NOT_STARTED'};
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:{rows_read:1500,rows_written:16},maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){
 await reserveRunBudget(db,{reservationId:id,now,reservation:{rows_read:1500,rows_written:16}});
 try{
  for(const [source,daily_cap,background_cap,ttl_ms] of policies){
   const r=await db.prepare('SELECT source,day_utc,attempts,updated_at FROM report2_evidence_source_daily WHERE source=?1 AND day_utc=?2').bind(source,day).first();
   const attempts=r?Number(r.attempts):0;if(!Number.isSafeInteger(attempts)||attempts<0||attempts>daily_cap)throw Error('SOURCE_LIMIT_NOT_CLOSED:'+source);
   out.families.push({source,daily_cap,background_cap,protected_manual_reserve:background_cap===null?null:daily_cap-background_cap,reserved_attempts:attempts,total_remaining:daily_cap-attempts,background_remaining:background_cap===null?null:Math.max(0,background_cap-attempts),original_ledger_updated_at:r?.updated_at??null,ttl_ms,no_reset:true});
  }
  const u=db.usageSnapshot();if(u.unknown_ops||u.rows_read>1400||u.rows_written>12||u.requests>20)throw Error('BOUNDED_BUDGET_READBACK_EXCEEDED');
  out.status='ACTUAL_SOURCE_COUNTERS_WITHIN_EXISTING_CAPS';
 }catch(e){out.status='BUDGET_READBACK_NOT_CLOSED';out.error=String(e.message).slice(0,180);}
 finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else out.status='D1_READBACK_ADMISSION_DENIED';
out.d1_usage=db.usageSnapshot();out.planning={GitHub:{enabled_feed_count:3,conditional_full_refreshes_per_day:4,conditional_source_requests_per_day:12,background_daily_cap:8,manual_reserve:4,full_three_feed_refresh_not_guaranteed:true,denied_excess_must_stay_missing:true,disabled_new_SOL_ADA_feeds_add_requests:0},XRP:{supply_fresh_pair_max_requests:3,dependent_payment_max_requests:1,combined_refresh_max_requests:4,shared_daily_cap:24,maximum_full_refreshes_per_day_if_no_other_family_use:6,all36_analysis_cycles_not_covered:true},Stellar:{source_requests_per_refresh:1,ttl_hours:6,conditional_requests_per_day:4,daily_cap:24},whole_job:{HTTP_cap:164,D1_daily_reads:3500000,D1_daily_writes:70000}};
await fs.mkdir('audit-output',{recursive:true});await fs.writeFile('audit-output/source-budget-readback.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,sourceHTTP:0,families:out.families,d1_usage:out.d1_usage}));if(out.status==='BUDGET_READBACK_NOT_CLOSED')process.exitCode=1;
