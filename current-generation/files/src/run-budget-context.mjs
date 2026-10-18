// Existing in-memory receipts only. This projection never admits work.
const count=x=>Number.isSafeInteger(x)&&x>=0?x:null;
const flag=x=>typeof x==='boolean'?x:null;
const label=x=>typeof x==='string'&&x.length>0&&x.length<=160?x:null;
const object=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:null;
const counters=x=>object(x)?Object.fromEntries(['requests','rows_read','rows_written','unknown_ops'].map(k=>[k,count(x[k])])):null;
function httpContext(value){
 if(!object(value))return null;
 const used=Object.fromEntries(['hot','background','statistics'].map(k=>[k,count(value.used?.[k])])),limits=Object.fromEntries(['whole_job','hot','background','statistics'].map(k=>[k,count(value.limits?.[k])]));
 const total=count(value.total),remaining=count(value.remaining),parts=Object.values(used),sum=parts.every(x=>x!==null)?parts.reduce((a,b)=>a+b,0):null;
 const valid=Number.isSafeInteger(sum)&&sum===total&&limits.whole_job!==null&&total<=limits.whole_job&&remaining===limits.whole_job-total&&Object.entries(used).every(([k,n])=>n!==null&&limits[k]!==null&&n<=limits[k]);
 return {basis:'RESERVED_LOGICAL_REQUEST_SLOTS_NOT_ACTUAL_HTTP',status:valid?'CONSISTENT_RESERVED_SLOT_SNAPSHOT':'SUMMARY_NOT_CLOSED',used,limits,total_reserved:total,reported_remaining_slots:remaining,consistent:valid,admissible_extra_HTTP:null,actual_HTTP:null};
}
export function buildRunBudgetContext({run_id,recorded_ts,http,reservation,usage,day_admission,native_liquidation}={}){
 const native=counters(usage),cap=object(reservation)?{rows_read:count(reservation.rows_read),rows_written:count(reservation.rows_written)}:null;
 const nativeClosed=native&&Object.values(native).every(x=>x!==null)&&native.unknown_ops===0&&cap&&Object.values(cap).every(x=>x!==null);
 const daily=object(day_admission?.daily),witness=object(daily?.native_cost_reconciliation);
 return {
  schema:'EXISTING_RUN_BUDGET_CONTEXT_V1',run_id:label(run_id),recorded_ts:count(recorded_ts),
  cut:'AFTER_ANALYTICS_LEASE_RELEASE_BEFORE_OPTIONAL_MANUAL_COMMAND_COMPLETION_AND_EXTERNAL_ARCHIVE_COPY',
  HTTP:httpContext(http),
  native_run:{reservation:cap,usage:native,status:nativeClosed?'KNOWN_CURRENT_POINT':'NATIVE_USAGE_OR_RESERVATION_UNCLOSED',
   remaining_at_this_cut:nativeClosed?{rows_read:Math.max(0,cap.rows_read-native.rows_read),rows_written:Math.max(0,cap.rows_written-native.rows_written)}:null,
   reservation_exceeded:nativeClosed?native.rows_read>cap.rows_read||native.rows_written>cap.rows_written:null,
   future_work_admitted:false},
  earlier_day_admission:object(day_admission)?{status:label(day_admission.status),allowed_at_original_cut:flag(day_admission.allowed),day_utc:label(daily?.day_utc),reported_unknown_ops:count(daily?.unknown_ops),reserved_rows_read:count(daily?.reserved_rows_read),reserved_rows_written:count(daily?.reserved_rows_written),
   reconciliation:witness?{status:label(witness.status),manifest_sha256:label(witness.manifest_sha256),historical_unknown_operations_preserved:count(witness.historical_unknown_operations_preserved),new_or_unmatched_unknown_authorized:flag(witness.new_or_unmatched_unknown_authorized),serialized_copy_is_not_a_proof_token:true}:null}:null,
  native_liquidation_service:object(native_liquidation)?{scope:'EXISTING_NATIVE_LIQ_SERVICE_NOT_ALL_LIQ_PROVIDERS_OR_JOB',...Object.fromEntries(['reserved_http','gross_reserved_http','claimed_http','actual_http','max_http_per_run'].map(k=>[k,count(native_liquidation[k])]))}:null,
  provider_day_month_rolling60s_headroom:null,manual_provider_reserve_headroom:null,
  independent_global_native_capacity:null,required_next_full_reservation_by_policy:{rows_read:59000,rows_written:920},observed_next_full_reservation:null,
  admission_authorized:false,whole_day_closed:false,additional_SQL:0,additional_source_HTTP:0,
 };
}
