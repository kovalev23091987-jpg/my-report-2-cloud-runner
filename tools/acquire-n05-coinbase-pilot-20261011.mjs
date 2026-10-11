import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import * as guard from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {readEvidenceSourceCache,reserveEvidenceSourceAttempts,writeEvidenceSourceCache} from '../current-generation/files/src/evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from '../current-generation/files/src/provider-minute-ledger.mjs';

const repository='kovalev23091987-jpg/my-report-2-cloud-runner';
const source='N05_OFFICIAL_FLOW:COINBASE',cap=16,provider='COINBASE_EXCHANGE';
const root='audit-output/n05-coinbase-pilot',reservation={rows_read:12000,rows_written:400};
const candidates={DASH:{htx:'dash1',network:'dash',name:'Dash'},FIL:{htx:'fil',network:'filecoin',name:'Filecoin'},TAO:{htx:'bitao',network:'bittensor',name:'Bittensor'}};
const digest=b=>createHash('sha256').update(b).digest('hex');
const proposal={schema:'N05_COINBASE_NEW_INDEPENDENT_VENUE_PILOT_PLAN_V1',assets:Object.keys(candidates),maximum_source_HTTP:14,source_cap:cap,provider_minute_cap:6,whole_job_background_cap:28,D1_reservation:reservation,caps_changed:false,requires_current_owned_lease:true,qualification_only:true};
if(process.argv.includes('--plan')){console.log(JSON.stringify(proposal,null,2));process.exit(0);}
for(const name of ['GITHUB_RUN_ID','GITHUB_SHA','GITHUB_TOKEN','REPORT2_D1_BRIDGE_URL','REPORT2_D1_BRIDGE_TOKEN','REPORT2_EXPECTED_MAIN','REPORT2_EXPECTED_LEASE_OWNER'])if(!process.env[name])throw Error(name+'_REQUIRED');
if(process.env.GITHUB_REPOSITORY!==repository)throw Error('EXACT_REPOSITORY_REQUIRED');
const api=async path=>{const r=await fetch('https://api.github.com/repos/'+repository+'/'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('GITHUB_CONTROL_READ_'+r.status);return r.json();};
const main=(await api('git/ref/heads/main')).object.sha;
if(main!==process.env.REPORT2_EXPECTED_MAIN)throw Error('MAIN_MOVED');
const read=async path=>JSON.parse(Buffer.from((await api('contents/'+path+'?ref='+main)).content,'base64').toString());
const phase=await read('checkpoints/CLOUD_PHASE_STATE_20261004.json'),fence=await read('audit-fixes/source-optimization-20260930/execution-lock.json');
if(phase.lease?.owner!==process.env.REPORT2_EXPECTED_LEASE_OWNER||phase.lease.expires_ts<=Date.now()||fence.active)throw Error('OWNER_OR_FENCE_BLOCKED');
const originalPath='checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz',originalBytes=await fs.readFile(originalPath);
if(digest(originalBytes)!=='f662bdb1562bce5c19a3b7df96978b2fe27264ff271121d12d0f44b5ee94497c')throw Error('ORIGINAL_HTX_IDENTITY_HASH_MISMATCH');
const original=JSON.parse(gunzipSync(originalBytes));
const now=Date.now(),run=process.env.GITHUB_RUN_ID,id='N05_COINBASE_PILOT:'+run+':'+process.env.GITHUB_RUN_ATTEMPT;
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget();
const out={...proposal,schema:'N05_COINBASE_NEW_INDEPENDENT_VENUE_PILOT_ACTUAL_V1',run,head:process.env.GITHUB_SHA,main,lease_owner:phase.lease.owner,original_HTX_identity_file:originalPath,original_HTX_identity_sha256:digest(originalBytes),started_ts:now,status:'NOT_ADMITTED',sourceHTTP:0,sources:[],candidates:[],MAIN:0,Telegram:0,score:0,new_fresh_SENT:false,N05_complete:false};
await fs.mkdir(root,{recursive:true});let admitted=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function acquire(name,url){
 const receipt={name,url,source,status:'NOT_ATTEMPTED',actual_http:0};out.sources.push(receipt);
 try{
  if(!guard.evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:22}).allowed)throw Error('D1_HEADROOM_DENIED');
  if(await readEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:COINBASE_EXCHANGE',asset_key:'SHARED',now:Date.now()}))throw Error('DURABLE_VENUE_BACKOFF');
  const requestId=id+':'+name;let minute;
  for(let i=0;i<8;i++){minute=await reserveProviderMinuteUnits(db,{provider,reservation_id:requestId,units:1,cap:6,now:Date.now()});if(minute.allowed||minute.status!=='ROLLING_60S_CAP_REACHED')break;await sleep(10000);}
  receipt.minute_admission=minute;if(!minute.allowed)throw Error(minute.status);
  const whole=budget.reserve({logical_request_id:requestId,lane:'background',attempts:1});receipt.whole_admission=whole;if(!whole.allowed||whole.duplicate)throw Error('WHOLE_JOB_HTTP_DENIED');
  const daily=await reserveEvidenceSourceAttempts(db,{source,reservation_id:requestId,attempts:1,daily_cap:cap,now:Date.now()});receipt.daily_admission=daily;if(!daily.allowed)throw Error('SOURCE_DAILY_CAP_DENIED');
  receipt.actual_http=1;receipt.attempt_ts=Date.now();out.sourceHTTP++;
  const response=await fetch(url,{headers:{accept:'application/json','user-agent':'MY_REPORT_2_N05_SOURCE_QUALIFICATION'},redirect:'manual',signal:AbortSignal.timeout(15000)}),chunks=[];let size=0;receipt.http_status=response.status;
  for await(const c of response.body){size+=c.length;if(size>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(c);}
  const bytes=Buffer.concat(chunks),gz=gzipSync(bytes);receipt.received_ts=Date.now();receipt.body_sha256=digest(bytes);receipt.gzip_sha256=digest(gz);receipt.bytes=size;receipt.file=name+'.json.gz';receipt.cb_after=response.headers.get('cb-after');await fs.writeFile(root+'/'+receipt.file,gz);
  if([401,403,429,451].includes(response.status)){const retry=response.headers.get('retry-after'),seconds=/^\d+$/.test(retry||'')?Number(retry):0;await writeEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:COINBASE_EXCHANGE',asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:response.status,original_received_ts:receipt.received_ts}});}
  if(response.status!==200)throw Error('HTTP_'+response.status);
  receipt.status='RECEIVED_NOT_QUALIFIED';return{body:JSON.parse(bytes),receipt};
 }catch(e){receipt.status=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;receipt.received_ts??=Date.now();return null;}
}
try{
 out.daily_admission=guard.evaluateDailyReservationBudget({daily:await guard.loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
 if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');
 await guard.reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 const counter=await db.prepare('SELECT attempts FROM report2_evidence_source_daily WHERE source=?1 AND day_utc=?2 LIMIT 1').bind(source,new Date(Date.now()).toISOString().slice(0,10)).first();
 const used=counter==null?0:Number(counter.attempts);if(!Number.isSafeInteger(used)||used<0)throw Error('UNKNOWN_SOURCE_COUNTER');
 out.source_preflight={used,required:14,cap,remaining:cap-used,allowed:cap-used>=14};if(cap-used<14)throw Error('ENTIRE_PILOT_SOURCE_HEADROOM_REQUIRED');
 const products=await acquire('COINBASE-CURRENT-PRODUCTS','https://api.exchange.coinbase.com/products');
 const currencies=await acquire('COINBASE-CURRENT-CURRENCIES','https://api.exchange.coinbase.com/currencies');
 if(!Array.isArray(products?.body)||!Array.isArray(currencies?.body))throw Error('CURRENT_COINBASE_CATALOG_REQUIRED');
 const end=Math.floor(Date.now()/60000)*60000,start=end-14400000;out.window_end_ts=end;out.window_start_ts=start;
 for(const [symbol,expected] of Object.entries(candidates)){
  const contract=symbol+'-USDT',htx=original.data.filter(x=>String(x.currency).toUpperCase()===symbol),native=htx.flatMap(x=>x.chains||[]).filter(x=>x.chainType===0&&x.chain===expected.htx),foreign=htx.flatMap(x=>x.chains||[]).filter(x=>x.chainType===0&&x.chain!==expected.htx);
  const market=products.body.filter(x=>x.id===symbol+'-USD'&&x.base_currency===symbol&&x.quote_currency==='USD'&&x.status==='online'&&x.trading_disabled===false),currency=currencies.body.filter(x=>x.id===symbol&&x.name===expected.name&&x.status==='online'&&x.default_network===expected.network&&x.supported_networks?.some(n=>n.id===expected.network&&n.status==='online'&&!n.contract_address));
  const r={symbol,contract,coinbase_product:symbol+'-USD',htx_native_alias:expected.htx,coinbase_native_network:expected.network,exact_primary_identity:native.length===1&&foreign.length===0&&market.length===1&&currency.length===1,status:'NO_EXACT_CURRENT_PRIMARY_BINDING',window_start_ts:start,window_end_ts:end,pages:[],full_240min_proven:false};out.candidates.push(r);
  if(!r.exact_primary_identity)continue;
  if(Date.now()-end>300000){r.status='ANCHOR_AGED_DURING_BATCH';continue;}
  const base='https://api.exchange.coinbase.com/products/'+symbol+'-USD';
  const candles=await acquire('COINBASE-'+symbol+'-CANDLES240',base+'/candles?granularity=60&start='+encodeURIComponent(new Date(start).toISOString())+'&end='+encodeURIComponent(new Date(end).toISOString()));
  if(!candles){r.status=out.sources.at(-1).status;continue;}
  r.candle_rows=Array.isArray(candles.body)?candles.body.length:null;
  let cursor=null;
  for(let i=0;i<3;i++){
   const q='?limit=1000'+(cursor?'&after='+encodeURIComponent(cursor):'');
   const page=await acquire('COINBASE-'+symbol+'-TRADES-'+(i+1),base+'/trades'+q);
   if(!page){r.status=out.sources.at(-1).status;break;}
   const rows=page.body;r.pages.push({file:page.receipt.file,count:Array.isArray(rows)?rows.length:null,newest_ts:Array.isArray(rows)&&rows.length?Date.parse(rows[0].time):null,oldest_ts:Array.isArray(rows)&&rows.length?Date.parse(rows.at(-1).time):null,cb_after:page.receipt.cb_after});
   if(!Array.isArray(rows)||!rows.length){r.status='INVALID_OR_EMPTY_TRADE_PAGE';break;}
   if(Date.parse(rows.at(-1).time)<start){r.status='RAW_TRADE_PAGES_REACH_WINDOW_START;CANDLE_RECONCILIATION_PENDING';break;}
   cursor=page.receipt.cb_after;if(!/^\d+$/.test(cursor||'')){r.status='PAGINATION_CURSOR_MISSING';break;}
   r.status='RAW_TRADE_PAGINATION_PARTIAL';
  }
 }
 out.status='COINBASE_ORIGINAL_CATALOG_AND_PER_ASSET_PILOT_RETAINED_NOT_QUALIFIED';
}catch(e){out.status='PILOT_NOT_CLOSED';out.reason=e.message;}
finally{
 out.http_budget=budget.summary();if(admitted)out.finalized_usage=await guard.finalizeRunUsage(db,{reservationId:id,sourceRunId:run,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();
 if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';
 out.completed_ts=Date.now();await fs.writeFile(root+'/batch-summary.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,sourceHTTP:out.sourceHTTP,candidates:out.candidates.map(x=>({symbol:x.symbol,status:x.status,pages:x.pages.length})),D1:out.D1}));
}
