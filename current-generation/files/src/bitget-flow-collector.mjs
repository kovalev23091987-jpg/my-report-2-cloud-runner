import {n05SourceHasHeadroom} from './n05-source-headroom.mjs';
import {createHash} from 'node:crypto';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';
import {exactBitgetBinding,acquireBitgetFourHourFlow,BITGET_FLOW_VERSION,reconcileBitgetFlow} from './bitget-four-hour-flow.mjs';
const SOURCE='N05_OFFICIAL_FLOW:BITGET',VERSION='bitget-flow-collector-v1-20261010';
const metadata={coins:'https://api.bitget.com/api/v2/spot/public/coins',spot:'https://api.bitget.com/api/v2/spot/public/symbols',futures:'https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES'};
const hash=b=>createHash('sha256').update(b).digest('hex');
const compact=(kind,p)=>({code:p.code,data:p.data.map(r=>kind==='coins'?{coin:r.coin,chains:(r.chains||[]).map(c=>({chain:c.chain,contractAddress:c.contractAddress}))}:Object.fromEntries(['symbol','baseCoin','quoteCoin','status','symbolStatus','symbolType','isRwa'].map(k=>[k,r[k]])))});
export async function collectBitgetFlow(params={}){
 const {db,contract,asset_identity:identity,identity_method,run_id,request_admit,source_health_admit,fetch_impl=globalThis.fetch,clock=Date.now}=params,now=params.now??clock(),receipts=[];let calls=0;
 const root={version:VERSION,status:'EXACT_ASSET_IDENTITY_REQUIRED',check_completed:false,network_calls:0,evidence:[],components:[],receipts,internal_only:true};
 if(!db?.prepare||!identity||!['HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK','HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS','VERSIONED_EXPLORER_EXACT_TOKEN_BINDING'].includes(identity_method)||!/^\S+-USDT$/u.test(String(contract||''))||!run_id)return root;
 const admitDb=()=>source_health_admit?.({rows_read:500,rows_written:22})?.allowed===true;
 if(!admitDb())return{...root,status:'FLOW_DB_HEADROOM_REQUIRED'};
 let sequence=0;
 const get=async(url,part={})=>{
  const id=`N05_BITGET:${run_id}:${contract}:${++sequence}`,r={url,received_ts:null,http_status:null,status:'NOT_ATTEMPTED',actual_http:0,...part};receipts.push(r);
  if(!admitDb()){r.status='FLOW_DB_HEADROOM_REQUIRED';return null;}
  const backoff=await readEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:BITGET',asset_key:'SHARED',now:clock()});if(backoff){r.status='DURABLE_VENUE_BACKOFF';return null;}
  if(!await n05SourceHasHeadroom(db,SOURCE,16,clock())){r.status='SOURCE_DAILY_CAP_DENIED';return null;}
  const grant=request_admit?.({logical_request_id:id,lane:'background',attempts:1});if(grant?.allowed!==true||grant.duplicate){r.status=grant?.status||'WHOLE_JOB_HTTP_ADMISSION_REQUIRED';return null;}
  const daily=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:id,attempts:1,daily_cap:16,now:clock()});if(!daily.allowed){r.status='SOURCE_DAILY_CAP_DENIED';return null;}
  const minute=await reserveProviderMinuteUnits(db,{provider:'BITGET',reservation_id:id,units:1,cap:6,now:clock()});if(!minute.allowed){r.status=minute.status;return null;}
  try{
   calls++;r.actual_http=1;const response=await fetch_impl(url,{headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)});r.http_status=response.status;
   const chunks=[];let size=0;for await(const c of response.body){size+=c.length;if(size>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(c);}const bytes=Buffer.concat(chunks);r.received_ts=clock();r.body_sha256=hash(bytes);r.bytes=size;
   if([401,403,429,451].includes(response.status)){const retry=response.headers.get('retry-after'),seconds=/^\d+$/.test(retry||'')?Number(retry):0;await writeEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:BITGET',asset_key:'SHARED',observed_ts:r.received_ts,expires_ts:r.received_ts+Math.max(900000,seconds*1000),payload:{http_status:response.status,original_received_ts:r.received_ts}});}
   if(response.status!==200){r.status='HTTP_'+response.status;return null;}const p=JSON.parse(bytes);if(p.code!=='00000'||!Array.isArray(p.data)){r.status='INVALID_PROVIDER_SCHEMA';return null;}r.status='RECEIVED_NOT_QUALIFIED';return p;
  }catch(e){r.status=e.message;return null;}
 };
 try{
  const catalogs={};for(const kind of ['coins','spot','futures']){
   const key='METADATA:'+kind,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now,include_cache_clock:true});
   if(cached?.version===VERSION&&cached.observed_ts<=now&&now-cached.observed_ts<=21600000){catalogs[kind]=cached.payload;receipts.push({...cached.receipt,cache_status:'HIT',actual_http:0});continue;}
   const p=await get(metadata[kind],{kind});if(!p)return{...root,status:receipts.at(-1)?.status||'METADATA_NOT_RECEIVED',network_calls:calls};catalogs[kind]=compact(kind,p);const receipt=receipts.at(-1),ts=receipt.received_ts;await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:ts,expires_ts:ts+21600000,payload:{version:VERSION,observed_ts:ts,payload:catalogs[kind],receipt}});
  }
  const end=Math.floor(now/60000)*60000,components=[];for(const market of ['SPOT','FUTURES']){
   const rows=catalogs[market==='SPOT'?'spot':'futures'].data.filter(r=>r.symbol===contract.replace(/-USDT$/,'USDT'));
   if(rows.length!==1||!exactBitgetBinding({contract,identity,coins:catalogs.coins,instrument:rows[0],market})){components.push({venue:'BITGET',market,status:'EXACT_ASSET_BINDING_NOT_CLOSED',check_completed:false});continue;}
   const key=`FLOW:${contract}:${market}:${end}`,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now,include_cache_clock:true});let flow;
   if(cached?.version===VERSION&&cached.observed_ts<=now&&cached.payloads){flow={...reconcileBitgetFlow({contract,market,...cached.payloads,window_end_ts:end,observed_ts:cached.observed_ts}),payloads:cached.payloads,cache_status:'HIT'};}
   else{flow=await acquireBitgetFourHourFlow({get,contract,market,window_end_ts:end,max_pages:3,clock});if(flow.check_completed&&admitDb()){const payload={version:VERSION,observed_ts:flow.observed_ts,payloads:flow.payloads};if(Buffer.byteLength(JSON.stringify(payload))<=900000)await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:flow.observed_ts,expires_ts:end+300000,payload});}}
   const {payloads,...component}=flow;components.push({...component,exact_asset_binding:true,identity,physical_root:'BITGET_OFFICIAL_PUBLIC_TRADES',receipt_hashes:receipts.filter(r=>r.body_sha256).map(r=>r.body_sha256)});
  }
  return{...root,status:components.some(c=>c.check_completed)?'CLOSED_QUALIFIED_FLOW_COMPONENTS':'PARTIAL_FOUR_HOUR_FLOW',components,network_calls:calls};
 }catch(e){return{...root,status:'FLOW_COLLECTOR_ERROR',reason:e.message,network_calls:calls};}
}

