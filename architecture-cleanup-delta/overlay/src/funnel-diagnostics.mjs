import { blockerDetails } from './reason-registry.mjs';
export const FUNNEL_DIAGNOSTICS_VERSION='entry-funnel-diagnostics-v2-reason-registry-20260925';
const arr=v=>Array.isArray(v)?v:[];
export function extractEntryBlockers({publication_shadow,canonical,source_summary}={}){
  const raw=[...arr(publication_shadow?.cost_assessment?.reasons),...arr(publication_shadow?.publication_gate?.reasons),publication_shadow?.publication_gate?.reason,...arr(canonical?.hard_gates).flatMap(g=>[g?.reason,...arr(g?.reasons)]),...arr(source_summary?.blockers)].filter(Boolean).map(String);
  const details=blockerDetails(raw);const codes=details.map(x=>x.code);
  return {version:FUNNEL_DIAGNOSTICS_VERSION,status:'CLOSED',blockers:codes,blocker_details:details,has_unknown_reason:details.some(x=>!x.known),fee_blocked:codes.includes('FEE_RECEIPT_MISSING'),funding_holding_blocked:codes.includes('FUTURE_FUNDING_OR_HOLDING_UNKNOWN'),source_blocked:codes.some(x=>x.includes('SOURCE')||x.includes('BUDGET')),cross_venue_divergence:codes.includes('CROSS_VENUE_DIVERGENCE')};
}
export function aggregateFunnel(rows=[]){
  const counts={found:0,early:0,deep_check:0,entry:0,wait:0,observe:0,rejected:0};const blocker_counts={};
  for(const r of Array.isArray(rows)?rows:[]){counts.found++;if(r?.early===true)counts.early++;if(r?.deep_check===true)counts.deep_check++;const s=String(r?.state||'').toUpperCase();if(s.startsWith('ENTRY'))counts.entry++;else if(s.includes('WAIT'))counts.wait++;else if(s==='OBSERVE')counts.observe++;else if(s==='REJECTED')counts.rejected++;for(const b of arr(r?.blockers))blocker_counts[b]=(blocker_counts[b]||0)+1;}
  return {version:FUNNEL_DIAGNOSTICS_VERSION,status:'CLOSED',counts,blocker_counts};
}
