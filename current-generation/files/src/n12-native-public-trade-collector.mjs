import {withVerifiedAssetRouteIdentity,verifiedAssetRouteIdentity} from './verified-asset-route-identity.mjs';
import {N05_N12_PUBLIC_SOURCE_DAILY_CAP,publicVenueMinuteCap,publicVenueHasMinuteHeadroom} from './public-venue-source-budget.mjs';
import {createHash} from 'node:crypto';
import {n05SourceHasHeadroom} from './n05-source-headroom.mjs';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeOptionalEvidenceSourceCache,nativeSourceUsageUnclosed} from './evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';
import {exactN12NativeIdentity,exactN12NativePublicBinding,normalizeN12NativePublicTrades,parseN12PublicTradeJson,validateN12NativePublicTrade} from './n12-native-public-trade-sample.mjs';
import {N12_APPROVED_BASES,compactN12KucoinTokenCurrencies,exactN12KucoinTokenIdentity,exactN12KucoinTokenCurrency,exactN12KucoinTokenMarket,normalizeN12KucoinTokenTrades,validateN12KucoinTokenTrade} from './n12-kucoin-token-trade-sample.mjs';
import {exactCachedN12TradeResult} from './n12-cached-trade-scope.mjs';

export const N12_NATIVE_PUBLIC_COLLECTOR_VERSION='n12-exact-public-trade-collector-v2-20261012';
const sha=b=>createHash('sha256').update(b).digest('hex');
const catalogUrl=(venue,market,contract)=>{
 const base=contract.slice(0,-5);
 if(venue==='OKX')return`https://www.okx.com/api/v5/public/instruments?instType=${market==='SPOT'?'SPOT':'SWAP'}&instId=${encodeURIComponent(base+'-USDT'+(market==='FUTURES'?'-SWAP':''))}`;
 return market==='SPOT'?'https://api.kucoin.com/api/v2/symbols':'https://api-futures.kucoin.com/api/v1/contracts/active';
};
const tradesUrl=(venue,market,contract)=>{
 const base=contract.slice(0,-5);
 if(venue==='OKX')return`https://www.okx.com/api/v5/market/trades?instId=${encodeURIComponent(base+'-USDT'+(market==='FUTURES'?'-SWAP':''))}&limit=500`;
 const symbol=(market==='FUTURES'?(base==='BTC'?'XBT':base)+'USDTM':base+'-USDT');
 return market==='SPOT'?`https://api.kucoin.com/api/v1/market/histories?symbol=${encodeURIComponent(symbol)}`:`https://api-futures.kucoin.com/api/v1/trade/history?symbol=${encodeURIComponent(symbol)}`;
};
const catalogKey=(venue,market,contract)=>`N12:CATALOG:${market}:${venue==='OKX'?contract:'ALL'}`;
const instrument=(venue,market,contract,payload)=>{
 const base=contract.slice(0,-5),wanted=venue==='OKX'?base+'-USDT'+(market==='FUTURES'?'-SWAP':''):market==='SPOT'?base+'-USDT':(base==='BTC'?'XBT':base)+'USDTM';
 const rows=payload?.data;
 return Array.isArray(rows)&&payload.code===(venue==='OKX'?'0':'200000')&&rows.filter(row=>row?.[venue==='OKX'?'instId':'symbol']===wanted).length===1?rows.find(row=>row?.[venue==='OKX'?'instId':'symbol']===wanted):null;
};
export function compactN12NativeCatalog(venue,market,contract,payload){
 const rows=payload?.data;if(!Array.isArray(rows))return null;
 const allowed=new Set((venue==='OKX'?[contract.slice(0,-5)]:N12_APPROVED_BASES).map(base=>venue==='OKX'?base+'-USDT'+(market==='FUTURES'?'-SWAP':''):market==='SPOT'?base+'-USDT':(base==='BTC'?'XBT':base)+'USDTM'));
 const fields=venue==='OKX'?(market==='SPOT'?['instId','instType','state','instCategory','baseCcy','quoteCcy']:['instId','instType','state','instCategory','ctType','settleCcy','ctValCcy','ctVal','ctMult']):market==='SPOT'?['symbol','baseCurrency','quoteCurrency','enableTrading']:['symbol','baseCurrency','quoteCurrency','settleCurrency','status','marketStage','multiplier'];
 return{code:payload.code,data:rows.filter(row=>allowed.has(row?.[venue==='OKX'?'instId':'symbol'])).map(row=>Object.fromEntries(fields.map(key=>[key,row[key]])))};
}

