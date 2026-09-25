export const PROVIDER_CONTEXT_NORMALIZERS_VERSION='provider-context-normalizers-v1-20260925';
const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};const clean=v=>String(v??'').trim();
export function normalizeDefiLlamaContext({protocol,chain,tvl_usd,volume_usd,fees_usd,observed_ts=Date.now()}={}){
  return {version:PROVIDER_CONTEXT_NORMALIZERS_VERSION,status:[tvl_usd,volume_usd,fees_usd].some(v=>finite(v)!==null)?'CLOSED':'NOT_CLOSED',provider:'DefiLlama',protocol:clean(protocol)||null,chain:clean(chain)||null,tvl_usd:finite(tvl_usd),volume_usd:finite(volume_usd),fees_usd:finite(fees_usd),observed_ts,tvl_usd_growth_is_not_automatically_inflow:true,token_unlocks_free_api_claimed:false,advisory_only:true};
}
export function normalizeLowFrequencyMarketContext({provider,value,metric,observed_ts=Date.now(),production_polling_allowed=false}={}){
  return {version:PROVIDER_CONTEXT_NORMALIZERS_VERSION,status:finite(value)!==null?'CLOSED':'NOT_CLOSED',provider:clean(provider),metric:clean(metric),value:finite(value),observed_ts,production_polling_allowed:Boolean(production_polling_allowed),critical_dependency:false};
}
