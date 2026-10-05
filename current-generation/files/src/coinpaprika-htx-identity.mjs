import {SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore} from './evidence-source-store.mjs';
import {createProviderReferenceReader} from './provider-reference-cache.mjs';

export const COINPAPRIKA_HTX_IDENTITY_VERSION='coinpaprika-htx-identity-v1-20261005';
export const COINPAPRIKA_HTX_MARKETS_URL='https://api.coinpaprika.com/v1/exchanges/htx/markets';
const SOURCE='COINPAPRIKA_HTX_IDENTITY';
const EVM=/^0x[0-9a-f]{40}$/i,BASE58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const clean=value=>String(value??'').trim();
const platformChains=Object.freeze({'eth-ethereum':'ethereum','sol-solana':'solana'});

function exactMarketUrl(value){
 try{const url=new URL(value);return url.protocol==='https:'&&['htx.com','www.htx.com','huobi.com','www.huobi.com'].includes(url.hostname.toLowerCase())&&!url.username&&!url.password;}
 catch{return false;}
}
function exactContract(value){return /^\S{1,32}-USDT$/u.test(clean(value).toUpperCase());}
function exactPair(row,base){
 return clean(row?.pair).toUpperCase()===`${base}/USDT`&&clean(row?.quote_currency_id).toLowerCase()==='usdt-tether'&&clean(row?.category).toLowerCase()==='spot'&&exactMarketUrl(row?.market_url);
}
function identitiesFrom(metadata){
 const found=new Map();
 for(const row of Array.isArray(metadata?.contracts)?metadata.contracts:[]){
  const chain=platformChains[clean(row?.platform).toLowerCase()],address=clean(row?.contract);
  if(!chain||(chain==='solana'?!BASE58.test(address):!EVM.test(address)))continue;
  const canonical=chain==='solana'?address:address.toLowerCase();
  found.set(`${chain}:${canonical}`,{chain,contract_or_mint:canonical});
 }
 return [...found.values()];
}

export function normalizeCoinpaprikaHtxIdentity({markets,metadata,contract}={}){
 const market=clean(contract).toUpperCase(),base=market.replace(/-USDT$/,'');
 if(!exactContract(market)||!Array.isArray(markets))return{status:'EXACT_HTX_MARKET_REQUIRED',identity:null};
 const matched=markets.filter(row=>exactPair(row,base));
 const ids=[...new Set(matched.map(row=>clean(row?.base_currency_id).toLowerCase()).filter(id=>/^[a-z0-9][a-z0-9-]{2,79}$/.test(id)))];
 if(!matched.length)return{status:'NO_EXACT_HTX_SPOT_MARKET_IN_COINPAPRIKA',identity:null};
 if(ids.length!==1||matched.some(row=>clean(row?.base_currency_id).toLowerCase()!==ids[0]))return{status:'AMBIGUOUS_COINPAPRIKA_HTX_MARKET_IDENTITY',identity:null};
 if(metadata?.id!==ids[0]||clean(metadata?.symbol).toUpperCase()!==base||metadata?.is_active!==true)return{status:'COINPAPRIKA_ASSET_METADATA_MISMATCH',identity:null,coinpaprika_id:ids[0]};
 const identities=identitiesFrom(metadata);
 if(identities.length!==1)return{status:identities.length?'AMBIGUOUS_COINPAPRIKA_CHAIN_ADDRESSES':'SUPPORTED_COINPAPRIKA_CHAIN_ADDRESS_NOT_FOUND',identity:null,coinpaprika_id:ids[0]};
 return{version:COINPAPRIKA_HTX_IDENTITY_VERSION,status:'CLOSED',contract:market,currency:base,identity:identities[0],identity_method:'COINPAPRIKA_EXACT_HTX_SPOT_MARKET_AND_CHAIN_ADDRESS',coinpaprika_id:ids[0],reference_kind:'STATIC_ASSET_BINDING_ONLY',internal_only:true};
}

export async function collectCoinpaprikaHtxIdentity({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,now=Date.now()}={}){
 const market=clean(contract).toUpperCase();
 if(!db?.prepare||!exactContract(market)||!clean(run_id))return{status:'EXACT_HTX_MARKET_AND_RUN_REQUIRED',identity:null,network_calls:0};
 await installEvidenceSourceStore(db);
 const policy=SOURCE_POLICIES[SOURCE],reader=createProviderReferenceReader({db,source:SOURCE,run_id,request_admit,fetch_impl,now,daily_cap:policy.daily_cap,minute_provider:'COINPAPRIKA_IDENTITY',minute_cap:policy.internal_minute_cap});
 const markets=await reader.get('HTX_MARKET_CATALOG',COINPAPRIKA_HTX_MARKETS_URL,{ttl_ms:policy.ttl_ms,max_bytes:12*1024*1024,shape:Array.isArray});
 if(!markets)return{version:COINPAPRIKA_HTX_IDENTITY_VERSION,status:reader.summary().provider_backoff?.status||(!reader.summary().admission.allowed?reader.summary().admission.status:'COINPAPRIKA_HTX_MARKETS_NOT_CLOSED'),identity:null,...reader.summary(),internal_only:true};
 const base=market.replace(/-USDT$/,''),rows=markets.filter(row=>exactPair(row,base)),ids=[...new Set(rows.map(row=>clean(row?.base_currency_id).toLowerCase()).filter(id=>/^[a-z0-9][a-z0-9-]{2,79}$/.test(id)))];
 if(!rows.length||ids.length!==1){const normalized=normalizeCoinpaprikaHtxIdentity({markets,metadata:null,contract:market});return{version:COINPAPRIKA_HTX_IDENTITY_VERSION,...normalized,...reader.summary(),internal_only:true};}
 const metadata=await reader.get('EXACT_COIN_METADATA',`https://api.coinpaprika.com/v1/coins/${encodeURIComponent(ids[0])}`,{ttl_ms:24*60*60_000,max_bytes:2*1024*1024,shape:value=>value&&typeof value==='object'&&!Array.isArray(value)});
 const normalized=metadata?normalizeCoinpaprikaHtxIdentity({markets,metadata,contract:market}):{status:reader.summary().provider_backoff?.status||(!reader.summary().admission.allowed?reader.summary().admission.status:'COINPAPRIKA_ASSET_METADATA_NOT_CLOSED'),identity:null,coinpaprika_id:ids[0]};
 return{version:COINPAPRIKA_HTX_IDENTITY_VERSION,...normalized,...reader.summary(),policy,free_only:true,official_free_monthly_requests:20000,internal_only:true};
}

export default{normalizeCoinpaprikaHtxIdentity,collectCoinpaprikaHtxIdentity};
