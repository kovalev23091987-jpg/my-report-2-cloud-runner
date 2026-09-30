import {fingerprint,seal} from './liquidation-extension/core.mjs';
import {normalizeBykStructured} from './liquidation-extension/providers.mjs';
import {fetchByk} from './liquidation-extension/io.mjs';
const captured=new Map();
export function captureBykFutureMap({url,payload,received_ts=Date.now(),http_status=200}={}){
 let u;try{u=new URL(url);}catch{return false;}
 if(u.hostname!=='bykaranteli.com'||u.pathname!=='/api/liqmap/public')return false;
 const symbol=String(u.searchParams.get('symbol')||'').trim().toUpperCase().replace(/USDT$/,'');if(!symbol||symbol.length>40)return false;
 // One Deep Check per process. Keep only this bounded response, never keys or headers.
 if(captured.size>=4&&!captured.has(symbol))captured.delete(captured.keys().next().value);
 captured.set(symbol,{symbol,payload,received_ts,http_status});return true;
}
export function capturedFutureMap({contract,run_id,snapshot_id,observed_ts=Date.now()}={}){
 const symbol=String(contract||'').replace(/-USDT$/,''),raw=captured.get(symbol);
 if(!raw)return{source:'BYKARANTELI_FUTURE_MAP',status:'NOT_REQUESTED',role:'FUTURE_MODELED_LEVELS',data_available:false,network_calls:0,maps:[]};
 if(raw.received_ts>observed_ts||observed_ts-raw.received_ts>300000)return{source:'BYKARANTELI_FUTURE_MAP',status:'STALE_RESPONSE',role:'FUTURE_MODELED_LEVELS',data_available:false,maps:[]};
 if(raw.http_status!==200||raw.payload?.error){const code=typeof raw.payload?.error==='object'?raw.payload.error.code:raw.payload?.error_code??raw.payload?.code;return{source:'BYKARANTELI_FUTURE_MAP',status:code==='INVALID_SYMBOL'?'EXACT_SYMBOL_UNSUPPORTED':`HTTP_${raw.http_status}`,role:'FUTURE_MODELED_LEVELS',data_available:false,network_calls:1,maps:[]};}
 const receipt=normalizeBykStructured(raw.payload,{symbol,run_id,snapshot_id,as_of_ms:observed_ts,received_at_ms:raw.received_ts,max_age_ms:300000});
 return{source:'BYKARANTELI_FUTURE_MAP',status:receipt.status,role:'FUTURE_MODELED_LEVELS',data_available:receipt.zones.length>0,network_calls:1,maps:receipt.usable_for_context?[receipt]:[],source_ts:receipt.source_ts??null,zone_count:receipt.zones.length};
}
export async function collectStandaloneFutureMap({contract,run_id,quota_reserve,request_admit,fetch_impl=globalThis.fetch}={}){
 const symbol=String(contract||'').replace(/-USDT$/,'');
 const grant=typeof request_admit==='function'?request_admit({logical_request_id:`FUTURE_MAP:${run_id}:${contract}`,lane:'background',attempts:1}):null;
 if(!grant?.allowed||grant.duplicate)return{status:'HTTP_BUDGET_NOT_GRANTED',network_calls:0};
 const quota=typeof quota_reserve==='function'?await quota_reserve({contract,run_id,units:1}):null;
 if(!quota?.allowed)return{status:quota?.status||'MONTHLY_QUOTA_NOT_GRANTED',network_calls:0};
 const r=await fetchByk(symbol,{protected_fetch_impl:fetch_impl});
 captureBykFutureMap({url:`https://bykaranteli.com/api/liqmap/public?symbol=${encodeURIComponent(symbol)}`,payload:r.payload??{error:r.provider_error||{code:r.reason}},received_ts:r.receipt?.received_ts??Date.now(),http_status:r.receipt?.http_status??0});
 return{status:r.ok?'RECEIVED':r.provider_error?.code==='INVALID_SYMBOL'?'EXACT_SYMBOL_UNSUPPORTED':r.reason,network_calls:1};
}
const lobster=new Map();
export function normalizeCoinLobsterFutureHint(payload,{contract,received_ts=Date.now()}={}){
 const symbol=String(contract||'').replace(/-USDT$/,''),source='COINLOBSTER_FUTURE_HINT';
 const ts=typeof payload?.as_of_ms==='number'?payload.as_of_ms:Date.parse(payload?.headline_as_of||payload?.as_of||'');
 const direction=payload?.headline?.nearest_liquidation_zone;
 const exact=payload?.coin===symbol&&payload?.headline?.coin===symbol;
 const valid=payload?.available===true&&exact&&Number.isSafeInteger(ts)&&ts<=received_ts&&received_ts-ts<=2100000&&['above','below'].includes(direction);
 return{source,contract,role:'FUTURE_MODEL_DIRECTION_ONLY',status:valid?'PARTIAL_HINT_ONLY':payload?.available===false?'NOT_AVAILABLE':'NOT_CLOSED',data_available:valid,source_ts:Number.isSafeInteger(ts)?ts:null,received_ts,source_age_ms:Number.isSafeInteger(ts)?received_ts-ts:null,delayed:payload?.delayed??null,direction:valid?direction:null,visible_range_pct:15,level_price:null,notional:null,access_note:typeof payload?.access_note==='string'?payload.access_note.slice(0,800):null,levels_withheld:payload?.withheld_layers?.includes?.('rows')===true||payload?.detail==='headline',entry_eligible:false,score_eligible:false};
}
export async function collectCoinLobsterFutureHint({contract,fetch_impl=globalThis.fetch}={}){
 const symbol=String(contract||'').replace(/-USDT$/,''),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 let result;
 try{
  const response=await fetch_impl('https://coinlobster.com/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'liq_zones',arguments:{pair:`${symbol}/USD`}}}),signal:controller.signal});
  const raw=await response.text();if(Buffer.byteLength(raw)>2000000)throw Error('RESPONSE_SIZE_LIMIT');
  let body;try{body=JSON.parse(raw);}catch{body=raw.split('\n').filter(s=>s.startsWith('data:')).map(s=>{try{return JSON.parse(s.slice(5));}catch{return null;}}).find(x=>x?.id===1);}
  let payload=body?.result?.structuredContent;if(!payload){const value=body?.result?.content?.find(x=>x.type==='text')?.text;try{payload=JSON.parse(value);}catch{}}
  result=response.ok?normalizeCoinLobsterFutureHint(payload,{contract,received_ts:Date.now()}):{source:'COINLOBSTER_FUTURE_HINT',contract,role:'FUTURE_MODEL_DIRECTION_ONLY',status:`HTTP_${response.status}`,data_available:false};
 }catch(e){result={source:'COINLOBSTER_FUTURE_HINT',contract,role:'FUTURE_MODEL_DIRECTION_ONLY',status:e.name==='AbortError'?'TIMEOUT':'SOURCE_NOT_CLOSED',data_available:false};}finally{clearTimeout(timer);}
 lobster.set(contract,{...result,network_calls:1});return lobster.get(contract);
}
export function capturedCoinLobsterHint(contract){return lobster.get(contract)||{source:'COINLOBSTER_FUTURE_HINT',contract,role:'FUTURE_MODEL_DIRECTION_ONLY',status:'NOT_REQUESTED',data_available:false,network_calls:0};}

const nativeMaps=new Map();
export function captureNativeFutureMap(receipt,{contract,run_id,price_quote}={}){
 const {fingerprint:proof,...body}=receipt||{};
 if(!proof||fingerprint(body)!==proof||receipt?.usable_for_context!==true||receipt.run_id!==run_id||receipt.native_symbol!==String(contract).replace(/-USDT$/,'')||!Array.isArray(receipt.zones)||receipt.zones.length>500)return false;
 const zones=receipt.zones.map(({account,address,...z})=>({...z,price_quote:z.price_quote??price_quote,position_key:z.position_key??(account?fingerprint(account):null)}));
 const map=seal({provider:receipt.provider,venue:receipt.venue,native_symbol:receipt.native_symbol,run_id,snapshot_id:receipt.snapshot_id,source_ts:receipt.source_ts,status:receipt.status,usable_for_context:true,evidence_class:receipt.evidence_class,coverage:receipt.coverage??'RETURNED_SOURCE_POSITIONS_ONLY',zones,upstream_receipt_fingerprint:proof});
 if(Buffer.byteLength(JSON.stringify(map))>2000000)return false;
 const key=`${run_id}:${contract}:${receipt.provider}`;if(nativeMaps.size>=8&&!nativeMaps.has(key))nativeMaps.delete(nativeMaps.keys().next().value);
 nativeMaps.set(key,map);return true;
}
export function capturedNativeFutureMaps({contract,run_id}={}){return [...nativeMaps.entries()].filter(([key])=>key.startsWith(`${run_id}:${contract}:`)).map(([,value])=>value);}
