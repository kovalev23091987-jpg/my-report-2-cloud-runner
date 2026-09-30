import {collectHtxLargeTradesEvidence} from './htx-large-trades-evidence.mjs';
import {collectHtxPublicRiskEvidence} from './htx-public-risk-evidence.mjs';
import {collectMacroCalendarEvidence} from './macro-calendar-evidence.mjs';
import {collectDeribitAltOptionsEvidence} from './deribit-alt-options-evidence.mjs';
import {collectCoinpaprikaSectorEvidence} from './coinpaprika-sector-evidence.mjs';
import {collectFinalizedChainEvents} from './finalized-chain-events.mjs';
import {collectChainSupplyEvidence} from './chain-supply-evidence.mjs';
import {collectSourcifyAbiEvidence} from './sourcify-abi-evidence.mjs';
import {collectBlueskyAttentionEvidence} from './bluesky-attention-evidence.mjs';
import {collectSnapshotGovernanceEvidence} from './snapshot-governance-evidence.mjs';
import {collectOfficialEventsEvidence} from './official-events-evidence.mjs';
import {collectGdeltOfficialDiscovery} from './gdelt-official-discovery.mjs';
import {collectBlockscoutIndexEvidence} from './blockscout-index-evidence.mjs';
import {BLOCKS,validateEvidenceV2} from './evidence-v2.mjs';

export const CANDIDATE_EVIDENCE_V2_RUNTIME_VERSION='candidate-evidence-v2-runtime-v10-route-ownership-20260930';

const rotation=(value,mod)=>{let hash=2166136261;for(const ch of String(value??'')){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619);}return(hash>>>0)%Math.max(1,Number(mod)||1);};
// Only name producers that actually emit a row for this block in this collector.
// Existing technical/market blocks are owned outside this supplementary lane.
export function rotateEvidenceRoleRoutes(routes,key){if(!routes.length)return [];const at=rotation(key,routes.length);return [...routes.slice(at),...routes.slice(0,at)];}
const BLOCK_SOURCE={N02:['CHAIN_RPC'],N03:['CHAIN_RPC'],N04:['CHAIN_RPC','BLOCKSCOUT_INDEX'],N06:['BLUESKY_PUBLIC'],N07:['OFFICIAL_EVENTS'],N08:['HTX_PUBLIC_RISK'],N09:['HTX_PUBLIC_RISK'],N13:['MACRO_CALENDAR','SNAPSHOT_GOVERNANCE'],N14:['DERIBIT_ALT_OPTIONS'],N12:['HTX_LARGE_TRADES'],N15:['COINPAPRIKA_SECTOR'],N17:['SOURCIFY_ABI']};

