import {verifyAcquisition} from './runtime-bridge.mjs';
import {verifyMultiLiquidationAcquisition,verifyGTradeAcquisition} from './gtrade-runtime-bridge.mjs';
import {verifyScopedProviderAcquisition} from './scoped-provider-runtime-bridge.mjs';

// Only this service instance and this selected run own these raw acquisitions.
// Collect the second selected market before returning to unrelated deep work.
// The service still owns the single 45s deadline and all source reservations.
const batches=new WeakMap();
const code=v=>typeof v==='string'&&/^[^-\s]+-USDT$/u.test(v);
function fresh(raw,params,now){
 if(!raw||raw.contract!==params.contract||raw.run_id!==params.run_id)return false;
 if(raw.schema==='MULTI_LIQUIDATION_ACQUISITION_V1'){const parts=[raw.hyperliquid,raw.gtrade,...(raw.scoped||[])].filter(Boolean);return parts.length>0&&verifyMultiLiquidationAcquisition(raw)&&parts.every(r=>fresh(r,params,now));}
 const valid=raw.schema==='NATIVE_LIQUIDATION_ACQUISITION_V1'?verifyAcquisition(raw):raw.schema==='GTRADE_LIQUIDATION_ACQUISITION_V1'?verifyGTradeAcquisition(raw):verifyScopedProviderAcquisition(raw);
 return valid&&raw.native_symbol===params.native_symbol&&Number.isSafeInteger(raw.collection_completed_ts)&&raw.collection_completed_ts<=now&&now-raw.collection_completed_ts<=120000;
}
export async function collectSelectedNativeBatch({service,params,selection,coverage_for,http_by_contract,clock=Date.now}={}){
 const contracts=selection?.contracts;
 const exactPair=selection?.run_id===params.run_id&&typeof params.run_id==='string'&&params.run_id.trim()&&Array.isArray(contracts)&&contracts.length===2&&new Set(contracts).size===2&&contracts.every(code)&&contracts.includes(params.contract)&&params.native_symbol===params.contract.replace(/-USDT$/,'')&&params.manual_liquidation_request!==true;
 const coverage=coverage_for(params.contract);
 const decorate=p=>{const c=coverage_for(p.contract);return{...p,cache_only:p.cache_only===true||Number(p.max_http_for_candidate)===0,allowed_source_ids:c.source_ids,proven_level_source_ids:c.proven_level_source_ids||[],structural_market_source_ids:c.structural_market_source_ids||[],dydx_position_batch_contracts:exactPair?contracts.filter(v=>coverage_for(v).source_ids.includes('DYDX_PINNED_NATIVE')):[],position_batch_contracts:exactPair?contracts.filter(v=>coverage_for(v).eligible&&coverage_for(v).source_ids.includes('GTRADE_NATIVE')):[]};};
 const collect=async p=>{const before=service.summary().shared_budget.reserved_http;try{return await service.collect(decorate(p));}finally{http_by_contract.set(p.contract,(http_by_contract.get(p.contract)||0)+Math.max(0,service.summary().shared_budget.reserved_http-before));}};
 if(!coverage.eligible)return null;
 let batch=batches.get(service);
 const identity=exactPair?JSON.stringify([params.run_id,contracts]):null;
 if(batch?.identity===identity&&identity&&batch.results.has(params.contract)){
  const saved=batch.results.get(params.contract);
  if(saved===null||!fresh(saved,params,clock()))return null;
  // Preserve the existing trusted dYdX cache-only validation and its audit.
  if(params.cache_only===true&&coverage.source_ids.includes('DYDX_PINNED_NATIVE'))return await collect({...params,cache_only:true})||saved;
  return saved;
 }
 const sourceHttp=params.cache_only!==true&&Number(params.max_http_for_candidate)!==0;
 if(!exactPair||!sourceHttp)return collect(params);
 batch={identity,results:new Map()};batches.set(service,batch);
 const first=await collect(params);batch.results.set(params.contract,first);
 const other=contracts.find(v=>v!==params.contract);
 if(coverage_for(other).eligible){
  // The following candidate keeps its existing two-request discovery reserve.
  // Do not borrow a larger first-candidate envelope or restart its deadline.
  const following={contract:other,native_symbol:other.replace(/-USDT$/,''),run_id:params.run_id,deep_started_ts:params.deep_started_ts,max_deep_ms:params.max_deep_ms,max_http_for_candidate:2,cache_only:false,manual_liquidation_request:false,source_identity:null,early_candidate_bridge:false,early_candidate_quality_0_100:null};
  try{batch.results.set(other,await collect(following));}catch{batch.results.set(other,null);}
 }
 return first;
}
