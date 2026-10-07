import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
const bytes=await fs.readFile('checkpoints/post-pr229-bome-sent-read-37682711022/exact-current-data.json.gz');
if(createHash('sha256').update(bytes).digest('hex')!=='64371d66509dc15e374d071b5c244d8d76097a588489ac8d29f0a7988fa7efdd')throw Error('ORIGINAL_SOURCE_DIGEST_MISMATCH');
const saved=JSON.parse(gunzipSync(bytes)),row=saved.rows.find(r=>r.contract_code==='BOME-USDT'),c=row.canonical;
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),reservation={rows_read:1500,rows_written:16},id='ENTRY_TRANSITION:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={schema:'ACTUAL_SAVED_SENT_ENTRY_TRANSITION_DIAGNOSIS_V1',head:process.env.GITHUB_SHA,read_ts:now,cloud_run:process.env.GITHUB_RUN_ID,source_gzip_sha256:createHash('sha256').update(bytes).digest('hex'),source_run:c.run_id,snapshot_id:c.snapshot_id,publication_id:row.publication_id,analytical_fingerprint:c.analytical_fingerprint,message_id:'155',sourceHTTP:0,MAIN:0,Telegram:0,source_writes:0,source_clocks_refreshed:false,actual_market_price_crossing_inferred:false,canonical_state:c.state,original_observed_ts:c.observed_ts,original_due_ts:c.trigger.next_recheck_ts,original_expires_ts:c.trigger.expires_ts,original_ttl_minutes:(c.trigger.expires_ts-c.observed_ts)/60000,regular_full_analysis_minutes:40,original_entry_diagnostics:{targets:c.targets,costs:c.costs,microstructure:c.microstructure,technical_move_potential:c.metadata?.technical_move_potential,validated_signal:c.metadata?.validated_signal,entry_funnel:c.free_sources?.entry_funnel},limitation:'Current mutable task receipt is read at read_ts. It does not reconstruct overwritten historical five-minute prices or prove all absent entries.'};
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){
 await reserveRunBudget(db,{reservationId:id,now,reservation});
 try{
  out.task=await db.prepare('SELECT task_id,publication_id,contract_code,direction,wave_id,snapshot_id,run_id,due_ts,expires_ts,state,attempt_count,lease_owner,lease_started_ts,lease_expires_ts,last_result,created_ts,updated_ts FROM v3_recheck_task_shadow WHERE contract_code=?1 AND direction=?2 AND wave_id=?3 AND publication_id=?4 LIMIT 1').bind(row.contract_code,row.direction,row.wave_id,row.publication_id).first();
  const usage=db.usageSnapshot();if(usage.unknown_ops||usage.rows_read>1300||usage.rows_written>14||usage.requests>8)throw Error('BOUNDED_READ_EXCEEDED');
  if(out.task&&[out.task.run_id===c.run_id,out.task.snapshot_id===c.snapshot_id,out.task.due_ts===c.trigger.next_recheck_ts,out.task.expires_ts===c.trigger.expires_ts].some(v=>!v))throw Error('ORIGINAL_TASK_IDENTITY_MISMATCH');
  out.status=out.task?'ACTUAL_ORIGINAL_SENT_RECHECK_TASK_READ':'ORIGINAL_SENT_RECHECK_TASK_NOT_FOUND';
 }catch(e){out.status='READ_FAILED';out.error=String(e.message).slice(0,200);}
 finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else out.status='D1_ADMISSION_BLOCKED';
out.d1_usage=db.usageSnapshot();await fs.mkdir('audit-output',{recursive:true});await fs.writeFile('audit-output/actual-entry-transition-read.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,state:out.task?.state,attempt_count:out.task?.attempt_count,task_id:out.task?.task_id,sourceHTTP:0,Telegram:0,d1_usage:out.d1_usage,error:out.error}));if(['READ_FAILED','D1_ADMISSION_BLOCKED'].includes(out.status))process.exitCode=1;
