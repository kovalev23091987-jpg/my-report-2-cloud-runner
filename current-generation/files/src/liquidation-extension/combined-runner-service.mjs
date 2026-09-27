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
 const routed=[];let lastWeightProfile=buildLiquidationSourceWeightProfile(['NATIVE']);
 async function collect(params={}){
  const id=params?.source_identity||{},lanes=['NATIVE'];if(Number.isSafeInteger(id.lighter_market_id)&&id.lighter_market_id>=0)lanes.push('LIGHTER');if(/^0x[0-9a-f]{40}$/i.test(id.gmx_market_address||''))lanes.push('GMX');if(typeof oxarchive_collect==='function')lanes.push('OXARCHIVE');
  let healthRows=[];try{healthRows=source_weight_store?await source_weight_store.load(lanes):[];}catch{healthRows=[];}
  const weighted=chooseWeightedLiquidationLane({lanes,seed:`${params.run_id}:${params.contract}`,rows:healthRows}),lane=weighted.lane||'NATIVE';lastWeightProfile=weighted.profile;
  const observe=async(result,status)=>{const usable=Boolean(result);let health=null;try{health=source_weight_store?await source_weight_store.record({source_id:lane,usable,status,now:clock()}):null;}catch(error){health={recorded:false,reason:String(error?.message||error).slice(0,120)};}routed.push({contract:params.contract,lane,status,usable,selection_profile:weighted.profile,health_update:health});return result;};
  if(lane==='NATIVE'){const result=await combined.collect(params);return observe(result,result?'ACQUISITION_RETURNED':'NOT_CLOSED');}
  if(lane==='OXARCHIVE'){const result=await oxarchive_collect(params);return observe(result,result?'ACQUISITION_RETURNED':'NOT_CLOSED');}
  const deadline=Number(params.deep_started_ts)+Math.min(45000,Number(params.max_deep_ms)||45000),provider=lane;
  const grant=await budget.admit({reservation_id:`LIQ_${lane}:${params.run_id}:${params.contract}`,contract:params.contract,run_id:params.run_id,requests:{[provider]:4},weights:{[provider]:4},max_requests:4,deadline_ts:deadline});
  if(grant?.allowed!==true||grant?.new_reservation!==true){routed.push({contract:params.contract,lane,status:'QUOTA_NOT_GRANTED',usable:false,selection_profile:weighted.profile,health_update:{recorded:false,reason:'NOT_EVALUATED_QUOTA'}});return null;}
  const acquisitionId=`${lane}:${params.run_id}:${params.contract}`;
  const result=lane==='LIGHTER'?await lighter({...params,acquisition_id:acquisitionId,market_id:id.lighter_market_id,deadline_ts:deadline}):await gmx({...params,acquisition_id:acquisitionId,market_address:id.gmx_market_address,deadline_ts:deadline});
  const acquisition=result?.acquisition?createMultiLiquidationAcquisition({contract:params.contract,run_id:params.run_id,scoped:[result.acquisition]}):null;
  return observe(acquisition,result?.status??'NOT_CLOSED');
 }
 return {collect,summary:()=>({mode:'SHADOW_ONLY',state:'DYNAMIC_REPRESENTATIVE_PANEL_DECISION_INPUT',same_admission_and_transport_for_all_sources:true,
  gtrade_sdk:{required_version:PINNED_GTRADE_SDK_VERSION,status:sdkStatus},primary:primary.summary(),secondary:combined.summary(),shared_budget:budget.summary(),
  routed,rotating_lanes:['NATIVE','LIGHTER_WHEN_EXACT','GMX_WHEN_EXACT','OXARCHIVE_WHEN_KEY'],source_weighting:{mode:'PERSISTENT_EWMA_AVAILABILITY_WITH_EXPLORATION_FLOOR',core_decision_weights_changed:false,profile:lastWeightProfile},oxarchive:typeof oxarchive_collect==='function'?oxarchive_collect.summary?.()||{enabled:true}:{enabled:false},output_mode:'CANONICAL_CONTEXT_ONLY_NO_TRADE_AUTHORIZATION',production_enabled:true,automatic_execution:false})};
}
