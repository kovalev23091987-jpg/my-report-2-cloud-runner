import {verifiedNativeRotation} from './native-routing-catalog.mjs';
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
import {verifyAcquisition} from './runtime-bridge.mjs';
import {bindGTradeAcquisition,verifyMultiLiquidationAcquisition} from './gtrade-runtime-bridge.mjs';
import {bindScopedProviderAcquisition} from './scoped-provider-runtime-bridge.mjs';
import {normalizeNativeHL} from './providers.mjs';
const require=createRequire(import.meta.url);
export const PINNED_GTRADE_SDK_VERSION='1.8.10';
function defaultSdkLoader(){return{version:require('@gainsnetwork/sdk/package.json').version,sdk:require('@gainsnetwork/sdk')};}
export function classifyOperationalSourceOutcome({status,result=false,role_usable=false,actual_http=null}={}){
 const value=String(status||'UNKNOWN').toUpperCase(),knownActual=Number.isSafeInteger(actual_http)?actual_http:null;
 if(/^(SKIPPED_|QUOTA_NOT_GRANTED|SOURCE_PHASE_DEADLINE|.*ALREADY_RESERVED)/.test(value))return{evaluated:false,attempted_http_count:knownActual??0,admission_status:'NOT_DISPATCHED',transport_status:'NOT_ATTEMPTED',schema_status:'NOT_EVALUATED',coverage_status:'NOT_EVALUATED',role_usable:false,failure_origin:'INTERNAL_SCHEDULER'};
 if(value.includes('UNSUPPORTED'))return{evaluated:true,operational_success:true,attempted_http_count:knownActual??1,admission_status:'ADMITTED',transport_status:'CLOSED',schema_status:'CLOSED',coverage_status:'UNSUPPORTED',role_usable:false,failure_origin:'COVERAGE'};
 if(result)return{evaluated:true,operational_success:true,attempted_http_count:knownActual??1,admission_status:'ADMITTED',transport_status:'CLOSED',schema_status:'CLOSED',coverage_status:'SUPPORTED',role_usable:role_usable===true,failure_origin:role_usable===true?null:'ROLE_EVIDENCE_NOT_CLOSED'};
 const quota=value.includes('429')||value.includes('RATE_LIMITED')||value.includes('QUOTA_EXHAUSTED'),schema=value.includes('SCHEMA')||value.includes('IDENTITY')||value.includes('DIGEST');
 return{evaluated:true,operational_success:false,attempted_http_count:knownActual??1,admission_status:'ADMITTED',transport_status:quota?'PROVIDER_RATE_LIMITED':schema?'CLOSED':'FAILED',schema_status:schema?'INVALID':'NOT_CLOSED',coverage_status:'UNKNOWN',role_usable:false,failure_origin:quota?'PROVIDER_QUOTA':schema?'SCHEMA':'TRANSPORT'};
}
// Health is about future levels, independently of a successful HTTP/schema read.
// This preview does not capture maps or manufacture a report/publication identity.
export function acquisitionHasFreshLevels(raw,{contract,run_id,observed_ts}={}){
 try{
  if(raw?.contract!==contract||raw?.run_id!==run_id||!Number.isSafeInteger(observed_ts))return false;
  if(raw.schema==='NATIVE_LIQUIDATION_ACQUISITION_V1'){
   if(!verifyAcquisition(raw)||raw.collection_completed_ts>observed_ts||observed_ts-raw.collection_completed_ts>120000)return false;
   const receipt=normalizeNativeHL({accounts:raw.accounts},{symbol:raw.native_symbol,route_symbol:contract.replace(/-USDT$/,''),run_id,snapshot_id:'ROLE_HEALTH_ONLY',as_of_ms:observed_ts,received_at_ms:raw.collection_completed_ts,max_age_ms:120000});
   return receipt.usable_for_context===true&&receipt.zones.some(z=>z.notional>0&&((z.liquidated_side==='LONG'&&z.distance_pct<0)||(z.liquidated_side==='SHORT'&&z.distance_pct>0)));
  }
  if(raw.schema==='MULTI_LIQUIDATION_ACQUISITION_V1')return verifyMultiLiquidationAcquisition(raw)&&[raw.hyperliquid,raw.gtrade,...(raw.scoped||[])].filter(Boolean).some(item=>acquisitionHasFreshLevels(item,{contract,run_id,observed_ts}));
  const identity={contract,run_id,snapshot_id:'ROLE_HEALTH_ONLY',observed_ts,direction:null};
  const bound=raw.schema==='SCOPED_PROVIDER_LIQUIDATION_ACQUISITION_V1'?bindScopedProviderAcquisition(raw,identity):raw.schema==='GTRADE_LIQUIDATION_ACQUISITION_V1'?bindGTradeAcquisition(raw,identity):null;
  return bound?.status==='USABLE_SCOPED_NATIVE_CONTEXT'&&[...(bound.above||[]),...(bound.below||[])].some(z=>z.notional>0&&((z.side==='LONG'&&z.distance_pct<0)||(z.side==='SHORT'&&z.distance_pct>0)||z.liquidated_side==='LONG'&&z.distance_pct<0||z.liquidated_side==='SHORT'&&z.distance_pct>0));
 }catch{return false;}
}
// This factory is the one called by generated runner code. OFF makes zero SDK,
// D1 or HTTP calls. Both providers pass through the SAME request budget and
// network concurrency limiter. No separate scheduler or trading path is added.
export function createCombinedLiquidationService({mode='OFF',provider_admit,fetch_impl=globalThis.fetch,clock=Date.now,sdk_loader=defaultSdkLoader,secondary_enabled=true,accounts_per_deep=3,max_http_per_run=5,max_total_ms=45000,liqflow_key='',oxarchive_collect=null,oxarchive_config=null,source_weight_store=null,candidate_slots=1,gtrade_routing_catalog=null,on_gtrade_catalog=null,swole_discovery_enabled=false,gtrade_reserve_rpc_enabled=false,native_wallet_routing=null,on_native_accounts=null}={}){
 if(mode!=='SHADOW_ONLY')return null;
 if(!Number.isSafeInteger(candidate_slots)||candidate_slots<1||candidate_slots>2)throw Error('CANDIDATE_SLOTS_INVALID');
 const budget=createSharedSourceBudget({provider_admit,fetch_impl,clock,max_requests:max_http_per_run,max_parallel:2,max_total_ms});
 const primary=createRunnerLiquidationExtension({mode:'SHADOW_ONLY',admit:budget.admit,fetch_impl:budget.fetch,clock,accounts_per_deep,max_http_per_run,max_total_ms,liqflow_key,swole_discovery_enabled,native_wallet_routing,on_native_accounts});
 let secondary=null,sdkStatus=secondary_enabled?'PINNED_SDK_NOT_AVAILABLE':'SECONDARY_DISABLED_BY_CONFIGURATION';
 if(secondary_enabled){
  try{
   const loaded=sdk_loader();
   if(loaded?.version!==PINNED_GTRADE_SDK_VERSION)sdkStatus='PINNED_SDK_VERSION_MISMATCH';
   else if(typeof loaded.sdk?.getLiquidationPrice!=='function'||typeof loaded.sdk?.buildLiquidationPriceContext!=='function')sdkStatus='SDK_INTERFACE_NOT_CLOSED';
   else{secondary=createGTradeRuntimeCollector({sdk:loaded.sdk,fetch_impl:budget.fetch,clock,max_wall_ms:20000,on_catalog:on_gtrade_catalog,reserve_rpc_enabled:gtrade_reserve_rpc_enabled});sdkStatus='PINNED_SDK_LOADED';}
  }catch{sdkStatus='PINNED_SDK_NOT_AVAILABLE';}
 }
 const combined=createMultiVenueLiquidationExtension({hyperliquid_extension:primary,gtrade_collector:secondary,admit:budget.admit,clock});
 const lighter=createLighterRuntimeCollector({fetch_impl:budget.fetch,clock,max_wall_ms:30000});
 const gmx=createGmxRuntimeCollector({fetch_impl:budget.fetch,clock,max_wall_ms:30000});
 const oxarchive=typeof oxarchive_collect==='function'?oxarchive_collect:createOxArchiveCollector({...oxarchive_config,fetch_impl:budget.fetch,clock});
 const routed=[],visitedByRun=new Map();let lastWeightProfile=buildLiquidationSourceWeightProfile(['HYPERLIQUID_NATIVE']),lastRotation=null;
 async function collect(params={}){
  const requestedCandidateCap=Number(params?.max_http_for_candidate);
  const requestedCap=Number.isSafeInteger(requestedCandidateCap)?Math.max(0,Math.min(max_http_per_run,requestedCandidateCap)):max_http_per_run;
  // Production deep checks are sequential. Preserve a discovery request PLUS one native account verification for
  // a following selected candidate. One catalog request alone cannot
  // return a liquidation level (observed NEAR starvation at09:30). This is not promised level coverage.
  const visited=visitedByRun.get(params.run_id)||new Set();visited.add(params.contract);visitedByRun.set(params.run_id,visited);
  const reserveForFollowingCandidate=2*Math.max(0,candidate_slots-visited.size);
  const candidateHttpCap=candidate_slots===1?requestedCap:Math.min(requestedCap,Math.max(0,max_http_per_run-budget.summary().reserved_http-reserveForFollowingCandidate));
  params={...params,max_http_for_candidate:candidateHttpCap};
  const candidateReservedStart=budget.summary().reserved_http;
  // A pinned gTrade batch can verify BOTH selected markets in the same four
  // requests. Its market/position reads serve the following candidate too;
  // reserving a second native pair on top would disable that existing route.
  // Borrow only after the exact shared catalog supports both selected assets,
  // and only when the complete outstanding batch still fits the global cap.
  const sharedGtradeBatchCap=()=>{
   const batch=params.position_batch_contracts;
   if(candidate_slots!==2||!Array.isArray(batch)||batch.length!==2||new Set(batch).size!==2||!batch.includes(params.contract)||batch.some(code=>typeof code!=='string'||!/^([^\s-]+)-USDT$/u.test(code)||secondary?.nativeMarketCoverage?.({run_id:params.run_id,native_symbol:code.replace(/-USDT$/,'')})?.status!=='SUPPORTED'))return candidateHttpCap;
   const outstanding=secondary?.hasRunSnapshot?.(params.run_id)===true?1:3;
   if(budget.summary().reserved_http+outstanding>max_http_per_run)return candidateHttpCap;
   return Math.min(requestedCap,max_http_per_run-candidateReservedStart);
  };
  const restrict=Array.isArray(params.allowed_source_ids),allowed=new Set(restrict?params.allowed_source_ids:[]);
  const id=params?.source_identity||{},lanes=[];
  if(!restrict||allowed.has('HYPERLIQUID_NATIVE'))lanes.push('HYPERLIQUID_NATIVE');
  if(typeof secondary==='function'&&(!restrict||allowed.has('GTRADE_NATIVE')))lanes.push('GTRADE_NATIVE');
  if(Number.isSafeInteger(id.lighter_market_id)&&id.lighter_market_id>=0&&(!restrict||allowed.has('LIGHTER_NATIVE')))lanes.push('LIGHTER_NATIVE');
  if(/^0x[0-9a-f]{40}$/i.test(id.gmx_market_address||'')&&(!restrict||allowed.has('GMX_NATIVE')))lanes.push('GMX_NATIVE');
  if(typeof oxarchive==='function'&&(!restrict||allowed.has('OXARCHIVE_HL_BUCKETS')))lanes.push('OXARCHIVE_HL_BUCKETS');
  if(!lanes.length){routed.push({contract:params.contract,status:'SKIPPED_NO_COVERAGE_ADMITTED_SOURCE',allowed_source_ids:[...allowed],candidate_http_cap:candidateHttpCap});return null;}
  let healthRows=[];try{healthRows=source_weight_store?await source_weight_store.load(lanes):[];}catch{healthRows=[];}
  // Weekly proof is a structural routing hint only. The producer must still
  // reread the native catalog/account at the original current-run clocks.
  const provenHints=new Set(Array.isArray(params.proven_level_source_ids)?params.proven_level_source_ids.filter(id=>lanes.includes(id)):[]);
  const hlCost=primary.estimateHttpCost(params),sharedGtrade=secondary?.hasRunSnapshot?.(params.run_id)===true;
  lastRotation=verifiedNativeRotation({catalog:gtrade_routing_catalog,contracts:candidate_slots===2?params.position_batch_contracts:[],now:clock()});
  const weighted=planLiquidationSourceOrder({preferred:lastRotation.preferred,lanes,rows:healthRows,costs:{HYPERLIQUID_NATIVE:hlCost,GTRADE_NATIVE:secondary?.estimateHttpCost?.(params)??(sharedGtrade?0:3),LIGHTER_NATIVE:4,GMX_NATIVE:4,OXARCHIVE_HL_BUCKETS:1},exact:lanes.filter(lane=>lane==='LIGHTER_NATIVE'||lane==='GMX_NATIVE'||lane==='HYPERLIQUID_NATIVE'&&(primary.nativeMarketCoverage(params).status==='SUPPORTED'||provenHints.has(lane)||primary.hasWalletRoutingHint(params))||lane==='GTRADE_NATIVE'&&secondary?.nativeMarketCoverage?.(params)?.status==='SUPPORTED'),cached:[...(sharedGtrade?['GTRADE_NATIVE']:[]),...(primary.hasFreshNativeAccount(params)?['HYPERLIQUID_NATIVE']:[])],clock_capable:lanes.filter(x=>x==='HYPERLIQUID_NATIVE'||x==='GTRADE_NATIVE')});lastWeightProfile=weighted.profile;
  // Check every admitted useful route; exact coverage and utility determine order.
  // These existing producers can verify a position-state clock. GMX/Lighter
  // current APIs only verify receipt time; they remain fallback context lanes.
  const ordered=weighted.ordered;
  const deadline=Number(params.deep_started_ts)+Math.min(45000,Number(params.max_deep_ms)||45000);
const observe=async(lane,result,status,attempt,evaluated=true,actualHttp=null,positionProof=null)=>{const usable=acquisitionHasFreshLevels(result,{contract:params.contract,run_id:params.run_id,observed_ts:clock()}),outcome=classifyOperationalSourceOutcome({status,result:Boolean(result),role_usable:usable,actual_http:actualHttp});if(evaluated===false)outcome.evaluated=false;let health={recorded:false,reason:'NOT_EVALUATED'};if(outcome.evaluated&&outcome.failure_origin!=='PROVIDER_QUOTA')try{health=source_weight_store?await source_weight_store.record({source_id:lane,usable:outcome.operational_success===true,status,now:clock()}):null;}catch(error){health={recorded:false,reason:String(error?.message||error).slice(0,120)};}let roleHealth=null;if(outcome.evaluated&&typeof source_weight_store?.recordRole==='function')try{roleHealth=await source_weight_store.recordRole({source_id:lane,contract:params.contract,run_id:params.run_id,role:lane==='OXARCHIVE_HL_BUCKETS'?'PROJECTED_BUCKET_CONTEXT':'NATIVE_POSITION_CONTEXT',status,role_usable:outcome.role_usable,actual_http:actualHttp,now:clock()});}catch(error){roleHealth={recorded:false,reason:String(error?.message||error).slice(0,120)};}routed.push({contract:params.contract,lane,status,usable,attempt,...(positionProof?{position_proof:positionProof}:{}),role_health_update:roleHealth,fallback:attempt>1,candidate_http_cap:candidateHttpCap,selection_profile:weighted.profile,source_outcome:outcome,health_update:health});return result;};
  async function attemptLane(lane,attempt){
   if(clock()>=deadline)return observe(lane,null,'SOURCE_PHASE_DEADLINE_REACHED',attempt,false);
   if(lane==='OXARCHIVE_HL_BUCKETS'){const coverage=primary.nativeMarketCoverage(params).status;if(coverage==='UNSUPPORTED')return observe(lane,null,'UNSUPPORTED_NATIVE_SYMBOL_VERIFIED_HYPERLIQUID_CATALOG',attempt,true,0);if(coverage!=='SUPPORTED')return observe(lane,null,'SKIPPED_NATIVE_MARKET_COVERAGE_NOT_VERIFIED',attempt,false,0);}
   const sharedGtrade=lane==='GTRADE_NATIVE'&&secondary?.hasRunSnapshot?.(params.run_id)===true;
   const declaredCost=lane==='HYPERLIQUID_NATIVE'?primary.estimateHttpCost(params):lane==='GTRADE_NATIVE'?(secondary?.estimateHttpCost?.(params)??(sharedGtrade?0:3)):lane==='OXARCHIVE_HL_BUCKETS'?1:4;
   const laneCap=lane==='GTRADE_NATIVE'?sharedGtradeBatchCap():candidateHttpCap;
   if(budget.summary().reserved_http-candidateReservedStart+declaredCost>laneCap)return observe(lane,null,'SKIPPED_CANDIDATE_HTTP_ENVELOPE',attempt,false);
   if(budget.summary().reserved_http+declaredCost>max_http_per_run)return observe(lane,null,'QUOTA_NOT_GRANTED:COMBINED_TOTAL_HTTP_BUDGET',attempt,false);
   if(lane==='HYPERLIQUID_NATIVE'){try{const result=await primary.collect({...params,max_http_for_candidate:Math.max(0,candidateHttpCap-(budget.summary().reserved_http-candidateReservedStart))}),last=primary.summary()?.records?.at?.(-1);return observe(lane,result,result?'ACQUISITION_RETURNED':last?.status||'NOT_CLOSED',attempt,true,Number.isSafeInteger(last?.actual_requests)?last.actual_requests:null);}catch(error){return observe(lane,null,`SOURCE_EXCEPTION:${String(error?.message||error).slice(0,120)}`,attempt);}finally{budget.releaseUnused('HYPERLIQUID');budget.releaseUnused('LIQFLOW');budget.releaseUnused('SWOLE_DISCOVERY');}}
   if(lane==='OXARCHIVE_HL_BUCKETS'){
    const grant=await budget.admit({reservation_id:`LIQ_${lane}:${params.run_id}:${params.contract}`,contract:params.contract,run_id:params.run_id,requests:{OXARCHIVE:1},weights:{OXARCHIVE:1},max_requests:1,deadline_ts:deadline});
    if(grant?.allowed!==true||grant?.new_reservation!==true)return observe(lane,null,`QUOTA_NOT_GRANTED:${grant?.reason||'UNKNOWN'}`,attempt,false);
    try{const result=await oxarchive(params),last=oxarchive.summary?.()?.history?.at?.(-1),status=result?'ACQUISITION_RETURNED':last?.status||'NOT_CLOSED';return observe(lane,result,status,attempt);}catch(error){return observe(lane,null,`SOURCE_EXCEPTION:${String(error?.message||error).slice(0,120)}`,attempt);}finally{budget.releaseUnused('OXARCHIVE');}
   }
   const provider=lane==='GTRADE_NATIVE'?'GTRADE':lane==='LIGHTER_NATIVE'?'LIGHTER':'GMX',cost=lane==='GTRADE_NATIVE'?(secondary?.estimateHttpCost?.(params)??(sharedGtrade?0:3)):4;
   const grant=cost===0?{allowed:true,new_reservation:true,shared_snapshot_reuse:true}:await budget.admit({reservation_id:lane==='GTRADE_NATIVE'?`LIQ_GTRADE_${cost===1?'CATALOG':'SNAPSHOT'}:${params.run_id}`:`LIQ_${lane}:${params.run_id}:${params.contract}`,contract:params.contract,run_id:params.run_id,requests:{[provider]:cost},weights:{[provider]:cost},max_requests:cost,deadline_ts:deadline});
   if(grant?.allowed!==true||grant?.new_reservation!==true)return observe(lane,null,`QUOTA_NOT_GRANTED:${grant?.reason||'UNKNOWN'}`,attempt,false);
   const acquisitionId=`${lane}:${params.run_id}:${params.contract}`;
   try{const result=lane==='GTRADE_NATIVE'?await secondary({...params,acquisition_id:acquisitionId,deadline_ts:deadline,snapshot_admitted:cost===2||sharedGtrade,position_batch_contracts:candidate_slots===2?params.position_batch_contracts:[],admit_market_snapshot:async()=>{if(budget.summary().reserved_http-candidateReservedStart+2>sharedGtradeBatchCap())return{allowed:false,new_reservation:false,reason:'CANDIDATE_HTTP_ENVELOPE'};return budget.admit({reservation_id:`LIQ_GTRADE_SNAPSHOT:${params.run_id}`,contract:params.contract,run_id:params.run_id,requests:{GTRADE:2},weights:{GTRADE:2},max_requests:2,deadline_ts:deadline});},admit_position_snapshot:async()=>{if(budget.summary().reserved_http-candidateReservedStart+1>sharedGtradeBatchCap())return{allowed:false,new_reservation:false,reason:'CANDIDATE_HTTP_ENVELOPE'};return budget.admit({reservation_id:`LIQ_GTRADE_PINNED_POSITION:${params.run_id}:${params.contract}`,contract:params.contract,run_id:params.run_id,requests:{GTRADE:1},weights:{GTRADE:1},max_requests:1,deadline_ts:deadline});}}):lane==='LIGHTER_NATIVE'?await lighter({...params,acquisition_id:acquisitionId,market_id:id.lighter_market_id,deadline_ts:deadline}):await gmx({...params,acquisition_id:acquisitionId,market_address:id.gmx_market_address,deadline_ts:deadline});
   const acquisition=result?.acquisition?createMultiLiquidationAcquisition({contract:params.contract,run_id:params.run_id,...(lane==='GTRADE_NATIVE'?{gtrade:result.acquisition}:{scoped:[result.acquisition]})}):null;
   return observe(lane,acquisition,result?.status??'NOT_CLOSED',attempt,true,Number.isSafeInteger(result?.requests)?result.requests:null,lane==='GTRADE_NATIVE'?{status:result?.pinned_position_status??null,reason:result?.pinned_position_reason??null,source_clock_closed:result?.position_source_clock_known===true,batch_contracts:result?.position_batch_contracts??[params.contract]}:null);}catch(error){return observe(lane,null,`SOURCE_EXCEPTION:${String(error?.message||error).slice(0,120)}`,attempt);}finally{budget.releaseUnused(provider);}
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
  routed,rotating_lanes:['HYPERLIQUID_NATIVE','GTRADE_NATIVE_WHEN_CONFIGURED','LIGHTER_NATIVE_WHEN_EXACT','GMX_NATIVE_WHEN_EXACT','OXARCHIVE_HL_BUCKETS_WHEN_KEY'],fallback_policy:'EXACT_COVERAGE_AND_ROLE_UTILITY_THEN_ALL_ADMITTED_SUPPLEMENTAL_ROUTES',cross_source_confirmation:true,total_http_cap:max_http_per_run,candidate_slots,preserve_minimum_native_pair_for_following_candidate:candidate_slots===2,following_candidate_minimum_http:2,outside_shared_budget_http:0,notional_summed_across_providers:false,source_overlap_is_not_an_independent_vote:true,native_rotation:lastRotation,source_weighting:{mode:'ROLE_SCOPED_AVAILABILITY_AND_COST;PREDICTIVE_FACTOR_ONLY_WHEN_QUALIFIED',core_decision_weights_changed:false,profile:lastWeightProfile},oxarchive:typeof oxarchive==='function'?oxarchive.summary?.()||{enabled:true}:{enabled:false},output_mode:'CANONICAL_CONTEXT_ONLY_NO_TRADE_AUTHORIZATION',production_enabled:true,automatic_execution:false})};
}
