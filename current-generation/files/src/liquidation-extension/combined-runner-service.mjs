import {createRequire} from 'node:module';
import {createRunnerLiquidationExtension} from './runner-extension.mjs';
import {createSharedSourceBudget} from './run-source-budget.mjs';
import {createMultiVenueLiquidationExtension} from './multi-runner-extension.mjs';
import {createGTradeRuntimeCollector} from './gtrade-runtime-collector.mjs';
import {createLighterRuntimeCollector} from './lighter-runtime-collector.mjs';
import {createGmxRuntimeCollector} from './gmx-runtime-collector.mjs';
import {createMultiLiquidationAcquisition} from './gtrade-runtime-bridge.mjs';
import {planLiquidationSourceOrder,buildLiquidationSourceWeightProfile} from '../liquidation-source-weighting.mjs';
import {createOxArchiveCollector} from '../oxarchive-cost-probe.mjs';
const require=createRequire(import.meta.url);
export const PINNED_GTRADE_SDK_VERSION='1.8.10';
function defaultSdkLoader(){return{version:require('@gainsnetwork/sdk/package.json').version,sdk:require('@gainsnetwork/sdk')};}
export function classifyOperationalSourceOutcome({status,result=false,actual_http=null}={}){
 const value=String(status||'UNKNOWN').toUpperCase(),knownActual=Number.isSafeInteger(actual_http)?actual_http:null;
 if(/^(SKIPPED_|QUOTA_NOT_GRANTED|SOURCE_PHASE_DEADLINE|.*ALREADY_RESERVED)/.test(value))return{evaluated:false,attempted_http_count:knownActual??0,admission_status:'NOT_DISPATCHED',transport_status:'NOT_ATTEMPTED',schema_status:'NOT_EVALUATED',coverage_status:'NOT_EVALUATED',role_usable:false,failure_origin:'INTERNAL_SCHEDULER'};
 if(value.includes('UNSUPPORTED'))return{evaluated:true,operational_success:true,attempted_http_count:knownActual??1,admission_status:'ADMITTED',transport_status:'CLOSED',schema_status:'CLOSED',coverage_status:'UNSUPPORTED',role_usable:false,failure_origin:'COVERAGE'};
 if(result)return{evaluated:true,operational_success:true,attempted_http_count:knownActual??1,admission_status:'ADMITTED',transport_status:'CLOSED',schema_status:'CLOSED',coverage_status:'SUPPORTED',role_usable:true,failure_origin:null};
 const quota=value.includes('429')||value.includes('RATE_LIMITED')||value.includes('QUOTA_EXHAUSTED'),schema=value.includes('SCHEMA')||value.includes('IDENTITY')||value.includes('DIGEST');
 return{evaluated:true,operational_success:false,attempted_http_count:knownActual??1,admission_status:'ADMITTED',transport_status:quota?'PROVIDER_RATE_LIMITED':schema?'CLOSED':'FAILED',schema_status:schema?'INVALID':'NOT_CLOSED',coverage_status:'UNKNOWN',role_usable:false,failure_origin:quota?'PROVIDER_QUOTA':schema?'SCHEMA':'TRANSPORT'};
}
// This factory is the one called by generated runner code. OFF makes zero SDK,
// D1 or HTTP calls. Both providers pass through the SAME request budget and
// network concurrency limiter. No separate scheduler or trading path is added.
export function createCombinedLiquidationService({mode='OFF',provider_admit,fetch_impl=globalThis.fetch,clock=Date.now,sdk_loader=defaultSdkLoader,secondary_enabled=true,accounts_per_deep=3,max_http_per_run=5,max_total_ms=45000,liqflow_key='',oxarchive_collect=null,oxarchive_config=null,source_weight_store=null}={}){
 if(mode!=='SHADOW_ONLY')return null;
 const budget=createSharedSourceBudget({provider_admit,fetch_impl,clock,max_requests:max_http_per_run,max_parallel:2,max_total_ms});
 const primary=createRunnerLiquidationExtension({mode:'SHADOW_ONLY',admit:budget.admit,fetch_impl:budget.fetch,clock,accounts_per_deep,max_http_per_run,max_total_ms,liqflow_key});
 let secondary=null,sdkStatus=secondary_enabled?'PINNED_SDK_NOT_AVAILABLE':'SECONDARY_DISABLED_BY_CONFIGURATION';
 if(secondary_enabled){
  try{
   const loaded=sdk_loader();
   if(loaded?.version!==PINNED_GTRADE_SDK_VERSION)sdkStatus='PINNED_SDK_VERSION_MISMATCH';
   else if(typeof loaded.sdk?.getLiquidationPrice!=='function'||typeof loaded.sdk?.buildLiquidationPriceContext!=='function')sdkStatus='SDK_INTERFACE_NOT_CLOSED';
   else{secondary=createGTradeRuntimeCollector({sdk:loaded.sdk,fetch_impl:budget.fetch,clock,max_wall_ms:20000});sdkStatus='PINNED_SDK_LOADED';}
  }catch{sdkStatus='PINNED_SDK_NOT_AVAILABLE';}
 }
 const combined=createMultiVenueLiquidationExtension({hyperliquid_extension:primary,gtrade_collector:secondary,admit:budget.admit,clock});
 const lighter=createLighterRuntimeCollector({fetch_impl:budget.fetch,clock,max_wall_ms:30000});
 const gmx=createGmxRuntimeCollector({fetch_impl:budget.fetch,clock,max_wall_ms:30000});
 const oxarchive=typeof oxarchive_collect==='function'?oxarchive_collect:createOxArchiveCollector({...oxarchive_config,fetch_impl:budget.fetch,clock});
 const routed=[];let lastWeightProfile=buildLiquidationSourceWeightProfile(['HYPERLIQUID_NATIVE']);
 async function collect(params={}){
  const requestedCandidateCap=Number(params?.max_http_for_candidate);
  const candidateHttpCap=Number.isSafeInteger(requestedCandidateCap)?Math.max(0,Math.min(max_http_per_run,requestedCandidateCap)):max_http_per_run;
  const candidateReservedStart=budget.summary().reserved_http;
  const restrict=Array.isArray(params.allowed_source_ids),allowed=new Set(restrict?params.allowed_source_ids:[]);
  const id=params?.source_identity||{},lanes=[];
  if(!restrict||allowed.has('HYPERLIQUID_NATIVE'))lanes.push('HYPERLIQUID_NATIVE');
  if(typeof secondary==='function'&&(!restrict||allowed.has('GTRADE_NATIVE')))lanes.push('GTRADE_NATIVE');
  if(Number.isSafeInteger(id.lighter_market_id)&&id.lighter_market_id>=0&&(!restrict||allowed.has('LIGHTER_NATIVE')))lanes.push('LIGHTER_NATIVE');
  if(/^0x[0-9a-f]{40}$/i.test(id.gmx_market_address||'')&&(!restrict||allowed.has('GMX_NATIVE')))lanes.push('GMX_NATIVE');
  if(typeof oxarchive==='function'&&(!restrict||allowed.has('OXARCHIVE_HL_BUCKETS')))lanes.push('OXARCHIVE_HL_BUCKETS');
  if(!lanes.length){routed.push({contract:params.contract,status:'SKIPPED_NO_COVERAGE_ADMITTED_SOURCE',allowed_source_ids:[...allowed],candidate_http_cap:candidateHttpCap});return null;}
  let healthRows=[];try{healthRows=source_weight_store?await source_weight_store.load(lanes):[];}catch{healthRows=[];}
  const hlCost=primary.estimateHttpCost(params),sharedGtrade=secondary?.hasRunSnapshot?.(params.run_id)===true;
  const weighted=planLiquidationSourceOrder({lanes,rows:healthRows,costs:{HYPERLIQUID_NATIVE:hlCost,GTRADE_NATIVE:secondary?.estimateHttpCost?.(params)??(sharedGtrade?0:3),LIGHTER_NATIVE:4,GMX_NATIVE:4,OXARCHIVE_HL_BUCKETS:1},exact:lanes.filter(lane=>lane==='LIGHTER_NATIVE'||lane==='GMX_NATIVE'||lane==='HYPERLIQUID_NATIVE'&&primary.nativeMarketCoverage(params).status==='SUPPORTED'),cached:sharedGtrade?['GTRADE_NATIVE']:[]});lastWeightProfile=weighted.profile;
  // Check every admitted useful route; exact coverage and utility determine order.
  const ordered=weighted.ordered;
  const deadline=Number(params.deep_started_ts)+Math.min(45000,Number(params.max_deep_ms)||45000);
const observe=async(lane,result,status,attempt,evaluated=true,actualHttp=null)=>{const usable=Boolean(result),outcome=classifyOperationalSourceOutcome({status,result:usable,actual_http:actualHttp});if(evaluated===false)outcome.evaluated=false;let health={recorded:false,reason:'NOT_EVALUATED'};if(outcome.evaluated&&outcome.failure_origin!=='PROVIDER_QUOTA')try{health=source_weight_store?await source_weight_store.record({source_id:lane,usable:outcome.operational_success===true,status,now:clock()}):null;}catch(error){health={recorded:false,reason:String(error?.message||error).slice(0,120)};}let roleHealth=null;if(outcome.evaluated&&typeof source_weight_store?.recordRole==='function')try{roleHealth=await source_weight_store.recordRole({source_id:lane,contract:params.contract,run_id:params.run_id,role:lane==='OXARCHIVE_HL_BUCKETS'?'PROJECTED_BUCKET_CONTEXT':'NATIVE_POSITION_CONTEXT',status,role_usable:outcome.role_usable,actual_http:actualHttp,now:clock()});}catch(error){roleHealth={recorded:false,reason:String(error?.message||error).slice(0,120)};}routed.push({contract:params.contract,lane,status,usable,attempt,role_health_update:roleHealth,fallback:attempt>1,candidate_http_cap:candidateHttpCap,selection_profile:weighted.profile,source_outcome:outcome,health_update:health});return result;};
  async function attemptLane(lane,attempt){
   if(clock()>=deadline)return observe(lane,null,'SOURCE_PHASE_DEADLINE_REACHED',attempt,false);
   if(lane==='OXARCHIVE_HL_BUCKETS'){const coverage=primary.nativeMarketCoverage(params).status;if(coverage==='UNSUPPORTED')return observe(lane,null,'UNSUPPORTED_NATIVE_SYMBOL_VERIFIED_HYPERLIQUID_CATALOG',attempt,true,0);if(coverage!=='SUPPORTED')return observe(lane,null,'SKIPPED_NATIVE_MARKET_COVERAGE_NOT_VERIFIED',attempt,false,0);}
   const sharedGtrade=lane==='GTRADE_NATIVE'&&secondary?.hasRunSnapshot?.(params.run_id)===true;
   const declaredCost=lane==='HYPERLIQUID_NATIVE'?primary.estimateHttpCost(params):lane==='GTRADE_NATIVE'?(secondary?.estimateHttpCost?.(params)??(sharedGtrade?0:3)):lane==='OXARCHIVE_HL_BUCKETS'?1:4;
   if(budget.summary().reserved_http-candidateReservedStart+declaredCost>candidateHttpCap)return observe(lane,null,'SKIPPED_CANDIDATE_HTTP_ENVELOPE',attempt,false);
   if(budget.summary().reserved_http+declaredCost>max_http_per_run)return observe(lane,null,'QUOTA_NOT_GRANTED:COMBINED_TOTAL_HTTP_BUDGET',attempt,false);
   if(lane==='HYPERLIQUID_NATIVE'){try{const result=await primary.collect({...params,max_http_for_candidate:Math.max(0,candidateHttpCap-(budget.summary().reserved_http-candidateReservedStart))}),last=primary.summary()?.records?.at?.(-1);return observe(lane,result,result?'ACQUISITION_RETURNED':last?.status||'NOT_CLOSED',attempt,true,Number.isSafeInteger(last?.actual_requests)?last.actual_requests:null);}catch(error){return observe(lane,null,`SOURCE_EXCEPTION:${String(error?.message||error).slice(0,120)}`,attempt);}finally{budget.releaseUnused('HYPERLIQUID');budget.releaseUnused('LIQFLOW');}}
   if(lane==='OXARCHIVE_HL_BUCKETS'){
    const grant=await budget.admit({reservation_id:`LIQ_${lane}:${params.run_id}:${params.contract}`,contract:params.contract,run_id:params.run_id,requests:{OXARCHIVE:1},weights:{OXARCHIVE:1},max_requests:1,deadline_ts:deadline});
    if(grant?.allowed!==true||grant?.new_reservation!==true)return observe(lane,null,`QUOTA_NOT_GRANTED:${grant?.reason||'UNKNOWN'}`,attempt,false);
    try{const result=await oxarchive(params),last=oxarchive.summary?.()?.history?.at?.(-1),status=result?'ACQUISITION_RETURNED':last?.status||'NOT_CLOSED';return observe(lane,result,status,attempt);}catch(error){return observe(lane,null,`SOURCE_EXCEPTION:${String(error?.message||error).slice(0,120)}`,attempt);}finally{budget.releaseUnused('OXARCHIVE');}
   }
   const provider=lane==='GTRADE_NATIVE'?'GTRADE':lane==='LIGHTER_NATIVE'?'LIGHTER':'GMX',cost=lane==='GTRADE_NATIVE'?(secondary?.estimateHttpCost?.(params)??(sharedGtrade?0:3)):4;
   const grant=cost===0?{allowed:true,new_reservation:true,shared_snapshot_reuse:true}:await budget.admit({reservation_id:lane==='GTRADE_NATIVE'?`LIQ_GTRADE_${cost===1?'CATALOG':'SNAPSHOT'}:${params.run_id}`:`LIQ_${lane}:${params.run_id}:${params.contract}`,contract:params.contract,run_id:params.run_id,requests:{[provider]:cost},weights:{[provider]:cost},max_requests:cost,deadline_ts:deadline});
   if(grant?.allowed!==true||grant?.new_reservation!==true)return observe(lane,null,`QUOTA_NOT_GRANTED:${grant?.reason||'UNKNOWN'}`,attempt,false);
   const acquisitionId=`${lane}:${params.run_id}:${params.contract}`;
   try{const result=lane==='GTRADE_NATIVE'?await secondary({...params,acquisition_id:acquisitionId,deadline_ts:deadline,snapshot_admitted:cost===2||sharedGtrade,admit_market_snapshot:async()=>{if(budget.summary().reserved_http-candidateReservedStart+2>candidateHttpCap)return{allowed:false,new_reservation:false,reason:'CANDIDATE_HTTP_ENVELOPE'};return budget.admit({reservation_id:`LIQ_GTRADE_SNAPSHOT:${params.run_id}`,contract:params.contract,run_id:params.run_id,requests:{GTRADE:2},weights:{GTRADE:2},max_requests:2,deadline_ts:deadline});}}):lane==='LIGHTER_NATIVE'?await lighter({...params,acquisition_id:acquisitionId,market_id:id.lighter_market_id,deadline_ts:deadline}):await gmx({...params,acquisition_id:acquisitionId,market_address:id.gmx_market_address,deadline_ts:deadline});
   const acquisition=result?.acquisition?createMultiLiquidationAcquisition({contract:params.contract,run_id:params.run_id,...(lane==='GTRADE_NATIVE'?{gtrade:result.acquisition}:{scoped:[result.acquisition]})}):null;
   return observe(lane,acquisition,result?.status??'NOT_CLOSED',attempt,true,Number.isSafeInteger(result?.requests)?result.requests:null);}catch(error){return observe(lane,null,`SOURCE_EXCEPTION:${String(error?.message||error).slice(0,120)}`,attempt);}finally{budget.releaseUnused(provider);}
  }
  const collected=[];
  for(let i=0;i<ordered.length;i++){const result=await attemptLane(ordered[i],i+1);if(result)collected.push(result);}
  if(!collected.length)return null;if(collected.length===1)return collected[0];
  let hyperliquid=null,gtrade=null;const scoped=[],seen=new Set();
  for(const raw of collected){
   if(raw?.schema==='NATIVE_LIQUIDATION_ACQUISITION_V1'){hyperliquid??=raw;continue;}
   if(raw?.schema!=='MULTI_LIQUIDATION_ACQUISITION_V1')continue;
   hyperliquid??=raw.hyperliquid??null;gtrade??=raw.gtrade??null;
   for(const item of Array.isArray(raw.scoped)?raw.scoped:[]){const key=item?.acquisition_fingerprint||item?.acquisition_id;if(scoped.length>=2||!key||seen.has(key))continue;seen.add(key);scoped.push(item);}
  }
  return createMultiLiquidationAcquisition({contract:params.contract,run_id:params.run_id,hyperliquid,gtrade,scoped});
 }
 return {collect,summary:()=>({mode:'SHADOW_ONLY',state:'DYNAMIC_REPRESENTATIVE_PANEL_DECISION_INPUT',same_admission_and_transport_for_all_sources:true,
  gtrade_sdk:{required_version:PINNED_GTRADE_SDK_VERSION,status:sdkStatus},primary:primary.summary(),secondary:combined.summary(),shared_budget:budget.summary(),
  routed,rotating_lanes:['HYPERLIQUID_NATIVE','GTRADE_NATIVE_WHEN_CONFIGURED','LIGHTER_NATIVE_WHEN_EXACT','GMX_NATIVE_WHEN_EXACT','OXARCHIVE_HL_BUCKETS_WHEN_KEY'],fallback_policy:'EXACT_COVERAGE_AND_ROLE_UTILITY_THEN_ALL_ADMITTED_SUPPLEMENTAL_ROUTES',cross_source_confirmation:true,total_http_cap:max_http_per_run,outside_shared_budget_http:0,notional_summed_across_providers:false,source_overlap_is_not_an_independent_vote:true,source_weighting:{mode:'ROLE_SCOPED_AVAILABILITY_AND_COST;PREDICTIVE_FACTOR_ONLY_WHEN_QUALIFIED',core_decision_weights_changed:false,profile:lastWeightProfile},oxarchive:typeof oxarchive==='function'?oxarchive.summary?.()||{enabled:true}:{enabled:false},output_mode:'CANONICAL_CONTEXT_ONLY_NO_TRADE_AUTHORIZATION',production_enabled:true,automatic_execution:false})};
}
