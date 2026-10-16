// These are observations of existing operations, not admission, a daily total
// or a new SQL writer. An absent counter never becomes zero native cost.
export function nativeBindingUsage(observer){
 const s=observer?.usageSnapshot?.();
 const valid=s&&['requests','rows_read','rows_written','unknown_ops'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0);
 const closed=Boolean(valid&&s.unknown_ops===0);
 return{attempted_statements:valid?s.requests:null,measured_rows_read_subtotal:valid?s.rows_read:null,measured_rows_written_subtotal:valid?s.rows_written:null,unknown_operations:valid?s.unknown_ops:null,row_totals_closed:closed,total_rows_read:closed?s.rows_read:null,total_rows_written:closed?s.rows_written:null};
}
export function hourlyNativeUsageReceipt({invocation_id,scheduled_ts,execution_started_ts=null,execution_completed_ts=null,source,archive,completed=false}={}){
 if(typeof invocation_id!=='string'||!invocation_id||!Number.isSafeInteger(scheduled_ts)||scheduled_ts<=0)throw Error('EXACT_HOURLY_NATIVE_RECEIPT_IDENTITY_REQUIRED');
 const bindings={DATA_DB:nativeBindingUsage(source),ARCHIVE_DB:nativeBindingUsage(archive)},closed=Object.values(bindings).every(s=>s.row_totals_closed);
 const day=t=>Number.isSafeInteger(t)&&t>0?new Date(t).toISOString().slice(0,10):null,clock=Number.isSafeInteger(execution_started_ts)&&execution_started_ts>0&&Number.isSafeInteger(execution_completed_ts)&&execution_completed_ts>=execution_started_ts,execution_day_unambiguous=clock&&day(execution_started_ts)===day(execution_completed_ts);
 return{schema:'FREE_HISTORY_NATIVE_INVOCATION_USAGE_V1',invocation_id,scheduled_ts,day_utc:day(scheduled_ts),scheduled_day_utc:day(scheduled_ts),execution_started_ts,execution_completed_ts,execution_day_unambiguous,execution_day_utc:execution_day_unambiguous?day(execution_started_ts):null,execution_completed:completed,bindings,row_totals_closed:closed,total_rows_read:closed?bindings.DATA_DB.total_rows_read+bindings.ARCHIVE_DB.total_rows_read:null,total_rows_written:closed?bindings.DATA_DB.total_rows_written+bindings.ARCHIVE_DB.total_rows_written:null,additional_SQL:0,cost_admission_changed:false,daily_total:false,source_clocks_refreshed:false};
}
