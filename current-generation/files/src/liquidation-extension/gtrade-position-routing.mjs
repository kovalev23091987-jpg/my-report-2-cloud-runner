import {fingerprint,timestamp} from './core.mjs';
import {GTRADE_DIAMOND} from './gtrade-pinned-position-snapshot.mjs';
import {resolveGTradeCryptoMarket} from './gtrade.mjs';

export const GTRADE_POSITION_ROUTING_SOURCE='GTRADE_NATIVE_POSITION_ROUTING';
const SCHEMA='GTRADE_STRUCTURAL_POSITION_ROUTING_V1',TTL=7*86400000;
const key=p=>p.user+':'+p.index;
const exactKeys=(value,keys)=>value&&Object.keys(value).sort().join(',')===keys;
const uint=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const validID=p=>exactKeys(p,'collateralIndex,index,pairIndex,user')&&/^0x[a-f0-9]{40}$/.test(p.user)&&uint(p.index,4294967295)&&uint(p.pairIndex,65535)&&uint(p.collateralIndex,255)&&p.collateralIndex>0;
const symbol=v=>typeof v==='string'&&/^[\p{L}\p{N}_]{1,30}$/u.test(v);
export function verifyGTradeRoutingObservation(raw,{now=Date.now()}={}){
 if(raw?.schema!=='GTRADE_PINNED_STRUCTURAL_IDS_V1'||raw.chain_id!==42161||raw.contract!==GTRADE_DIAMOND||raw.complete_position_census!==false||!Array.isArray(raw.positions)||raw.positions.length>128||!Array.isArray(raw.checked_selected_ids)||raw.checked_selected_ids.length>8||!raw.checked_selected_ids.every(validID)||!raw.positions.every(validID)||new Set(raw.positions.map(key)).size!==raw.positions.length||new Set(raw.checked_selected_ids.map(key)).size!==raw.checked_selected_ids.length||timestamp(raw.source_ts)===null||timestamp(raw.received_ts)===null||raw.source_ts>raw.received_ts||raw.received_ts>now||now-raw.source_ts>300000||!/^[a-f0-9]{64}$/.test(raw.response_sha256||'')||!/^0x[a-f0-9]{64}$/i.test(raw.block_hash||''))return false;
 const {fingerprint:f,...body}=raw;return fingerprint(body)===f;
}
export function validateGTradePositionRouting(raw,{now=Date.now()}={}){
 if(raw?.schema!==SCHEMA||raw.scope!=='POSITION_ID_HINTS_ONLY_FRESH_NATIVE_REREAD_REQUIRED'||raw.chain_id!==42161||raw.contract!==GTRADE_DIAMOND||!Array.isArray(raw.positions)||raw.positions.length>128||new Set(raw.positions.map(p=>key(p))).size!==raw.positions.length||timestamp(raw.source_ts)===null||raw.source_ts>now)return null;
 const {routing_fingerprint,...body}=raw;if(routing_fingerprint!==fingerprint(body)||!exactKeys(body,'chain_id,contract,positions,schema,scope,source_ts'))return null;
 if(raw.positions.some(p=>!exactKeys(p,'collateralIndex,index,original_response_sha256,pairIndex,symbol,user,verified_receipt_ts,verified_source_ts')||!validID({user:p.user,index:p.index,pairIndex:p.pairIndex,collateralIndex:p.collateralIndex})||!symbol(p.symbol)||timestamp(p.verified_source_ts)===null||timestamp(p.verified_receipt_ts)===null||p.verified_source_ts>p.verified_receipt_ts||p.verified_receipt_ts>now||p.verified_source_ts>raw.source_ts||!/^[a-f0-9]{64}$/.test(p.original_response_sha256||'')))return null;
 return {positions:raw.positions.filter(p=>now-p.verified_source_ts<=TTL)};
}
export function selectGTradePositionRouting(raw,{symbol:native_symbol,pair_index=null,now=Date.now()}={}){
 const valid=validateGTradePositionRouting(raw,{now});if(!valid||!symbol(native_symbol))return[];
 return valid.positions.filter(p=>p.symbol===native_symbol&&(pair_index===null||p.pairIndex===pair_index)).sort((a,b)=>b.verified_source_ts-a.verified_source_ts||key(a).localeCompare(key(b))).slice(0,4).map(({user,index,pairIndex,collateralIndex})=>({trade:{user,index,pairIndex,collateralIndex}}));
}
export function buildGTradePositionRouting({previous=null,observation,variables,crypto_assets,now=Date.now()}={}){
 if(!(crypto_assets instanceof Set)||!crypto_assets.size||!verifyGTradeRoutingObservation(observation,{now})||variables?.currentBlock!==observation.block_number)return null;
 const catalogClock=timestamp(variables.lastRefreshed);if(catalogClock===null||catalogClock>now||now-catalogClock>300000)return null;
 const prior=validateGTradePositionRouting(previous,{now}),rows=new Map((prior?.positions||[]).map(p=>[key(p),structuredClone(p)])),open=new Map(observation.positions.map(p=>[key(p),p]));
 // An omitted row in a bounded array is not proof that a whole account is closed.
 // Only selected IDs whose current native result was checked may be removed.
 for(const p of observation.checked_selected_ids)if((!open.has(key(p))||open.get(key(p)).pairIndex!==p.pairIndex||open.get(key(p)).collateralIndex!==p.collateralIndex)&&(rows.get(key(p))?.verified_source_ts??0)<=observation.source_ts)rows.delete(key(p));
 for(const p of observation.positions){const s=variables.pairs?.[p.pairIndex]?.from;if(!crypto_assets.has(s)||resolveGTradeCryptoMarket(variables,s).pair_index!==p.pairIndex)continue;const old=rows.get(key(p));if(!old||old.verified_source_ts<=observation.source_ts)rows.set(key(p),{...p,symbol:s,verified_source_ts:observation.source_ts,verified_receipt_ts:observation.received_ts,original_response_sha256:observation.response_sha256});}
 const body={schema:SCHEMA,scope:'POSITION_ID_HINTS_ONLY_FRESH_NATIVE_REREAD_REQUIRED',chain_id:42161,contract:GTRADE_DIAMOND,source_ts:Math.max(observation.source_ts,prior?previous.source_ts:0),positions:[...rows.values()].sort((a,b)=>b.verified_source_ts-a.verified_source_ts||key(a).localeCompare(key(b))).slice(0,128)};
 const result={...body,routing_fingerprint:fingerprint(body)};return validateGTradePositionRouting(result,{now})&&result.routing_fingerprint!==previous?.routing_fingerprint?result:null;
}
export async function saveGTradePositionRouting({db,previous,observation,variables,crypto_assets,now=Date.now(),db_admit}={}){
 const routing=buildGTradePositionRouting({previous,observation,variables,crypto_assets,now});if(!routing)return{status:'NO_NEW_VERIFIED_POSITION_IDS',routing:previous};
 if(typeof db_admit!=='function'||(await db_admit({rows_read:2,rows_written:2}))?.allowed!==true)return{status:'D1_WRITE_NOT_ADMITTED',routing:previous};
 const result=await db.prepare('INSERT INTO report2_liq_venue_catalog_cache(source,observed_ts,expires_ts,payload_json) VALUES(?1,?2,?3,?4) ON CONFLICT(source) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json WHERE excluded.observed_ts>=report2_liq_venue_catalog_cache.observed_ts').bind(GTRADE_POSITION_ROUTING_SOURCE,routing.source_ts,routing.source_ts+TTL,JSON.stringify(routing)).run();
 if(result?.success!==true||result?.meta?.changes!==1)return{status:result?.success===true&&result.meta?.changes===0?'NEWER_ROUTING_RETAINED':'D1_WRITE_ACK_UNKNOWN',routing:previous};
 return{status:'GTRADE_VERIFIED_STRUCTURAL_IDS_SAVED',routing,positions:routing.positions.length,assets:new Set(routing.positions.map(p=>p.symbol)).size,sourceHTTP:0,levels_saved:false};
}
