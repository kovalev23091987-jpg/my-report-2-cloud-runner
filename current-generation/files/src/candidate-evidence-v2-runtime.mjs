import {collectHtxPublicRiskEvidence} from './htx-public-risk-evidence.mjs';
import {collectMacroCalendarEvidence} from './macro-calendar-evidence.mjs';
import {collectDeribitAltOptionsEvidence} from './deribit-alt-options-evidence.mjs';
import {collectChainSupplyEvidence} from './chain-supply-evidence.mjs';
import {collectSourcifyAbiEvidence} from './sourcify-abi-evidence.mjs';
import {collectBlueskyAttentionEvidence} from './bluesky-attention-evidence.mjs';
import {collectSnapshotGovernanceEvidence} from './snapshot-governance-evidence.mjs';
import {collectOfficialEventsEvidence} from './official-events-evidence.mjs';
import {collectGdeltOfficialDiscovery} from './gdelt-official-discovery.mjs';
import {collectBlockscoutIndexEvidence} from './blockscout-index-evidence.mjs';

export const CANDIDATE_EVIDENCE_V2_RUNTIME_VERSION='candidate-evidence-v2-runtime-v7-20260928';

const rotation=(value,mod)=>{let hash=2166136261;for(const ch of String(value??'')){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619);}return(hash>>>0)%Math.max(1,Number(mod)||1);};

