import {selectNativeAccountSample} from './select-native-account-sample.mjs';
import {readJson} from './io.mjs';
import {createNativeAcquisition} from './runtime-bridge.mjs';
import {resolveHtxLiquidationSources} from './htx-liquidation-route.mjs';
import {extractHyperliquidMarketContext} from './hyperliquid-market-context.mjs';
const text=x=>typeof x==='string'?x.trim():'';
// Dependency injection lets the existing runner own scheduler, quota and D1.
// Without a durable quota admission callback the extension makes ZERO calls.
export function createRunnerLiquidationExtension({mode='OFF',admit,fetch_impl=globalThis.fetch,clock=Date.now,accounts_per_deep=3,max_http_per_run=5,max_total_ms=45000,liqflow_key=''}={}){
 if(!Number.isSafeInteger(accounts_per_deep)||accounts_per_deep<1||accounts_per_deep>8)throw Error('ACCOUNT_LIMIT_INVALID');
 if(!Number.isSafeInteger(max_http_per_run)||max_http_per_run<2||max_http_per_run>24)throw Error('RUN_HTTP_LIMIT_INVALID');
 let phaseStart=null;let calls=0;const records=[],inflight=new Map(),catalogByRun=new Map();
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
  if(!Number.isFinite(deadline)||deadline-now<250){records.push({status:'SKIPPED_DEADLINE',contract});return null;}
  const baseRoute=resolveHtxLiquidationSources({contract});
  if(!baseRoute.ok||baseRoute.base!==native_symbol){records.push({status:'NATIVE_SYMBOL_CONTRACT_MISMATCH',contract,native_symbol});return null;}
  if(baseRoute.external_liquidation_map_needed!==true){records.push({status:'SKIPPED_BTC_ETH_BY_USER_POLICY',contract,native_symbol});return null;}
  if(clock()>=Date.parse('2026-10-27T00:00:00Z')&&!text(liqflow_key)){records.push({status:'SKIPPED_FREE_KEY_ROUTE_NOT_CONFIGURED',contract});return null;}
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
    if(catalogGrant?.allowed!==true||catalogGrant?.new_reservation!==true){if(catalogGrant?.reservation_not_created===true)calls-=1;records.push({status:'SKIPPED_CATALOG_QUOTA_OR_RETRY_ALREADY_RESERVED',contract});return null;}
    admittedReserved+=1;catalogReserved=1;catalog=await request('https://api.hyperliquid.xyz/info',{type:'metaAndAssetCtxs'});
    if(catalog.ok)catalogByRun.set(run_id,catalog);
   }
   if(!catalog.ok||!Array.isArray(catalog.payload?.[0]?.universe)){records.push({status:'NATIVE_CATALOG_NOT_CLOSED',contract,actual_requests:transport.length});return null;}
   const route=resolveHtxLiquidationSources({contract,hyperliquid_catalog:catalog.payload});
   if(route.base!==native_symbol){records.push({status:'NATIVE_SYMBOL_CONTRACT_MISMATCH',contract,native_symbol});return null;}
   if(!route.native_routes.some(x=>x.provider==='HYPERLIQUID_LIQFLOW')){records.push({status:'UNSUPPORTED_NATIVE_SYMBOL',contract,native_symbol,catalog_checked:true,actual_requests:transport.length,htx_factual_still_eligible:true});return null;}
   const marketContext=extractHyperliquidMarketContext({payload:catalog.payload,receipt:catalog.receipt,native_symbol,observed_ts:clock()});
   const sampleRequests=1+accounts_per_deep;
   if(transport.length+sampleRequests>max_http_for_candidate){records.push({status:'SKIPPED_CANDIDATE_HTTP_ENVELOPE',contract,phase:'SAMPLE',actual_requests:transport.length});return null;}
   if(calls+sampleRequests>max_http_per_run){records.push({status:'SKIPPED_RUN_HTTP_BUDGET',contract,phase:'SAMPLE'});return null;}
   calls+=sampleRequests;
   const grant=await admit({reservation_id:`LIQ_NATIVE_SAMPLE:${run_id}:${contract}`,contract,run_id,
    requests:{HYPERLIQUID:accounts_per_deep,LIQFLOW:1},weights:{HYPERLIQUID:accounts_per_deep*2},max_requests:sampleRequests,deadline_ts:deadline});
   if(grant?.allowed!==true||grant?.new_reservation!==true){if(grant?.reservation_not_created===true)calls-=sampleRequests;records.push({status:'SKIPPED_SAMPLE_QUOTA_OR_RETRY_ALREADY_RESERVED',contract});return null;}
   admittedReserved+=sampleRequests;const list=await request(`https://node.liqflow.app/api/coin/${encodeURIComponent(native_symbol)}/positions`);
   if(!list.ok||list.payload?.coin!==native_symbol||!Array.isArray(list.payload.positions)){records.push({status:'DISCOVERY_NOT_CLOSED',contract});return null;}
   // Deterministic diversity among visible longs and shorts. Discovery prices are
   // NOT used as liquidation evidence, nor labelled native exchange prices.
   const nativeIndex=catalog.payload[0].universe.findIndex(x=>x.name===native_symbol);
   const rawMark=catalog.payload?.[1]?.[nativeIndex]?.markPx;
   const mark=(typeof rawMark==='number'||typeof rawMark==='string'&&rawMark.trim()!=='')&&Number.isFinite(Number(rawMark))?Number(rawMark):null;
   const sample=selectNativeAccountSample(list.payload.positions,{mark_price:mark,max_accounts:accounts_per_deep});
   const selected=sample.selected;
   let i=0;async function job(){while(i<selected.length){const a=selected[i++];const r=await request('https://api.hyperliquid.xyz/info',{type:'clearinghouseState',user:a.address});if(r.ok)accounts.push({address:a.address,state:r.payload,http_receipt:r.receipt});}}
   await Promise.all([job(),job()]);
   const completed=clock();const acquisition=createNativeAcquisition({contract,native_symbol,run_id,acquisition_id:`LIQ_ACQ:${run_id}:${contract}:${collection_started_ts}`,collection_started_ts,collection_completed_ts:completed,accounts,
    provenance:{discovery_provider:'LiqFlow',discovery_total:list.payload.total??null,discovery_page:list.payload.page??null,selection_bias:'FIRST_PAGE_NEAR_HINT_AND_LARGE_POSITIONS_BALANCED; HINTS_ARE_NOT_EVIDENCE',sampling_policy:sample.policy,selected_reasons:sample.selected.map(x=>x.discovery_reason),visible_accounts:sample.eligible_visible_accounts,native_symbol_membership_verified:true,
    execution_asset_identity_verified:false,raw_model_prices_used:false,reservation_id:grant.reservation_id??null,transport_count:transport.length,quota_reserved_requests:catalogReserved+sampleRequests,hyperliquid_market_context:marketContext}});
   records.push({status:'ACQUIRED_NATIVE_SAMPLE',contract,run_id,accounts:accounts.length,sampling_policy:sample.policy,actual_requests:transport.length,reserved_requests:catalogReserved+sampleRequests,elapsed_ms:completed-collection_started_ts,acquisition_fingerprint:acquisition.acquisition_fingerprint});return acquisition;
  }catch(e){records.push({status:'NATIVE_COLLECTION_FAILED_CLOSED',contract,reason:String(e?.message||e).slice(0,100)});return null;}finally{calls-=Math.max(0,admittedReserved-transport.length);}
 }
 function estimateHttpCost({run_id,native_symbol}={}){const catalog=catalogByRun.get(run_id);if(!catalog?.ok)return 1;const supported=Array.isArray(catalog.payload?.[0]?.universe)&&catalog.payload[0].universe.some(r=>r?.name===native_symbol&&r?.isDelisted!==true);return supported?1+accounts_per_deep:0;}
 function nativeMarketCoverage({run_id,native_symbol}={}){const catalog=catalogByRun.get(run_id);if(!catalog?.ok||!Array.isArray(catalog.payload?.[0]?.universe)||!text(native_symbol))return{status:'UNKNOWN'};return{status:catalog.payload[0].universe.some(row=>row?.name===native_symbol&&row?.isDelisted!==true)?'SUPPORTED':'UNSUPPORTED',native_symbol,catalog_verified:true};}
 return {collect,estimateHttpCost,nativeMarketCoverage,summary:()=>({mode,source:'NATIVE_LIQUIDATION_EXTENSION',reserved_http:calls,max_http:max_http_per_run,records:[...records],production_sender_enabled:false,automatic_execution:false})};
}
