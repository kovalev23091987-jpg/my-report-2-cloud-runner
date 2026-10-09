import fs from 'node:fs';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),reservation={rows_read:5000,rows_written:16},id='FULL_CURRENT_CHAIN:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={schema:'FULL_CURRENT_ORIGINAL_CHAIN_READ_20261009_V1',head:process.env.GITHUB_SHA,cloud_run:process.env.GITHUB_RUN_ID,read_ts:now,sourceHTTP:0,MAIN:0,Telegram:0,task_writes:0,source_clocks_refreshed:false,project_complete:false};
const all=async(sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){await reserveRunBudget(db,{reservationId:id,now,reservation});try{
 const probe=await db.prepare('SELECT COUNT(*) AS rows FROM (SELECT publication_id FROM canonical_publication_shadow LIMIT 1001)').first();out.hot_table_upper_bound=probe;if(!Number.isSafeInteger(probe.rows)||probe.rows>1000)throw Error('HOT_CANONICAL_TOO_LARGE');
 out.since_ts=1791504000000;
 out.canonical_rows=await all('SELECT publication_id,contract_code,run_id,snapshot_id,wave_id,direction,canonical_state,analytical_fingerprint,observed_ts,created_ts,canonical_json FROM canonical_publication_shadow WHERE observed_ts>=?1 AND observed_ts<=?2 ORDER BY observed_ts,publication_id LIMIT 151',out.since_ts,now);
 if(out.canonical_rows.length>150)throw Error('COHORT_TRUNCATED');
 const ids=JSON.stringify(out.canonical_rows.map(r=>r.publication_id));
 out.tasks=await all('SELECT * FROM v3_recheck_task_shadow WHERE publication_id IN (SELECT value FROM json_each(?1)) ORDER BY created_ts LIMIT 151',ids);
 out.bindings=await all('SELECT b.*,d.state,d.telegram_message_id,d.sent_ts,d.last_error FROM v3_dispatch_publication_binding_shadow b INDEXED BY idx_dispatch_publication_id JOIN v3_telegram_dispatch_shadow d ON d.idempotency_key=b.idempotency_key WHERE b.publication_id IN (SELECT value FROM json_each(?1)) ORDER BY b.created_ts LIMIT 151',ids);
 if(out.tasks.length>150||out.bindings.length>150)throw Error('COHORT_RECEIPTS_TRUNCATED');
 out.latest_producer=[];
 for(const contract of ['RAY-USDT','龙虾-USDT']){
  const shadow=await db.prepare('SELECT * FROM shadow_decision_log INDEXED BY idx_shadow_decision_log_contract_ts WHERE contract_code=?1 AND observed_ts BETWEEN ?2 AND ?3 ORDER BY observed_ts DESC LIMIT 1').bind(contract,1791541597504,1791541739999).first();
  const final=await db.prepare('SELECT * FROM final_decision_integration_shadow INDEXED BY idx_final_decision_observation WHERE contract_code=?3 AND observation_ts BETWEEN ?1 AND ?2 ORDER BY observation_ts DESC LIMIT 1').bind(1791541597504,1791541739999,contract).first();
  const deep=await db.prepare('SELECT * FROM deep_check_run_log WHERE run_id=?1 AND contract_code=?2 LIMIT 1').bind('1791541597504-1791541612818',contract).first();
  out.latest_producer.push({contract,shadow,final,deep});
 }
 out.statistics={};
 for(const [key,table] of [['signals','tz101_entry_area_calibration_signal'],['outcomes','tz101_entry_area_calibration_outcome']]){
  const probe=await db.prepare(`SELECT COUNT(*) AS rows FROM (SELECT sample_id FROM ${table} LIMIT 501)`).first();out.statistics[key+'_bounded_count']=probe;
  if(probe.rows<=500)out.statistics[key]=await all(`SELECT * FROM ${table} LIMIT 501`);else out.statistics[key+'_status']='BOUNDED_SAMPLE_TOO_LARGE;NOT_FULL_STATISTICAL_ACCEPTANCE';
 }
 const u=db.usageSnapshot();if(u.unknown_ops||u.rows_read>4800||u.rows_written>14||u.requests>30)throw Error('READ_ENVELOPE_EXCEEDED');out.status='FULL_CURRENT_CHAIN_READ_CLOSED';
 }catch(e){out.status='READ_NOT_CLOSED';out.error=String(e.message).slice(0,240);}finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}}else out.status='D1_ADMISSION_BLOCKED';
out.D1=db.usageSnapshot();fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/full-current-chain-read.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,canonical_rows:out.canonical_rows?.length,statistics_counts:{signals:out.statistics?.signals_bounded_count,outcomes:out.statistics?.outcomes_bounded_count},D1:out.D1,error:out.error}));if(out.status!=='FULL_CURRENT_CHAIN_READ_CLOSED')process.exitCode=1;
