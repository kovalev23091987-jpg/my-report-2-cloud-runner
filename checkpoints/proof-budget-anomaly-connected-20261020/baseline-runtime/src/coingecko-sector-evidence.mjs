import {createHash} from 'node:crypto';
import {isExactHtxUsdtSwapKey} from './htx-contract-key.mjs';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,readEvidenceSourceCache,writeOptionalEvidenceSourceCache,nativeSourceUsageUnclosed} from './evidence-source-store.mjs';
import {createProviderReferenceReader} from './provider-reference-cache.mjs';

export const COINGECKO_SECTOR_VERSION='coingecko-sector-v11-exact-target-refresh-20261014';
const SOURCE='COINGECKO_SECTOR',MAX_AGE=900000,clean=v=>String(v??'').trim();
const num=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const COINGECKO_ASSET_PLATFORMS=Object.freeze({ethereum:'ethereum',solana:'solana',bsc:'binance-smart-chain',arbitrum:'arbitrum-one',base:'base',polygon:'polygon-pos',optimism:'optimistic-ethereum',avalanche:'avalanche',tron:'tron'});
export const SUPPORTED_SECTOR_NAMES=Object.freeze({'Oracle':'оракулы','Decentralized Finance (DeFi)':'децентрализованные финансы','Meme':'мем-монеты','Gaming (GameFi)':'игровые проекты','Artificial Intelligence (AI)':'искусственный интеллект','Real World Assets (RWA)':'реальные активы','Layer 1 (L1)':'базовые блокчейны','Layer 2 (L2)':'сети второго уровня','Layer 0 (L0)':'межсетевые блокчейны'});
const NATIVE_FUNCTIONAL_CATEGORIES=['Layer 1 (L1)','Layer 0 (L0)'];
const nativeFunctionalCategories=binding=>binding?.functional_categories||NATIVE_FUNCTIONAL_CATEGORIES;
function nativeProviderHomepageClosed(metadata,binding){
 if(!binding.provider_homepages)return true;
 return Array.isArray(metadata?.links?.homepage)&&metadata.links.homepage.some(value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&binding.provider_homepages.includes(u.hostname.replace(/^www\./,''));}catch{return false;}});
}
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
 ATOM:{chain:'cosmos',platform:'cosmos',coin_id:'cosmos',native_provider_ref:'uatom'},
 XRP:{chain:'xrp',platform:'xrp',coin_id:'ripple'},
 SUI:{chain:'sui',platform:'sui',coin_id:'sui'},
 APT:{chain:'aptos',platform:'aptos',coin_id:'aptos',native_provider_ref:'0x1::aptos_coin::AptosCoin'},
 // HTX originals close the native chain identity; provider pages publish these
 // exact API IDs. Runtime metadata, native representation, official homepage,
 // category membership and original quote clocks must still close independently.
 ALGO:{chain:'algorand',platform:null,coin_id:'algorand',provider_homepages:['algorand.co','algorand.foundation']},
 DASH:{chain:'dash',platform:null,coin_id:'dash',provider_homepages:['dash.org'],functional_categories:['Payment Solutions','Privacy']},
 FIL:{chain:'filecoin',platform:null,coin_id:'filecoin',provider_homepages:['filecoin.io']},
 HBAR:{chain:'hedera',platform:null,coin_id:'hedera-hashgraph',provider_homepages:['hedera.com']},
 XMR:{chain:'monero',platform:null,coin_id:'monero',provider_homepages:['getmonero.org']},
 XPL:{chain:'plasma',platform:null,coin_id:'plasma',provider_homepages:['plasma.to']},
 CHZ:{chain:'chiliz',platform:null,coin_id:'chiliz',provider_homepages:['chiliz.com','socios.com'],provider_legacy_bridge:{platform:'ethereum',address:'0x3506424f91fd33084466f402d5d97f05f8e3b4af',authority:'https://www.chiliz.com/chainport-integrates-chiliz/'},provider_bridge_scope:'AGGREGATED_SECTOR_CONTEXT_ONLY'},
 ICP:{chain:'internet-computer',platform:'internet-computer',coin_id:'internet-computer',provider_homepages:['internetcomputer.org'],native_provider_ref:'ryjl3-tyaaa-aaaaa-aaaba-cai',provider_ref_primary_authority:'https://docs.internetcomputer.org/references/system-canisters/'},
 TAO:{chain:'bittensor',platform:null,coin_id:'bittensor',provider_homepages:['bittensor.com']},
 TIA:{chain:'celestia',platform:null,coin_id:'celestia',provider_homepages:['celestia.org']},
 STEEM:{chain:'steem',platform:null,coin_id:'steem',provider_homepages:['steem.com'],functional_categories:['SocialFi']},
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
  // Some genuine native assets have a provider denomination/Move type, not an
  // empty token address. Require exact HTX native identity plus the provider
  // native_coin_id binding or the pinned primary native-ledger authority below;
  // never accept an arbitrary populated platform field.
  // Aptos official application guide and cosmos/chain-registry cosmoshub asset
  // list define these exact native identifiers. Wrapped/IBC/foreign refs fail.
  const nativeRef=nativeBinding.native_provider_ref;
  const legacy=nativeBinding.provider_legacy_bridge;
  // These exceptions bind exact provider representations of the same asset.
  // ICP's canonical mainnet ledger is confirmed by the native project's docs;
  // CHZ's exact legacy bridge reference is admitted only for aggregated N15
  // sector quotes, never as a native chain transfer or execution price.
  const exactLegacyBridge=legacy&&nativeBinding.provider_bridge_scope==='AGGREGATED_SECTOR_CONTEXT_ONLY'&&metadata?.asset_platform_id===legacy.platform&&clean(metadata?.platforms?.[legacy.platform]).toLowerCase()===legacy.address&&!clean(metadata?.platforms?.[identity.chain]);
  const representation=exactLegacyBridge|| (nativeRef
   ?metadata?.asset_platform_id===nativeBinding.platform&&metadata?.platforms?.[nativeBinding.platform]===nativeRef&&(!clean(metadata.platforms[identity.chain])||metadata.platforms[identity.chain]===nativeRef)
   :metadata?.asset_platform_id===null&&!clean(metadata?.platforms?.[nativeBinding.platform])&&!clean(metadata?.platforms?.[identity.chain]));
  return Boolean(coin_id===nativeBinding.coin_id&&metadata?.id===nativeBinding.coin_id&&clean(metadata.symbol).toUpperCase()===contract.replace(/-USDT$/,'')&&representation&&nativeProviderHomepageClosed(metadata,nativeBinding)&&Array.isArray(metadata.categories)&&(!category_name||(nativeFunctionalCategories(nativeBinding).includes(category_name)&&metadata.categories.includes(category_name)))&&(nativeBinding.platform===null||nativeRef&&nativeBinding.provider_ref_primary_authority||platforms.length===1&&platforms[0].native_coin_id===nativeBinding.coin_id)&&metadata.platforms&&typeof metadata.platforms==='object'&&!Array.isArray(metadata.platforms));
 }
 const address=clean(identity?.contract_or_mint),chain=identity?.chain,platform=COINGECKO_ASSET_PLATFORMS[chain];
 if(!platform||!address||metadata?.id!==coin_id||!/^[a-z0-9-]{2,100}$/.test(coin_id)||clean(metadata.symbol).toUpperCase()!==clean(contract).replace(/-USDT$/,'')||!Array.isArray(metadata?.categories)||(category_name&&!metadata.categories.includes(category_name)))return false;
 return ['solana','tron'].includes(chain)?metadata.platforms?.[platform]===address:clean(metadata.platforms?.[platform]).toLowerCase()===address.toLowerCase();
}
export function normalizeCoingeckoSector({metadata,categories,quotes,identity,contract,coin_id,category_id,category_name,asset_platforms,observed_ts=Date.now()}={}){
 const matching=Array.isArray(categories)?categories.filter(r=>r?.category_id===category_id&&r?.name===category_name):[];
 if(!sectorCategoryLabel(category_name)||!verifyCoingeckoSectorIdentity(metadata,{identity,contract,coin_id,category_name,asset_platforms})||matching.length!==1||!Array.isArray(quotes))return{status:'EXACT_ASSET_AND_CATEGORY_REQUIRED',evidence:[]};
 const counts=new Map(),symbols=new Map();
 for(const r of quotes){counts.set(r?.id,(counts.get(r?.id)||0)+1);const s=clean(r?.symbol).toUpperCase();symbols.set(s,(symbols.get(s)||0)+1);}
 // Exact verified provider ID selects the target. A different coin/wrapper
 // sharing its ticker cannot invalidate that identity or join its peers.
 // Duplicate target IDs still fail; ambiguous peer symbols remain excluded.
 const valid=r=>{const ts=Date.parse(r?.last_updated),change=num(r?.price_change_percentage_24h),symbol=clean(r?.symbol).toUpperCase();return r&&counts.get(r.id)===1&&Number.isFinite(ts)&&ts<=observed_ts&&observed_ts-ts<=MAX_AGE&&num(r.current_price)>0&&num(r.total_volume)>=100000&&change!==null?{id:r.id,symbol,source_ts:ts,change_24h_pct:change,quote:'USD_AGGREGATED'}:null;};
 const target=valid(quotes.find(r=>r?.id===coin_id));
 if(!target||target.symbol!==contract.replace(/-USDT$/,''))return{status:'EXACT_FRESH_TARGET_QUOTE_REQUIRED',evidence:[]};
 const peers=quotes.filter(r=>r?.id!==coin_id).map(valid).filter(r=>r&&r.symbol!==target.symbol&&symbols.get(r.symbol)===1&&Math.abs(r.source_ts-target.source_ts)<=120000).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,50);
 if(peers.length<3)return{status:'INSUFFICIENT_FRESH_SECTOR_PEERS',evidence:[],summary:{eligible_peers:peers.length}};
 const sorted=peers.map(r=>r.change_24h_pct).sort((a,b)=>a-b),mid=Math.floor(sorted.length/2),median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,source_ts=Math.min(target.source_ts,...peers.map(r=>r.source_ts));
 const native=exactNativeSectorBinding(identity,contract),representationScope=native?.provider_legacy_bridge&&metadata?.asset_platform_id===native.provider_legacy_bridge.platform?'VERIFIED_PROJECT_NATIVE_AND_LEGACY_BRIDGE_SECTOR_ONLY':native?.provider_ref_primary_authority?'OFFICIAL_MAINNET_NATIVE_LEDGER_REFERENCE':null;
 const relative=target.change_24h_pct-median,coverage=clamp(peers.length/20,.15,.75),summary={coin_id,tag_id:category_id,category_name,target_source_ts:target.source_ts,target_change_24h_pct:target.change_24h_pct,peer_median_change_24h_pct:median,relative_strength_pct_points:relative,eligible_peers:peers.length,returned_category_rows:quotes.length,full_sector_coverage:false,source_ts,window:'PROVIDER_ROLLING_24H_AT_NEAR_SYNCHRONOUS_QUOTES',quote:'USD_AGGREGATED_NOT_HTX_EXECUTION_PRICE',direction_neutral:false,entry_eligible:false,is_htx_price:false,...(representationScope?{native_representation_scope:representationScope,native_representation_authority:native.provider_ref_primary_authority||native.provider_legacy_bridge.authority}:{})};
 if(!Number.isFinite(median)||!Number.isFinite(relative))return{status:'INVALID_SECTOR_COMPARISON_NUMBERS',evidence:[],summary:null};
 const evidence=buildEvidenceV2({provider_id:SOURCE,upstream_id:'COINGECKO_AGGREGATED_VENUES',asset_id:nativeSectorAssetId(identity,contract)||`${identity.chain}:${identity.contract_or_mint}`,htx_contract:contract,block_id:'N15',metric_family:'SECTOR_RELATIVE_STRENGTH_CONTEXT',origin_event_id:`${coin_id}:${category_id}:${target.source_ts}`,dependency_group:`SECTOR:${coin_id}:${category_id}:${target.source_ts}`,source_ts,observed_ts,expires_at:Math.min(observed_ts+300000,source_ts+MAX_AGE),coverage_status:'PARTIAL_PROVIDER_DIRECTIONAL_CONTEXT',coverage_fraction:coverage,directional_strength:clamp(relative/10,-1,1),extra:{...summary,peers,sector_proof:'EXACT_ASSET_CATEGORY_AND_QUOTE_BASKET_V1',direction_policy:'RELATIVE_STRENGTH_SUPPORTS_LONG_RELATIVE_WEAKNESS_SUPPORTS_SHORT_LOW_WEIGHT'}});
 return{status:'CLOSED',evidence:[evidence],summary};
}

