export const QUEUE_V7_LOOKUP_IDS=Object.freeze({13:'pump-queue-seed-v7-install-20261029-extra13',14:'pump-queue-seed-v7-auto-acceptance-20261029-extra14'});
const beforePin='27258b810da32584cde054712e72be67e84d004e9af4874a4755a816e9c55bdf';
const afterPin='37e4b0ed9cd5b243a94f7f56bc1ac683a7461fb1cc77570dae09379b00da0456';
export function createQueueV7NamedSqlException(admission,now=Date.now()){
 const g=admission.lookup_single_exception,n=g?.extra_number,id=QUEUE_V7_LOOKUP_IDS[n];
 if(!id||g.schema!=='OWNER_QUEUE_V7_INSTALL_AND_ACCEPTANCE_13_14_V1'||g.status!=='APPROVED_BY_DIRECT_OWNER'||
  !/^[a-f0-9]{64}$/.test(g.approval_message_sha256??'')||g.owner_thread_id!=='01a171f7-596e-7dc0-a82f-3e92f57f4ef6'||
  g.day_utc!=='2026-10-29'||new Date(now).toISOString().slice(0,10)!==g.day_utc||
  JSON.stringify(g.approved_run_ids)!==JSON.stringify([QUEUE_V7_LOOKUP_IDS[13],QUEUE_V7_LOOKUP_IDS[14]])||
  g.maximum_new_runs!==2||g.exact_run_id!==id||admission.run_id!==id||admission.mode!=='LOOKUP'||
  admission.implementation_sha256!==(n===13?beforePin:afterPin)||
  g.target_artifact_sha256!=='531699f31a0c71a6704da3f9648fa4bf142450b524c5942b60dfeaed7f3297d1'||
  g.previous_run_count!==n-1||g.additional_runs!==1||g.maximum_count_after!==n||
  g.rows_read!==500||g.rows_written!==30||g.max_queries!==16||admission.native_query_cap!==16||
  !Number.isSafeInteger(g.approved_ts)||g.approved_ts>now||!Number.isSafeInteger(g.expires_ts)||
  now>=g.expires_ts||g.expires_ts>admission.expires_ts||g.expires_ts>now+900000)throw Error('DIRECT_OWNER_TWO_NAMED_QUEUE_V7_LOOKUPS_REQUIRED');
 let applied=false;
 return(sql,params)=>{
  if(!sql.startsWith('INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow('))return{sql,params};
  const clause='AND (?16=0 OR lookup_count<?17)';
  if(applied||params[0]!=='PUMP:LOOKUP:'+id||params[1]!==g.day_utc||params[2]!==500||params[3]!==30||params[15]!==1||params[16]!==10||sql.split(clause).length!==2)throw Error('EXACT_NAMED_QUEUE_V7_RESERVATION_REQUIRED');
  applied=true;const bound=[...params];bound[16]=n;
  return{sql:sql.replace(clause,'AND lookup_count='+(n-1)+' '+clause),params:bound};
 };
}
