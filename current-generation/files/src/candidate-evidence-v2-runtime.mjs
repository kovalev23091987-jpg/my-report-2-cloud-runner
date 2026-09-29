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
import {BLOCKS,validateEvidenceV2} from './evidence-v2.mjs';

export const CANDIDATE_EVIDENCE_V2_RUNTIME_VERSION='candidate-evidence-v2-runtime-v9-bounded-coverage-20260930';

const rotation=(value,mod)=>{let hash=2166136261;for(const ch of String(value??'')){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619);}return(hash>>>0)%Math.max(1,Number(mod)||1);};
// Only name producers that actually emit a row for this block in this collector.
// Existing technical/market blocks are owned outside this supplementary lane.
const BLOCK_SOURCE={N02:['CHAIN_RPC'],N03:['CHAIN_RPC'],N04:['BLOCKSCOUT_INDEX'],N06:['BLUESKY_PUBLIC'],N07:['OFFICIAL_EVENTS'],N08:['HTX_PUBLIC_RISK'],N09:['HTX_PUBLIC_RISK'],N13:['MACRO_CALENDAR','SNAPSHOT_GOVERNANCE'],N14:['DERIBIT_ALT_OPTIONS'],N17:['SOURCIFY_ABI']};

export function auditCandidateBlocks({evidence=[],sources={},decision_ts=Date.now()}={}){
 const result={};
 for(const block of Object.keys(BLOCKS)){
  const rows=(Array.isArray(evidence)?evidence:[]).filter(row=>row?.block_id===block);
  const usable=rows.filter(row=>validateEvidenceV2(row,{decision_ts}).usable&&Number(row.coverage_fraction)>0).length;
  const owners=BLOCK_SOURCE[block]||[];
  result[block]={status:usable?'ADMISSIBLE_FACTUAL_CONTEXT':rows.length?'FACTS_PRESENT_NOT_DECISION_ADMISSIBLE':owners.length?'NO_FACTUAL_EVIDENCE':'NOT_IMPLEMENTED_IN_THIS_COLLECTOR',
   observed_facts:rows.length,usable_facts:usable,
   source_statuses:Object.fromEntries(owners.map(name=>[name,String(sources?.[name]?.status||'NOT_EVALUATED')]))};
 }
 return {status:'CLOSED_ACCOUNTING_ONLY',blocks:result,coverage_count:Object.keys(result).length,usable_block_count:Object.values(result).filter(row=>row.usable_facts>0).length,all_blocks_have_useful_data:Object.values(result).every(row=>row.usable_facts>0),internal_only:true};
}