export function coingeckoAccessPolicy(api_key,{strict_fresh_manual=false}={}){
 const key=clean(api_key),policy=SOURCE_POLICIES[SOURCE];
 if(key&&!/^[\x21-\x7e]{10,200}$/.test(key))return{status:'DEMO_KEY_FORMAT_INVALID',allowed:false};
 return{allowed:true,auth_mode:key?'DEMO_HEADER':'KEYLESS_PUBLIC',daily_cap:key?(strict_fresh_manual?policy.demo_daily_cap:policy.demo_ordinary_daily_cap):policy.daily_cap,monthly_module_bound:key?policy.demo_monthly_module_bound:policy.monthly_module_bound,minute_cap:9};
}
// Credentials travel only to the documented Demo origin in a header. They are
// never part of URLs, receipts, cache keys, payloads or transport error text.
export function coingeckoDemoTransport(fetch_impl,api_key){
 const key=clean(api_key);
 if(!coingeckoAccessPolicy(key).allowed)throw Error('DEMO_KEY_FORMAT_INVALID');
 return async(url,options={})=>{
  const u=new URL(url);
  if(u.origin!=='https://api.coingecko.com'||!u.pathname.startsWith('/api/v3/')||u.username||u.password||[...u.searchParams.keys()].some(k=>/key|token/i.test(k)))throw Error('COINGECKO_DEMO_ORIGIN_REQUIRED');
  const headers=new Headers(options.headers);headers.delete('x-cg-pro-api-key');headers.delete('x-cg-demo-api-key');if(key)headers.set('x-cg-demo-api-key',key);
  try{return await fetch_impl(url,{...options,headers,redirect:'error'});}catch{throw Error('COINGECKO_TRANSPORT_FAILED');}
 };
}
// A result-cache hit must retain the exact already verified source tuple.
// Legacy results without this provenance pass through the existing raw-reference
// reader again; a catalog or an accepted version alone cannot close N15.
const sectorDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sectorIdentity=identity=>({chain:identity.chain,asset_kind:identity.asset_kind==='NATIVE'?'NATIVE':'TOKEN',native_asset_id:identity.native_asset_id||null,contract_or_mint:identity.contract_or_mint||null});
const compactSectorMetadata=m=>({id:m.id,symbol:m.symbol,asset_platform_id:m.asset_platform_id??null,platforms:m.platforms,categories:m.categories,links:{homepage:m.links?.homepage||[]}});
function qualifiedSectorResultCache(cached,{contract,identity,coin_id,category_id,category_name,pinned,native,now}){
 const s=cached?.cache_scope,r=cached?.evidence?.[0];
 if(!s||
    s.schema!=='COINGECKO_RESULT_CACHE_SCOPE_V1'||
    s.provider_id!==SOURCE||
    s.contract!==contract||
    JSON.stringify(s.identity)!==JSON.stringify(sectorIdentity(identity))||
    s.pinned!==pinned||
    !Array.isArray(cached.evidence)||
    cached.evidence.length!==1||
    s.evidence_sha256!==sectorDigest(cached.evidence)||
    cached.status!=='CLOSED'||
    !r||
    cached.cache_observed_ts!==s.original_observed_ts||
    cached.cache_expires_ts!==s.expires_at)return false;
 if((pinned||
    native)&&s.coin_id!==coin_id||
    pinned&&(s.category_id!==category_id||
    s.category_name!==category_name)||
    !verifyCoingeckoSectorIdentity(s.metadata,{identity,contract,coin_id:s.coin_id,category_name:s.category_name,asset_platforms:s.asset_platforms})||
    !Array.isArray(s.categories)||
    s.categories.length!==1||
    s.categories[0]?.category_id!==s.category_id||
    s.categories[0]?.name!==s.category_name)return false;
 const expectedAsset=nativeSectorAssetId(identity,contract)||`${identity.chain}:${identity.contract_or_mint}`;
 if(r.provider_id!==SOURCE||
    r.upstream_id!=='COINGECKO_AGGREGATED_VENUES'||
    r.asset_id!==expectedAsset||
    r.htx_contract!==contract||
    r.block_id!=='N15'||
    r.metric_family!=='SECTOR_RELATIVE_STRENGTH_CONTEXT'||
    r.sector_proof!=='EXACT_ASSET_CATEGORY_AND_QUOTE_BASKET_V1'||
    r.schema_version!=='EvidenceV2.1'||
    r.validation_status!=='VALID'||
    r.identity_status!=='EXACT'||
    r.finality_status!=='FINAL'||
    r.coin_id!==s.coin_id||
    r.tag_id!==s.category_id||
    r.category_name!==s.category_name||
    r.quote!=='USD_AGGREGATED_NOT_HTX_EXECUTION_PRICE'||
    r.window!=='PROVIDER_ROLLING_24H_AT_NEAR_SYNCHRONOUS_QUOTES'||
    r.is_htx_price!==false||
    r.entry_eligible!==false||
    r.full_sector_coverage!==false)return false;
 const peers=r.peers;
 if(!Array.isArray(peers)||
    peers.some(x=>!x||
    typeof x!=='object')||
    peers.length<3||
    peers.length>50||
    r.eligible_peers!==peers.length||
    new Set(peers.map(x=>x.id)).size!==peers.length||
    new Set(peers.map(x=>x.symbol)).size!==peers.length||
    !Number.isSafeInteger(r.target_source_ts)||
    peers.some(x=>!x.id||
    !x.symbol||
    x.id===r.coin_id||
    x.symbol===contract.slice(0,-5)||
    x.quote!=='USD_AGGREGATED'||
    typeof x.change_24h_pct!=='number'||
    !Number.isFinite(x.change_24h_pct)||
    !Number.isSafeInteger(x.source_ts)||
    Math.abs(x.source_ts-r.target_source_ts)>120000))return false;
 const clocks=[r.target_source_ts,...peers.map(x=>x.source_ts)];
 if(!Number.isSafeInteger(r.observed_ts)||
    r.observed_ts!==s.original_observed_ts||
    r.first_known_ts!==r.observed_ts||
    r.observed_ts>now||
    clocks.some(t=>t>r.observed_ts)||
    r.source_ts!==Math.min(...clocks)||
    r.expires_at!==Math.min(r.observed_ts+300000,r.source_ts+MAX_AGE)||
    r.expires_at!==s.expires_at||
    r.expires_at<=now)return false;
 const values=peers.map(x=>x.change_24h_pct).sort((a,b)=>a-b),mid=Math.floor(values.length/2),median=values.length%2?values[mid]:(values[mid-1]+values[mid])/2,relative=r.target_change_24h_pct-median;
 if(typeof r.target_change_24h_pct!=='number'||
    !Number.isFinite(r.target_change_24h_pct)||
    r.peer_median_change_24h_pct!==median||
    r.relative_strength_pct_points!==relative||
    r.directional_strength!==clamp(relative/10,-1,1)||
    r.coverage_fraction!==clamp(peers.length/20,.15,.75)||
    r.coverage_status!=='PARTIAL_PROVIDER_DIRECTIONAL_CONTEXT'||
    r.risk_strength!==null||
    r.unit!==null||
    r.value!==null||
    r.origin_event_id!==`${r.coin_id}:${r.tag_id}:${r.target_source_ts}`||
    r.dependency_group!==`SECTOR:${r.coin_id}:${r.tag_id}:${r.target_source_ts}`||
    r.direction_policy!=='RELATIVE_STRENGTH_SUPPORTS_LONG_RELATIVE_WEAKNESS_SUPPORTS_SHORT_LOW_WEIGHT')return false;
 const refs=s.reference_receipts,metadataURL=pinned||
    native?`https://api.coingecko.com/api/v3/coins/${s.coin_id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`:`https://api.coingecko.com/api/v3/coins/${COINGECKO_ASSET_PLATFORMS[identity.chain]}/contract/${encodeURIComponent(identity.contract_or_mint)}`;
 const urls={EXACT_COIN_METADATA:metadataURL,EXACT_CATEGORY_DIRECTORY:'https://api.coingecko.com/api/v3/coins/categories/list',CATEGORY_QUOTES:`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=${s.category_id}&order=market_cap_desc&per_page=100&page=1&sparkline=false`,EXACT_TARGET_QUOTE:`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(s.coin_id)}&sparkline=false`,NATIVE_PLATFORM_BINDING:'https://api.coingecko.com/api/v3/asset_platforms'};
 if(!Array.isArray(refs)||
    refs.some(x=>!x||
    typeof x!=='object')||
    refs.length<3||
    refs.length>5||
    new Set(refs.map(x=>x.route)).size!==refs.length||
    refs.some(x=>x.url!==urls[x.route]||
    !Number.isSafeInteger(x.received_ts)||
    x.received_ts>s.original_observed_ts||
    !/^[a-f0-9]{64}$/.test(x.body_sha256||
    ''))||
    !['EXACT_COIN_METADATA','EXACT_CATEGORY_DIRECTORY','CATEGORY_QUOTES'].every(route=>refs.some(x=>x.route===route))||
    Math.max(...refs.map(x=>x.received_ts))!==s.original_observed_ts)return false;
 return cached.summary&&Object.entries(cached.summary).every(([key,value])=>JSON.stringify(r[key])===JSON.stringify(value));
}
export async function collectCoingeckoSectorEvidence({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,asset_identity,asset_metadata,now=Date.now(),strict_fresh_manual=false,coingecko_demo_api_key=null,provider_budget_observe=null}={}){
 const access=coingeckoAccessPolicy(coingecko_demo_api_key,{strict_fresh_manual});
 if(!access.allowed)return{status:access.status,evidence:[],network_calls:0};
 let coin_id=clean(asset_metadata?.coingecko_id),category_id=clean(asset_metadata?.coingecko_category_id),category_name=clean(asset_metadata?.coingecko_category_name);const identity=asset_identity;
 const native=exactNativeSectorBinding(identity,contract);if(native&&!coin_id)coin_id=native.coin_id;
 const pinned=Boolean(category_id||category_name),platform=COINGECKO_ASSET_PLATFORMS[identity?.chain],validAddress=native||Boolean(platform)&&(identity?.chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(identity.contract_or_mint):identity?.chain==='tron'?/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(identity.contract_or_mint):/^0x[0-9a-f]{40}$/i.test(identity.contract_or_mint));
 if(!validAddress||!isExactHtxUsdtSwapKey(contract)||(pinned&&(!/^[a-z0-9-]{2,100}$/.test(coin_id)||!/^[a-z0-9-]{2,100}$/.test(category_id)||!sectorCategoryLabel(category_name))))return{status:'EXACT_SECTOR_REGISTRY_REQUIRED',evidence:[],network_calls:0};
 if(nativeSourceUsageUnclosed(db))return{status:'ADMISSION_LEDGER_UNAVAILABLE_NATIVE_USAGE',evidence:[],network_calls:0};
 await installEvidenceSourceStore(db);
 if(nativeSourceUsageUnclosed(db))return{status:'ADMISSION_LEDGER_UNAVAILABLE_NATIVE_USAGE',evidence:[],network_calls:0};
 const key=`${contract}:${identity.chain}:${native?identity.native_asset_id:identity.contract_or_mint}:${coin_id}:${category_id}:${category_name}`,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now,include_cache_clock:true});
 if(nativeSourceUsageUnclosed(db))return{status:'ADMISSION_LEDGER_UNAVAILABLE_NATIVE_USAGE',evidence:[],network_calls:0};
 const compatibleCachedVersion=cached?.version===COINGECKO_SECTOR_VERSION||cached?.version==='coingecko-sector-v10-exact-tron-addresses-20261014'||cached?.version==='coingecko-sector-v9-exact-native-denominations-20261014'||!['ICP-USDT','CHZ-USDT'].includes(contract)&&cached?.version==='coingecko-sector-v8-exact-native-provider-bindings-20261014'||!native?.provider_homepages&&cached?.version==='coingecko-sector-v7-optional-free-demo-header-20261013';
 if(!strict_fresh_manual&&compatibleCachedVersion&&qualifiedSectorResultCache(cached,{contract,identity,coin_id,category_id,category_name,pinned,native,now}))return cached;
 const backoff=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:'PROVIDER_BACKOFF',now});
 if(nativeSourceUsageUnclosed(db))return{status:'ADMISSION_LEDGER_UNAVAILABLE_NATIVE_USAGE',evidence:[],network_calls:0};
 if(backoff)return{status:backoff.status,evidence:[],network_calls:0,backoff_until:backoff.backoff_until};
 const reader=createProviderReferenceReader({db,source:SOURCE,run_id,request_admit,fetch_impl:coingeckoDemoTransport(fetch_impl,coingecko_demo_api_key),now,daily_cap:access.daily_cap,minute_provider:'COINGECKO',minute_cap:access.minute_cap,budget_observe:typeof provider_budget_observe==='function'?e=>provider_budget_observe({...e,contract,run_id}):null});
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const asset_platforms=native?.platform&&!native.provider_ref_primary_authority?await reader.get('NATIVE_PLATFORM_BINDING','https://api.coingecko.com/api/v3/asset_platforms',{ttl_ms:86400000,shape:Array.isArray}):null;
 const get=(route,url,options)=>reader.get(route,url,options);
 // Cached reference bodies keep their original receipt clocks, including the
 // moment all required inputs were known. Reading them never renews a fact.
 const originalReferences=()=>reader.summary().receipts.filter(r=>['RECEIVED','VALIDATED_REFERENCE_CACHE','VALIDATED_RUN_MEMORY_REFERENCE'].includes(r.status)).map(({route,url,received_ts,body_sha256})=>({route,url,received_ts,body_sha256}));
 const originalObserved=()=>Math.max(...originalReferences().map(r=>r.received_ts));
 const metadataUrl=(pinned||native)?`https://api.coingecko.com/api/v3/coins/${coin_id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`:`https://api.coingecko.com/api/v3/coins/${platform}/contract/${encodeURIComponent(identity.contract_or_mint)}`;
 const metadata=await get('EXACT_COIN_METADATA',metadataUrl,{ttl_ms:21600000,shape:object});
 if(!pinned)coin_id=clean(metadata?.id);
 const verified=verifyCoingeckoSectorIdentity(metadata,{identity,contract,coin_id,category_name:pinned?category_name:null,asset_platforms});
 const categories=verified?await get('EXACT_CATEGORY_DIRECTORY','https://api.coingecko.com/api/v3/coins/categories/list',{ttl_ms:3600000,shape:Array.isArray}):null;
 if(!pinned){const nativeCategories=Array.isArray(categories)?nativeFunctionalCategories(native).flatMap(name=>{const matches=categories.filter(r=>r.name===name&&/^[a-z0-9-]{2,100}$/.test(r.category_id));return metadata?.categories?.includes(name)&&matches.length===1?matches:[];}):[];const selected=native?nativeCategories[0]:selectCoingeckoSectorCategory(metadata,categories);category_name=selected?.name||'';category_id=selected?.category_id||'';}
 const match=Array.isArray(categories)&&categories.filter(r=>r.category_id===category_id&&r.name===category_name).length===1;
 const quotes=match?await get('CATEGORY_QUOTES',`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=${category_id}&order=market_cap_desc&per_page=100&page=1&sparkline=false`,{ttl_ms:60000,shape:Array.isArray,bypass_cache:strict_fresh_manual}):null;
 let normalized=normalizeCoingeckoSector({metadata,categories,quotes,identity,contract,coin_id,category_id,category_name,asset_platforms,observed_ts:originalObserved()});
 // A category page contains the top100 peers, not necessarily this exact asset.
 // Resolve its missing or stale exact-ID quote under separate admission.
 // Duplicate identities, future clocks and same-symbol peers remain invalid;
 // refreshing the target never refreshes peers or creates extra peer votes.
 const targetRows=Array.isArray(quotes)?quotes.filter(r=>r?.id===coin_id):[],targetSymbol=contract.replace(/-USDT$/,''),targetTs=Date.parse(targetRows[0]?.last_updated),refreshScope=targetRows.length===0?'EXACT_ID_OUTSIDE_CATEGORY_PAGE':targetRows.length===1&&clean(targetRows[0]?.symbol).toUpperCase()===targetSymbol&&Number.isFinite(targetTs)&&targetTs<=Date.now()&&Date.now()-targetTs>MAX_AGE?'EXACT_ID_REFRESH_STALE_CATEGORY_ROW':null;
 // Metadata has already bound the exact provider ID and chain address. A
 // different same-ticker coin is excluded from peers by the normalizer; it
 // cannot veto this separately admitted exact-ID quote request. Duplicate
 // target IDs, wrong symbols and future clocks still have no repair route.
 if(normalized.status==='EXACT_FRESH_TARGET_QUOTE_REQUIRED'&&Array.isArray(quotes)&&refreshScope){
  const targetQuotes=await get('EXACT_TARGET_QUOTE',`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(coin_id)}&sparkline=false`,{ttl_ms:60000,shape:Array.isArray,bypass_cache:strict_fresh_manual});
  if(Array.isArray(targetQuotes)&&targetQuotes.length===1&&targetQuotes[0]?.id===coin_id){
   normalized=normalizeCoingeckoSector({metadata,categories,quotes:[...quotes.filter(r=>r?.id!==coin_id),targetQuotes[0]],identity,contract,coin_id,category_id,category_name,asset_platforms,observed_ts:originalObserved()});
   if(normalized.status==='CLOSED'){normalized.summary.returned_category_rows=quotes.length;normalized.summary.target_quote_route=refreshScope;normalized.summary.previous_target_source_ts=targetRows.length?targetTs:null;Object.assign(normalized.evidence[0],{returned_category_rows:quotes.length,target_quote_route:refreshScope,previous_target_source_ts:targetRows.length?targetTs:null});}
  }
 }
 if(normalized.status==='CLOSED'&&normalized.evidence[0].expires_at<=Math.max(now,Date.now()))normalized={status:'ORIGINAL_SECTOR_FACT_EXPIRED',evidence:[],summary:normalized.summary};
 const transport=reader.summary(),providerBackoff=transport.provider_backoff;
 const result={version:COINGECKO_SECTOR_VERSION,...normalized,...(transport.admission.allowed===false?{status:transport.admission.status}:{}),...(transport.receipts.some(r=>!['RECEIVED','VALIDATED_REFERENCE_CACHE','VALIDATED_RUN_MEMORY_REFERENCE'].includes(r.status))?{status:'SOURCE_NOT_CLOSED'}:{}),...(providerBackoff?{status:providerBackoff.status}:{}),...transport,internal_only:true,free_only:true,auth_mode:access.auth_mode,daily_cap:access.daily_cap,monthly_module_bound:access.monthly_module_bound};
 if(normalized.status==='CLOSED')result.cache_scope={schema:'COINGECKO_RESULT_CACHE_SCOPE_V1',provider_id:SOURCE,contract,identity:sectorIdentity(identity),pinned,coin_id,category_id,category_name,metadata:compactSectorMetadata(metadata),categories:categories.filter(r=>r.category_id===category_id&&r.name===category_name).map(({category_id,name})=>({category_id,name})),asset_platforms:Array.isArray(asset_platforms)?asset_platforms.filter(r=>r.id===native?.platform).map(({id,native_coin_id})=>({id,native_coin_id})):[],reference_receipts:originalReferences(),original_observed_ts:normalized.evidence[0].observed_ts,expires_at:normalized.evidence[0].expires_at,evidence_sha256:sectorDigest(normalized.evidence)};
 const expires=normalized.status==='CLOSED'?normalized.evidence[0].expires_at:now+900000;
 const cache_write_receipts=[{scope:'RESULT',...await writeOptionalEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:normalized.status==='CLOSED'?normalized.evidence[0].observed_ts:now,expires_ts:expires,payload:result})}];
 if(providerBackoff)cache_write_receipts.push({scope:'PROVIDER_BACKOFF',...await writeOptionalEvidenceSourceCache(db,{source:SOURCE,asset_key:'PROVIDER_BACKOFF',observed_ts:now,expires_ts:providerBackoff.backoff_until,payload:providerBackoff})});
 return{...result,cache_write_receipts};
}
