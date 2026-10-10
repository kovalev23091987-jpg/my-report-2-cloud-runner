import {canonicalFingerprint} from './canonical-publication.mjs';

// Shadow-only strategy criterion match, not the canonical interest/overall
// score, win probability, entry admission, Telegram selection, or a source vote.
export const STRATEGY_FIT_SHADOW_VERSION='OWNER_STRATEGY_FIT_SHADOW_V1_20261010';
export const STRATEGY_FIT_GROUP_WEIGHTS=Object.freeze({
 direction_and_independent_evidence:35,
 native_market_confirmation:30,
 entry_scenario_and_settlement:20,
 invalidation_risk_and_target:15
});
export const STRATEGY_FIT_FAMILY_WEIGHTS=Object.freeze(Object.fromEntries(Object.keys(STRATEGY_FIT_GROUP_WEIGHTS).map((k,i)=>[k,[32,30,20,18][i]])));
const status=v=>String(v??'').trim().toUpperCase();
const stamp=v=>Number.isSafeInteger(v)&&v>1_000_000_000_000;
const fail=(reason,details={})=>({version:STRATEGY_FIT_SHADOW_VERSION,status:'NOT_CLOSED',
 reason,match_score_0_100:null,canonical_score_unchanged:true,production_filter_unchanged:true,
 telegram_text_unchanged:true,telegram_send_allowed_by_this_score:false,entry_authorized:false,
 is_probability:false,sourceHTTP:0,D1:0,Telegram:0,project_complete:false,...details});
export function assessStrategyFitShadow({canonical,criteria,decision_ts,weight_model='PRIMARY_35_30_20_15'}={}) {
 if(canonical?.status!=='CLOSED'||!stamp(decision_ts)||decision_ts!==canonical.observed_ts||
    !canonical.run_id||!canonical.snapshot_id||!canonical.analytical_fingerprint||
    canonical.analytical_fingerprint!==canonicalFingerprint(canonical)||
    !['LONG','SHORT'].includes(canonical.direction)||canonical.scores?.is_probability!==false)
   return fail('EXACT_IMMUTABLE_CANONICAL_REQUIRED');
 const contract=canonical.metadata?.contract;
 if(typeof contract!=='string'||!contract.endsWith('-USDT')||
    !criteria||typeof criteria!=='object'||Array.isArray(criteria)||
    Object.keys(criteria).length!==4||
    Object.keys(criteria).some(k=>!Object.hasOwn(STRATEGY_FIT_GROUP_WEIGHTS,k)))
   return fail('FOUR_DECLARED_STRATEGY_CRITERION_GROUPS_REQUIRED');
 if(!['PRIMARY_35_30_20_15','FAMILY_32_30_20_18'].includes(weight_model))return fail('DECLARED_WEIGHT_MODEL_REQUIRED');
 const weights=weight_model==='FAMILY_32_30_20_18'?STRATEGY_FIT_FAMILY_WEIGHTS:STRATEGY_FIT_GROUP_WEIGHTS;
 let score=0;const groups=[],usedRoots=new Set();
 for(const [group,weight] of Object.entries(weights)){
   const rows=criteria[group];
   if(!Array.isArray(rows)||rows.length<1||rows.length>8)
     return fail('NONEMPTY_BOUNDED_GROUP_REQUIRED',{failed_group:group});
   const seen=new Set();let earned=0;const receipts=[];
   for(const r of rows){
     if(!r||typeof r.id!=='string'||!/^[a-z][a-z0-9_]{2,64}$/.test(r.id)||seen.has(r.id)||
        !['VERIFIED','MISSING','CONTRADICTED','NOT_APPLICABLE'].includes(status(r.status))||
        r.contract!==contract||r.direction!==canonical.direction||
        r.run_id!==canonical.run_id||r.snapshot_id!==canonical.snapshot_id||
        r.analytical_fingerprint!==canonical.analytical_fingerprint)
       return fail('EXACT_STRATEGY_CRITERION_IDENTITY_REQUIRED',{failed_group:group});
     seen.add(r.id);
     const verified=status(r.status)==='VERIFIED';
     if(verified){
       if(!stamp(r.source_ts)||r.source_ts>decision_ts||
          !stamp(r.observed_ts)||r.observed_ts>decision_ts||
          r.source_ts>r.observed_ts||decision_ts-r.source_ts>Number(r.max_age_ms)||
          !Number.isSafeInteger(r.max_age_ms)||r.max_age_ms<=0||r.max_age_ms>86_400_000||
          typeof r.physical_root!=='string'||r.physical_root.length<8||usedRoots.has(r.physical_root))
         return fail('VERIFIED_CRITERION_CLOCK_OR_INDEPENDENCE_NOT_CLOSED',{failed_group:group,criterion:r.id});
       usedRoots.add(r.physical_root);earned++;
     }else if(r.physical_root!==null||r.source_ts!==null||r.observed_ts!==null)
       return fail('UNVERIFIED_CRITERION_CANNOT_CARRY_SOURCE_FACT',{failed_group:group,criterion:r.id});
     receipts.push({id:r.id,name:r.name??r.id,role:r.role??group,source:r.source??null,reason:r.reason??(verified?'VERIFIED':status(r.status)),observed_ts:verified?r.observed_ts:null,diagnostic_fact:r.diagnostic_fact??null,status:status(r.status),verified,source_ts:verified?r.source_ts:null,
       physical_root:verified?r.physical_root:null});
   }
   const applicable=receipts.filter(x=>x.status!=='NOT_APPLICABLE');
   if(!applicable.length)return fail('GROUP_WITHOUT_APPLICABLE_CRITERIA',{failed_group:group});
   for(const r of receipts)r.score_contribution=r.verified?Number((weight/applicable.length).toFixed(6)):0;
   const awarded=weight*earned/applicable.length;
   score+=awarded;
   groups.push({group,weight,applicable:applicable.length,verified:earned,
     awarded:Number(awarded.toFixed(6)),criteria:receipts});
 }
 const allVerified=groups.every(g=>g.applicable===g.verified);
 const result=Math.round(Math.min(100,Math.max(0,score)));
 return {version:STRATEGY_FIT_SHADOW_VERSION,status:'SHADOW_CRITERION_MATCH_COMPUTED',
   contract,direction:canonical.direction,run_id:canonical.run_id,snapshot_id:canonical.snapshot_id,
   fingerprint:canonical.analytical_fingerprint,decision_ts,match_score_0_100:allVerified?100:Math.min(99,result),
   all_applicable_criteria_verified:allVerified,weight_model,groups,
   score_semantics:'VERIFIED_STRATEGY_CRITERION_MATCH_NOT_WIN_PROBABILITY',
   canonical_overall_score_0_100:canonical.scores?.overall_0_100??null,
   canonical_coin_interest_score_0_100:canonical.scores?.coin_interest_0_100??null,
   canonical_score_unchanged:true,production_filter_unchanged:true,
   telegram_text_unchanged:true,telegram_send_allowed_by_this_score:false,
   entry_authorized:false,is_probability:false,sourceHTTP:0,D1:0,Telegram:0,project_complete:false};
}