// Both venues are optional N12 routes inside N05's existing five-request
// caller envelope. Daily allowance covers the owner-approved day plan;
// provider minute weights, durable backoff and original source clocks remain.
export async function collectN12NativePublicVenue(params={},venue){
 params=withVerifiedAssetRouteIdentity(params);
 const {db,contract,asset_identity:identity,identity_method,run_id,request_admit,source_health_admit,fetch_impl=globalThis.fetch,clock=Date.now}=params,now=params.now??clock(),source=`N12_OFFICIAL_TRADES:${venue}`,receipts=[];
 const cache_write_receipts=[],root={version:N12_NATIVE_PUBLIC_COLLECTOR_VERSION,venue,status:'EXACT_ASSET_AND_ADMISSION_REQUIRED',check_completed:false,evidence:[],components:[],network_calls:0,receipts,cache_write_receipts,internal_only:true};let calls=0,sequence=0;
 const asset_binding_proof=params.asset_binding_proof,native=Boolean(verifiedAssetRouteIdentity(params))&&exactN12NativeIdentity(contract,identity),token=venue==='KUCOIN'&&exactN12KucoinTokenIdentity(contract,identity,identity_method,asset_binding_proof);
 if(!['OKX','KUCOIN'].includes(venue)||!db?.prepare||!run_id||!native&&!token)return root;
 if(nativeSourceUsageUnclosed(db))return{...root,status:'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE'};
 let providerBlocked=false;
 const unclosed=()=>nativeSourceUsageUnclosed(db);
 const cacheRead=async input=>unclosed()?null:readEvidenceSourceCache(db,input);
 const cacheWrite=async input=>{const receipt=await writeOptionalEvidenceSourceCache(db,input);cache_write_receipts.push({asset_key:input.asset_key,...receipt});return receipt;};
 const dbGrant=()=>!unclosed()&&source_health_admit?.({rows_read:500,rows_written:22})?.allowed===true;
 if(!dbGrant())return{...root,status:'SOURCE_DB_HEADROOM_REQUIRED'};
 const get=async(url,market,kind)=>{
  const id=`N12_${venue}:${run_id}:${contract}:${++sequence}`,receipt={url,kind,market,status:'NOT_ATTEMPTED',actual_http:0};receipts.push(receipt);
  if(providerBlocked){receipt.status='VENUE_BACKOFF_THIS_INVOCATION';return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  if(!dbGrant()){receipt.status='SOURCE_DB_HEADROOM_REQUIRED';return null;}
  if(await cacheRead({source:`N12_PROVIDER_BACKOFF:${venue}`,asset_key:'SHARED',now:clock()})){receipt.status='DURABLE_VENUE_BACKOFF';return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  if(!await n05SourceHasHeadroom(db,source,N05_N12_PUBLIC_SOURCE_DAILY_CAP,clock())){receipt.status='SOURCE_DAILY_CAP_DENIED';return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  const units=venue==='KUCOIN'?kind==='CURRENCIES'?3:kind==='CATALOG'?(market==='SPOT'?4:3):(market==='SPOT'?3:5):1;
  if(!await publicVenueHasMinuteHeadroom(db,venue,units,clock())){receipt.status='ROLLING_60S_CAP_REACHED';return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  const grant=request_admit?.({logical_request_id:id,lane:'background',attempts:1});
  if(grant?.allowed!==true||grant.duplicate){receipt.status=grant?.status||'WHOLE_JOB_HTTP_ADMISSION_REQUIRED';return null;}
  const daily=await reserveEvidenceSourceAttempts(db,{source,reservation_id:id,attempts:1,daily_cap:N05_N12_PUBLIC_SOURCE_DAILY_CAP,now:clock()});if(!daily.allowed){receipt.status=daily.status;return null;}
  const minute=await reserveProviderMinuteUnits(db,{provider:venue,reservation_id:id,units,cap:publicVenueMinuteCap(venue),now:clock()});if(!minute.allowed){receipt.status=minute.status;return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  try{
   calls++;receipt.actual_http=1;const response=await fetch_impl(url,{headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)});receipt.http_status=response.status;if([401,403,429,451].includes(response.status))providerBlocked=true;
   const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(chunk);}const bytes=Buffer.concat(chunks);receipt.received_ts=clock();receipt.body_sha256=sha(bytes);receipt.bytes=size;
   if([401,403,429,451].includes(response.status)&&dbGrant()){const retry=Number(response.headers.get('retry-after'));await cacheWrite({source:`N12_PROVIDER_BACKOFF:${venue}`,asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,Number.isFinite(retry)&&retry>0?retry*1000:0),payload:{http_status:response.status,source_ts:receipt.received_ts}});}
   if(response.status!==200){receipt.status='HTTP_'+response.status;return null;}
   const payload=parseN12PublicTradeJson(bytes.toString('utf8'),{venue});if(payload?.code!==(venue==='OKX'?'0':'200000')||!Array.isArray(payload.data)){receipt.status='INVALID_PROVIDER_SCHEMA';return null;}
   receipt.status='RECEIVED_NOT_QUALIFIED';return payload;
  }catch(error){receipt.status=String(error.message).slice(0,80);return null;}
 };
 const evidence=[],marketStatus=[];
 let currencies=null;
 if(token){const key='N12:CURRENCIES:APPROVED',prior=await cacheRead({source,asset_key:key,now,include_cache_clock:true});currencies=prior?.version===N12_NATIVE_PUBLIC_COLLECTOR_VERSION&&prior.observed_ts<=now&&now-prior.observed_ts<=21600000?prior.payload:null;
  if(!currencies){const received=await get('https://api.kucoin.com/api/v3/currencies','ALL','CURRENCIES');if(!received)return{...root,status:receipts.at(-1)?.status||'CURRENCIES_NOT_RECEIVED',network_calls:calls};currencies=compactN12KucoinTokenCurrencies(received);if(!currencies)return{...root,status:'INVALID_CURRENCIES',network_calls:calls};const stored={version:N12_NATIVE_PUBLIC_COLLECTOR_VERSION,observed_ts:receipts.at(-1).received_ts,payload:currencies};if(dbGrant()&&Buffer.byteLength(JSON.stringify(stored))<=900000)await cacheWrite({source,asset_key:key,observed_ts:receipts.at(-1).received_ts,expires_ts:receipts.at(-1).received_ts+21600000,payload:stored});}
  if(!exactN12KucoinTokenCurrency({contract,identity,identity_method,asset_binding_proof,currencies}))return{...root,status:'EXACT_TOKEN_CHAIN_ADDRESS_NOT_CLOSED',network_calls:calls};
 }
 for(const market of ['SPOT','FUTURES']){
  if(unclosed()){marketStatus.push({market,status:'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE'});break;}
  try{
  const key=catalogKey(venue,market,contract),prior=await cacheRead({source,asset_key:key,now,include_cache_clock:true});
  let catalog=prior?.version===N12_NATIVE_PUBLIC_COLLECTOR_VERSION&&prior.observed_ts<=now&&now-prior.observed_ts<=21600000?prior.payload:null;
  if(!catalog){const received=await get(catalogUrl(venue,market,contract),market,'CATALOG');if(!received){marketStatus.push({market,status:receipts.at(-1)?.status||'CATALOG_NOT_RECEIVED'});continue;}catalog=compactN12NativeCatalog(venue,market,contract,received);if(!catalog){marketStatus.push({market,status:'INVALID_CATALOG'});continue;}const stored={version:N12_NATIVE_PUBLIC_COLLECTOR_VERSION,observed_ts:receipts.at(-1).received_ts,payload:catalog};if(dbGrant()&&Buffer.byteLength(JSON.stringify(stored))<=900000)await cacheWrite({source,asset_key:key,observed_ts:receipts.at(-1).received_ts,expires_ts:receipts.at(-1).received_ts+21600000,payload:stored});}
  const match=instrument(venue,market,contract,catalog);
  if(!(native?exactN12NativePublicBinding({venue,market,contract,identity,instrument:match}):exactN12KucoinTokenMarket({contract,market,instrument:match}))){marketStatus.push({market,status:'EXACT_MARKET_BINDING_NOT_CLOSED'});continue;}
  const end=Math.floor(now/60000)*60000,tradeKey=`N12:TRADES:${contract}:${market}:${end}`,cached=await cacheRead({source,asset_key:tradeKey,now,include_cache_clock:true});
  const valid=native?validateN12NativePublicTrade:validateN12KucoinTokenTrade;
  if(cached?.version===N12_NATIVE_PUBLIC_COLLECTOR_VERSION&&exactCachedN12TradeResult(cached.result,{contract,identity,venue,market,now,window_end_ts:end,validate:valid})){evidence.push(...cached.result.evidence);marketStatus.push({market,status:'HIT_ORIGINAL_SOURCE_CLOCKS'});continue;}
  const page=await get(tradesUrl(venue,market,contract),market,'TRADES');if(!page){marketStatus.push({market,status:receipts.at(-1)?.status||'TRADES_NOT_RECEIVED'});continue;}
  const result=native?normalizeN12NativePublicTrades({venue,market,contract,identity,instrument:match,payload:page,window_end_ts:end,observed_ts:receipts.at(-1).received_ts}):normalizeN12KucoinTokenTrades({contract,market,identity,identity_method,asset_binding_proof,currencies,instrument:match,payload:page,window_end_ts:end,observed_ts:receipts.at(-1).received_ts});evidence.push(...result.evidence);marketStatus.push({market,status:result.status,summary:result.summary});
  if(result.evidence.length&&dbGrant())await cacheWrite({source,asset_key:tradeKey,observed_ts:receipts.at(-1).received_ts,expires_ts:Math.min(receipts.at(-1).received_ts+60000,result.evidence[0].expires_at),payload:{version:N12_NATIVE_PUBLIC_COLLECTOR_VERSION,result}});
  }catch{marketStatus.push({market,status:'MARKET_SOURCE_OR_STORE_ERROR'});}
 }
 return{...root,status:evidence.length?'CLOSED_BOUNDED_N12_PUBLIC_TRADES':'NO_USEFUL_PUBLIC_TRADE_SAMPLE',check_completed:evidence.length>0,evidence,market_status:marketStatus,network_calls:calls};
}

export const collectOkxN12NativeTrades=params=>collectN12NativePublicVenue(params,'OKX');
export const collectKucoinN12NativeTrades=params=>collectN12NativePublicVenue(params,'KUCOIN');
export const collectKucoinN12ExactTrades=collectKucoinN12NativeTrades;
