// UNEXECUTED offline companion; no integration, provider, SQL, clock or send.
import {hash,TIMEFRAMES} from '../observer/observer.mjs';
const cohorts=new Set(['CONTROLLED','RETAINED','DECLARED_PROSPECTIVE']);
const stamp=x=>Number.isSafeInteger(x)&&x>=1e12;
const label=x=>typeof x==='string'&&x.trim().length>0;
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const fields=['open','high','low','close','volume'];
function decimal(x){
 if(typeof x!=='string'||x.length>128||!/^[-+]?\d+(?:\.\d+)?$/.test(x))return null;
 const negative=x[0]==='-';x=x.replace(/^[-+]/,'');let [whole,fraction='']=x.split('.');
 whole=whole.replace(/^0+(?=\d)/,'');fraction=fraction.replace(/0+$/,'');
 const n=whole+(fraction?'.'+fraction:'');return n==='0'?'0':negative?'-'+n:n;
}
function cmp(a,b){
 const [aw,af='']=a.split('.'),[bw,bf='']=b.split('.');
 if(aw.length!==bw.length)return aw.length<bw.length?-1:1;
 const x=aw+af.padEnd(Math.max(af.length,bf.length),'0'),y=bw+bf.padEnd(Math.max(af.length,bf.length),'0');
 return x===y?0:x<y?-1:1;
}
function boundFact(a){
 const i=a.instrument,c=a.candle;
 if(!i||!['asset_id','venue','upstream','contract','quote','price_unit','volume_unit','native_epoch','binding_ref'].every(k=>label(i[k]))||i.asset_id!==a.asset_id||i.upstream!==a.upstream||i.identity_verified!==true||!['FUTURES','SPOT'].includes(i.market)||!['VERIFIED_NATIVE','CHAIN_ADDRESS'].includes(i.binding_kind))return {issue:'DECLARED_INSTRUMENT_EPOCH_OR_UNITS_MISSING'};
 if(i.binding_kind==='CHAIN_ADDRESS'&&(!label(i.chain)||!label(i.address)))return {issue:'CHAIN_BINDING_MISSING'};
 const multiplier=decimal(i.multiplier_decimal);
 if(multiplier===null||multiplier==='0'||multiplier[0]==='-')return {issue:'EXACT_MULTIPLIER_LEXEME_MISSING'};
 const d=c&&TIMEFRAMES[c.timeframe],offset=c?.alignment_offset_ms;
 if(!d||!Number.isSafeInteger(offset)||offset<0||offset>=d||!stamp(c.start_ts)||c.end_ts!==c.start_ts+d||(c.start_ts-offset)%d!==0||!label(a.raw_row_ref))return {issue:'EXPLICIT_CLOSED_WINDOW_OR_ROW_POINTER_MISSING'};
 if(!stamp(a.body_completed_ts))return {issue:'BODY_COMPLETION_UNKNOWN'};
 if(!stamp(a.source_ts)||!stamp(a.available_at)||!stamp(a.decision_ts)||c.end_ts>a.source_ts||a.source_ts>a.body_completed_ts||a.body_completed_ts>a.available_at||a.available_at>a.decision_ts)return {issue:'NOT_KNOWN_BY_DECISION_OR_CLOSED_SOURCE_CLOCK'};
 const v=Object.fromEntries(fields.map(k=>[k,decimal(c.numeric_lexemes?.[k])]));
 if(fields.some(k=>v[k]===null||v[k][0]==='-'||k!=='volume'&&v[k]==='0'))return {issue:'EXACT_DECIMAL_OHLCV_INVALID'};
 if(cmp(v.low,v.high)>0||cmp(v.low,v.open)>0||cmp(v.low,v.close)>0||cmp(v.high,v.open)<0||cmp(v.high,v.close)<0)return {issue:'EXACT_DECIMAL_OHLC_GEOMETRY_INVALID'};
 const instrument={asset_id:i.asset_id,market:i.market,venue:i.venue,upstream:i.upstream,contract:i.contract,quote:i.quote,price_unit:i.price_unit,volume_unit:i.volume_unit,native_epoch:i.native_epoch,multiplier_decimal:multiplier,...(i.binding_kind==='CHAIN_ADDRESS'?{chain:i.chain,address:i.address}:{})};
 const window={timeframe:c.timeframe,alignment_offset_ms:offset,start_ts:c.start_ts,end_ts:c.end_ts};
 return {cohort:a.cohort,upstream:a.upstream,key:hash({cohort:a.cohort,instrument,window}),value_hash:hash(v),instrument,window,values:v};
}

