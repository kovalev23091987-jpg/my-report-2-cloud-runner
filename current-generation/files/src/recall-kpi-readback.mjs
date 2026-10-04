// A missing horizon is a legitimate shadow result, not a failed database write.
// Require the exact record, including its non-trading safety flags, on readback.
export function recallKpiReadbackMatches(row,record){
 const count=record?.closed_horizons?.length;
 const allowed=count===0?record?.status==='NOT_CLOSED':count===3?record?.status==='CLOSED':count>0&&count<3&&record?.status==='PARTIAL';
 if(!allowed||!row||row.mode!==record.mode||row.status!==record.status||
  row.source_run_id!==record.source_run_id||Number(row.audit_ts)!==record.audit_ts||
  Number(row.closed_horizons)!==count||row.kpi_json!==JSON.stringify(record))return false;
 return ['strategy_changed','decision_weights_changed','live_probability','validated_signal','automatic_telegram','trading_execution'].every(key=>row[key]!==null&&row[key]!==undefined&&Number(row[key])===0);
}
