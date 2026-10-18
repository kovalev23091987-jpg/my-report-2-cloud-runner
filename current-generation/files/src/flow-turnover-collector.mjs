import {n05SourceHasHeadroom} from './n05-source-headroom.mjs';
import {N05_N12_PUBLIC_SOURCE_DAILY_CAP,publicVenueMinuteCap,publicVenueHasMinuteHeadroom} from './public-venue-source-budget.mjs';
import {createHash} from 'node:crypto';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeOptionalEvidenceSourceCache,nativeSourceUsageUnclosed} from './evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';
import {normalizeTurnoverBaseline,turnoverHistoryEnd,turnoverHistoryRequestURL,qualifiedTurnoverFlowScope,qualifiedTurnoverHistoryCache,bindTurnoverHistory,FLOW_TURNOVER_BASELINE_VERSION as VERSION} from './flow-turnover-baseline.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function collectTurnoverBaseline(params={},flow){
 const {db,contract,run_id,request_admit,source_health_admit,fetch_impl=globalThis.fetch,clock=Date.now}=params,now=params.now??clock(),read_now=clock(),receipts=[],venue=flow?.venue,SOURCE='N05_OFFICIAL_FLOW:'+venue;
 const cache_write_receipts=[];let retained=null;
 const root={status:'TURNOVER_HISTORY_NOT_CLOSED',check_completed:false,network_calls:0,receipts,cache_write_receipts};let calls=0,sequence=0,providerBlocked=false;
 if(!db?.prepare||!run_id||(!Number.isSafeInteger(now)||now>read_now||!qualifiedTurnoverFlowScope({contract,flow,now:read_now})))return root;
 const unclosed=()=>nativeSourceUsageUnclosed(db);
 if(unclosed())return{...root,status:'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE'};
 const cacheRead=async input=>unclosed()?null:readEvidenceSourceCache(db,input);
 const cacheWrite=async input=>{const receipt=await writeOptionalEvidenceSourceCache(db,input);cache_write_receipts.push({asset_key:input.asset_key,...receipt});return receipt;};
 const admitDb=()=>!unclosed()&&source_health_admit?.({rows_read:500,rows_written:22})?.allowed===true;
 const get=async(url)=>{
  const id=`N05_HISTORY:${run_id}:${contract}:${++sequence}`,receipt={url,http_status:null,received_ts:null,actual_http:0,status:'NOT_ATTEMPTED'};receipts.push(receipt);
  if(providerBlocked){receipt.status='VENUE_BACKOFF_THIS_INVOCATION';return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  if(!admitDb()){receipt.status='FLOW_DB_HEADROOM_REQUIRED';return null;}
  const backoff=await cacheRead({source:`N05_PROVIDER_BACKOFF:${venue}`,asset_key:'SHARED',now:clock()});if(backoff){receipt.status='DURABLE_VENUE_BACKOFF';return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  if(!await n05SourceHasHeadroom(db,SOURCE,N05_N12_PUBLIC_SOURCE_DAILY_CAP,clock())){receipt.status='SOURCE_DAILY_CAP_DENIED';return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  if(!await publicVenueHasMinuteHeadroom(db,venue,1,clock())){receipt.status='ROLLING_60S_CAP_REACHED';return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  const grant=request_admit?.({logical_request_id:id,lane:'background',attempts:1});if(grant?.allowed!==true||grant.duplicate){receipt.status=grant?.status||'WHOLE_JOB_HTTP_ADMISSION_REQUIRED';return null;}
  const daily=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:id,attempts:1,daily_cap:N05_N12_PUBLIC_SOURCE_DAILY_CAP,now:clock()});if(!daily.allowed){receipt.status=daily.status||'SOURCE_DAILY_CAP_DENIED';return null;}
  const minute=await reserveProviderMinuteUnits(db,{provider:venue,reservation_id:id,units:1,cap:publicVenueMinuteCap(venue),now:clock()});if(!minute.allowed){receipt.status=minute.status;return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  try{
   calls++;receipt.actual_http=1;const response=await fetch_impl(url,{headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)}),chunks=[];let size=0;receipt.http_status=response.status;if([401,403,429,451].includes(response.status))providerBlocked=true;
   for await(const c of response.body){size+=c.length;if(size>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(c);}const bytes=Buffer.concat(chunks);receipt.received_ts=clock();receipt.body_sha256=hash(bytes);receipt.bytes=size;
   if([401,403,429,451].includes(response.status)){const retry=response.headers.get('retry-after'),seconds=/^\d+$/.test(retry||'')?Number(retry):0;if(admitDb())await cacheWrite({source:`N05_PROVIDER_BACKOFF:${venue}`,asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:response.status,original_received_ts:receipt.received_ts}});}
   if(response.status!==200){receipt.status='HTTP_'+response.status;return null;}const p=JSON.parse(bytes);receipt.status='RECEIVED_NOT_QUALIFIED';return p;
  }catch(e){receipt.status=e.message;receipt.received_ts??=clock();return null;}
 };
 try{
  if(!admitDb())return{...root,status:'FLOW_DB_HEADROOM_REQUIRED'};
  const history_end_ts=turnoverHistoryEnd(flow.window_start_ts),key=`TURNOVER30D:${contract}:${history_end_ts}`,old=await cacheRead({source:SOURCE,asset_key:key,now:read_now,include_cache_clock:true});
  const url=turnoverHistoryRequestURL({contract,venue,history_end_ts}),cache_hit=qualifiedTurnoverHistoryCache(old,{contract,venue,history_end_ts,now:read_now});
  let candles,ts;
  if(cache_hit){candles=old.candles;ts=old.observed_ts;receipts.push({...old.receipt,actual_http:0,cache_status:'HIT_ORIGINAL_CLOCKS'});}
  else{candles=await get(url);ts=receipts.at(-1)?.received_ts;}
  const receipt=receipts.at(-1),baseline=bindTurnoverHistory(normalizeTurnoverBaseline({contract,venue,candles,history_end_ts,observed_ts:ts,current_flow:flow}),{contract,venue,candles,receipt});
  if(baseline.check_completed)retained=baseline;
  if(baseline.check_completed&&!cache_hit&&admitDb())await cacheWrite({source:SOURCE,asset_key:key,observed_ts:ts,expires_ts:history_end_ts+14400000+21600000,payload:{version:VERSION,observed_ts:ts,candles,receipt,cache_scope:{schema:'N05_TURNOVER_CACHE_SCOPE_V1',contract,venue,market:'SPOT',quote:'USDT',request_url:url,history_start_ts:baseline.history_start_ts,history_end_ts,observed_ts:ts,expires_at:baseline.expires_at,body_sha256:receipt.body_sha256,candles_sha256:baseline.history_binding.candles_sha256}}});
  return{...root,...baseline,network_calls:calls};
 }catch(e){return{...root,...(retained||{status:'TURNOVER_COLLECTOR_ERROR',reason:e.message}),network_calls:calls};}
}
