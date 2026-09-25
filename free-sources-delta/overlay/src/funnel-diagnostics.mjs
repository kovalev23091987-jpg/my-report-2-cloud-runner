export const FUNNEL_DIAGNOSTICS_VERSION='entry-funnel-diagnostics-v1-20260925';
const CODES=Object.freeze({
  FACTUAL_FEE_SCHEDULE_NOT_CLOSED:'FEE_RECEIPT_MISSING',FUNDING_HOLDING_COST_NOT_PROVEN:'FUTURE_FUNDING_OR_HOLDING_UNKNOWN',EXECUTION_COST_BASIS_NOT_CLOSED:'EXECUTION_COST_BASIS_MISSING',
  SOURCE_TOOL_UNAVAILABLE_THIS_RUN:'SOURCE_TOOL_UNAVAILABLE',SOURCE_EXHAUSTED:'SOURCE_EXHAUSTED',BUDGET_EXHAUSTED:'BUDGET_EXHAUSTED',UNRESOLVED_CROSS_VENUE_CONFLICT:'CROSS_VENUE_DIVERGENCE',
  SUPPORTING_RISK_NOT_CLOSED:'SUPPORTING_RISK_GAP',SMART_MONEY_NOT_CLOSED:'SMART_MONEY_GAP',ENTRY_AREA_NOT_CLOSED:'ENTRY_AREA_GAP',TRIGGER_NOT_CLOSED:'TRIGGER_GAP',
});
const arr=v=>Array.isArray(v)?v:[];
export function extractEntryBlockers({publication_shadow,canonical,source_summary}={}){
  const raw=[...arr(publication_shadow?.cost_assessment?.reasons),...arr(publication_shadow?.publication_gate?.reasons),publication_shadow?.publication_gate?.reason,...arr(canonical?.hard_gates).flatMap(g=>[g?.reason,...arr(g?.reasons)]),...arr(source_summary?.blockers)].filter(Boolean).map(String);
  const codes=[];for(const r of raw){const hit=Object.keys(CODES).find(k=>r.includes(k));codes.push(hit?CODES[hit]:r.slice(0,120));}
  const unique=[...new Set(codes)];return {version:FUNNEL_DIAGNOSTICS_VERSION,status:'CLOSED',blockers:unique,fee_blocked:unique.includes('FEE_RECEIPT_MISSING'),funding_holding_blocked:unique.includes('FUTURE_FUNDING_OR_HOLDING_UNKNOWN'),source_blocked:unique.some(x=>x.includes('SOURCE')||x.includes('BUDGET')),cross_venue_divergence:unique.includes('CROSS_VENUE_DIVERGENCE')};
}
export function aggregateFunnel(rows=[]){
  const counts={found:0,early:0,deep_check:0,entry:0,wait:0,observe:0,rejected:0};const blocker_counts={};
  for(const r of Array.isArray(rows)?rows:[]){counts.found++;if(r?.early===true)counts.early++;if(r?.deep_check===true)counts.deep_check++;const s=String(r?.state||'').toUpperCase();if(s.startsWith('ENTRY'))counts.entry++;else if(s.includes('WAIT'))counts.wait++;else if(s==='OBSERVE')counts.observe++;else if(s==='REJECTED')counts.rejected++;for(const b of arr(r?.blockers))blocker_counts[b]=(blocker_counts[b]||0)+1;}
  return {version:FUNNEL_DIAGNOSTICS_VERSION,status:'CLOSED',counts,blocker_counts};
}
