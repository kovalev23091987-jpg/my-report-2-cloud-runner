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
export function buildRunBudgetContext({run_id,recorded_ts,http,reservation,usage,day_admission,native_liquidation,provider_receipts}={}){
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
  // Local source-ledger observations are separate from unknown provider-account
  // balances. Their earlier query cuts never authorize a new action here.
  technical_provider_receipt_observations:['EXISTING_PROVIDER_LEDGER_OBSERVATIONS_V1','EXISTING_PROVIDER_LEDGER_OBSERVATIONS_V2'].includes(provider_receipts?.schema)&&provider_receipts.run_id===run_id?provider_receipts:null,
  provider_day_month_rolling60s_headroom:null,manual_provider_reserve_headroom:null,
  independent_global_native_capacity:null,required_next_full_reservation_by_policy:{rows_read:59000,rows_written:920},observed_next_full_reservation:null,
  admission_authorized:false,whole_day_closed:false,additional_SQL:0,additional_source_HTTP:0,
 };
}


// Invocation-local metadata only; serialized copies are not proof/admission tokens.
export function createProviderBudgetReceiptCapture({clock=Date.now}={}){
 const records=[];let invalid=0,overflow=0,captureOrder=0;
 const sharedFields=['source','run_id','contract','route','reference_key','attempt_sequence','query_window_end_ts','day_utc'];
 const cutFields=['phase','captured_ts','provider','row_presence','reported_used_units','configured_cap','reported_own_reserved_units','minute_bucket','returned_allowed','returned_status','native_usage_guard_passed'];
 // Fixed technical schema only. One reference/query identity per bounded row;
 // every phase keeps its own clock, nullable values and invocation capture order.
 const cutColumns=['capture_order',...cutFields];
 const payloadBound=16384-2048; // reserve bounded frame/header/counters overhead
 const sources=['COINGECKO_SECTOR','COINPAPRIKA_SECTOR'];
 const phases=['DAY_PREFLIGHT_ROW','MINUTE_PREFLIGHT_ROW','DAY_RESERVATION_REPLY','MINUTE_RESERVATION_REPLY'];
 const text=(s,n)=>typeof s==='string'&&s.length>0&&Buffer.byteLength(s,'utf8')<=n?s:null;
 const nullableCount=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0?n:null;
 const jsonBytes=x=>Buffer.byteLength(JSON.stringify(x),'utf8');
 const observe=e=>{
  const order=captureOrder++;
  // No private body/URL/credential/SQL text or unknown caller keys are copied.
  if(!e||!sources.includes(e.source)||!phases.includes(e.phase)||!text(e.run_id,160)||!text(e.contract,80)||!/^\S{1,32}-USDT$/u.test(e.contract)||!text(e.route,64)||!/^[A-Z0-9_]+$/.test(e.route)||!text(e.reference_key,128)||!/^REFERENCE:provider-reference-cache-v1-20261004:[a-f0-9]{64}$/.test(e.reference_key)||!Number.isSafeInteger(e.attempt_sequence)||e.attempt_sequence<0||!Number.isSafeInteger(e.query_window_end_ts)||e.query_window_end_ts<=0||e.query_window_end_ts>8_640_000_000_000_000||e.day_utc!==new Date(e.query_window_end_ts).toISOString().slice(0,10)||e.native_usage_guard_passed!==true){invalid++;return;}
  const captured_ts=clock();if(!Number.isSafeInteger(captured_ts)||captured_ts<e.query_window_end_ts){invalid++;return;}
  const row={source:e.source,run_id:e.run_id,contract:e.contract,route:e.route,phase:e.phase,reference_key:e.reference_key,attempt_sequence:e.attempt_sequence,
   query_window_end_ts:e.query_window_end_ts,day_utc:e.day_utc,captured_ts,
   provider:['COINGECKO','COINPAPRIKA'].includes(e.provider)?e.provider:null,
   row_presence:['ABSENT','RETURNED','UNKNOWN'].includes(e.row_presence)?e.row_presence:null,
   reported_used_units:nullableCount(e.reported_used_units),configured_cap:nullableCount(e.configured_cap),reported_own_reserved_units:nullableCount(e.reported_own_reserved_units),minute_bucket:nullableCount(e.minute_bucket),
   returned_allowed:typeof e.returned_allowed==='boolean'?e.returned_allowed:null,returned_status:typeof e.returned_status==='string'&&/^[A-Z0-9_]{1,80}$/.test(e.returned_status)?e.returned_status:null,native_usage_guard_passed:true};
  const identity=Object.fromEntries(sharedFields.map(k=>[k,row[k]]));
  const at=records.findIndex(r=>sharedFields.every(k=>r[k]===identity[k]));
  const cut=[order,...cutFields.map(k=>row[k])];
  const record=at<0?{...identity,cuts:[cut]}:{...records[at],cuts:[...records[at].cuts,cut]};
  if(jsonBytes(row)>1024||jsonBytes(record)>1024||(at<0&&records.length>=16)){overflow++;return;}
  const candidate=at<0?[...records,record]:records.map((r,i)=>i===at?record:r);
  if(jsonBytes(candidate)>payloadBound){overflow++;return;}
  if(at<0)records.push(record);else records[at]=record;
 };
 const summary=run_id=>{
  const bound=text(run_id,160),matching=bound?records.filter(r=>r.run_id===bound):[];
  const observations=rows=>rows.reduce((n,r)=>n+r.cuts.length,0),retained=observations(matching),foreign=observations(records)-retained;
  const base={schema:'EXISTING_PROVIDER_LEDGER_OBSERVATIONS_V2',run_id:bound,basis:'PROJECT_LOCAL_SOURCE_LEDGER_NOT_PROVIDER_ACCOUNT_BALANCE',status:overflow?'OVERFLOW':invalid||foreign?'PARTIAL_OR_INVALID':matching.length?'CAPTURED_EARLIER_QUERY_CUTS':'NO_CURRENT_CAPTURE',
   cut_columns:cutColumns,records:matching,record_count:matching.length,retained_observations:retained,
   capture_order_basis:'INVOCATION_OBSERVE_CALL_ORDER_NOT_QUERY_CLOCK_SORT',repeated_phase_cuts_preserved:true,
   invalid_observations:invalid,overflow_observations:overflow,foreign_run_omitted:foreign,all_run_observations_complete:false,
   query_cuts_are_distinct:true,reservation_replies_are_helper_returns_not_raw_SQL_body:true,
   provider_account_balances:null,month_headroom:null,manual_held_reserve:null,native_unknown_ops_at_individual_query:null,
   future_work_admitted:false,whole_day_closed:false,serialized_copy_is_not_a_proof_token:true,additional_SQL:0,additional_source_HTTP:0};
  if(jsonBytes(base)>16384)return{...base,status:'OVERFLOW',records:[],record_count:0,retained_observations:0,overflow_observations:overflow+retained};
  return JSON.parse(JSON.stringify(base));
 };
 return{observe,summary};
}
