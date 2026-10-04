export const HTX_CATALOG_URLS=Object.freeze({
 linear:'https://api.hbdm.com/linear-swap-api/v1/swap_contract_info?business_type=all',
 coin_swap:'https://api.hbdm.com/swap-api/v1/swap_contract_info',
 coin_delivery:'https://api.hbdm.com/api/v1/contract_contract_info',
});
export const HTX_LINEAR_MARGIN_CATALOG_URLS=Object.freeze(Object.fromEntries(['all','cross','isolated'].map(mode=>[mode,HTX_CATALOG_URLS.linear.replace('business_type=all','business_type='+(mode==='isolated'?'swap':'all'))+'&support_margin_mode='+mode])));
export function mergeHtxLinearCatalogModes({base,modes,observed_ts}={}){
 const failures=[],rows=new Map(),sources=[['default',base],...Object.entries(modes||{})];
 for(const mode of ['all','cross','isolated'])if(!modes?.[mode])failures.push({mode,reason:'MARGIN_MODE_CATALOG_REQUIRED'});
 let ts=0;
 for(const [mode,p] of sources){
  if(p?.status!=='ok'||!Array.isArray(p.data)||!Number.isSafeInteger(p.ts)||p.ts>observed_ts||observed_ts-p.ts>300000){failures.push({mode,reason:'FRESH_MARGIN_MODE_CATALOG_REQUIRED'});continue;}
  ts=Math.max(ts,p.ts);const seen=new Set();
  for(const r of p.data){const code=r?.contract_code;if(typeof code!=='string'||!code||seen.has(code)){failures.push({mode,contract:code,reason:'EXACT_UNIQUE_MODE_CONTRACT_REQUIRED'});continue;}seen.add(code);
   const old=rows.get(code),fields=['symbol','contract_code','business_type','contract_type','trade_partition','contract_status','contract_size','price_tick'];
   if(old&&fields.some(k=>old[k]!==r[k]))failures.push({mode,contract:code,reason:'CONFLICTING_MODE_CONTRACT_METADATA'});
   else rows.set(code,r);
  }
 }
 return{status:failures.length?'PARTIAL':'CLOSED',payload:{status:'ok',ts,data:[...rows.values()]},failures,counts:Object.fromEntries(sources.map(([mode,p])=>[mode,Array.isArray(p?.data)?p.data.length:null])),new_contracts_vs_default:[...rows.keys()].filter(code=>!base?.data?.some(r=>r.contract_code===code)).sort()};
}
const key=v=>String(v??'').trim().toUpperCase();
const negative=row=>[...(row.labels||[]),...(row.tradfi_labels||[])].some(v=>/^(tradfi|stocks?|indices|commodities|metals|forex|fx)$/i.test(String(v)));

// Keep exact exchange contracts and settlement units. Asset-level sources
// may be shared; market prices, funding and execution must not be relabeled.
export function buildHtxCryptoUniverse({catalogs,classify_linear,observed_ts}={}) {
 if(typeof classify_linear!=='function')throw Error('HTX_LINEAR_CLASSIFIER_REQUIRED');
 const failures=[],contracts=[],excluded=[],seen=new Set();
 for(const family of Object.keys(HTX_CATALOG_URLS)){
  const payload=catalogs?.[family];
  if(payload?.status!=='ok'||!Array.isArray(payload.data)||!Number.isSafeInteger(payload.ts)||payload.ts>observed_ts||observed_ts-payload.ts>300000){failures.push({family,reason:'VALID_CURRENT_PRIMARY_CATALOG_REQUIRED'});continue;}
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
   if(scope.classification==='UNKNOWN_FAIL_CLOSED')failures.push({family,contract:exact,reason:'ASSET_CLASSIFICATION_REQUIRES_PRIMARY_METADATA'});
   const isSwap=family==='coin_swap'||(family==='linear'&&raw.business_type==='swap');
   const record={family,contract_code:exact,asset_symbol:symbol,market_kind:family==='linear'?(isSwap?'LINEAR_PERPETUAL':'LINEAR_DELIVERY'):(isSwap?'INVERSE_PERPETUAL':'INVERSE_DELIVERY'),settlement_asset:family==='linear'?raw.trade_partition:symbol,price_quote:family==='linear'?raw.trade_partition:'USD',contract_size:raw.contract_size,price_tick:raw.price_tick,delivery_time:raw.delivery_time||null,source_url:HTX_CATALOG_URLS[family],source_ts:payload.ts,observed_ts,scope,production_market_adapter_supported:family==='linear'&&isSwap,market_adapter_status:family==='linear'&&isSwap?'EXISTING_EXACT_LINEAR_PERPETUAL_ADAPTER':'EXACT_SETTLEMENT_ADAPTER_REQUIRED'};
   (scope.eligible_for_crypto_discovery?contracts:excluded).push(record);
  }
 }
 const assets=[...new Set(contracts.map(r=>r.asset_symbol))].sort().map(symbol=>({symbol,contracts:contracts.filter(r=>r.asset_symbol===symbol).map(r=>({family:r.family,contract_code:r.contract_code})),asset_analysis_contract:contracts.find(r=>r.asset_symbol===symbol&&r.production_market_adapter_supported)?.contract_code||null}));
 return{schema:'htx-all-crypto-futures-universe-v1',status:failures.length?'PARTIAL':'CLOSED',observed_ts,catalog_families:Object.keys(HTX_CATALOG_URLS),contracts,assets,excluded,failures,counts:{crypto_contracts:contracts.length,crypto_assets:assets.length,excluded_contracts:excluded.length,by_family:Object.fromEntries(Object.keys(HTX_CATALOG_URLS).map(f=>[f,contracts.filter(r=>r.family===f).length]))},all_market_adapters_complete:contracts.every(r=>r.production_market_adapter_supported)};
}
