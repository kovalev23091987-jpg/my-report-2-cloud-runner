const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export const TTL_MS=Object.freeze({EXECUTION_BOOK:30_000,OI_PRICE_POSITION:5*60_000,DEX_POOL:60*60_000,DEFILLAMA:6*60*60_000,GOPLUS:24*60*60_000});

export function normalizeAssetAddress({chain_id,address}={}){
  const chain=String(chain_id||'').trim(),raw=String(address||'').trim();if(!chain||!raw)return {status:'NOT_CLOSED',reason:'CHAIN_AND_ADDRESS_REQUIRED'};
  if(chain.toLowerCase().startsWith('solana'))return {status:'CLOSED',chain_id:chain,address_raw:raw,address_normalized:raw,case_sensitive:true};
  if(chain.toLowerCase().startsWith('eip155:')||/^\d+$/.test(chain)){if(!/^0x[0-9a-fA-F]{40}$/.test(raw))return {status:'NOT_CLOSED',reason:'EVM_ADDRESS_INVALID'};return {status:'CLOSED',chain_id:chain,address_raw:raw,address_normalized:raw.toLowerCase(),case_sensitive:false};}
  return {status:'NOT_CLOSED',reason:'CHAIN_FAMILY_UNSUPPORTED'};
}

export function validateAssetIdentity({registry,chain_id,address,venue,instrument_id}={}){
  if(!registry?.htx_contract||!registry?.canonical_asset_id||!registry?.chain_id)return {matched:false,status:'REGISTRY_INCOMPLETE'};
  const expected=normalizeAssetAddress({chain_id:registry.chain_id,address:registry.address}),actual=normalizeAssetAddress({chain_id,address});
  if(expected.status!=='CLOSED'||actual.status!=='CLOSED'||expected.chain_id!==actual.chain_id||expected.address_normalized!==actual.address_normalized)return {matched:false,status:'EXACT_ASSET_IDENTITY_MISMATCH'};
  if(venue&&instrument_id&&registry.venue_instruments?.[venue]!==instrument_id)return {matched:false,status:'VENUE_INSTRUMENT_MISMATCH'};
  return {matched:true,status:'EXACT_MATCH',canonical_asset_id:registry.canonical_asset_id,htx_contract:registry.htx_contract};
}

export function normalizeOkxDepthLevel({price,contracts,side,instrument}={}){
  const p=finite(price),count=finite(contracts),ctVal=finite(instrument?.contract_value),mult=finite(instrument?.contract_multiplier)??1,ccy=String(instrument?.contract_value_currency||'').toUpperCase(),base=String(instrument?.base||'').toUpperCase();
  if(!p||!count||!ctVal||!base||!ccy)return {status:'NOT_CLOSED',reason:'OKX_UNIT_METADATA_REQUIRED'};
  const rawContractValue=count*ctVal*mult;let baseQty,quoteUsd,formula;
  if(ccy===base){baseQty=rawContractValue;quoteUsd=baseQty*p;formula='contracts × contract_value × multiplier = base; base × price = quote';}
  else if(['USD','USDT','USDC'].includes(ccy)){quoteUsd=rawContractValue;baseQty=quoteUsd/p;formula='contracts × contract_value × multiplier = quote; quote ÷ price = base';}
  else return {status:'NOT_CLOSED',reason:'OKX_CONTRACT_VALUE_CURRENCY_UNSUPPORTED'};
  return {status:'CLOSED',side,raw_contracts:count,price:p,contract_value:ctVal,contract_multiplier:mult,contract_value_currency:ccy,base_quantity:baseQty,quote_usd:quoteUsd,conversion_formula:formula,multiplier_applied_once:true};
}

export function normalizeSourceTime({source_ts,received_ts,event_ts=null,effective_from=null,effective_to=null,expires_ts=null,live_snapshot_without_source_time=false,now=Date.now(),future_skew_ms=60_000}={}){
  const received=finite(received_ts),source=finite(source_ts);
  if(received===null)return {status:'NOT_CLOSED',reason:'RECEIVED_TS_REQUIRED'};
  if(source===null&&!live_snapshot_without_source_time)return {status:'NOT_CLOSED',reason:'SOURCE_TS_REQUIRED'};
  if(source!==null&&source>now+future_skew_ms)return {status:'NOT_CLOSED',reason:'SOURCE_TS_FUTURE'};
  return {status:'CLOSED',source_ts:source,received_ts:received,event_ts:finite(event_ts),effective_from:finite(effective_from),effective_to:finite(effective_to),expires_ts:finite(expires_ts),time_semantics:source===null?'LIVE_AT_FETCH_TIME_UNVERIFIED':'SOURCE_TIMESTAMPED',confidence:source===null?'LIMITED':'NORMAL'};
}

export function isFresh(record,{metric,now=Date.now()}={}){
  const ttl=TTL_MS[metric],anchor=finite(record?.source_ts??(record?.time_semantics==='LIVE_AT_FETCH_TIME_UNVERIFIED'?record?.received_ts:null));
  if(!ttl||anchor===null||anchor>now)return {fresh:false,status:anchor>now?'FUTURE_TIMESTAMP':'FRESHNESS_UNKNOWN'};
  return {fresh:now-anchor<=ttl,status:now-anchor<=ttl?'FRESH':'STALE',age_ms:now-anchor,ttl_ms:ttl};
}

export function cacheKey({source,asset_or_instrument,metric,window,schema_version}={}){return [source,asset_or_instrument,metric,window,schema_version].map(x=>String(x||'').trim()).join('|');}

export function createRefreshCoordinator({clock=Date.now}={}){
  const cache=new Map(),inflight=new Map(),failures=new Map();const steps=[60_000,5*60_000,15*60_000,60*60_000];
  const get=key=>{const row=cache.get(key);return row&&row.expires_ts>=clock()?{status:'HIT',value:row.value}:{status:'MISS'};};
  const refresh=async(key,fetcher,{ttl_ms,retry_after_ms=null}={})=>{
    const hit=get(key);if(hit.status==='HIT')return hit;
    const failure=failures.get(key);if(failure&&failure.next_attempt_at>clock())return {status:'BACKOFF',next_attempt_at:failure.next_attempt_at};
    if(inflight.has(key))return inflight.get(key);
    const task=(async()=>{try{const value=await fetcher();cache.set(key,{value,expires_ts:clock()+ttl_ms});failures.delete(key);return {status:'REFRESHED',value};}catch(error){const count=(failure?.count||0)+1,wait=retry_after_ms??steps[Math.min(count-1,steps.length-1)];failures.set(key,{count,next_attempt_at:clock()+wait});return {status:'REFRESH_FAILED',error:String(error?.message||error),next_attempt_at:clock()+wait};}finally{inflight.delete(key);}})();
    inflight.set(key,task);return task;
  };
  return {get,refresh};
}
