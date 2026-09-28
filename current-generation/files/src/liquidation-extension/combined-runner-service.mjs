import {createRequire} from 'node:module';
import {createRunnerLiquidationExtension} from './runner-extension.mjs';
import {createSharedSourceBudget} from './run-source-budget.mjs';
import {createMultiVenueLiquidationExtension} from './multi-runner-extension.mjs';
import {createGTradeRuntimeCollector} from './gtrade-runtime-collector.mjs';
import {createLighterRuntimeCollector} from './lighter-runtime-collector.mjs';
import {createGmxRuntimeCollector} from './gmx-runtime-collector.mjs';
import {createMultiLiquidationAcquisition} from './gtrade-runtime-bridge.mjs';
import {chooseWeightedLiquidationLane,buildLiquidationSourceWeightProfile} from '../liquidation-source-weighting.mjs';
const require=createRequire(import.meta.url);
export const PINNED_GTRADE_SDK_VERSION='1.8.10';
function defaultSdkLoader(){return{version:require('@gainsnetwork/sdk/package.json').version,sdk:require('@gainsnetwork/sdk')};}
// This factory is the one called by generated runner code. OFF makes zero SDK,
// D1 or HTTP calls. Both providers pass through the SAME request budget and
// network concurrency limiter. No separate scheduler or trading path is added.
export function createCombinedLiquidationService({mode='OFF',provider_admit,fetch_impl=globalThis.fetch,clock=Date.now,sdk_loader=defaultSdkLoader,secondary_enabled=true,accounts_per_deep=3,max_http_per_run=5,max_total_ms=45000,liqflow_key='',oxarchive_collect=null,source_weight_store=null}={}){
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
 const routed=[];let lastWeightProfile=buildLiquidationSourceWeightProfile(['HYPERLIQUID_NATIVE']);
 async function collect(params={}){
  const id=params?.source_identity||{},lanes=['HYPERLIQUID_NATIVE'];if(typeof secondary==='function')lanes.push('GTRADE_NATIVE');if(Number.isSafeInteger(id.lighter_market_id)&&id.lighter_market_id>=0)lanes.push('LIGHTER_NATIVE');if(/^0x[0-9a-f]{40}$/i.test(id.gmx_market_address||''))lanes.push('GMX_NATIVE');if(typeof oxarchive_collect==='function')lanes.push('OXARCHIVE_HL_BUCKETS');
  let healthRows=[];try{healthRows=source_weight_store?await source_weight_store.load(lanes):[];}catch{healthRows=[];}
  const weighted=chooseWeightedLiquidationLane({lanes,seed:`${params.run_id}:${params.contract}`,rows:healthRows});lastWeightProfile=weighted.profile;
  const score=new Map(weighted.profile.map(row=>[row.source_id,row.selection_weight]));
  const first=weighted.lane||lanes[0],ordered=[first,...lanes.filter(lane=>lane!==first).sort((a,b)=>(score.get(b)||0)-(score.get(a)||0))];
  const deadline=Number(params.deep_started_ts)+Math.min(45000,Number(params.max_deep_ms)||45000);
  const observe=async(lane,result,status,attempt)=>{const usable=Boolean(result);let health=null;try{health=source_weight_store?await source_weight_store.record({source_id:lane,usable,status,now:clock()}):null;}catch(error){health={recorded:false,reason:String(error?.message||error).slice(0,120)};}routed.push({contract:params.contract,lane,status,usable,attempt,fallback:attempt>1,selection_profile:weighted.profile,health_update:health});return result;};
  async function attemptLane(lane,attempt){
   if(clock()>=deadline)return observe(lane,null,'SOURCE_PHASE_DEADLINE_REACHED',attempt);
   if(lane==='HYPERLIQUID_NATIVE'){const result=await primary.collect(params);return observe(lane,result,result?'ACQUISITION_RETURNED':'NOT_CLOSED',attempt);}
   if(lane==='OXARCHIVE_HL_BUCKETS'){
    const result=await oxarchive_collect(params),last=oxarchive_collect.summary?.()?.history?.at?.(-1),status=result?'ACQUISITION_RETURNED':last?.status||'NOT_CLOSED';
    return observe(lane,result,status,attempt);
   }
   const provider=lane==='GTRADE_NATIVE'?'GTRADE':lane==='LIGHTER_NATIVE'?'LIGHTER':'GMX',cost=lane==='GTRADE_NATIVE'?3:4;
   const grant=await budget.admit({reservation_id:`LIQ_${lane}:${params.run_id}:${params.contract}`,contract:params.contract,run_id:params.run_id,requests:{[provider]:cost},weights:{[provider]:cost},max_requests:cost,deadline_ts:deadline});
   if(grant?.allowed!==true||grant?.new_reservation!==true)return observe(lane,null,`QUOTA_NOT_GRANTED:${grant?.reason||'UNKNOWN'}`,attempt);
   const acquisitionId=`${lane}:${params.run_id}:${params.contract}`;
   const result=lane==='GTRADE_NATIVE'?await secondary({...params,acquisition_id:acquisitionId,deadline_ts:deadline}):lane==='LIGHTER_NATIVE'?await lighter({...params,acquisition_id:acquisitionId,market_id:id.lighter_market_id,deadline_ts:deadline}):await gmx({...params,acquisition_id:acquisitionId,market_address:id.gmx_market_address,deadline_ts:deadline});
   const acquisition=result?.acquisition?createMultiLiquidationAcquisition({contract:params.contract,run_id:params.run_id,...(lane==='GTRADE_NATIVE'?{gtrade:result.acquisition}:{scoped:[result.acquisition]})}):null;
   return observe(lane,acquisition,result?.status??'NOT_CLOSED',attempt);
  }
  for(let i=0;i<ordered.length;i++){const result=await attemptLane(ordered[i],i+1);if(result)return result;}
  return null;
 }
 return {collect,summary:()=>({mode:'SHADOW_ONLY',state:'DYNAMIC_REPRESENTATIVE_PANEL_DECISION_INPUT',same_admission_and_transport_for_all_sources:true,
  gtrade_sdk:{required_version:PINNED_GTRADE_SDK_VERSION,status:sdkStatus},primary:primary.summary(),secondary:combined.summary(),shared_budget:budget.summary(),
  routed,rotating_lanes:['HYPERLIQUID_NATIVE','GTRADE_NATIVE_WHEN_CONFIGURED','LIGHTER_NATIVE_WHEN_EXACT','GMX_NATIVE_WHEN_EXACT','OXARCHIVE_HL_BUCKETS_WHEN_KEY'],fallback_policy:'WEIGHTED_FIRST_THEN_ELIGIBLE_SOURCES_WITHIN_EXISTING_DEADLINE_AND_BUDGET',source_weighting:{mode:'PERSISTENT_EWMA_AVAILABILITY_WITH_EXPLORATION_FLOOR',core_decision_weights_changed:false,profile:lastWeightProfile},oxarchive:typeof oxarchive_collect==='function'?oxarchive_collect.summary?.()||{enabled:true}:{enabled:false},output_mode:'CANONICAL_CONTEXT_ONLY_NO_TRADE_AUTHORIZATION',production_enabled:true,automatic_execution:false})};
}
