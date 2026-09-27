import {createMultiLiquidationAcquisition,verifyGTradeAcquisition} from './gtrade-runtime-bridge.mjs';
import {verifyAcquisition,bindNativeAcquisition} from './runtime-bridge.mjs';
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;

// This assessment controls only the need for another source request. It never
// replaces the final canonical binding, renews source clocks, or creates a score.
function primaryAvailability(raw,params,checked_ts){
 if(raw==null)return {retain:false,usable:false,status:'PRIMARY_NOT_RETURNED'};
 try{
  if(!verifyAcquisition(raw)||!Array.isArray(raw.accounts)||raw.contract!==params.contract||raw.run_id!==params.run_id||raw.native_symbol!==params.native_symbol)
   return {retain:false,usable:false,status:'PRIMARY_IDENTITY_OR_DIGEST_INVALID'};
  const view=bindNativeAcquisition(raw,{contract:params.contract,run_id:params.run_id,
   snapshot_id:`SOURCE_ADMISSION_CHECK:${raw.acquisition_id}`,observed_ts:checked_ts,direction:null});
  const usable=view.status==='USABLE_NATIVE_SAMPLE'&&Number.isSafeInteger(view.returned_positive_levels)&&view.returned_positive_levels>0;
  return {retain:true,usable,status:usable?'PRIMARY_POSITIVE_NATIVE_LEVELS_CURRENT':view.reason||'PRIMARY_HAS_NO_POSITIVE_LEVELS'};
 }catch{return {retain:false,usable:false,status:'PRIMARY_SCHEMA_NOT_CLOSED'};}
}
function secondaryIdentity(raw,params){
 try{return verifyGTradeAcquisition(raw)&&raw.contract===params.contract&&raw.run_id===params.run_id&&raw.native_symbol===params.native_symbol&&Array.isArray(raw.above)&&Array.isArray(raw.below);}
 catch{return false;}
}

export function createMultiVenueLiquidationExtension({hyperliquid_extension,gtrade_collector=null,admit=null,clock=Date.now,secondary_min_quality=70,fallback_min_quality=60}={}){
 if(!hyperliquid_extension?.collect)throw Error('PRIMARY_HYPERLIQUID_EXTENSION_REQUIRED');
 const records=[];let inFlight=false;
 async function collect(params={}){
  if(inFlight){records.push({status:'MULTI_SOURCE_CONCURRENT_DEFERRED',contract:params.contract});return null;}
  inFlight=true;
  try{
   let hl=null,primaryStatus='PRIMARY_NOT_RETURNED';
   try{hl=await hyperliquid_extension.collect(params);}catch{primaryStatus='PRIMARY_COLLECTION_EXCEPTION';}
   const available=primaryAvailability(hl,params,clock());
   if(hl!==null)primaryStatus=available.status;
   if(!available.retain)hl=null;
   const q=finite(params.early_candidate_quality_0_100),early=params.early_candidate_bridge===true&&q!==null;
   const strong=early&&q>=secondary_min_quality;
   // An empty, stale, or all-null primary object is NOT a usable map. Keep its
   // valid diagnostic receipt, but permit the already-authorized fallback path.
   const fallback=early&&q>=fallback_min_quality&&!available.usable;
   const manual=params.manual_liquidation_request===true,needSecondary=manual||strong||fallback;
   let gt=null,gtStatus=needSecondary?'GTRADE_NOT_CONFIGURED':'GTRADE_NOT_REQUIRED_FOR_THIS_DEEP';
   if(needSecondary&&typeof gtrade_collector==='function'&&typeof admit==='function'){
    let grant=null;
    try{grant=await admit({reservation_id:`LIQ_GTRADE:${params.run_id}:${params.contract}`,contract:params.contract,run_id:params.run_id,
     requests:{GTRADE:3},weights:{GTRADE:3},max_requests:3,
     deadline_ts:Number(params.deep_started_ts)+Math.min(45000,Number(params.max_deep_ms)||45000)});}
    catch{gtStatus='GTRADE_QUOTA_ACK_EXCEPTION';}
    if(grant?.allowed===true&&grant?.new_reservation===true){
     try{
      const res=await gtrade_collector({contract:params.contract,native_symbol:params.native_symbol,run_id:params.run_id,
       acquisition_id:`GTRADE:${params.run_id}:${params.contract}`,
       deadline_ts:Number(params.deep_started_ts)+Math.min(45000,Number(params.max_deep_ms)||45000)});
      if(res?.acquisition!=null){
       if(secondaryIdentity(res.acquisition,params)){gt=res.acquisition;gtStatus=res.status??'GTRADE_ACQUISITION_RETURNED';}
       else gtStatus='GTRADE_IDENTITY_OR_DIGEST_INVALID';
      }else gtStatus=res?.status??'GTRADE_NO_RESULT';
     }catch{gtStatus='GTRADE_COLLECTION_EXCEPTION';}
    }else if(gtStatus!=='GTRADE_QUOTA_ACK_EXCEPTION')gtStatus='GTRADE_QUOTA_NOT_GRANTED';
   }
   const multi=createMultiLiquidationAcquisition({contract:params.contract,run_id:params.run_id,hyperliquid:hl,gtrade:gt});
   records.push({status:multi?'MULTI_ACQUISITION_READY':'NO_LIQUIDATION_SOURCE_CLOSED',contract:params.contract,quality:q,strong_early:strong,
    fallback_due_primary_missing:fallback,fallback_due_primary_not_usable:fallback,primary_status:primaryStatus,primary_positive_levels_current:available.usable,
    explicit_manual_source_request:manual,hyperliquid:Boolean(hl),gtrade:Boolean(gt),gtrade_status:gtStatus});
   return multi;
  }finally{inFlight=false;}
 }
 return {collect,summary:()=>({mode:'SHADOW_ONLY',source:'MULTI_VENUE_LIQUIDATION_EXTENSION',secondary_min_quality,fallback_min_quality,
  records:[...records],notional_summed_across_providers:false,automatic_execution:false})};
}
