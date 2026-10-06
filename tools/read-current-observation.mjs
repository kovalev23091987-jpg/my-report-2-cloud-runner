import fs from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const req=JSON.parse(await fs.readFile(new URL('./read-current-observation-request.json',import.meta.url),'utf8'));
if(!/^\d+-\d+$/.test(req.run_id)||!Array.isArray(req.contracts)||req.contracts.length!==2||new Set(req.contracts).size!==2||!Number.isSafeInteger(req.start_ts)||!Number.isSafeInteger(req.upper_ts)||req.start_ts!==Number(req.run_id.split('-')[0])||req.upper_ts<req.start_ts||req.upper_ts-req.start_ts>600000)throw Error('EXACT_REQUEST_SCOPE_REQUIRED');
const run=req.run_id,now=Date.now(),reservation={rows_read:2500,rows_written:16};
const id='EXACT_CURRENT_DATA:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={schema:'report2-exact-current-data-readback-v1',head:process.env.GITHUB_SHA,read_ts:now,run_id:run,source_cloud_run:req.source_cloud_run,source_head:req.source_head,early_rows_scope:'MUTABLE_CURRENT_ROWS_AT_READ_TS_NOT_ORIGINAL_HISTORY',sourceHTTP:0,MAIN:0,Telegram:0,source_writes:0,rows:[]};
const check=()=>{const u=db.usageSnapshot();if(u.unknown_ops!==0||u.rows_read>2300||u.rows_written>14||u.requests>18)throw Error('BOUNDED_D1_USAGE_EXCEEDED');};
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){
 await reserveRunBudget(db,{reservationId:id,now,reservation});
 try{

  check();
  out.handoffs=await db.prepare("SELECT h.*,d.execution_status,d.data_sufficiency,substr(d.error_text,1,500) error_text,d.started_ts,d.completed_ts FROM deep_check_run_log d JOIN v3_discovery_deep_handoff_shadow h ON h.handoff_id=d.v3_handoff_id AND h.contract_code=d.contract_code AND h.source_run_id=d.run_id WHERE d.run_id=?1 ORDER BY h.discovery_rank LIMIT 2").bind(run).all();check();
  out.pipeline_rows=[];
  for(const contract of req.contracts){
   const h=out.handoffs.results.find(h=>h.contract_code===contract);
   const observed=Number(req.snapshot_ids[contract].split(':').at(-1));
   if(!h||h.source_run_id!==run||h.scan_ts<req.start_ts||h.scan_ts>req.upper_ts||h.started_ts>observed||h.completed_ts<observed)throw Error('EXACT_HANDOFF_BINDING_FAILED');
   const result=await db.batch([
    db.prepare('SELECT * FROM shadow_decision_log WHERE contract_code=?1 AND observed_ts=?2 LIMIT 1').bind(contract,observed),
    db.prepare('SELECT f.*,c.score_lower_bound,c.score_upper_bound,c.valid_until_ts,c.status AS telegram_context_status FROM final_decision_integration_shadow f LEFT JOIN final_decision_telegram_context_shadow c ON c.decision_id=f.decision_id WHERE f.contract_code=?1 AND f.persisted_ts BETWEEN ?2 AND ?3 ORDER BY f.persisted_ts DESC LIMIT 2').bind(contract,h.scan_ts-300000,h.completed_ts)
   ]);check();
   if(result.some(r=>r.success===false))throw Error('EXACT_PIPELINE_QUERY_FAILED');
   out.pipeline_rows.push({contract,observed_ts:observed,deep_started_ts:h.started_ts,deep_completed_ts:h.completed_ts,shadow:result[0].results,final:result[1].results});
   if(result[0].results.length!==1)throw Error('EXACT_SHADOW_ROW_MISSING_OR_AMBIGUOUS:'+contract);
  }
  out.status='EXACT_CURRENT_PUBLIC_DATA_READ';
 }catch(e){out.status='READBACK_FAILED';out.error=String(e.message).slice(0,180);}
 finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else out.status='D1_ADMISSION_BLOCKED';
out.d1_usage=db.usageSnapshot();
await fs.mkdir('audit-output',{recursive:true});
const bytes=Buffer.from(JSON.stringify(out)),gz=gzipSync(bytes,{mtime:0});
await fs.writeFile('audit-output/exact-current-data.json.gz',gz);
const summary={...out,rows:out.rows.map(r=>({contract_code:r.contract_code,publication_id:r.publication_id,run_id:r.run_id,snapshot_id:r.snapshot_id,canonical_state:r.canonical_state,canonical_keys:Object.keys(r.canonical||{})})),json_sha256:createHash('sha256').update(bytes).digest('hex'),gzip_sha256:createHash('sha256').update(gz).digest('hex')};
await fs.writeFile('audit-output/readback-summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));if(out.status!=='EXACT_CURRENT_PUBLIC_DATA_READ')process.exitCode=1;
