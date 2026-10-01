import {collectHtxLargeTradesEvidence} from './htx-large-trades-evidence.mjs';
import {collectHtxPublicRiskEvidence} from './htx-public-risk-evidence.mjs';
import {collectMacroCalendarEvidence} from './macro-calendar-evidence.mjs';
import {collectDeribitAltOptionsEvidence} from './deribit-alt-options-evidence.mjs';
import {collectCoingeckoSectorEvidence} from './coingecko-sector-evidence.mjs';
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
import {recordEvidenceSourceHealth} from './evidence-source-store.mjs';

export const CANDIDATE_EVIDENCE_V2_RUNTIME_VERSION='candidate-evidence-v2-runtime-v17-strict-check-accounting-20261001';

const rotation=(value,mod)=>{let hash=2166136261;for(const ch of String(value??'')){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619);}return(hash>>>0)%Math.max(1,Number(mod)||1);};
// Only name producers that actually emit a row for this block in this collector.
// Existing technical/market blocks are owned outside this supplementary lane.
// Scheduling tickets express the current operational assignment, not measured
// trading accuracy or a share of provider quota. Eligibility, caches and every
// existing durable quota remain inside their original collectors.
export const EVIDENCE_ROUTE_PRIORITY=Object.freeze({
 LARGE_TRADES:5,OFFICIAL:5,CHAIN_SUPPLY:5,CHAIN_EVENTS:5,
 DERIBIT:5,BLUESKY:5,SECTOR:4,SECTOR_COINGECKO:4,
 BLOCKSCOUT:1,SNAPSHOT:1,SOURCIFY:1,GDELT:1,
});
export function rotateEvidenceRoleRoutes(routes,key){
 if(!routes.length)return [];
 const eligible=routes.map((route,index)=>({route,index,tickets:EVIDENCE_ROUTE_PRIORITY[route.name]??1}));
 const tickets=eligible.flatMap(row=>Array(row.tickets).fill(row.index));
 const first=tickets[rotation(key,tickets.length)];
 // Each eligible route remains present exactly once: a cached fact costs no
// additional HTTP, and a quota/backoff skip must not suppress the next route.
 return [eligible[first],...eligible.filter(row=>row.index!==first).sort((a,b)=>b.tickets-a.tickets||a.index-b.index)].map(row=>row.route);
}
// A block is complete only when its assigned primary owner was actually
// evaluated.  Supplemental and discovery routes remain visible, but they may
// not close a block on behalf of a missing primary route.
export const BLOCK_SOURCE_REQUIREMENTS=Object.freeze({
 N01:{all:['OFFICIAL_EVENTS'],supplemental:[]},
 N02:{all:['CHAIN_SUPPLY'],supplemental:['BLOCKSCOUT_INDEX','SOURCIFY_ABI']},
 N03:{all:['CHAIN_EVENTS'],supplemental:['BLOCKSCOUT_INDEX','SOURCIFY_ABI']},
 N04:{all:['CHAIN_EVENTS'],supplemental:['BLOCKSCOUT_INDEX']},
 N05:{all:['NANSEN_FLOWS'],supplemental:['CHAIN_EVENTS']},
 N06:{all:['BLUESKY_PUBLIC'],supplemental:['GDELT_NEWS_DISCOVERY']},
 N07:{all:['OFFICIAL_EVENTS'],supplemental:['GDELT_NEWS_DISCOVERY','SNAPSHOT_GOVERNANCE']},
 N08:{all:['HTX_PUBLIC_RISK'],supplemental:['OFFICIAL_EVENTS']},
 N09:{all:['HTX_PUBLIC_RISK'],supplemental:[]},
 N10:{all:['PRIMARY_TECHNICAL_CONTEXT'],supplemental:[]},
 N11:{all:['PRIMARY_EXECUTION_STRESS'],supplemental:[]},
 N12:{all:['HTX_LARGE_TRADES'],supplemental:[]},
 N13:{all:['MACRO_CALENDAR'],supplemental:['SNAPSHOT_GOVERNANCE']},
 N14:{all:['DERIBIT_ALT_OPTIONS'],supplemental:[]},
 N15:{any:['COINGECKO_SECTOR','COINPAPRIKA_SECTOR'],supplemental:[]},
 N16:{all:['PRIMARY_EXECUTION_COST'],supplemental:[]},
 N17:{all:['SOURCE_HEALTH_JOURNAL'],supplemental:['SOURCIFY_ABI']},
});

