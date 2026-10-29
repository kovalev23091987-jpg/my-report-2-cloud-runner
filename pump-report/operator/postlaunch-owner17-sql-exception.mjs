export const POSTLAUNCH_LOOKUP_IDS=Object.freeze({17:'pump-postlaunch-outcome-install-20261029-extra17'});
const beforePin='265143646dd713655419fe56fa5c0451a81450781112c171de6146629a716854';
export function createPostlaunchNamedSqlException(admission,now=Date.now()){
 const g=admission.lookup_single_exception,n=g?.extra_number,id=POSTLAUNCH_LOOKUP_IDS[n];
 if(!id||g.schema!=='OWNER_POSTLAUNCH_OUTCOME_INSTALL17_V1'||g.status!=='APPROVED_BY_DIRECT_OWNER'||
  !/^[a-f0-9]{64}$/.test(g.approval_message_sha256??'')||g.owner_thread_id!=='01a171f7-596e-7dc0-a82f-3e92f57f4ef6'||
  g.day_utc!=='2026-10-29'||new Date(now).toISOString().slice(0,10)!==g.day_utc||
  JSON.stringify(g.approved_run_ids)!==JSON.stringify([POSTLAUNCH_LOOKUP_IDS[17]])||
  g.maximum_new_runs!==1||g.exact_run_id!==id||admission.run_id!==id||admission.mode!=='LOOKUP'||
  admission.implementation_sha256!==beforePin||
  g.target_artifact_sha256!=="1b4403a02c6d93a3555c5e1a0ce623c1e907a0edd52ce563878791cb7eba4378"||
  g.previous_run_count!==n-1||g.additional_runs!==1||g.maximum_count_after!==n||
  g.rows_read!==500||g.rows_written!==30||g.max_queries!==16||admission.native_query_cap!==16||
  !Number.isSafeInteger(g.approved_ts)||g.approved_ts>now||!Number.isSafeInteger(g.expires_ts)||
  now>=g.expires_ts||g.expires_ts>admission.expires_ts||g.expires_ts>now+900000)throw Error('DIRECT_OWNER_ONE_NAMED_POSTLAUNCH_LOOKUP17_REQUIRED');
 let applied=false;
 return(sql,params)=>{
  if(!sql.startsWith('INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow('))return{sql,params};
  const clause='AND (?16=0 OR lookup_count<?17)';
  if(applied||params[0]!=='PUMP:LOOKUP:'+id||params[1]!==g.day_utc||params[2]!==500||params[3]!==30||params[15]!==1||params[16]!==10||sql.split(clause).length!==2)throw Error('EXACT_NAMED_POSTLAUNCH17_RESERVATION_REQUIRED');
  applied=true;const bound=[...params];bound[16]=n;
  return{sql:sql.replace(clause,'AND lookup_count='+(n-1)+' '+clause),params:bound};
 };
}
