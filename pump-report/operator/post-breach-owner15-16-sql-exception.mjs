export const POST_BREACH_LOOKUP_IDS=Object.freeze({15:'pump-post-breach-install-20261029-extra15',16:'pump-post-breach-auto-acceptance-20261029-extra16'});
const beforePin='930905e4840003ab8e28ac2482d2915980bba2b3c4d9ccce0a103cb48a286531';
const afterPin='265143646dd713655419fe56fa5c0451a81450781112c171de6146629a716854';
export function createPostBreachNamedSqlException(admission,now=Date.now()){
 const g=admission.lookup_single_exception,n=g?.extra_number,id=POST_BREACH_LOOKUP_IDS[n];
 if(!id||g.schema!=='OWNER_POST_BREACH_INSTALL_AND_ACCEPTANCE_15_16_V1'||g.status!=='APPROVED_BY_DIRECT_OWNER'||
  !/^[a-f0-9]{64}$/.test(g.approval_message_sha256??'')||g.owner_thread_id!=='01a171f7-596e-7dc0-a82f-3e92f57f4ef6'||
  g.day_utc!=='2026-10-29'||new Date(now).toISOString().slice(0,10)!==g.day_utc||
  JSON.stringify(g.approved_run_ids)!==JSON.stringify([POST_BREACH_LOOKUP_IDS[15],POST_BREACH_LOOKUP_IDS[16]])||
  g.maximum_new_runs!==2||g.exact_run_id!==id||admission.run_id!==id||admission.mode!=='LOOKUP'||
  admission.implementation_sha256!==(n===15?beforePin:afterPin)||
  g.target_artifact_sha256!=="f8dca4949ec623ccc994d5a2a0179959111212084ed278a767e20a4c42937061"||
  g.previous_run_count!==n-1||g.additional_runs!==1||g.maximum_count_after!==n||
  g.rows_read!==500||g.rows_written!==30||g.max_queries!==16||admission.native_query_cap!==16||
  !Number.isSafeInteger(g.approved_ts)||g.approved_ts>now||!Number.isSafeInteger(g.expires_ts)||
  now>=g.expires_ts||g.expires_ts>admission.expires_ts||g.expires_ts>now+900000)throw Error('DIRECT_OWNER_TWO_NAMED_TARGET_PLAN_LOOKUPS_REQUIRED');
 let applied=false;
 return(sql,params)=>{
  if(!sql.startsWith('INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow('))return{sql,params};
  const clause='AND (?16=0 OR lookup_count<?17)';
  if(applied||params[0]!=='PUMP:LOOKUP:'+id||params[1]!==g.day_utc||params[2]!==500||params[3]!==30||params[15]!==1||params[16]!==10||sql.split(clause).length!==2)throw Error('EXACT_NAMED_TARGET_PLAN_RESERVATION_REQUIRED');
  applied=true;const bound=[...params];bound[16]=n;
  return{sql:sql.replace(clause,'AND lookup_count='+(n-1)+' '+clause),params:bound};
 };
}
