import {TWO_NODE_HTTP_LIMITS,TWO_CANDIDATE_PLAN} from './two-candidate-policy.mjs';

// Operational request allocation, never a trading weight or a provider quota.
// The old10 slot could fit N05+N15 but deny the whole finalized N04 reservation.
export const SCHEDULED_EVIDENCE_HTTP_CAP=18;
export const SCHEDULED_EVIDENCE_ROLES=Object.freeze({
 shared_N05_N12:5,finalized_N04:4,coingecko_N15:4,coinpaprika_N15:3,uncaptured_HTX_N12:2,
});
export function proveScheduledEvidenceAllocation(){
 const per_candidate=Object.values(SCHEDULED_EVIDENCE_ROLES).reduce((a,b)=>a+b,0);
 const full_background=per_candidate*TWO_CANDIDATE_PLAN.candidates_per_full_cycle;
 return{status:per_candidate===SCHEDULED_EVIDENCE_HTTP_CAP&&full_background<=TWO_NODE_HTTP_LIMITS.background?'CLOSED':'NOT_CLOSED',per_candidate,full_background,other_background_headroom:TWO_NODE_HTTP_LIMITS.background-full_background,whole_job_limit:TWO_NODE_HTTP_LIMITS.whole_job,whole_job_lanes:TWO_NODE_HTTP_LIMITS.hot+TWO_NODE_HTTP_LIMITS.background+TWO_NODE_HTTP_LIMITS.statistics,
  deep_checks_per_day:86,source_daily_request_upper:{shared_N05_N12:5*86,finalized_N04:4*86,coingecko_N15_cold:4*86,coinpaprika_N15_cold:3*86},
  coingecko_cold_every_candidate_fits_existing_quota:false,coingecko_daily_cap_not_raised:true,provider_admission_and_backoff_still_required:true,manual_and_LIQ_reserves_unchanged:true,strategy_effect:false};
}
