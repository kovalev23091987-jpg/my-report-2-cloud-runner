import {DISCOVERY_PLAN} from './discovery-reserve.mjs';

// Prepared engineering policy. Publishing this module is not an actual IO or
// deployment admission; the referenced approval must be positive first.
export const PRODUCTION_PLAN=Object.freeze({
  version:'pump-production-launch-20261026-v1',
  evidence_ref:'checkpoints/pump-report-20261025/ROOT_BUSINESS_SCHEDULE_ADMISSION.json',
  capture_id:'pump-first-production-manual-20261026-one',
  capture_ids:['pump-first-production-manual-20261026-one','pump-first-production-manual-20261026-two','pump-first-production-manual-20261026-three'],
  manual_checks:3,manual_capture_http_max:13,telegram_daily_cap:27,telegram_monthly_cap:837,
  planned_load_fraction:0.8,
  candidate_pacing:Object.freeze({version:'pump-even-day-deep-v2',period_ms:3600000,start_hour:10,end_hour:20,time_zone:'Europe/Moscow'}),
  // Prepared only. Activation requires an exact separate owner policy decision
  // and current native/provider/deployment admissions. No cap is raised here.
  candidate_surplus:Object.freeze({version:'pump-unassigned-candidate-hold-v1',enabled:true,activation_decision_ref:'checkpoints/pump-report-20261025/OWNER_CONDITIONAL_SURPLUS_APPROVED.json',
    max_grants_per_day:24,max_grants_per_run:1,max_retained_records:200,
    native_remaining_floor:Object.freeze({requests:600,rows_read:600,rows_written:140})}),
  future_candidates:Object.freeze({cadence_ms:3600000,start_hour:10,end_hour:20,time_zone:'Europe/Moscow',
    http_per_slot:12,http_by_provider:{BINGX:10,TELEGRAM:1},
    unassigned_optional_map_http_per_slot:1,
    cost_evidence_ref:'pump-report/handoffs/sources/F560_SELECTED_COST_FUTURE_CAPACITY_V1.json',
    final_selected_composition_ref:'pump-report/handoffs/sources/F562_SOURCE_SELECTION_MATRIX_V1.json'}),
  candidate_http_upper_bound:12,candidate_http_by_provider:{BINGX:10,TELEGRAM:1},
  new_cron:'*/5 7-16 * * *',time_zone:'Europe/Moscow',window:'10:00–20:00',
  qualification_limits_rearmed:false,actual_admission_required:true
});

export function productionPolicies(base){
  if(!base?.BINGX||!base?.TELEGRAM||base.BINGX.project_daily_cap!==900||base.BINGX.project_monthly_cap!==27900)throw Error('RETAINED_PRODUCTION_SOURCE_CAPS_REQUIRED');
  const copy=(p,extra)=>{const q={...p,...extra,qualification_limits_retained:{attempt_cap:p.qualification_attempt_cap,daily_cap:p.project_daily_cap,monthly_cap:p.project_monthly_cap},qualification_counter_policy:'OLD_COUNTER_RETAINED_NOT_REUSED_FOR_GENUINE_PRODUCTION'};delete q.qualification_attempt_cap;return q;};
  return {
    BINGX:copy(base.BINGX,{evidence_ref:PRODUCTION_PLAN.evidence_ref,
      allowed_paths:[...new Set([...base.BINGX.allowed_paths,'/openApi/swap/v2/quote/trades'])],
      external_quota_status:'BOUNDED_PRODUCTION_POLICY_ACTUAL_REPLY_VALIDATION_REQUIRED'}),
    TELEGRAM:copy(base.TELEGRAM,{evidence_ref:PRODUCTION_PLAN.evidence_ref,project_daily_cap:PRODUCTION_PLAN.telegram_daily_cap,
      project_monthly_cap:PRODUCTION_PLAN.telegram_monthly_cap,manual_acceptance_only:false,delivery_source:false,outcome_source:false})
  };
}

export function productionAdmission(nativeAdmission,provider_policy_version,{mode,maximum_http_attempts}={}){
  if(!['AUTO','MANUAL','LOOKUP','STATISTICS'].includes(mode)||!nativeAdmission?.evidence_ref||!Number.isSafeInteger(nativeAdmission.expires_ts)||!provider_policy_version)throw Error('BOUNDED_PRODUCTION_NATIVE_ADMISSION_REQUIRED');
  if(maximum_http_attempts!==undefined&&(mode!=='MANUAL'||!Number.isSafeInteger(maximum_http_attempts)||maximum_http_attempts<1||maximum_http_attempts>164))throw Error('INVALID_PRODUCTION_OPERATION_HTTP_BOUND');
  return {provider_policy_version,expires_ts:nativeAdmission.expires_ts,run_purpose:'PRODUCTION',
    production_evidence_ref:PRODUCTION_PLAN.evidence_ref,strict_automatic_window:mode==='AUTO',
    allowed_providers:mode==='LOOKUP'?[]:['BINGX','TELEGRAM'],discovery:DISCOVERY_PLAN,
    future_candidates:PRODUCTION_PLAN.future_candidates,planned_load_fraction:PRODUCTION_PLAN.planned_load_fraction,
    candidate_pacing:PRODUCTION_PLAN.candidate_pacing,
    candidate_surplus:PRODUCTION_PLAN.candidate_surplus,
    ...(maximum_http_attempts===undefined?{}:{max_http_attempts:maximum_http_attempts})};
}
