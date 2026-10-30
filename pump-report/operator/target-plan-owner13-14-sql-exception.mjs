export const TARGET_PLAN_LOOKUP_IDS=Object.freeze({13:'pump-target-plan-install-20261029-extra13',14:'pump-target-plan-auto-acceptance-20261029-extra14'});
const beforePin='27258b810da32584cde054712e72be67e84d004e9af4874a4755a816e9c55bdf';
const afterPin='930905e4840003ab8e28ac2482d2915980bba2b3c4d9ccce0a103cb48a286531';
export function createTargetPlanNamedSqlException(admission,now=Date.now()){
 const g=admission.lookup_single_exception,n=g?.extra_number,id=TARGET_PLAN_LOOKUP_IDS[n];
 if(!id||g.schema!=='OWNER_TARGET_PLAN_INSTALL_AND_ACCEPTANCE_13_14_V1'||g.status!=='APPROVED_BY_DIRECT_OWNER'||
  !/^[a-f0-9]{64}$/.test(g.approval_message_sha256??'')||g.owner_thread_id!=='01a171f7-596e-7dc0-a82f-3e92f57f4ef6'||
  g.day_utc!=='2026-10-29'||new Date(now).toISOString().slice(0,10)!==g.day_utc||
  JSON.stringify(g.approved_run_ids)!==JSON.stringify([TARGET_PLAN_LOOKUP_IDS[13],TARGET_PLAN_LOOKUP_IDS[14]])||
  g.maximum_new_runs!==2||g.exact_run_id!==id||admission.run_id!==id||admission.mode!=='LOOKUP'||
  admission.implementation_sha256!==(n===13?beforePin:afterPin)||
  g.target_artifact_sha256!=='a799fe2fb70b3a2b71332acc5ba89d80352851394767e58bd16569f81fc21154'||
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
