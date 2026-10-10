import {resolveBlockCap,BLOCK_WEIGHT_VERSION} from './block-score-policy.mjs';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const BLOCKS=Object.freeze({
 N01:{family:'RISK_EVENTS',cap:.3,consumer:'SUPPORTING_RISK_RECHECK'},N02:{family:'ONCHAIN',cap:.3,consumer:'SUPPLY_RISK'},N03:{family:'ONCHAIN',cap:.3,consumer:'MONEY_FLOW_CONTEXT'},N04:{family:'ONCHAIN',cap:.3,consumer:'TRANSFER_INVESTIGATION'},N05:{family:'ONCHAIN',cap:.5,consumer:'MARKET_FLOW_CONFIRMATION'},N06:{family:'MARKET_DEMAND',cap:.2,consumer:'EARLY_INTEREST_PRIORITY'},N07:{family:'RISK_EVENTS',cap:.2,consumer:'OFFICIAL_EVENT_RISK'},N08:{family:'RISK_EVENTS',cap:.2,consumer:'EXECUTION_GATE'},N09:{family:'RISK_EVENTS',cap:.2,consumer:'EXECUTION_ELIGIBILITY'},N10:{family:'TECHNICAL_EXISTING',cap:.2,consumer:'TARGET_PATH_INVALIDATION'},N11:{family:'MARKET_DEMAND',cap:.4,consumer:'EXECUTION_STRESS'},N12:{family:'MARKET_DEMAND',cap:.6,consumer:'MONEY_FLOW_DIAGNOSTIC'},N14:{family:'DERIVATIVES',cap:.3,consumer:'OPTIONS_RISK_CONTEXT'},N15:{family:'MARKET_DEMAND',cap:.6,consumer:'SECTOR_RELATIVE_STRENGTH'},N16:{family:'RISK_EVENTS',cap:.3,consumer:'EXECUTION_COST_GATE'},
});
export const CHAIN_CAPS=Object.freeze({DERIVATIVES:3.2,MARKET_DEMAND:3,ONCHAIN:2,RISK_EVENTS:1.8,TECHNICAL_EXISTING:.2});
// Owner 10.10.2026: historical rows remain readable; the paused block is no penalty.
export const PAUSED_BLOCKS=Object.freeze({N01:'OWNER_PAUSED_NO_QUALIFIED_INDEPENDENT_RELEASE_PAIR',N02:'OWNER_PAUSED_SUPPLY_BLOCK_EXCLUDED_FROM_BOTH_REPORT_CHAINS',N03:'OWNER_PAUSED_SUPPLY_REDUCTION_BLOCK_EXCLUDED_FROM_BOTH_REPORT_CHAINS'});
export const ACTIVE_BLOCK_IDS=Object.freeze(Object.keys(BLOCKS).filter(id=>!PAUSED_BLOCKS[id]));

export function validateEvidenceV2(row,{decision_ts=Infinity}={}){
  const required=['evidence_id','asset_id','htx_contract','block_id','metric_family','provider_id','upstream_id','dependency_group','observed_ts','source_ts','first_known_ts','expires_at','coverage_status','schema_version','validation_status','identity_status','finality_status'];
  if(required.some(key=>row?.[key]===null||row?.[key]===undefined||row?.[key]===''))return {usable:false,status:'SCHEMA_INVALID'};
  if(!BLOCKS[row.block_id])return {usable:false,status:'BLOCK_UNKNOWN'};
  const sourceTs=Number(row.source_ts),knownTs=Number(row.first_known_ts),expires=Number(row.expires_at),decision=Number(decision_ts);
  if(![sourceTs,knownTs,expires,decision].every(Number.isFinite))return {usable:false,status:'EVIDENCE_TIME_INVALID'};
  if(row.validation_status!=='VALID')return {usable:false,status:`VALIDATION_${String(row.validation_status||'MISSING').toUpperCase()}`};
  if(row.identity_status!=='EXACT')return {usable:false,status:'IDENTITY_NOT_EXACT'};
  if(row.finality_status!=='FINAL')return {usable:false,status:'FINALITY_NOT_FINAL'};
  if(sourceTs>decision)return {usable:false,status:'SOURCE_TIME_AFTER_DECISION'};
  if(knownTs>decision)return {usable:false,status:'FIRST_KNOWN_AFTER_DECISION'};
  if(expires<decision)return {usable:false,status:'EVIDENCE_EXPIRED'};
  const coverage=Number(row.coverage_fraction);if(!Number.isFinite(coverage)||coverage<0||coverage>1)return {usable:false,status:'COVERAGE_INVALID'};
  return {usable:true,status:'VALID',quality:coverage*clamp(Number(row.reliability??.8),0,1)};
}