export async function collectCandidateEvidenceV2(params={}){
 const htx=await collectHtxPublicRiskEvidence(params);
 const macro=await collectMacroCalendarEvidence(params);
 const used=Number(htx?.network_calls||0)+Number(macro?.network_calls||0),remaining=Math.max(0,5-used),chainName=String(params?.asset_identity?.chain||'').toLowerCase(),address=String(params?.asset_identity?.contract_or_mint||''),chainEligible=Boolean(chainName&&address),evmEligible=chainEligible&&chainName!=='solana'&&/^0x[0-9a-f]{40}$/i.test(address),socialEligible=chainEligible&&(evmEligible||chainName==='solana'),snapshotEligible=/^[a-z0-9][a-z0-9._-]{1,99}$/i.test(String(params?.asset_metadata?.snapshot_space||'')),officialDomains=Array.isArray(params?.asset_metadata?.official_domains)?params.asset_metadata.official_domains:[],officialFeeds=Array.isArray(params?.asset_metadata?.official_feeds)?params.asset_metadata.official_feeds:[],officialEligible=officialDomains.length>0&&officialFeeds.length>0,gdeltEligible=officialDomains.length>0&&Boolean(String(params?.asset_metadata?.official_name||'').trim()),blockscoutEligible=evmEligible&&Boolean(String(params?.blockscout_api_key||'').trim()),chainMethods=chainName==='solana'?1:3,key=`${params?.run_id}:${params?.contract}:${Math.floor(Number(params?.now||Date.now())/(20*60_000))}`;
 const deferred={status:'DEFERRED_SHARED_REQUEST_ENVELOPE',evidence:[],network_calls:0,receipts:[],internal_only:true};
 let deribit=deferred,chain=chainEligible?deferred:{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},sourcify=evmEligible?deferred:{status:'EXACT_EVM_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},bluesky=socialEligible?deferred:{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},snapshot=snapshotEligible?deferred:{status:'EXACT_SNAPSHOT_SPACE_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},official=officialEligible?deferred:{status:'EXACT_OFFICIAL_FEED_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},gdelt=gdeltEligible?deferred:{status:'EXACT_OFFICIAL_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},blockscout=blockscoutEligible?deferred:{status:evmEligible?'WAITING_FREE_KEY':'EXACT_EVM_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true};
 const routes=[...(chainEligible?[{name:'CHAIN',attempts:chainMethods}]:[]),{name:'DERIBIT',attempts:2},...(evmEligible?[{name:'SOURCIFY',attempts:1}]:[]),...(socialEligible?[{name:'BLUESKY',attempts:1}]:[]),...(snapshotEligible?[{name:'SNAPSHOT',attempts:1}]:[]),...(officialEligible?[{name:'OFFICIAL',attempts:1}]:[]),...(gdeltEligible?[{name:'GDELT',attempts:1}]:[]),...(blockscoutEligible?[{name:'BLOCKSCOUT',attempts:1}]:[])],selected=routes.length?routes[rotation(key,routes.length)]:null,route=selected&&selected.attempts<=remaining?selected:routes.find(row=>row.attempts<=remaining)||null;
 if(route?.name==='CHAIN')chain=await collectChainSupplyEvidence(params);
 else if(route?.name==='SOURCIFY')sourcify=await collectSourcifyAbiEvidence(params);
 else if(route?.name==='BLUESKY')bluesky=await collectBlueskyAttentionEvidence(params);
 else if(route?.name==='SNAPSHOT')snapshot=await collectSnapshotGovernanceEvidence(params);
 else if(route?.name==='OFFICIAL')official=await collectOfficialEventsEvidence(params);
 else if(route?.name==='GDELT')gdelt=await collectGdeltOfficialDiscovery(params);
 else if(route?.name==='BLOCKSCOUT')blockscout=await collectBlockscoutIndexEvidence(params);
 else if(route?.name==='DERIBIT')deribit=await collectDeribitAltOptionsEvidence(params);
 if(Number(bluesky?.network_calls||0)===0&&String(bluesky?.status||'').startsWith('ACCESS_BLOCKED_')&&remaining>=2)deribit=await collectDeribitAltOptionsEvidence(params);
 const evidence=[...(Array.isArray(htx?.evidence)?htx.evidence:[]),...(Array.isArray(macro?.evidence)?macro.evidence:[]),...(Array.isArray(deribit?.evidence)?deribit.evidence:[]),...(Array.isArray(chain?.evidence)?chain.evidence:[]),...(Array.isArray(sourcify?.evidence)?sourcify.evidence:[]),...(Array.isArray(bluesky?.evidence)?bluesky.evidence:[]),...(Array.isArray(snapshot?.evidence)?snapshot.evidence:[]),...(Array.isArray(official?.evidence)?official.evidence:[]),...(Array.isArray(blockscout?.evidence)?blockscout.evidence:[])];
 const statuses=[htx?.status,macro?.status,deribit?.status,chain?.status,sourcify?.status,bluesky?.status,snapshot?.status,official?.status,gdelt?.status,blockscout?.status],closed=statuses.some(value=>value==='CLOSED');
 return{
  version:CANDIDATE_EVIDENCE_V2_RUNTIME_VERSION,
  status:closed?'CLOSED':statuses.find(Boolean)||'NOT_CLOSED',
  evidence,
  network_calls:Number(htx?.network_calls||0)+Number(macro?.network_calls||0)+Number(deribit?.network_calls||0)+Number(chain?.network_calls||0)+Number(sourcify?.network_calls||0)+Number(bluesky?.network_calls||0)+Number(snapshot?.network_calls||0)+Number(official?.network_calls||0)+Number(gdelt?.network_calls||0)+Number(blockscout?.network_calls||0),
  cache_status:[htx?.cache_status,macro?.cache_status,deribit?.cache_status,chain?.cache_status,sourcify?.cache_status,bluesky?.cache_status,snapshot?.cache_status,official?.cache_status,gdelt?.cache_status,blockscout?.cache_status].filter(Boolean).join('+')||null,
  whole_job_admission:{status:[htx?.whole_job_admission?.status,macro?.whole_job_admission?.status,deribit?.whole_job_admission?.status,chain?.whole_job_admission?.status,sourcify?.whole_job_admission?.status,bluesky?.whole_job_admission?.status,snapshot?.whole_job_admission?.status,official?.whole_job_admission?.status,gdelt?.whole_job_admission?.status,blockscout?.whole_job_admission?.status].filter(Boolean).join('+')||null},
  admission:{status:[htx?.admission?.status,macro?.admission?.status,deribit?.admission?.status,chain?.admission?.status,sourcify?.admission?.status,bluesky?.admission?.status,snapshot?.admission?.status,official?.admission?.status,gdelt?.admission?.status,blockscout?.admission?.status].filter(Boolean).join('+')||null},
  receipts:[
   ...(htx?.receipts||[]).map(row=>({...row,source:'HTX_PUBLIC_RISK'})),
   ...(macro?.receipts||[]).map(row=>({...row,source:'MACRO_CALENDAR'})),
   ...(deribit?.receipts||[]).map(row=>({...row,source:'DERIBIT_ALT_OPTIONS'})),
   ...(chain?.receipts||[]).map(row=>({...row,source:'CHAIN_RPC'})),
   ...(sourcify?.receipts||[]).map(row=>({...row,source:'SOURCIFY_ABI'})),
   ...(bluesky?.receipts||[]).map(row=>({...row,source:'BLUESKY_PUBLIC'})),
   ...(snapshot?.receipts||[]).map(row=>({...row,source:'SNAPSHOT_GOVERNANCE'})),
   ...(official?.receipts||[]).map(row=>({...row,source:'OFFICIAL_EVENTS'})),
   ...(gdelt?.receipts||[]).map(row=>({...row,source:'GDELT_NEWS_DISCOVERY'})),
   ...(blockscout?.receipts||[]).map(row=>({...row,source:'BLOCKSCOUT_INDEX'})),
  ],
  sources:{HTX_PUBLIC_RISK:htx,MACRO_CALENDAR:macro,DERIBIT_ALT_OPTIONS:deribit,CHAIN_RPC:chain,SOURCIFY_ABI:sourcify,BLUESKY_PUBLIC:bluesky,SNAPSHOT_GOVERNANCE:snapshot,OFFICIAL_EVENTS:official,GDELT_NEWS_DISCOVERY:gdelt,BLOCKSCOUT_INDEX:blockscout},
  internal_only:true,
 };
}

export default{collectCandidateEvidenceV2};
