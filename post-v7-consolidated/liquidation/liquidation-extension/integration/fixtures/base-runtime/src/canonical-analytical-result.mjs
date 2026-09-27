import crypto from 'node:crypto';
export const CANONICAL_ANALYTICAL_RESULT_VERSION='canonical-analytical-result-v1-20260924';
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const text=v=>v===null||v===undefined?null:(String(v).trim()||null);
const stamp=v=>Number.isSafeInteger(Number(v))&&Number(v)>=1_000_000_000_000?Number(v):null;
const arr=v=>Array.isArray(v)?v:[];
function score(v){const n=finite(v);return n!==null&&n>=0&&n<=100?Math.round(n*10)/10:null;}
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object'){return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]))}return v;}
export function canonicalFingerprint(result){return crypto.createHash('sha256').update(JSON.stringify(stable(result))).digest('hex');}
export function buildCanonicalAnalyticalResult({
 snapshot_id,run_id,observed_ts,universe=[],candidates=[],source_receipts=[],hard_gates=[],state='OBSERVE',direction=null,
 overall_score_0_100=null,coin_interest_score_0_100=null,entry_readiness_score_0_100=null,reasons=[],current_price=null,entry=null,trigger=null,invalidation=null,targets=[],costs=null,
 early_candidate=null,opportunity=null,microstructure=null,liquidations=null,data_quality=null,free_sources=null,changes_from_previous=[],metadata={},
}={}){
 const ts=stamp(observed_ts);const snap=text(snapshot_id);const run=text(run_id);
 const allowedStates=new Set(['ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED','WAIT_FOR_TRIGGER','OBSERVE','REJECTED']);
 if(!snap||!run||ts===null||!allowedStates.has(state))return{version:CANONICAL_ANALYTICAL_RESULT_VERSION,status:'NOT_CLOSED',reason:'CANONICAL_IDENTITY_OR_STATE_INVALID',snapshot_id:snap,run_id:run,observed_ts:ts};
 const d=['LONG','SHORT'].includes(String(direction||'').toUpperCase())?String(direction).toUpperCase():null;
 const result={
   version:CANONICAL_ANALYTICAL_RESULT_VERSION,status:'CLOSED',snapshot_id:snap,run_id:run,observed_ts:ts,snapshot_time_utc:new Date(ts).toISOString(),
   universe:arr(universe),candidates:arr(candidates),state,direction:d,
   scores:{overall_0_100:score(overall_score_0_100),coin_interest_0_100:score(coin_interest_score_0_100),entry_readiness_0_100:score(entry_readiness_score_0_100),is_probability:false},
   reasons:arr(reasons).filter(Boolean),source_receipts:arr(source_receipts),hard_gates:arr(hard_gates),current_price:finite(current_price),
   entry:entry??null,trigger:trigger??null,invalidation:invalidation??null,targets:arr(targets),costs:costs??null,
   early_candidate:early_candidate??null,opportunity:opportunity??null,microstructure:microstructure??null,liquidations:liquidations??null,data_quality:data_quality??null,free_sources:free_sources??null,
   changes_from_previous:arr(changes_from_previous),metadata:metadata&&typeof metadata==='object'?metadata:{},
   safety:{strategy_weights_changed:false,hard_gates_bypassed:false,automatic_execution:false,validated_signal:state==='ENTRY_NOW_VALIDATED'},
 };
 result.analytical_fingerprint=canonicalFingerprint({...result,analytical_fingerprint:undefined});
 return result;
}
export function canonicalParity(left,right){
 if(left?.status!=='CLOSED'||right?.status!=='CLOSED')return{status:'NOT_CLOSED',equal:false};
 if(left.snapshot_id!==right.snapshot_id||left.run_id!==right.run_id)return{status:'DIFFERENT_SNAPSHOT_OR_RUN',equal:false};
 const keys=['universe','candidates','state','direction','scores','reasons','source_receipts','hard_gates','entry','trigger','invalidation','targets','early_candidate','opportunity','microstructure','liquidations','data_quality','free_sources'];
 const mismatches=keys.filter(k=>JSON.stringify(stable(left[k]))!==JSON.stringify(stable(right[k])));
 return{status:mismatches.length?'MISMATCH':'CLOSED',equal:mismatches.length===0,mismatches};
}
export default{CANONICAL_ANALYTICAL_RESULT_VERSION,buildCanonicalAnalyticalResult,canonicalFingerprint,canonicalParity};
