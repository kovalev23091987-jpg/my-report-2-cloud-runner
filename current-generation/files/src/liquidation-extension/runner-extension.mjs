import {selectNativeWalletRouting} from './native-wallet-routing.mjs';
import {chooseNativeAccountDiscovery,readSwoleAccountDiscovery} from './swole-account-discovery.mjs';
import {selectNativeAccountSample} from './select-native-account-sample.mjs';
import {readJson} from './io.mjs';
import {createNativeAcquisition} from './runtime-bridge.mjs';
import {resolveHtxLiquidationSources} from './htx-liquidation-route.mjs';
import {extractHyperliquidMarketContext} from './hyperliquid-market-context.mjs';
import {selectVerifiedNativeAccounts} from './verified-native-account-cache.mjs';
const text=x=>typeof x==='string'?x.trim():'';
// Dependency injection lets the existing runner own scheduler, quota and D1.
// Without a durable quota admission callback the extension makes ZERO calls.
export function createRunnerLiquidationExtension({mode='OFF',admit,fetch_impl=globalThis.fetch,clock=Date.now,accounts_per_deep=3,max_http_per_run=5,max_total_ms=45000,liqflow_key='',swole_discovery_enabled=false,native_wallet_routing=null,on_native_accounts=null}={}){
 if(!Number.isSafeInteger(accounts_per_deep)||accounts_per_deep<1||accounts_per_deep>8)throw Error('ACCOUNT_LIMIT_INVALID');
 if(!Number.isSafeInteger(max_http_per_run)||max_http_per_run<2||max_http_per_run>24)throw Error('RUN_HTTP_LIMIT_INVALID');
 let phaseStart=null;let calls=0;const records=[],inflight=new Map(),catalogByRun=new Map(),accountsByRun=new Map(),hintAttempts=new Set();
 const cachedAccounts=(run_id,native_symbol)=>selectVerifiedNativeAccounts([...(accountsByRun.get(run_id)?.values()||[])],{run_id,symbol:native_symbol,now:clock(),max_age_ms:120000,max_accounts:accounts_per_deep});
 async function collect({contract,run_id,native_symbol,deep_started_ts,max_deep_ms=45000,max_http_for_candidate=max_http_per_run}={}){
  if(mode!=='SHADOW_ONLY')return null;
  if(typeof admit!=='function'){records.push({status:'SKIPPED_DURABLE_ADMISSION_NOT_CONFIGURED',contract});return null;}
  if(!text(contract)||contract!==text(contract)||!text(run_id)||!text(native_symbol)){records.push({status:'SKIPPED_IDENTITY_MISSING',contract});return null;}
  const key=run_id+':'+contract;
  if(inflight.has(key))return inflight.get(key);
  const promise=collectOnce({contract,run_id,native_symbol,deep_started_ts,max_deep_ms,max_http_for_candidate});inflight.set(key,promise);return promise;
 }
 async function collectOnce({contract,run_id,native_symbol,deep_started_ts,max_deep_ms,max_http_for_candidate}){
  const now=clock();if(phaseStart===null)phaseStart=now;const deadline=Math.min(phaseStart+max_total_ms,Number(deep_started_ts)+max_deep_ms);
  if(!Number.isFinite(deadline)||(deadline-now<250&&!cachedAccounts(run_id,native_symbol).length)){records.push({status:'SKIPPED_DEADLINE',contract});return null;}
  const baseRoute=resolveHtxLiquidationSources({contract});
  if(!baseRoute.ok||baseRoute.base!==native_symbol){records.push({status:'NATIVE_SYMBOL_CONTRACT_MISMATCH',contract,native_symbol});return null;}
  if(baseRoute.external_liquidation_map_needed!==true){records.push({status:'SKIPPED_BTC_ETH_BY_USER_POLICY',contract,native_symbol});return null;}
  let discoveryProvider=chooseNativeAccountDiscovery({now:clock(),symbol:native_symbol,liqflow_key,swole_enabled:swole_discovery_enabled});
  if(discoveryProvider==='LIQFLOW'&&clock()>=Date.parse('2026-10-27T00:00:00Z')&&!text(liqflow_key)&&!cachedAccounts(run_id,native_symbol).length&&!selectNativeWalletRouting(native_wallet_routing,{symbol:native_symbol,now:clock()}).length){records.push({status:'SKIPPED_FREE_KEY_ROUTE_NOT_CONFIGURED',contract});return null;}
  const collection_started_ts=clock(),transport=[],accounts=[];let admittedReserved=0,catalogReserved=0;
  async function request(url,body){
   if(clock()>=deadline)return {ok:false,reason:'DEADLINE_REACHED'};
   const isLiqFlow=new URL(url).hostname==='node.liqflow.app';
   const r=await readJson(url,{fetch_impl,clock,timeout_ms:Math.max(1,Math.min(12000,deadline-clock())),max_bytes:2000000,...(body?{method:'POST',body}:{}),...(isLiqFlow&&text(liqflow_key)?{headers:{'X-API-Key':text(liqflow_key)}}:{})});transport.push(r.receipt);return r;
  }
  try{
   let catalog=catalogByRun.get(run_id)??null;
   if(!catalog){
    if(calls+1>max_http_per_run){records.push({status:'SKIPPED_RUN_HTTP_BUDGET',contract,phase:'CATALOG'});return null;}
    calls+=1;
    const catalogGrant=await admit({reservation_id:`LIQ_NATIVE_CATALOG:${run_id}`,contract,run_id,
     requests:{HYPERLIQUID:1},weights:{HYPERLIQUID:22},max_requests:1,deadline_ts:deadline});
    if(catalogGrant?.allowed!==true||catalogGrant?.new_reservation!==true){if(catalogGrant?.reservation_not_created===true)calls-=1;records.push({status:'SKIPPED_CATALOG_QUOTA_OR_RETRY_ALREADY_RESERVED',contract,reason:catalogGrant?.reason??'ADMISSION_NOT_CLOSED',reservation_not_created:catalogGrant?.reservation_not_created===true});return null;}
    admittedReserved+=1;catalogReserved=1;catalog=await request('https://api.hyperliquid.xyz/info',{type:'metaAndAssetCtxs'});
    if(catalog.ok)catalogByRun.set(run_id,catalog);
   }
   if(!catalog.ok||!Array.isArray(catalog.payload?.[0]?.universe)){records.push({status:'NATIVE_CATALOG_NOT_CLOSED',contract,actual_requests:transport.length});return null;}
   const route=resolveHtxLiquidationSources({contract,hyperliquid_catalog:catalog.payload});
   if(route.base!==native_symbol){records.push({status:'NATIVE_SYMBOL_CONTRACT_MISMATCH',contract,native_symbol});return null;}
   if(!route.native_routes.some(x=>x.provider==='HYPERLIQUID_LIQFLOW')){records.push({status:'UNSUPPORTED_NATIVE_SYMBOL',contract,native_symbol,catalog_checked:true,actual_requests:transport.length,htx_factual_still_eligible:true});return null;}
   const marketContext=extractHyperliquidMarketContext({payload:catalog.payload,receipt:catalog.receipt,native_symbol,observed_ts:clock()});
   // A clearinghouse response contains all account positions. Reuse only the
   // original fresh state from this run, retaining its receipt and source clock.
   let reused=cachedAccounts(run_id,native_symbol).slice(0,accounts_per_deep);
   // Stored addresses are discovery hints, never stored liquidation evidence.
   // Every hinted account needs a newly admitted official state read in this run.
   const hints=!reused.length?selectNativeWalletRouting(native_wallet_routing,{symbol:native_symbol,now:clock(),max_accounts:accounts_per_deep}).filter(x=>!hintAttempts.has(run_id+':'+x.address)&&!accountsByRun.get(run_id)?.has(x.address)).slice(0,Math.max(0,Math.min(accounts_per_deep,max_http_for_candidate-transport.length,max_http_per_run-calls))):[];
   if(hints.length&&deadline-clock()>=250){
    hints.forEach(x=>hintAttempts.add(run_id+':'+x.address));calls+=hints.length;
    const hintGrant=await admit({reservation_id:`LIQ_NATIVE_ROUTING_HINT:${run_id}:${contract}`,contract,run_id,requests:{HYPERLIQUID:hints.length},weights:{HYPERLIQUID:2*hints.length},max_requests:hints.length,deadline_ts:deadline});
    if(hintGrant?.allowed===true&&hintGrant?.new_reservation===true){
     admittedReserved+=hints.length;let index=0;
     async function readHint(){while(index<hints.length){const hint=hints[index++],r=await request('https://api.hyperliquid.xyz/info',{type:'clearinghouseState',user:hint.address});if(r.ok){const a={address:hint.address,state:r.payload,http_receipt:r.receipt},cache=accountsByRun.get(run_id)||new Map();cache.set(hint.address,structuredClone(a));accountsByRun.set(run_id,cache);}}}
     await Promise.all([readHint(),readHint()]);reused=cachedAccounts(run_id,native_symbol);
     records.push({status:reused.length?'HINT_CURRENT_NATIVE_LEVELS_VERIFIED':'HINT_NO_CURRENT_NATIVE_LEVELS',contract,hinted_accounts:hints.length,useful_accounts:reused.length,stored_prices_used:false});
    }else{if(hintGrant?.reservation_not_created===true)calls-=hints.length;records.push({status:'SKIPPED_ROUTING_HINT_ADMISSION',contract,reason:hintGrant?.reason??'ADMISSION_NOT_CLOSED'});}
   }
   const saveHints=async()=>{if(typeof on_native_accounts==='function')try{await on_native_accounts({accounts:[...(accountsByRun.get(run_id)?.values()||[])].slice(0,8),run_id,now:clock()});}catch{records.push({status:'OPTIONAL_WALLET_HINT_SAVE_NOT_CLOSED',contract});}};
   const reuseOnly=optionalStatus=>{
    const completed=clock(),originalStart=Math.min(...reused.map(a=>a.http_receipt.received_ts));
    const acquisition=createNativeAcquisition({contract,native_symbol,run_id,acquisition_id:`LIQ_ACQ:${run_id}:${contract}:${collection_started_ts}`,collection_started_ts:originalStart,collection_completed_ts:completed,accounts:reused.map(a=>structuredClone(a)),provenance:{discovery_provider:null,discovery_source_id:null,discovery_status:'NOT_NEEDED_FRESH_VERIFIED_SAME_RUN_ACCOUNT',optional_discovery_status:optionalStatus,selection_bias:'VERIFIED_ORIGINAL_SAME_RUN_NATIVE_ACCOUNT_SAMPLE',sampling_policy:'ORIGINAL_NATIVE_ACCOUNT_REUSE',selected_reasons:[],visible_accounts:null,reused_native_accounts:reused.length,native_account_reuse_policy:'EXACT_RUN_ORIGINAL_CLOCK_MAX120S_NO_DUPLICATES',collection_attempt_started_ts:collection_started_ts,native_symbol_membership_verified:true,execution_asset_identity_verified:false,raw_model_prices_used:false,reservation_id:null,transport_count:transport.length,quota_reserved_requests:admittedReserved,hyperliquid_market_context:marketContext}});
    records.push({status:'ACQUIRED_NATIVE_SAMPLE',contract,run_id,accounts:reused.length,discovery_closed:false,optional_discovery_status:optionalStatus,reused_native_accounts:reused.length,sampling_policy:'ORIGINAL_NATIVE_ACCOUNT_REUSE',actual_requests:transport.length,reserved_requests:admittedReserved,acquisition_fingerprint:acquisition.acquisition_fingerprint});return acquisition;
   };
   // Enrichment needs BOTH discovery and a new native read. Do not spend the
   // last request, or lose already verified levels, on discovery alone.
   if(reused.length&&hints.length){await saveHints();return reuseOnly('CURRENT_NATIVE_REREAD_FROM_STRUCTURAL_WALLET_HINT');}
   if(reused.length&&deadline-clock()<250)return reuseOnly('OPTIONAL_ENRICHMENT_PHASE_DEADLINE');
   if(reused.length&&(reused.length>=accounts_per_deep||transport.length+2>max_http_for_candidate||calls+2>max_http_per_run))return reuseOnly('OPTIONAL_ENRICHMENT_HTTP_ENVELOPE');
   if(!reused.length&&(transport.length+2>max_http_for_candidate||calls+2>max_http_per_run)){records.push({status:'SKIPPED_CANDIDATE_HTTP_ENVELOPE',contract,phase:'SAMPLE',actual_requests:transport.length});return null;}
   if(!reused.length&&discoveryProvider==='LIQFLOW'&&clock()>=Date.parse('2026-10-27T00:00:00Z')&&!text(liqflow_key)){records.push({status:'SKIPPED_FREE_KEY_ROUTE_NOT_CONFIGURED',contract});return null;}
   if(transport.length+1>max_http_for_candidate||calls+1>max_http_per_run){records.push({status:'SKIPPED_CANDIDATE_HTTP_ENVELOPE',contract,phase:'DISCOVERY',actual_requests:transport.length});return null;}
   calls+=1;
   const admitDiscovery=()=>admit({reservation_id:`LIQ_NATIVE_DISCOVERY:${run_id}:${contract}:${discoveryProvider}`,contract,run_id,requests:{[discoveryProvider]:1},weights:{},max_requests:1,deadline_ts:deadline});
   let discoveryGrant=await admitDiscovery();
   if(discoveryProvider==='SWOLE_DISCOVERY'&&discoveryGrant?.reservation_not_created===true&&String(discoveryGrant.reason).endsWith('FREE_QUOTA_EXHAUSTED')&&(clock()<Date.parse('2026-10-27T00:00:00Z')||text(liqflow_key))){discoveryProvider='LIQFLOW';discoveryGrant=await admitDiscovery();}
   if(discoveryGrant?.allowed!==true||discoveryGrant?.new_reservation!==true){if(discoveryGrant?.reservation_not_created===true)calls-=1;if(reused.length)return reuseOnly(discoveryGrant?.reason??'OPTIONAL_DISCOVERY_NOT_ADMITTED');records.push({status:'SKIPPED_DISCOVERY_QUOTA_OR_RETRY_ALREADY_RESERVED',contract,reason:discoveryGrant?.reason??'ADMISSION_NOT_CLOSED',reservation_not_created:discoveryGrant?.reservation_not_created===true});return null;}
   admittedReserved+=1;let list;if(discoveryProvider==='SWOLE_DISCOVERY'){list=await readSwoleAccountDiscovery(native_symbol,{fetch_impl,clock,timeout_ms:Math.max(1,Math.min(12000,deadline-clock()))});transport.push(list.receipt);}else list=await request(`https://node.liqflow.app/api/coin/${encodeURIComponent(native_symbol)}/positions`);
   const discoveryClosed=list.ok&&list.payload?.coin===native_symbol&&Array.isArray(list.payload.positions);
   if(!discoveryClosed&&!reused.length){records.push({status:'DISCOVERY_NOT_CLOSED',contract,discovery_provider:discoveryProvider,reason:list.reason??null,actual_requests:transport.length});return null;}
   const discoveredPositions=discoveryClosed?list.payload.positions:[];
   // Deterministic diversity among visible longs and shorts. Discovery prices are
   // NOT used as liquidation evidence, nor labelled native exchange prices.
   const nativeIndex=catalog.payload[0].universe.findIndex(x=>x.name===native_symbol);
   const rawMark=catalog.payload?.[1]?.[nativeIndex]?.markPx;
   const mark=(typeof rawMark==='number'||typeof rawMark==='string'&&rawMark.trim()!=='')&&Number.isFinite(Number(rawMark))?Number(rawMark):null;
   const freshCapacity=Math.min(accounts_per_deep-reused.length,max_http_for_candidate-transport.length,max_http_per_run-calls);
   const reusedAddresses=new Set(reused.map(a=>a.address.toLowerCase()));
   const sample=freshCapacity>0?selectNativeAccountSample(discoveredPositions.filter(p=>!reusedAddresses.has(String(p?.address||'').toLowerCase())),{mark_price:mark,max_accounts:freshCapacity}):{policy:'NEAR_AND_LARGE_BALANCED_V1',selected:[],eligible_visible_accounts:0};
   const selected=sample.selected;
   accounts.push(...reused.map(a=>structuredClone(a)));
   let grant=null;
   if(selected.length){
    calls+=selected.length;
    grant=await admit({reservation_id:`LIQ_NATIVE_SAMPLE:${run_id}:${contract}`,contract,run_id,requests:{HYPERLIQUID:selected.length},weights:{HYPERLIQUID:selected.length*2},max_requests:selected.length,deadline_ts:deadline});
    if(grant?.allowed!==true||grant?.new_reservation!==true){const deniedReason=grant?.reason??'ADMISSION_NOT_CLOSED';if(grant?.reservation_not_created===true)calls-=selected.length;grant=null;if(!accounts.length){records.push({status:'SKIPPED_SAMPLE_QUOTA_OR_RETRY_ALREADY_RESERVED',contract,reason:deniedReason,actual_requests:transport.length});return null;}}
    else admittedReserved+=selected.length;
   }
   let i=0;async function job(){while(grant?.allowed===true&&i<selected.length){const a=selected[i++];const r=await request('https://api.hyperliquid.xyz/info',{type:'clearinghouseState',user:a.address});if(r.ok){const account={address:a.address,state:r.payload,http_receipt:r.receipt};accounts.push(account);const cache=accountsByRun.get(run_id)||new Map();cache.set(a.address.toLowerCase(),structuredClone(account));accountsByRun.set(run_id,cache);}}}
   await Promise.all([job(),job()]);
   const verified=selectVerifiedNativeAccounts(accounts,{run_id,symbol:native_symbol,now:clock(),max_age_ms:120000,max_accounts:accounts_per_deep});
   const excludedNativeAccounts=verified.length?accounts.filter(a=>!verified.some(v=>v.address.toLowerCase()===a.address.toLowerCase())).map(a=>a.address):[];
   if(verified.length)accounts.splice(0,accounts.length,...verified);
   await saveHints();
   const completed=clock(),originalStart=Math.min(collection_started_ts,...accounts.map(a=>a.http_receipt.received_ts));
   const acquisition=createNativeAcquisition({contract,native_symbol,run_id,acquisition_id:`LIQ_ACQ:${run_id}:${contract}:${collection_started_ts}`,collection_started_ts:originalStart,collection_completed_ts:completed,accounts,
    provenance:{discovery_provider:discoveryProvider==='SWOLE_DISCOVERY'?'Swolecharts':'LiqFlow',discovery_source_id:discoveryProvider,discovery_attribution_url:discoveryProvider==='SWOLE_DISCOVERY'?'https://swolecharts.com/hyperliquid/liquidation-map/'+native_symbol:null,discovery_status:discoveryClosed?'CLOSED':list.reason??'DISCOVERY_SCHEMA_NOT_CLOSED',discovery_total:list.payload?.total??null,discovery_page:list.payload?.page??null,selection_bias:'SAME_RUN_NATIVE_ACCOUNT_POSITIONS_PLUS_FIRST_PAGE_NEAR_AND_LARGE; HINTS_ARE_NOT_EVIDENCE',sampling_policy:sample.policy,selected_reasons:sample.selected.map(x=>x.discovery_reason),visible_accounts:sample.eligible_visible_accounts,excluded_unusable_native_accounts:excludedNativeAccounts,reused_native_accounts:reused.length,native_account_reuse_policy:'EXACT_RUN_ORIGINAL_CLOCK_MAX120S_NO_DUPLICATES',collection_attempt_started_ts:collection_started_ts,native_symbol_membership_verified:true,
    execution_asset_identity_verified:false,raw_model_prices_used:false,reservation_id:grant?.reservation_id??discoveryGrant.reservation_id??null,transport_count:transport.length,quota_reserved_requests:admittedReserved,hyperliquid_market_context:marketContext}});
   records.push({status:'ACQUIRED_NATIVE_SAMPLE',contract,run_id,accounts:accounts.length,discovery_provider:discoveryProvider,discovery_closed:discoveryClosed,reused_native_accounts:reused.length,sampling_policy:sample.policy,actual_requests:transport.length,reserved_requests:admittedReserved,elapsed_ms:completed-collection_started_ts,acquisition_fingerprint:acquisition.acquisition_fingerprint});return acquisition;
  }catch(e){records.push({status:'NATIVE_COLLECTION_FAILED_CLOSED',contract,reason:String(e?.message||e).slice(0,100)});return null;}finally{calls-=Math.max(0,admittedReserved-transport.length);}
 }
 function estimateHttpCost({run_id,native_symbol,max_http_for_candidate=max_http_per_run}={}){const catalog=catalogByRun.get(run_id);if(!catalog?.ok)return 1;const supported=Array.isArray(catalog.payload?.[0]?.universe)&&catalog.payload[0].universe.some(r=>r?.name===native_symbol&&r?.isDelisted!==true);return supported?(cachedAccounts(run_id,native_symbol).length?0:selectNativeWalletRouting(native_wallet_routing,{symbol:native_symbol,now:clock(),max_accounts:accounts_per_deep}).length?1:1+Math.min(accounts_per_deep,Math.max(0,max_http_for_candidate-1))):0;}
 function nativeMarketCoverage({run_id,native_symbol}={}){const catalog=catalogByRun.get(run_id);if(!catalog?.ok||!Array.isArray(catalog.payload?.[0]?.universe)||!text(native_symbol))return{status:'UNKNOWN'};return{status:catalog.payload[0].universe.some(row=>row?.name===native_symbol&&row?.isDelisted!==true)?'SUPPORTED':'UNSUPPORTED',native_symbol,catalog_verified:true};}
 return {collect,estimateHttpCost,nativeMarketCoverage,hasFreshNativeAccount:params=>nativeMarketCoverage(params).status==='SUPPORTED'&&cachedAccounts(params.run_id,params.native_symbol).length>0,hasWalletRoutingHint:params=>selectNativeWalletRouting(native_wallet_routing,{symbol:params.native_symbol,now:clock(),max_accounts:1}).length>0,summary:()=>({mode,source:'NATIVE_LIQUIDATION_EXTENSION',reserved_http:calls,max_http:max_http_per_run,records:[...records],production_sender_enabled:false,automatic_execution:false})};
}