export function summarizeCandleSourceUtility(attempts=[]){
 if(!Array.isArray(attempts)||attempts.length>20000)throw Error('BOUNDED_ATTEMPTS_REQUIRED');
 const groups=new Map(),attemptGroups=new Map(),costs=new Map(),facts=new Map(),unboundCosts=new Set(),invalidReasons={},attemptConflicts=[];
 const reason=x=>{invalidReasons[x]=(invalidReasons[x]??0)+1;};
 const group=(cohort,upstream)=>{
  const key=hash({cohort,upstream});if(!groups.has(key))groups.set(key,{cohort,upstream,acquisitions:new Set(),roles:new Map()});return groups.get(key);
 };
 let invalidRows=0,replays=0,conflictingAttempts=0;
 // Acquisition accounting is independent of whether a fact/attempt is usable.
 for(const a of attempts){
  const scope=a&&cohorts.has(a.cohort)&&label(a.upstream),cost=a?.acquisition;
  const costShape=scope&&cost&&label(cost.acquisition_id)&&['MEASURED','UNKNOWN','NOT_ATTEMPTED'].includes(cost.cost_status)&&label(cost.cost_proof_ref)&&hex(cost.cost_proof_sha256);
  const valueShape=costShape&&(cost.cost_status==='MEASURED'?Number.isSafeInteger(cost.http_requests)&&cost.http_requests>=0:cost.cost_status==='UNKNOWN'?cost.http_requests===null:cost.http_requests===0&&a.status==='NOT_ATTEMPTED_ADMISSION');
  const compatible=valueShape&&(a.status!=='NOT_ATTEMPTED_ADMISSION'||cost.cost_status==='NOT_ATTEMPTED');
  if(!compatible)unboundCosts.add(hash(a??null));
  else{
   const g=group(a.cohort,a.upstream),key=hash({cohort:a.cohort,upstream:a.upstream,acquisition_id:cost.acquisition_id});g.acquisitions.add(key);
   if(!costs.has(key))costs.set(key,{acquisition_id:cost.acquisition_id,claims:new Map(),proofs:new Map()});
   const r=costs.get(key);r.claims.set(hash({status:cost.cost_status,http:cost.http_requests}),{status:cost.cost_status,http:cost.http_requests});const proof={ref:cost.cost_proof_ref,sha256:cost.cost_proof_sha256};r.proofs.set(hash(proof),proof);
  }
  if(!scope||!label(a.attempt_id)){invalidRows++;reason('ATTEMPT_SCOPE_OR_ID_INVALID');continue;}
  const key=hash({cohort:a.cohort,upstream:a.upstream,attempt_id:a.attempt_id});if(!attemptGroups.has(key))attemptGroups.set(key,new Map());
  const variants=attemptGroups.get(key),digest=hash(a),old=variants.get(digest);if(old)old.count++;else variants.set(digest,{a,count:1});
 }
 for(const [attempt_key,variants] of attemptGroups){
  for(const v of variants.values())replays+=v.count-1;
  if(variants.size!==1){conflictingAttempts++;const a=variants.values().next().value.a;attemptConflicts.push({attempt_key,cohort:a.cohort,upstream:a.upstream,attempt_id:a.attempt_id,variant_sha256:[...variants.keys()].sort()});continue;}
  const a=variants.values().next().value.a;
  if(!['FACT','EMPTY','ERROR','PARTIAL','NOT_ATTEMPTED_ADMISSION'].includes(a.status)||!['exact_identity','fresh','numeric','consumer_used'].every(k=>typeof a[k]==='boolean')||!label(a.source_id)||!label(a.asset_id)||!label(a.role)||!stamp(a.decision_ts)||!hex(a.raw_sha256)||!label(a.raw_ref)||a.status==='NOT_ATTEMPTED_ADMISSION'&&a.consumer_used){invalidRows++;reason('ATTEMPT_SHAPE_INVALID');continue;}
  const g=group(a.cohort,a.upstream);if(!g.roles.has(a.role))g.roles.set(a.role,{role:a.role,sources:new Set(),attempts:0,admission_deferred:0,status_counts:{},ineligible_reasons:{},usable_attempts:[],declared_consumer_uses:0});
  const r=g.roles.get(a.role);r.sources.add(a.source_id);r.status_counts[a.status]=(r.status_counts[a.status]??0)+1;
  if(a.status==='NOT_ATTEMPTED_ADMISSION')r.admission_deferred++;else r.attempts++;
  if(a.consumer_used)r.declared_consumer_uses++;
  if(a.status!=='FACT')continue;
  const issue=!a.exact_identity?'IDENTITY_NOT_DECLARED_EXACT':!a.fresh?'NOT_FRESH':!a.numeric?'NOT_NUMERIC':null;
  const f=issue?{issue}:boundFact(a);
  if(f.issue){r.ineligible_reasons[f.issue]=(r.ineligible_reasons[f.issue]??0)+1;continue;}
  r.usable_attempts.push({fact_key:f.key,consumer_used:a.consumer_used});
  if(!facts.has(f.key))facts.set(f.key,{...f,variants:new Map(),proofs:new Map(),source_ids:new Set(),available:[]});
  const v=facts.get(f.key);v.variants.set(f.value_hash,f.values);v.source_ids.add(a.source_id);v.available.push(a.available_at);
  const proof={raw_ref:a.raw_ref,raw_sha256:a.raw_sha256,raw_row_ref:a.raw_row_ref,source_ts:a.source_ts,body_completed_ts:a.body_completed_ts,available_at:a.available_at,decision_ts:a.decision_ts};v.proofs.set(hash(proof),proof);
 }
 const reports=[];
 for(const g of groups.values()){
  let lower=0n,unknown=0,conflict=0,notAttempted=0;const acquisitions=[];
  for(const key of [...g.acquisitions].sort()){
   const r=costs.get(key),claims=[...r.claims.values()];let status,http=null;
   if(claims.length!==1){status='CONFLICTING_COST_CLAIMS';conflict++;}
   else if(claims[0].status==='UNKNOWN'){status='UNKNOWN';unknown++;}
   else if(claims[0].status==='NOT_ATTEMPTED'){status='NOT_ATTEMPTED';notAttempted++;http=0;}
   else{status='MEASURED';http=claims[0].http;lower+=BigInt(http);}
   acquisitions.push({acquisition_id:r.acquisition_id,status,http_requests:http,cost_proof_variant_count:r.proofs.size,cost_proofs:[...r.proofs.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,p])=>p)});
  }
  const safe=lower<=BigInt(Number.MAX_SAFE_INTEGER),costComplete=unknown===0&&conflict===0&&unboundCosts.size===0&&safe;
  const roleReports=[],allFacts=new Set();
  for(const r of [...g.roles.values()].sort((a,b)=>a.role<b.role?-1:a.role>b.role?1:0)){
   const usable=r.usable_attempts.filter(x=>facts.get(x.fact_key).variants.size===1),keys=new Set(usable.map(x=>x.fact_key)),bad=new Set(r.usable_attempts.filter(x=>facts.get(x.fact_key).variants.size>1).map(x=>x.fact_key));for(const k of keys)allFacts.add(k);
   roleReports.push({role:r.role,sources:[...r.sources].sort(),attempts:r.attempts,admission_deferred:r.admission_deferred,status_counts:r.status_counts,ineligible_reasons:r.ineligible_reasons,usable_attempts:usable.length,declared_consumer_uses:r.declared_consumer_uses,usable_consumer_uses:usable.filter(x=>x.consumer_used).length,distinct_bound_candles:keys.size,censored_conflicting_candles:bad.size,attempts_with_conflicting_candle:r.usable_attempts.length-usable.length});
  }
  reports.push({cohort:g.cohort,upstream:g.upstream,roles:roleReports,acquisitions,distinct_bound_candles_across_roles:allFacts.size,known_HTTP_lower_bound_decimal:String(lower),known_HTTP_number_safe:safe,unknown_acquisitions:unknown,conflicting_cost_acquisitions:conflict,not_attempted_acquisitions:notAttempted,cost_scope_complete:costComplete,total_HTTP:costComplete?Number(lower):null,distinct_candles_per_HTTP:costComplete&&lower>0n?allFacts.size/Number(lower):null,role_cost_attribution:null});
 }
 reports.sort((a,b)=>a.cohort<b.cohort?-1:a.cohort>b.cohort?1:a.upstream<b.upstream?-1:a.upstream>b.upstream?1:0);
 const ledger=[...facts.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,f])=>({fact_key:key,cohort:f.cohort,upstream:f.upstream,instrument:f.instrument,window:f.window,status:f.variants.size===1?'SINGLE_DECLARED_NUMERIC_FACT':'CENSORED_NUMERIC_REVISIONS',numeric_variants:[...f.variants.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([value_hash,values])=>({value_hash,values})),proof_variants:[...f.proofs.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,p])=>p),source_ids:[...f.source_ids].sort(),earliest_declared_available_at:Math.min(...f.available),native_original_first_detection_ts:null}));
 return{schema:'ANOMALY_BOUND_CANDLE_SOURCE_UTILITY_V1',reports,facts:ledger,invalid_rows:invalidRows,invalid_row_reasons:invalidReasons,identical_attempt_replays:replays,conflicting_attempts:conflictingAttempts,conflicting_attempt_refs:attemptConflicts.sort((a,b)=>a.attempt_key<b.attempt_key?-1:a.attempt_key>b.attempt_key?1:0),unbound_cost_claims:unboundCosts.size,unbound_cost_claim_digests:[...unboundCosts].sort(),global_HTTP_total_across_cohorts:null,predictive_accuracy:null,causal_incremental_value:null,independent_sample_count:null,weights_changed:false,native_identity_or_cost_authentication:false,native_commit_ACK_qualified:false,activation_allowed:false,limitations:['Declared exact instrument epoch, clocks, numeric facts and cost proofs are NOT native authentication','Cohorts must not be pooled; role counts share candles and acquisitions','Raw metadata/receipt/locator variants are not independent numeric facts','Unknown or conflicting cost is not zero; malformed facts cannot erase acquisition cost','No provider calls, event admission, source weights, MAIN or Telegram integration']};
}
