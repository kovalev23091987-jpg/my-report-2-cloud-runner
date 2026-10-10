import fs from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,evaluateWithinRunReservation,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from '../current-generation/files/src/evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from '../current-generation/files/src/provider-minute-ledger.mjs';
// Runtime pagination tests must pass before provider attempts.
const stage='remaining-exchanges',root='audit-output/n05-remaining-exchanges',hash=b=>createHash('sha256').update(b).digest('hex');
const universe=JSON.parse(gunzipSync(await fs.readFile('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz')));if(universe.assets.length!==102)throw Error('EXACT_UNIVERSE_REQUIRED');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),id=`N05_QUALIFICATION:${process.env.GITHUB_RUN_ID}:${stage}:${process.env.GITHUB_RUN_ATTEMPT}`,reservation={rows_read:16000,rows_written:500},budget=createUnifiedHttpBudget(),blocked=new Set();
const out={schema:'N05_REMAINING_EXCHANGE_QUALIFICATION_V1',stage,run:process.env.GITHUB_RUN_ID,head:process.env.GITHUB_SHA,started_ts:now,approved_assets:102,minimum_useful_assets:31,coverage_is_not_listing:true,sourceHTTP:0,sources:[],MAIN:0,Telegram:0,score_adjustment:0,production_enabled:false,new_fresh_SENT:false,project_complete:false};
await fs.mkdir(root,{recursive:true});let admitted=false;
async function get(name,venue,url,{method='GET',body=null,source=null,daily_cap=null}={}){
 const receipt={name,venue,url,method,received_ts:null,http_status:null,status:'NOT_ATTEMPTED',sourceHTTP:0,source_ts:null,retrieval_is_not_event_time:true};out.sources.push(receipt);
 if(true){const recent=out.sources.filter(r=>r.venue===venue&&r.sourceHTTP===1&&Date.now()-r.received_ts<60000);if(recent.length>=(venue==='GATE'?4:6)){const delay=Math.max(1,60050-(Date.now()-recent[0].received_ts));console.log(JSON.stringify({type:'PROVIDER_PACING',venue,delay_ms:delay}));await new Promise(r=>setTimeout(r,delay));}}
 const key=source||`N05_OFFICIAL_FLOW:${venue}`,cap=daily_cap??16;
 if(blocked.has(venue)){receipt.status='SHARED_VENUE_BACKOFF';return null;}
 try{
  if(!evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:22}).allowed)throw Error('D1_HEADROOM_DENIED');
  const old=await readEvidenceSourceCache(db,{source:`N05_PROVIDER_BACKOFF:${venue}`,asset_key:'SHARED',now:Date.now()});if(old){receipt.status='DURABLE_VENUE_BACKOFF';blocked.add(venue);return null;}
  const whole=budget.reserve({logical_request_id:id+':'+name,lane:'background',attempts:1});receipt.whole_admission=whole;if(!whole.allowed||whole.duplicate)throw Error('WHOLE_JOB_HTTP_DENIED');
  const daily=await reserveEvidenceSourceAttempts(db,{source:key,reservation_id:id+':'+name,attempts:1,daily_cap:cap,now:Date.now()});receipt.daily_admission=daily;if(!daily.allowed)throw Error('SOURCE_DAILY_CAP_DENIED');
  const minute=await reserveProviderMinuteUnits(db,{provider:venue,reservation_id:id+':'+name,units:1,cap:venue==='GATE'?4:6,now:Date.now()});receipt.minute_admission=minute;if(!minute.allowed)throw Error('PROVIDER_MINUTE_CAP_DENIED');
  out.sourceHTTP++;receipt.sourceHTTP=1;
  const r=await fetch(url,{method,body:body?JSON.stringify(body):undefined,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{})},redirect:'manual',signal:AbortSignal.timeout(15000)});
  receipt.http_status=r.status;receipt.retry_after=r.headers.get('retry-after');const chunks=[];let n=0;for await(const chunk of r.body){n+=chunk.length;if(n>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(chunk);}const bytes=Buffer.concat(chunks),gz=gzipSync(bytes);receipt.received_ts=Date.now();receipt.body_sha256=hash(bytes);receipt.gzip_sha256=hash(gz);receipt.bytes=bytes.length;receipt.file=name+'.json.gz';await fs.writeFile(root+'/'+receipt.file,gz);
  if([401,403,429,451].includes(r.status)){blocked.add(venue);const seconds=/^\d+$/.test(receipt.retry_after||'')?Number(receipt.retry_after):0;await writeEvidenceSourceCache(db,{source:`N05_PROVIDER_BACKOFF:${venue}`,asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:r.status,original_received_ts:receipt.received_ts}});}
  if(r.status!==200){receipt.status=`HTTP_${r.status}`;return null;}
  let p;try{p=JSON.parse(bytes);}catch{receipt.status='INVALID_JSON';return null;}
  receipt.status='RECEIVED_NOT_QUALIFIED';return p;
 }catch(e){receipt.status=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;receipt.received_ts??=Date.now();return null;}
}

