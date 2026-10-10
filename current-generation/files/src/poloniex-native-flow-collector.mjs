import {n05SourceHasHeadroom} from './n05-source-headroom.mjs';
import {createHash} from 'node:crypto';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';
import {eligiblePoloniexIdentity,exactPoloniexBinding,normalizePoloniexNativeFlow} from './poloniex-native-four-hour-flow.mjs';
const SOURCE='N05_OFFICIAL_FLOW:POLONIEX',VERSION='poloniex-native-flow-collector-v1-20261010',hash=b=>createHash('sha256').update(b).digest('hex');
export async function collectPoloniexFlow(params={}){
 const {db,contract,asset_identity:identity,identity_method,run_id,request_admit,source_health_admit,fetch_impl=globalThis.fetch,clock=Date.now}=params,now=params.now??clock(),receipts=[];
 const root={version:VERSION,status:'EXACT_PRIMARY_NATIVE_ASSET_BINDING_REQUIRED',check_completed:false,network_calls:0,evidence:[],components:[],receipts,internal_only:true};let calls=0,sequence=0;
 if(!db?.prepare||!run_id||!eligiblePoloniexIdentity(contract,identity)||!['HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK','HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS','VERSIONED_EXPLORER_EXACT_TOKEN_BINDING'].includes(identity_method))return root;
 const admitDb=()=>source_health_admit?.({rows_read:500,rows_written:22})?.allowed===true;
 const get=async(url)=>{
  const id=`N05_POLONIEX:${run_id}:${contract}:${++sequence}`,receipt={url,http_status:null,received_ts:null,actual_http:0,status:'NOT_ATTEMPTED'};receipts.push(receipt);
  if(calls>=5){receipt.status='CALLER_FIVE_REQUEST_CAP';return null;}
  if(!admitDb()){receipt.status='FLOW_DB_HEADROOM_REQUIRED';return null;}
  const backoff=await readEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:POLONIEX',asset_key:'SHARED',now:clock()});if(backoff){receipt.status='DURABLE_VENUE_BACKOFF';return null;}
  if(!await n05SourceHasHeadroom(db,SOURCE,16,clock())){receipt.status='SOURCE_DAILY_CAP_DENIED';return null;}
  const grant=request_admit?.({logical_request_id:id,lane:'background',attempts:1});if(grant?.allowed!==true||grant.duplicate){receipt.status=grant?.status||'WHOLE_JOB_HTTP_ADMISSION_REQUIRED';return null;}
  const daily=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:id,attempts:1,daily_cap:16,now:clock()});if(!daily.allowed){receipt.status='SOURCE_DAILY_CAP_DENIED';return null;}
  const minute=await reserveProviderMinuteUnits(db,{provider:'POLONIEX',reservation_id:id,units:1,cap:6,now:clock()});if(!minute.allowed){receipt.status=minute.status;return null;}
  try{
   calls++;receipt.actual_http=1;const response=await fetch_impl(url,{headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)}),chunks=[];let size=0;receipt.http_status=response.status;
   for await(const c of response.body){size+=c.length;if(size>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(c);}const bytes=Buffer.concat(chunks);receipt.received_ts=clock();receipt.body_sha256=hash(bytes);receipt.bytes=size;
   if([401,403,429,451].includes(response.status)){const retry=response.headers.get('retry-after'),seconds=/^\d+$/.test(retry||'')?Number(retry):0;if(admitDb())await writeEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:POLONIEX',asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:response.status,original_received_ts:receipt.received_ts}});}
   if(response.status!==200){receipt.status='HTTP_'+response.status;return null;}const p=JSON.parse(bytes);receipt.status='RECEIVED_NOT_QUALIFIED';return p;
  }catch(e){receipt.status=e.message;receipt.received_ts??=clock();return null;}
 };
 try{
  if(!admitDb())return{...root,status:'FLOW_DB_HEADROOM_REQUIRED'};
  const end=Math.floor(now/60000)*60000,key=`NATIVE_FLOW:${contract}:${end}`,old=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now,include_cache_clock:true});
  if(old?.version===VERSION&&old.observed_ts<=now&&old.observed_ts>=end){const component=normalizePoloniexNativeFlow({contract,identity,assets:old.assets,markets:old.markets,candles:old.candles,window_end_ts:end,observed_ts:old.observed_ts});return{...root,status:component.status,components:[component],network_calls:calls,cache_status:'HIT_ORIGINAL_CLOCKS',check_completed:component.check_completed};}
  const metadata=async(kind,url,compact)=>{const cacheKey='METADATA:'+kind,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:cacheKey,now,include_cache_clock:true});if(cached?.version===VERSION&&cached.observed_ts<=now&&now-cached.observed_ts<=21600000){receipts.push({...cached.receipt,actual_http:0,cache_status:'HIT_ORIGINAL_CLOCKS'});return cached.data;}
   const p=await get(url);if(!Array.isArray(p))return null;const data=compact(p),ts=receipts.at(-1).received_ts,payload={version:VERSION,observed_ts:ts,data,receipt:receipts.at(-1)};if(Buffer.byteLength(JSON.stringify(payload))<=900000&&admitDb())await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:cacheKey,observed_ts:ts,expires_ts:ts+21600000,payload});return data;};
  const assets=await metadata('ASSETS','https://api.poloniex.com/v2/currencies',p=>p.map(a=>({coin:a.coin,delisted:a.delisted,tradeEnable:a.tradeEnable,networkList:(a.networkList||[]).map(n=>({blockchain:n.blockchain,contractAddress:n.contractAddress}))})));
  if(!assets)return{...root,status:receipts.at(-1)?.status||'INVALID_ASSET_METADATA',network_calls:calls};
  const markets=await metadata('MARKETS','https://api.poloniex.com/markets',p=>p.filter(m=>m.quoteCurrencyName==='USDT').map(m=>({symbol:m.symbol,baseCurrencyName:m.baseCurrencyName,quoteCurrencyName:m.quoteCurrencyName,state:m.state,symbolTradeLimit:{symbol:m.symbolTradeLimit?.symbol}})));
  if(!markets||!exactPoloniexBinding({contract,identity,assets,markets}))return{...root,status:'EXACT_PRIMARY_CHAIN_ADDRESS_BINDING_REQUIRED',network_calls:calls};
  const symbol=contract.slice(0,-5)+'_USDT',activityKey='METADATA:ACTIVITY_HINT',cachedActivity=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:activityKey,now,include_cache_clock:true});let activity;
  if(cachedActivity?.version===VERSION&&cachedActivity.observed_ts<=now&&now-cachedActivity.observed_ts<=900000){activity=cachedActivity.data;receipts.push({...cachedActivity.receipt,actual_http:0,cache_status:'HIT_ORIGINAL_CLOCKS_ACTIVITY_HINT_ONLY'});}
  else if(calls<4){const p=await get('https://api.poloniex.com/markets/ticker24h');if(Array.isArray(p)){activity=p.filter(m=>m.symbol?.endsWith('_USDT')).map(m=>({symbol:m.symbol,tradeCount:m.tradeCount,amount:m.amount,quantity:m.quantity,startTime:m.startTime,closeTime:m.closeTime,ts:m.ts}));const ts=receipts.at(-1).received_ts,payload={version:VERSION,observed_ts:ts,data:activity,receipt:receipts.at(-1)};if(Buffer.byteLength(JSON.stringify(payload))<=900000&&admitDb())await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:activityKey,observed_ts:ts,expires_ts:ts+900000,payload});}}
  const hints=activity?.filter(r=>r.symbol===symbol),hint=hints?.length===1?hints[0]:null;
  if(hint?.tradeCount===0&&typeof hint.amount==='string'&&/^0(?:\.0+)?$/.test(hint.amount)&&typeof hint.quantity==='string'&&/^0(?:\.0+)?$/.test(hint.quantity)&&Number.isSafeInteger(hint.startTime)&&Number.isSafeInteger(hint.closeTime)&&hint.startTime<=end-14400000&&hint.closeTime>=end&&hint.closeTime<=clock()&&hint.closeTime-hint.startTime>=14400000)return{...root,status:'NO_TRADES_IN_CONTAINING_NATIVE_ACTIVITY_WINDOW',network_calls:calls,activity_hint:{...hint,not_directional_flow:true,not_a_full_minute_grid:true}};
  const candles=await get(`https://api.poloniex.com/markets/${encodeURIComponent(symbol)}/candles?interval=MINUTE_1&startTime=${end-14400000}&endTime=${end-1}&limit=240`);
  if(!candles)return{...root,status:receipts.at(-1)?.status||'NATIVE_CANDLES_NOT_RECEIVED',network_calls:calls};
  const ts=receipts.at(-1).received_ts,component=normalizePoloniexNativeFlow({contract,identity,assets,markets,candles,window_end_ts:end,observed_ts:ts}),payload={version:VERSION,observed_ts:ts,assets:assets.filter(a=>a.coin===contract.slice(0,-5)),markets:markets.filter(m=>m.symbol===symbol),candles};
  if((component.check_completed||component.reason==='NO_TRADED_VOLUME')&&Buffer.byteLength(JSON.stringify(payload))<=900000&&admitDb())await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:ts,expires_ts:end+300000,payload});
  return{...root,status:component.status,reason:component.reason,components:[{...component,receipt_hashes:receipts.filter(r=>r.body_sha256).map(r=>r.body_sha256)}],check_completed:component.check_completed,network_calls:calls};
 }catch(e){return{...root,status:'FLOW_COLLECTOR_ERROR',reason:e.message,network_calls:calls};}
}
