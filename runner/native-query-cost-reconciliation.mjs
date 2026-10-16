// Offline reconciliation of one explicit qualification's client journals.
// A transport interval bounds client observation; it is not a native billing
// timestamp. No extrapolation, quota mutation, SQL, or admission is performed.
const count=v=>Number.isSafeInteger(v)&&v>=0;
const day=t=>count(t)&&t<=8640000000000000?new Date(t).toISOString().slice(0,10):null;
const zero=()=>({requests:0,rows_read:0,rows_written:0,unknown_ops:0});
export function reconcileNativeQueryCosts({journals,usage}={}){
 const issues=[],subtotal=zero(),days={},unallocated=[],bindings=new Set();
 const add=(a,b)=>{for(const k of Object.keys(a)){if(!count(a[k]+b[k]))issues.push('NATIVE_JOURNAL_SUM_OVERFLOW');else a[k]+=b[k];}};
 let unknown=0;
 for(const j of Array.isArray(journals)?journals:[]){
  if(!j||j.schema!=='BOUNDED_NATIVE_QUERY_COST_JOURNAL_V1'||typeof j.binding!=='string'||!j.binding||bindings.has(j.binding)){issues.push('MISSING_OR_DUPLICATE_BINDING');continue;}
  bindings.add(j.binding);
  if(!count(j.attempted_statements)||!count(j.recorded_statements)||!Number.isInteger(j.max_recorded_statements)||j.max_recorded_statements<1||j.max_recorded_statements>512||!Array.isArray(j.receipts)||j.receipts.length>512||j.recorded_statements!==j.receipts.length||j.attempted_statements!==j.recorded_statements||j.recorded_statements>j.max_recorded_statements||j.overflow!==false||j.additional_SQL!==0||j.contains_SQL_params_or_results!==false||j.wire_sql_hash_basis!=='EXACT_CLIENT_SENT_SQL_UTF8_NOT_PROOF_OF_SERVER_REWRITE'){issues.push('INCOMPLETE_OR_OVERFLOW_JOURNAL');}
  const transports=new Map();
  for(const [i,r] of (Array.isArray(j.receipts)?j.receipts.slice(0,512):[]).entries()){
   if(!r||r.binding!==j.binding||r.sequence!==i+1||!/^([a-f0-9]{64})$/.test(r.sql_sha256||'')||!/^([a-f0-9]{64})$/.test(r.wire_sql_sha256||'')||typeof r.unknown!=='boolean'||r.SQL_params_results_exported!==false||![r.rows_read,r.rows_written].every(v=>v===null||count(v))||(!r.unknown&&(r.rows_read===null||r.rows_written===null))){issues.push('INVALID_STATEMENT_RECEIPT');continue;}
   const cost={requests:1,rows_read:r.rows_read??0,rows_written:r.rows_written??0,unknown_ops:r.unknown?1:0};
   add(subtotal,cost);unknown+=cost.unknown_ops;
   const startDay=day(r.transport_started_ts),endDay=day(r.transport_completed_ts),validClock=startDay!==null&&endDay!==null&&r.transport_started_ts<=r.transport_completed_ts;
   const validTransport=count(r.transport_sequence)&&r.transport_sequence>0;
   const interval=JSON.stringify([r.transport_started_ts,r.transport_completed_ts]);
   const prior=transports.get(r.transport_sequence);
   if(validTransport&&prior===undefined)transports.set(r.transport_sequence,interval);
   const sameDay=validClock&&startDay===endDay?startDay:null;
   const consistent=validTransport&&(prior===undefined||prior===interval)&&r.transport_clock_closed===validClock&&r.client_utc_day===sameDay;
   if(!consistent){issues.push('INVALID_OR_CONFLICTING_TRANSPORT_CLOCK');unallocated.push({binding:j.binding,sequence:r.sequence,...cost,reason:'CLOCK_NOT_QUALIFIED'});continue;}
   if(!sameDay){unallocated.push({binding:j.binding,sequence:r.sequence,...cost,reason:validClock?'UTC_BOUNDARY_SPANNING':'CLOCK_NOT_CLOSED'});continue;}
   add(days[sameDay]??=zero(),cost);
  }
 }
 if(!Array.isArray(journals)||!journals.length)issues.push('JOURNALS_REQUIRED');
 const usageMatches=!!usage&&Object.keys(subtotal).every(k=>count(usage[k])&&usage[k]===subtotal[k]);
 if(!usageMatches)issues.push('AGGREGATE_USAGE_MISMATCH');
 return{schema:'NATIVE_CLIENT_QUERY_RECONCILIATION_V1',known_statement_subtotal:subtotal,observed_client_UTC_days:days,unallocated_statements:unallocated,issues:[...new Set(issues)],aggregate_usage_matches:usageMatches,statement_costs_closed:issues.length===0&&unknown===0,client_day_attribution_closed:issues.length===0&&unknown===0&&unallocated.length===0,clock_basis:'CLIENT_TRANSPORT_INTERVAL_NOT_SERVER_EXECUTION_OR_SOURCE_CLOCK',native_billing_day_verified:false,whole_day_closed:false,daily_total:null,daily_upper_bound:null,admission_authorized:false,reservations_changed:false,additional_SQL:0};
}
