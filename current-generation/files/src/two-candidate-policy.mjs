export const TWO_CANDIDATE_POLICY_VERSION='two-candidate-budget-v1-20261004';
export const TWO_CANDIDATE_PLAN=Object.freeze({
  scheduled_interval_minutes:40,scheduled_cycles_per_day:36,candidates_per_full_cycle:2,
  manual_full_commands_per_day:3,manual_coin_commands_per_day:5,burst_deep_checks_per_day:3,
  units_per_deep:5,month_days:31,manual_monthly_reserve:1705,
  d1_run_cap:Object.freeze({rows_read:54000,rows_written:840}),
  maximum_analytics_runs_per_day:47,node_hot_http_limit:96,
});
export const TWO_NODE_HTTP_LIMITS=Object.freeze({whole_job:164,hot:96,background:56,statistics:12});
export function isFreshManualMainAnalysis(mode){
  return ['FULL_MANUAL','MANUAL_COIN'].includes(String(mode||'').trim().toUpperCase());
}
export function proveTwoCandidateBudget(plan=TWO_CANDIDATE_PLAN){
  const scheduled=plan.scheduled_cycles_per_day*plan.candidates_per_full_cycle;
  const manual=plan.manual_full_commands_per_day*plan.candidates_per_full_cycle+plan.manual_coin_commands_per_day;
  const scheduledUnits=(scheduled+plan.burst_deep_checks_per_day)*plan.units_per_deep*plan.month_days;
  const manualUnits=manual*plan.units_per_deep*plan.month_days;
  return{scheduled_deep_checks_per_day:scheduled,manual_commands_per_day:plan.manual_full_commands_per_day+plan.manual_coin_commands_per_day,
    manual_deep_checks_per_day:manual,scheduled_monthly_units:scheduledUnits,manual_monthly_units:manualUnits,
    monthly_units:scheduledUnits+manualUnits,manual_reserve_preserved:manualUnits===plan.manual_monthly_reserve,
    maximum_analytics_rows_read:plan.d1_run_cap.rows_read*plan.maximum_analytics_runs_per_day,
    maximum_analytics_rows_written:plan.d1_run_cap.rows_written*plan.maximum_analytics_runs_per_day,
    safe:scheduledUnits+manualUnits<=13500&&scheduledUnits<=12900&&manualUnits===plan.manual_monthly_reserve&&
      plan.d1_run_cap.rows_read*plan.maximum_analytics_runs_per_day<=3500000&&plan.d1_run_cap.rows_written*plan.maximum_analytics_runs_per_day+5472<=70000};
}
export function deepRuntimeOptions({actor,mode}={}){
  // Cloud Worker callers retain their original 50-request guard. Only the
  // preflight-admitted Node runner passes this execution identity to the plan.
  return actor==='GITHUB_ACTIONS'
    ?{execution_runtime:'GITHUB_ACTIONS_NODE',max_per_run:['FULL_MANUAL','SCHEDULE'].includes(mode)?2:1}
    :{execution_runtime:'CLOUDFLARE_WORKER',max_per_run:1};
}
