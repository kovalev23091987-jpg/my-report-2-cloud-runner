import {futureDiscoveryHttp} from './discovery-reserve.mjs';

// This reserves capacity, not signals or strategy thresholds. Costs must come
// from the selected routes before a production admission enables the plan.
export function utcBudgetPeriodEnd(now,period='DAY'){
  if(!Number.isSafeInteger(now)||!['DAY','MONTH'].includes(period))throw Error('INVALID_UTC_BUDGET_PERIOD');
  const d=new Date(now);return period==='DAY'?Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1):Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);
}
export function futureCandidateReserve(now,plan,{period='DAY'}={}){
  if(!plan)return {slots:0,http:0,http_by_provider:{}};
  if(!Number.isSafeInteger(plan.http_per_slot)||plan.http_per_slot<1||!plan.http_by_provider||typeof plan.http_by_provider!=='object'||Array.isArray(plan.http_by_provider)||!Object.keys(plan.http_by_provider).length)throw Error('INVALID_FUTURE_CANDIDATE_RESERVE_PLAN');
  const costs=Object.values(plan.http_by_provider);
  if(costs.some(n=>!Number.isSafeInteger(n)||n<0)||costs.reduce((a,b)=>a+b,0)>plan.http_per_slot)throw Error('INVALID_FUTURE_CANDIDATE_PROVIDER_COSTS');
  const slots=futureDiscoveryHttp(now,{...plan,http_per_tick:1},{until_ts:utcBudgetPeriodEnd(now,period)});
  return {slots,http:slots*plan.http_per_slot,http_by_provider:Object.fromEntries(Object.entries(plan.http_by_provider).map(([provider,cost])=>[provider,slots*cost]))};
}

// Deep checks share these scheduled invocations. Do not add a second SQL
// envelope for a candidate already inside the same future invocation.
export function futureScheduledSQL(now,plan,envelope){
  if(!plan)return {runs:0,rows_read:0,rows_written:0};
  if(!Number.isSafeInteger(envelope?.rows_read)||envelope.rows_read<1||!Number.isSafeInteger(envelope?.rows_written)||envelope.rows_written<1)throw Error('INVALID_FUTURE_SQL_ENVELOPE');
  const runs=futureDiscoveryHttp(now,plan,{until_ts:utcBudgetPeriodEnd(now,'DAY')})/plan.http_per_tick;
  return {runs,rows_read:runs*envelope.rows_read,rows_written:runs*envelope.rows_written};
}
