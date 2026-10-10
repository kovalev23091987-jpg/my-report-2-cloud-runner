import fs from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,evaluateWithinRunReservation,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from '../current-generation/files/src/evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from '../current-generation/files/src/provider-minute-ledger.mjs';
// Runtime pagination tests must pass before provider attempts.
const stage='window',root='audit-output/n05-window',hash=b=>createHash('sha256').update(b).digest('hex');
const universe=JSON.parse(gunzipSync(await fs.readFile('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz')));if(universe.assets.length!==102)throw Error('EXACT_UNIVERSE_REQUIRED');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),id=`N05_QUALIFICATION:${process.env.GITHUB_RUN_ID}:${stage}:${process.env.GITHUB_RUN_ATTEMPT}`,reservation={rows_read:16000,rows_written:500},budget=createUnifiedHttpBudget(),blocked=new Set();
const out={schema:'N05_ACTUAL_SPOT_FUTURES_QUALIFICATION_V1',stage,run:process.env.GITHUB_RUN_ID,head:process.env.GITHUB_SHA,started_ts:now,approved_assets:102,minimum_useful_assets:31,coverage_is_not_listing:true,sourceHTTP:0,sources:[],MAIN:0,Telegram:0,score_adjustment:0,production_enabled:false,new_fresh_SENT:false,project_complete:false};
await fs.mkdir(root,{recursive:true});let admitted=false;
async function get(name,venue,url,{method='GET',body=null,source=null,daily_cap=null}={}){
 const receipt={name,venue,url,method,received_ts:null,http_status:null,status:'NOT_ATTEMPTED',sourceHTTP:0,source_ts:null,retrieval_is_not_event_time:true};out.sources.push(receipt);
 if(venue==='BITGET'){const recent=out.sources.filter(r=>r.venue===venue&&r.sourceHTTP===1&&Date.now()-r.received_ts<60000);if(recent.length>=6){const delay=Math.max(1,60050-(Date.now()-recent[0].received_ts));console.log(JSON.stringify({type:'PROVIDER_PACING',venue,delay_ms:delay}));await new Promise(r=>setTimeout(r,delay));}}
 const key=source||`N05_OFFICIAL_FLOW:${venue}`,cap=daily_cap??16;
 if(blocked.has(venue)){receipt.status='SHARED_VENUE_BACKOFF';return null;}
 try{
  if(!evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:22}).allowed)throw Error('D1_HEADROOM_DENIED');
  const old=await readEvidenceSourceCache(db,{source:`N05_PROVIDER_BACKOFF:${venue}`,asset_key:'SHARED',now:Date.now()});if(old){receipt.status='DURABLE_VENUE_BACKOFF';blocked.add(venue);return null;}
  const whole=budget.reserve({logical_request_id:id+':'+name,lane:'background',attempts:1});receipt.whole_admission=whole;if(!whole.allowed||whole.duplicate)throw Error('WHOLE_JOB_HTTP_DENIED');
  const daily=await reserveEvidenceSourceAttempts(db,{source:key,reservation_id:id+':'+name,attempts:1,daily_cap:cap,now:Date.now()});receipt.daily_admission=daily;if(!daily.allowed)throw Error('SOURCE_DAILY_CAP_DENIED');
  const minute=await reserveProviderMinuteUnits(db,{provider:venue,reservation_id:id+':'+name,units:1,cap:6,now:Date.now()});receipt.minute_admission=minute;if(!minute.allowed)throw Error('PROVIDER_MINUTE_CAP_DENIED');
  out.sourceHTTP++;receipt.sourceHTTP=1;
  const r=await fetch(url,{method,body:body?JSON.stringify(body):undefined,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{})},redirect:'manual',signal:AbortSignal.timeout(15000)});
  receipt.http_status=r.status;receipt.retry_after=r.headers.get('retry-after');const chunks=[];let n=0;for await(const chunk of r.body){n+=chunk.length;if(n>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(chunk);}const bytes=Buffer.concat(chunks),gz=gzipSync(bytes);receipt.received_ts=Date.now();receipt.body_sha256=hash(bytes);receipt.gzip_sha256=hash(gz);receipt.bytes=bytes.length;receipt.file=name+'.json.gz';await fs.writeFile(root+'/'+receipt.file,gz);
  if([401,403,429,451].includes(r.status)){blocked.add(venue);const seconds=/^\d+$/.test(receipt.retry_after||'')?Number(receipt.retry_after):0;await writeEvidenceSourceCache(db,{source:`N05_PROVIDER_BACKOFF:${venue}`,asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:r.status,original_received_ts:receipt.received_ts}});}
  if(r.status!==200){receipt.status=`HTTP_${r.status}`;return null;}
  let p;try{p=JSON.parse(bytes);}catch{receipt.status='INVALID_JSON';return null;}
  receipt.status='RECEIVED_NOT_QUALIFIED';return p;
 }catch(e){receipt.status=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;receipt.received_ts??=Date.now();return null;}
}