export function classifyEvidenceSourceHealth(result={},valid_rows=0){
 const status=String(result?.status||'NOT_EVALUATED').toUpperCase(),calls=Number(result?.network_calls||0),http=(Array.isArray(result?.receipts)?result.receipts:[]).map(r=>Number(r?.http_status));
 if(Number(result?.market_binding?.rejected_rows)>0)return'INVALID_RESPONSE';
 if(/429|RATE_LIMIT/.test(status)||http.includes(429))return calls>0?'PROVIDER_RATE_LIMITED':'SKIPPED_QUOTA';
 if(/ACCESS_BLOCKED|HTTP_(401|403|451)/.test(status)||http.some(n=>[401,403,451].includes(n)))return calls>0?'ACCESS_BLOCKED':'SKIPPED_ACCESS_BACKOFF';
 if(calls===0&&/QUOTA|DAILY_CAP|CREDIT_CAP|BUDGET|REQUEST_ENVELOPE/.test(status))return'SKIPPED_QUOTA';
 if(/CODE_OR_STORE_ERROR|LEDGER_UNAVAILABLE|DB_ADMISSION/.test(status))return'INTERNAL_FAILURE';
 if(status==='CLOSED'||status.startsWith('CLOSED_'))return valid_rows>0?'CONTEXT_AVAILABLE':'VALID_RESPONSE_NO_EVENT';
 if(/INVALID_RESPONSE|SCHEMA|VALIDATION|IDENTITY|BINDING/.test(status))return calls>0?'INVALID_RESPONSE':'NOT_EVALUATED';
 if(/SOURCE_ERROR|HTTP_5\d\d|TIMEOUT|SOURCE_NOT_CLOSED/.test(status))return'EXTERNAL_FAILURE';
 return'NOT_CLOSED';
}

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
  // A shared upstream or cache never authorizes evidence for another market.
  if(params.contract&&Array.isArray(result.evidence)){
   const rows=result.evidence,accepted=rows.filter(row=>row?.htx_contract===params.contract);
   result={...result,evidence:accepted,market_binding:{requested_contract:params.contract,accepted_rows:accepted.length,rejected_rows:rows.length-accepted.length,status:accepted.length===rows.length?'CLOSED':'FOREIGN_OR_MISSING_MARKET_REJECTED'}};
  }
  // A denied durable provider reservation occurs before transport. Keep the
  // whole-job reservation conservative; release only this local phase slot.
  if(calls===0&&result?.admission?.allowed===false)reserved=before;
  results[route.name]=result;receipts.push({route:route.name,status:result.status,actual_http:calls,reported_http:Number.isSafeInteger(reported)?reported:null,phase_reserved:reserved,role:route.role??route.name});
 }
 return{results,receipts,network_calls:actual,reserved_requests:reserved,max_requests};
}

