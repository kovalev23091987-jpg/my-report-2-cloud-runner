import fs from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,evaluateWithinRunReservation,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from '../current-generation/files/src/evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from '../current-generation/files/src/provider-minute-ledger.mjs';
// Runtime pagination tests must pass before provider attempts.
const stage='broad-exchanges',root='audit-output/n05-broad-exchanges',hash=b=>createHash('sha256').update(b).digest('hex');
const universe=JSON.parse(gunzipSync(await fs.readFile('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz')));if(universe.assets.length!==102)throw Error('EXACT_UNIVERSE_REQUIRED');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),id=`N05_QUALIFICATION:${process.env.GITHUB_RUN_ID}:${stage}:${process.env.GITHUB_RUN_ATTEMPT}`,reservation={rows_read:16000,rows_written:500},budget=createUnifiedHttpBudget(),blocked=new Set();
const out={schema:'N05_BROAD_EXCHANGE_QUALIFICATION_V1',stage,run:process.env.GITHUB_RUN_ID,head:process.env.GITHUB_SHA,started_ts:now,approved_assets:102,minimum_useful_assets:31,coverage_is_not_listing:true,sourceHTTP:0,sources:[],MAIN:0,Telegram:0,score_adjustment:0,production_enabled:false,new_fresh_SENT:false,project_complete:false};
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
import {normalizeBackpackSpotFlow} from '../current-generation/files/src/backpack-four-hour-flow.mjs';
import {normalizeHtxAssetReferences} from '../current-generation/files/src/htx-asset-identity.mjs';
const saved=async(dir,name)=>JSON.parse(gunzipSync(await fs.readFile(dir+'/'+name+'.json.gz')));
try{
 out.daily_admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');await reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;


 const prior=JSON.parse(await fs.readFile('checkpoints/n05-broad-qualification-38065882136/broad-summary.json','utf8')),windows=JSON.parse(await fs.readFile('checkpoints/n05-broad-qualification-38066068287/broad-summary.json','utf8'));
 out.exact_htx_assets=prior.exact_htx_assets;out.native_assets=windows.native_assets;out.kraken_usdt_markets=windows.kraken_usdt_markets;out.coinbase_chain_metadata=windows.coinbase_chain_metadata;out.backpack_bindings=windows.backpack_bindings;out.binance_bindings=windows.binance_bindings;out.binance_windows=windows.binance_windows.map(({candles,...r})=>({...r,rows:candles?.length}));out.original_backpack_windows=windows.backpack_windows.map(({bars,pages,...r})=>({...r,rows:bars.length,count:bars.reduce((n,b)=>n+Number(b.trades),0)}));
 const end=windows.window_end_ts;out.window_end_ts=end;out.backpack_windows=[];
 for(const b of windows.backpack_windows.filter(b=>b.bars.reduce((n,r)=>n+Number(r.trades),0)>0)){const candles=await get('BACKPACK-'+b.market+'-COMPLETE-CANDLES','BACKPACK','https://api.backpack.exchange/api/v1/klines?symbol='+encodeURIComponent(b.market)+'&interval=1m&startTime='+(end-14400000)/1000+'&endTime='+end/1000+'&priceType=Last&source=Venue');out.backpack_windows.push({...b,bars:undefined,pages:undefined,flow:normalizeBackpackSpotFlow({...b,assets:windows.backpack_assets,markets:windows.backpack_markets,candles,pages:b.pages,window_end_ts:end,observed_ts:out.sources.at(-1).received_ts})});}
 const candidate=windows.backpack_bindings.find(b=>b.market==='UNI_USDC');if(candidate){const candles=await get('BACKPACK-UNI-COMPLETE-CANDLES','BACKPACK','https://api.backpack.exchange/api/v1/klines?symbol=UNI_USDC&interval=1m&startTime='+(end-14400000)/1000+'&endTime='+end/1000+'&priceType=Last&source=Venue'),raw=await get('BACKPACK-UNI-TRADES','BACKPACK','https://api.backpack.exchange/api/v1/trades/history?symbol=UNI_USDC&limit=1000&offset=0');out.backpack_windows.push({...candidate,flow:normalizeBackpackSpotFlow({...candidate,assets:windows.backpack_assets,markets:windows.backpack_markets,candles,pages:[raw],window_end_ts:end,observed_ts:out.sources.at(-1).received_ts})});}
 out.kraken_windows=[];
 for(const symbol of ['DOT','ATOM']){const binding=out.native_assets.find(a=>a.symbol===symbol),market=out.kraken_usdt_markets.find(m=>m.wsname===symbol+'/USDT');if(!binding||!market)continue;const candles=await get('KRAKEN-'+symbol+'-CANDLES','KRAKEN','https://api.kraken.com/0/public/OHLC?pair='+encodeURIComponent(market.altname)+'&interval=1&since='+(end-14400000)/1000),trades=await get('KRAKEN-'+symbol+'-HISTORY','KRAKEN','https://api.kraken.com/0/public/Trades?pair='+encodeURIComponent(market.altname)+'&since='+(BigInt(end-14400000)*1000000n-1n).toString()+'&count=1000');out.kraken_windows.push({contract:symbol+'-USDT',identity:binding.identities[0],market,candles,trades,observed_ts:out.sources.at(-1).received_ts});}
 out.status='BROAD_WINDOWS_NORMALIZED_AND_KRAKEN_ROUTE_RETAINED';


}catch(e){out.status='BROAD_BATCH_NOT_CLOSED';out.reason=e.message;}
finally{
 out.http_budget=budget.summary();if(admitted)out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';out.completed_ts=Date.now();await fs.writeFile(root+'/broad-summary.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,sourceHTTP:out.sourceHTTP,D1:out.D1,natives:out.all_native_entries?.map(r=>r.symbol),shape:out.original_universe_shape,backpack_windows:out.backpack_windows?.map(r=>({market:r.market,flow:r.flow})),kraken:out.kraken_windows?.map(r=>({contract:r.contract,ohlc:r.candles?.result,first:r.trades?.result?.[r.market.key]?.[0],rows:r.trades?.result?.[r.market.key]?.length})),binance:out.binance_bindings?.map(r=>r.contract),sources:out.sources.map(r=>({name:r.name,status:r.status,http:r.http_status,bytes:r.bytes}))}));
}
