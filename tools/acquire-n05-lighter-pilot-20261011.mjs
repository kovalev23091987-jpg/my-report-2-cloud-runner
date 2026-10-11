import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import * as guard from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {readEvidenceSourceCache,reserveEvidenceSourceAttempts,writeEvidenceSourceCache} from '../current-generation/files/src/evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from '../current-generation/files/src/provider-minute-ledger.mjs';

const repo='kovalev23091987-jpg/my-report-2-cloud-runner',source='N05_OFFICIAL_FLOW:LIGHTER',provider='LIGHTER',cap=16;
const root='audit-output/n05-lighter-pilot',reservation={rows_read:6000,rows_written:250},hash=b=>createHash('sha256').update(b).digest('hex');
const plan={schema:'N05_LIGHTER_NEW_VENUE_PILOT_PLAN_V1',asset:'DASH',market_id:127,maximum_source_HTTP:4,source_cap:cap,provider_minute_cap:6,whole_job_background_cap:28,D1_reservation:reservation,caps_changed:false,qualification_only:true};
if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));process.exit(0);}
for(const n of ['GITHUB_RUN_ID','GITHUB_SHA','GITHUB_TOKEN','REPORT2_D1_BRIDGE_URL','REPORT2_D1_BRIDGE_TOKEN','REPORT2_EXPECTED_MAIN','REPORT2_EXPECTED_LEASE_OWNER'])if(!process.env[n])throw Error(n+'_REQUIRED');
if(process.env.GITHUB_REPOSITORY!==repo)throw Error('EXACT_REPOSITORY_REQUIRED');
const api=async path=>{const r=await fetch('https://api.github.com/repos/'+repo+'/'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('GITHUB_CONTROL_READ_'+r.status);return r.json();};
const main=(await api('git/ref/heads/main')).object.sha;if(main!==process.env.REPORT2_EXPECTED_MAIN)throw Error('MAIN_MOVED');
const read=async path=>JSON.parse(Buffer.from((await api('contents/'+path+'?ref='+main)).content,'base64').toString());
const phase=await read('checkpoints/CLOUD_PHASE_STATE_20261004.json'),fence=await read('audit-fixes/source-optimization-20260930/execution-lock.json');
if(phase.lease?.owner!==process.env.REPORT2_EXPECTED_LEASE_OWNER||phase.lease.expires_ts<=Date.now()||fence.active)throw Error('OWNER_OR_FENCE_BLOCKED');
const run=process.env.GITHUB_RUN_ID,now=Date.now(),id='N05_LIGHTER_PILOT:'+run+':'+process.env.GITHUB_RUN_ATTEMPT;
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget();
const out={...plan,schema:'N05_LIGHTER_NEW_VENUE_PILOT_ACTUAL_V1',run,head:process.env.GITHUB_SHA,main,lease_owner:phase.lease.owner,started_ts:now,status:'NOT_ADMITTED',sourceHTTP:0,sources:[],MAIN:0,Telegram:0,score:0,N05_complete:false};
await fs.mkdir(root,{recursive:true});let admitted=false;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function acquire(name,path){const url='https://mainnet.zklighter.elliot.ai/api/v1/'+path,receipt={name,url,source,status:'NOT_ATTEMPTED',actual_http:0};out.sources.push(receipt);try{
 if(!guard.evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:22}).allowed)throw Error('D1_HEADROOM_DENIED');
 if(await readEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:LIGHTER',asset_key:'SHARED',now:Date.now()}))throw Error('DURABLE_VENUE_BACKOFF');
 const requestId=id+':'+name;let minute;for(let i=0;i<8;i++){minute=await reserveProviderMinuteUnits(db,{provider,reservation_id:requestId,units:1,cap:6,now:Date.now()});if(minute.allowed||minute.status!=='ROLLING_60S_CAP_REACHED')break;await sleep(10000);}receipt.minute_admission=minute;if(!minute.allowed)throw Error(minute.status);
 const whole=budget.reserve({logical_request_id:requestId,lane:'background',attempts:1});receipt.whole_admission=whole;if(!whole.allowed||whole.duplicate)throw Error('WHOLE_JOB_HTTP_DENIED');
 const daily=await reserveEvidenceSourceAttempts(db,{source,reservation_id:requestId,attempts:1,daily_cap:cap,now:Date.now()});receipt.daily_admission=daily;if(!daily.allowed)throw Error('SOURCE_DAILY_CAP_DENIED');
 receipt.actual_http=1;receipt.attempt_ts=Date.now();out.sourceHTTP++;const response=await fetch(url,{headers:{accept:'application/json','user-agent':'MY_REPORT_2_N05_SOURCE_QUALIFICATION'},redirect:'manual',signal:AbortSignal.timeout(15000)}),chunks=[];let size=0;receipt.http_status=response.status;
 for await(const c of response.body){size+=c.length;if(size>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(c);}const bytes=Buffer.concat(chunks),gz=gzipSync(bytes);receipt.received_ts=Date.now();receipt.body_sha256=hash(bytes);receipt.gzip_sha256=hash(gz);receipt.bytes=size;receipt.file=name+'.json.gz';await fs.writeFile(root+'/'+receipt.file,gz);
 if([401,403,429,451].includes(response.status)){const retry=response.headers.get('retry-after'),seconds=/^\d+$/.test(retry||'')?Number(retry):0;await writeEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:LIGHTER',asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:response.status,original_received_ts:receipt.received_ts}});}
 if(response.status!==200)throw Error('HTTP_'+response.status);receipt.status='RECEIVED_NOT_QUALIFIED';return JSON.parse(bytes);
}catch(e){receipt.status=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;receipt.received_ts??=Date.now();return null;}}
try{
 out.daily_admission=guard.evaluateDailyReservationBudget({daily:await guard.loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');
 await guard.reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 const counter=await db.prepare('SELECT attempts FROM report2_evidence_source_daily WHERE source=?1 AND day_utc=?2 LIMIT 1').bind(source,new Date(Date.now()).toISOString().slice(0,10)).first();const used=counter==null?0:Number(counter.attempts);if(!Number.isSafeInteger(used)||used<0)throw Error('UNKNOWN_SOURCE_COUNTER');out.source_preflight={used,required:4,cap,remaining:cap-used,allowed:cap-used>=4};if(cap-used<4)throw Error('ENTIRE_PILOT_SOURCE_HEADROOM_REQUIRED');
 const end=Math.floor(Date.now()/60000)*60000,start=end-14400000;out.window_start_ts=start;out.window_end_ts=end;
 const books=await acquire('LIGHTER-DASH-BOOK','orderBooks?market_id=127');
 const details=await acquire('LIGHTER-DASH-DETAILS','orderBookDetails?market_id=127');
 const candles=await acquire('LIGHTER-DASH-CANDLES1M',`candles?market_id=127&resolution=1m&start_timestamp=${start}&end_timestamp=${end}&count_back=0`);
 const trades=await acquire('LIGHTER-DASH-TRADES500','recentTrades?market_id=127&limit=500');
 out.book_match=Array.isArray(books?.order_books)?books.order_books.filter(x=>x.market_id===127&&x.symbol==='DASH'&&x.market_type==='perp'&&x.status==='active').length:0;
 out.details_top_keys=details&&typeof details==='object'?Object.keys(details):null;out.candles_top_keys=candles&&typeof candles==='object'?Object.keys(candles):null;out.trades_top_keys=trades&&typeof trades==='object'?Object.keys(trades):null;
 out.candle_rows=Array.isArray(candles?.candles)?candles.candles.length:null;out.trade_rows=Array.isArray(trades?.trades)?trades.trades.length:null;
 out.trade_oldest_ts=Array.isArray(trades?.trades)&&trades.trades.length?Math.min(...trades.trades.map(x=>Number(x.timestamp))):null;
 out.trade_newest_ts=Array.isArray(trades?.trades)&&trades.trades.length?Math.max(...trades.trades.map(x=>Number(x.timestamp))):null;
 out.status='ORIGINAL_LIGHTER_DASH_WINDOW_RETAINED_NOT_QUALIFIED';
}catch(e){out.status='PILOT_NOT_CLOSED';out.reason=e.message;}
finally{out.http_budget=budget.summary();if(admitted)out.finalized_usage=await guard.finalizeRunUsage(db,{reservationId:id,sourceRunId:run,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';out.completed_ts=Date.now();await fs.writeFile(root+'/batch-summary.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,sourceHTTP:out.sourceHTTP,book_match:out.book_match,candles:out.candle_rows,trades:out.trade_rows,oldest:out.trade_oldest_ts,window_start:out.window_start_ts,D1:out.D1}));}
