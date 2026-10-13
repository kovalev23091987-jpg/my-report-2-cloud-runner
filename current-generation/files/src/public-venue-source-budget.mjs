import {TWO_CANDIDATE_PLAN} from './two-candidate-policy.mjs';
import {BYK_PLAN} from './unified-budget.mjs';

// Owner-authorized 2026-10-13. This is a daily guard for public N05/N12
// routes, not a provider allowance or a new per-report HTTP envelope.
// Count every reserved attempt, including errors; do not reset old counters.
export const N05_N12_PUBLIC_SOURCE_DAILY_CAP=512;
export const N05_N12_PUBLIC_BUDGET=Object.freeze({
 scheduled_invocations:TWO_CANDIDATE_PLAN.scheduled_cycles_per_day,
 manual_full_invocations:Math.max(TWO_CANDIDATE_PLAN.manual_full_commands_per_day,BYK_PLAN.categories.manual_full.daily),
 manual_coin_invocations:TWO_CANDIDATE_PLAN.manual_coin_commands_per_day,
 burst_invocations:TWO_CANDIDATE_PLAN.burst_deep_checks_per_day,
 finalists_per_invocation:2,shared_requests_per_finalist:5,
});
export function publicVenueDailyDemand(){
 const p=N05_N12_PUBLIC_BUDGET;
 return(p.scheduled_invocations+p.manual_full_invocations+p.manual_coin_invocations+p.burst_invocations)*p.finalists_per_invocation*p.shared_requests_per_finalist;
}
