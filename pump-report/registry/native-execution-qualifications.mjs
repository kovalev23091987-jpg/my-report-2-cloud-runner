import {reviewedNativeCoinOrderbook} from '../sources/native-coin-unit-review.mjs';
// Exact same-venue primary unit review. It grants no current membership,
// actual book receipt, cross-venue identity, multiplier or API admission.
const APT=Object.freeze({instrument_id:'BINGX:USDT_M:100164:APT-USDT',asset_id:'BINGX_UNDERLYING:APT',venue:'BINGX',native_symbol:'APT-USDT',market_type:'PERPETUAL',base:'APT',quote:'USDT',settle:'USDT',margin:'USDT'});
export const EXECUTION_REVIEW_REF='checkpoints/pump-report-20261025/ROOT_F559_APT_EXECUTION_UNIT_REVIEW.json';
function currentUnitScope(entry,reviewed){
  if(reviewed===entry||entry.qualifications?.orderbook||!reviewed.qualifications?.orderbook)return reviewed;
  const historical=entry.limitations??[];
  return {...reviewed,prior_price_scope_limitations:[...historical],
    limitations:[...(reviewed.limitations??[]).filter(x=>!['NEW_PRICE_RELATIVE_CANDLES_ONLY','EXECUTION_QUANTITY_MULTIPLIER_UNKNOWN'].includes(x)),
      'NATIVE_COIN_QUANTITY_ONLY_CONTRACT_MULTIPLIER_AND_PRECISION_NOT_ASSUMED']};
}
export function reviewedNativeExecution(entry){
  if(String(entry?.native_contract_id)!=='100164'||entry.family!=='USDT_M'||Object.entries(APT).some(([k,v])=>entry.instrument?.[k]!==v))return currentUnitScope(entry,reviewedNativeCoinOrderbook(entry));
  return currentUnitScope(entry,{...entry,qualifications:{...entry.qualifications,orderbook:{fields:'COIN',unit:'BASE_ASSET',native_base_unit:'APT',evidence_ref:EXECUTION_REVIEW_REF,
    primary_source_review_sha256:'2ed86695f9984194bb4c556a91862b440da75208999859185181ecb2fb74f7c7',
    qualification_scope:'EXACT_BINGX_USDT_M_100164_APT_USDT_NATIVE_APT_ONLY;ACTUAL_COIN_ARRAYS_T_FRESHNESS_REQUIRED'}},
    execution_review:{scope:'EXACT_NATIVE_APT_COIN_QUANTITY',review_ref:EXECUTION_REVIEW_REF,actual_native_book_qualified:false},
    limitations:[...(entry.limitations??[]),'APT_COIN_UNIT_REVIEW_IS_NOT_CURRENT_BOOK_OR_FULL_CORE_COVERAGE']});
}