export async function collectCandidateEvidenceV2(params={}){
 const sourceParams={...params};let reservedAttempts=0,actualCalls=0;
 sourceParams.request_admit=request=>{
  const attempts=Number(request?.attempts);
  if(!Number.isSafeInteger(attempts)||attempts<1||reservedAttempts+attempts>5)return{allowed:false,status:'CANDIDATE_SHARED_HTTP_ENVELOPE_EXHAUSTED'};
  const grant=typeof params.request_admit==='function'?params.request_admit(request):{allowed:false,status:'WHOLE_JOB_HTTP_ADMISSION_REQUIRED'};
  if(grant?.allowed===true&&grant?.duplicate!==true)reservedAttempts+=attempts;
  return grant?.duplicate===true?{...grant,allowed:false,status:'ALREADY_RESERVED_NO_REDISPATCH'}:grant;
 };
 sourceParams.fetch_impl=async(...args)=>{
  if(actualCalls>=reservedAttempts||actualCalls>=5)throw Error('CANDIDATE_SHARED_HTTP_NOT_ADMITTED');
  actualCalls++;
  return (params.fetch_impl||globalThis.fetch)(...args);
 };
 const htx=await collectHtxPublicRiskEvidence(sourceParams);
 const macro=await collectMacroCalendarEvidence(sourceParams);
 const used=Number(htx?.network_calls||0)+Number(macro?.network_calls||0),remaining=Math.max(0,5-used),chainName=String(params?.asset_identity?.chain||'').toLowerCase(),address=String(params?.asset_identity?.contract_or_mint||''),chainEligible=Boolean(chainName&&address),evmEligible=chainEligible&&chainName!=='solana'&&/^0x[0-9a-f]{40}$/i.test(address),socialEligible=chainEligible&&(evmEligible||chainName==='solana'),snapshotEligible=/^[a-z0-9][a-z0-9._-]{1,99}$/i.test(String(params?.asset_metadata?.snapshot_space||'')),officialDomains=Array.isArray(params?.asset_metadata?.official_domains)?params.asset_metadata.official_domains:[],officialFeeds=Array.isArray(params?.asset_metadata?.official_feeds)?params.asset_metadata.official_feeds:[],officialEligible=officialDomains.length>0&&officialFeeds.length>0,gdeltEligible=officialDomains.length>0&&Boolean(String(params?.asset_metadata?.official_name||'').trim()),blockscoutEligible=evmEligible&&Boolean(String(params?.blockscout_api_key||'').trim()),chainMethods=chainName==='solana'?1:3,key=`${params?.run_id}:${params?.contract}:${Math.floor(Number(params?.now||Date.now())/(20*60_000))}`;
 const deferred={status:'DEFERRED_SHARED_REQUEST_ENVELOPE',evidence:[],network_calls:0,receipts:[],internal_only:true};
 let deribit=deferred,chain=chainEligible?deferred:{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},sourcify=evmEligible?deferred:{status:'EXACT_EVM_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},bluesky=socialEligible?deferred:{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},snapshot=snapshotEligible?deferred:{status:'EXACT_SNAPSHOT_SPACE_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},official=officialEligible?deferred:{status:'EXACT_OFFICIAL_FEED_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},gdelt=gdeltEligible?deferred:{status:'EXACT_OFFICIAL_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},blockscout=blockscoutEligible?deferred:{status:evmEligible?'WAITING_FREE_KEY':'EXACT_EVM_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true};
 const routes=[...(chainEligible?[{name:'CHAIN',attempts:chainMethods}]:[]),{name:'DERIBIT',attempts:2},...(evmEligible?[{name:'SOURCIFY',attempts:1}]:[]),...(socialEligible?[{name:'BLUESKY',attempts:1}]:[]),...(snapshotEligible?[{name:'SNAPSHOT',attempts:1}]:[]),...(officialEligible?[{name:'OFFICIAL',attempts:1}]:[]),...(gdeltEligible?[{name:'GDELT',attempts:1}]:[]),...(blockscoutEligible?[{name:'BLOCKSCOUT',attempts:1}]:[])];
 const routePlan=planCandidateEvidenceRoutes(routes,key,remaining),routeReceipts=[];
 const producers={CHAIN:collectChainSupplyEvidence,DERIBIT:collectDeribitAltOptionsEvidence,SOURCIFY:collectSourcifyAbiEvidence,BLUESKY:collectBlueskyAttentionEvidence,SNAPSHOT:collectSnapshotGovernanceEvidence,OFFICIAL:collectOfficialEventsEvidence,GDELT:collectGdeltOfficialDiscovery,BLOCKSCOUT:collectBlockscoutIndexEvidence};
 // A cache hit, exhausted provider or unsupported market must not end the
 // entire supplementary lane. The next eligible block retains its own role.
 // All producers still use both their durable provider cap and this envelope.
 for(const route of routePlan){
  let value;const before=actualCalls;
  try{value=await producers[route.name](sourceParams);}catch(error){value={status:'SOURCE_ERROR',evidence:[],network_calls:0,receipts:[],error:String(error?.message||error).slice(0,160),internal_only:true};}
  value={...value,network_calls:actualCalls-before};
  if(route.name==='CHAIN')chain=value;else if(route.name==='DERIBIT')deribit=value;else if(route.name==='SOURCIFY')sourcify=value;else if(route.name==='BLUESKY')bluesky=value;else if(route.name==='SNAPSHOT')snapshot=value;else if(route.name==='OFFICIAL')official=value;else if(route.name==='GDELT')gdelt=value;else if(route.name==='BLOCKSCOUT')blockscout=value;
  routeReceipts.push({source:route.name,status:value?.status||'NOT_CLOSED',network_calls:Number(value?.network_calls||0),cache_status:value?.cache_status||null,reserved_attempts_total:reservedAttempts,role_replacement:false});
 }
 const evidence=[...(Array.isArray(htx?.evidence)?htx.evidence:[]),...(Array.isArray(macro?.evidence)?macro.evidence:[]),...(Array.isArray(deribit?.evidence)?deribit.evidence:[]),...(Array.isArray(chain?.evidence)?chain.evidence:[]),...(Array.isArray(sourcify?.evidence)?sourcify.evidence:[]),...(Array.isArray(bluesky?.evidence)?bluesky.evidence:[]),...(Array.isArray(snapshot?.evidence)?snapshot.evidence:[]),...(Array.isArray(official?.evidence)?official.evidence:[]),...(Array.isArray(blockscout?.evidence)?blockscout.evidence:[])];
 const statuses=[htx?.status,macro?.status,deribit?.status,chain?.status,sourcify?.status,bluesky?.status,snapshot?.status,official?.status,gdelt?.status,blockscout?.status],closed=statuses.some(value=>value==='CLOSED');
 const sources={HTX_PUBLIC_RISK:htx,MACRO_CALENDAR:macro,DERIBIT_ALT_OPTIONS:deribit,CHAIN_RPC:chain,SOURCIFY_ABI:sourcify,BLUESKY_PUBLIC:bluesky,SNAPSHOT_GOVERNANCE:snapshot,OFFICIAL_EVENTS:official,GDELT_NEWS_DISCOVERY:gdelt,BLOCKSCOUT_INDEX:blockscout};
 return{
  version:CANDIDATE_EVIDENCE_V2_RUNTIME_VERSION,
  status:closed?'CLOSED':statuses.find(Boolean)||'NOT_CLOSED',
  evidence,
  network_calls:actualCalls,
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
  sources,block_coverage:auditCandidateBlocks({evidence,sources,decision_ts:params?.now??Date.now()}),
  route_plan:routePlan.map(row=>row.name),route_receipts:routeReceipts,shared_http_envelope:{cap:5,reserved_attempts:reservedAttempts,unused_attempts:5-reservedAttempts,conservative_no_refund:true},
  internal_only:true,
 };
}

export function planCandidateEvidenceRoutes(routes=[],key='',remaining=5){
 const ordered=Array.isArray(routes)?routes:[],start=rotation(key,ordered.length),rotated=[...ordered.slice(start),...ordered.slice(0,start)];
 // At most four producers per candidate bounds D1 work. Expensive routes
 // without capacity are deferred, while cached/cheap alternatives progress.
 return rotated.filter(row=>Number(row.attempts)<=remaining).slice(0,4);
}

export default{collectCandidateEvidenceV2,planCandidateEvidenceRoutes};