const saved=async(dir,name)=>JSON.parse(gunzipSync(await fs.readFile(dir+'/'+name+'.json.gz')));
const end=Math.floor(Date.now()/60000)*60000,start=end-14400000;out.window_end_ts=end;out.window_start_ts=start;
try{
 out.daily_admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');await reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 out.okx_catalog=await saved('checkpoints/n05-actual-qualification-38049404414','catalog-OKX-SPOT');out.okx_windows=[];
 for(const symbol of ['NEAR','ETC','ATOM']){
  const instrument=out.okx_catalog.data.find(r=>r.instId===symbol+'-USDT'&&r.state==='live'&&r.instType==='SPOT');if(!instrument)continue;
  const candles=await get('OKX-'+symbol+'-CANDLES','OKX',`https://www.okx.com/api/v5/market/history-candles?instId=${symbol}-USDT&bar=1m&after=${end}&before=${start-1}&limit=240`);
  const recent=await get('OKX-'+symbol+'-RECENT','OKX',`https://www.okx.com/api/v5/market/trades?instId=${symbol}-USDT&limit=500`),pages=recent?[recent]:[];
  let rows=recent?.data||[],cursor=rows.at(-1)?.tradeId;
  for(let n=0;n<2&&rows.length=== (n===0?500:100)&&Number(rows.at(-1)?.ts)>=start;n++){
   if(!/^\d+$/.test(String(cursor)))break;
   const page=await get('OKX-'+symbol+'-HISTORY-'+n,'OKX',`https://www.okx.com/api/v5/market/history-trades?instId=${symbol}-USDT&type=1&after=${cursor}&limit=100`);if(!page)break;pages.push(page);rows=page.data||[];const next=rows.at(-1)?.tradeId;if(!/^\d+$/.test(String(next))||BigInt(next)>=BigInt(cursor))break;cursor=next;
  }
  const fills=pages.flatMap(p=>p.data||[]);out.okx_windows.push({symbol,instrument,candles,pages,observed_ts:out.sources.at(-1)?.received_ts,native_minutes:candles?.data?.length,raw_rows:fills.length,earliest_raw_ts:fills.length?Math.min(...fills.map(r=>Number(r.ts))):null,newest_raw_ts:fills.length?Math.max(...fills.map(r=>Number(r.ts))):null});
 }
 out.mexc_prior_refusal={original_run:38049404414,body_sha256:'2b977afcbfa9ad3e2987ed1db0000892665a3c124c04e046430eaa778abe93b5',reason:'More than 1 hours between startTime and endTime.',code:-1127};
 const mc=await get('MEXC-HBAR-CANDLES','MEXC',`https://api.mexc.com/api/v3/klines?symbol=HBARUSDT&interval=1m&startTime=${start}&endTime=${end-1}&limit=240`),hours=[];
 for(let n=0;n<4;n++){const from=start+n*3600000,p=await get('MEXC-HBAR-HOUR-'+n,'MEXC',`https://api.mexc.com/api/v3/aggTrades?symbol=HBARUSDT&startTime=${from}&endTime=${from+3599999}&limit=1000`);if(!p)break;hours.push({start_ts:from,end_ts:from+3600000,rows:p});}
 out.mexc_window={symbol:'HBAR',candles:mc,hours,observed_ts:out.sources.at(-1)?.received_ts,native_minutes:mc?.length,hour_rows:hours.map(r=>r.rows?.length),aggregation_is_not_individual_trades:true};
 out.kucoin_currencies=await get('KUCOIN-EXACT-CURRENCIES','KUCOIN','https://api.kucoin.com/api/v3/currencies');out.kucoin_catalog=await saved('checkpoints/n05-actual-qualification-38049404414','catalog-KUCOIN-SPOT');
 out.status='REMAINING_EXCHANGE_ROUTE_FACTS_RETAINED';
}catch(e){out.status='REMAINING_EXCHANGE_BATCH_NOT_CLOSED';out.reason=e.message;}
finally{
 out.http_budget=budget.summary();if(admitted)out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';out.completed_ts=Date.now();
 const raw=Buffer.from(JSON.stringify(out)),gz=gzipSync(raw);await fs.writeFile(root+'/original-batch.json.gz',gz);
 const concise={...out,okx_catalog:undefined,kucoin_currencies:undefined,kucoin_catalog:undefined,okx_windows:out.okx_windows?.map(({candles,pages,...r})=>r),mexc_window:out.mexc_window?(({candles,hours,...r})=>r)(out.mexc_window):undefined,raw_batch:{file:'original-batch.json.gz',body_sha256:hash(raw),gzip_sha256:hash(gz),bytes:raw.length},coverage_qualified:false};await fs.writeFile(root+'/remaining-summary.json',JSON.stringify(concise,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,sourceHTTP:out.sourceHTTP,D1:out.D1,okx:concise.okx_windows,mexc:concise.mexc_window,kucoin_currency_count:out.kucoin_currencies?.data?.length,sources:out.sources.map(r=>({name:r.name,status:r.status,http:r.http_status,bytes:r.bytes}))}));
}
