export const BA_LOOKUP_RUN_ID='pump-ba-maintenance-20261026-one-owner-extra';

// A pending proposal never permits IO. This exception is restricted to the
// owner's one named maintenance run; the deployed daily policy stays at ten.
export function createBAMaintenanceSqlException(admission,now=Date.now()){
  const grant=admission.lookup_single_exception;
  if(grant===undefined)return (sql,params)=>({sql,params});
  if(grant.schema!=='OWNER_ONE_BA_MAINTENANCE_LOOKUP_V1'||grant.status!=='APPROVED_BY_DIRECT_OWNER'||
    !/^[a-f0-9]{64}$/.test(grant.approval_message_sha256??'')||
    grant.owner_thread_id!=='01a171f7-596e-7dc0-a82f-3e92f57f4ef6'||
    grant.day_utc!=='2026-10-26'||new Date(now).toISOString().slice(0,10)!==grant.day_utc||
    grant.exact_run_id!==BA_LOOKUP_RUN_ID||admission.run_id!==BA_LOOKUP_RUN_ID||
    grant.previous_run_count!==10||grant.additional_runs!==1||grant.maximum_count_after!==11||
    grant.rows_read!==500||grant.rows_written!==30||grant.max_queries!==16||
    !Number.isSafeInteger(grant.approved_ts)||grant.approved_ts>now||
    !Number.isSafeInteger(grant.expires_ts)||now>=grant.expires_ts||
    grant.expires_ts>admission.expires_ts||grant.expires_ts>now+900000){
    throw Error('DIRECT_OWNER_ONE_BA_LOOKUP_APPROVAL_REQUIRED');
  }
  let applied=false;
  return (sql,params)=>{
    if(!sql.startsWith('INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow('))return {sql,params};
    const clause='AND (?16=0 OR lookup_count<?17)';
    if(applied||params[0]!=='PUMP:LOOKUP:'+BA_LOOKUP_RUN_ID||params[1]!==grant.day_utc||
      params[2]!==500||params[3]!==30||params[15]!==1||params[16]!==10||
      sql.split(clause).length!==2)throw Error('EXACT_BA_LOOKUP_RESERVATION_REQUIRED');
    applied=true;
    const bound=[...params];bound[16]=11;
    return {sql:sql.replace(clause,'AND lookup_count=10 '+clause),params:bound};
  };
}
