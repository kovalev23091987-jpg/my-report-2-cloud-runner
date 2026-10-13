import {TWO_CANDIDATE_PLAN} from './two-candidate-policy.mjs';
import {BYK_PLAN} from './unified-budget.mjs';

// Owner-authorized 2026-10-13. This is a daily guard for public N05/N12
// routes, not a provider allowance or a new per-report HTTP envelope.
// Count every reserved attempt, including errors; do not reset old counters.
export const N05_N12_PUBLIC_SOURCE_DAILY_CAP=512;
// Ten transports cover both finalists within one minute. Only documented
// public IP pools are raised; uncertain or endpoint-dependent pools retain
// their earlier guard. KuCoin counts weighted units, not HTTP calls.
export const PUBLIC_VENUE_MINUTE_CAPS=Object.freeze({GATE:12,BITGET:12,POLONIEX:12,BACKPACK:6,BINANCE:6,KRAKEN:6,BITFINEX:6,OKX:100,KUCOIN:32});
export const publicVenueMinuteCap=venue=>PUBLIC_VENUE_MINUTE_CAPS[venue]??0;
export async function publicVenueHasMinuteHeadroom(db,provider,units,now){
 const cap=publicVenueMinuteCap(provider);
 if(!db?.prepare||!Number.isSafeInteger(now)||!Number.isSafeInteger(units)||units<1||units>cap)return false;
 try{
  const row=await db.prepare('SELECT COALESCE(SUM(units),0) AS units FROM report2_provider_minute_ledger_v1 WHERE provider=?1 AND created_ts>?2 AND created_ts<=?3').bind(provider,now-60000,now).first();
  const used=Number(row?.units);return Number.isSafeInteger(used)&&used>=0&&used+units<=cap;
 }catch{return false;}
}
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
