import {collectWikimediaAttention,exactWikimediaPage} from './wikimedia-attention-context.mjs';
import {consumeSpecialistContext} from './specialist-candidate-context.mjs';
import {collectCoinmetricsSupplyContext,exactCoinmetricsNativeIdentity} from './coinmetrics-supply-context.mjs';
import {collectHtxLargeTradesEvidence} from './htx-large-trades-evidence.mjs';
import {collectHtxPublicRiskEvidence} from './htx-public-risk-evidence.mjs';
import {collectDeltaOptionsEvidence,DELTA_OBSERVED_OPTION_BASES} from './delta-options-evidence.mjs';
import {collectDeribitAltOptionsEvidence} from './deribit-alt-options-evidence.mjs';
import {collectCoingeckoSectorEvidence,COINGECKO_ASSET_PLATFORMS,exactNativeSectorBinding} from './coingecko-sector-evidence.mjs';
import {collectCoinpaprikaSectorEvidence} from './coinpaprika-sector-evidence.mjs';
import {collectFinalizedChainEvents} from './finalized-chain-events.mjs';
import {collectChainSupplyEvidence} from './chain-supply-evidence.mjs';
import {collectBlueskyAttentionEvidence} from './bluesky-attention-evidence.mjs';
import {collectOfficialEventsEvidence} from './official-events-evidence.mjs';
import {collectHtxOfficialAnnouncements} from './htx-official-announcements-evidence.mjs';
import {collectOfficialTokenSchedule,exactTokenScheduleRoute} from './official-token-schedule.mjs';
import {collectGdeltOfficialDiscovery} from './gdelt-official-discovery.mjs';
import {collectBlockscoutIndexEvidence} from './blockscout-index-evidence.mjs';
import {BLOCKS,validateEvidenceV2} from './evidence-v2.mjs';
import {buildEvidenceV2} from './evidence-source-adapters.mjs';
import {recordEvidenceSourceHealth} from './evidence-source-store.mjs';

export const CANDIDATE_EVIDENCE_V2_RUNTIME_VERSION='candidate-evidence-v2-runtime-v21-exact-flow-five-minute-publication-20261005';