export function sourceWasActuallyChecked(source){
 if(!source||typeof source!=='object')return false;
 const status=String(source.status||'NOT_EVALUATED').toUpperCase();
 if(/(?:^|_)(?:EXACT_.+_REQUIRED|REQUIRED|DEFERRED|WAITING|NOT_EVALUATED|NOT_RUN|NOT_CLOSED|SOURCE_ERROR|INVALID(?:_|$)|SCHEMA|TIMEOUT|ACCESS_BLOCKED|RATE_LIMIT|QUOTA|DAILY_CAP|CREDIT_CAP|BUDGET|UNSUPPORTED|PARSER_FORMAT_MISMATCH)(?:_|$)/.test(status))return false;
 if(source.check_completed===true)return true;
 if(Number(source.network_calls)>0)return true;
 if(Array.isArray(source.evidence)&&source.evidence.length>0)return true;
 if(Array.isArray(source.receipts)&&source.receipts.some(row=>Number.isInteger(Number(row?.http_status))||row?.cache_hit===true||row?.check_completed===true))return true;
 const cache=String(source.cache_status||'').toUpperCase();
 return /(^|_)(HIT|SHARED_HIT|REUSED|REFRESHED|FRESH|VALID_CACHE|CACHE_VALID)(_|$)/.test(cache);
}
export function sourceWasAttempted(source){
 if(!source||typeof source!=='object')return false;
 return Number(source.network_calls)>0||source.check_completed===true||Array.isArray(source.receipts)&&source.receipts.some(row=>Number.isInteger(Number(row?.http_status))||row?.check_completed===true)||sourceWasActuallyChecked(source);
}

function proofForRequirement(requirement,sources){
 const all=Array.isArray(requirement?.all)?requirement.all:[],any=Array.isArray(requirement?.any)?requirement.any:[];
 const allClosed=all.every(name=>sourceWasActuallyChecked(sources?.[name]));
 const anyClosed=!any.length||any.some(name=>sourceWasActuallyChecked(sources?.[name]));
 return {checked:allClosed&&anyClosed,required_all:all,required_any:any,missing_required:[...all.filter(name=>!sourceWasActuallyChecked(sources?.[name])),...(any.length&&!any.some(name=>sourceWasActuallyChecked(sources?.[name]))?[`ANY:${any.join('|')}`]:[])]};
}

function sourceWasFreshlyChecked(source){
 return sourceWasActuallyChecked(source)&&(source?.check_completed===true||Number(source?.network_calls)>0);
}

function proofForFreshRequirement(requirement,sources){
 const all=Array.isArray(requirement?.all)?requirement.all:[],any=Array.isArray(requirement?.any)?requirement.any:[];
 const allClosed=all.every(name=>sourceWasFreshlyChecked(sources?.[name]));
 const anyClosed=!any.length||any.some(name=>sourceWasFreshlyChecked(sources?.[name]));
 return {checked:allClosed&&anyClosed,required_all:all,required_any:any,missing_required:[...all.filter(name=>!sourceWasFreshlyChecked(sources?.[name])),...(any.length&&!any.some(name=>sourceWasFreshlyChecked(sources?.[name]))?[`ANY:${any.join('|')}`]:[])]};
}

export function auditCandidateBlocks({evidence=[],sources={},decision_ts=Date.now(),strict_fresh=false}={}){
 const result={};
 for(const block of Object.keys(BLOCKS)){
  const rows=(Array.isArray(evidence)?evidence:[]).filter(row=>row?.block_id===block);
  const usable=rows.filter(row=>validateEvidenceV2(row,{decision_ts}).usable&&Number(row.coverage_fraction)>0).length;
  const requirement=BLOCK_SOURCE_REQUIREMENTS[block]||{all:[],any:[],supplemental:[]};
  const owners=[...(requirement.all||[]),...(requirement.any||[]),...(requirement.supplemental||[])];
  const sourceStatuses=Object.fromEntries(owners.map(name=>[name,String(sources?.[name]?.status||'NOT_EVALUATED')]));
  const sourceChecks=Object.fromEntries(owners.map(name=>{const source=sources?.[name]||{};return[name,{status:String(source?.status||'NOT_EVALUATED'),attempted:sourceWasAttempted(source),checked:sourceWasActuallyChecked(source),network_calls:Number(source?.network_calls||0),cache_status:String(source?.cache_status||'')||null,receipt_count:Array.isArray(source?.receipts)?source.receipts.length:0}];}));
  const proof=strict_fresh?proofForFreshRequirement(requirement,sources):proofForRequirement(requirement,sources),checked=proof.checked;
  result[block]={
   status:usable?'ADMISSIBLE_FACTUAL_CONTEXT':rows.length?'FACTS_PRESENT_NOT_DECISION_ADMISSIBLE':checked?'CHECKED_NO_USABLE_FACTS':owners.length?'NOT_CHECKED':'NO_ASSIGNED_SOURCE',
   checked,observed_facts:rows.length,usable_facts:usable,source_statuses:sourceStatuses,source_checks:sourceChecks,
   required_all:proof.required_all,required_any:proof.required_any,missing_required:proof.missing_required,
  };
 }
 const values=Object.values(result);
 return {status:values.every(row=>row.checked)?'CLOSED_ALL_17_CHECKED':'PARTIAL_BLOCK_CHECK',blocks:result,coverage_count:values.length,checked_block_count:values.filter(row=>row.checked).length,usable_block_count:values.filter(row=>row.usable_facts>0).length,all_blocks_checked:values.every(row=>row.checked),all_blocks_have_useful_data:values.every(row=>row.usable_facts>0),strict_fresh_required:strict_fresh,internal_only:true};
}