export async function collectEvidenceRouteBlock({routes=[],collectors={},params={},max_requests=5}={}){
 let reserved=0,actual=0,routeReserved=0;const results={},receipts=[];
 const request_admit=request=>{
  const n=Number(request?.attempts);if(!Number.isSafeInteger(n)||n<1||reserved+n>max_requests)return{allowed:false,status:'DEFERRED_SHARED_REQUEST_ENVELOPE'};
  const result=typeof params.request_admit==='function'?params.request_admit(request):{allowed:false,status:'WHOLE_JOB_HTTP_ADMISSION_REQUIRED'};
  if(result?.duplicate===true)return{...result,allowed:false,status:'ALREADY_RESERVED_NO_REDISPATCH'};
  if(result?.allowed===true){reserved+=n;routeReserved+=n;}return result;
 };
 for(const route of routes){const collect=collectors[route.name];if(typeof collect!=='function')continue;
  // Collectors read valid cached facts before their request admission. Calling
  // every relevant role also reuses caches after the network envelope is full.
  const before=reserved,beforeActual=actual;routeReserved=0;let result;const fetch_impl=async(...args)=>{if(actual-beforeActual>=routeReserved||actual>=reserved||actual>=max_requests)throw Error('EVIDENCE_ROUTE_TRANSPORT_NOT_ADMITTED');actual++;return(params.fetch_impl||globalThis.fetch)(...args);};
  try{result=await collect({...params,request_admit,fetch_impl});}catch(error){result={status:'CODE_OR_STORE_ERROR',evidence:[],error:String(error?.message||error).slice(0,120)};}
  const calls=actual-beforeActual,reported=Number(result?.network_calls);result={...result,network_calls:calls};
  // A denied durable provider reservation occurs before transport. Keep the
  // whole-job reservation conservative; release only this local phase slot.
  if(calls===0&&result?.admission?.allowed===false)reserved=before;
  results[route.name]=result;receipts.push({route:route.name,status:result.status,actual_http:calls,reported_http:Number.isSafeInteger(reported)?reported:null,phase_reserved:reserved,role:route.role??route.name});
 }
 return{results,receipts,network_calls:actual,reserved_requests:reserved,max_requests};
}

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
 // One transport guard also covers the compulsory sources and exceptions.
 const core=await collectEvidenceRouteBlock({routes:[{name:'HTX',role:'HTX_EXECUTION_RULES'},{name:'MACRO',role:'CALENDAR_CONTEXT'}],collectors:{HTX:collectHtxPublicRiskEvidence,MACRO:collectMacroCalendarEvidence},params,max_requests:5});
 const htx=core.results.HTX,macro=core.results.MACRO;
 const used=Number(htx?.network_calls||0)+Number(macro?.network_calls||0),remaining=Math.max(0,5-used),chainName=String(params?.asset_identity?.chain||'').toLowerCase(),address=String(params?.asset_identity?.contract_or_mint||''),chainEligible=Boolean(chainName&&address),evmEligible=chainEligible&&chainName!=='solana'&&/^0x[0-9a-f]{40}$/i.test(address),socialEligible=chainEligible&&(evmEligible||chainName==='solana'),snapshotEligible=/^[a-z0-9][a-z0-9._-]{1,99}$/i.test(String(params?.asset_metadata?.snapshot_space||'')),officialDomains=Array.isArray(params?.asset_metadata?.official_domains)?params.asset_metadata.official_domains:[],officialFeeds=Array.isArray(params?.asset_metadata?.official_feeds)?params.asset_metadata.official_feeds:[],officialEligible=officialDomains.length>0&&officialFeeds.length>0,gdeltEligible=officialDomains.length>0&&Boolean(String(params?.asset_metadata?.official_name||'').trim()),blockscoutEligible=evmEligible&&Boolean(String(params?.blockscout_api_key||'').trim()),key=`${params?.run_id}:${params?.contract}:${Math.floor(Number(params?.now||Date.now())/(20*60_000))}`;
 const deferred={status:'DEFERRED_SHARED_REQUEST_ENVELOPE',evidence:[],network_calls:0,receipts:[],internal_only:true};
 let deribit=deferred,chain=chainEligible?deferred:{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},sourcify=evmEligible?deferred:{status:'EXACT_EVM_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},bluesky=socialEligible?deferred:{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},snapshot=snapshotEligible?deferred:{status:'EXACT_SNAPSHOT_SPACE_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},official=officialEligible?deferred:{status:'EXACT_OFFICIAL_FEED_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},gdelt=gdeltEligible?deferred:{status:'EXACT_OFFICIAL_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},blockscout=blockscoutEligible?deferred:{status:evmEligible?'WAITING_FREE_KEY':'EXACT_EVM_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true};
 const routes=[{name:'LARGE_TRADES',role:'ACTUAL_HTX_TRADE_CONTEXT'},...(officialEligible?[{name:'OFFICIAL',role:'OFFICIAL_EVENT_CONTEXT'}]:[]),...(chainEligible?[{name:'CHAIN',role:'FINALIZED_SUPPLY_CONTEXT'}]:[]),...(blockscoutEligible?[{name:'BLOCKSCOUT',role:'INDEX_DISCOVERY'}]:[]),{name:'DERIBIT',role:'OPTION_CONTEXT'},...(snapshotEligible?[{name:'SNAPSHOT',role:'GOVERNANCE_CONTEXT'}]:[]),...(evmEligible?[{name:'SOURCIFY',role:'ABI_IDENTITY_CONTEXT'}]:[]),...(socialEligible?[{name:'BLUESKY',role:'ATTENTION_CONTEXT'}]:[]),...(gdeltEligible?[{name:'GDELT',role:'OFFICIAL_LINK_DISCOVERY'}]:[])];
 if(params?.asset_metadata?.coinpaprika_id&&params?.asset_metadata?.sector_tag)routes.push({name:'SECTOR',role:'SECTOR_RELATIVE_STRENGTH_CONTEXT'});
 const routeBlock=await collectEvidenceRouteBlock({routes:rotateEvidenceRoleRoutes(routes,key),params,max_requests:Math.max(0,5-core.reserved_requests),collectors:{LARGE_TRADES:collectHtxLargeTradesEvidence,SECTOR:collectCoinpaprikaSectorEvidence,CHAIN:async p=>chainName==='ethereum'&&rotation(key+':CHAIN_ROLE',3)!==0?collectFinalizedChainEvents({...p,event_mode:rotation(key+':CHAIN_ROLE',3)===1?'TOKEN_TRANSFER':'AAVE_CREDIT'}):collectChainSupplyEvidence(p),SOURCIFY:collectSourcifyAbiEvidence,BLUESKY:collectBlueskyAttentionEvidence,SNAPSHOT:collectSnapshotGovernanceEvidence,OFFICIAL:collectOfficialEventsEvidence,GDELT:collectGdeltOfficialDiscovery,BLOCKSCOUT:collectBlockscoutIndexEvidence,DERIBIT:collectDeribitAltOptionsEvidence}});
 ({CHAIN:chain=chain,SOURCIFY:sourcify=sourcify,BLUESKY:bluesky=bluesky,SNAPSHOT:snapshot=snapshot,OFFICIAL:official=official,GDELT:gdelt=gdelt,BLOCKSCOUT:blockscout=blockscout,DERIBIT:deribit=deribit}=routeBlock.results);
 const largeTrades=routeBlock.results.LARGE_TRADES||{status:'DEFERRED_SHARED_REQUEST_ENVELOPE',evidence:[],network_calls:0};
 const sector=routeBlock.results.SECTOR||{status:'EXACT_SECTOR_REGISTRY_REQUIRED',evidence:[],network_calls:0};
 const evidence=[...(largeTrades.evidence||[]),...(sector.evidence||[]),...(Array.isArray(htx?.evidence)?htx.evidence:[]),...(Array.isArray(macro?.evidence)?macro.evidence:[]),...(Array.isArray(deribit?.evidence)?deribit.evidence:[]),...(Array.isArray(chain?.evidence)?chain.evidence:[]),...(Array.isArray(sourcify?.evidence)?sourcify.evidence:[]),...(Array.isArray(bluesky?.evidence)?bluesky.evidence:[]),...(Array.isArray(snapshot?.evidence)?snapshot.evidence:[]),...(Array.isArray(official?.evidence)?official.evidence:[]),...(Array.isArray(blockscout?.evidence)?blockscout.evidence:[])];
 const statuses=[largeTrades?.status,sector?.status,htx?.status,macro?.status,deribit?.status,chain?.status,sourcify?.status,bluesky?.status,snapshot?.status,official?.status,gdelt?.status,blockscout?.status],closed=statuses.some(value=>value==='CLOSED'||value==='CLOSED_BOUNDED_SAMPLE');
 const sources={HTX_LARGE_TRADES:largeTrades,COINPAPRIKA_SECTOR:sector,HTX_PUBLIC_RISK:htx,MACRO_CALENDAR:macro,DERIBIT_ALT_OPTIONS:deribit,CHAIN_RPC:chain,SOURCIFY_ABI:sourcify,BLUESKY_PUBLIC:bluesky,SNAPSHOT_GOVERNANCE:snapshot,OFFICIAL_EVENTS:official,GDELT_NEWS_DISCOVERY:gdelt,BLOCKSCOUT_INDEX:blockscout};
 return{
  version:CANDIDATE_EVIDENCE_V2_RUNTIME_VERSION,
  status:closed?'CLOSED':statuses.find(Boolean)||'NOT_CLOSED',
  evidence,
  network_calls:Number(largeTrades.network_calls||0)+Number(sector.network_calls||0)+Number(htx?.network_calls||0)+Number(macro?.network_calls||0)+Number(deribit?.network_calls||0)+Number(chain?.network_calls||0)+Number(sourcify?.network_calls||0)+Number(bluesky?.network_calls||0)+Number(snapshot?.network_calls||0)+Number(official?.network_calls||0)+Number(gdelt?.network_calls||0)+Number(blockscout?.network_calls||0),
  cache_status:[largeTrades.cache_status,sector.cache_status,htx?.cache_status,macro?.cache_status,deribit?.cache_status,chain?.cache_status,sourcify?.cache_status,bluesky?.cache_status,snapshot?.cache_status,official?.cache_status,gdelt?.cache_status,blockscout?.cache_status].filter(Boolean).join('+')||null,
  whole_job_admission:{status:[htx?.whole_job_admission?.status,macro?.whole_job_admission?.status,deribit?.whole_job_admission?.status,chain?.whole_job_admission?.status,sourcify?.whole_job_admission?.status,bluesky?.whole_job_admission?.status,snapshot?.whole_job_admission?.status,official?.whole_job_admission?.status,gdelt?.whole_job_admission?.status,blockscout?.whole_job_admission?.status].filter(Boolean).join('+')||null},
  admission:{status:[htx?.admission?.status,macro?.admission?.status,deribit?.admission?.status,chain?.admission?.status,sourcify?.admission?.status,bluesky?.admission?.status,snapshot?.admission?.status,official?.admission?.status,gdelt?.admission?.status,blockscout?.admission?.status].filter(Boolean).join('+')||null},
  receipts:[
   ...(largeTrades.receipts||[]).map(row=>({...row,source:'HTX_LARGE_TRADES'})),
   ...(sector.receipts||[]).map(row=>({...row,source:'COINPAPRIKA_SECTOR'})),
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
  sources,route_accounting:[...core.receipts,...routeBlock.receipts],shared_http_envelope:{cap:5,reserved_attempts:core.reserved_requests+routeBlock.reserved_requests,actual_http:core.network_calls+routeBlock.network_calls,unknown_reservations_not_released:true},role_policy:'USE_ALL_VALID_CACHES_AND_COMPLEMENTARY_ROLES_WITHIN_FIVE_REQUESTS',block_coverage:auditCandidateBlocks({evidence,sources,decision_ts:params?.now??Date.now()}),
  internal_only:true,
 };
}

export default{collectCandidateEvidenceV2};
