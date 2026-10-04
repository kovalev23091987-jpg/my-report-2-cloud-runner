export const HTX_CATALOG_URLS=Object.freeze({
 linear:'https://api.hbdm.com/linear-swap-api/v1/swap_contract_info?business_type=all',
 coin_swap:'https://api.hbdm.com/swap-api/v1/swap_contract_info',
 coin_delivery:'https://api.hbdm.com/api/v1/contract_contract_info',
});
const key=v=>String(v??'').trim().toUpperCase();
const negative=row=>[...(row.labels||[]),...(row.tradfi_labels||[])].some(v=>/^(tradfi|stocks?|indices|commodities|metals|forex|fx)$/i.test(String(v)));

// Keep exact exchange contracts and settlement units. Asset-level sources
// may be shared; market prices, funding and execution must not be relabeled.
export function buildHtxCryptoUniverse({catalogs,classify_linear,observed_ts}={}) {
 if(typeof classify_linear!=='function')throw Error('HTX_LINEAR_CLASSIFIER_REQUIRED');
 const failures=[],contracts=[],excluded=[],seen=new Set();
 for(const family of Object.keys(HTX_CATALOG_URLS)){
  const payload=catalogs?.[family];
  if(payload?.status!=='ok'||!Array.isArray(payload.data)||!Number.isSafeInteger(payload.ts)||payload.ts>observed_ts){failures.push({family,reason:'VALID_CURRENT_PRIMARY_CATALOG_REQUIRED'});continue;}
  for(const raw of payload.data){
   if(Number(raw?.contract_status)!==1)continue;
   const exact=String(raw?.contract_code??''),symbol=key(raw?.symbol),id=family+':'+exact;
   if(!exact||!symbol||seen.has(id)){failures.push({family,contract:exact,reason:'EXACT_UNIQUE_CONTRACT_REQUIRED'});continue;}seen.add(id);
   let scope;
   if(family==='linear')scope=classify_linear(raw);
   else{
    const knownFamily=Array.isArray(raw.labels)&&!negative(raw)&&
      (family==='coin_swap'?exact===symbol+'-USD':exact.startsWith(symbol)&&/^\d{6}$/.test(exact.slice(symbol.length))&&['this_week','next_week','quarter','next_quarter'].includes(raw.contract_type));
    scope={classification:knownFamily?'CRYPTO_CONFIRMED':'UNKNOWN_FAIL_CLOSED',eligible_for_crypto_discovery:knownFamily,source:HTX_CATALOG_URLS[family],reasons:[knownFamily?'HTX_COIN_MARGINED_CRYPTO_CONTRACT':'COIN_CONTRACT_METADATA_REQUIRED']};
   }
   const isSwap=family==='coin_swap'||(family==='linear'&&raw.business_type==='swap');
   const record={family,contract_code:exact,asset_symbol:symbol,market_kind:family==='linear'?(isSwap?'LINEAR_PERPETUAL':'LINEAR_DELIVERY'):(isSwap?'INVERSE_PERPETUAL':'INVERSE_DELIVERY'),settlement_asset:family==='linear'?raw.trade_partition:symbol,price_quote:family==='linear'?raw.trade_partition:'USD',contract_size:raw.contract_size,price_tick:raw.price_tick,delivery_time:raw.delivery_time||null,source_url:HTX_CATALOG_URLS[family],source_ts:payload.ts,observed_ts,scope,production_market_adapter_supported:family==='linear'&&isSwap,market_adapter_status:family==='linear'&&isSwap?'EXISTING_EXACT_LINEAR_PERPETUAL_ADAPTER':'EXACT_SETTLEMENT_ADAPTER_REQUIRED'};
   (scope.eligible_for_crypto_discovery?contracts:excluded).push(record);
  }
 }
 const assets=[...new Set(contracts.map(r=>r.asset_symbol))].sort().map(symbol=>({symbol,contracts:contracts.filter(r=>r.asset_symbol===symbol).map(r=>({family:r.family,contract_code:r.contract_code})),asset_analysis_contract:contracts.find(r=>r.asset_symbol===symbol&&r.production_market_adapter_supported)?.contract_code||null}));
 return{schema:'htx-all-crypto-futures-universe-v1',status:failures.length?'PARTIAL':'CLOSED',observed_ts,catalog_families:Object.keys(HTX_CATALOG_URLS),contracts,assets,excluded,failures,counts:{crypto_contracts:contracts.length,crypto_assets:assets.length,excluded_contracts:excluded.length,by_family:Object.fromEntries(Object.keys(HTX_CATALOG_URLS).map(f=>[f,contracts.filter(r=>r.family===f).length]))},all_market_adapters_complete:contracts.every(r=>r.production_market_adapter_supported)};
}
