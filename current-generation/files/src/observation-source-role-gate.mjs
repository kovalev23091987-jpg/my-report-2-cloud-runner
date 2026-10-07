import {buildRoleEvidenceView} from './source-role-consumer.mjs';
// Shared existing OBSERVE policy; capability labels never authorize an origin.
export function earlySourceRolesClosed(c){
 const stored=c?.metadata?.source_role_view;if(stored?.status!=='CLOSED')return false;
 const contract=String(c?.metadata?.contract||c?.candidates?.[0]?.contract||c?.candidates?.[0]?.ticker||c?.universe?.[0]?.contract||'').trim();
 const v=buildRoleEvidenceView(stored.classified,{contract,observed_ts:c.observed_ts});
 const xs=v.classified.filter(x=>x.role_evidence_usable===true);
 const htx=xs.some(x=>x.source_key==='HTX_OFFICIAL'&&x.assigned_roles.includes('EXECUTION_TRUTH'));
 const origins=new Set(xs.map(x=>x.independence_group).filter(Boolean));
 return htx&&origins.size>=2;
}
// Internal run artifact only. Recheck the original receipt facts at the original
// decision clock, so diagnosing a refusal never needs another provider/D1 read.
// This does not authorize publication or mutate the canonical result.
export function auditObservationSourceRoles(c){
 const stored=c?.metadata?.source_role_view,contract=String(c?.metadata?.contract||c?.candidates?.[0]?.contract||c?.candidates?.[0]?.ticker||c?.universe?.[0]?.contract||'').trim();
 const view=buildRoleEvidenceView(stored?.classified,{contract,observed_ts:c?.observed_ts}),usable=view.classified.filter(r=>r.role_evidence_usable===true),origins=[...new Set(usable.map(r=>r.independence_group).filter(Boolean))].sort();
 const htx=usable.some(r=>r.source_key==='HTX_OFFICIAL'&&r.assigned_roles.includes('EXECUTION_TRUTH')),reasons=[];
 if(stored?.status!=='CLOSED')reasons.push('STORED_SOURCE_ROLE_VIEW_NOT_CLOSED');if(!htx)reasons.push('VERIFIED_HTX_EXECUTION_ROLE_MISSING');if(origins.length<2)reasons.push('FEWER_THAN_TWO_VERIFIED_DISTINCT_ORIGINS');
 const exclusions={};for(const r of view.classified)if(r.role_exclusion_reason)exclusions[r.role_exclusion_reason]=(exclusions[r.role_exclusion_reason]||0)+1;
 const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
 return{schema:'ORIGINAL_OBSERVATION_SOURCE_ROLE_AUDIT_V1',contract,run_id:c?.run_id??null,snapshot_id:c?.snapshot_id??null,observed_ts:c?.observed_ts??null,status:reasons.length?'NOT_CLOSED':'CLOSED',observation_source_gate_closed:reasons.length===0,reasons,verified_HTX_execution:htx,distinct_verified_origins:origins,classified_receipt_count:view.classified.length,usable_role_receipt_count:usable.length,exclusion_reason_counts:exclusions,receipts:view.classified.slice(0,64).map(r=>({source_key:r.source_key,metric:/^[A-Z0-9_]{1,100}$/.test(String(r.metric||'').toUpperCase())?String(r.metric).toUpperCase():null,assigned_roles:r.assigned_roles,usable:r.role_evidence_usable===true,exclusion_reason:r.role_exclusion_reason,independence_group:r.independence_group,event_ts:number(r.event_ts),received_ts:number(r.received_ts),max_age_sec:number(r.max_age_sec),normalized_value:r.role_evidence_usable?number(r.normalized_value):null})),omitted_receipt_details:Math.max(0,view.classified.length-64),revalidated_at_original_observation:true,not_a_current_source_refresh:true,decisions_changed:false,sourceHTTP:0,D1:0,internal_only:true};
}
