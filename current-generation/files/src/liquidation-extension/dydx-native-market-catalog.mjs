import {verifyDydxPinnedSnapshot} from './dydx-pinned-conditional-levels.mjs';
import {fingerprint} from './core.mjs';

export const DYDX_MARKET_CATALOG_TTL=24*60*60_000;
const SCHEMA='DYDX_COMPLETE_NATIVE_MARKET_CATALOG_V1';
const hex=/^[a-f0-9]{64}$/i;
const code=value=>typeof value==='string'&&/^[\p{L}\p{N}_]{1,30}-USDT$/u.test(value);

// The decoder already rejects pagination on AllPerpetuals. Save only product
// identities, never oracle prices, accounts, levels or a current coverage vote.
export function buildDydxNativeMarketCatalog(snapshot){
 if(!verifyDydxPinnedSnapshot(snapshot)||!snapshot.perpetuals.size)return null;
 const body={schema:SCHEMA,chain_id:snapshot.chain_id,height:snapshot.height,
  block_hash:snapshot.block_hash,source_ts:snapshot.source_ts,
  received_ts:Math.max(...snapshot.receipts.map(r=>r.received_ts)),
  expires_ts:snapshot.source_ts+DYDX_MARKET_CATALOG_TTL,
  context_response_sha256:snapshot.receipts[2].sha256,complete:true,
  scope:'EXACT_PRODUCT_ELIGIBILITY_ONLY_FRESH_POSITION_REREAD_REQUIRED',
  markets:[...snapshot.perpetuals.values()].map(p=>({id:p.id,ticker:p.ticker,market_type:p.market_type})).sort((a,b)=>a.id-b.id)};
 const result={...body,fingerprint:fingerprint(body)};
 return validateDydxNativeMarketCatalog(result,{now:body.received_ts});
}

export function validateDydxNativeMarketCatalog(catalog,{now=Date.now()}={}){
 try{
  if(!catalog||catalog.schema!==SCHEMA||catalog.chain_id!=='dydx-mainnet-1'||catalog.complete!==true||catalog.scope!=='EXACT_PRODUCT_ELIGIBILITY_ONLY_FRESH_POSITION_REREAD_REQUIRED'||!/^\d{1,18}$/.test(catalog.height)||BigInt(catalog.height)<=0n||!hex.test(catalog.block_hash||'')||!hex.test(catalog.context_response_sha256||'')||!Number.isSafeInteger(now)||!Number.isSafeInteger(catalog.source_ts)||catalog.source_ts<=0||!Number.isSafeInteger(catalog.received_ts)||catalog.source_ts>catalog.received_ts||catalog.received_ts>now||catalog.expires_ts!==catalog.source_ts+DYDX_MARKET_CATALOG_TTL||now>=catalog.expires_ts||!Array.isArray(catalog.markets)||!catalog.markets.length||catalog.markets.length>500)return null;
  const {fingerprint:hash,...body}=catalog;if(hash!==fingerprint(body))return null;
  if(new Set(catalog.markets.map(p=>p?.id)).size!==catalog.markets.length||catalog.markets.some(p=>Object.keys(p).sort().join(',')!=='id,market_type,ticker'||!Number.isSafeInteger(p.id)||p.id<0||p.id>0xffffffff||!Number.isSafeInteger(p.market_type)||p.market_type<0||p.market_type>0xffffffff||typeof p.ticker!=='string'||!p.ticker||p.ticker.length>80))return null;
  return catalog;
 }catch{return null;}
}

export function dydxNativeMarketCoverage(catalog,{contract,now=Date.now()}={}){
 if(!code(contract))return{status:'IDENTITY_NOT_CLOSED',position_coverage:false};
 const checked=validateDydxNativeMarketCatalog(catalog,{now});
 if(!checked)return{status:'CATALOG_DISCOVERY_REQUIRED',position_coverage:false};
 const ticker=contract.slice(0,-5)+'-USD',rows=checked.markets.filter(p=>p.ticker===ticker&&p.market_type===1);
 return{status:rows.length===1?'SUPPORTED':rows.length?'IDENTITY_NOT_CLOSED':'UNSUPPORTED',
  source_ts:checked.source_ts,expires_ts:checked.expires_ts,context_response_sha256:checked.context_response_sha256,
  ...(rows.length===1?{perpetual_id:rows[0].id}:{}),
  reason:rows.length?'EXACT_NATIVE_PRODUCT_IDENTITY':'NO_EXACT_SUPPORTED_PRODUCT_IN_COMPLETE_NATIVE_CATALOG',
  position_coverage:false,fresh_position_reread_required:true};
}
