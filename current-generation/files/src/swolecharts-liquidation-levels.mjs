import {approvedHtxAnalysisAssetForContract} from './approved-htx-analysis-scope.mjs';
import {SWOLE_CATALOG_ROUTE} from './liquidation-source-http-plan.mjs';

const finite=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))?Number(value):null;
const tier=amount=>amount>=1_000_000?'огромная':amount>=100_000?'крупная':amount>=10_000?'средняя':'небольшая';
const empty=(contract,status,reason,network_calls=0)=>({source:'SWOLECHARTS_CEX_MODEL',contract,status,reason,network_calls,scenarios:[],model_only:true,independent_primary_source:false,internal_only:true});

export function normalizeSwolechartsLiquidationLevels(payload,{contract,reference_price,observed_ts=Date.now()}={}){
 const base=approvedHtxAnalysisAssetForContract(contract),reference=finite(reference_price),sourceTs=finite(payload?.as_of),sourcePrice=finite(payload?.price);
 if(!base||['BTC','ETH'].includes(base))return empty(contract,'EXCLUDED_BY_USER_POLICY','APPROVED_NON_BTC_ETH_REQUIRED');
 if(!(reference>0))return empty(contract,'REFERENCE_NOT_CLOSED','HTX_REFERENCE_PRICE_REQUIRED');
 if(payload?.coin!==base||payload?.has_data!==true||payload?.estimated!==true||payload?.range!=='24h'||!String(payload?.model_version||'').trim())return empty(contract,'IDENTITY_OR_MODEL_NOT_CLOSED','EXACT_COIN_AND_ESTIMATED_MODEL_REQUIRED');
 if(!Number.isSafeInteger(observed_ts)||observed_ts<=0||!Number.isSafeInteger(sourceTs)||sourceTs>observed_ts||observed_ts-sourceTs>300_000)return empty(contract,'SOURCE_CLOCK_NOT_CURRENT','FIVE_MINUTE_SOURCE_CLOCK_REQUIRED');
 if(!(sourcePrice>0)||Math.abs(sourcePrice/reference-1)>.05)return empty(contract,'PRICE_NOT_CLOSED','HTX_PRICE_WITHIN_FIVE_PERCENT_REQUIRED');
 const scenarios=[];
 for(const [side,rows] of [['LONG',payload?.levels?.long],['SHORT',payload?.levels?.short]]){
  if(!Array.isArray(rows))continue;
  for(const row of rows.slice(0,40)){
   const price=finite(row?.mid),low=finite(row?.lo),high=finite(row?.hi),size=finite(row?.usd);
   if(!(price>0)||!(low>0)||!(high>=price&&price>=low)||!(size>0)||side==='LONG'&&price>=sourcePrice||side==='SHORT'&&price<=sourcePrice)continue;
   scenarios.push({htx_contract:contract,source:'Swolecharts https://swolecharts.com',venue:null,independence_group:'SWOLECHARTS_AGGREGATED_CEX_MODEL',evidence_class:'AGGREGATED_CEX_MODELED_LEVELS',kind:'PROJECTED',status:'CLOSED',source_ts:sourceTs,native_reference_price:sourcePrice,native_price:price,price_quote:'USD',notional_usd:size,notional_unit:'USD',liquidated_side:side,price_semantics:'SWOLECHARTS_PROVIDER_MODEL_BIN_MID',model_version:String(payload.model_version).slice(0,80),amount_semantics:'MODELED_BIN_INTENSITY_NOT_OBSERVED_OPEN_POSITION',scenario_estimated_size_tier:tier(size),source_backed_calculated:true,scenario_only:true,estimated:true,decision_target_eligible:false});
  }
 }
 if(!scenarios.some(row=>row.liquidated_side==='LONG')||!scenarios.some(row=>row.liquidated_side==='SHORT'))return empty(contract,'SCHEMA_NOT_CLOSED','BOTH_NUMERIC_FUTURE_SIDES_REQUIRED');
 return {source:'SWOLECHARTS_CEX_MODEL',contract,status:'CLOSED',source_ts:sourceTs,reference_price:sourcePrice,price_divergence_pct:Math.abs(sourcePrice/reference-1)*100,scenarios,network_calls:0,independent_primary_source:false,model_only:true,internal_only:true};
}

export async function collectSwolechartsLiquidationLevels({contract,reference_price,run_id,fetch_impl=globalThis.fetch,request_admit=null,max_http=1}={}){
 const base=approvedHtxAnalysisAssetForContract(contract);
 if(!base||['BTC','ETH'].includes(base))return empty(contract,'EXCLUDED_BY_USER_POLICY','APPROVED_NON_BTC_ETH_REQUIRED');
 if(!SWOLE_CATALOG_ROUTE.has(base))return empty(contract,'EXACT_ROUTE_UNVERIFIED','NOT_IN_SAVED_SOURCE_CATALOG');
 if(!(finite(reference_price)>0))return empty(contract,'REFERENCE_NOT_CLOSED','HTX_REFERENCE_PRICE_REQUIRED');
 if(max_http<1)return empty(contract,'DEFERRED_HTTP_ENVELOPE','SHARED_LIQUIDATION_HTTP_CAP');
 if(request_admit){const grant=request_admit({logical_request_id:`SWOLE_LIQ:${run_id}:${contract}`,lane:'background',attempts:1});if(!grant?.allowed||grant.duplicate)return empty(contract,'DEFERRED_HTTP_ENVELOPE','UNIFIED_HTTP_NOT_ADMITTED');}
 try{
  const response=await fetch_impl(`https://swolecharts.com/api/liquidation-levels/${encodeURIComponent(base)}`,{method:'GET',headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});
  if(!response.ok)return empty(contract,'SOURCE_HTTP_ERROR',`HTTP_${response.status}`,1);
  const body=await response.text();if(body.length>65_536)return empty(contract,'SCHEMA_NOT_CLOSED','RESPONSE_TOO_LARGE',1);
  return {...normalizeSwolechartsLiquidationLevels(JSON.parse(body),{contract,reference_price,observed_ts:Date.now()}),network_calls:1,http_status:response.status};
 }catch(error){return empty(contract,'SOURCE_ERROR',String(error?.message||error).slice(0,160),1);}
}
