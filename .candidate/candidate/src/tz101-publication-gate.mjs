/**
 * TZ 10.1 publication gate.
 * Keeps analytical Final Decision separate from a user-facing "entry confirmed"
 * event. This module never invents score normalization, scenario levels, costs,
 * portfolio state, or liquidation data.
 */
export const TZ101_PUBLICATION_GATE_VERSION='tz101-publication-gate-r9';
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const txt=v=>typeof v==='string'&&v.trim()?v.trim():null;
const ts=v=>Number.isSafeInteger(v)&&v>=1_000_000_000_000;

function reason(code,kind='MISSING'){return {code,kind};}

export function buildTz101PublicationGate({
  final_decision,
  score_interval,
  scenario_plan,
  cost_assessment,
  funding_context,
  liquidation_context=null,
  observed_ts=Date.now(),
}={}) {
  const missing=[],blocked=[];
  const fd=final_decision;
  if(!obj(fd) || fd.entry_action!=='SHADOW_ENTRY_ELIGIBLE' || fd.entry_quality!=='CLOSED') missing.push(reason('FINAL_ENTRY_NOT_CLOSED'));
  if(obj(fd) && (fd.hard_veto===true || fd.hard_veto_state!=='CLEAR')) blocked.push(reason('FINAL_HARD_VETO_NOT_CLEAR','BLOCKED'));
  if(obj(fd) && (fd.risk_state!=='CLEAR' || fd.timing_state!=='ENTRY_WINDOW' || fd.execution_quality!=='CLOSED' || fd.data_quality!=='CLOSED' || fd.independence_state!=='CLOSED')) missing.push(reason('FINAL_REQUIRED_GATES_NOT_CLOSED'));

  const score=score_interval;
  if(!obj(score) || !finite(score.score_lower_bound) || !finite(score.score_upper_bound)) missing.push(reason('FOUR_BLOCK_SCORE_NOT_AVAILABLE'));
  else {
    if(score.is_probability!==false) blocked.push(reason('SCORE_MISLABELED_AS_PROBABILITY','BLOCKED'));
    if(Array.isArray(score.wholly_missing_blocks) && score.wholly_missing_blocks.length) missing.push(reason('WHOLE_WEIGHTED_BLOCK_MISSING'));
    if(score.score_lower_bound<70) missing.push(reason('SCORE_LOWER_BOUND_BELOW_TELEGRAM_THRESHOLD'));
  }

  const sp=scenario_plan;
  if(!obj(sp) || sp.status!=='CLOSED') missing.push(reason('SCENARIO_PLAN_NOT_CLOSED'));
  const area=txt(sp?.entry_area),target=txt(sp?.target),invalidation=txt(sp?.invalidation);
  if(!area) missing.push(reason('ENTRY_AREA_MISSING'));
  if(!target) missing.push(reason('REALISTIC_TARGET_MISSING'));
  if(!invalidation) missing.push(reason('INVALIDATION_MISSING'));
  if(sp?.required_evidence_status!=='CLOSED') missing.push(reason('SCENARIO_REQUIRED_EVIDENCE_NOT_CLOSED'));
  if(sp?.current_price_in_entry_area!==true) missing.push(reason('CURRENT_PRICE_OUTSIDE_CONFIRMED_ENTRY_AREA'));
  if(!ts(sp?.valid_until_ts) || sp.valid_until_ts<observed_ts) missing.push(reason('SCENARIO_PLAN_STALE'));

  const costs=cost_assessment;
  if(!obj(costs) || costs.status!=='CLOSED') missing.push(reason('ALL_COSTS_NOT_CLOSED'));
  for(const key of ['fees_usdt','spread_cost_usdt','slippage_cost_usdt','funding_cost_usdt']) if(!finite(costs?.[key]) || costs[key]<0) missing.push(reason(`COST_COMPONENT_MISSING:${key}`));
  if(costs?.double_count_free===false) blocked.push(reason('COST_DOUBLE_COUNT_PROTECTION_NOT_PROVEN','BLOCKED'));
  else if(costs?.double_count_free!==true) missing.push(reason('COST_DOUBLE_COUNT_PROTECTION_UNKNOWN'));
  if(costs?.risk_reward_after_costs_status!=='CLOSED') missing.push(reason('RISK_REWARD_AFTER_COSTS_NOT_CLOSED'));

  const funding=funding_context;
  if(!obj(funding) || !finite(funding.rate_pct) || !finite(funding.interval_hours) || funding.interval_hours<=0 || !ts(funding.observed_ts)) missing.push(reason('FUNDING_CONTEXT_NOT_COMPLETE'));
  else if(funding.observed_ts>observed_ts || observed_ts-funding.observed_ts>15*60_000) missing.push(reason('FUNDING_CONTEXT_NOT_FRESH'));

  let liquidation={status:'NOT_CONFIRMED',short_above:null,long_below:null,note:'Уровни крупных ликвидаций не подтверждены'};
  if(obj(liquidation_context)) {
    const st=String(liquidation_context.status||'');
    if(['CONFIRMED','PARTIAL','NOT_CONFIRMED'].includes(st)) liquidation={...liquidation,...liquidation_context,status:st};
  }

  const status=blocked.length?'BLOCKED':missing.length?'NOT_CLOSED':'CLOSED';
  const userPosition={user_portfolio_state:'UNKNOWN',user_position_confirmed:false,user_position_quantity_contracts:null,user_management_authorized:false,alert_implies_user_trade:false};
  return {
    version:TZ101_PUBLICATION_GATE_VERSION,status,observed_ts,
    blockers:blocked,missing,
    user_position_semantics:userPosition,
    telegram_context:status==='CLOSED'?{
      score_lower_bound:score.score_lower_bound,score_upper_bound:score.score_upper_bound,weighted_blocks:score.weighted_blocks,
      entry:{area,target,invalidation},valid_until_ts:sp.valid_until_ts,funding,
      risk:txt(sp.risk_summary)||'изменение цены, ликвидности или условий исполнения',
      reasons:Array.isArray(sp.reasons)?sp.reasons.filter(x=>txt(x)).slice(0,3):[],liquidations:liquidation,
    }:null,
    safety:{automatic_trade:false,score_is_probability:false,missing_as_zero:false,unknown_portfolio_as_flat:false,score_oos_validation_required_for_publication:false,probability_validation_unchanged:true},
  };
}
