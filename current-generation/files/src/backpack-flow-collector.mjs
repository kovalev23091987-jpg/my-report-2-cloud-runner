import {n05SourceHasHeadroom} from './n05-source-headroom.mjs';
import {createHash} from 'node:crypto';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';
import {exactBackpackTokenBinding,normalizeBackpackSpotFlow} from './backpack-four-hour-flow.mjs';
const SOURCE='N05_OFFICIAL_FLOW:BACKPACK',VERSION='backpack-flow-collector-v1-20261010',hash=b=>createHash('sha256').update(b).digest('hex');
export async function collectBackpackFlow(params={}){
 const {db,contract,asset_identity:identity,identity_method,run_id,request_admit,source_health_admit,fetch_impl=globalThis.fetch,clock=Date.now}=params,now=params.now??clock(),receipts=[];
 const root={version:VERSION,status:'EXACT_BACKPACK_TOKEN_BINDING_REQUIRED',check_completed:false,network_calls:0,evidence:[],components:[],receipts,internal_only:true};let calls=0,sequence=0;
 if(!db?.prepare||!run_id||identity?.asset_kind==='NATIVE'||!identity?.contract_or_mint||!['HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS','VERSIONED_EXPLORER_EXACT_TOKEN_BINDING'].includes(identity_method))return root;
 const admitDb=()=>source_health_admit?.({rows_read:500,rows_written:22})?.allowed===true;
 const get=async(url,source=SOURCE,daily_cap=16)=>{
  const id=`N05_BACKPACK:${run_id}:${contract}:${++sequence}`,receipt={url,http_status:null,received_ts:null,actual_http:0,status:'NOT_ATTEMPTED'};receipts.push(receipt);
  if(calls>=5){receipt.status='CALLER_FIVE_REQUEST_CAP';return null;}
  if(!admitDb()){receipt.status='FLOW_DB_HEADROOM_REQUIRED';return null;}
  const backoff=await readEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:BACKPACK',asset_key:'SHARED',now:clock()});if(backoff){receipt.status='DURABLE_VENUE_BACKOFF';return null;}
  if(!await n05SourceHasHeadroom(db,SOURCE,16,clock())||source!==SOURCE&&!await n05SourceHasHeadroom(db,source,daily_cap,clock())){receipt.status='SOURCE_DAILY_CAP_DENIED';return null;}
  const grant=request_admit?.({logical_request_id:id,lane:'background',attempts:1});if(grant?.allowed!==true||grant.duplicate){receipt.status=grant?.status||'WHOLE_JOB_HTTP_ADMISSION_REQUIRED';return null;}
  const daily=await reserveEvidenceSourceAttempts(db,{source,reservation_id:id,attempts:1,daily_cap,now:clock()});if(!daily.allowed){receipt.status='SOURCE_DAILY_CAP_DENIED';return null;}
  const minute=await reserveProviderMinuteUnits(db,{provider:'BACKPACK',reservation_id:id,units:1,cap:6,now:clock()});if(!minute.allowed){receipt.status=minute.status;return null;}
  try{
   calls++;receipt.actual_http=1;const response=await fetch_impl(url,{headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)}),chunks=[];let size=0;receipt.http_status=response.status;
   for await(const c of response.body){size+=c.length;if(size>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(c);}const bytes=Buffer.concat(chunks);receipt.received_ts=clock();receipt.body_sha256=hash(bytes);receipt.bytes=size;
   if([401,403,429,451].includes(response.status)){const retry=response.headers.get('retry-after'),seconds=/^\d+$/.test(retry||'')?Number(retry):0;if(admitDb())await writeEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:BACKPACK',asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:response.status,original_received_ts:receipt.received_ts}});}
   if(response.status!==200){receipt.status='HTTP_'+response.status;return null;}const p=JSON.parse(bytes);receipt.status='RECEIVED_NOT_QUALIFIED';return p;
  }catch(e){receipt.status=e.message;receipt.received_ts??=clock();return null;}
 };
 try{
  if(!admitDb())return{...root,status:'FLOW_DB_HEADROOM_REQUIRED'};
  const end=Math.floor(now/60000)*60000,key=`TOKEN_FLOW:${contract}:${end}`,old=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now,include_cache_clock:true});
  if(old?.version===VERSION&&old.observed_ts<=now&&old.observed_ts>=end){const component=normalizeBackpackSpotFlow({contract,identity,assets:old.assets,markets:old.markets,pages:old.pages,candles:old.candles,window_end_ts:end,observed_ts:old.observed_ts,quote:old.quote});return{...root,status:component.status,components:[component],network_calls:calls,cache_status:'HIT_ORIGINAL_CLOCKS',check_completed:component.check_completed};}
  async function metadata(source,key,url,compact,cap=16){const c=await readEvidenceSourceCache(db,{source,asset_key:key,now,include_cache_clock:true});if(c?.version===VERSION&&c.observed_ts<=now&&now-c.observed_ts<=21600000){receipts.push({...c.receipt,actual_http:0,cache_status:'HIT_ORIGINAL_CLOCKS'});return c.payload;}const p=await get(url,source,cap);if(!Array.isArray(p))return null;const payload=compact(p),ts=receipts.at(-1).received_ts;if(Buffer.byteLength(JSON.stringify(payload))<900000&&admitDb())await writeEvidenceSourceCache(db,{source,asset_key:key,observed_ts:ts,expires_ts:ts+21600000,payload:{version:VERSION,observed_ts:ts,payload,receipt:receipts.at(-1)}});return payload;}
  const assets=await metadata(SOURCE,'METADATA:ASSETS','https://api.backpack.exchange/api/v1/assets',p=>p.filter(r=>!r.symbol.includes('.')).map(r=>({symbol:r.symbol,tokens:(r.tokens||[]).filter(t=>typeof t.contractAddress==='string').map(t=>({blockchain:t.blockchain,contractAddress:t.contractAddress}))})));
  if(!assets)return{...root,status:receipts.at(-1)?.status||'INVALID_BACKPACK_IDENTITY',network_calls:calls};
  const markets=await metadata(SOURCE,'METADATA:SPOT','https://api.backpack.exchange/api/v1/markets',p=>p.filter(r=>r.marketType==='SPOT'&&!r.rwaMarketType&&r.orderBookState==='Open'&&r.visible===true&&['USDT','USDC'].includes(r.quoteSymbol)).map(r=>({symbol:r.symbol,baseSymbol:r.baseSymbol,quoteSymbol:r.quoteSymbol,marketType:r.marketType,orderBookState:r.orderBookState,visible:r.visible,rwaMarketType:r.rwaMarketType})));
  const quote=['USDT','USDC'].find(quote=>exactBackpackTokenBinding({contract,identity,assets,markets,quote}));
  if(!quote)return{...root,network_calls:calls};
  const symbol=contract.slice(0,-5)+'_'+quote,query=`symbol=${encodeURIComponent(symbol)}`,candles=await get('https://api.backpack.exchange/api/v1/klines?'+query+'&interval=1m&startTime='+(end-14400000)/1000+'&endTime='+end/1000+'&priceType=Last&source=Venue'),pages=[];let component;
  if(!Array.isArray(candles)||candles.length!==240)return{...root,status:'NATIVE_240_MINUTE_GRID_REQUIRED',network_calls:calls};
  for(let page=0;page<3;page++){const rows=await get('https://api.backpack.exchange/api/v1/trades/history?'+query+'&limit=1000&offset='+page*1000);if(!Array.isArray(rows))break;pages.push(rows);component=normalizeBackpackSpotFlow({contract,identity,assets,markets,quote,pages,candles,window_end_ts:end,observed_ts:receipts.at(-1).received_ts});if(component.check_completed||rows.length<1000||rows.at(-1)?.timestamp<end-14400000)break;}
  if(!component)return{...root,status:receipts.at(-1)?.status||'BACKPACK_WINDOW_NOT_CLOSED',network_calls:calls};
  const ts=component.observed_ts,payload={version:VERSION,observed_ts:ts,assets:assets.filter(r=>r.symbol===contract.slice(0,-5)),markets:markets.filter(r=>r.symbol===symbol),quote,pages,candles};
  if(component.check_completed&&Buffer.byteLength(JSON.stringify(payload))<=900000&&admitDb())await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:ts,expires_ts:end+300000,payload});
  return{...root,status:component.status,reason:component.reason,components:[{...component,receipt_hashes:receipts.filter(r=>r.body_sha256).map(r=>r.body_sha256)}],check_completed:component.check_completed,network_calls:calls};
 }catch(e){return{...root,status:'FLOW_COLLECTOR_ERROR',reason:e.message,network_calls:calls};}
}
