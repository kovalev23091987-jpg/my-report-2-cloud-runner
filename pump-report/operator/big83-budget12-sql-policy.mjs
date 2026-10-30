export const BIG83_BUDGET12_RUN_ID='pump-big83-budget-20261030-owner-extra12';
export function createBig83Budget12SqlPolicy(admission,now=Date.now()) {
  const g=admission.lookup_single_exception,day='2026-10-30',id=BIG83_BUDGET12_RUN_ID;
  if(!g||g.schema!=='OWNER_ONE_BIG83_BUDGET_LOOKUP12_V1'||g.status!=='APPROVED_BY_DIRECT_OWNER'||
    !/^[a-f0-9]{64}$/.test(g.approval_message_sha256??'')||
    g.owner_thread_id!=='01a171f7-596e-7dc0-a82f-3e92f57f4ef6'||g.day_utc!==day||
    new Date(now).toISOString().slice(0,10)!==day||admission.ordinary_lookup_day_utc!==day||
    g.exact_run_id!==id||admission.run_id!==id||admission.mode!=='LOOKUP'||
    g.previous_run_count!==11||g.additional_runs!==1||g.maximum_count_after!==12||
    g.rows_read!==500||g.rows_written!==30||g.max_queries!==16||admission.native_query_cap!==16||
    !Number.isSafeInteger(g.approved_ts)||g.approved_ts>now||!Number.isSafeInteger(g.expires_ts)||
    now>=g.expires_ts||g.expires_ts>admission.expires_ts||g.expires_ts>now+900000||
    admission.budget_diagnosis_ref!=='checkpoints/pump-report-20261025/ROOT_BIG83_BUDGET12_OWNER_PROPOSAL_RU.md'||
    admission.implementation_sha256!=='da52262978c5bb1037993b72d8b98c6185182e0a98d69fa3846ee6e21b7ed688'||
    admission.artifact_sha256!=='8522aac0753fcfd471fd99d6920c30f0ab89ecf689f2726f9bb1986e715633a6')
    throw Error('DIRECT_OWNER_ONE_BIG83_BUDGET12_APPROVAL_REQUIRED');
  let applied=false;
  return (sql,params)=>{
    if(!sql.startsWith('INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow('))return {sql,params};
    const clause='AND (?16=0 OR lookup_count<?17)';
    if(applied||params[0]!=='PUMP:LOOKUP:'+id||params[1]!==day||params[2]!==500||params[3]!==30||
      params[15]!==1||params[16]!==10||sql.split(clause).length!==2)
      throw Error('EXACT_ONE_BIG83_BUDGET12_RESERVATION_REQUIRED');
    applied=true;const bound=[...params];bound[16]=12;
    return {sql:sql.replace(clause,'AND lookup_count=11 '+clause),params:bound};
  };
}
