import {collectHtxPublicRiskEvidence} from './htx-public-risk-evidence.mjs';
import {collectMacroCalendarEvidence} from './macro-calendar-evidence.mjs';
import {collectDeribitAltOptionsEvidence} from './deribit-alt-options-evidence.mjs';

export const CANDIDATE_EVIDENCE_V2_RUNTIME_VERSION='candidate-evidence-v2-runtime-v1-20260928';

export async function collectCandidateEvidenceV2(params={}){
 const htx=await collectHtxPublicRiskEvidence(params);
 const macro=await collectMacroCalendarEvidence(params);
 const deribit=Number(macro?.network_calls||0)===0?await collectDeribitAltOptionsEvidence(params):{status:'DEFERRED_SHARED_REQUEST_ENVELOPE',evidence:[],network_calls:0,receipts:[],internal_only:true};
 const evidence=[...(Array.isArray(htx?.evidence)?htx.evidence:[]),...(Array.isArray(macro?.evidence)?macro.evidence:[]),...(Array.isArray(deribit?.evidence)?deribit.evidence:[])];
 const statuses=[htx?.status,macro?.status,deribit?.status],closed=statuses.some(value=>value==='CLOSED');
 return{
  version:CANDIDATE_EVIDENCE_V2_RUNTIME_VERSION,
  status:closed?'CLOSED':statuses.find(Boolean)||'NOT_CLOSED',
  evidence,
  network_calls:Number(htx?.network_calls||0)+Number(macro?.network_calls||0)+Number(deribit?.network_calls||0),
  cache_status:[htx?.cache_status,macro?.cache_status,deribit?.cache_status].filter(Boolean).join('+')||null,
  whole_job_admission:{status:[htx?.whole_job_admission?.status,macro?.whole_job_admission?.status,deribit?.whole_job_admission?.status].filter(Boolean).join('+')||null},
  admission:{status:[htx?.admission?.status,macro?.admission?.status,deribit?.admission?.status].filter(Boolean).join('+')||null},
  receipts:[
   ...(htx?.receipts||[]).map(row=>({...row,source:'HTX_PUBLIC_RISK'})),
   ...(macro?.receipts||[]).map(row=>({...row,source:'MACRO_CALENDAR'})),
   ...(deribit?.receipts||[]).map(row=>({...row,source:'DERIBIT_ALT_OPTIONS'})),
  ],
  sources:{HTX_PUBLIC_RISK:htx,MACRO_CALENDAR:macro,DERIBIT_ALT_OPTIONS:deribit},
  internal_only:true,
 };
}

export default{collectCandidateEvidenceV2};
