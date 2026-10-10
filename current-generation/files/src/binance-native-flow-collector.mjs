import {n05SourceHasHeadroom} from './n05-source-headroom.mjs';
import {createHash} from 'node:crypto';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';
import {BINANCE_NATIVE_REFERENCES,exactBinanceNativeIdentity,exactBinanceNativeBinding,normalizeBinanceNativeFlow} from './binance-native-four-hour-flow.mjs';
const SOURCE='N05_OFFICIAL_FLOW:BINANCE',VERSION='binance-native-flow-collector-v2-shared-catalog-20261010',hash=b=>createHash('sha256').update(b).digest('hex');
export async function collectBinanceNativeFlow(params={}){
 const {db,contract,asset_identity:identity,identity_method,run_id,request_admit,source_health_admit,fetch_impl=globalThis.fetch,clock=Date.now}=params,now=params.now??clock(),receipts=[];
 const root={version:VERSION,status:'EXACT_PRIMARY_NATIVE_ASSET_BINDING_REQUIRED',check_completed:false,network_calls:0,evidence:[],components:[],receipts,internal_only:true};let calls=0,sequence=0;
 if(!db?.prepare||!run_id||!exactBinanceNativeIdentity(contract,identity)||!['HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK','HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS','VERSIONED_EXPLORER_EXACT_TOKEN_BINDING'].includes(identity_method))return root;
 const admitDb=()=>source_health_admit?.({rows_read:500,rows_written:22})?.allowed===true;
 const get=async(url)=>{
  const id=`N05_BINANCE:${run_id}:${contract}:${++sequence}`,receipt={url,http_status:null,received_ts:null,actual_http:0,status:'NOT_ATTEMPTED'};receipts.push(receipt);
  if(!admitDb()){receipt.status='FLOW_DB_HEADROOM_REQUIRED';return null;}
  const backoff=await readEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:BINANCE',asset_key:'SHARED',now:clock()});if(backoff){receipt.status='DURABLE_VENUE_BACKOFF';return null;}
  if(!await n05SourceHasHeadroom(db,SOURCE,16,clock())){receipt.status='SOURCE_DAILY_CAP_DENIED';return null;}
  const grant=request_admit?.({logical_request_id:id,lane:'background',attempts:1});if(grant?.allowed!==true||grant.duplicate){receipt.status=grant?.status||'WHOLE_JOB_HTTP_ADMISSION_REQUIRED';return null;}
  const daily=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:id,attempts:1,daily_cap:16,now:clock()});if(!daily.allowed){receipt.status='SOURCE_DAILY_CAP_DENIED';return null;}
  const minute=await reserveProviderMinuteUnits(db,{provider:'BINANCE',reservation_id:id,units:1,cap:6,now:clock()});if(!minute.allowed){receipt.status=minute.status;return null;}
  try{
   calls++;receipt.actual_http=1;const response=await fetch_impl(url,{headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)}),chunks=[];let size=0;receipt.http_status=response.status;
   for await(const c of response.body){size+=c.length;if(size>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(c);}const bytes=Buffer.concat(chunks);receipt.received_ts=clock();receipt.body_sha256=hash(bytes);receipt.bytes=size;
   if([401,403,429,451].includes(response.status)){const retry=response.headers.get('retry-after'),seconds=/^\d+$/.test(retry||'')?Number(retry):0;if(admitDb())await writeEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:BINANCE',asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:response.status,original_received_ts:receipt.received_ts}});}
   if(response.status!==200){receipt.status='HTTP_'+response.status;return null;}const p=JSON.parse(bytes);receipt.status='RECEIVED_NOT_QUALIFIED';return p;
  }catch(e){receipt.status=e.message;receipt.received_ts??=clock();return null;}
 };
 try{
  if(!admitDb())return{...root,status:'FLOW_DB_HEADROOM_REQUIRED'};
  const end=Math.floor(now/60000)*60000,key=`NATIVE_FLOW:${contract}:${end}`,old=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now,include_cache_clock:true});
  if(old?.version===VERSION&&old.observed_ts<=now&&old.observed_ts>=end){const component=normalizeBinanceNativeFlow({contract,identity,catalog:old.catalog,candles:old.candles,window_end_ts:end,observed_ts:old.observed_ts});return{...root,status:component.status,components:[component],network_calls:calls,cache_status:'HIT_ORIGINAL_CLOCKS',check_completed:component.check_completed};}
  const symbol=contract.replace(/-USDT$/,'USDT'),metaKey='NATIVE_METADATA:ALL_PRIMARY_NATIVE_MARKETS_V2',cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:metaKey,now,include_cache_clock:true});let catalog;
  if(cached?.version===VERSION&&cached.observed_ts<=now&&now-cached.observed_ts<=21600000){catalog=cached.catalog;receipts.push({...cached.receipt,actual_http:0,cache_status:'HIT_ORIGINAL_CLOCKS'});}
  else{const p=await get('https://data-api.binance.vision/api/v3/exchangeInfo?showPermissionSets=false&symbolStatus=TRADING&permissions=SPOT');if(!Array.isArray(p?.symbols))return{...root,status:receipts.at(-1)?.status||'INVALID_METADATA',network_calls:calls};catalog={symbols:p.symbols.filter(r=>BINANCE_NATIVE_REFERENCES[r.baseAsset]&&r.quoteAsset==='USDT').map(r=>({symbol:r.symbol,baseAsset:r.baseAsset,quoteAsset:r.quoteAsset,status:r.status,isSpotTradingAllowed:r.isSpotTradingAllowed}))};const ts=receipts.at(-1).received_ts;if(admitDb())await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:metaKey,observed_ts:ts,expires_ts:ts+21600000,payload:{version:VERSION,observed_ts:ts,catalog,receipt:receipts.at(-1)}});}
  if(!exactBinanceNativeBinding({contract,identity,catalog}))return{...root,status:'EXACT_PRIMARY_NATIVE_ASSET_BINDING_REQUIRED',network_calls:calls};
  const candles=await get(`https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1m&startTime=${end-14400000}&endTime=${end-1}&limit=240`),ts=receipts.at(-1)?.received_ts;
  const component=normalizeBinanceNativeFlow({contract,identity,catalog,candles,window_end_ts:end,observed_ts:ts});
  if(component.check_completed&&admitDb())await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:ts,expires_ts:end+300000,payload:{version:VERSION,observed_ts:ts,catalog,candles}});
  return{...root,status:component.status,reason:component.reason,components:[{...component,receipt_hashes:receipts.filter(r=>r.body_sha256).map(r=>r.body_sha256)}],check_completed:component.check_completed,network_calls:calls};
 }catch(e){return{...root,status:'FLOW_COLLECTOR_ERROR',reason:e.message,network_calls:calls};}
}