import {normalizeHtxAssetReferences} from '../current-generation/files/src/htx-asset-identity.mjs';
import {exactBitgetBinding,acquireBitgetFourHourFlow} from '../current-generation/files/src/bitget-four-hour-flow.mjs';
const retained='checkpoints/n05-actual-qualification-38049404414';
const saved=async n=>JSON.parse(gunzipSync(await fs.readFile(retained+'/'+n+'.json.gz')));
try{
 out.daily_admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');await reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 const htx=normalizeHtxAssetReferences(await saved('identity-HTX')),coins=await saved('identity-BITGET'),spot=await saved('catalog-BITGET-SPOT'),futures=await saved('catalog-BITGET-FUTURES');
 out.exact_binding_candidates=[];
 for(const a of universe.assets){const ref=htx.entries[a.symbol];if(ref?.status!=='CLOSED')continue;const s=spot.data.find(r=>r.baseCoin===a.symbol&&r.quoteCoin==='USDT'),f=futures.data.find(r=>r.baseCoin===a.symbol&&r.quoteCoin==='USDT');const identity=ref.identities[0];if(exactBitgetBinding({contract:a.symbol+'-USDT',identity,coins,instrument:s,market:'SPOT'})&&exactBitgetBinding({contract:a.symbol+'-USDT',identity,coins,instrument:f,market:'FUTURES'}))out.exact_binding_candidates.push({base:a.symbol,identity,spot:s.symbol,futures:f.symbol});}
 out.binding_coverage_is_not_full_flow_coverage=true;
 const tickers=await get('BITGET-SPOT-TICKERS','BITGET','https://api.bitget.com/api/v2/spot/market/tickers');
 const ordered=out.exact_binding_candidates.map(e=>({...e,ticker:tickers?.data?.find(r=>r.symbol===e.spot)})).filter(e=>Number(e.ticker?.usdtVolume)>0).sort((a,b)=>Number(a.ticker.usdtVolume)-Number(b.ticker.usdtVolume));
 out.selected=ordered.slice(0,2).map(e=>({base:e.base,usdtVolume:e.ticker.usdtVolume}));out.window_end_ts=Math.floor(Date.now()/60000)*60000;out.full_windows=[];
 for(const e of ordered.slice(0,2))for(const market of ['SPOT','FUTURES']){
  const result=await acquireBitgetFourHourFlow({contract:e.base+'-USDT',market,window_end_ts:out.window_end_ts,max_pages:3,get:(url,part)=>get('BITGET-'+market+'-'+e.base+'-'+part.kind+'-'+part.page,'BITGET',url)});
  const {payloads,...summary}=result;out.full_windows.push({...summary,exact_asset_binding:true,identity:e.identity});console.log(JSON.stringify({type:'FULL_WINDOW',...summary}));
 }
 const coinbase=await get('catalog-COINBASE-SPOT','COINBASE','https://api.exchange.coinbase.com/products');out.coinbase_catalog_candidates=Array.isArray(coinbase)?[...new Set(coinbase.filter(r=>r.status==='online'&&['USD','USDT','USDC'].includes(r.quote_currency)&&universe.assets.some(a=>a.symbol===r.base_currency)).map(r=>r.base_currency))]:[];
 const kraken=await get('catalog-KRAKEN-SPOT','KRAKEN','https://api.kraken.com/0/public/AssetPairs');out.kraken_catalog_candidates=Object.values(kraken?.result||{}).filter(r=>r.status==='online').map(r=>({instrument:r.altname,wsname:r.wsname}));
 out.additional_catalogs_not_useful_flow_proof=true;out.production_enabled=false;out.status='BOUNDED_WINDOW_QUALIFICATION_RETAINED';
}catch(e){out.status='QUALIFICATION_NOT_CLOSED';out.reason=e.message;}
finally{
 out.http_budget=budget.summary();if(admitted)out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';out.completed_ts=Date.now();await fs.writeFile(root+'/window-summary.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,sourceHTTP:out.sourceHTTP,D1:out.D1,bindings:out.exact_binding_candidates?.length,selected:out.selected,full_windows:out.full_windows,sources:out.sources.map(r=>({name:r.name,status:r.status,http:r.http_status,bytes:r.bytes}))}));
}
