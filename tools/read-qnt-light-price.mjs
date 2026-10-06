import fs from 'node:fs/promises';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const now=Date.now(),reservation={rows_read:600,rows_written:12},id='EXACT_QNT_LIGHT_PRICE:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={schema:'QNT_ACTUAL_LIGHT_PRICE_RECEIPT_V1',head:process.env.GITHUB_SHA,read_ts:now,sourceHTTP:0,MAIN:0,Telegram:0,source_writes:0,run_id:'1791300272369-1791300282948',snapshot_id:'S392:QNT-USDT:1791300373364',publication_id:'PUB:b32b638ddf17e08e7729ca4ca9da11e7fa4ef4c6',original_fingerprint:'51bd41963f52b40897b2eb9e6dd95f1b09b152b6c93d83a38ec464e1e3ed7d31'};
const check=()=>{const u=db.usageSnapshot();if(u.unknown_ops||u.rows_read>550||u.rows_written>10||u.requests>9)throw Error('BOUNDED_D1_USAGE_EXCEEDED');};
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){
 await reserveRunBudget(db,{reservationId:id,now,reservation});
 try{
  out.row=await db.prepare("SELECT t.*,p.contract_code,p.run_id,p.snapshot_id,p.observed_ts,p.analytical_fingerprint,p.canonical_json,p.wave_id AS publication_wave FROM v3_recheck_task_shadow t JOIN canonical_publication_shadow p ON p.publication_id=t.publication_id WHERE t.publication_id=?1 AND p.run_id=?2 AND p.snapshot_id=?3 LIMIT 1").bind(out.publication_id,out.run_id,out.snapshot_id).first();check();
  if(!out.row||out.row.analytical_fingerprint!==out.original_fingerprint)throw Error('EXACT_TASK_NOT_FOUND_OR_MISMATCH');
  const canonical=JSON.parse(out.row.canonical_json);delete out.row.canonical_json;out.original_trigger=canonical.trigger;out.price_policy=canonical.metadata.price_recheck_policy;
  out.dispatch=await db.prepare("SELECT d.state,d.telegram_message_id,d.updated_ts,b.publication_id FROM v3_dispatch_publication_binding_shadow b JOIN v3_telegram_dispatch_shadow d ON d.idempotency_key=b.idempotency_key WHERE b.publication_id=?1 AND b.run_id=?2 AND b.snapshot_id=?3 AND d.state='SENT' LIMIT 1").bind(out.publication_id,out.run_id,out.snapshot_id).first();check();
  out.status='EXACT_TASK_READBACK';out.result=JSON.parse(out.row.last_result_json||'null');
 }catch(e){out.status='READBACK_FAILED';out.error=String(e.message).slice(0,180);}
 finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else out.status='D1_ADMISSION_BLOCKED';
out.d1_usage=db.usageSnapshot();await fs.mkdir('audit-output',{recursive:true});await fs.writeFile('audit-output/qnt-light-price-receipt.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));if(out.status!=='EXACT_TASK_READBACK')process.exitCode=1;
