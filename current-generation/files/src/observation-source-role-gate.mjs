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
