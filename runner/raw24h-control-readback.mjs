import fs from 'node:fs/promises';
import path from 'node:path';
import {RemoteD1Database} from './report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from './d1-preaction-budget-guard.mjs';
import {signedTape24hEvidence} from '../current-generation/files/src/htx-signed-tape.mjs';

// One owner-requested control receipt: no HTX/source calls or tape writes.
const output=path.join(process.argv[2]||'runtime','raw24h-control-readback.json');
const now=Date.now(),db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const reservation={rows_read:5000,rows_written:16};
const id=`RAW24H_CONTROL:${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT}`;
let receipt={schema:'report2-raw24h-control-readback-v1',head:process.env.GITHUB_SHA,observed_ts:now,source_http:0,tape_writes:0,publication_enabled:false};
const daily=await loadDailyUsageAggregate(db,now);
const admission=evaluateDailyReservationBudget({daily,nextReservation:reservation,maxDailyReads:Number(process.env.REPORT2_D1_MAX_DAILY_READS),maxDailyWrites:Number(process.env.REPORT2_D1_MAX_DAILY_WRITES)});
receipt.admission=admission;
if(!admission.allowed){receipt.status='D1_ADMISSION_BLOCKED';}
else {
 await reserveRunBudget(db,{reservationId:id,now,reservation});
 try {
  const q=await db.prepare(`SELECT asset_key,observed_ts,expires_ts,json_array_length(payload_json,'$.minutes') AS persisted_minutes,json_extract(payload_json,'$.minutes[0].start_ts') AS first_minute_ts,json_extract(payload_json,'$.minutes[#-1].start_ts') AS last_minute_ts FROM report2_evidence_source_cache WHERE source=?1 ORDER BY asset_key LIMIT 103`).bind('HTX_SIGNED_RAW_TAPE').all();
  receipt.catalog=q.results||[];
  if(receipt.catalog.length>102)throw Error('TAPE_UNIVERSE_BOUND_EXCEEDED');
  const candidates=[...new Set(['NEAR-USDT','SOL-USDT',...receipt.catalog.filter(r=>r.persisted_minutes>=1440&&r.expires_ts>now).map(r=>r.asset_key)])].slice(0,4);
  receipt.integrity_checks=[];
  for(const contract of candidates){
   const row=await db.prepare(`SELECT payload_json,expires_ts FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 LIMIT 1`).bind('HTX_SIGNED_RAW_TAPE',contract).first();
   if(!row){receipt.integrity_checks.push({contract,status:'NO_SAVED_TAPE'});continue;}
   const ring=JSON.parse(row.payload_json),check=signedTape24hEvidence({ring,now});
   const timestamps=(ring.minutes||[]).map(r=>r.start_ts),end=Math.floor(now/60000)*60000-60000;
   const current=timestamps.filter(t=>t>=end-86400000&&t<end);
   receipt.integrity_checks.push({contract,status:check.status,verified_minutes:check.verified_minutes||0,required_minutes:1440,persisted_minutes:timestamps.length,first_minute_ts:timestamps[0]??null,last_minute_ts:timestamps.at(-1)??null,missing_current_window_minutes:1440-current.length,cache_fresh:row.expires_ts>now,earliest_possible_ready_ts:timestamps.length?timestamps[0]+86400000+60000:null,earliest_possible_ready_is_guarantee:false,evidence:check.evidence});
  }
  receipt.status=receipt.integrity_checks.some(r=>r.status==='CLOSED_EXACT_SIGNED_RAW_24H'&&r.cache_fresh)?'EXACT_24H_AVAILABLE_NOT_PUBLISHED':'NO_VERIFIED_FULL_24H';
 }catch(error){receipt.status='READBACK_FAILED';receipt.error=String(error.message).slice(0,160);}
 receipt.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});
}
receipt.d1_usage=db.usageSnapshot();
await fs.writeFile(output,JSON.stringify(receipt,null,2)+'\n');
console.log('RAW24H_CONTROL_READBACK',JSON.stringify({status:receipt.status,catalog_count:receipt.catalog?.length||0,checks:receipt.integrity_checks?.map(({evidence,...r})=>r),d1_usage:receipt.d1_usage}));