const rotation=(value,mod)=>{let hash=2166136261;for(const ch of String(value??'')){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619);}return(hash>>>0)%Math.max(1,Number(mod)||1);};
const bounded=(value,min,max)=>Math.min(max,Math.max(min,value));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
export function buildHtxFuturesFlowPrimary({contract,trajectory,now=Date.now()}={}){
 const market=String(contract||'').trim().toUpperCase(),root={status:'HTX_EXACT_FUTURES_FLOW_4H_NOT_CLOSED',check_completed:false,network_calls:0,evidence:[],internal_only:true};
 const window=trajectory?.windows?.['4h'],flow=window?.order_flow,price=window?.price,quality=flow?.cvd_delta_quality,factual=quality?.factual_coverage,integrity=quality?.record_integrity;
 const start=flow?.window_start_ts,end=flow?.window_end_ts,buy=flow?.taker_buy_usdt,sell=flow?.taker_sell_usdt,count=flow?.sample_trades,size=trajectory?.contract_info?.contract_size;
 const observed=Number(trajectory?.timestamp),closed=trajectory?.source==='HTX official public API'&&trajectory?.market==='HTX USDT-M Futures'&&trajectory?.contract===market&&trajectory?.contract_info?.contract_code===market&&finite(size)&&size>0&&trajectory?.coverage?.flow_4h==='closed'&&window?.label==='4h'&&flow?.usable===true&&flow?.cvd_delta_reliable===true&&flow?.raw_delta_is_diagnostic_only===false&&quality?.status==='COMPLETE'&&quality?.reliable===true&&quality?.trade_count_exact_match===true&&quality?.raw_record_integrity_complete===true&&integrity?.status==='COMPLETE'&&integrity?.complete===true&&integrity?.source_truncated===false&&['missing_trade_id_count','duplicate_trade_id_count','invalid_payload_count','source_rows_dropped'].every(key=>integrity?.[key]===0)&&factual?.status==='COMPLETE'&&factual?.exact_1m_bars===true&&factual?.trade_count_fields_complete===true&&factual?.expected_1m_bars===240&&factual?.received_1m_bars===240&&price?.usable===true&&price?.exact_1m_bars===true&&price?.trade_count_complete===true&&price?.expected_1m_bars===240&&price?.received_1m_bars===240&&Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start%60000===0&&end-start===4*60*60_000&&end<=observed&&observed<=now&&now-end<=5*60_000&&Number.isSafeInteger(count)&&count>0&&quality?.raw_trade_count===count&&quality?.factual_1m_trade_count===count&&factual?.factual_1m_trade_count===count&&integrity?.raw_records===count&&integrity?.unique_trade_ids===count&&price?.trade_count===count&&finite(buy)&&buy>=0&&finite(sell)&&sell>=0&&buy+sell>0&&finite(flow?.delta_usdt)&&Math.abs(flow.delta_usdt-(buy-sell))<1e-8;
 if(!closed)return root;
 const physical=`HTX_RAW_FILLS:${market}:${start}:${end}`;
 const evidence=buildEvidenceV2({provider_id:'HTX_FUTURES_RAW_FLOW',upstream_id:'HTX_OFFICIAL_RAW_FILLS',asset_id:`HTX:USDT_M_PERPETUAL:${market}`,htx_contract:market,block_id:'N05',metric_family:'EXACT_FUTURES_TAKER_FLOW_4H',origin_event_id:`${market}:${start}:${end}`,dependency_group:physical,source_ts:end,observed_ts:observed,expires_at:end+5*60_000,coverage_status:'EXACT_FOUR_HOURS',coverage_fraction:1/6,unit:'USDT',value:flow.delta_usdt,directional_strength:null,risk_strength:null,extra:{physical_root_key:physical,window_start_ts:start,window_end_ts:end,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,raw_trade_count:count,factual_1m_trade_count:count,source_clock_policy:'IMMUTABLE_EXACT_RAW_MINUTES',publication_freshness_ms:5*60_000,common_upstream_not_independent_vote:true,score_contribution:0,entry_authorized:false,nansen_required:false}});
 return{status:'CLOSED_EXACT_FUTURES_FLOW_4H',check_completed:true,network_calls:0,evidence:[evidence],receipts:[{check_completed:true,status:'CLOSED',contract:market,window:'4h',source_http:0}],internal_only:true};
}
export function nansenFlowEvidence(source,params){
 // Reuse the exact token, contiguous complete-window and provider receipt
 // checks used by the visible specialist consumer. CLOSED alone is not proof.
 const checked=consumeSpecialistContext({sources:{NANSEN_FLOWS:source},contract:params?.contract,now:params?.now,asset_identity:params?.asset_identity}).blocks.exchange_flows;
 if(checked?.status!=='CLOSED')return[];
 const incoming=checked.inflow_tokens,outgoing=checked.outflow_tokens;
 const total=incoming+outgoing,sourceTs=Number(source.source_ts),observedTs=Number(source.observed_ts),identity=source.identity||{};
 if(!Number.isFinite(total)||total<0||source.source_ts!==source.window_end_ts||source.window_start_ts!==source.window_end_ts-7200000||source.unit!=='TOKEN_AMOUNT')return[];
 return[buildEvidenceV2({provider_id:'NANSEN_FLOWS',upstream_id:'NANSEN_TOKEN_GOD_MODE',asset_id:`${identity.chain}:${identity.contract_or_mint}`,htx_contract:params.contract,block_id:'N05',metric_family:'CEX_NET_FLOW_TWO_COMPLETE_HOURS',origin_event_id:`${params.contract}:${source.window_start_ts}:${source.window_end_ts}`,dependency_group:`NANSEN_CEX_FLOW:${params.contract}:${source.window_start_ts}:${source.window_end_ts}`,source_ts:sourceTs,observed_ts:observedTs,expires_at:observedTs+60*60_000,coverage_status:'TWO_COMPLETE_HOURS',coverage_fraction:.25,directional_strength:total===0?0:bounded((outgoing-incoming)/total,-1,1),risk_strength:null,unit:'TOKEN_AMOUNT',value:incoming-outgoing,extra:{incoming_tokens:incoming,outgoing_tokens:outgoing,window_start_ts:source.window_start_ts,window_end_ts:source.window_end_ts,label_authority:'NANSEN',individual_addresses_verified:false,provider_data_may_be_revised:true,verified_zero_flow_window:total===0,direction_policy:total===0?'NEUTRAL_VERIFIED_ZERO_WINDOW':'OUTFLOW_SUPPORTS_LONG_INFLOW_SUPPORTS_SHORT_LOW_WEIGHT'}})];
}
export function resolveNansenFlowPrimary(source,params={}){
 const current=source||{status:'NOT_EVALUATED',network_calls:0},exact=exactCapabilityIdentity(params);
 if(!source){
  const denied=(params?.supplemental_context?.receipts||[]).find(r=>r?.source==='NANSEN_FLOWS'&&r?.status==='LOCAL_BUDGET_OR_BACKOFF'&&r?.actual_http===0);
  if(denied)return{status:denied.status,network_calls:0,check_completed:false,evidence:[],receipts:[denied],reason:'EXISTING_PROVIDER_ADMISSION_DENIED',internal_only:true};
 }
 if(current.status==='NOT_EVALUATED'&&exact?.asset_kind==='NATIVE')return capabilityCheckedNoExactRoute(params,'NANSEN_FLOWS','DOCUMENTED_PROVIDER_FLOW_ENDPOINT_EXCLUDES_NATIVE_TOKENS');
 if(current.status==='NOT_EVALUATED')return{...current,check_completed:false,capability_registry_complete:false,reason:'LABELLED_FLOW_PRIMARY_NOT_EVALUATED_NO_CAPABILITY_ABSENCE_PROVEN',internal_only:true};
 if(current.status==='CLOSED'){const evidence=nansenFlowEvidence(current,params);if(!evidence.length)return{...current,status:'INVALID_FLOW_BINDING_OR_COMPLETE_WINDOW',check_completed:false,evidence:[],internal_only:true};return{...current,evidence};}
 return current;
}
// Only name producers that actually emit a row for this block in this collector.
// Existing technical/market blocks are owned outside this supplementary lane.
// Scheduling tickets express the current operational assignment, not measured
// trading accuracy or a share of provider quota. Eligibility, caches and every
// existing durable quota remain inside their original collectors.
export const EVIDENCE_ROUTE_PRIORITY=Object.freeze({
 LARGE_TRADES:5,OFFICIAL:5,HTX_ANNOUNCEMENTS:5,TOKEN_SCHEDULE:5,CHAIN_SUPPLY:5,CHAIN_EVENTS:5,
 DERIBIT:5,DELTA:4,COINMETRICS:3,BLUESKY:5,SECTOR:4,SECTOR_COINGECKO:4,
 BLOCKSCOUT:1,GDELT:1,
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
export function exactCapabilityIdentity(params={}){
 const contract=String(params?.contract||'').trim().toUpperCase(),identity=params?.asset_identity,method=String(params?.identity_method||'').trim();
 if(!/^\S+-USDT$/u.test(contract)||!identity||!['HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK','HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS','VERSIONED_EXPLORER_EXACT_TOKEN_BINDING'].includes(method))return null;
 const chain=String(identity.chain||'').trim().toLowerCase();if(!chain)return null;
 if(identity.asset_kind==='NATIVE'&&identity.contract_or_mint===null&&identity.native_asset_id===`${chain}:mainnet`&&method==='HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK')return{contract,chain,asset_kind:'NATIVE',native_asset_id:identity.native_asset_id,identity_method:method};
 const address=String(identity.contract_or_mint||'').trim();
 if(address&&['HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS','VERSIONED_EXPLORER_EXACT_TOKEN_BINDING'].includes(method))return{contract,chain,asset_kind:'TOKEN',contract_or_mint:address,identity_method:method};
 return null;
}
export function capabilityCheckedNoExactRoute(params,source_id,reason){
 const identity=exactCapabilityIdentity(params);if(!identity)return null;
 return{status:'CAPABILITY_CHECKED_NO_EXACT_ROUTE',check_completed:true,capability_registry_complete:true,source_id,reason,exact_identity:identity,network_calls:0,evidence:[],receipts:[{check_completed:true,status:'NO_EXACT_ROUTE',source_id,contract:identity.contract,identity_method:identity.identity_method}],observed_ts:Number(params?.now)||Date.now(),decision_effect:'MISSING_FACT_NO_ZERO_NO_GREEN',internal_only:true};
}
// A block is complete only when its assigned primary owner was actually
// evaluated.  Supplemental and discovery routes remain visible, but they may
// not close a block on behalf of a missing primary route.
export const BLOCK_SOURCE_REQUIREMENTS=Object.freeze({
 N01:{all:['OFFICIAL_TOKEN_SCHEDULE'],supplemental:['OFFICIAL_EVENTS']},
 N02:{all:['CHAIN_SUPPLY'],supplemental:['BLOCKSCOUT_INDEX','COINMETRICS_SUPPLY']},
 N03:{any:['CHAIN_EVENTS','CHAIN_SUPPLY_COMPARISON'],supplemental:['BLOCKSCOUT_INDEX']},
 N04:{all:['CHAIN_EVENTS'],supplemental:['BLOCKSCOUT_INDEX']},
 N05:{any:['NANSEN_FLOWS','PRIMARY_HTX_FUTURES_FLOW'],supplemental:['CHAIN_EVENTS']},
 N06:{all:['BLUESKY_PUBLIC'],supplemental:['GDELT_NEWS_DISCOVERY','WIKIMEDIA_ATTENTION']},
 N07:{any:['OFFICIAL_EVENTS','HTX_OFFICIAL_ANNOUNCEMENTS'],supplemental:['GDELT_NEWS_DISCOVERY']},
 N08:{all:['HTX_PUBLIC_RISK'],supplemental:['OFFICIAL_EVENTS']},
 N09:{all:['HTX_PUBLIC_RISK'],supplemental:[]},
 N10:{all:['PRIMARY_TECHNICAL_CONTEXT'],supplemental:[]},
 N11:{all:['PRIMARY_EXECUTION_STRESS'],supplemental:[]},
 N12:{all:['HTX_LARGE_TRADES'],supplemental:[]},
 N14:{any:['DERIBIT_ALT_OPTIONS','DELTA_OPTIONS'],supplemental:[]},
 N15:{any:['COINGECKO_SECTOR','COINPAPRIKA_SECTOR'],supplemental:[]},
 N16:{all:['PRIMARY_EXECUTION_COST'],supplemental:[]},
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

const hasHttpReceipt=receipt=>receipt?.http_status!==null&&receipt?.http_status!==undefined&&Number.isInteger(Number(receipt.http_status))&&Number(receipt.http_status)>=100&&Number(receipt.http_status)<=599;
export function sourceWasActuallyChecked(source){
 if(!source||typeof source!=='object')return false;
 const status=String(source.status||'NOT_EVALUATED').toUpperCase();
 if(status==='CAPABILITY_CHECKED_NO_EXACT_ROUTE')return source.check_completed===true&&source.capability_registry_complete===true&&Boolean(source?.exact_identity?.contract)&&Boolean(source?.exact_identity?.identity_method)&&source.decision_effect==='MISSING_FACT_NO_ZERO_NO_GREEN';
 if(/(?:^|_)(?:EXACT_.+_REQUIRED|REQUIRED|DEFERRED|WAITING|NOT_EVALUATED|NOT_RUN|NOT_CLOSED|SOURCE_ERROR|STALE|SATURATED|TRUNCATED|INCOMPLETE|INVALID(?:_|$)|SCHEMA|TIMEOUT|ACCESS_BLOCKED|RATE_LIMIT|QUOTA|DAILY_CAP|CREDIT_CAP|BUDGET|UNSUPPORTED|PARSER_FORMAT_MISMATCH)(?:_|$)/.test(status))return false;
 if(source.check_completed===true)return true;
 if(Number(source.network_calls)>0)return true;
 if(Array.isArray(source.evidence)&&source.evidence.length>0)return true;
 if(Array.isArray(source.receipts)&&source.receipts.some(row=>hasHttpReceipt(row)||row?.cache_hit===true||row?.check_completed===true))return true;
 const cache=String(source.cache_status||'').toUpperCase();
 return /(^|_)(HIT|SHARED_HIT|REUSED|REFRESHED|FRESH|VALID_CACHE|CACHE_VALID)(_|$)/.test(cache);
}
export function sourceWasAttempted(source){
 if(!source||typeof source!=='object')return false;
 return Number(source.network_calls)>0||source.check_completed===true||Array.isArray(source.receipts)&&source.receipts.some(row=>hasHttpReceipt(row)||row?.check_completed===true)||sourceWasActuallyChecked(source);
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
 const controlConsumers=new Set(['EXECUTION_GATE','TARGET_PATH_INVALIDATION','EXECUTION_STRESS','EXECUTION_COST_GATE']);
 for(const block of Object.keys(BLOCKS)){
  const rows=(Array.isArray(evidence)?evidence:[]).filter(row=>row?.block_id===block);
  const evaluated=rows.map(row=>({row,validation:validateEvidenceV2(row,{decision_ts})}));
  const usable=evaluated.filter(({row,validation})=>validation.usable&&Number(row.coverage_fraction)>0).length;
  const rejectionReasons=evaluated.filter(({row,validation})=>!validation.usable||!(Number(row.coverage_fraction)>0)).reduce((acc,{row,validation})=>{
   const reason=!validation.usable?validation.status:'ZERO_DECISION_COVERAGE';acc[reason]=(acc[reason]||0)+1;return acc;
  },{});
  const requirement=BLOCK_SOURCE_REQUIREMENTS[block]||{all:[],any:[],supplemental:[]};
  const policy=BLOCKS[block]||{};
  const owners=[...(requirement.all||[]),...(requirement.any||[]),...(requirement.supplemental||[])];
  const sourceStatuses=Object.fromEntries(owners.map(name=>[name,String(sources?.[name]?.status||'NOT_EVALUATED')]));
  const sourceChecks=Object.fromEntries(owners.map(name=>{const source=sources?.[name]||{};return[name,{status:String(source?.status||'NOT_EVALUATED'),attempted:sourceWasAttempted(source),checked:sourceWasActuallyChecked(source),network_calls:Number(source?.network_calls||0),cache_status:String(source?.cache_status||'')||null,receipt_count:Array.isArray(source?.receipts)?source.receipts.length:0}];}));
  const proof=strict_fresh?proofForFreshRequirement(requirement,sources):proofForRequirement(requirement,sources),checked=proof.checked;
  const validNeutral=rows.length>0&&evaluated.every(({validation})=>validation.usable)&&evaluated.every(({row})=>Number(row.coverage_fraction)===0);
  const decisionPath=!checked?'BLOCKED_REQUIRED_SOURCE_NOT_CHECKED':usable>0?'ADMITTED_SCORE_OR_RISK_INPUT':controlConsumers.has(policy.consumer)?'ADMITTED_CONTROL_CONTEXT':validNeutral?'ADMITTED_NEUTRAL_CONTEXT':rows.length?'OBSERVED_CONTEXT_NOT_SCORE_ELIGIBLE':'CHECKED_NEUTRAL_NO_EVENT';
  result[block]={
   status:usable?'ADMISSIBLE_FACTUAL_CONTEXT':validNeutral?'CHECKED_NEUTRAL_CONTEXT':rows.length?'FACTS_PRESENT_NOT_DECISION_ADMISSIBLE':checked?'CHECKED_NO_USABLE_FACTS':owners.length?'NOT_CHECKED':'NO_ASSIGNED_SOURCE',
   checked,observed_facts:rows.length,usable_facts:usable,source_statuses:sourceStatuses,source_checks:sourceChecks,
   decision_consumer:policy.consumer||null,maximum_score_points:Number(policy.cap)||0,decision_path:decisionPath,evidence_rejection_reasons:rejectionReasons,
   required_all:proof.required_all,required_any:proof.required_any,missing_required:proof.missing_required,
  };
 }
 const values=Object.values(result);
 return {status:values.every(row=>row.checked)?'CLOSED_ALL_15_CHECKED':'PARTIAL_BLOCK_CHECK',blocks:result,coverage_count:values.length,
  checked_block_count:values.filter(row=>row.checked).length,usable_block_count:values.filter(row=>row.usable_facts>0).length,
  score_or_risk_input_block_count:values.filter(row=>row.decision_path==='ADMITTED_SCORE_OR_RISK_INPUT').length,
  admitted_control_context_block_count:values.filter(row=>row.decision_path==='ADMITTED_CONTROL_CONTEXT').length,
  admitted_neutral_context_block_count:values.filter(row=>row.decision_path==='ADMITTED_NEUTRAL_CONTEXT').length,
  observed_context_not_score_eligible_block_count:values.filter(row=>row.decision_path==='OBSERVED_CONTEXT_NOT_SCORE_ELIGIBLE').length,
  checked_neutral_no_event_block_count:values.filter(row=>row.decision_path==='CHECKED_NEUTRAL_NO_EVENT').length,
  blocked_required_source_block_count:values.filter(row=>row.decision_path==='BLOCKED_REQUIRED_SOURCE_NOT_CHECKED').length,
  all_blocks_have_assigned_consumer:values.every(row=>Boolean(row.decision_consumer)&&Boolean(row.decision_path)),
  all_blocks_decision_accounted:false,actual_use_is_measured_in_canonical_result:true,
  all_blocks_checked:values.every(row=>row.checked),all_blocks_have_useful_data:values.every(row=>row.usable_facts>0),strict_fresh_required:strict_fresh,internal_only:true};
}

export function finalizeCandidateBlockCoverage({evidence_result={},primary_sources={}}={}){
 const sources={...(evidence_result?.sources||{}),...(primary_sources||{})};
 const evidence=[...(evidence_result?.evidence||[]),...Object.values(primary_sources||{}).flatMap(source=>Array.isArray(source?.evidence)?source.evidence:[])];
 return {...evidence_result,evidence,sources,block_coverage:auditCandidateBlocks({evidence,sources,decision_ts:evidence_result?.decision_ts??Date.now(),strict_fresh:evidence_result?.strict_fresh_required===true})};
}

export function planCandidateEvidenceRoutes(params={}){
 const chainName=String(params?.asset_identity?.chain||'').toLowerCase(),address=String(params?.asset_identity?.contract_or_mint||''),chainEligible=Boolean(chainName&&address&&params?.asset_identity?.asset_kind!=='NATIVE'),nativeSectorEligible=Boolean(exactNativeSectorBinding(params?.asset_identity,params?.contract)),nativeContract={near:'NEAR-USDT',solana:'SOL-USDT',cardano:'ADA-USDT'}[chainName],nativeSupplyEligible=['near','solana','cardano'].includes(chainName)&&params?.asset_identity?.asset_kind==='NATIVE'&&params?.asset_identity?.native_asset_id===`${chainName}:mainnet`&&!address&&params?.contract===nativeContract,nativeChainEventsEligible=chainName==='solana'&&nativeSupplyEligible,supplyEligible=chainEligible||nativeSupplyEligible,chainEventsEligible=chainEligible||nativeChainEventsEligible,evmEligible=chainEligible&&chainName!=='solana'&&/^0x[0-9a-f]{40}$/i.test(address),officialDomains=Array.isArray(params?.asset_metadata?.official_domains)?params.asset_metadata.official_domains:[],nativeSocialEligible=nativeSectorEligible&&officialDomains.length===1,socialEligible=chainEligible&&(evmEligible||chainName==='solana')||nativeSocialEligible,officialFeeds=Array.isArray(params?.asset_metadata?.official_feeds)?params.asset_metadata.official_feeds:[],officialEligible=officialDomains.length>0&&officialFeeds.length>0,gdeltEligible=officialDomains.length>0&&Boolean(String(params?.asset_metadata?.official_name||'').trim()),blockscoutEligible=evmEligible&&Boolean(String(params?.blockscout_api_key||'').trim()),key=`${params?.run_id}:${params?.contract}:${Math.floor(Number(params?.now||Date.now())/(20*60_000))}`;
 const routes=[...(exactCoinmetricsNativeIdentity(params?.contract,params?.asset_identity)?[{name:'COINMETRICS',role:'ADDITIONAL_NATIVE_DAILY_SUPPLY_HISTORY'}]:[]),{name:'LARGE_TRADES',role:'ACTUAL_HTX_TRADE_CONTEXT'},...(!officialEligible?[{name:'HTX_ANNOUNCEMENTS',role:'OFFICIAL_HTX_ASSET_EVENT_CONTEXT'}]:[]),...(officialEligible?[{name:'OFFICIAL',role:'OFFICIAL_EVENT_CONTEXT'}]:[]),...(supplyEligible?[{name:'CHAIN_SUPPLY',role:'FINALIZED_SUPPLY_CONTEXT'}]:[]),...(chainEventsEligible?[{name:'CHAIN_EVENTS',role:'FINALIZED_TRANSFER_CONTEXT'}]:[]),...(blockscoutEligible?[{name:'BLOCKSCOUT',role:'INDEX_DISCOVERY'}]:[]),{name:'DERIBIT',role:'OPTION_CONTEXT'},...(DELTA_OBSERVED_OPTION_BASES.includes(String(params?.contract||'').replace(/-USDT$/,''))?[{name:'DELTA',role:'INDEPENDENT_SCOPED_OPTION_CONTEXT'}]:[]),...(socialEligible?[{name:'BLUESKY',role:'ATTENTION_CONTEXT'}]:[]),...(gdeltEligible?[{name:'GDELT',role:'OFFICIAL_LINK_DISCOVERY'}]:[])];
 if(exactWikimediaPage(params))routes.push({name:'WIKIMEDIA',role:'ADDITIONAL_DAILY_PAGEVIEW_CONTEXT'});
 if(exactTokenScheduleRoute(params))routes.push({name:'TOKEN_SCHEDULE',role:'OFFICIAL_VESTING_DOCUMENT_CONTEXT'});
 if(params?.asset_metadata?.coinpaprika_id&&params?.asset_metadata?.sector_tag)routes.push({name:'SECTOR',role:'SECTOR_RELATIVE_STRENGTH_CONTEXT'});
 if(nativeSectorEligible||chainEligible&&Object.hasOwn(COINGECKO_ASSET_PLATFORMS,chainName))routes.push({name:'SECTOR_COINGECKO',role:'SECTOR_RELATIVE_STRENGTH_CONTEXT'});
 return{routes,key,chainName,chainEligible,nativeSectorEligible,nativeSupplyEligible,nativeChainEventsEligible,supplyEligible,chainEventsEligible,evmEligible,socialEligible,officialEligible,gdeltEligible,blockscoutEligible};
}

export async function collectCandidateEvidenceV2(params={}){
 const requestedCap=Number(params.max_requests??process.env.REPORT2_EVIDENCE_HTTP_CAP);const evidenceCap=Number.isSafeInteger(requestedCap)?Math.max(5,Math.min(28,requestedCap)):5;
 // One transport guard also covers the compulsory sources and exceptions.
 const core=await collectEvidenceRouteBlock({routes:[{name:'HTX',role:'HTX_EXECUTION_RULES'}],collectors:{HTX:collectHtxPublicRiskEvidence},params,max_requests:evidenceCap});
 const htx=core.results.HTX;
 const {routes,key,chainName,chainEligible,nativeSectorEligible,nativeSupplyEligible,chainEventsEligible,supplyEligible,evmEligible,socialEligible,officialEligible,gdeltEligible,blockscoutEligible}=planCandidateEvidenceRoutes(params);
 const exactCapability=exactCapabilityIdentity(params),noRoute=(source,reason)=>capabilityCheckedNoExactRoute(params,source,reason);
 const deferred={status:'DEFERRED_SHARED_REQUEST_ENVELOPE',evidence:[],network_calls:0,receipts:[],internal_only:true};
 let deribit=deferred,
  chainSupply=supplyEligible?deferred:(exactCapability?.asset_kind==='NATIVE'?noRoute('CHAIN_SUPPLY','NO_EXACT_FINALIZED_SUPPLY_ADAPTER_FOR_NATIVE_CHAIN'):{status:nativeSectorEligible?'NATIVE_SUPPLY_PROVIDER_ROUTE_REQUIRED':'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true}),
  chainEvents=chainEventsEligible?deferred:(exactCapability?.asset_kind==='NATIVE'?noRoute('CHAIN_EVENTS','NO_EXACT_FINALIZED_EVENT_ADAPTER_FOR_NATIVE_CHAIN'):{status:nativeSectorEligible?'NATIVE_TRANSACTION_EVENT_ROUTE_REQUIRED':'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true}),
  bluesky=socialEligible?deferred:(exactCapability?noRoute('BLUESKY_PUBLIC','NO_EXACT_SOCIAL_ASSET_ROUTE_FOR_VERIFIED_IDENTITY'):{status:'EXACT_ASSET_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true}),
  official=officialEligible?deferred:(exactCapability?noRoute('OFFICIAL_EVENTS','NO_EXACT_OFFICIAL_FEED_IN_CAPABILITY_REGISTRY'):{status:'EXACT_OFFICIAL_FEED_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true}),
  gdelt=gdeltEligible?deferred:{status:'EXACT_OFFICIAL_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true},blockscout=blockscoutEligible?deferred:{status:evmEligible?'WAITING_FREE_KEY':'EXACT_EVM_IDENTITY_REQUIRED',evidence:[],network_calls:0,receipts:[],internal_only:true};
 const routeBlock=await collectEvidenceRouteBlock({routes:rotateEvidenceRoleRoutes(routes,key),params,max_requests:Math.max(0,evidenceCap-core.reserved_requests),collectors:{WIKIMEDIA:collectWikimediaAttention,LARGE_TRADES:collectHtxLargeTradesEvidence,HTX_ANNOUNCEMENTS:collectHtxOfficialAnnouncements,TOKEN_SCHEDULE:collectOfficialTokenSchedule,SECTOR:collectCoinpaprikaSectorEvidence,SECTOR_COINGECKO:collectCoingeckoSectorEvidence,CHAIN_SUPPLY:collectChainSupplyEvidence,CHAIN_EVENTS:p=>collectFinalizedChainEvents({...p,event_mode:'TOKEN_TRANSFER'}),BLUESKY:collectBlueskyAttentionEvidence,OFFICIAL:collectOfficialEventsEvidence,GDELT:collectGdeltOfficialDiscovery,BLOCKSCOUT:collectBlockscoutIndexEvidence,DERIBIT:collectDeribitAltOptionsEvidence,DELTA:collectDeltaOptionsEvidence,COINMETRICS:collectCoinmetricsSupplyContext}});
 ({CHAIN_SUPPLY:chainSupply=chainSupply,CHAIN_EVENTS:chainEvents=chainEvents,BLUESKY:bluesky=bluesky,OFFICIAL:official=official,GDELT:gdelt=gdelt,BLOCKSCOUT:blockscout=blockscout,DERIBIT:deribit=deribit}=routeBlock.results);
 const coinmetrics=routeBlock.results.COINMETRICS||{status:'EXACT_SUPPORTED_NATIVE_BINDING_REQUIRED',evidence:[],network_calls:0};
 const delta=routeBlock.results.DELTA||{status:'NOT_IN_VERIFIED_DELTA_OPTION_CAPABILITY',evidence:[],network_calls:0};
 const largeTrades=routeBlock.results.LARGE_TRADES||{status:'DEFERRED_SHARED_REQUEST_ENVELOPE',evidence:[],network_calls:0};
 const sector=routeBlock.results.SECTOR||{status:'EXACT_SECTOR_REGISTRY_REQUIRED',evidence:[],network_calls:0};
 let cgSector=routeBlock.results.SECTOR_COINGECKO||{status:'EXACT_SECTOR_REGISTRY_REQUIRED',evidence:[],network_calls:0};
 if(exactCapability&&Number(cgSector.network_calls)>0&&['EXACT_ASSET_AND_CATEGORY_REQUIRED','EXACT_SECTOR_REGISTRY_REQUIRED'].includes(String(cgSector.status)))cgSector=noRoute('COINGECKO_SECTOR','PROVIDER_CHECK_FOUND_NO_EXACT_FUNCTIONAL_CATEGORY_ROUTE');
 const supplementalSources=params?.supplemental_context?.sources||{};
 const nansen=resolveNansenFlowPrimary(supplementalSources.NANSEN_FLOWS,params);
 const evidence=[...(coinmetrics.evidence||[]),...(delta.evidence||[]),...(cgSector.evidence||[]),...(largeTrades.evidence||[]),...(sector.evidence||[]),...(Array.isArray(htx?.evidence)?htx.evidence:[]),...(Array.isArray(deribit?.evidence)?deribit.evidence:[]),...(Array.isArray(chainSupply?.evidence)?chainSupply.evidence:[]),...(Array.isArray(chainEvents?.evidence)?chainEvents.evidence:[]),...(Array.isArray(bluesky?.evidence)?bluesky.evidence:[]),...(Array.isArray(official?.evidence)?official.evidence:[]),...(Array.isArray(blockscout?.evidence)?blockscout.evidence:[]),...nansenFlowEvidence(nansen,params)].filter(row=>BLOCKS[row?.block_id]);
 const wikimedia=routeBlock.results.WIKIMEDIA||{status:'EXACT_VERIFIED_PAGE_BINDING_REQUIRED',evidence:[],network_calls:0};
 const htxAnnouncements=routeBlock.results.HTX_ANNOUNCEMENTS||{status:'DEFERRED_SHARED_REQUEST_ENVELOPE',evidence:[],network_calls:0};
 const tokenSchedule=routeBlock.results.TOKEN_SCHEDULE||(exactCapability?noRoute('OFFICIAL_TOKEN_SCHEDULE','NO_EXACT_STRUCTURED_TOKEN_SCHEDULE_ROUTE_IN_REGISTRY'):{status:'STRUCTURED_TOKEN_SCHEDULE_REQUIRED',network_calls:0,evidence:[],check_completed:false,internal_only:true});
 const statuses=[wikimedia?.status,coinmetrics?.status,delta?.status,tokenSchedule?.status,cgSector?.status,largeTrades?.status,sector?.status,htx?.status,htxAnnouncements?.status,deribit?.status,chainSupply?.status,chainEvents?.status,bluesky?.status,official?.status,gdelt?.status,blockscout?.status],closed=statuses.some(value=>value==='CLOSED'||value==='CLOSED_BOUNDED_SAMPLE'||value==='CLOSED_BOUNDED_HTX_ANNOUNCEMENT_CHECK');
 // Generic news cannot close vesting. Only the exact primary-document adapter
 // may close N01; its static terms are not an observed future unlock transfer.
 evidence.push(...(tokenSchedule.evidence||[]),...(wikimedia.evidence||[]),...(htxAnnouncements.evidence||[]));
 const comparison=chainSupply?.status==='CLOSED'&&chainSupply?.evidence?.some(r=>['SUPPLY_DECREASE','SUPPLY_INCREASE','SUPPLY_UNCHANGED','SUPPLY_REDUCTION_CHECK'].includes(r.metric_family))?{...chainSupply,check_completed:chainSupply.network_calls>0,scope:chainName==='cardano'?'EXACT_TWO_CLOSED_CARDANO_EPOCHS':'EXACT_FINALIZED_SUPPLY_COMPARISON',transfer_cause_verified:false}:{status:'TWO_FINALIZED_SUPPLY_OBSERVATIONS_REQUIRED',network_calls:0,evidence:[]};
 const sources={WIKIMEDIA_ATTENTION:wikimedia,COINMETRICS_SUPPLY:coinmetrics,COINGECKO_SECTOR:cgSector,HTX_LARGE_TRADES:largeTrades,COINPAPRIKA_SECTOR:sector,HTX_PUBLIC_RISK:htx,HTX_OFFICIAL_ANNOUNCEMENTS:htxAnnouncements,DERIBIT_ALT_OPTIONS:deribit,DELTA_OPTIONS:delta,CHAIN_SUPPLY:chainSupply,CHAIN_SUPPLY_COMPARISON:comparison,CHAIN_EVENTS:chainEvents,BLUESKY_PUBLIC:bluesky,OFFICIAL_EVENTS:official,OFFICIAL_TOKEN_SCHEDULE:tokenSchedule,GDELT_NEWS_DISCOVERY:gdelt,BLOCKSCOUT_INDEX:blockscout,NANSEN_FLOWS:nansen};
 // Fix the decision clock only after every asynchronous collector returns.
 // Responses received after params.now must not be rejected as future-known.
 const auditDecisionTs=Date.now();
 const healthRows=Object.entries(sources).map(([source_id,r])=>{
  const rows=Array.isArray(r?.evidence)?r.evidence:[],valid=rows.filter(row=>validateEvidenceV2(row,{decision_ts:auditDecisionTs}).usable),status=String(r?.status||'NOT_EVALUATED');
  const operational_class=classifyEvidenceSourceHealth(r,valid.length);
  return{source_id,status,actual_http:Number(r?.network_calls||0),operational_class,evidence_rows:rows.length,valid_rows:valid.length,decision_usable_rows:valid.filter(x=>Number(x.coverage_fraction)>0).length};
 });
 const source_health=await recordEvidenceSourceHealth(params.db,{contract:params.contract,run_id:params.run_id,observations:healthRows,admit:params.source_health_admit,now:params.now??Date.now()});
 const block_coverage=auditCandidateBlocks({evidence,sources,decision_ts:auditDecisionTs,strict_fresh:params?.strict_fresh_manual===true});
 return{
  version:CANDIDATE_EVIDENCE_V2_RUNTIME_VERSION,
  status:closed?'CLOSED':statuses.find(Boolean)||'NOT_CLOSED',
  evidence,
  network_calls:Number(coinmetrics.network_calls||0)+Number(delta.network_calls||0)+Number(cgSector.network_calls||0)+Number(largeTrades.network_calls||0)+Number(sector.network_calls||0)+Number(htx?.network_calls||0)+Number(htxAnnouncements?.network_calls||0)+Number(deribit?.network_calls||0)+Number(chainSupply?.network_calls||0)+Number(chainEvents?.network_calls||0)+Number(bluesky?.network_calls||0)+Number(official?.network_calls||0)+Number(gdelt?.network_calls||0)+Number(blockscout?.network_calls||0),
  cache_status:[coinmetrics.cache_status,delta.cache_status,cgSector.cache_status,largeTrades.cache_status,sector.cache_status,htx?.cache_status,htxAnnouncements?.cache_status,deribit?.cache_status,chainSupply?.cache_status,chainEvents?.cache_status,bluesky?.cache_status,official?.cache_status,gdelt?.cache_status,blockscout?.cache_status].filter(Boolean).join('+')||null,
  whole_job_admission:{status:[coinmetrics?.whole_job_admission?.status,delta?.whole_job_admission?.status,htx?.whole_job_admission?.status,htxAnnouncements?.whole_job_admission?.status,deribit?.whole_job_admission?.status,chainSupply?.whole_job_admission?.status,chainEvents?.whole_job_admission?.status,bluesky?.whole_job_admission?.status,official?.whole_job_admission?.status,gdelt?.whole_job_admission?.status,blockscout?.whole_job_admission?.status].filter(Boolean).join('+')||null},
  admission:{status:[coinmetrics?.admission?.status,delta?.admission?.status,htx?.admission?.status,htxAnnouncements?.admission?.status,deribit?.admission?.status,chainSupply?.admission?.status,chainEvents?.admission?.status,bluesky?.admission?.status,official?.admission?.status,gdelt?.admission?.status,blockscout?.admission?.status].filter(Boolean).join('+')||null},
  receipts:[
   ...(coinmetrics.receipts||[]).map(row=>({...row,source:'COINMETRICS_SUPPLY'})),
   ...(delta.receipts||[]).map(row=>({...row,source:'DELTA_OPTIONS'})),
   ...(cgSector.receipts||[]).map(row=>({...row,source:'COINGECKO_SECTOR'})),
   ...(largeTrades.receipts||[]).map(row=>({...row,source:'HTX_LARGE_TRADES'})),
   ...(sector.receipts||[]).map(row=>({...row,source:'COINPAPRIKA_SECTOR'})),
   ...(htx?.receipts||[]).map(row=>({...row,source:'HTX_PUBLIC_RISK'})),
   ...(deribit?.receipts||[]).map(row=>({...row,source:'DERIBIT_ALT_OPTIONS'})),
   ...(chainSupply?.receipts||[]).map(row=>({...row,source:'CHAIN_SUPPLY'})),
   ...(chainEvents?.receipts||[]).map(row=>({...row,source:'CHAIN_EVENTS'})),
   ...(bluesky?.receipts||[]).map(row=>({...row,source:'BLUESKY_PUBLIC'})),
   ...(wikimedia?.receipts||[]).map(row=>({...row,source:'WIKIMEDIA_ATTENTION'})),
   ...(official?.receipts||[]).map(row=>({...row,source:'OFFICIAL_EVENTS'})),
   ...(gdelt?.receipts||[]).map(row=>({...row,source:'GDELT_NEWS_DISCOVERY'})),
   ...(blockscout?.receipts||[]).map(row=>({...row,source:'BLOCKSCOUT_INDEX'})),
  ],
  sources,source_health,decision_ts:auditDecisionTs,route_accounting:[...core.receipts,...routeBlock.receipts],shared_http_envelope:{cap:evidenceCap,reserved_attempts:core.reserved_requests+routeBlock.reserved_requests,actual_http:core.network_calls+routeBlock.network_calls,unknown_reservations_not_released:true},role_policy:'UTILITY_PRIORITY_WITH_ALL_VALID_CACHES_AND_EXISTING_QUOTAS',route_priority:{tickets:EVIDENCE_ROUTE_PRIORITY,semantics:'OPERATIONAL_SCHEDULING_NOT_PREDICTIVE_WEIGHT',executed_order:routeBlock.receipts.map(row=>row.route)},block_coverage,
  strict_fresh_required:params?.strict_fresh_manual===true,
  internal_only:true,
 };
}

export default{collectCandidateEvidenceV2,finalizeCandidateBlockCoverage,auditCandidateBlocks};
