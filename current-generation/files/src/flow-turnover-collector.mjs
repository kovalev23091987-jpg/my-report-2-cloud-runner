import {createHash} from 'node:crypto';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';
import {normalizeTurnoverBaseline,turnoverHistoryEnd,FLOW_TURNOVER_BASELINE_VERSION as VERSION} from './flow-turnover-baseline.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function collectTurnoverBaseline(params={},flow){
 const {db,contract,run_id,request_admit,source_health_admit,fetch_impl=globalThis.fetch,clock=Date.now}=params,now=params.now??clock(),receipts=[],venue=flow?.venue,SOURCE='N05_OFFICIAL_FLOW:'+venue;
 const root={status:'TURNOVER_HISTORY_NOT_CLOSED',check_completed:false,network_calls:0,receipts};let calls=0,sequence=0;
 if(!db?.prepare||!run_id||flow?.check_completed!==true||!['GATE','BINANCE'].includes(venue))return root;
 const admitDb=()=>source_health_admit?.({rows_read:500,rows_written:22})?.allowed===true;
 const get=async(url)=>{
  const id=`N05_HISTORY:${run_id}:${contract}:${++sequence}`,receipt={url,http_status:null,received_ts:null,actual_http:0,status:'NOT_ATTEMPTED'};receipts.push(receipt);
  if(!admitDb()){receipt.status='FLOW_DB_HEADROOM_REQUIRED';return null;}
  const backoff=await readEvidenceSourceCache(db,{source:`N05_PROVIDER_BACKOFF:${venue}`,asset_key:'SHARED',now:clock()});if(backoff){receipt.status='DURABLE_VENUE_BACKOFF';return null;}
  const grant=request_admit?.({logical_request_id:id,lane:'background',attempts:1});if(grant?.allowed!==true||grant.duplicate){receipt.status=grant?.status||'WHOLE_JOB_HTTP_ADMISSION_REQUIRED';return null;}
  const daily=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:id,attempts:1,daily_cap:16,now:clock()});if(!daily.allowed){receipt.status='SOURCE_DAILY_CAP_DENIED';return null;}
  const minute=await reserveProviderMinuteUnits(db,{provider:venue,reservation_id:id,units:1,cap:venue==='GATE'?4:6,now:clock()});if(!minute.allowed){receipt.status=minute.status;return null;}
  try{
   calls++;receipt.actual_http=1;const response=await fetch_impl(url,{headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)}),chunks=[];let size=0;receipt.http_status=response.status;
   for await(const c of response.body){size+=c.length;if(size>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(c);}const bytes=Buffer.concat(chunks);receipt.received_ts=clock();receipt.body_sha256=hash(bytes);receipt.bytes=size;
   if([401,403,429,451].includes(response.status)){const retry=response.headers.get('retry-after'),seconds=/^\d+$/.test(retry||'')?Number(retry):0;if(admitDb())await writeEvidenceSourceCache(db,{source:`N05_PROVIDER_BACKOFF:${venue}`,asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:response.status,original_received_ts:receipt.received_ts}});}
   if(response.status!==200){receipt.status='HTTP_'+response.status;return null;}const p=JSON.parse(bytes);receipt.status='RECEIVED_NOT_QUALIFIED';return p;
  }catch(e){receipt.status=e.message;receipt.received_ts??=clock();return null;}
 };
 try{
  if(!admitDb())return{...root,status:'FLOW_DB_HEADROOM_REQUIRED'};
  const history_end_ts=turnoverHistoryEnd(flow.window_start_ts),key=`TURNOVER30D:${contract}:${history_end_ts}`,old=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now,include_cache_clock:true});
  let candles,ts;
  if(old?.version===VERSION&&old.observed_ts<=now){candles=old.candles;ts=old.observed_ts;receipts.push({...old.receipt,actual_http:0,cache_status:'HIT_ORIGINAL_CLOCKS'});}
  else{const base=contract.slice(0,-5),url=venue==='BINANCE'?`https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(base+'USDT')}&interval=1h&startTime=${history_end_ts-30*86400000}&endTime=${history_end_ts-1}&limit=720`:`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${encodeURIComponent(base+'_USDT')}&from=${(history_end_ts-30*86400000)/1000}&to=${history_end_ts/1000-1}&interval=1h`;candles=await get(url);ts=receipts.at(-1)?.received_ts;}
  const baseline=normalizeTurnoverBaseline({contract,venue,candles,history_end_ts,observed_ts:ts,current_flow:flow});
  if(baseline.check_completed&&!old&&admitDb())await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:ts,expires_ts:history_end_ts+14400000+21600000,payload:{version:VERSION,observed_ts:ts,candles,receipt:receipts.at(-1)}});
  return{...root,...baseline,network_calls:calls};
 }catch(e){return{...root,status:'TURNOVER_COLLECTOR_ERROR',reason:e.message,network_calls:calls};}
}
