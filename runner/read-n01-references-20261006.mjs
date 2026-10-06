import fs from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from './report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from './d1-preaction-budget-guard.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const now=Date.now(),id='EXACT_N01_REFERENCES:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT,reservation={rows_read:500,rows_written:16};
const out={schema:'report2-actual-n01-shared-reference-readback-v1',head:process.env.GITHUB_SHA,read_ts:now,sourceHTTP:0,MAIN:0,Telegram:0,source_writes:0,references:[]};
const check=()=>{const u=db.usageSnapshot();if(u.unknown_ops!==0||u.rows_read>450||u.rows_written>14||u.requests>12)throw Error('BOUNDED_D1_USAGE_EXCEEDED');};
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){
 await reserveRunBudget(db,{reservationId:id,now,reservation});
 try{
  for(const spec of [
   {contract:'牛来-USDT',url:'https://api.coingecko.com/api/v3/coins/binance-smart-chain/contract/0xbeea1d618e533a387d941f58a7d4c9b7bd377777',body_sha256:'eb25a1c6f6323caa3bc233f93f6f2304bb0489a9cd475c1c7050491cec8cd5b1',decision_ts:1791249991536},
   {contract:'OKB-USDT',url:'https://api.coingecko.com/api/v3/coins/ethereum/contract/0x75231f58b43240c9718dd58b4967c5114342a86c',body_sha256:'bb313a0b4a0a34cdd106a3056d8288a2542581c5dab82c9bc17079a9369dadb7',decision_ts:1791249930855}
  ]){
   const key='REFERENCE:provider-reference-cache-v1-20261004:'+hash(spec.url);
   const row=await db.prepare('SELECT source,asset_key,observed_ts,expires_ts,payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 LIMIT 1').bind('COINGECKO_SECTOR',key).first();check();
   if(!row)throw Error('EXACT_ORIGINAL_REFERENCE_NOT_RETAINED');
   const payload=JSON.parse(row.payload_json);
   if(payload.version!=='provider-reference-cache-v1-20261004'||payload.url!==spec.url||typeof payload.body!=='string'||Buffer.byteLength(payload.body)>2000000||hash(payload.body)!==spec.body_sha256||payload.body_sha256!==spec.body_sha256||payload.received_ts>spec.decision_ts)throw Error('ORIGINAL_REFERENCE_HASH_OR_CLOCK_MISMATCH');
   out.references.push({...spec,...row,payload_json:undefined,payload});
  }
  out.status='EXACT_ORIGINAL_REFERENCES_READ';
 }catch(e){out.status='READBACK_FAILED';out.error=String(e.message).slice(0,180);}
 finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else out.status='D1_ADMISSION_BLOCKED';
out.d1_usage=db.usageSnapshot();await fs.mkdir('audit-output',{recursive:true});
const bytes=Buffer.from(JSON.stringify(out)),gz=gzipSync(bytes,{mtime:0});
await fs.writeFile('audit-output/actual-shared-reference-data.json.gz',gz);
const summary={...out,references:out.references.map(({payload,...r})=>({...r,received_ts:payload.received_ts,body_bytes:Buffer.byteLength(payload.body)})),json_sha256:hash(bytes),gzip_sha256:hash(gz)};
await fs.writeFile('audit-output/readback-summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));if(out.status!=='EXACT_ORIGINAL_REFERENCES_READ')process.exitCode=1;
