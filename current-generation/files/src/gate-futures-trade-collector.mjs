import {verifiedAssetRouteIdentity} from './verified-asset-route-identity.mjs';
import {N05_N12_PUBLIC_SOURCE_DAILY_CAP,publicVenueMinuteCap,publicVenueHasMinuteHeadroom} from './public-venue-source-budget.mjs';
import {createHash} from 'node:crypto';
import {n05SourceHasHeadroom} from './n05-source-headroom.mjs';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeOptionalEvidenceSourceCache,nativeSourceUsageUnclosed} from './evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';
import {exactGateTokenBinding} from './gate-four-hour-flow.mjs';
import {normalizeGateFuturesTradeSample,validateGateFuturesTradeSample} from './gate-futures-trade-sample.mjs';
import {exactCachedN12TradeResult} from './n12-cached-trade-scope.mjs';

const SOURCE='N05_OFFICIAL_FLOW:GATE',GATE_VERSION='gate-flow-collector-v1-20261010',VERSION='gate-futures-trade-collector-v1-20261011';
const digest=b=>createHash('sha256').update(b).digest('hex');

// This optional N12 route runs inside the existing five-call N05 envelope and
// spends the SAME Gate daily/minute ledgers. A different market at Gate is not
// an additional independent venue.
export async function collectGateFuturesTradeSample(params={}){
 const {db,contract,asset_identity:identity,identity_method,run_id,request_admit,source_health_admit,fetch_impl=globalThis.fetch,clock=Date.now}=params,now=params.now??clock(),receipts=[];
 const cache_write_receipts=[],root={version:VERSION,status:'EXACT_GATE_IDENTITY_AND_SHARED_METADATA_REQUIRED',check_completed:false,evidence:[],network_calls:0,receipts,cache_write_receipts,components:[],internal_only:true};let calls=0,sequence=0;
 if(!db?.prepare||!run_id||!/^\S+-USDT$/u.test(String(contract||''))||identity?.asset_kind==='NATIVE'||!identity?.contract_or_mint||!verifiedAssetRouteIdentity(params))return root;
 let providerBlocked=false;
 const unclosed=()=>nativeSourceUsageUnclosed(db);
 if(unclosed())return{...root,status:'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE'};
 const cacheRead=async input=>unclosed()?null:readEvidenceSourceCache(db,input);
 const cacheWrite=async input=>{const receipt=await writeOptionalEvidenceSourceCache(db,input);cache_write_receipts.push({asset_key:input.asset_key,...receipt});return receipt;};
 const dbGrant=()=>!unclosed()&&source_health_admit?.({rows_read:500,rows_written:22})?.allowed===true;
 if(!dbGrant())return{...root,status:'FLOW_DB_HEADROOM_REQUIRED'};
 const currenciesCache=await cacheRead({source:'GATE_ASSET_REFERENCE',asset_key:'N05:CURRENCIES',now,include_cache_clock:true});
 const spotCache=await cacheRead({source:SOURCE,asset_key:'METADATA:SPOT',now,include_cache_clock:true});
 const validCache=c=>c?.version===GATE_VERSION&&Number.isSafeInteger(c.observed_ts)&&c.observed_ts<=now&&now-c.observed_ts<=21600000&&Array.isArray(c.payload);
 if(!validCache(currenciesCache)||!validCache(spotCache)||!exactGateTokenBinding({contract,identity,currencies:currenciesCache.payload,spot:spotCache.payload}))return root;
 const pair=contract.slice(0,-5)+'_USDT',key=`N12:FUTURES:${contract}`,prior=await cacheRead({source:SOURCE,asset_key:key,now,include_cache_clock:true});
 if(prior?.version===VERSION&&exactCachedN12TradeResult(prior.result,{contract,identity,venue:'GATE',market:'FUTURES',now,validate:validateGateFuturesTradeSample}))return{...root,...prior.result,network_calls:0,receipts:[{status:'HIT_ORIGINAL_SOURCE_CLOCKS',actual_http:0,source_ts:prior.result.evidence[0]?.source_ts}],cache_status:'HIT_ORIGINAL_SOURCE_CLOCKS'};
 const get=async url=>{
  const id=`N12_GATE_FUTURES:${run_id}:${contract}:${++sequence}`,receipt={url,status:'NOT_ATTEMPTED',actual_http:0,http_status:null};receipts.push(receipt);
  if(providerBlocked){receipt.status='VENUE_BACKOFF_THIS_INVOCATION';return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  if(!dbGrant()){receipt.status='FLOW_DB_HEADROOM_REQUIRED';return null;}
  if(await cacheRead({source:'N05_PROVIDER_BACKOFF:GATE',asset_key:'SHARED',now:clock()})){receipt.status='DURABLE_VENUE_BACKOFF';return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  if(!await n05SourceHasHeadroom(db,SOURCE,N05_N12_PUBLIC_SOURCE_DAILY_CAP,clock())){receipt.status='SOURCE_DAILY_CAP_DENIED';return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  if(!await publicVenueHasMinuteHeadroom(db,'GATE',1,clock())){receipt.status='ROLLING_60S_CAP_REACHED';return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  const grant=request_admit?.({logical_request_id:id,lane:'background',attempts:1});
  if(grant?.allowed!==true||grant.duplicate){receipt.status=grant?.status||'WHOLE_JOB_HTTP_ADMISSION_REQUIRED';return null;}
  const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:id,attempts:1,daily_cap:N05_N12_PUBLIC_SOURCE_DAILY_CAP,now:clock()});
  if(!admission.allowed){receipt.status=admission.status;return null;}
  const minute=await reserveProviderMinuteUnits(db,{provider:'GATE',reservation_id:id,units:1,cap:publicVenueMinuteCap('GATE'),now:clock()});
  if(!minute.allowed){receipt.status=minute.status;return null;}
  if(unclosed()){receipt.status='SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';return null;}
  try{
   calls++;receipt.actual_http=1;const response=await fetch_impl(url,{headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)});receipt.http_status=response.status;if([401,403,429,451].includes(response.status))providerBlocked=true;
   const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>2*1024*1024)throw Error('BODY_LIMIT');chunks.push(chunk);}
   const body=Buffer.concat(chunks);receipt.received_ts=clock();receipt.body_sha256=digest(body);receipt.bytes=size;
   if([401,403,429,451].includes(response.status)&&dbGrant()){const seconds=Number(response.headers.get('retry-after'));await cacheWrite({source:'N05_PROVIDER_BACKOFF:GATE',asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,Number.isSafeInteger(seconds)&&seconds>0?seconds*1000:0),payload:{http_status:response.status,original_received_ts:receipt.received_ts}});}
   if(response.status!==200){receipt.status='HTTP_'+response.status;return null;}
   const parsed=JSON.parse(body);receipt.status='RECEIVED_NOT_QUALIFIED';return parsed;
  }catch(error){receipt.status=String(error.message).slice(0,80);return null;}
 };
 const metadataKey=`N12:CONTRACT:${pair}`,metaCache=await cacheRead({source:SOURCE,asset_key:metadataKey,now,include_cache_clock:true});
 let futureContract=metaCache?.version===VERSION&&metaCache.observed_ts<=now&&now-metaCache.observed_ts<=3600000?metaCache.payload:null;
 if(!futureContract){futureContract=await get(`https://api.gateio.ws/api/v4/futures/usdt/contracts/${encodeURIComponent(pair)}`);if(!futureContract||Array.isArray(futureContract))return{...root,status:receipts.at(-1)?.status||'GATE_FUTURES_CONTRACT_NOT_RECEIVED',network_calls:calls};if(dbGrant())await cacheWrite({source:SOURCE,asset_key:metadataKey,observed_ts:receipts.at(-1).received_ts,expires_ts:receipts.at(-1).received_ts+3600000,payload:{version:VERSION,observed_ts:receipts.at(-1).received_ts,payload:futureContract}});}
 if(futureContract.name!==pair||futureContract.status!=='trading'||futureContract.in_delisting===true||futureContract.type!=='direct')return{...root,status:'GATE_FUTURES_CONTRACT_NOT_TRADING',network_calls:calls};
 const trades=await get(`https://api.gateio.ws/api/v4/futures/usdt/trades?contract=${encodeURIComponent(pair)}&limit=1000`);
 if(!Array.isArray(trades))return{...root,status:receipts.at(-1)?.status||'GATE_FUTURES_TRADES_NOT_RECEIVED',network_calls:calls};
 const observed_ts=receipts.at(-1).received_ts,result=normalizeGateFuturesTradeSample({contract,identity,currencies:currenciesCache.payload,spot:spotCache.payload,future_contract:futureContract,trades,observed_ts});
 const final={...root,...result,network_calls:calls,receipts,source_body_sha256:receipts.at(-1).body_sha256,source_clock_policy:'ORIGINAL_GATE_TRADE_TIMESTAMPS'};
 if(result.check_completed&&result.evidence.length&&dbGrant())await cacheWrite({source:SOURCE,asset_key:key,observed_ts,expires_ts:Math.min(observed_ts+60000,result.evidence[0].expires_at),payload:{version:VERSION,result:final}});
 return final;
}
