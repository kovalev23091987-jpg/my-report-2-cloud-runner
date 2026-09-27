import {createMultiLiquidationAcquisition} from './gtrade-runtime-bridge.mjs';
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export function createMultiVenueLiquidationExtension({hyperliquid_extension,gtrade_collector=null,admit=null,clock=Date.now,secondary_min_quality=70,fallback_min_quality=60}={}){
 if(!hyperliquid_extension?.collect)throw Error('PRIMARY_HYPERLIQUID_EXTENSION_REQUIRED');
 const records=[];let inFlight=false;
 async function collect(params={}){
  if(inFlight){records.push({status:'MULTI_SOURCE_CONCURRENT_DEFERRED',contract:params.contract});return null;}inFlight=true;
  try{
   const hl=await hyperliquid_extension.collect(params);
   const q=finite(params.early_candidate_quality_0_100),early=params.early_candidate_bridge===true&&q!==null;const strong=early&&q>=secondary_min_quality;const fallback=early&&q>=fallback_min_quality&&!hl;const manual=params.manual_liquidation_request===true;const needSecondary=manual||strong||fallback;
   let gt=null,gtStatus=needSecondary?'GTRADE_NOT_CONFIGURED':'GTRADE_NOT_REQUIRED_FOR_THIS_DEEP';
   if(needSecondary&&typeof gtrade_collector==='function'&&typeof admit==='function'){
    const grant=await admit({reservation_id:`LIQ_GTRADE:${params.run_id}:${params.contract}`,contract:params.contract,run_id:params.run_id,requests:{GTRADE:3},weights:{GTRADE:3},max_requests:3,deadline_ts:Number(params.deep_started_ts)+Math.min(45000,Number(params.max_deep_ms)||45000)});
    if(grant?.allowed===true&&grant?.new_reservation===true){const res=await gtrade_collector({contract:params.contract,native_symbol:params.native_symbol,run_id:params.run_id,acquisition_id:`GTRADE:${params.run_id}:${params.contract}`,deadline_ts:Number(params.deep_started_ts)+Math.min(45000,Number(params.max_deep_ms)||45000)});gt=res?.acquisition??null;gtStatus=res?.status??'GTRADE_NO_RESULT';}
    else gtStatus='GTRADE_QUOTA_NOT_GRANTED';
   }
   const multi=createMultiLiquidationAcquisition({contract:params.contract,run_id:params.run_id,hyperliquid:hl,gtrade:gt});records.push({status:multi?'MULTI_ACQUISITION_READY':'NO_LIQUIDATION_SOURCE_CLOSED',contract:params.contract,quality:q,strong_early:strong,fallback_due_primary_missing:fallback,explicit_manual_source_request:manual,hyperliquid:Boolean(hl),gtrade:Boolean(gt),gtrade_status:gtStatus});return multi;
  }finally{inFlight=false;}
 }
 return {collect,summary:()=>({mode:'SHADOW_ONLY',source:'MULTI_VENUE_LIQUIDATION_EXTENSION',secondary_min_quality,fallback_min_quality,records:[...records],notional_summed_across_providers:false,automatic_execution:false})};
}