export function finalizeCandidateBlockCoverage({evidence_result={},primary_sources={}}={}){
 const sources={...(evidence_result?.sources||{}),...(primary_sources||{})};
 return {...evidence_result,sources,block_coverage:auditCandidateBlocks({evidence:evidence_result?.evidence||[],sources,decision_ts:evidence_result?.decision_ts??Date.now(),strict_fresh:evidence_result?.strict_fresh_required===true})};
}

export async function collectCandidateEvidenceV2(params={}){
 const requestedCap=Number(params.max_requests??process.env.REPORT2_EVIDENCE_HTTP_CAP);const evidenceCap=Number.isSafeInteger(requestedCap)?Math.max(5,Math.min(28,requestedCap)):5;
 // One transport guard also covers the compulsory sources and exceptions.
 const core=await collectEvidenceRouteBlock({routes:[{name:'HTX',role:'HTX_EXECUTION_RULES'},{name:'MACRO',role:'CALENDAR_CONTEXT'}],collectors:{HTX:collectHtxPublicRiskEvidence,MACRO:collectMacroCalendarEvidence},params,max_requests:evidenceCap});
 const htx=core.results.HTX,macro=core.results.MACRO;
 const chainName=String(params?.asset_identity?.chain||'').toLowerCase(),address=String(params?.asset_identity?.contract_or_mint||''),chainEligible=Boolean(chainName&&address),evmEligible=chainEligible&&chainName!=='solana'&&/^0x[0-9a-f]{40}$/i.test(address),socialEligible=chainEligible&&(evmEligible||chainName==='solana'),snapshotEligible=/^[a-z0-9][a-z0-9._-]{1,99}$/i.test(String(params?.asset_metadata?.snapshot_space||'')),officialDomains=Array.isArray(params?.asset_metadata?.official_domains)?params.asset_metadata.official_domains:[],officialFeeds=Array.isArray(params?.asset_metadata?.official_feeds)?params.asset_metadata.official_feeds:[],officialEligible=officialDomains.length>0&&officialFeeds.length>0,gdeltEligible=officialDomains.length>0&&Boolean(String(params?.asset_metadata?.official_name||'').trim()),blockscoutEligible=evmEligible&&Boolean(String(params?.blockscout_api_key||'').trim()),key=`${params?.run_id}:${params?.contract}:${Math.floor(Number(params?.now||Date.now())/(20*60_000))}`;
 const deferred={status:'DEFERRED_SHARED_REQUEST_ENVELOPE',evidence:[],network_calls:0,receipts:[],internal_only:true};
 let deribit=deferred,chainSupply=chainEligible?deferred:{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},chainEvents=chainEligible?deferred:{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},sourcify=evmEligible?deferred:{status:'EXACT_EVM_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},bluesky=socialEligible?deferred:{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},snapshot=snapshotEligible?deferred:{status:'EXACT_SNAPSHOT_SPACE_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},official=officialEligible?deferred:{status:'EXACT_OFFICIAL_FEED_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},gdelt=gdeltEligible?deferred:{status:'EXACT_OFFICIAL_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},blockscout=blockscoutEligible?deferred:{status:evmEligible?'WAITING_FREE_KEY':'EXACT_EVM_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true};
 const routes=[{name:'LARGE_TRADES',role:'ACTUAL_HTX_TRADE_CONTEXT'},...(officialEligible?[{name:'OFFICIAL',role:'OFFICIAL_EVENT_CONTEXT'}]:[]),...(chainEligible?[{name:'CHAIN_SUPPLY',role:'FINALIZED_SUPPLY_CONTEXT'},{name:'CHAIN_EVENTS',role:'FINALIZED_TRANSFER_CONTEXT'}]:[]),...(blockscoutEligible?[{name:'BLOCKSCOUT',role:'INDEX_DISCOVERY'}]:[]),{name:'DERIBIT',role:'OPTION_CONTEXT'},...(snapshotEligible?[{name:'SNAPSHOT',role:'GOVERNANCE_CONTEXT'}]:[]),...(evmEligible?[{name:'SOURCIFY',role:'ABI_IDENTITY_CONTEXT'}]:[]),...(socialEligible?[{name:'BLUESKY',role:'ATTENTION_CONTEXT'}]:[]),...(gdeltEligible?[{name:'GDELT',role:'OFFICIAL_LINK_DISCOVERY'}]:[])];
 if(params?.asset_metadata?.coinpaprika_id&&params?.asset_metadata?.sector_tag)routes.push({name:'SECTOR',role:'SECTOR_RELATIVE_STRENGTH_CONTEXT'});
 if(chainEligible&&['ethereum','solana'].includes(chainName))routes.push({name:'SECTOR_COINGECKO',role:'SECTOR_RELATIVE_STRENGTH_CONTEXT'});
 const routeBlock=await collectEvidenceRouteBlock({routes:rotateEvidenceRoleRoutes(routes,key),params,max_requests:Math.max(0,evidenceCap-core.reserved_requests),collectors:{LARGE_TRADES:collectHtxLargeTradesEvidence,SECTOR:collectCoinpaprikaSectorEvidence,SECTOR_COINGECKO:collectCoingeckoSectorEvidence,CHAIN_SUPPLY:collectChainSupplyEvidence,CHAIN_EVENTS:p=>collectFinalizedChainEvents({...p,event_mode:'TOKEN_TRANSFER'}),SOURCIFY:collectSourcifyAbiEvidence,BLUESKY:collectBlueskyAttentionEvidence,SNAPSHOT:collectSnapshotGovernanceEvidence,OFFICIAL:collectOfficialEventsEvidence,GDELT:collectGdeltOfficialDiscovery,BLOCKSCOUT:collectBlockscoutIndexEvidence,DERIBIT:collectDeribitAltOptionsEvidence}});
 ({CHAIN_SUPPLY:chainSupply=chainSupply,CHAIN_EVENTS:chainEvents=chainEvents,SOURCIFY:sourcify=sourcify,BLUESKY:bluesky=bluesky,SNAPSHOT:snapshot=snapshot,OFFICIAL:official=official,GDELT:gdelt=gdelt,BLOCKSCOUT:blockscout=blockscout,DERIBIT:deribit=deribit}=routeBlock.results);
 const largeTrades=routeBlock.results.LARGE_TRADES||{status:'DEFERRED_SHARED_REQUEST_ENVELOPE',evidence:[],network_calls:0};
 const sector=routeBlock.results.SECTOR||{status:'EXACT_SECTOR_REGISTRY_REQUIRED',evidence:[],network_calls:0};
 const cgSector=routeBlock.results.SECTOR_COINGECKO||{status:'EXACT_SECTOR_REGISTRY_REQUIRED',evidence:[],network_calls:0};
 const evidence=[...(cgSector.evidence||[]),...(largeTrades.evidence||[]),...(sector.evidence||[]),...(Array.isArray(htx?.evidence)?htx.evidence:[]),...(Array.isArray(macro?.evidence)?macro.evidence:[]),...(Array.isArray(deribit?.evidence)?deribit.evidence:[]),...(Array.isArray(chainSupply?.evidence)?chainSupply.evidence:[]),...(Array.isArray(chainEvents?.evidence)?chainEvents.evidence:[]),...(Array.isArray(sourcify?.evidence)?sourcify.evidence:[]),...(Array.isArray(bluesky?.evidence)?bluesky.evidence:[]),...(Array.isArray(snapshot?.evidence)?snapshot.evidence:[]),...(Array.isArray(official?.evidence)?official.evidence:[]),...(Array.isArray(blockscout?.evidence)?blockscout.evidence:[])];
 const statuses=[cgSector?.status,largeTrades?.status,sector?.status,htx?.status,macro?.status,deribit?.status,chainSupply?.status,chainEvents?.status,sourcify?.status,bluesky?.status,snapshot?.status,official?.status,gdelt?.status,blockscout?.status],closed=statuses.some(value=>value==='CLOSED'||value==='CLOSED_BOUNDED_SAMPLE');
 const supplementalSources=params?.supplemental_context?.sources||{};
 const sources={COINGECKO_SECTOR:cgSector,HTX_LARGE_TRADES:largeTrades,COINPAPRIKA_SECTOR:sector,HTX_PUBLIC_RISK:htx,MACRO_CALENDAR:macro,DERIBIT_ALT_OPTIONS:deribit,CHAIN_SUPPLY:chainSupply,CHAIN_EVENTS:chainEvents,SOURCIFY_ABI:sourcify,BLUESKY_PUBLIC:bluesky,SNAPSHOT_GOVERNANCE:snapshot,OFFICIAL_EVENTS:official,GDELT_NEWS_DISCOVERY:gdelt,BLOCKSCOUT_INDEX:blockscout,NANSEN_FLOWS:supplementalSources.NANSEN_FLOWS||{status:'NOT_EVALUATED',network_calls:0}};
 const healthRows=Object.entries(sources).map(([source_id,r])=>{
  const rows=Array.isArray(r?.evidence)?r.evidence:[],valid=rows.filter(row=>validateEvidenceV2(row,{decision_ts:params.now??Date.now()}).usable),status=String(r?.status||'NOT_EVALUATED');
  const operational_class=classifyEvidenceSourceHealth(r,valid.length);
  return{source_id,status,actual_http:Number(r?.network_calls||0),operational_class,evidence_rows:rows.length,valid_rows:valid.length,decision_usable_rows:valid.filter(x=>Number(x.coverage_fraction)>0).length};
 });
 const source_health=await recordEvidenceSourceHealth(params.db,{contract:params.contract,run_id:params.run_id,observations:healthRows,admit:params.source_health_admit,now:params.now??Date.now()});
 const sourceHealthChecked=['CLOSED_OPERATIONAL_JOURNAL','CLOSED_OPERATIONAL_JOURNAL_CACHE'].includes(source_health.status);
 sources.SOURCE_HEALTH_JOURNAL={status:source_health.status,check_completed:sourceHealthChecked,evidence:source_health.observations||[],network_calls:0,receipts:[{check_completed:sourceHealthChecked,status:source_health.status}]};
 const block_coverage=auditCandidateBlocks({evidence,sources,decision_ts:params?.now??Date.now(),strict_fresh:params?.strict_fresh_manual===true});
 return{
  version:CANDIDATE_EVIDENCE_V2_RUNTIME_VERSION,
  status:closed?'CLOSED':statuses.find(Boolean)||'NOT_CLOSED',
  evidence,
  network_calls:Number(cgSector.network_calls||0)+Number(largeTrades.network_calls||0)+Number(sector.network_calls||0)+Number(htx?.network_calls||0)+Number(macro?.network_calls||0)+Number(deribit?.network_calls||0)+Number(chainSupply?.network_calls||0)+Number(chainEvents?.network_calls||0)+Number(sourcify?.network_calls||0)+Number(bluesky?.network_calls||0)+Number(snapshot?.network_calls||0)+Number(official?.network_calls||0)+Number(gdelt?.network_calls||0)+Number(blockscout?.network_calls||0),
  cache_status:[cgSector.cache_status,largeTrades.cache_status,sector.cache_status,htx?.cache_status,macro?.cache_status,deribit?.cache_status,chainSupply?.cache_status,chainEvents?.cache_status,sourcify?.cache_status,bluesky?.cache_status,snapshot?.cache_status,official?.cache_status,gdelt?.cache_status,blockscout?.cache_status].filter(Boolean).join('+')||null,
  whole_job_admission:{status:[htx?.whole_job_admission?.status,macro?.whole_job_admission?.status,deribit?.whole_job_admission?.status,chainSupply?.whole_job_admission?.status,chainEvents?.whole_job_admission?.status,sourcify?.whole_job_admission?.status,bluesky?.whole_job_admission?.status,snapshot?.whole_job_admission?.status,official?.whole_job_admission?.status,gdelt?.whole_job_admission?.status,blockscout?.whole_job_admission?.status].filter(Boolean).join('+')||null},
  admission:{status:[htx?.admission?.status,macro?.admission?.status,deribit?.admission?.status,chainSupply?.admission?.status,chainEvents?.admission?.status,sourcify?.admission?.status,bluesky?.admission?.status,snapshot?.admission?.status,official?.admission?.status,gdelt?.admission?.status,blockscout?.admission?.status].filter(Boolean).join('+')||null},
  receipts:[
   ...(cgSector.receipts||[]).map(row=>({...row,source:'COINGECKO_SECTOR'})),
   ...(largeTrades.receipts||[]).map(row=>({...row,source:'HTX_LARGE_TRADES'})),
   ...(sector.receipts||[]).map(row=>({...row,source:'COINPAPRIKA_SECTOR'})),
   ...(htx?.receipts||[]).map(row=>({...row,source:'HTX_PUBLIC_RISK'})),
   ...(macro?.receipts||[]).map(row=>({...row,source:'MACRO_CALENDAR'})),
   ...(deribit?.receipts||[]).map(row=>({...row,source:'DERIBIT_ALT_OPTIONS'})),
   ...(chainSupply?.receipts||[]).map(row=>({...row,source:'CHAIN_SUPPLY'})),
   ...(chainEvents?.receipts||[]).map(row=>({...row,source:'CHAIN_EVENTS'})),
   ...(sourcify?.receipts||[]).map(row=>({...row,source:'SOURCIFY_ABI'})),
   ...(bluesky?.receipts||[]).map(row=>({...row,source:'BLUESKY_PUBLIC'})),
   ...(snapshot?.receipts||[]).map(row=>({...row,source:'SNAPSHOT_GOVERNANCE'})),
   ...(official?.receipts||[]).map(row=>({...row,source:'OFFICIAL_EVENTS'})),
   ...(gdelt?.receipts||[]).map(row=>({...row,source:'GDELT_NEWS_DISCOVERY'})),
   ...(blockscout?.receipts||[]).map(row=>({...row,source:'BLOCKSCOUT_INDEX'})),
  ],
  sources,source_health,decision_ts:params?.now??Date.now(),route_accounting:[...core.receipts,...routeBlock.receipts],shared_http_envelope:{cap:evidenceCap,reserved_attempts:core.reserved_requests+routeBlock.reserved_requests,actual_http:core.network_calls+routeBlock.network_calls,unknown_reservations_not_released:true},role_policy:'UTILITY_PRIORITY_WITH_ALL_VALID_CACHES_AND_EXISTING_QUOTAS',route_priority:{tickets:EVIDENCE_ROUTE_PRIORITY,semantics:'OPERATIONAL_SCHEDULING_NOT_PREDICTIVE_WEIGHT',executed_order:routeBlock.receipts.map(row=>row.route)},block_coverage,
  strict_fresh_required:params?.strict_fresh_manual===true,
  internal_only:true,
 };
}

export default{collectCandidateEvidenceV2,finalizeCandidateBlockCoverage,auditCandidateBlocks};
