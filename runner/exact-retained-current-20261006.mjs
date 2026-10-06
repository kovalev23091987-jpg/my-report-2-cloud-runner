import fs from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from './report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from './d1-preaction-budget-guard.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const run='1791246840975-1791246850102',now=Date.now(),reservation={rows_read:2500,rows_written:16};
const id='EXACT_CURRENT_DATA:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={schema:'report2-exact-current-data-readback-v1',head:process.env.GITHUB_SHA,read_ts:now,run_id:run,sourceHTTP:0,MAIN:0,Telegram:0,source_writes:0,rows:[]};
const check=()=>{const u=db.usageSnapshot();if(u.unknown_ops!==0||u.rows_read>2300||u.rows_written>14||u.requests>18)throw Error('BOUNDED_D1_USAGE_EXCEEDED');};
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){
 await reserveRunBudget(db,{reservationId:id,now,reservation});
 try{
  check();
  for(const [contract,pub,snap] of [
   ['LSK-USDT','PUB:09dbffbbc4bf91de7cceb613dfd6fd7d4f24b2a9','S392:LSK-USDT:1791246942756'],
   ['NEAR-USDT','PUB:e28fade05318939a27247f95ef78fa0ff7e8b5a6','S392:NEAR-USDT:1791246903684']
  ]){
   const row=await db.prepare('SELECT publication_id,contract_code,run_id,snapshot_id,observed_ts,canonical_state,canonical_json,manual_text,telegram_text,presentation_hash FROM canonical_publication_shadow WHERE publication_id=?1 LIMIT 1').bind(pub).first();check();
   if(!row||row.contract_code!==contract||row.run_id!==run||row.snapshot_id!==snap)throw Error('EXACT_CANONICAL_BINDING_FAILED');
   const canonical=JSON.parse(row.canonical_json);
   const tape=await db.prepare('SELECT source,asset_key,observed_ts,expires_ts,payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 LIMIT 1').bind('HTX_SIGNED_RAW_TAPE',contract).first();check();
   out.rows.push({...row,canonical_json:undefined,canonical,tape:tape?{...tape,payload_json:undefined,ring:JSON.parse(tape.payload_json)}:null});
  }
  out.status='EXACT_CURRENT_PUBLIC_DATA_READ';
 }catch(e){out.status='READBACK_FAILED';out.error=String(e.message).slice(0,180);}
 finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else out.status='D1_ADMISSION_BLOCKED';
out.d1_usage=db.usageSnapshot();
await fs.mkdir('audit-output',{recursive:true});
const bytes=Buffer.from(JSON.stringify(out)),gz=gzipSync(bytes,{mtime:0});
await fs.writeFile('audit-output/exact-current-data.json.gz',gz);
const summary={...out,rows:out.rows.map(r=>({contract_code:r.contract_code,publication_id:r.publication_id,run_id:r.run_id,snapshot_id:r.snapshot_id,canonical_state:r.canonical_state,canonical_keys:Object.keys(r.canonical),tape_minutes:r.tape?.ring?.minutes?.length??null,tape_observed_ts:r.tape?.observed_ts??null})),json_sha256:createHash('sha256').update(bytes).digest('hex'),gzip_sha256:createHash('sha256').update(gz).digest('hex')};
await fs.writeFile('audit-output/readback-summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));if(out.status!=='EXACT_CURRENT_PUBLIC_DATA_READ')process.exitCode=1;
