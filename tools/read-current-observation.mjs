import fs from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const run='1791264245746-1791264254804',now=Date.now(),reservation={rows_read:2500,rows_written:16};
const id='EXACT_CURRENT_DATA:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={schema:'report2-exact-current-data-readback-v1',head:process.env.GITHUB_SHA,read_ts:now,run_id:run,sourceHTTP:0,MAIN:0,Telegram:0,source_writes:0,rows:[]};
const check=()=>{const u=db.usageSnapshot();if(u.unknown_ops!==0||u.rows_read>2300||u.rows_written>14||u.requests>18)throw Error('BOUNDED_D1_USAGE_EXCEEDED');};
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){
 await reserveRunBudget(db,{reservationId:id,now,reservation});
 try{
  check();
  for(const [contract,eventId,snap,cutoff] of [["BR-USDT","OPP:opportunity-integrity-v2:BR-USDT:MARKET:EPISODE:1791244800000:1791259200000","S392:BR-USDT:1791264336039",1791264336039]]){
   const row=await db.prepare('SELECT event_id,contract_code,observed_ts,event_json FROM opportunity_shadow_event WHERE event_id=?1 LIMIT 1').bind(eventId).first();check();
   if(!row||row.contract_code!==contract||row.event_id!==eventId)throw Error('EXACT_EVENT_BINDING_FAILED');
   const event=JSON.parse(row.event_json);
   const tape=await db.prepare('SELECT source,asset_key,observed_ts,expires_ts,payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 LIMIT 1').bind('HTX_SIGNED_RAW_TAPE',contract).first();check();
   out.rows.push({contract_code:contract,run_id:run,snapshot_id:snap,canonical_cutoff:cutoff,event_row:{...row,event_json:undefined,event},event_available_at_cutoff:row.observed_ts<=cutoff,tape:tape?{...tape,payload_json:undefined,payload_sha256:createHash('sha256').update(tape.payload_json).digest('hex'),ring:JSON.parse(tape.payload_json),cache_available_at_cutoff:tape.observed_ts<=cutoff}:null});
  }
  out.status='EXACT_CURRENT_PUBLIC_DATA_READ';
 }catch(e){out.status='READBACK_FAILED';out.error=String(e.message).slice(0,180);}
 finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else out.status='D1_ADMISSION_BLOCKED';
out.d1_usage=db.usageSnapshot();
await fs.mkdir('audit-output',{recursive:true});
const bytes=Buffer.from(JSON.stringify(out)),gz=gzipSync(bytes,{mtime:0});
await fs.writeFile('audit-output/exact-current-data.json.gz',gz);
const summary={...out,rows:out.rows.map(r=>({contract_code:r.contract_code,run_id:r.run_id,snapshot_id:r.snapshot_id,canonical_cutoff:r.canonical_cutoff,event_observed_ts:r.event_row.observed_ts,event_available_at_cutoff:r.event_available_at_cutoff,tape_observed_ts:r.tape?.observed_ts,tape_available_at_cutoff:r.tape?.cache_available_at_cutoff,event_keys:Object.keys(r.event_row.event)})),json_sha256:createHash('sha256').update(bytes).digest('hex'),gzip_sha256:createHash('sha256').update(gz).digest('hex')};
await fs.writeFile('audit-output/readback-summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));if(out.status!=='EXACT_CURRENT_PUBLIC_DATA_READ')process.exitCode=1;
