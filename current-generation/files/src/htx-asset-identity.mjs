import {NATIVE_SECTOR_BINDINGS} from './coingecko-sector-evidence.mjs';
import crypto from 'node:crypto';
import {collectSupplementalCandidateContext,parseSupplementalIdentityRegistry} from './supplemental-candidate-context.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';
import {collectCoinpaprikaHtxIdentity} from './coinpaprika-htx-identity.mjs';

export const HTX_ASSET_IDENTITY_VERSION='htx-official-asset-identity-v3-wire-address-native-20261004';
const SOURCE='HTX_ASSET_REFERENCE',CACHE_KEY='ALL_CURRENCIES_CHAIN_ADDRESSES_V1',TTL=6*60*60_000,DAILY_CAP=8;
export const HTX_ASSET_REFERENCE_URL='https://api.huobi.pro/v2/reference/currencies';
/* HTX can keep a futures market after the asset disappears from its spot
 * currency catalogue. Such a contract must not lose all exact-source checks.
 * Every override is a versioned, independently inspectable chain binding;
 * ticker similarity alone is never sufficient. */
export const FUTURES_ONLY_EXACT_ASSET_BINDINGS=Object.freeze({
 QNT:Object.freeze({
  identity:Object.freeze({chain:'ethereum',contract_or_mint:'0x4a220e6096b25eadb88358cb44068a3248254675'}),
  method:'VERSIONED_EXPLORER_EXACT_TOKEN_BINDING',
  evidence_url:'https://etherscan.io/address/0x4a220e6096b25eadb88358cb44068a3248254675',
  official_domain:'quant.network',
  verified_at:'2026-10-04T23:50:00.000Z',
 }),
});
const text=v=>String(v??'').trim(),evm=/^0x[0-9a-f]{40}$/i,solana=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const chains=Object.freeze({ETH:'ethereum',ETHEREUM:'ethereum',SOL:'solana',SOLANA:'solana',BSC:'bsc',BNB:'bsc',ARBITRUM:'arbitrum',ARBITRUMONE:'arbitrum',BASE:'base',POLYGON:'polygon',MATIC:'polygon',OPTIMISM:'optimism',AVAX:'avalanche',AVALANCHE:'avalanche'});
const chainOf=row=>chains[text(row?.baseChain).toUpperCase().replace(/[ _-]/g,'')]||null;
export function normalizeHtxAssetReferences(payload){
 if(payload?.code!==200||!Array.isArray(payload.data))return{status:'INVALID_HTX_REFERENCE_RESPONSE',entries:{}};
 const grouped=new Map();
 for(const row of payload.data){
  const currency=text(row?.currency).toUpperCase();if(!currency)continue;
  const existing=grouped.get(currency)||[];existing.push(row);grouped.set(currency,existing);
 }
 const entries={};
 for(const [currency,rows] of grouped){
  if(rows.length!==1){entries[currency]={status:'DUPLICATE_HTX_CURRENCY',identities:[]};continue;}
  const ids=new Map(),nativeIds=new Map(),explicitNativeIds=new Map();let native=false,unsupportedNative=false;
  for(const row of Array.isArray(rows[0]?.chains)?rows[0].chains:[]){
   const chain=chainOf(row),rawAddress=text(row?.contractAddress),address=chain&&chain!=='solana'&&/^[0-9a-f]{40}$/i.test(rawAddress)?`0x${rawAddress}`:rawAddress;
   if(!address){native=true;const def=NATIVE_SECTOR_BINDINGS[currency],nativeAliases={BTC:['btc'],LTC:['ltc'],BCH:['bcc'],DOGE:['doge'],ZEC:['zec1'],XLM:['xlm1'],ETC:['etc'],NEAR:['near'],ETH:['eth'],SOL:['sol'],BNB:['bnb1'],AVAX:['avax','cchainavax'],ADA:['ada'],DOT:['dot1'],TRX:['trx1'],ATOM:['atom1'],XRP:['xrp'],SUI:['sui'],APT:['apt']};if(def&&row.chainType===0&&nativeAliases[currency]?.includes(text(row.chain).toLowerCase()))explicitNativeIds.set(def.chain,{chain:def.chain,asset_kind:'NATIVE',native_asset_id:`${def.chain}:mainnet`,contract_or_mint:null});const network=text(row?.baseChain).toUpperCase().replace(/[ _-]/g,'');const accepted=def&&(network===currency||network===def.chain.toUpperCase()||chain===def.chain);if(accepted)nativeIds.set(def.chain,{chain:def.chain,asset_kind:'NATIVE',native_asset_id:`${def.chain}:mainnet`,contract_or_mint:null});else unsupportedNative=true;continue;}
   if(!chain||(chain==='solana'?!solana.test(address):!evm.test(address)))continue;
   const canonical=chain==='solana'?address:address.toLowerCase();ids.set(`${chain}:${canonical}`,{chain,contract_or_mint:canonical});
  }
  if(explicitNativeIds.size===1){entries[currency]={status:'CLOSED',identities:[...explicitNativeIds.values()],binding_scope:'EXACT_NATIVE_CHAIN_TYPE_0',wrapped_bindings_excluded:ids.size};continue;}
  const nativeIdentities=[...nativeIds.values()];if(!ids.size&&nativeIdentities.length===1&&!unsupportedNative){entries[currency]={status:'CLOSED',identities:nativeIdentities};continue;}
  const identities=[...ids.values()];entries[currency]={status:identities.length&&native?'NATIVE_AND_TOKEN_BINDINGS_REQUIRE_EXPLICIT_SCOPE':identities.length===1?'CLOSED':identities.length>1?'AMBIGUOUS_HTX_CHAIN_ADDRESSES':native?'NATIVE_OR_UNSUPPORTED_HTX_ASSET':'SUPPORTED_HTX_TOKEN_ADDRESS_NOT_FOUND',identities};
 }
 return{status:'CLOSED',entries};
}
function selectReference(bundle,contract,{cache_status,network_calls=0}={}){
 const currency=contract.slice(0,-5),entry=bundle.entries?.[currency];
 return{version:HTX_ASSET_IDENTITY_VERSION,status:entry?.status||'HTX_CURRENCY_NOT_FOUND',contract,currency,
  identity:entry?.status==='CLOSED'?entry.identities[0]:null,identity_method:entry?.status==='CLOSED'?(entry.identities[0]?.asset_kind==='NATIVE'?'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK':'HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS'):null,
  network_calls,cache_status,receipt:bundle.receipt,reference_observed_ts:bundle.observed_ts,reference_kind:'STATIC_ASSET_BINDING_ONLY',internal_only:true};
}
export async function collectHtxAssetIdentity({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,now=Date.now(),clock=Date.now}={}){
 const market=text(contract).toUpperCase();
 if(!db?.prepare||!/^\S+-USDT$/u.test(market)||!text(run_id))return{status:'EXACT_HTX_MARKET_AND_RUN_REQUIRED',identity:null,network_calls:0};
 const override=FUTURES_ONLY_EXACT_ASSET_BINDINGS[market.slice(0,-5)];
 if(override)return{version:HTX_ASSET_IDENTITY_VERSION,status:'CLOSED',contract:market,currency:market.slice(0,-5),identity:override.identity,identity_method:override.method,network_calls:0,cache_status:'VERSIONED_FUTURES_ONLY_BINDING',receipt:{evidence_url:override.evidence_url,official_domain:override.official_domain,verified_at:override.verified_at,reference_kind:'STATIC_EXACT_CHAIN_BINDING'},reference_observed_ts:Date.parse(override.verified_at),reference_kind:'STATIC_ASSET_BINDING_ONLY',internal_only:true};
 await installEvidenceSourceStore(db);
 const withFallback=async primary=>{
  if(primary.status==='CLOSED')return primary;
  const fallback=await collectCoinpaprikaHtxIdentity({db,fetch_impl,request_admit,contract:market,run_id,now});
  if(fallback.status==='CLOSED')return{...fallback,network_calls:Number(primary.network_calls||0)+Number(fallback.network_calls||0),htx_asset_reference_status:primary.status,htx_asset_reference_receipt:primary.receipt||null};
  return{...primary,network_calls:Number(primary.network_calls||0)+Number(fallback.network_calls||0),identity_fallback_status:fallback.status,identity_fallback_receipts:fallback.receipts||[]};
 };
 const cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:CACHE_KEY,now});
 if(cached?.version===HTX_ASSET_IDENTITY_VERSION&&Number.isFinite(cached.observed_ts)&&cached.observed_ts<=now)return withFallback(selectReference(cached,market,{cache_status:'VALID_HTX_REFERENCE_CACHE'}));
 const id=`HTX_ASSET_REFERENCE:${run_id}`;
 const grant=typeof request_admit==='function'?request_admit({logical_request_id:id,lane:'background',attempts:1}):null;
 if(grant?.allowed!==true||grant.duplicate===true)return{status:grant?.status||'WHOLE_JOB_HTTP_ADMISSION_REQUIRED',identity:null,network_calls:0};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:id,attempts:1,daily_cap:DAILY_CAP,now});
 if(!admission.allowed)return{status:admission.status,identity:null,network_calls:0};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetch_impl(HTX_ASSET_REFERENCE_URL,{headers:{accept:'application/json'},signal:controller.signal});
  const payload=await response.json().catch(()=>null),observed=clock(),normalized=normalizeHtxAssetReferences(payload);
  if(!response.ok||normalized.status!=='CLOSED')return withFallback({status:'HTX_ASSET_REFERENCE_SOURCE_NOT_CLOSED',identity:null,network_calls:1,http_status:response.status});
  const bundle={version:HTX_ASSET_IDENTITY_VERSION,entries:normalized.entries,observed_ts:observed,
   receipt:{endpoint:HTX_ASSET_REFERENCE_URL,http_status:response.status,received_ts:observed,parsed_payload_sha256:crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}};
  await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:CACHE_KEY,observed_ts:observed,expires_ts:observed+TTL,payload:bundle});
  return withFallback(selectReference(bundle,market,{cache_status:'REFRESHED',network_calls:1}));
 }catch(error){return withFallback({status:'HTX_ASSET_REFERENCE_SOURCE_ERROR',identity:null,network_calls:1,error:text(error?.message||error).slice(0,160)});}
 finally{clearTimeout(timer);}
}

export async function collectHtxBoundSupplementalContext({reference_enabled=true,supplemental_collect=collectSupplementalCandidateContext,...params}={}){
 const contract=text(params.contract).toUpperCase(),base=contract.replace(/-USDT$/,''),registry=params.registry||{};
 const known=parseSupplementalIdentityRegistry(registry).entries[base]?.identity;
 let reference=null,scopedRegistry=registry;
 if(reference_enabled&&!known){
  reference=await collectHtxAssetIdentity(params);
  if(reference.status==='CLOSED')scopedRegistry={...registry,[base]:{...(registry[base]||{}),...reference.identity,...(reference.coinpaprika_id?{coinpaprika_id:reference.coinpaprika_id}:{})}};
 }
 const context=await supplemental_collect({...params,registry:scopedRegistry,allow_identity_discovery:reference_enabled?false:params.allow_identity_discovery});
 if(!reference)return context;
 return{...context,identity_method:reference.status==='CLOSED'?reference.identity_method:context.identity_method,
  asset_reference:reference,identity_reference_network_calls:reference.network_calls,total_network_calls:Number(context.network_calls||0)+reference.network_calls};
}
