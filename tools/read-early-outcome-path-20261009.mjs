import fs from 'node:fs';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {loadProspectiveFactualPathForTest as load} from '../runtime/r8-20-prospective-validation-sidecar.mjs';
import {resolveEarlyOutcome} from '../runtime/src/v3-early-persistence-runtime.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),reservation={rows_read:2500,rows_written:16},id='EARLY_QUEUE_PATH:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT,out={schema:'EARLY_QUEUE_ORIGINAL_PATH_DIAGNOSIS_20261009_V1',head:process.env.GITHUB_SHA,cloud_run:process.env.GITHUB_RUN_ID,read_ts:now,sourceHTTP:0,MAIN:0,Telegram:0,task_writes:0,source_clock_refreshed:false,project_complete:false};
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){await reserveRunBudget(db,{reservationId:id,now,reservation});try{
 out.cursor=await db.prepare("SELECT * FROM tz101_entry_area_calibration_state WHERE state_key='R8_20_EARLY_OUTCOME_CURSOR_V1' LIMIT 1").first();
 out.task=await db.prepare('SELECT * FROM v3_early_outcome_journal WHERE outcome_id=?1 LIMIT 1').bind('EDW:BR-USDT:1791545058092:G10:H1').first();
 const c=JSON.parse(out.cursor?.status||'{}');out.next_legacy_task=await db.prepare("SELECT outcome_id,contract_code,first_seen_ts,target_ts,outcome_status,computed_ts FROM v3_early_outcome_journal INDEXED BY idx_v3_early_outcome_due WHERE shadow_only=1 AND computed_ts IS NULL AND outcome_status='PENDING' AND target_ts BETWEEN ?1 AND ?2 AND (target_ts>?1 OR outcome_id>?3) ORDER BY target_ts,outcome_id LIMIT 1").bind(c.target_ts||0,now,c.outcome_id||'').first();
 out.raw_queries=[];const readOnly={prepare(sql){if(!/^\\s*SELECT/i.test(sql))throw Error('READ_ONLY_HISTORY_SQL_REQUIRED');return {args:[],bind(...args){this.args=args;return this;},async all(){const r=await db.prepare(sql).bind(...this.args).all();out.raw_queries.push({sql,args:this.args,result:r});return r;}}}};
 if(!out.task||out.task.target_ts>now)throw Error('ORIGINAL_MATURE_TASK_REQUIRED');
 out.path=await load(readOnly,{contract:out.task.contract_code,startTs:out.task.first_seen_ts,endTs:out.task.target_ts,nowTs:now});
 out.resolved=resolveEarlyOutcome({task:out.task,first_seen_price:JSON.parse(out.task.first_seen_context_json).first_seen_price,price_path:out.path.points,computed_ts:now});
 const u=db.usageSnapshot();if(u.unknown_ops||u.rows_read>2400||u.rows_written>14||u.requests>20)throw Error('READ_ENVELOPE_EXCEEDED');out.status='ORIGINAL_EARLY_QUEUE_AND_MATURE_PATH_DIAGNOSIS_CLOSED';
 }catch(e){out.status='READ_NOT_CLOSED';out.error=String(e.message).slice(0,240);}finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}}else out.status='D1_ADMISSION_BLOCKED';
out.D1=db.usageSnapshot();fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/early-queue-path-diagnosis.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,path:out.path?.status,computed_without_task_writes:out.resolved?.status,task:out.task?.outcome_id,next_legacy_task:out.next_legacy_task?.outcome_id,D1:out.D1,error:out.error}));if(out.status!=='ORIGINAL_EARLY_QUEUE_AND_MATURE_PATH_DIAGNOSIS_CLOSED')process.exitCode=1;
