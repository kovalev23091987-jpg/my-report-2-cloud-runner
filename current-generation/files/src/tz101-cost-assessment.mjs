import {digest} from './upstream-proof-utils.mjs';
import {verifyExecutionFacts} from './tz101-execution-facts.mjs';
import {verifyApprovedCodePolicyReceipt,CONSERVATIVE_FUNDING_FLOOR_PCT} from './user-approved-publication-policy.mjs';

export const TZ101_COST_ASSESSMENT_VERSION='tz101-cost-assessment-r8-conservative-funding-20260927';
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const stamp=v=>Number.isSafeInteger(v)&&v>=1_000_000_000_000;
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=320;
const near=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a),Math.abs(b));
function immutable(value,schema,now){
 if(verifyApprovedCodePolicyReceipt(value,{schema,observed_ts:now}))return true;
 if(!obj(value)||value.schema_version!==schema||!obj(value.persistence)||value.persistence.status!=='CLOSED'||value.persistence.immutable!==true||value.persistence.verification_method!=='D1_IMMUTABLE_RECEIPT'||!text(value.persistence.receipt_id)||!stamp(value.persistence.committed_ts)||value.persistence.committed_ts>now)return false;
 const material=structuredClone(value);delete material.persistence;return value.persistence.content_digest===digest(material);
}
function decompose(plan,direction){
 if(!obj(plan)||plan.status!=='CLOSED'||!obj(plan.entry)||!obj(plan.exit)||!finite(plan.measured_base_quantity)||plan.measured_base_quantity<=0)return null;
 const q=plan.measured_base_quantity,e=plan.entry,x=plan.exit;if(![e.reference_price,e.vwap,e.filled_notional_usdt,x.reference_price,x.vwap,x.filled_notional_usdt].every(finite))return null;
 const entryTop=e.reference_price*q,exitTop=x.reference_price*q;let spread,slip;
 if(direction==='LONG'){spread=Math.max(0,entryTop-exitTop);slip=Math.max(0,e.filled_notional_usdt-entryTop)+Math.max(0,exitTop-x.filled_notional_usdt);}else{spread=Math.max(0,exitTop-entryTop);slip=Math.max(0,entryTop-e.filled_notional_usdt)+Math.max(0,x.filled_notional_usdt-exitTop);}
 const combined=spread+slip;if(!finite(plan.round_trip_quote_loss_ex_fees_funding)||!near(combined,Math.max(0,plan.round_trip_quote_loss_ex_fees_funding)))return null;
 return {spread_cost_usdt:spread,slippage_cost_usdt:slip,round_trip_ex_fees_funding_usdt:combined,entry_notional_usdt:e.filled_notional_usdt,exit_notional_usdt:x.filled_notional_usdt};
}
function feeCost(schedule,{decision,observedTs,entryNotional,exitNotional}){
 if(!immutable(schedule,'tz101-htx-fee-schedule-v1',observedTs)||schedule.status!=='CLOSED'||schedule.venue!=='HTX'||schedule.contract_code!==decision.contract_code||schedule.fee_role!=='TAKER'||!finite(schedule.entry_rate)||!finite(schedule.exit_rate)||schedule.entry_rate<0||schedule.exit_rate<0||schedule.entry_rate>0.05||schedule.exit_rate>0.05||!stamp(schedule.source_ts)||schedule.source_ts>observedTs||!stamp(schedule.valid_until_ts)||schedule.valid_until_ts<observedTs)return null;
 return {fees_usdt:entryNotional*schedule.entry_rate+exitNotional*schedule.exit_rate,receipt_id:schedule.persistence.receipt_id,conservative:schedule.source_kind==='OWNER_APPROVED_CONSERVATIVE_ANALYTICAL_CAP'};
}
function fundingCost({holdingPlan,fundingContext,decision,observedTs,entryNotional}){
 const approvedCode=holdingPlan?.persistence?.verification_method==='USER_APPROVED_IMMUTABLE_CODE_POLICY';
 const legacyD1=holdingPlan?.persistence?.verification_method==='D1_IMMUTABLE_RECEIPT';
 if((!approvedCode&&!legacyD1)||!immutable(holdingPlan,'tz101-holding-plan-v1',observedTs)||holdingPlan.status!=='CLOSED'||holdingPlan.contract_code!==decision.contract_code||holdingPlan.decision_id!==decision.decision_id||holdingPlan.direction!==decision.direction||(approvedCode&&(holdingPlan.prospective_only!==true||holdingPlan.automatic_trade!==false||holdingPlan.planned_exit_no_later_than_ts<=observedTs))||!stamp(holdingPlan.entry_ts)||!stamp(holdingPlan.planned_exit_no_later_than_ts)||holdingPlan.entry_ts>=holdingPlan.planned_exit_no_later_than_ts||!finite(entryNotional)||entryNotional<=0)return null;
 if(!obj(fundingContext)||!finite(fundingContext.rate_pct)||!finite(fundingContext.interval_hours)||fundingContext.interval_hours<=0||!stamp(fundingContext.observed_ts)||fundingContext.observed_ts>observedTs||observedTs-fundingContext.observed_ts>15*60_000)return null;
 const next=stamp(fundingContext.next_funding_time_ts)?fundingContext.next_funding_time_ts:null;
 if(next!==null&&holdingPlan.planned_exit_no_later_than_ts<next)return {funding_cost_usdt:0,funding_credit_usdt:0,reason:'HOLDING_HORIZON_ENDS_BEFORE_NEXT_SETTLEMENT',receipt_id:holdingPlan.persistence.receipt_id,settlements_reserved:0,conservative_reserve:false};
 if(!approvedCode)return null;
 const intervalMs=fundingContext.interval_hours*60*60_000;
 const first=next!==null?Math.max(next,holdingPlan.entry_ts):holdingPlan.entry_ts+intervalMs;
 const settlements=Math.max(1,Math.ceil(Math.max(0,holdingPlan.planned_exit_no_later_than_ts-first)/intervalMs)+1);
 const floorPct=finite(holdingPlan.conservative_funding_floor_pct)?holdingPlan.conservative_funding_floor_pct:CONSERVATIVE_FUNDING_FLOOR_PCT;
 const reservePct=Math.max(Math.abs(fundingContext.rate_pct),floorPct);
 return {funding_cost_usdt:entryNotional*(reservePct/100)*settlements,funding_credit_usdt:0,reason:'CONSERVATIVE_FUNDING_RESERVE',receipt_id:holdingPlan.persistence.receipt_id,settlements_reserved:settlements,reserve_rate_pct_per_settlement:reservePct,conservative_reserve:true};
}

