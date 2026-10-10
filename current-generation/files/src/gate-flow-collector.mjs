import {createHash} from 'node:crypto';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';
import {exactGateTokenBinding,normalizeGateSpotFlow} from './gate-four-hour-flow.mjs';
import {GATE_PUBLIC_TAKER_REFERENCE} from './gate-public-taker-reference.mjs';
const SOURCE='N05_OFFICIAL_FLOW:GATE',VERSION='gate-flow-collector-v1-20261010',hash=b=>createHash('sha256').update(b).digest('hex');
export async function collectGateFlow(params={}){
 const {db,contract,asset_identity:identity,identity_method,run_id,request_admit,source_health_admit,fetch_impl=globalThis.fetch,clock=Date.now}=params,now=params.now??clock(),receipts=[];
 const root={version:VERSION,status:'EXACT_GATE_TOKEN_BINDING_REQUIRED',check_completed:false,network_calls:0,evidence:[],components:[],receipts,internal_only:true};let calls=0,sequence=0;
 if(!db?.prepare||!run_id||identity?.asset_kind==='NATIVE'||!identity?.contract_or_mint||!['HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS','VERSIONED_EXPLORER_EXACT_TOKEN_BINDING'].includes(identity_method)||GATE_PUBLIC_TAKER_REFERENCE.verified!==true)return root;
 const admitDb=()=>source_health_admit?.({rows_read:500,rows_written:22})?.allowed===true;
 const get=async(url,source=SOURCE,daily_cap=16)=>{
  const id=`N05_GATE:${run_id}:${contract}:${++sequence}`,receipt={url,http_status:null,received_ts:null,actual_http:0,status:'NOT_ATTEMPTED'};receipts.push(receipt);
  if(!admitDb()){receipt.status='FLOW_DB_HEADROOM_REQUIRED';return null;}
  const backoff=await readEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:GATE',asset_key:'SHARED',now:clock()});if(backoff){receipt.status='DURABLE_VENUE_BACKOFF';return null;}
  const grant=request_admit?.({logical_request_id:id,lane:'background',attempts:1});if(grant?.allowed!==true||grant.duplicate){receipt.status=grant?.status||'WHOLE_JOB_HTTP_ADMISSION_REQUIRED';return null;}
  const daily=await reserveEvidenceSourceAttempts(db,{source,reservation_id:id,attempts:1,daily_cap,now:clock()});if(!daily.allowed){receipt.status='SOURCE_DAILY_CAP_DENIED';return null;}
  const minute=await reserveProviderMinuteUnits(db,{provider:'GATE',reservation_id:id,units:1,cap:4,now:clock()});if(!minute.allowed){receipt.status=minute.status;return null;}
  try{
   calls++;receipt.actual_http=1;const response=await fetch_impl(url,{headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)}),chunks=[];let size=0;receipt.http_status=response.status;
   for await(const c of response.body){size+=c.length;if(size>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(c);}const bytes=Buffer.concat(chunks);receipt.received_ts=clock();receipt.body_sha256=hash(bytes);receipt.bytes=size;
   if([401,403,429,451].includes(response.status)){const retry=response.headers.get('retry-after'),seconds=/^\d+$/.test(retry||'')?Number(retry):0;if(admitDb())await writeEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:GATE',asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:response.status,original_received_ts:receipt.received_ts}});}
   if(response.status!==200){receipt.status='HTTP_'+response.status;return null;}const p=JSON.parse(bytes);receipt.status='RECEIVED_NOT_QUALIFIED';return p;
  }catch(e){receipt.status=e.message;receipt.received_ts??=clock();return null;}
 };
 try{
  if(!admitDb())return{...root,status:'FLOW_DB_HEADROOM_REQUIRED'};
  const end=Math.floor(now/60000)*60000,key=`TOKEN_FLOW:${contract}:${end}`,old=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now,include_cache_clock:true});
  if(old?.version===VERSION&&old.observed_ts<=now&&old.observed_ts>=end){const component=normalizeGateSpotFlow({contract,identity,currencies:old.currencies,spot:old.spot,pages:old.pages,candles:old.candles,window_end_ts:end,observed_ts:old.observed_ts,direction_reference:GATE_PUBLIC_TAKER_REFERENCE});return{...root,status:component.status,components:[component],network_calls:calls,cache_status:'HIT_ORIGINAL_CLOCKS',check_completed:component.check_completed};}
  async function metadata(source,key,url,compact,cap=16){const c=await readEvidenceSourceCache(db,{source,asset_key:key,now,include_cache_clock:true});if(c?.version===VERSION&&c.observed_ts<=now&&now-c.observed_ts<=21600000){receipts.push({...c.receipt,actual_http:0,cache_status:'HIT_ORIGINAL_CLOCKS'});return c.payload;}const p=await get(url,source,cap);if(!Array.isArray(p))return null;const payload=compact(p),ts=receipts.at(-1).received_ts;if(Buffer.byteLength(JSON.stringify(payload))<900000&&admitDb())await writeEvidenceSourceCache(db,{source,asset_key:key,observed_ts:ts,expires_ts:ts+21600000,payload:{version:VERSION,observed_ts:ts,payload,receipt:receipts.at(-1)}});return payload;}
  const currencies=await metadata('GATE_ASSET_REFERENCE','N05:CURRENCIES','https://api.gateio.ws/api/v4/spot/currencies',p=>p.map(r=>({currency:r.currency,delisted:r.delisted,trade_disabled:r.trade_disabled,chains:(r.chains||[]).map(c=>({name:c.name,addr:c.addr}))})),8);
  if(!currencies)return{...root,status:receipts.at(-1)?.status||'INVALID_GATE_IDENTITY',network_calls:calls};
  const spot=await metadata(SOURCE,'METADATA:SPOT','https://api.gateio.ws/api/v4/spot/currency_pairs',p=>p.map(r=>({id:r.id,base:r.base,quote:r.quote,trade_status:r.trade_status})));
  if(!exactGateTokenBinding({contract,identity,currencies,spot}))return{...root,network_calls:calls};
  const pair=contract.slice(0,-5)+'_USDT',query=`currency_pair=${encodeURIComponent(pair)}&from=${(end-14400000)/1000}&to=${end/1000-1}`,candles=await get('https://api.gateio.ws/api/v4/spot/candlesticks?'+query+'&interval=1m'),pages=[];let component;
  for(let page=1;candles&&page<=3;page++){const rows=await get('https://api.gateio.ws/api/v4/spot/trades?'+query+'&limit=1000&page='+page);if(!Array.isArray(rows))break;pages.push(rows);component=normalizeGateSpotFlow({contract,identity,currencies,spot,pages,candles,window_end_ts:end,observed_ts:receipts.at(-1).received_ts,direction_reference:GATE_PUBLIC_TAKER_REFERENCE});if(component.check_completed||rows.length<1000)break;}
  if(!component)return{...root,status:receipts.at(-1)?.status||'GATE_WINDOW_NOT_CLOSED',network_calls:calls};
  const ts=component.observed_ts;
  if(component.check_completed&&admitDb())await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:ts,expires_ts:end+300000,payload:{version:VERSION,observed_ts:ts,currencies:currencies.filter(r=>r.currency===contract.slice(0,-5)),spot:spot.filter(r=>r.id===pair),pages,candles}});
  return{...root,status:component.status,reason:component.reason,components:[{...component,receipt_hashes:receipts.filter(r=>r.body_sha256).map(r=>r.body_sha256)}],check_completed:component.check_completed,network_calls:calls};
 }catch(e){return{...root,status:'FLOW_COLLECTOR_ERROR',reason:e.message,network_calls:calls};}
}
