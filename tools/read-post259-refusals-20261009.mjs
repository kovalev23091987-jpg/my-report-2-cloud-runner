import fs from 'node:fs';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),reservation={rows_read:1000,rows_written:16},id='POST259_EXACT_REFUSALS:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={schema:'POST259_EXACT_ORIGINAL_REFUSALS_AND_FAIR_QUEUE_V1',head:process.env.GITHUB_SHA,cloud_run:Number(process.env.GITHUB_RUN_ID),read_ts:now,original_run:37937215275,original_head:'515e58f360559854c9811c50ced706945feb759d',original_run_id:'1791552597150-1791552612560',sourceHTTP:0,MAIN:0,Telegram:0,task_writes:0,outcome_writes:0,source_clocks_refreshed:false,project_complete:false};
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){await reserveRunBudget(db,{reservationId:id,now,reservation});try{
 out.exact_candidates=[];
 for(const [contract,observed_ts,publication_id]of[['BR-USDT',1791552702776,'PUB:5d60c638e0e95339114b63ff49010d73df7ed972'],['BTR-USDT',1791552667442,'PUB:c5c7cb3dacdbe44b5a74ec8a4bdb771e32eceddc']]){
 const shadow=await db.prepare('SELECT * FROM shadow_decision_log INDEXED BY idx_shadow_decision_log_contract_ts WHERE contract_code=?1 AND observed_ts BETWEEN ?2 AND ?2 ORDER BY observed_ts DESC LIMIT 1').bind(contract,observed_ts).first();
 const final=await db.prepare('SELECT * FROM final_decision_integration_shadow INDEXED BY idx_final_decision_observation WHERE contract_code=?3 AND observation_ts BETWEEN ?1 AND ?2 ORDER BY observation_ts DESC LIMIT 1').bind(observed_ts,observed_ts,contract).first();
 const canonical=await db.prepare('SELECT * FROM canonical_publication_shadow WHERE publication_id=?1 LIMIT 1').bind(publication_id).first();
 out.exact_candidates.push({contract,observed_ts,publication_id,shadow,final,canonical});
 }
 out.queue_states=[];for(const key of ['R8_20_OUTCOME_QUEUE_TURN_V1','R8_20_EARLY_OUTCOME_CURSOR_V1'])out.queue_states.push(await db.prepare('SELECT state_key,status,updated_ts FROM tz101_entry_area_calibration_state WHERE state_key=?1 LIMIT 1').bind(key).first());
 out.original_BR_h1=await db.prepare('SELECT * FROM v3_early_outcome_journal WHERE outcome_id=?1 LIMIT 1').bind('EDW:BR-USDT:1791545058092:G10:H1').first();
 out.entry_statistics={};for(const [key,table]of[['signals','tz101_entry_area_calibration_signal'],['outcomes','tz101_entry_area_calibration_outcome']]){const r=await db.prepare('SELECT * FROM '+table+' LIMIT 101').all();out.entry_statistics[key]=r.results;out.entry_statistics[key+'_full_table_closed']=r.results.length<=100;}
 const u=db.usageSnapshot();if(u.unknown_ops||u.rows_read>900||u.rows_written>14||u.requests>19)throw Error('READ_ENVELOPE_EXCEEDED');out.status='EXACT_REFUSALS_AND_FAIR_QUEUE_READ_CLOSED';
 }catch(e){out.status='READ_NOT_CLOSED';out.error=String(e.message).slice(0,240);}finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}}else out.status='D1_ADMISSION_BLOCKED';
out.D1=db.usageSnapshot();fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/post259-original-refusals.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,candidates:out.exact_candidates?.map(x=>({contract:x.contract,shadow_present:!!x.shadow,final_present:!!x.final})),D1:out.D1,error:out.error}));if(out.status!=='EXACT_REFUSALS_AND_FAIR_QUEUE_READ_CLOSED')process.exitCode=1;
