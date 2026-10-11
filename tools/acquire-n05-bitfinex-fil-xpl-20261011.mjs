import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import * as guard from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {readEvidenceSourceCache,reserveEvidenceSourceAttempts,writeEvidenceSourceCache} from '../current-generation/files/src/evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from '../current-generation/files/src/provider-minute-ledger.mjs';

const repo='kovalev23091987-jpg/my-report-2-cloud-runner',source='N05_OFFICIAL_FLOW:BITFINEX',provider='BITFINEX',cap=16;
const root='audit-output/n05-bitfinex-fil-xpl',reservation={rows_read:12000,rows_written:400},hash=b=>createHash('sha256').update(b).digest('hex');

const plan={schema:'N05_BITFINEX_FIL_XPL_WINDOW_PLAN_V1',maximum_assets:2,maximum_source_HTTP:4,source_cap:16,provider_minute_cap:6,whole_job_background_cap:28,D1_reservation:reservation,caps_changed:false,qualification_only:true,retained_catalog_run:38138499328};
if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));process.exit(0);}
for(const n of ['GITHUB_RUN_ID','GITHUB_SHA','GITHUB_TOKEN','REPORT2_D1_BRIDGE_URL','REPORT2_D1_BRIDGE_TOKEN','REPORT2_EXPECTED_MAIN','REPORT2_EXPECTED_LEASE_OWNER'])if(!process.env[n])throw Error(n+'_REQUIRED');
if(process.env.GITHUB_REPOSITORY!==repo)throw Error('EXACT_REPOSITORY_REQUIRED');
const api=async path=>{const r=await fetch('https://api.github.com/repos/'+repo+'/'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('GITHUB_CONTROL_READ_'+r.status);return r.json();};
const main=(await api('git/ref/heads/main')).object.sha;if(main!==process.env.REPORT2_EXPECTED_MAIN)throw Error('MAIN_MOVED');
const read=async path=>JSON.parse(Buffer.from((await api('contents/'+path+'?ref='+main)).content,'base64').toString());
const phase=await read('checkpoints/CLOUD_PHASE_STATE_20261004.json'),fence=await read('audit-fixes/source-optimization-20260930/execution-lock.json');
if(phase.lease?.owner!==process.env.REPORT2_EXPECTED_LEASE_OWNER||phase.lease.expires_ts<=Date.now()||fence.active)throw Error('OWNER_OR_FENCE_BLOCKED');
const htxPath='checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz',htxBytes=await fs.readFile(htxPath);
if(hash(htxBytes)!=='f662bdb1562bce5c19a3b7df96978b2fe27264ff271121d12d0f44b5ee94497c')throw Error('ORIGINAL_HTX_IDENTITY_HASH');
const htx=JSON.parse(gunzipSync(htxBytes)).data,run=process.env.GITHUB_RUN_ID,now=Date.now(),id='N05_BITFINEX_FIL_XPL:'+run+':'+process.env.GITHUB_RUN_ATTEMPT;
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget();
const out={...plan,schema:'N05_BITFINEX_FIL_XPL_ORIGINAL_ACTUAL_V1',run,head:process.env.GITHUB_SHA,main,lease_owner:phase.lease.owner,original_HTX_identity_file:htxPath,original_HTX_identity_sha256:hash(htxBytes),started_ts:now,status:'NOT_ADMITTED',sourceHTTP:0,sources:[],assets:[],MAIN:0,Telegram:0,score:0,N05_complete:false};
await fs.mkdir(root,{recursive:true});let admitted=false;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function acquire(name,url){const receipt={name,url,source,status:'NOT_ATTEMPTED',actual_http:0};out.sources.push(receipt);try{
 if(!guard.evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:22}).allowed)throw Error('D1_HEADROOM_DENIED');
 if(await readEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:BITFINEX',asset_key:'SHARED',now:Date.now()}))throw Error('DURABLE_VENUE_BACKOFF');
 const requestId=id+':'+name;let minute;for(let i=0;i<8;i++){minute=await reserveProviderMinuteUnits(db,{provider,reservation_id:requestId,units:1,cap:6,now:Date.now()});if(minute.allowed||minute.status!=='ROLLING_60S_CAP_REACHED')break;await sleep(10000);}receipt.minute_admission=minute;if(!minute.allowed)throw Error(minute.status);
 const whole=budget.reserve({logical_request_id:requestId,lane:'background',attempts:1});receipt.whole_admission=whole;if(!whole.allowed||whole.duplicate)throw Error('WHOLE_JOB_HTTP_DENIED');
 const daily=await reserveEvidenceSourceAttempts(db,{source,reservation_id:requestId,attempts:1,daily_cap:cap,now:Date.now()});receipt.daily_admission=daily;if(!daily.allowed)throw Error('SOURCE_DAILY_CAP_DENIED');
 receipt.actual_http=1;receipt.attempt_ts=Date.now();out.sourceHTTP++;const response=await fetch(url,{headers:{accept:'application/json','user-agent':'MY_REPORT_2_N05_SOURCE_QUALIFICATION'},redirect:'manual',signal:AbortSignal.timeout(15000)}),chunks=[];let size=0;receipt.http_status=response.status;
 for await(const c of response.body){size+=c.length;if(size>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(c);}const bytes=Buffer.concat(chunks),gz=gzipSync(bytes);receipt.received_ts=Date.now();receipt.body_sha256=hash(bytes);receipt.gzip_sha256=hash(gz);receipt.bytes=size;receipt.file=name+'.json.gz';await fs.writeFile(root+'/'+receipt.file,gz);
 if([401,403,429,451].includes(response.status)){const retry=response.headers.get('retry-after'),seconds=/^\d+$/.test(retry||'')?Number(retry):0;await writeEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:BITFINEX',asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:response.status,original_received_ts:receipt.received_ts}});}
 if(response.status!==200)throw Error('HTTP_'+response.status);receipt.status='RECEIVED_NOT_QUALIFIED';return JSON.parse(bytes);
}catch(e){receipt.status=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;receipt.received_ts??=Date.now();return null;}}
try{
 out.daily_admission=guard.evaluateDailyReservationBudget({daily:await guard.loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');
 await guard.reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 const counter=await db.prepare('SELECT attempts FROM report2_evidence_source_daily WHERE source=?1 AND day_utc=?2 LIMIT 1').bind(source,new Date(Date.now()).toISOString().slice(0,10)).first();const used=counter==null?0:Number(counter.attempts);if(!Number.isSafeInteger(used)||used<0)throw Error('UNKNOWN_SOURCE_COUNTER');out.source_preflight={used,required:4,cap,remaining:cap-used,allowed:cap-used>=4};if(cap-used<4)throw Error('ENTIRE_FIL_XPL_SOURCE_HEADROOM_REQUIRED');
 const catalogPath='checkpoints/n05-bitfinex-pilot-38138499328/BITFINEX-CURRENT-CATALOG.json.gz',catalogBytes=await fs.readFile(catalogPath);
 if(hash(catalogBytes)!=='d67c9a7951a45edff51a770bac05f00efc6fc01b02a11d557d003ad04e8e3e53')throw Error('RETAINED_CATALOG_HASH_MISMATCH');
 const conf=JSON.parse(gunzipSync(catalogBytes));if(!Array.isArray(conf)||conf.length!==4)throw Error('CURRENT_BITFINEX_CATALOG_REQUIRED');
 const pairs=new Set(conf[0]),symbols=new Map(conf[1]),labels=new Map(conf[2]);
 const targets=[{symbol:'FIL',market:'FILUSD',api:'FIL',label:'Filecoin',htx:'fil',network:'filecoin',official_network_reference:'https://support.bitfinex.com/hc/en-us/articles/900003214926-Filecoin-FIL'},{symbol:'XPL',market:'XPLUSD',api:'XPL',label:'Plasma',htx:'xpl',network:'plasma',official_network_reference:'https://support.bitfinex.com/hc/en-us/articles/51038467350937-Plasma-XPL'}];
 const end=Math.floor(Date.now()/60000)*60000,start=end-14400000;out.window_start_ts=start;out.window_end_ts=end;out.retained_catalog={path:catalogPath,gzip_sha256:hash(catalogBytes)};
 for(const x of targets){
  const htxRows=htx.filter(r=>String(r.currency).toUpperCase()===x.symbol),native=htxRows.flatMap(r=>r.chains||[]).filter(c=>c.chainType===0&&c.chain===x.htx),otherNative=htxRows.flatMap(r=>r.chains||[]).filter(c=>c.chainType===0&&c.chain!==x.htx);
  const entry={...x,exact_original_HTX_native:native.length===1&&otherNative.length===0,official_current_pair:pairs.has(x.market),official_symbol_mapping:x.api===x.symbol||symbols.get(x.api)===x.symbol,official_label:labels.get(x.api),status:'NOT_QUALIFIED'};out.assets.push(entry);
  if(!entry.exact_original_HTX_native||!entry.official_current_pair||!entry.official_symbol_mapping||entry.official_label!==x.label){entry.status='EXACT_CURRENT_BINDING_MISSING';continue;}
  const candles=await acquire('BITFINEX-'+x.symbol+'-CANDLES1M',`https://api-pub.bitfinex.com/v2/candles/trade:1m:t${x.market}/hist?start=${start}&end=${end-1}&limit=240&sort=1`);
  const trades=await acquire('BITFINEX-'+x.symbol+'-TRADES10000',`https://api-pub.bitfinex.com/v2/trades/t${x.market}/hist?start=${start}&end=${end-1}&limit=10000&sort=1`);
  entry.candle_rows=Array.isArray(candles)?candles.length:null;entry.trade_rows=Array.isArray(trades)?trades.length:null;entry.trade_oldest_ts=Array.isArray(trades)&&trades.length?Math.min(...trades.map(r=>r[1])):null;entry.trade_newest_ts=Array.isArray(trades)&&trades.length?Math.max(...trades.map(r=>r[1])):null;entry.status=Array.isArray(candles)&&Array.isArray(trades)?'ORIGINAL_WINDOW_RETAINED_NOT_RECONCILED':'WINDOW_RESPONSE_NOT_RECEIVED';
 }
 out.status='BITFINEX_FIL_XPL_ORIGINAL_WINDOW_RETAINED_NOT_QUALIFIED';
}catch(e){out.status='PILOT_NOT_CLOSED';out.reason=e.message;}
finally{out.http_budget=budget.summary();if(admitted)out.finalized_usage=await guard.finalizeRunUsage(db,{reservationId:id,sourceRunId:run,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';out.completed_ts=Date.now();await fs.writeFile(root+'/batch-summary.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,sourceHTTP:out.sourceHTTP,catalog_shapes:out.catalog_shapes,D1:out.D1}));}
