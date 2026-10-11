import {validateEvidenceV2,evidenceDedupKey} from './evidence-v2.mjs';
import {digest} from './upstream-proof-utils.mjs';
const n=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const close=(a,b)=>a!==null&&b!==null&&Math.abs(a-b)<=Math.max(1e-9,Math.abs(b)*1e-9);
function sameRunMarketReview(row,key,{contract,run_id,snapshot_id,decision_ts}){
 if(row.metric_family==='ACTUAL_TAKER_TRADES_BOUNDED_MULTI_MARKET'){
  if(row.provider_id!=='HTX_SPOT_FUTURES_TRADES'||row.upstream_id!=='HTX_OFFICIAL_SPOT_AND_FUTURES_RAW_FILLS'||row.unit!=='RATIO'||row.independent_venue_count!==1||row.whole_window_coverage_proven!==false||row.entry_eligible!==false||row.agreement_policy!=='SAME_SIGN_ABS_IMBALANCE_GTE_0_05_ABS_STRENGTH_SPREAD_LTE_0_15'||!Array.isArray(row.components)||row.components.length!==2)return null;
  const components=row.components.map((c,i)=>{
   const buy=n(c.buy_quote_turnover_usdt),sell=n(c.sell_quote_turnover_usdt),count=n(c.valid_recent_rows),ratio=n(c.imbalance);
   if(c.venue!=='HTX'||c.market!==(i===0?'FUTURES':'SPOT')||!(buy>=0&&sell>=0&&buy+sell>0)||!Number.isSafeInteger(count)||count<1||!close(ratio,(buy-sell)/(buy+sell))||!Number.isSafeInteger(c.source_ts)||c.source_ts>decision_ts)return null;
   return{market:c.market,source_ts:c.source_ts,observed_trade_count:count,observed_buy_quote_usdt:buy,observed_sell_quote_usdt:sell,observed_sample_imbalance:ratio};
  });
  if(components.some(c=>!c)||row.source_ts!==Math.min(...components.map(c=>c.source_ts)))return null;
  const [a,b]=components.map(c=>c.observed_sample_imbalance),agreed=Math.abs(a)>=.05&&Math.abs(b)>=.05&&Math.sign(a)===Math.sign(b)&&Math.abs(Math.abs(a)-Math.abs(b))<=.15,direction=agreed?Math.sign(a)*Math.min(Math.abs(a),Math.abs(b)):null;
  if(row.coverage_status!==(agreed?'BOUNDED_MULTIMARKET_AGREEMENT':'BOUNDED_MULTIMARKET_DISAGREEMENT')||(agreed?(!close(n(row.directional_strength),direction)||!close(n(row.value),direction)||!(n(row.coverage_fraction)>0)):(row.directional_strength!==null||row.value!==null||row.coverage_fraction!==0)))return null;
  const receipt={schema:'BOUNDED_MONEY_FLOW_DIAGNOSTIC_REVIEW_V1',block_id:'N12',consumer:'MONEY_FLOW_DIAGNOSTIC',reason:agreed?'FACTUAL_BOUNDED_MARKETS_AGREE':'FACTUAL_BOUNDED_MARKETS_CONFLICT',assessment_mode:'UNSCORED_MARKET_OBSERVATION',contract,run_id,snapshot_id,decision_ts,evidence_id:row.evidence_id,raw_hash:row.raw_hash,physical_root_key:key,source_ts:row.source_ts,first_known_ts:row.first_known_ts,components,independent_venue_count:1,sample_flow:agreed?(direction>0?'BUY_DOMINANT':'SELL_DOMINANT'):'NO_COMMON_DIRECTION',whole_window_coverage_proven:false,scope:'ONLY_RETURNED_VERIFIED_HTX_SPOT_AND_FUTURES_TRADES',trade_direction_created:false,score_contribution:0,control_effect:false,entry_authorized:false};
  return{...receipt,fingerprint:digest(receipt)};
 }
 if(row.metric_family==='ACTUAL_TAKER_TRADES_BOUNDED_IMBALANCE'&&row.provider_id==='HTX_SPOT_TRADES'){
  const buy=n(row.buy_quote_turnover_usdt),sell=n(row.sell_quote_turnover_usdt),total=n(row.value),count=n(row.valid_recent_rows),ratio=n(row.directional_strength);
  if(row.upstream_id!=='HTX_PUBLIC_SPOT_TRADES'||row.market!=='SPOT'||row.unit!=='USDT'||row.whole_window_coverage_proven!==false||row.entry_eligible!==false||!(buy>=0&&sell>=0&&total>0)||!Number.isSafeInteger(count)||count<1||!close(buy+sell,total)||!close(ratio,(buy-sell)/total))return null;
  const receipt={schema:'BOUNDED_MONEY_FLOW_DIAGNOSTIC_REVIEW_V1',block_id:'N12',consumer:'MONEY_FLOW_DIAGNOSTIC',reason:'FACTUAL_BOUNDED_SPOT_FLOW_REVIEWED',assessment_mode:'UNSCORED_MARKET_OBSERVATION',contract,run_id,snapshot_id,decision_ts,evidence_id:row.evidence_id,raw_hash:row.raw_hash,physical_root_key:key,source_ts:row.source_ts,first_known_ts:row.first_known_ts,observed_trade_count:count,observed_buy_quote_usdt:buy,observed_sell_quote_usdt:sell,observed_total_quote_usdt:total,observed_sample_imbalance:ratio,sample_flow:buy>sell?'BUY_DOMINANT':buy<sell?'SELL_DOMINANT':'BALANCED',whole_window_coverage_proven:false,scope:'ONLY_RETURNED_VERIFIED_HTX_SPOT_TRADES',trade_direction_created:false,score_contribution:0,control_effect:false,entry_authorized:false};
  return{...receipt,fingerprint:digest(receipt)};
 }
 return null;
}
export function reviewBoundedMoneyFlow({evidence=[],contract,run_id,snapshot_id,decision_ts}={}){
 const receipts=[],seen=new Set();
 if(typeof contract!=='string'||typeof run_id!=='string'||!run_id||snapshot_id!==`S392:${contract}:${decision_ts}`)return {status:'EXACT_SNAPSHOT_REQUIRED',receipts:[],score_contribution:0};
 for(const row of evidence){
  if(row?.block_id!=='N12'||row.htx_contract!==contract||!validateEvidenceV2(row,{decision_ts}).usable)continue;
  const key=evidenceDedupKey(row);
  if(seen.has(key))continue;
  const joint=sameRunMarketReview(row,key,{contract,run_id,snapshot_id,decision_ts});
  if(joint){seen.add(key);receipts.push(joint);continue;}
  if(row.provider_id!=='HTX_LARGE_TRADES'||row.metric_family!=='ACTUAL_TAKER_TRADES_BOUNDED_IMBALANCE')continue;
  const buy=n(row.buy_quote_turnover_usdt),sell=n(row.sell_quote_turnover_usdt),total=n(row.value),count=n(row.valid_recent_rows),ratio=n(row.directional_strength);
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