export function evidenceDedupKey(row){if(row.physical_root_key)return String(row.physical_root_key);if(row.chain&&row.tx_hash&&row.log_index!==undefined)return `${row.chain}|${row.tx_hash}|${row.log_index}`;if(row.official_url&&row.event_type&&row.effective_at)return `${row.official_url}|${row.event_type}|${row.asset_id}|${row.effective_at}`;if(row.origin_event_id)return `${row.asset_id}|${row.origin_event_id}`;return `${row.upstream_id}|${row.evidence_id}`;}

export function consumeEvidenceV2(rows,{base_interest,decision_ts,base_evidence_ids=[],base_evidence_roots=[],weight_policy_version,adaptive_policy}={}){
  const seen=new Set(base_evidence_roots.map(String)),blockValues=new Map(),blockCaps=new Map(),receipts=[];
  for(const row of rows||[]){const validation=validateEvidenceV2(row,{decision_ts}),config=BLOCKS[row.block_id],key=evidenceDedupKey(row);let contribution=0,reason=validation.status;
    const capPolicy=resolveBlockCap(row,{decision_ts,weight_policy_version,adaptive_policy});
    if(PAUSED_BLOCKS[row.block_id]){reason='BLOCK_PAUSED_BY_OWNER';}
    else if(row.block_id==='N05'){reason='N05_JOINT_FLOW_UNCALIBRATED_CONTEXT_ONLY';}
    else if(validation.usable&&config&&!seen.has(key)&&!base_evidence_ids.includes(row.evidence_id)){seen.add(key);const hasDirectional=row.directional_strength!==null&&row.directional_strength!==undefined&&row.directional_strength!=='',strength=hasDirectional?clamp(Number(row.directional_strength),-1,1):-clamp(Number(row.risk_strength??0),0,1),raw=capPolicy.cap*validation.quality*strength;contribution=clamp(raw,-capPolicy.cap,capPolicy.cap);blockValues.set(row.block_id,(blockValues.get(row.block_id)||0)+contribution);blockCaps.set(row.block_id,Math.max(blockCaps.get(row.block_id)||0,capPolicy.cap));reason='CONSUMED';}
    else if(seen.has(key))reason='DUPLICATE_UPSTREAM_EVENT';else if(base_evidence_ids.includes(row.evidence_id))reason='ALREADY_OWNED_BY_BASE_SCORER';
    receipts.push({evidence_id:row.evidence_id,block_id:row.block_id,family:config?.family||null,consumer:config?.consumer||null,physical_root_key:key,raw_contribution:contribution,reason,block_weight:capPolicy});
  }
  const blockContributions={},families=new Map();for(const [block,value] of blockValues){const config=BLOCKS[block],cap=blockCaps.get(block)||config.cap,capped=clamp(value,-cap,cap);blockContributions[block]=capped;families.set(config.family,(families.get(config.family)||0)+capped);}
  const capped={};for(const [family,value] of families)capped[family]=clamp(value,-CHAIN_CAPS[family],CHAIN_CAPS[family]);const adjustment=clamp(Object.values(capped).reduce((a,b)=>a+b,0),-10,10),base=Number(base_interest);
  return {status:Number.isFinite(base)?'CLOSED':'NOT_CLOSED',base_interest:Number.isFinite(base)?base:null,block_contributions:blockContributions,family_contributions:capped,adjustment,final_interest:Number.isFinite(base)?clamp(base+adjustment,0,100):null,receipts,weights_version:receipts.some(r=>r.block_weight.version===BLOCK_WEIGHT_VERSION)?BLOCK_WEIGHT_VERSION:'INITIAL_32_30_20_18_FACTOR_1',threshold_unchanged:70,family_caps_unchanged:true};
}

export function buildHotlist({active_publications=[],manual_contract=null,pending=[]}={}){const map=new Map();for(const row of active_publications)map.set(row.contract,{...row,tier:0});if(manual_contract)map.set(manual_contract,{contract:manual_contract,last_checked_ts:0,tier:1});for(const row of pending)if(!map.has(row.contract))map.set(row.contract,{...row,tier:2});return [...map.values()].sort((a,b)=>a.tier-b.tier||(a.last_checked_ts??0)-(b.last_checked_ts??0)||String(a.contract).localeCompare(String(b.contract))).slice(0,12);}

export function nextSourceQuality({current=.8,attempted,response_usable,invalid_streak=0,probe_success_streak=0}={}){if(!attempted)return {quality:current,quarantined:invalid_streak>=3,invalid_streak,probe_success_streak};const quality=.9*current+.1*(response_usable?1:0),nextInvalid=response_usable?0:invalid_streak+1,nextProbe=response_usable?probe_success_streak+1:0;return {quality,quarantined:nextInvalid>=3&&nextProbe<5,invalid_streak:nextInvalid,probe_success_streak:nextProbe};}
