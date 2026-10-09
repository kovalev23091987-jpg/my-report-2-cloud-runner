import fs from 'node:fs';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {HISTORY_COMPATIBILITY} from '../current-generation/files/src/market-history-reader.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),reservation={rows_read:5000,rows_written:16},id='REMAINING_HISTORY_CADENCE:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={schema:'REMAINING_ORIGINAL_HISTORY_AND_CADENCE_READ_20261009_V1',head:process.env.GITHUB_SHA,cloud_run:process.env.GITHUB_RUN_ID,read_ts:now,sourceHTTP:0,MAIN:0,Telegram:0,task_writes:0,source_clocks_refreshed:false,project_complete:false};
const all=async(sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){await reserveRunBudget(db,{reservationId:id,now,reservation});try{
 out.cadence=await db.prepare("SELECT * FROM v3_maintenance_cadence_shadow WHERE job_key='TWO_CANDIDATE_ANALYTICS_40M' LIMIT 1").first();
 out.scheduled_overdue_ms=Number.isSafeInteger(out.cadence?.last_success_ts)?Math.max(0,now-out.cadence.last_success_ts-2400000):null;
 out.collector_boundaries=[];
 for(const generation of HISTORY_COMPATIBILITY.generations){const where="generation=?1 AND actor='HUB_PUBLIC_COLLECTOR'";const first=await db.prepare('SELECT bucket,received_ts,status,shard FROM report2_market_snapshot_batch_v1 INDEXED BY idx_report2_market_snapshot_batch_v1_range WHERE '+where+' ORDER BY bucket,shard LIMIT 1').bind(generation).first(),last=await db.prepare('SELECT bucket,received_ts,status,shard FROM report2_market_snapshot_batch_v1 INDEXED BY idx_report2_market_snapshot_batch_v1_range WHERE '+where+' ORDER BY bucket DESC,shard DESC LIMIT 1').bind(generation).first();out.collector_boundaries.push({generation,first,last,continuous_coverage_proven:false});}
 out.early_outcomes=await all('SELECT * FROM v3_early_outcome_journal INDEXED BY idx_v3_early_outcome_due WHERE target_ts BETWEEN ?1 AND ?2 ORDER BY target_ts DESC LIMIT 501',now-30*86400000,now);
 out.early_outcome_scope=out.early_outcomes.length>500?'BOUNDED_LAST501_MATURE_TARGET_ROWS;NOT_FULL_COHORT':'ALL_MATURE_TARGET_ROWS_IN30DAY_WINDOW';
 out.statistics={};for(const [key,table]of[['signals','tz101_entry_area_calibration_signal'],['outcomes','tz101_entry_area_calibration_outcome']]){out.statistics[key]=await all('SELECT * FROM '+table+' LIMIT 501');out.statistics[key+'_full_table_closed']=out.statistics[key].length<=500;}
 out.latest_canonical=await all('SELECT * FROM canonical_publication_shadow ORDER BY observed_ts DESC LIMIT 6');
 out.recheck_tasks=await all('SELECT * FROM v3_recheck_task_shadow INDEXED BY idx_v3_recheck_due WHERE state IN (\'PENDING\',\'LEASED\') ORDER BY due_ts LIMIT 11');
 const u=db.usageSnapshot();if(u.unknown_ops||u.rows_read>4800||u.rows_written>14||u.requests>30)throw Error('READ_ENVELOPE_EXCEEDED');out.status='REMAINING_ORIGINAL_HISTORY_CADENCE_READ_CLOSED';
 }catch(e){out.status='READ_NOT_CLOSED';out.error=String(e.message).slice(0,240);}finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}}else out.status='D1_ADMISSION_BLOCKED';
out.D1=db.usageSnapshot();fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/remaining-history-cadence-read.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,overdue_ms:out.scheduled_overdue_ms,early_rows:out.early_outcomes?.length,stats:out.statistics&&{signals:out.statistics.signals.length,outcomes:out.statistics.outcomes.length},D1:out.D1,error:out.error}));if(out.status!=='REMAINING_ORIGINAL_HISTORY_CADENCE_READ_CLOSED')process.exitCode=1;
