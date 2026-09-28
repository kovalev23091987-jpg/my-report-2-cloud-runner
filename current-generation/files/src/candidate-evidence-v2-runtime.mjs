import {collectHtxPublicRiskEvidence} from './htx-public-risk-evidence.mjs';
import {collectMacroCalendarEvidence} from './macro-calendar-evidence.mjs';
import {collectDeribitAltOptionsEvidence} from './deribit-alt-options-evidence.mjs';
import {collectChainSupplyEvidence} from './chain-supply-evidence.mjs';

export const CANDIDATE_EVIDENCE_V2_RUNTIME_VERSION='candidate-evidence-v2-runtime-v2-20260928';

const rotation=value=>{let hash=2166136261;for(const ch of String(value??'')){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619);}return(hash>>>0)%2;};

export async function collectCandidateEvidenceV2(params={}){
 const htx=await collectHtxPublicRiskEvidence(params);
 const macro=await collectMacroCalendarEvidence(params);
 const used=Number(htx?.network_calls||0)+Number(macro?.network_calls||0),remaining=Math.max(0,5-used),chainEligible=Boolean(params?.asset_identity),chainMethods=String(params?.asset_identity?.chain||'').toLowerCase()==='solana'?1:3,chainTurn=chainEligible&&chainMethods<=remaining&&rotation(`${params?.run_id}:${params?.contract}:${Math.floor(Number(params?.now||Date.now())/(20*60_000))}`)===0;
 const deferred={status:'DEFERRED_SHARED_REQUEST_ENVELOPE',evidence:[],network_calls:0,receipts:[],internal_only:true};
 let deribit=deferred,chain=chainEligible?deferred:{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true};
 if(chainTurn)chain=await collectChainSupplyEvidence(params);
 else if(remaining>=2)deribit=await collectDeribitAltOptionsEvidence(params);
 const evidence=[...(Array.isArray(htx?.evidence)?htx.evidence:[]),...(Array.isArray(macro?.evidence)?macro.evidence:[]),...(Array.isArray(deribit?.evidence)?deribit.evidence:[]),...(Array.isArray(chain?.evidence)?chain.evidence:[])];
 const statuses=[htx?.status,macro?.status,deribit?.status,chain?.status],closed=statuses.some(value=>value==='CLOSED');
 return{
  version:CANDIDATE_EVIDENCE_V2_RUNTIME_VERSION,
  status:closed?'CLOSED':statuses.find(Boolean)||'NOT_CLOSED',
  evidence,
  network_calls:Number(htx?.network_calls||0)+Number(macro?.network_calls||0)+Number(deribit?.network_calls||0)+Number(chain?.network_calls||0),
  cache_status:[htx?.cache_status,macro?.cache_status,deribit?.cache_status,chain?.cache_status].filter(Boolean).join('+')||null,
  whole_job_admission:{status:[htx?.whole_job_admission?.status,macro?.whole_job_admission?.status,deribit?.whole_job_admission?.status,chain?.whole_job_admission?.status].filter(Boolean).join('+')||null},
  admission:{status:[htx?.admission?.status,macro?.admission?.status,deribit?.admission?.status,chain?.admission?.status].filter(Boolean).join('+')||null},
  receipts:[
   ...(htx?.receipts||[]).map(row=>({...row,source:'HTX_PUBLIC_RISK'})),
   ...(macro?.receipts||[]).map(row=>({...row,source:'MACRO_CALENDAR'})),
   ...(deribit?.receipts||[]).map(row=>({...row,source:'DERIBIT_ALT_OPTIONS'})),
   ...(chain?.receipts||[]).map(row=>({...row,source:'CHAIN_RPC'})),
  ],
  sources:{HTX_PUBLIC_RISK:htx,MACRO_CALENDAR:macro,DERIBIT_ALT_OPTIONS:deribit,CHAIN_RPC:chain},
  internal_only:true,
 };
}

export default{collectCandidateEvidenceV2};
