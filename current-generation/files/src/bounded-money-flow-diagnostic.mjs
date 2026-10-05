import {validateEvidenceV2,evidenceDedupKey} from './evidence-v2.mjs';
import {digest} from './upstream-proof-utils.mjs';
const n=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function reviewBoundedMoneyFlow({evidence=[],contract,run_id,snapshot_id,decision_ts}={}){
 const receipts=[],seen=new Set();
 if(typeof contract!=='string'||typeof run_id!=='string'||!run_id||snapshot_id!==`S392:${contract}:${decision_ts}`)return {status:'EXACT_SNAPSHOT_REQUIRED',receipts:[],score_contribution:0};
 for(const row of evidence){
  if(row?.block_id!=='N12'||row.htx_contract!==contract||row.provider_id!=='HTX_LARGE_TRADES'||row.metric_family!=='ACTUAL_TAKER_TRADES_BOUNDED_IMBALANCE'||!validateEvidenceV2(row,{decision_ts}).usable)continue;
  const buy=n(row.buy_quote_turnover_usdt),sell=n(row.sell_quote_turnover_usdt),total=n(row.value),count=n(row.valid_recent_rows),ratio=n(row.directional_strength),key=evidenceDedupKey(row);
  if(buy===null||sell===null||buy<0||sell<0||!(total>0)||!Number.isSafeInteger(count)||count<1||
   Math.abs(buy+sell-total)>Math.max(1e-6,total*1e-8)||ratio===null||Math.abs((buy-sell)/total-ratio)>1e-9||
   row.whole_window_coverage_proven!==false||row.cvd_window_complete!==false||seen.has(key))continue;
  seen.add(key);
  const receipt={schema:'BOUNDED_MONEY_FLOW_DIAGNOSTIC_REVIEW_V1',block_id:'N12',consumer:'MONEY_FLOW_DIAGNOSTIC',
   reason:'FACTUAL_BOUNDED_FLOW_REVIEWED',assessment_mode:'UNSCORED_MARKET_OBSERVATION',
   contract,run_id,snapshot_id,decision_ts,evidence_id:row.evidence_id,raw_hash:row.raw_hash,physical_root_key:key,
   source_ts:row.source_ts,first_known_ts:row.first_known_ts,observed_trade_count:count,
   observed_buy_quote_usdt:buy,observed_sell_quote_usdt:sell,observed_total_quote_usdt:total,
   observed_sample_imbalance:ratio,sample_flow:buy>sell?'BUY_DOMINANT':buy<sell?'SELL_DOMINANT':'BALANCED',
   whole_window_coverage_proven:false,cvd_window_complete:false,scope:'ONLY_RETURNED_VERIFIED_HTX_FUTURES_TRADES',
   trade_direction_created:false,score_contribution:0,control_effect:false,entry_authorized:false};
  receipts.push({...receipt,fingerprint:digest(receipt)});
 }
 return {schema:'BOUNDED_MONEY_FLOW_DIAGNOSTIC_REVIEWS_V1',status:receipts.length?'CLOSED_CONTEXT_REVIEW':'NO_VALID_BOUNDED_FLOW',receipts,score_contribution:0,entry_authorized:false};
}
export function verifyBoundedMoneyFlowReviews(review,args){
 const expected=reviewBoundedMoneyFlow(args);
 if(review?.status!=='CLOSED_CONTEXT_REVIEW'||expected.status!=='CLOSED_CONTEXT_REVIEW')return [];
 return expected.receipts.filter(wanted=>Array.isArray(review.receipts)&&review.receipts.some(r=>(()=>{const {fingerprint,...body}=r;return fingerprint===wanted.fingerprint&&digest(body)===fingerprint;})()));
}
