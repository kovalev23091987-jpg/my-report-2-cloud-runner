import fs from 'node:fs/promises';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';

const source={cloud_run:38037700109,artifact_id:11665045227,artifact_sha256:'e45575735b80ed8500ac72c6dc4f0f937259357450b28af64bdd4d8173702f7f',
  head:'3e41e327d262f5ba4718262ca3b16b79c6f9a0e7',run_id:'1791620620482-1791620628667',
  contract:'WLD-USDT',direction:'SHORT',publication_id:'PUB:deba46fe7c29162afd02d042f9c3b91e7fce4019',
  snapshot_id:'S392:WLD-USDT:1791620714334',wave_id:'EDW:WLD-USDT:1791599023518:G8',
  analytical_fingerprint:'ea851d36bb6f2318176c9149dd326a3d844878e3294ddcaaeade4b910cf94d1f',
  message_id:'174',original_trigger:{metric:'price',operator:'<=',value:0.4863,
    expires_ts:1791622514334,next_recheck_ts:1791621014334,cancel_condition:'price>0.5753'}};
const now=Date.now(),reservation={rows_read:1000,rows_written:16},id='WLD174_EXACT_LIFECYCLE:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={schema:'WLD174_ACTUAL_ORIGINAL_SENT_TO_CURRENT_LIFECYCLE_20261010_V1',
  head:process.env.GITHUB_SHA,cloud_run:Number(process.env.GITHUB_RUN_ID),read_ts:now,
  original:source,sourceHTTP:0,MAIN:0,Telegram:0,task_writes:0,source_clock_refreshed:false,
  actual_ENTRY:false,project_complete:false};
let db,reserved=false;
try{
  db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
  out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),
    nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
  if(!out.admission.allowed)throw Error('D1_DAILY_ADMISSION_'+out.admission.status);
  await reserveRunBudget(db,{reservationId:id,now,reservation});reserved=true;
  out.SENT=await db.prepare('SELECT b.publication_id,b.contract_code,b.direction,b.wave_id,b.run_id,b.snapshot_id,b.analytical_fingerprint,b.observed_ts,d.state,d.telegram_message_id,d.sent_ts,d.last_error FROM v3_dispatch_publication_binding_shadow b INDEXED BY idx_dispatch_publication_id JOIN v3_telegram_dispatch_shadow d ON d.idempotency_key=b.idempotency_key WHERE b.publication_id=?1 AND b.contract_code=?2 AND b.direction=?3 AND b.run_id=?4 AND b.snapshot_id=?5 AND b.analytical_fingerprint=?6 LIMIT 1')
    .bind(source.publication_id,source.contract,source.direction,source.run_id,source.snapshot_id,source.analytical_fingerprint).first();
  out.task=await db.prepare('SELECT task_id,publication_id,contract_code,direction,wave_id,snapshot_id,run_id,due_ts,expires_ts,state,attempt_count,last_result,created_ts,updated_ts FROM v3_recheck_task_shadow WHERE publication_id=?1 AND contract_code=?2 AND direction=?3 AND run_id=?4 AND snapshot_id=?5 LIMIT 1')
    .bind(source.publication_id,source.contract,source.direction,source.run_id,source.snapshot_id).first();
  if(out.task){
    if(out.task.expires_ts!==source.original_trigger.expires_ts||out.task.due_ts!==source.original_trigger.next_recheck_ts)
      throw Error('EXACT_ORIGINAL_WLD_TRIGGER_CLOCK_MISMATCH');
    if(out.task.wave_id!==source.wave_id)throw Error('EXACT_ORIGINAL_WLD_WAVE_MISMATCH');
  }
  let completion;
  try{completion=JSON.parse(out.task?.last_result);}catch{}
  out.completion_receipt=completion?.schema==='RECHECK_COMPLETION_V1'?completion:null;
  const child=out.completion_receipt?.publication_id||(
    typeof out.task?.last_result==='string'&&out.task.last_result.startsWith('PUB:')?out.task.last_result:null);
  if(child)out.child_publication=await db.prepare('SELECT publication_id,contract_code,direction,canonical_state,observed_ts,run_id,snapshot_id FROM canonical_publication_shadow WHERE publication_id=?1 LIMIT 1').bind(child).first();
  out.exact_SENT=out.SENT?.state==='SENT'&&String(out.SENT.telegram_message_id)===source.message_id;
  out.task_state_known=!!out.task;
  out.expired_by_original_clock=now>source.original_trigger.expires_ts;
  out.status=out.exact_SENT?'EXACT_WLD174_SENT_AND_CURRENT_TASK_READ_CLOSED':'WLD174_SENT_NOT_CONFIRMED_IN_D1';
  const u=db.usageSnapshot();if(u.unknown_ops||u.rows_read>900||u.rows_written>14||u.requests>12)throw Error('EXACT_D1_READ_ENVELOPE_EXCEEDED');
}catch(e){out.status='WLD174_READ_NOT_CLOSED';out.reason=String(e.message).slice(0,240);}
finally{
 if(db){const u=db.usageSnapshot();out.D1=u;if(reserved){
  try{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:u});}
  catch(e){out.status='D1_FINALIZATION_NOT_CLOSED';out.finalize_reason=String(e.message).slice(0,180);}
 }}
 await fs.mkdir('audit-output',{recursive:true});
 await fs.writeFile('audit-output/wld174-lifecycle-read.json',JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({status:out.status,read_ts:out.read_ts,exact_SENT:out.exact_SENT,message_id:out.SENT?.telegram_message_id,
   task_state:out.task?.state,attempt_count:out.task?.attempt_count,last_result:out.task?.last_result?.slice?.(0,180),
   expired_by_original_clock:out.expired_by_original_clock,D1:out.D1,reason:out.reason}));
 if(out.status==='D1_FINALIZATION_NOT_CLOSED')process.exitCode=1;
}
