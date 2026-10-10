import {n05SourceHasHeadroom} from './n05-source-headroom.mjs';
import {createHash} from 'node:crypto';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';
import {exactKrakenNativeIdentity,exactKrakenNativeBinding,normalizeKrakenNativeFlow,krakenNativeMarketCode} from './kraken-four-hour-flow.mjs';
import {KRAKEN_PUBLIC_TAKER_REFERENCE} from './kraken-public-taker-reference.mjs';
const SOURCE='N05_OFFICIAL_FLOW:KRAKEN',VERSION='kraken-native-flow-collector-v1-20261010',hash=b=>createHash('sha256').update(b).digest('hex');
export async function collectKrakenFlow(params={}){
 const {db,contract,asset_identity:identity,identity_method,run_id,request_admit,source_health_admit,fetch_impl=globalThis.fetch,clock=Date.now}=params,now=params.now??clock(),receipts=[];
 const root={version:VERSION,status:'EXACT_PRIMARY_NATIVE_ASSET_BINDING_REQUIRED',check_completed:false,network_calls:0,evidence:[],components:[],receipts,internal_only:true};let calls=0,sequence=0;
 if(!db?.prepare||!run_id||!exactKrakenNativeIdentity(contract,identity)||KRAKEN_PUBLIC_TAKER_REFERENCE.verified!==true||!['HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK','HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS','VERSIONED_EXPLORER_EXACT_TOKEN_BINDING'].includes(identity_method))return root;
 const admitDb=()=>source_health_admit?.({rows_read:500,rows_written:22})?.allowed===true;
 const get=async(url)=>{
  const id=`N05_KRAKEN:${run_id}:${contract}:${++sequence}`,receipt={url,http_status:null,received_ts:null,actual_http:0,status:'NOT_ATTEMPTED'};receipts.push(receipt);
  if(calls>=5){receipt.status='CALLER_FIVE_REQUEST_CAP';return null;}
  if(!admitDb()){receipt.status='FLOW_DB_HEADROOM_REQUIRED';return null;}
  const backoff=await readEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:KRAKEN',asset_key:'SHARED',now:clock()});if(backoff){receipt.status='DURABLE_VENUE_BACKOFF';return null;}
  if(!await n05SourceHasHeadroom(db,SOURCE,16,clock())){receipt.status='SOURCE_DAILY_CAP_DENIED';return null;}
  const grant=request_admit?.({logical_request_id:id,lane:'background',attempts:1});if(grant?.allowed!==true||grant.duplicate){receipt.status=grant?.status||'WHOLE_JOB_HTTP_ADMISSION_REQUIRED';return null;}
  const daily=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:id,attempts:1,daily_cap:16,now:clock()});if(!daily.allowed){receipt.status='SOURCE_DAILY_CAP_DENIED';return null;}
  const minute=await reserveProviderMinuteUnits(db,{provider:'KRAKEN',reservation_id:id,units:1,cap:6,now:clock()});if(!minute.allowed){receipt.status=minute.status;return null;}
  try{
   calls++;receipt.actual_http=1;const response=await fetch_impl(url,{headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)}),chunks=[];let size=0;receipt.http_status=response.status;
   for await(const c of response.body){size+=c.length;if(size>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(c);}const bytes=Buffer.concat(chunks);receipt.received_ts=clock();receipt.body_sha256=hash(bytes);receipt.bytes=size;
   if([401,403,429,451].includes(response.status)){const retry=response.headers.get('retry-after'),seconds=/^\d+$/.test(retry||'')?Number(retry):0;if(admitDb())await writeEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:KRAKEN',asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:response.status,original_received_ts:receipt.received_ts}});}
   if(response.status!==200){receipt.status='HTTP_'+response.status;return null;}const p=JSON.parse(bytes);receipt.status='RECEIVED_NOT_QUALIFIED';return p;
  }catch(e){receipt.status=e.message;receipt.received_ts??=clock();return null;}
 };
 try{
  if(!admitDb())return{...root,status:'FLOW_DB_HEADROOM_REQUIRED'};
  const end=Math.floor(now/60000)*60000,key=`NATIVE_FLOW:${contract}:${end}`,old=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now,include_cache_clock:true});
  if(old?.version===VERSION&&old.observed_ts<=now&&old.observed_ts>=end){const component=normalizeKrakenNativeFlow({contract,identity,instrument:old.instrument,candles:old.candles,pages:old.pages,window_end_ts:end,observed_ts:old.observed_ts,direction_reference:KRAKEN_PUBLIC_TAKER_REFERENCE});return{...root,status:component.status,components:[component],network_calls:calls,cache_status:'HIT_ORIGINAL_CLOCKS',check_completed:component.check_completed};}
  const symbol=krakenNativeMarketCode(contract),metaKey='NATIVE_METADATA:ALL_PAIRS',cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:metaKey,now,include_cache_clock:true});let catalog;
  if(cached?.version===VERSION&&cached.observed_ts<=now&&now-cached.observed_ts<=21600000){catalog=cached.catalog;receipts.push({...cached.receipt,actual_http:0,cache_status:'HIT_ORIGINAL_CLOCKS'});}
  else{const p=await get('https://api.kraken.com/0/public/AssetPairs');if(p?.error?.length!==0||!p.result)return{...root,status:receipts.at(-1)?.status||'INVALID_METADATA',network_calls:calls};catalog=Object.values(p.result).filter(r=>r.quote==='USDT').map(r=>({base:r.base,quote:r.quote,wsname:r.wsname,altname:r.altname,status:r.status}));const ts=receipts.at(-1).received_ts;if(admitDb())await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:metaKey,observed_ts:ts,expires_ts:ts+21600000,payload:{version:VERSION,observed_ts:ts,catalog,receipt:receipts.at(-1)}});}
  const instruments=catalog.filter(r=>r.altname===symbol);if(instruments.length!==1||!exactKrakenNativeBinding({contract,identity,instrument:instruments[0]}))return{...root,status:'EXACT_PRIMARY_NATIVE_ASSET_BINDING_REQUIRED',network_calls:calls};
  const instrument=instruments[0],candles=await get('https://api.kraken.com/0/public/OHLC?pair='+encodeURIComponent(symbol)+'&interval=1&since='+(end-14400000)/1000),pages=[];let component,cursor=(BigInt(end-14400000)*1000000n-1n).toString();
  if(!candles)return{...root,status:receipts.at(-1)?.status||'NATIVE_CANDLES_NOT_RECEIVED',network_calls:calls};
  for(let page=0;page<3;page++){const p=await get('https://api.kraken.com/0/public/Trades?pair='+encodeURIComponent(symbol)+'&since='+cursor+'&count=1000');if(!p)break;pages.push(p);component=normalizeKrakenNativeFlow({contract,identity,instrument,candles,pages,window_end_ts:end,observed_ts:receipts.at(-1).received_ts,direction_reference:KRAKEN_PUBLIC_TAKER_REFERENCE});if(component.check_completed)break;const rows=p.result?.[symbol],next=p.result?.last;if(!Array.isArray(rows)||rows.length<1000||!/^\d+$/.test(String(next))||BigInt(next)<=BigInt(cursor)||rows.at(-1)?.[2]*1000>=end)break;cursor=String(next);}
  if(!component)return{...root,status:receipts.at(-1)?.status||'KRAKEN_WINDOW_NOT_CLOSED',network_calls:calls};
  const ts=component.observed_ts,payload={version:VERSION,observed_ts:ts,instrument,candles,pages};
  if(component.check_completed&&Buffer.byteLength(JSON.stringify(payload))<=900000&&admitDb())await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:ts,expires_ts:end+300000,payload});
  return{...root,status:component.status,reason:component.reason,components:[{...component,receipt_hashes:receipts.filter(r=>r.body_sha256).map(r=>r.body_sha256)}],check_completed:component.check_completed,network_calls:calls};
 }catch(e){return{...root,status:'FLOW_COLLECTOR_ERROR',reason:e.message,network_calls:calls};}
}
