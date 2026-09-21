/**
 * TZ 10.1 cost assessment.
 *
 * Spread/slippage are decomposed from the same factual HTX execution snapshot.
 * Fees require an immutable factual fee schedule. Funding cost is never
 * prorated from a current rate: it is zero only when a proven holding horizon
 * ends before the next settlement, otherwise a future funding schedule is
 * required and the assessment stays UNKNOWN.
 */
import { digest, stableJson } from './upstream-proof-utils.mjs';
import { verifyExecutionFacts } from './tz101-execution-facts.mjs';
import { buildHtxFeeScheduleReceipt } from './tz101-fee-source.mjs';

export const TZ101_COST_ASSESSMENT_VERSION='tz101-cost-assessment-r7';
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const stamp=v=>Number.isSafeInteger(v)&&v>=1_000_000_000_000;
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=320;
const near=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a),Math.abs(b));
function immutable(value,schema,now){
  if(!obj(value)||value.schema_version!==schema||!obj(value.persistence)||value.persistence.status!=='CLOSED'||value.persistence.immutable!==true||
    value.persistence.verification_method!=='D1_IMMUTABLE_RECEIPT'||!text(value.persistence.receipt_id)||!stamp(value.persistence.committed_ts)||value.persistence.committed_ts>now)return false;
  const material=structuredClone(value);delete material.persistence;return value.persistence.content_digest===digest(material);
}
function decompose(plan,direction){
  if(!obj(plan)||plan.status!=='CLOSED'||!obj(plan.entry)||!obj(plan.exit)||!finite(plan.measured_base_quantity)||plan.measured_base_quantity<=0)return null;
  const q=plan.measured_base_quantity, e=plan.entry, x=plan.exit;
  if(![e.reference_price,e.vwap,e.filled_notional_usdt,x.reference_price,x.vwap,x.filled_notional_usdt].every(finite))return null;
  const entryTop=e.reference_price*q,exitTop=x.reference_price*q;
  let spread,slip;
  if(direction==='LONG'){
    spread=Math.max(0,entryTop-exitTop);
    slip=Math.max(0,e.filled_notional_usdt-entryTop)+Math.max(0,exitTop-x.filled_notional_usdt);
  }else{
    spread=Math.max(0,exitTop-entryTop);
    slip=Math.max(0,entryTop-e.filled_notional_usdt)+Math.max(0,x.filled_notional_usdt-exitTop);
  }
  const combined=spread+slip;
  if(!finite(plan.round_trip_quote_loss_ex_fees_funding)||!near(combined,Math.max(0,plan.round_trip_quote_loss_ex_fees_funding)))return null;
  return {spread_cost_usdt:spread,slippage_cost_usdt:slip,round_trip_ex_fees_funding_usdt:combined,entry_notional_usdt:e.filled_notional_usdt,exit_notional_usdt:x.filled_notional_usdt};
}
function feeCost(schedule,{decision,observedTs,entryNotional,exitNotional}){
  if(!immutable(schedule,'tz101-htx-fee-schedule-v1',observedTs)||schedule.status!=='CLOSED'||schedule.venue!=='HTX'||schedule.contract_code!==decision.contract_code||
    schedule.fee_role!=='TAKER'||!finite(schedule.entry_rate)||!finite(schedule.exit_rate)||schedule.entry_rate<0||schedule.exit_rate<0||
    !stamp(schedule.source_ts)||schedule.source_ts>observedTs||!stamp(schedule.valid_until_ts)||schedule.valid_until_ts<observedTs)return null;
  const rebuilt=buildHtxFeeScheduleReceipt({contract_code:decision.contract_code,source_record:schedule,observed_ts:observedTs});
  if(rebuilt.status!=='CLOSED'||stableJson(rebuilt.fee_schedule)!==stableJson(schedule))return null;
  return {fees_usdt:entryNotional*schedule.entry_rate+exitNotional*schedule.exit_rate,receipt_id:schedule.persistence.receipt_id};
}
function fundingCost({holdingPlan,fundingContext,decision,observedTs}){
  if(!immutable(holdingPlan,'tz101-holding-plan-v1',observedTs)||holdingPlan.status!=='CLOSED'||holdingPlan.contract_code!==decision.contract_code||holdingPlan.decision_id!==decision.decision_id||
    holdingPlan.direction!==decision.direction||holdingPlan.prospective_only!==true||holdingPlan.automatic_trade!==false||
    !['PRECOMMITTED_CAMPAIGN_POLICY','OWNER_DECLARED_SHADOW_PLAN'].includes(String(holdingPlan.source_kind||''))||!text(holdingPlan.source_receipt_id)||
    !stamp(holdingPlan.source_ts)||holdingPlan.source_ts>decision.observation_ts||!stamp(holdingPlan.entry_ts)||holdingPlan.entry_ts!==decision.observation_ts||
    !stamp(holdingPlan.planned_exit_no_later_than_ts)||holdingPlan.entry_ts>=holdingPlan.planned_exit_no_later_than_ts||holdingPlan.planned_exit_no_later_than_ts<=observedTs)return null;
  if(!obj(fundingContext)||!finite(fundingContext.rate_pct)||!finite(fundingContext.interval_hours)||fundingContext.interval_hours<=0||!stamp(fundingContext.observed_ts)||
    fundingContext.observed_ts>observedTs||observedTs-fundingContext.observed_ts>15*60_000||!stamp(fundingContext.next_funding_time_ts))return null;
  // Exact zero is provable only if the declared holding horizon ends before the
  // next settlement. Crossing a settlement needs the rate applicable then; the
  // current rate is not extrapolated into the future.
  if(holdingPlan.planned_exit_no_later_than_ts < fundingContext.next_funding_time_ts){
    return {funding_cost_usdt:0,funding_credit_usdt:0,reason:'HOLDING_HORIZON_ENDS_BEFORE_NEXT_SETTLEMENT',receipt_id:holdingPlan.persistence.receipt_id};
  }
  return null;
}

