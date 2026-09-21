/**
 * TZ 10.1 publication orchestration.
 *
 * Connects a committed Final Decision to the four-block score interval,
 * publication gate and exact Telegram sidecar. Current incomplete/calibration
 * states are expected to stop before D1 sidecar persistence.
 */
import { buildTz101ScoreInterval } from './tz101-score-interval.mjs';
import { buildTz101PublicationGate } from './tz101-publication-gate.mjs';
import { persistTz101ExactTelegramContext } from './tz101-telegram-context-runtime.mjs';
import { buildTz101ScenarioPlan } from './tz101-scenario-plan.mjs';
import { buildTz101CostAssessment } from './tz101-cost-assessment.mjs';
import { loadTz101PublicationInputs } from './tz101-publication-input-runtime.mjs';

export const TZ101_PUBLICATION_RUNTIME_VERSION='tz101-publication-runtime-r8-input-readback';

function safeFundingContext(trajectory, availableTs) {
  const current=trajectory?.funding?.current;
  const rawRate=Number(current?.funding_rate_pct);
  const interval=Number(trajectory?.funding?.derived_settlement_interval_hours);
  const observed=Number(availableTs);
  if(!Number.isFinite(rawRate)||!Number.isFinite(interval)||interval<=0||!Number.isSafeInteger(observed)||observed<1_000_000_000_000) return null;
  const fundingTime=Number(current?.funding_time_ts);
  const nextFunding=Number(current?.next_funding_time_ts);
  return {rate_pct:rawRate,interval_hours:interval,observed_ts:observed,
    funding_time_ts:Number.isSafeInteger(fundingTime)&&fundingTime>=1_000_000_000_000?fundingTime:null,
    next_funding_time_ts:Number.isSafeInteger(nextFunding)&&nextFunding>=1_000_000_000_000?nextFunding:null};
}

export async function runTz101PublicationShadow({
  env,
  final_decision_persistence,
  decision_evidence=[],
  trajectory=null,
  trajectory_available_ts=null,
  campaign_proof=null,
  execution_gate=null,
  entry_area_rule=null,
  fee_schedule=null,
  holding_plan=null,
  scenario_plan=null,
  cost_assessment=null,
  liquidation_context=null,
  smart_money_raw=null,
  observed_ts=Date.now(),
}={}) {
  const safety={shadow_only:true,automatic_trade:false,live_probability:null,validated_signal:false,telegram_direct_send:false};
  const persistence=final_decision_persistence;
  if(!persistence || persistence.status!=='CLOSED' || persistence.decision_inserted!==true || !persistence.decision_summary) {
    return {version:TZ101_PUBLICATION_RUNTIME_VERSION,status:'SKIPPED_FINAL_DECISION_NOT_COMMITTED',statements:0,score_interval:null,publication_gate:null,telegram_context_persistence:null,safety};
  }
  const decision=persistence.decision_summary;
  const score=buildTz101ScoreInterval({direction:decision.direction,decision_evidence,smart_money_raw});
  let inputResolution={status:'NOT_NEEDED',reason:null,statements:0,rows_read:0,rows_written:0};
  let resolvedEntryAreaRule=entry_area_rule,resolvedFeeSchedule=fee_schedule,resolvedHoldingPlan=holding_plan;
  const scoreCanReachPublication=Number.isFinite(score?.score_lower_bound)&&score.score_lower_bound>=70&&
    (!Array.isArray(score?.wholly_missing_blocks)||score.wholly_missing_blocks.length===0);
  const needsStoredInputs=(scenario_plan==null&&resolvedEntryAreaRule==null)||
    (cost_assessment==null&&(resolvedFeeSchedule==null||resolvedHoldingPlan==null));
  // Do not spend even one D1 read for candidates already below the immutable
  // publication threshold. A potentially eligible candidate may load one exact
  // immutable bundle; absence/collision/staleness remains fail-closed.
  if(scoreCanReachPublication&&needsStoredInputs){
    inputResolution=await loadTz101PublicationInputs({env,decision_summary:decision,observed_ts});
    if(['CLOSED','DEDUPLICATED'].includes(inputResolution.status)){
      resolvedEntryAreaRule??=inputResolution.entry_area_rule;
      resolvedFeeSchedule??=inputResolution.fee_schedule;
      resolvedHoldingPlan??=inputResolution.holding_plan;
    }
  }
  const funding=safeFundingContext(trajectory,trajectory_available_ts);
  const scenario=scenario_plan ?? buildTz101ScenarioPlan({
    decision_summary:decision,campaign_proof,execution_gate,decision_evidence,entry_area_rule:resolvedEntryAreaRule,observed_ts,
  });
  const costs=cost_assessment ?? buildTz101CostAssessment({
    decision_summary:decision,execution_gate,scenario_plan:scenario,funding_context:funding,
    fee_schedule:resolvedFeeSchedule,holding_plan:resolvedHoldingPlan,observed_ts,
  });
  const gate=buildTz101PublicationGate({
    final_decision:decision,
    score_interval:score,
    scenario_plan:scenario,
    cost_assessment:costs,
    funding_context:funding,
    liquidation_context,
    observed_ts,
  });
  if(gate.status!=='CLOSED') {
    return {version:TZ101_PUBLICATION_RUNTIME_VERSION,status:'NOT_CLOSED',statements:inputResolution.statements||0,input_rows_read:inputResolution.rows_read||0,input_rows_written:inputResolution.rows_written||0,
      publication_inputs:{status:inputResolution.status,reason:inputResolution.reason??null},score_interval:score,scenario_plan:scenario,cost_assessment:costs,publication_gate:gate,telegram_context_persistence:null,safety};
  }
  const sidecar=await persistTz101ExactTelegramContext({env,decision_summary:decision,publication_gate:gate,persisted_ts:Date.now()});
  return {version:TZ101_PUBLICATION_RUNTIME_VERSION,status:sidecar.status==='CLOSED'||sidecar.status==='DEDUPLICATED'?'CLOSED':'FAIL_CLOSED',
    statements:(inputResolution.statements||0)+(sidecar.statements||0),input_rows_read:inputResolution.rows_read||0,input_rows_written:inputResolution.rows_written||0,
    publication_inputs:{status:inputResolution.status,reason:inputResolution.reason??null},score_interval:score,scenario_plan:scenario,cost_assessment:costs,publication_gate:gate,telegram_context_persistence:sidecar,safety};
}
