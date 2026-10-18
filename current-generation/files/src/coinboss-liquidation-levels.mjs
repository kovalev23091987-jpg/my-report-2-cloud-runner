import {approvedHtxAnalysisAssetForContract} from './approved-htx-analysis-scope.mjs';

const number=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))?Number(value):null;
const tier=amount=>amount>=1_000_000?'огромная':amount>=100_000?'крупная':amount>=10_000?'средняя':'небольшая';
const no=(contract,status,reason,network_calls=0)=>({source:'COINBOSS_CEX_MODEL',contract,status,reason,network_calls,scenarios:[],internal_only:true});
// The original exact requests returned BTC for these four assets. Retain the
// failed identity receipt instead of calling this an owner exclusion or
// repeating the same known unhelpful route on every forty-minute report.
const mismatchedSymbols=new Set(['哈基米','币安人生','牛来','龙虾']);
export function coinBossLiquidationRequestAdmission(contract){
 const base=approvedHtxAnalysisAssetForContract(contract);
 if(!base)return no(contract,'IDENTITY_NOT_CLOSED','EXACT_APPROVED_HTX_ASSET_REQUIRED');
 if(['BTC','ETH'].includes(base))return no(contract,'EXCLUDED_BY_USER_POLICY','OWNER_EXCLUDED_BTC_ETH_LEVELS');
 if(mismatchedSymbols.has(base))return{...no(contract,'EXACT_SOURCE_IDENTITY_UNVERIFIED','SAVED_EXACT_REQUEST_RETURNED_OTHER_ASSET'),capability_receipt:{requested_symbol:base,returned_symbol:'BTC',proof:'checkpoints/source-inputs/coinboss-exact-symbol-mismatches-20261012.json',original_probe_sha256:'10c41f4e6bf5dd551617391c083d597b74b64c29da3654760da3bb311d7dd1db',current_market_fact:false,automatic_repeat_allowed:false}};
 return null;
}

export function normalizeCoinBossLiquidationLevels(payload,{contract,reference_price,observed_ts=Date.now()}={}){
 const base=approvedHtxAnalysisAssetForContract(contract),reference=number(reference_price),data=payload?.data;
 if(!base)return no(contract,'IDENTITY_NOT_CLOSED','EXACT_APPROVED_HTX_ASSET_REQUIRED');
 if(['BTC','ETH'].includes(base))return no(contract,'EXCLUDED_BY_USER_POLICY','OWNER_EXCLUDED_BTC_ETH_LEVELS');
 if(!Number.isSafeInteger(observed_ts)||!(reference>0))return no(contract,'REFERENCE_NOT_CLOSED','HTX_REFERENCE_PRICE_REQUIRED');
 if(payload?.success!==true||data?.symbol!==base)return no(contract,'IDENTITY_NOT_CLOSED','EXACT_RESPONSE_SYMBOL_REQUIRED');
 const sourceTs=number(data.updatedAt),sourcePrice=number(data.price),oi=number(data.oiUsd);
 if(!Number.isSafeInteger(sourceTs)||sourceTs>observed_ts||observed_ts-sourceTs>300_000)return no(contract,'SOURCE_CLOCK_NOT_CURRENT','FIVE_MINUTE_SOURCE_CLOCK_REQUIRED');
 if(!(sourcePrice>0)||!(oi>0)||Math.abs(sourcePrice/reference-1)>.05)return no(contract,'PRICE_OR_OI_NOT_CLOSED','POSITIVE_OI_AND_HTX_PRICE_WITHIN_FIVE_PERCENT_REQUIRED');
 const scenarios=[];
 for(const leverage of ['10','25','50','100']){
  const row=data.tiers?.[leverage];
  for(const [side,field,amountField] of [['LONG','longPrice','longIntensity'],['SHORT','shortPrice','shortIntensity']]){
   const price=number(row?.[field]),intensity=number(row?.[amountField]);
   if(!(price>0)||!(intensity>0)||side==='LONG'&&price>=sourcePrice||side==='SHORT'&&price<=sourcePrice)continue;
   scenarios.push({htx_contract:contract,source:'CoinBoss',venue:null,independence_group:'COINBOSS_AGGREGATED_CEX_MODEL',evidence_class:'AGGREGATED_CEX_MODELED_LEVELS',kind:'PROJECTED',status:'CLOSED',source_ts:sourceTs,native_reference_price:sourcePrice,native_price:price,price_quote:'USD',notional_usd:intensity,notional_unit:'USD',liquidated_side:side,price_semantics:'COINBOSS_AGGREGATED_LEVERAGE_MODEL',model_version:'COINBOSS_PUBLIC_API_2026',leverage_scenarios:[Number(leverage)],amount_semantics:'MODELED_INTENSITY_NOT_OBSERVED_OPEN_POSITION',scenario_estimated_size_tier:tier(intensity),source_backed_calculated:true,scenario_only:true,estimated:true,decision_target_eligible:false});
  }
 }
 if(!scenarios.some(z=>z.liquidated_side==='LONG')||!scenarios.some(z=>z.liquidated_side==='SHORT'))return no(contract,'SCHEMA_NOT_CLOSED','BOTH_FUTURE_SIDES_REQUIRED');
 return {source:'COINBOSS_CEX_MODEL',contract,status:'CLOSED',source_ts:sourceTs,reference_price:sourcePrice,oi_usd:oi,price_divergence_pct:Math.abs(sourcePrice/reference-1)*100,scenarios,network_calls:0,independent_primary_source:false,model_only:true,internal_only:true};
}

export async function collectCoinBossLiquidationLevels({contract,reference_price,run_id,fetch_impl=globalThis.fetch,request_admit=null,now=Date.now(),max_http=1}={}){
 const base=approvedHtxAnalysisAssetForContract(contract);
 const admission=coinBossLiquidationRequestAdmission(contract);if(admission)return admission;
 if(!(number(reference_price)>0))return no(contract,'REFERENCE_NOT_CLOSED','HTX_REFERENCE_PRICE_REQUIRED');
 if(max_http<1)return no(contract,'DEFERRED_HTTP_ENVELOPE','SHARED_LIQUIDATION_HTTP_CAP');
 if(request_admit){const grant=request_admit({logical_request_id:`COINBOSS_LIQ:${run_id}:${contract}`,lane:'background',attempts:1});if(!grant?.allowed||grant.duplicate)return no(contract,'DEFERRED_HTTP_ENVELOPE','UNIFIED_HTTP_NOT_ADMITTED');}
 try{
  const response=await fetch_impl(`https://api.coinboss.com/api/liq-levels?symbol=${encodeURIComponent(base)}`,{method:'GET',headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});
  if(!response.ok)return no(contract,'SOURCE_HTTP_ERROR',`HTTP_${response.status}`,1);
  const body=await response.text();if(body.length>65_536)return no(contract,'SCHEMA_NOT_CLOSED','RESPONSE_TOO_LARGE',1);
  return {...normalizeCoinBossLiquidationLevels(JSON.parse(body),{contract,reference_price,observed_ts:Date.now()}),network_calls:1,http_status:response.status};
 }catch(error){return no(contract,'SOURCE_ERROR',String(error?.message||error).slice(0,160),1);}
}