export function buildTz101CostAssessment({
  decision_summary:decision,
  execution_gate:executionGate,
  scenario_plan:scenarioPlan,
  funding_context:fundingContext,
  fee_schedule:feeSchedule=null,
  holding_plan:holdingPlan=null,
  observed_ts:observedTs=Date.now(),
}={}){
  const base={version:TZ101_COST_ASSESSMENT_VERSION,status:'NOT_CLOSED',fees_usdt:null,spread_cost_usdt:null,slippage_cost_usdt:null,funding_cost_usdt:null,funding_credit_usdt:null,
    double_count_free:null,risk_reward_after_costs_status:'NOT_CLOSED',total_cost_usdt:null,gross_reward_usdt:null,gross_risk_usdt:null,reward_after_costs_usdt:null,risk_after_costs_usdt:null,risk_reward_ratio:null,
    automatic_trade:false,unknown_as_zero:false,reasons:[]};
  if(!obj(decision)||!stamp(observedTs)||!['LONG','SHORT'].includes(decision.direction))return {...base,reasons:['DECISION_IDENTITY_NOT_CLOSED']};
  const execution=verifyExecutionFacts(executionGate?.factual_basis,{contract_code:decision.contract_code,observed_ts:observedTs});
  const plan=execution?.plans?.[decision.direction],parts=decompose(plan,decision.direction);
  if(!parts)return {...base,reasons:['EXECUTION_COST_BASIS_NOT_CLOSED']};
  const out={...base,...parts,double_count_free:true};
  const fees=feeCost(feeSchedule,{decision,observedTs,entryNotional:parts.entry_notional_usdt,exitNotional:parts.exit_notional_usdt});
  if(fees){out.fees_usdt=fees.fees_usdt;out.fee_schedule_receipt_id=fees.receipt_id;} else out.reasons.push('FACTUAL_FEE_SCHEDULE_NOT_CLOSED');
  const funding=fundingCost({holdingPlan,fundingContext,decision,observedTs});
  if(funding){out.funding_cost_usdt=funding.funding_cost_usdt;out.funding_credit_usdt=funding.funding_credit_usdt;out.holding_plan_receipt_id=funding.receipt_id;} else out.reasons.push('FUNDING_HOLDING_COST_NOT_PROVEN');
  const sp=scenarioPlan;
  const entry=finite(plan.entry?.vwap)?plan.entry.vwap:null,target=sp?.target_price,invalidation=sp?.invalidation_price,q=plan.measured_base_quantity;
  if(out.fees_usdt!==null&&out.funding_cost_usdt!==null&&finite(entry)&&finite(target)&&finite(invalidation)&&finite(q)&&q>0){
    const grossReward=decision.direction==='LONG'?(target-entry)*q:(entry-target)*q;
    const grossRisk=decision.direction==='LONG'?(entry-invalidation)*q:(invalidation-entry)*q;
    const total=out.fees_usdt+out.spread_cost_usdt+out.slippage_cost_usdt+out.funding_cost_usdt;
    if(grossReward>0&&grossRisk>0&&total>=0){
      out.gross_reward_usdt=grossReward;out.gross_risk_usdt=grossRisk;out.total_cost_usdt=total;
      out.reward_after_costs_usdt=Math.max(0,grossReward-total);out.risk_after_costs_usdt=grossRisk+total;
      out.risk_reward_ratio=out.risk_after_costs_usdt>0?out.reward_after_costs_usdt/out.risk_after_costs_usdt:null;
      out.risk_reward_after_costs_status=finite(out.risk_reward_ratio)&&out.risk_reward_ratio>0?'CLOSED':'NOT_CLOSED';
    }
  }
  if(out.fees_usdt!==null&&out.funding_cost_usdt!==null&&out.risk_reward_after_costs_status==='CLOSED')out.status='CLOSED';
  return out;
}
