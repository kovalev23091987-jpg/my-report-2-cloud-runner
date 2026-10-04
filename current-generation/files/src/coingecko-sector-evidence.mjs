import {isExactHtxUsdtSwapKey} from './htx-contract-key.mjs';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';
import {createProviderReferenceReader} from './provider-reference-cache.mjs';

export const COINGECKO_SECTOR_VERSION='coingecko-sector-v3-shared-reference-native-20261004';
const SOURCE='COINGECKO_SECTOR',MAX_AGE=900000,clean=v=>String(v??'').trim();
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'?null:Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const COINGECKO_ASSET_PLATFORMS=Object.freeze({ethereum:'ethereum',solana:'solana',bsc:'binance-smart-chain',arbitrum:'arbitrum-one',base:'base',polygon:'polygon-pos',optimism:'optimistic-ethereum',avalanche:'avalanche'});
export const SUPPORTED_SECTOR_NAMES=Object.freeze({'Oracle':'оракулы','Decentralized Finance (DeFi)':'децентрализованные финансы','Meme':'мем-монеты','Gaming (GameFi)':'игровые проекты','Artificial Intelligence (AI)':'искусственный интеллект','Real World Assets (RWA)':'реальные активы','Layer 1 (L1)':'базовые блокчейны','Layer 2 (L2)':'сети второго уровня'});
export function sectorCategoryLabel(name){
 const value=clean(name);
 if(!/^[\p{L}\p{N} &().,'/-]{1,120}$/u.test(value)||/ecosystem/i.test(value)||/^(?:cryptocurrency|stablecoins?|all coins)$/i.test(value))return null;
 return SUPPORTED_SECTOR_NAMES[value]||value;
}
export function selectCoingeckoSectorCategory(metadata,directory){
 if(!Array.isArray(metadata?.categories)||!Array.isArray(directory))return null;
 const names=[...Object.keys(SUPPORTED_SECTOR_NAMES),...metadata.categories.filter(n=>!Object.hasOwn(SUPPORTED_SECTOR_NAMES,n))];
 for(const name of names){if(!metadata.categories.includes(name)||!sectorCategoryLabel(name))continue;const rows=directory.filter(r=>r?.name===name&&/^[a-z0-9-]{2,100}$/.test(r?.category_id));if(rows.length===1)return rows[0];}
 return null;
}
// Static network definitions are eligibility rules, never an asset identity source.
// A native identity must still come from the exact HTX binding or explicit registry.
export const NATIVE_SECTOR_BINDINGS=Object.freeze({
 BTC:{chain:'bitcoin',platform:null,coin_id:'bitcoin'},
 LTC:{chain:'litecoin',platform:null,coin_id:'litecoin'},
 BCH:{chain:'bitcoin-cash',platform:null,coin_id:'bitcoin-cash'},
 DOGE:{chain:'dogecoin',platform:null,coin_id:'dogecoin'},
 ZEC:{chain:'zcash',platform:null,coin_id:'zcash'},
 XLM:{chain:'stellar',platform:null,coin_id:'stellar'},
 ETC:{chain:'ethereum-classic',platform:null,coin_id:'ethereum-classic'},
 NEAR:{chain:'near',platform:'near-protocol',coin_id:'near'},
 ETH:{chain:'ethereum',platform:'ethereum',coin_id:'ethereum'},
 SOL:{chain:'solana',platform:'solana',coin_id:'solana'},
 BNB:{chain:'bsc',platform:'binance-smart-chain',coin_id:'binancecoin'},
 AVAX:{chain:'avalanche',platform:'avalanche',coin_id:'avalanche-2'},
 ADA:{chain:'cardano',platform:'cardano',coin_id:'cardano'},
 DOT:{chain:'polkadot',platform:'polkadot',coin_id:'polkadot'},
 TRX:{chain:'tron',platform:'tron',coin_id:'tron'},
 ATOM:{chain:'cosmos',platform:'cosmos',coin_id:'cosmos'},
 XRP:{chain:'xrp',platform:'xrp',coin_id:'ripple'},
 SUI:{chain:'sui',platform:'sui',coin_id:'sui'},
 APT:{chain:'aptos',platform:'aptos',coin_id:'aptos'},
});
export function exactNativeSectorBinding(identity,contract){
 const binding=NATIVE_SECTOR_BINDINGS[String(contract||'').replace(/-USDT$/,'')];
 return binding&&contract.endsWith('-USDT')&&identity?.chain===binding.chain&&identity.asset_kind==='NATIVE'&&identity.native_asset_id===`${binding.chain}:mainnet`&&identity.contract_or_mint===null?binding:null;
}
export function nativeSectorAssetId(identity,contract){const binding=exactNativeSectorBinding(identity,contract);return binding?`${binding.chain}:native:mainnet`:null;}
export function isExactNativeNear(identity,contract){return contract==='NEAR-USDT'&&Boolean(exactNativeSectorBinding(identity,contract));}
export function verifyCoingeckoSectorIdentity(metadata,{identity,contract,coin_id,category_name,asset_platforms}={}){
 const nativeBinding=exactNativeSectorBinding(identity,contract);
 if(nativeBinding){
  const platforms=Array.isArray(asset_platforms)?asset_platforms.filter(r=>r?.id===nativeBinding.platform):[];
  return Boolean(coin_id===nativeBinding.coin_id&&metadata?.id===nativeBinding.coin_id&&clean(metadata.symbol).toUpperCase()===contract.replace(/-USDT$/,'')&&metadata.asset_platform_id===null&&Array.isArray(metadata.categories)&&(!category_name||(category_name==='Layer 1 (L1)'&&metadata.categories.includes(category_name)))&&(nativeBinding.platform===null||platforms.length===1&&platforms[0].native_coin_id===nativeBinding.coin_id)&&metadata.platforms&&typeof metadata.platforms==='object'&&!Array.isArray(metadata.platforms)&&!clean(metadata.platforms[nativeBinding.platform])&&!clean(metadata.platforms[identity.chain]));
 }
 const address=clean(identity?.contract_or_mint),chain=identity?.chain,platform=COINGECKO_ASSET_PLATFORMS[chain];
 if(!platform||!address||metadata?.id!==coin_id||!/^[a-z0-9-]{2,100}$/.test(coin_id)||clean(metadata.symbol).toUpperCase()!==clean(contract).replace(/-USDT$/,'')||!Array.isArray(metadata?.categories)||(category_name&&!metadata.categories.includes(category_name)))return false;
 return chain==='solana'?metadata.platforms?.[platform]===address:clean(metadata.platforms?.[platform]).toLowerCase()===address.toLowerCase();
}
export function normalizeCoingeckoSector({metadata,categories,quotes,identity,contract,coin_id,category_id,category_name,asset_platforms,observed_ts=Date.now()}={}){
 const matching=Array.isArray(categories)?categories.filter(r=>r.category_id===category_id&&r.name===category_name):[];
 if(!sectorCategoryLabel(category_name)||!verifyCoingeckoSectorIdentity(metadata,{identity,contract,coin_id,category_name,asset_platforms})||matching.length!==1||!Array.isArray(quotes))return{status:'EXACT_ASSET_AND_CATEGORY_REQUIRED',evidence:[]};
 const counts=new Map(),symbols=new Map();
 for(const r of quotes){counts.set(r?.id,(counts.get(r?.id)||0)+1);const s=clean(r?.symbol).toUpperCase();symbols.set(s,(symbols.get(s)||0)+1);}
 const valid=r=>{const ts=Date.parse(r?.last_updated),change=num(r?.price_change_percentage_24h),symbol=clean(r?.symbol).toUpperCase();return r&&counts.get(r.id)===1&&symbols.get(symbol)===1&&Number.isFinite(ts)&&ts<=observed_ts&&observed_ts-ts<=MAX_AGE&&num(r.current_price)>0&&num(r.total_volume)>=100000&&change!==null?{id:r.id,symbol,source_ts:ts,change_24h_pct:change,quote:'USD_AGGREGATED'}:null;};
 const target=valid(quotes.find(r=>r.id===coin_id));
 if(!target||target.symbol!==contract.replace(/-USDT$/,''))return{status:'EXACT_FRESH_TARGET_QUOTE_REQUIRED',evidence:[]};
 const peers=quotes.filter(r=>r.id!==coin_id).map(valid).filter(r=>r&&Math.abs(r.source_ts-target.source_ts)<=120000).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,50);
 if(peers.length<3)return{status:'INSUFFICIENT_FRESH_SECTOR_PEERS',evidence:[],summary:{eligible_peers:peers.length}};
 const sorted=peers.map(r=>r.change_24h_pct).sort((a,b)=>a-b),mid=Math.floor(sorted.length/2),median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,source_ts=Math.min(target.source_ts,...peers.map(r=>r.source_ts));
 const relative=target.change_24h_pct-median,coverage=clamp(peers.length/20,.15,.75),summary={coin_id,tag_id:category_id,category_name,target_source_ts:target.source_ts,target_change_24h_pct:target.change_24h_pct,peer_median_change_24h_pct:median,relative_strength_pct_points:relative,eligible_peers:peers.length,returned_category_rows:quotes.length,full_sector_coverage:false,source_ts,window:'PROVIDER_ROLLING_24H_AT_NEAR_SYNCHRONOUS_QUOTES',quote:'USD_AGGREGATED_NOT_HTX_EXECUTION_PRICE',direction_neutral:false,entry_eligible:false,is_htx_price:false};
 const evidence=buildEvidenceV2({provider_id:SOURCE,upstream_id:'COINGECKO_AGGREGATED_VENUES',asset_id:nativeSectorAssetId(identity,contract)||`${identity.chain}:${identity.contract_or_mint}`,htx_contract:contract,block_id:'N15',metric_family:'SECTOR_RELATIVE_STRENGTH_CONTEXT',origin_event_id:`${coin_id}:${category_id}:${target.source_ts}`,dependency_group:`SECTOR:${coin_id}:${category_id}:${target.source_ts}`,source_ts,observed_ts,expires_at:Math.min(observed_ts+300000,source_ts+MAX_AGE),coverage_status:'PARTIAL_PROVIDER_DIRECTIONAL_CONTEXT',coverage_fraction:coverage,directional_strength:clamp(relative/10,-1,1),extra:{...summary,peers,sector_proof:'EXACT_ASSET_CATEGORY_AND_QUOTE_BASKET_V1',direction_policy:'RELATIVE_STRENGTH_SUPPORTS_LONG_RELATIVE_WEAKNESS_SUPPORTS_SHORT_LOW_WEIGHT'}});
 return{status:'CLOSED',evidence:[evidence],summary};
}

export async function collectCoingeckoSectorEvidence({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,asset_identity,asset_metadata,now=Date.now(),strict_fresh_manual=false}={}){
 let coin_id=clean(asset_metadata?.coingecko_id),category_id=clean(asset_metadata?.coingecko_category_id),category_name=clean(asset_metadata?.coingecko_category_name);const identity=asset_identity;
 const native=exactNativeSectorBinding(identity,contract);if(native&&!coin_id)coin_id=native.coin_id;
 const pinned=Boolean(category_id||category_name),platform=COINGECKO_ASSET_PLATFORMS[identity?.chain],validAddress=native||Boolean(platform)&&(identity?.chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(identity.contract_or_mint):/^0x[0-9a-f]{40}$/i.test(identity.contract_or_mint));
 if(!validAddress||!isExactHtxUsdtSwapKey(contract)||(pinned&&(!/^[a-z0-9-]{2,100}$/.test(coin_id)||!/^[a-z0-9-]{2,100}$/.test(category_id)||!sectorCategoryLabel(category_name))))return{status:'EXACT_SECTOR_REGISTRY_REQUIRED',evidence:[],network_calls:0};
 await installEvidenceSourceStore(db);
 const key=`${contract}:${identity.chain}:${native?identity.native_asset_id:identity.contract_or_mint}:${coin_id}:${category_id}:${category_name}`,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now});
 if(!strict_fresh_manual&&cached?.version===COINGECKO_SECTOR_VERSION)return cached;
 const backoff=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:'PROVIDER_BACKOFF',now});
 if(backoff)return{status:backoff.status,evidence:[],network_calls:0,backoff_until:backoff.backoff_until};
 const reader=createProviderReferenceReader({db,source:SOURCE,run_id,request_admit,fetch_impl,now,daily_cap:SOURCE_POLICIES[SOURCE].daily_cap,minute_provider:'COINGECKO',minute_cap:9});
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const asset_platforms=native?.platform?await reader.get('NATIVE_PLATFORM_BINDING','https://api.coingecko.com/api/v3/asset_platforms',{ttl_ms:86400000,shape:Array.isArray}):null;
 const get=(route,url,options)=>reader.get(route,url,options);
 const metadataUrl=(pinned||native)?`https://api.coingecko.com/api/v3/coins/${coin_id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`:`https://api.coingecko.com/api/v3/coins/${platform}/contract/${encodeURIComponent(identity.contract_or_mint)}`;
 const metadata=await get('EXACT_COIN_METADATA',metadataUrl,{ttl_ms:21600000,shape:object});
 if(!pinned)coin_id=clean(metadata?.id);
 const verified=verifyCoingeckoSectorIdentity(metadata,{identity,contract,coin_id,category_name:pinned?category_name:null,asset_platforms});
 const categories=verified?await get('EXACT_CATEGORY_DIRECTORY','https://api.coingecko.com/api/v3/coins/categories/list',{ttl_ms:3600000,shape:Array.isArray}):null;
 if(!pinned){const nativeCategories=Array.isArray(categories)?categories.filter(r=>r.name==='Layer 1 (L1)'&&r.category_id==='layer-1'):[];const selected=native?(metadata?.categories?.includes('Layer 1 (L1)')&&nativeCategories.length===1?nativeCategories[0]:null):selectCoingeckoSectorCategory(metadata,categories);category_name=selected?.name||'';category_id=selected?.category_id||'';}
 const match=Array.isArray(categories)&&categories.filter(r=>r.category_id===category_id&&r.name===category_name).length===1;
 const quotes=match?await get('CATEGORY_QUOTES',`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=${category_id}&order=market_cap_desc&per_page=100&page=1&sparkline=false`,{ttl_ms:60000,shape:Array.isArray,bypass_cache:strict_fresh_manual}):null;
 const normalized=normalizeCoingeckoSector({metadata,categories,quotes,identity,contract,coin_id,category_id,category_name,asset_platforms,observed_ts:Date.now()});
 const transport=reader.summary(),providerBackoff=transport.provider_backoff;
 const result={version:COINGECKO_SECTOR_VERSION,...normalized,...(transport.admission.allowed===false?{status:transport.admission.status}:{}),...(transport.receipts.some(r=>!['RECEIVED','VALIDATED_REFERENCE_CACHE'].includes(r.status))?{status:'SOURCE_NOT_CLOSED'}:{}),...(providerBackoff?{status:providerBackoff.status}:{}),...transport,internal_only:true,free_only:true,monthly_module_bound:1488};
 const expires=normalized.status==='CLOSED'?normalized.evidence[0].expires_at:now+900000;
 await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:now,expires_ts:expires,payload:result});
 if(providerBackoff)await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:'PROVIDER_BACKOFF',observed_ts:now,expires_ts:providerBackoff.backoff_until,payload:providerBackoff});
 return result;
}