export function buildTz101CostAssessment({decision_summary:decision,execution_gate:executionGate,scenario_plan:scenarioPlan,funding_context:fundingContext,fee_schedule:feeSchedule=null,holding_plan:holdingPlan=null,observed_ts:observedTs=Date.now()}={}){
 const base={version:TZ101_COST_ASSESSMENT_VERSION,status:'NOT_CLOSED',fees_usdt:null,spread_cost_usdt:null,slippage_cost_usdt:null,funding_cost_usdt:null,funding_credit_usdt:null,double_count_free:null,risk_reward_after_costs_status:'NOT_CLOSED',total_cost_usdt:null,gross_reward_usdt:null,gross_risk_usdt:null,reward_after_costs_usdt:null,risk_after_costs_usdt:null,risk_reward_ratio:null,automatic_trade:false,unknown_as_zero:false,reasons:[]};
 if(!obj(decision)||!stamp(observedTs)||!['LONG','SHORT'].includes(decision.direction))return {...base,reasons:['DECISION_IDENTITY_NOT_CLOSED']};
 const execution=verifyExecutionFacts(executionGate?.factual_basis,{contract_code:decision.contract_code,observed_ts:observedTs});
 const plan=execution?.plans?.[decision.direction],parts=decompose(plan,decision.direction);if(!parts)return {...base,reasons:['EXECUTION_COST_BASIS_NOT_CLOSED']};
 const out={...base,...parts,double_count_free:true};
 const fees=feeCost(feeSchedule,{decision,observedTs,entryNotional:parts.entry_notional_usdt,exitNotional:parts.exit_notional_usdt});
 if(fees){out.fees_usdt=fees.fees_usdt;out.fee_schedule_receipt_id=fees.receipt_id;out.fee_basis=fees.conservative?'CONSERVATIVE_ANALYTICAL_CAP':'FACTUAL_SCHEDULE';}else out.reasons.push('FACTUAL_FEE_SCHEDULE_NOT_CLOSED');
 const funding=fundingCost({holdingPlan,fundingContext,decision,observedTs,entryNotional:parts.entry_notional_usdt});
 if(funding){out.funding_cost_usdt=funding.funding_cost_usdt;out.funding_credit_usdt=funding.funding_credit_usdt;out.holding_plan_receipt_id=funding.receipt_id;out.funding_basis=funding.reason;out.funding_settlements_reserved=funding.settlements_reserved;out.funding_reserve_rate_pct=funding.reserve_rate_pct_per_settlement??0;}else out.reasons.push('FUNDING_HOLDING_COST_NOT_PROVEN');
 const sp=scenarioPlan,entry=finite(plan.entry?.vwap)?plan.entry.vwap:null,target=sp?.target_price,invalidation=sp?.invalidation_price,q=plan.measured_base_quantity;
 if(out.fees_usdt!==null&&out.funding_cost_usdt!==null&&finite(entry)&&finite(target)&&finite(invalidation)&&finite(q)&&q>0){
  const grossReward=decision.direction==='LONG'?(target-entry)*q:(entry-target)*q,grossRisk=decision.direction==='LONG'?(entry-invalidation)*q:(invalidation-entry)*q;
  const total=out.fees_usdt+out.spread_cost_usdt+out.slippage_cost_usdt+out.funding_cost_usdt;
  if(grossReward>0&&grossRisk>0&&total>=0){out.gross_reward_usdt=grossReward;out.gross_risk_usdt=grossRisk;out.total_cost_usdt=total;out.reward_after_costs_usdt=Math.max(0,grossReward-total);out.risk_after_costs_usdt=grossRisk+total;out.risk_reward_ratio=out.risk_after_costs_usdt>0?out.reward_after_costs_usdt/out.risk_after_costs_usdt:null;out.risk_reward_after_costs_status=finite(out.risk_reward_ratio)&&out.risk_reward_ratio>0?'CLOSED':'NOT_CLOSED';}
 }
 if(out.fees_usdt!==null&&out.funding_cost_usdt!==null&&out.risk_reward_after_costs_status==='CLOSED')out.status='CLOSED';
 return out;
}
