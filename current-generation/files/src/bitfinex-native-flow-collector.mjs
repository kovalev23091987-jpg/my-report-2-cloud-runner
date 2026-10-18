import {verifiedAssetRouteIdentity} from './verified-asset-route-identity.mjs';
import {N05_N12_PUBLIC_SOURCE_DAILY_CAP,publicVenueMinuteCap,publicVenueHasMinuteHeadroom} from './public-venue-source-budget.mjs';
import {createHash} from 'node:crypto';
import {n05SourceHasHeadroom} from './n05-source-headroom.mjs';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeOptionalEvidenceSourceCache,nativeSourceUsageUnclosed} from './evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';
import {normalizeBitfinexN12BoundedTradeSample,validateBitfinexN12BoundedTradeSample} from './bitfinex-n12-bounded-trade-sample.mjs';
import {exactBitfinexNativeIdentity,exactBitfinexNativeMarket,bitfinexNativeMarket,normalizeBitfinexNativeFlow} from './bitfinex-native-four-hour-flow.mjs';

const SOURCE='N05_OFFICIAL_FLOW:BITFINEX',VERSION='bitfinex-native-flow-collector-v1-20261011',hash=b=>createHash('sha256').update(b).digest('hex');
export async function collectBitfinexNativeFlow(params={}){
 const {db,contract,asset_identity:identity,identity_method,run_id,request_admit,source_health_admit,fetch_impl=globalThis.fetch,clock=Date.now}=params,now=params.now??clock(),receipts=[];
 const evidence=[],components=[],cache_write_receipts=[];
 const root={version:VERSION,status:'EXACT_BITFINEX_ASSET_BINDING_REQUIRED',check_completed:false,network_calls:0,evidence,components,receipts,cache_write_receipts,internal_only:true};let calls=0,sequence=0,providerBlocked=false;
 if(!db?.prepare||!run_id||!exactBitfinexNativeIdentity(contract,identity)||!verifiedAssetRouteIdentity(params))return root;
 const unclosed=()=>nativeSourceUsageUnclosed(db);
 if(unclosed())return{...root,status:'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE'};
 const cacheRead=async input=>unclosed()?null:readEvidenceSourceCache(db,input);
 const cacheWrite=async input=>{const receipt=await writeOptionalEvidenceSourceCache(db,input);cache_write_receipts.push({asset_key:input.asset_key,...receipt});return receipt;};
 const admitDb=()=>!unclosed()&&source_health_admit?.({rows_read:500,rows_written:22})?.allowed===true;
 const get=async(url)=>{
  const id=`N05_BITFINEX:${run_id}:${contract}:${++sequence}`,receipt={url,http_status:null,received_ts:null,actual_http:0,status:'NOT_ATTEMPTED'};receipts.push(receipt);
  if(providerBlocked){receipt.status='VENUE_BACKOFF_THIS_INVOCATION';return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  if(calls>=5){receipt.status='CALLER_FIVE_REQUEST_CAP';return null;}
  if(!admitDb()){receipt.status='FLOW_DB_HEADROOM_REQUIRED';return null;}
  if(await cacheRead({source:'N05_PROVIDER_BACKOFF:BITFINEX',asset_key:'SHARED',now:clock()})){receipt.status='DURABLE_VENUE_BACKOFF';return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  if(!await n05SourceHasHeadroom(db,SOURCE,N05_N12_PUBLIC_SOURCE_DAILY_CAP,clock())){receipt.status='SOURCE_DAILY_CAP_DENIED';return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  if(!await publicVenueHasMinuteHeadroom(db,'BITFINEX',1,clock())){receipt.status='ROLLING_60S_CAP_REACHED';return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  const grant=request_admit?.({logical_request_id:id,lane:'background',attempts:1});if(grant?.allowed!==true||grant.duplicate){receipt.status=grant?.status||'WHOLE_JOB_HTTP_ADMISSION_REQUIRED';return null;}
  const daily=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:id,attempts:1,daily_cap:N05_N12_PUBLIC_SOURCE_DAILY_CAP,now:clock()});if(!daily.allowed){receipt.status=daily.status||'SOURCE_DAILY_CAP_DENIED';return null;}
  const minute=await reserveProviderMinuteUnits(db,{provider:'BITFINEX',reservation_id:id,units:1,cap:publicVenueMinuteCap('BITFINEX'),now:clock()});if(!minute.allowed){receipt.status=minute.status;return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  try{
   calls++;receipt.actual_http=1;const response=await fetch_impl(url,{headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)}),chunks=[];let size=0;receipt.http_status=response.status;if([401,403,429,451].includes(response.status))providerBlocked=true;
   for await(const c of response.body){size+=c.length;if(size>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(c);}const bytes=Buffer.concat(chunks);receipt.received_ts=clock();receipt.body_sha256=hash(bytes);receipt.bytes=size;
   if([401,403,429,451].includes(response.status)){const retry=response.headers.get('retry-after'),seconds=/^\d+$/.test(retry||'')?Number(retry):0;if(admitDb())await cacheWrite({source:'N05_PROVIDER_BACKOFF:BITFINEX',asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:response.status,original_received_ts:receipt.received_ts}});}
   if(response.status!==200){receipt.status='HTTP_'+response.status;return null;}const payload=JSON.parse(bytes);receipt.payload_sha256=hash(JSON.stringify(payload));receipt.status='RECEIVED_NOT_QUALIFIED';return payload;
  }catch(e){receipt.status=e.message;receipt.received_ts??=clock();return null;}
 };
 try{
  if(!admitDb())return{...root,status:'FLOW_DB_HEADROOM_REQUIRED'};
  const end=Math.floor(now/60000)*60000,key=`NATIVE_FLOW:${contract}:${end}`,old=await cacheRead({source:SOURCE,asset_key:key,now,include_cache_clock:true});
  if(old?.version===VERSION&&old.observed_ts<=now&&old.observed_ts>=end){const c=normalizeBitfinexNativeFlow({contract,identity,catalog:old.catalog,candles:old.candles,trades:old.trades,window_end_ts:end,observed_ts:old.observed_ts}),sample=normalizeBitfinexN12BoundedTradeSample({contract,identity,catalog:old.catalog,trades:old.trades,trade_receipt:old.trade_receipt,window_end_ts:end,observed_ts:old.observed_ts});evidence.push(...sample.evidence.filter(e=>validateBitfinexN12BoundedTradeSample(e,now)));return{...root,status:c.status,components:[c],network_calls:calls,cache_status:'HIT_ORIGINAL_CLOCKS',check_completed:c.check_completed,n12_bounded_sample_status:sample.status};}
  if(unclosed())return{...root,status:'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE'};
  const metaKey='OFFICIAL_METADATA:EXCHANGE_PAIR_AND_CURRENCY_ALIASES',cached=await cacheRead({source:SOURCE,asset_key:metaKey,now,include_cache_clock:true});let catalog;
  if(unclosed())return{...root,status:'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE'};
  if(cached?.version===VERSION&&cached.observed_ts<=now&&now-cached.observed_ts<=21600000){catalog=cached.catalog;receipts.push({...cached.receipt,actual_http:0,cache_status:'HIT_ORIGINAL_CLOCKS'});}
  else{catalog=await get('https://api-pub.bitfinex.com/v2/conf/pub:list:pair:exchange,pub:map:currency:sym,pub:map:currency:label,pub:map:currency:pool');if(!Array.isArray(catalog)||catalog.length!==4)return{...root,status:receipts.at(-1)?.status||'INVALID_OFFICIAL_METADATA',network_calls:calls};const ts=receipts.at(-1).received_ts;if(admitDb())await cacheWrite({source:SOURCE,asset_key:metaKey,observed_ts:ts,expires_ts:ts+21600000,payload:{version:VERSION,observed_ts:ts,catalog,receipt:receipts.at(-1)}});}
  if(!exactBitfinexNativeMarket({contract,identity,catalog}))return{...root,status:'EXACT_BITFINEX_NATIVE_MARKET_REQUIRED',network_calls:calls};
  const pair=bitfinexNativeMarket(contract),start=end-14400000;
  const candles=await get(`https://api-pub.bitfinex.com/v2/candles/trade:1m:t${pair}/hist?start=${start}&end=${end-1}&limit=240&sort=1`);
  if(!candles)return{...root,status:receipts.at(-1)?.status||'NATIVE_CANDLES_NOT_RECEIVED',network_calls:calls};
  const trades=await get(`https://api-pub.bitfinex.com/v2/trades/t${pair}/hist?start=${start}&end=${end-1}&limit=10000&sort=1`);
  if(!trades)return{...root,status:receipts.at(-1)?.status||'NATIVE_TRADES_NOT_RECEIVED',network_calls:calls};
  const component=normalizeBitfinexNativeFlow({contract,identity,catalog,candles,trades,window_end_ts:end,observed_ts:receipts.at(-1).received_ts}),ts=component.observed_ts;
  const sample=normalizeBitfinexN12BoundedTradeSample({contract,identity,catalog,trades,trade_receipt:receipts.at(-1),window_end_ts:end,observed_ts:ts});
  evidence.push(...sample.evidence.filter(e=>validateBitfinexN12BoundedTradeSample(e,clock())));
  components.push({...component,receipt_hashes:receipts.filter(r=>r.body_sha256).map(r=>r.body_sha256),n12_bounded_sample_status:sample.status});
  const payload={version:VERSION,observed_ts:ts,catalog,candles,trades,trade_receipt:receipts.at(-1)};
  if(component.check_completed&&Buffer.byteLength(JSON.stringify(payload))<=900000&&admitDb())await cacheWrite({source:SOURCE,asset_key:key,observed_ts:ts,expires_ts:end+300000,payload});
  return{...root,status:component.status,reason:component.reason,components,check_completed:component.check_completed,network_calls:calls};
 }catch(e){return{...root,status:components.some(c=>c.check_completed)||evidence.length?'PARTIAL_RETAINED_FLOW_FACTS':'FLOW_COLLECTOR_ERROR',check_completed:components.some(c=>c.check_completed),reason:e.message,network_calls:calls};}
}
