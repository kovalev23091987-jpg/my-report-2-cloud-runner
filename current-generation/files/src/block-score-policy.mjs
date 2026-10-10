import {createHash} from 'node:crypto';

export const BLOCK_WEIGHT_CUTOVER=Date.parse('2026-10-07T06:22:59Z');
export const BLOCK_WEIGHT_VERSION='OWNER_USEFUL_BLOCK_CAPS_V1_20261007';
export const LEGACY_BLOCK_CAPS=Object.freeze({N01:.3,N02:.3,N03:.3,N04:.3,N05:.5,N06:.2,N07:.2,N08:.2,N09:.2,N10:.2,N11:.4,N12:.6,N14:.3,N15:.6,N16:.3});
// Initial engineering allocation, not empirically fitted performance. Strong
// observations can use more of the SAME family envelope. Weak samples retain
// their old cap; control/context-only rows never acquire a directional sign.
export const INITIAL_BLOCK_CAPS=Object.freeze({N01:.6,N02:.6,N03:.8,N04:.8,N05:1.5,N06:.5,N07:.6,N08:.2,N09:.2,N10:.2,N11:1.2,N12:1.5,N14:.8,N15:2,N16:.3});
export const NON_ADAPTIVE_BLOCKS=Object.freeze(['N08','N09','N10','N16']);
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])])):v;
export const blockPolicyDigest=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
export function validBlockWeightPolicy(policy,now){
 if(!policy||policy.schema!=='BLOCK_PREDICTIVE_WEIGHT_POLICY_V1'||policy.weight_version!==BLOCK_WEIGHT_VERSION||!Number.isSafeInteger(now)||!Number.isSafeInteger(policy.generated_ts)||policy.generated_ts>now||!Number.isSafeInteger(policy.expires_ts)||policy.expires_ts<now||policy.expires_ts-policy.generated_ts>8*86400000||policy.family_caps_changed!==false||policy.threshold_or_entry_rules_changed!==false)return false;
 const {fingerprint,cache_status,network_calls,...body}=policy;if(fingerprint!==blockPolicyDigest(body))return false;
 return Object.entries(policy.blocks||{}).every(([id,r])=>Object.hasOwn(INITIAL_BLOCK_CAPS,id)&&Number.isFinite(r.factor)&&r.factor>=.75&&r.factor<=1.25&&(r.factor===1||!NON_ADAPTIVE_BLOCKS.includes(id)&&r.status==='VALIDATED_LATER_SAMPLE_PREDICTIVE_ASSOCIATION'&&Number.isSafeInteger(r.last_validated_ts)&&r.last_validated_ts<=now&&now-r.last_validated_ts<=35*86400000&&r.independent_samples>=200&&r.calendar_days>=30&&r.assets>=20&&r.long>=50&&r.short>=50&&r.validation_count>=40&&r.test_count>=40&&r.validation_confidence_closed===true&&r.test_confidence_closed===true));
}
export function resolveBlockCap(row,{decision_ts,weight_policy_version,adaptive_policy}={}){
 if(row?.block_id==='N01')return{cap:0,initial_cap:0,factor:1,version:BLOCK_WEIGHT_VERSION,status:'BLOCK_PAUSED_BY_OWNER',policy_fingerprint:null};
 const legacy=LEGACY_BLOCK_CAPS[row?.block_id];
 const current=weight_policy_version===BLOCK_WEIGHT_VERSION||weight_policy_version!== 'LEGACY'&&Number.isFinite(decision_ts)&&decision_ts>=BLOCK_WEIGHT_CUTOVER;
 const coverage=Number(row?.coverage_fraction),reliability=Number(row?.reliability??.8);
 const eligible=current&&coverage>=.5&&coverage<=1&&Number.isFinite(reliability)&&reliability>=.7&&reliability<=1;
 const adaptive=eligible&&validBlockWeightPolicy(adaptive_policy,decision_ts),factor=adaptive?(adaptive_policy.blocks?.[row.block_id]?.factor??1):1;
 return {cap:eligible?INITIAL_BLOCK_CAPS[row.block_id]*factor:legacy,initial_cap:eligible?INITIAL_BLOCK_CAPS[row.block_id]:legacy,factor,version:current?BLOCK_WEIGHT_VERSION:'INITIAL_32_30_20_18_FACTOR_1',status:!current?'LEGACY_ORIGINAL_CLOCK':!eligible?'WEAK_OR_PARTIAL_OBSERVATION_OLD_CAP':factor===1?'INITIAL_ALLOCATION_NOT_EMPIRICALLY_FITTED':'VALIDATED_PREDICTIVE_ADJUSTMENT',policy_fingerprint:adaptive?adaptive_policy.fingerprint:null};
}
