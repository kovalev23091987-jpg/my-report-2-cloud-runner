import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {reserveEvidenceSourceAttempts} from '../current-generation/files/src/evidence-source-store.mjs';
import {auditRetainedHtxHistoryCoverage} from '../runner/retained102-history-gap-census.mjs';
import {planHtxColdHistoryBackfill} from '../runner/htx-cold-history-backfill-plan.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const root='audit-output/htx-cold-history-actual',started=Date.now();
const run='HTX_COLD_HISTORY_ACQUISITION:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const reservation={rows_read:500,rows_written:32};
const budget=createUnifiedHttpBudget();
const result={schema:'HTX_COLD_HISTORY_ACTUAL_ACQUISITION_20261010_V1',run_id:run,head:process.env.GITHUB_SHA,
  cloud_run:Number(process.env.GITHUB_RUN_ID),observed_ts:started,source:'HTX_DELAYED_KLINE_ARCHIVE_QUALIFICATION',
  source_daily_cap:6,source_http_reserved:0,sourceHTTP:0,D1:null,MAIN:0,Telegram:0,
  source_clocks_refreshed:false,entry_samples_created:0,actual_ENTRY:false,project_complete:false,
  scope:'HISTORICAL_ARCHIVE_BYTES_ONLY_NO_FRESH_MARKET_DECISION',archives:[]};
