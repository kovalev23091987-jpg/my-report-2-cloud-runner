import fs from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,evaluateWithinRunReservation,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from '../current-generation/files/src/evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from '../current-generation/files/src/provider-minute-ledger.mjs';
// Runtime pagination tests must pass before provider attempts.
const stage='coinex' ,root='audit-output/n05-coinex',hash=b=>createHash('sha256').update(b).digest('hex');
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
 out.assets=await get('COINEX-EXACT-ASSETS','COINEX','https://api.coinex.com/v2/assets/info');
 out.markets=await get('COINEX-SPOT-MARKETS','COINEX','https://api.coinex.com/v2/spot/market');
 const native=JSON.parse(await fs.readFile('checkpoints/n05-broad-qualification-38066590063/broad-summary.json','utf8'));
 out.htx_native=native.native_assets;
 out.windows=[];
 const desired=['ETC','NEAR','HBAR','SUI','LINK','AAVE'];
 for(const symbol of desired){
  const market=out.markets?.data?.find(m=>m.market===symbol+'USDT'&&m.base_ccy===symbol&&m.quote_ccy==='USDT'&&m.status==='online');
  const asset=out.assets?.data?.find(a=>a.short_name===symbol);if(!market||!asset){out.windows.push({symbol,status:'EXACT_METADATA_NOT_AVAILABLE'});continue;}
  const candles=await get('COINEX-'+symbol+'-CANDLES','COINEX',`https://api.coinex.com/v2/spot/kline?market=${market.market}&period=1min&limit=300`),pages=[];let cursor='0';
  for(let i=0;i<3;i++){
   const p=await get('COINEX-'+symbol+'-TRADES-'+i,'COINEX',`https://api.coinex.com/v2/spot/deals?market=${market.market}&limit=1000&last_id=${cursor}`);if(!p)break;pages.push(p);
   const rows=p.data;if(p.code!==0||!Array.isArray(rows)||!rows.length||rows.length<1000||Math.min(...rows.map(r=>r.created_at))<=start)break;
   const next=String(rows.at(-1).deal_id);if(!/^\d+$/.test(next)||next===cursor||cursor!=='0'&&BigInt(next)>=BigInt(cursor))break;cursor=next;
  }
  out.windows.push({symbol,asset,market,candles,pages,window_end_ts:end,observed_ts:out.sources.at(-1)?.received_ts});
 }
 // Reuse proven primary native identity and paired direction; only missing AVAX facts are acquired.
 const market=native.kraken_usdt_markets.find(m=>m.altname==='AVAXUSDT'),binding=native.native_assets.find(a=>a.symbol==='AVAX');
 if(market&&binding){const candles=await get('KRAKEN-AVAX-CANDLES','KRAKEN','https://api.kraken.com/0/public/OHLC?pair=AVAXUSDT&interval=1&since='+start/1000),trades=await get('KRAKEN-AVAX-HISTORY','KRAKEN','https://api.kraken.com/0/public/Trades?pair=AVAXUSDT&since='+(BigInt(start)*1000000n-1n).toString()+'&count=1000');out.kraken_window={contract:'AVAX-USDT',identity:binding.identities[0],instrument:market,candles,pages:[trades],window_end_ts:end,observed_ts:out.sources.at(-1)?.received_ts};}
 out.status='REMAINING_EXCHANGE_ROUTE_FACTS_RETAINED';
}catch(e){out.status='REMAINING_EXCHANGE_BATCH_NOT_CLOSED';out.reason=e.message;}
finally{
 out.http_budget=budget.summary();if(admitted)out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';out.completed_ts=Date.now();
 const raw=Buffer.from(JSON.stringify(out)),gz=gzipSync(raw);await fs.writeFile(root+'/original-batch.json.gz',gz);
 const concise={...out,assets:undefined,markets:undefined,htx_native:undefined,windows:out.windows?.map(({candles,pages,...r})=>({...r,native_minutes:candles?.data?.length,raw_pages:pages?.map(p=>({code:p?.code,rows:p?.data?.length,first:p?.data?.[0],last:p?.data?.at(-1)}))})),kraken_window:out.kraken_window?(({candles,pages,...r})=>r)(out.kraken_window):undefined,okx_catalog:undefined,kucoin_currencies:undefined,kucoin_catalog:undefined,okx_windows:out.okx_windows?.map(({candles,pages,...r})=>r),mexc_window:out.mexc_window?(({candles,hours,...r})=>r)(out.mexc_window):undefined,mexc_individual_windows:out.mexc_individual_windows?.map(({candles,trades,...r})=>({...r,native_minutes:candles?.length,raw_rows:trades?.length})),raw_batch:{file:'original-batch.json.gz',body_sha256:hash(raw),gzip_sha256:hash(gz),bytes:raw.length},coverage_qualified:false};await fs.writeFile(root+'/coinex-summary.json',JSON.stringify(concise,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,sourceHTTP:out.sourceHTTP,D1:out.D1,okx:concise.okx_windows,mexc:concise.mexc_window,mexc_individual:out.mexc_individual_windows?.map(r=>({symbol:r.symbol,candles:r.candles?.length,trades:r.trades?.length,first:r.trades?.[0],last:r.trades?.at(-1)})),sources:out.sources.map(r=>({name:r.name,status:r.status,http:r.http_status,bytes:r.bytes}))}));
}
