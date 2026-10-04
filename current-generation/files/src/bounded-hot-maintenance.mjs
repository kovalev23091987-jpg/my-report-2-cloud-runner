export const HOT_MAINTENANCE_BATCH=8;
export function buildLiquidationMaintenanceStatements(db,{now,cutoff}={}){
  // Preserve the existing retention and lifecycle conditions, while draining
  // historical maintenance over successive cycles instead of one hot write.
  return[
    db.prepare(`DELETE FROM liquidation_shadow_observation WHERE rowid IN (SELECT rowid FROM liquidation_shadow_observation WHERE observed_ts < ?1 ORDER BY observed_ts,rowid LIMIT 8)`).bind(cutoff),
    db.prepare(`UPDATE liquidation_cluster_state SET lifecycle='EXPIRED' WHERE rowid IN (SELECT rowid FROM liquidation_cluster_state WHERE last_seen_ts < ?1 AND lifecycle NOT IN ('SWEPT','INVALIDATED','EXPIRED') ORDER BY last_seen_ts,rowid LIMIT 8)`).bind(now-24*60*60*1000),
    db.prepare(`DELETE FROM liquidation_cluster_state WHERE rowid IN (SELECT rowid FROM liquidation_cluster_state WHERE last_seen_ts < ?1 ORDER BY last_seen_ts,rowid LIMIT 8)`).bind(cutoff),
  ];
}

const RETENTION_COLUMNS=Object.freeze({scan_runs:'ts_bucket',deep_check_run_log:'completed_ts',shadow_decision_log:'observed_ts',shadow_outcome_log:'computed_ts',shadow_calibration_signal:'observed_ts'});
export function buildBoundedRetentionStatement(db,{table,cutoff}={}){
  const column=RETENTION_COLUMNS[table];
  if(!column||!Number.isFinite(cutoff))throw new Error('INVALID_BOUNDED_RETENTION');
  return db.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${column} < ?1 ORDER BY ${column},rowid LIMIT 8)`).bind(cutoff);
}