await fs.mkdir(root,{recursive:true});
let db,reserved=false;
async function getExact(url,file,maxBytes) {
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.hostname!=='futures.htx.com'||!parsed.pathname.startsWith('/data/historical_data/futures/daily/klines/'))
    throw Error('UNAPPROVED_OFFICIAL_ARCHIVE_URL');
  const grant=budget.reserve({logical_request_id:run+':'+file,lane:'statistics',attempts:1});
  if(!grant.allowed||grant.duplicate)throw Error('GLOBAL_STATISTICS_HTTP_BUDGET_BLOCKED');
  result.sourceHTTP++;
  const at=Date.now(),receipt={url,requested_at:at,file,source_time_authority:false};
  try{
    const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(16000)});
    receipt.status=response.status;receipt.received_at=Date.now();
    receipt.content_type=response.headers.get('content-type');receipt.server_date=response.headers.get('date');
    if(!response.ok){receipt.reason='HTTP_'+response.status;return {receipt,bytes:null};}
    if(!response.body){receipt.reason='EMPTY_RESPONSE_BODY';return {receipt,bytes:null};}
    const chunks=[];let n=0;
    for await(const c of response.body){n+=c.length;if(n>maxBytes)throw Error('BOUNDED_ARCHIVE_BYTES_EXCEEDED');chunks.push(c);}
    const bytes=Buffer.concat(chunks);receipt.bytes=bytes.length;receipt.sha256=sha(bytes);
    return {receipt,bytes};
  }catch(e){receipt.received_at=Date.now();receipt.reason=/^(TimeoutError|AbortError)$/.test(e.name)?'NETWORK_TIMEOUT':String(e.message).slice(0,100);return {receipt,bytes:null};}
}
try {
  const universe=JSON.parse(gunzipSync(await fs.readFile('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz')));
  const sampled=JSON.parse(await fs.readFile('checkpoints/APPROVED102_ORIGINAL24H_ASSEMBLED_READER_REPLAY_20261009.json'));
  const native=JSON.parse(await fs.readFile('checkpoints/NATIVE_FULL_DAY_PRICE_HISTORY_CONNECTED_20261009.json'));
  const binance=JSON.parse(await fs.readFile('checkpoints/MONTHLY_COLD_PRICE_HISTORY_CONNECTED_20261009.json'));
  const census=auditRetainedHtxHistoryCoverage({universe,sampled,native,binance});
  const verified=[{contract:native.prices.contract,archive_day:native.prices.day,status:'CLOSED_PRICE_HISTORY'}];
  const plan=planHtxColdHistoryBackfill({census,window_end_day:native.prices.day,window_days:30,verified,source_http_reservation:6});
  if(plan.status!=='BOUNDED_ACQUISITION_PLAN_CLOSED'||plan.planned_slots!==3||plan.planned_source_http!==6||
    plan.planned.some(p=>p.contract==='NEAR-USDT'))throw Error('EXACT_102_CENSUS_AND_BOUNDED_THREE_ARCHIVE_PLAN_REQUIRED');
  result.plan={window_end_day:plan.window_end_day,window_days:30,assets:102,verified_slots:1,
    planned:plan.planned.map(({contract,archive_day,archive_key})=>({contract,archive_day,archive_key}))};
  db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
  result.day_admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,started),
    nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
  if(!result.day_admission.allowed)throw Error('D1_DAILY_ADMISSION_'+result.day_admission.status);
  await reserveRunBudget(db,{reservationId:run,now:started,reservation});reserved=true;
  result.source_admission=await reserveEvidenceSourceAttempts(db,{source:result.source,reservation_id:run,
    attempts:6,daily_cap:6,now:started});
  if(!result.source_admission.allowed)throw Error('EXISTING_HTX_SOURCE_DAILY_CAP_'+result.source_admission.status);
  result.source_http_reserved=6;
  for(const p of plan.planned){
    const row={contract:p.contract,archive_day:p.archive_day,archive_key:p.archive_key,
      status:'NOT_VERIFIED',receipts:[],price_qualified:false,volume_qualified:false};
    result.archives.push(row);
    const folder=path.join(root,p.contract,p.archive_day);
    await fs.mkdir(folder,{recursive:true});
    const ck=await getExact(p.checksum_url,p.contract+':'+p.archive_day+':checksum',4096);
    row.receipts.push(ck.receipt);
    if(!ck.bytes){row.status='CHECKSUM_UNAVAILABLE';continue;}
    const expected=ck.bytes.toString('utf8').trim().match(/^([a-f0-9]{64})\s+\*?([^\s]+\.zip)$/);
    if(!expected||expected[2]!==path.basename(p.archive_key)){row.status='INVALID_OFFICIAL_CHECKSUM';continue;}
    await fs.writeFile(path.join(folder,'archive.zip.CHECKSUM'),ck.bytes);
    const zip=await getExact(p.archive_url,p.contract+':'+p.archive_day+':zip',8*1024*1024);
    row.receipts.push(zip.receipt);
    if(!zip.bytes){row.status='ZIP_UNAVAILABLE';continue;}
    await fs.writeFile(path.join(folder,'archive.zip'),zip.bytes);
    if(sha(zip.bytes)!==expected[1]){row.status='CHECKSUM_MISMATCH';continue;}
    row.archive_sha256=sha(zip.bytes);
    try {
      const stdout=execFileSync('python3',['tools/validate-htx-native-zip.py',
        path.join(folder,'archive.zip'),p.contract,p.archive_day],{encoding:'utf8',timeout:15000});
      row.structural=JSON.parse(stdout);row.status='CHECKSUM_AND_1440_MINUTE_GRID_VERIFIED_PRICE_API_NOT_CROSSCHECKED';
      row.verified_archive_bytes=true;
    }catch(e){row.status='NATIVE_CSV_STRUCTURE_NOT_CLOSED';row.reason=String(e.stderr||e.message).slice(0,240);}
  }
  result.status='BOUNDED_ACTUAL_SOURCE_ATTEMPTS_COMPLETED';
}catch(e){result.status='ACQUISITION_NOT_CLOSED';result.reason=String(e.message).slice(0,200);}
finally{
  result.http_budget=budget.summary();
  if(db){
    const measured=db.usageSnapshot();result.D1=measured;
    if(reserved){
      try{result.finalized_usage=await finalizeRunUsage(db,{reservationId:run,sourceRunId:process.env.GITHUB_RUN_ID,usage:measured});}
      catch(e){result.status='D1_FINALIZATION_NOT_CLOSED';result.finalize_reason=String(e.message).slice(0,180);}
    }
    if(measured.unknown_ops||measured.rows_read>reservation.rows_read||measured.rows_written>reservation.rows_written){
      result.status='D1_USAGE_BOUND_NOT_CLOSED';result.reason='D1_USAGE_UNKNOWN_OR_ABOVE_RESERVATION';
    }
  }
  result.verified_archive_count=result.archives.filter(x=>x.verified_archive_bytes===true).length;
  result.complete_30d_102_assets=false;result.complete_90d_102_assets=false;
  await fs.writeFile(path.join(root,'actual-acquisition.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,reason:result.reason,planned:result.plan?.planned.length,
    sourceHTTP:result.sourceHTTP,reserved:result.source_http_reserved,verified_archives:result.verified_archive_count,
    D1:result.D1,project_complete:false}));
  if(result.status==='D1_USAGE_BOUND_NOT_CLOSED'||result.status==='D1_FINALIZATION_NOT_CLOSED')process.exitCode=1;
}
