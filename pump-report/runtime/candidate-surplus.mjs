// Prepared optional policy. It never changes the frozen base allocation.
import {futureCandidateReserve} from './future-candidate-reserve.mjs';
const nat=n=>Number.isSafeInteger(n)&&n>=0;
const fail=code=>{throw Object.assign(Error(code),{code});};
export const SURPLUS_VERSION='pump-unassigned-candidate-hold-v1';
export function surplusPolicy(admission,mode){
  const p=admission?.candidate_surplus;
  if(mode!=='AUTO'||p?.enabled!==true)return null;
  if(p.version!==SURPLUS_VERSION||typeof p.activation_decision_ref!=='string'||!p.activation_decision_ref||
    !nat(p.max_grants_per_day)||p.max_grants_per_day<1||p.max_grants_per_day>24||p.max_grants_per_run!==1||
    p.max_retained_records!==200||!['requests','rows_read','rows_written'].every(k=>nat(p.native_remaining_floor?.[k])&&p.native_remaining_floor[k]>0))fail('SURPLUS_POLICY_UNQUALIFIED');
  return p;
}
export const surplusGrantKey=(run_id,candidate_id)=>{
  if(typeof run_id!=='string'||!run_id||run_id.length>128||typeof candidate_id!=='string'||!candidate_id||candidate_id.length>256)fail('SURPLUS_CANDIDATE_ID_REQUIRED');
  return run_id+'|'+candidate_id;
};
export function surplusGrants(state){
  const grants=state?.automatic_surplus_grants??{};
  if(!grants||Array.isArray(grants)||typeof grants!=='object'||Object.keys(grants).length>200)fail('SURPLUS_HOLD_STATE_UNQUALIFIED');
  for(const [key,g] of Object.entries(grants)){
    if(g?.version!==SURPLUS_VERSION||key!==surplusGrantKey(g.run_id,g.candidate_id)||!['OPEN','CLOSED','UNKNOWN'].includes(g.state)||
      !/^\d{4}-\d{2}-\d{2}$/.test(g.day??'')||!nat(g.created_ts)||new Date(g.created_ts).toISOString().slice(0,10)!==g.day||!nat(g.original_http)||g.original_http<1||!nat(g.remaining_http)||
      !nat(g.consumed_http)||g.remaining_http+g.consumed_http!==g.original_http||g.logical_spent!==true||
      !nat(g.native_expires_ts)||g.native_expires_ts<=g.created_ts||g.hold_until_ts!==Date.parse(g.day+'T00:00:00Z')+86400000||g.native_expires_ts>g.hold_until_ts||
      !g.original_by_provider||Object.values(g.original_by_provider).some(n=>!nat(n))||
      Object.values(g.original_by_provider).reduce((a,b)=>a+b,0)>g.original_http||
      !g.remaining_by_provider||!g.consumed_by_provider||Object.values(g.remaining_by_provider).some(n=>!nat(n))||
      JSON.stringify(Object.keys(g.original_by_provider).sort())!==JSON.stringify(Object.keys(g.remaining_by_provider).sort())||
      JSON.stringify(Object.keys(g.original_by_provider).sort())!==JSON.stringify(Object.keys(g.consumed_by_provider).sort())||
      Object.values(g.consumed_by_provider).some(n=>!nat(n))||Object.values(g.consumed_by_provider).reduce((a,b)=>a+b,0)!==g.consumed_http||
      Object.values(g.remaining_by_provider).reduce((a,b)=>a+b,0)>g.remaining_http||
      Object.entries(g.remaining_by_provider).some(([p,n])=>n+g.consumed_by_provider[p]!==g.original_by_provider[p]))fail('SURPLUS_HOLD_STATE_UNQUALIFIED');
  }
  return grants;
}
// CLOSED unused capacity remains held for the original day. It can no longer
// fund requests after the already admitted native run expires. UNKNOWN never
// expires here. Records and logical spent counts are retained in both cases.
export function surplusHeld(state,now,{exclude_grant_id=null,consume=null}={}){
  const day=new Date(now).toISOString().slice(0,10),month=day.slice(0,7),out={http:0,provider_day:{},provider_month:{}};
  for(const [key,g] of Object.entries(surplusGrants(state))){
    if(key===exclude_grant_id)continue;
    const dayHeld=g.state==='UNKNOWN'||g.day===day||g.state==='OPEN';
    const monthHeld=dayHeld||g.day.slice(0,7)===month&&now<g.hold_until_ts;
    let total=g.remaining_http,providers={...g.remaining_by_provider};
    if(consume?.grant_id===key){
      if(g.state!=='OPEN'||!nat(consume.cost)||consume.cost<1||total<consume.cost||(providers[consume.provider]??0)<consume.cost)fail('SURPLUS_HOLD_EXHAUSTED_OR_CLOSED');
      total-=consume.cost;providers[consume.provider]-=consume.cost;
    }
    if(dayHeld)out.http+=total;
    for(const [p,n] of Object.entries(providers)){if(dayHeld)out.provider_day[p]=(out.provider_day[p]??0)+n;if(monthHeld)out.provider_month[p]=(out.provider_month[p]??0)+n;}
  }
  return out;
}
export function surplusBaseExtra(state,now,admission){
  const day=new Date(now).toISOString().slice(0,10),grants=surplusGrants(state);
  if(admission.candidate_surplus?.enabled!==true&&!Object.values(grants).some(g=>g.day===day))return {http:0,http_by_provider:{}};
  const allocation=state.automatic_candidate_allocations?.[day];
  if(!allocation)return {http:0,http_by_provider:{}};
  if(!nat(allocation.candidates_per_period))fail('SURPLUS_BASE_ALLOCATION_UNQUALIFIED');
  const extra=Math.max(0,allocation.candidates_per_period-1),base=futureCandidateReserve(now,admission.future_candidates);
  return {http:base.http*extra,http_by_provider:Object.fromEntries(Object.entries(base.http_by_provider).map(([p,n])=>[p,n*extra]))};
}
export function surplusNativeCapacity(store,run_id,policy,now){
  const a=store?.admission,u=typeof store?.usage==='function'?store.usage():null,f=store?.finalization_reserve??{};
  if(typeof a?.evidence_ref!=='string'||!a.evidence_ref.endsWith('#PUMP:AUTO:'+run_id)||!nat(a.expires_ts)||a.expires_ts<now+120000||
    !u||u.unknown_ops!==0||!['requests','rows_read','rows_written'].every(k=>nat(u[k])))return {allowed:false,detail:'SURPLUS_NATIVE_ADMISSION_REQUIRED'};
  const maxima={requests:a.max_requests,rows_read:a.max_rows_read,rows_written:a.max_rows_written};
  if(!Object.entries(maxima).every(([k,n])=>nat(n)&&nat(f[k]??0)&&u[k]+policy.native_remaining_floor[k]+(f[k]??0)<=n))return {allowed:false,detail:'SURPLUS_NATIVE_CAPACITY_REQUIRED'};
  return {allowed:true,evidence_ref:a.evidence_ref,expires_ts:a.expires_ts};
}
export function makeSurplusGrant({state,run_id,candidate_id,policy,native,now,http_upper_bound,http_by_provider}){
  const key=surplusGrantKey(run_id,candidate_id),grants=surplusGrants(state),day=new Date(now).toISOString().slice(0,10),old=grants[key];
  if(old)return old.state==='OPEN'?{allowed:true,grant_id:key,grant:old,idempotent:true}:{allowed:false,detail:'SURPLUS_LOGICAL_GRANT_ALREADY_SPENT'};
  if(Object.keys(grants).length>=policy.max_retained_records||Object.values(grants).filter(g=>g.day===day).length>=policy.max_grants_per_day||
    Object.values(grants).some(g=>g.run_id===run_id))return {allowed:false,detail:'SURPLUS_LOGICAL_GRANT_LIMIT'};
  const until=Date.parse(day+'T00:00:00Z')+86400000;
  if(native.expires_ts>until)return {allowed:false,detail:'SURPLUS_NATIVE_DAY_BOUNDARY_REQUIRED'};
  const grant={version:SURPLUS_VERSION,run_id,candidate_id,day,state:'OPEN',created_ts:now,
    original_http:http_upper_bound,remaining_http:http_upper_bound,consumed_http:0,
    original_by_provider:{...http_by_provider},remaining_by_provider:{...http_by_provider},consumed_by_provider:Object.fromEntries(Object.keys(http_by_provider).map(p=>[p,0])),
    logical_spent:true,activation_decision_ref:policy.activation_decision_ref,
    native_evidence_ref:native.evidence_ref,native_expires_ts:native.expires_ts,hold_until_ts:until};
  return {allowed:true,grant_id:key,grant,idempotent:false};
}
