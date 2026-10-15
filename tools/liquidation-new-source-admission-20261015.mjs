import {TWO_CANDIDATE_PLAN} from '../current-generation/files/src/two-candidate-policy.mjs';
import {CANONICAL_COPY_POLICY} from '../runner/canonical-cold-copy.mjs';
export const NEW_LIQ_SOURCE_RESEARCH=Object.freeze({family:'LIQ_NEW_SOURCE_VALIDATE',maximum_provider_HTTP:3,max_runs_day:2,reservation:Object.freeze({rows_read:2500,rows_written:40}),protected_next_full:Object.freeze({rows_read:TWO_CANDIDATE_PLAN.d1_run_cap.rows_read+CANONICAL_COPY_POLICY.reservation.rows_read,rows_written:TWO_CANDIDATE_PLAN.d1_run_cap.rows_written+CANONICAL_COPY_POLICY.reservation.rows_written}),complete_day_guarantee:false,planning_status:'LEGACY_WHOLE_DAY_MODELS_REQUIRE_CONSOLIDATION',limits:Object.freeze({rows_read:3500000,rows_written:70000})});

export async function reserveNewLiquidationSourceResearch(db,{id,now}={}){
 if(!/^LIQ_NEW_SOURCE_VALIDATE:(?:(?:VIKE|HYPERPERPS):)?\d+:\d+$/.test(id||'')||!Number.isSafeInteger(now)||now<=0)throw Error('EXACT_NEW_LIQ_RESEARCH_REQUIRED');
 const p=NEW_LIQ_SOURCE_RESEARCH,day=new Date(now).toISOString().slice(0,10);
 // Two distinct source qualifications share the same existing family and sums.
 // Legacy reservations (including the completed PumpGlass run) remain counted.
 // This does not add/reset retention, native-source or manual allowances.
 // Every existing family remains in the same native daily sums.
 const ack=await db.prepare(`INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts)
 SELECT ?1,?2,?3,?4,'RESERVED',?5 FROM (
 SELECT COALESCE(SUM(MAX(reserve_rows_read,COALESCE(measured_rows_read,0)+CASE WHEN state='FINALIZED' THEN 1 ELSE 0 END)),0) AS reads,COALESCE(SUM(MAX(reserve_rows_written,COALESCE(measured_rows_written,0))),0) AS writes,
 COALESCE(SUM(CASE WHEN state='FINALIZED' AND COALESCE(unknown_ops,1)>0 THEN 1 ELSE 0 END),0) AS unknown_count,
 COALESCE(SUM(CASE WHEN reservation_id LIKE 'LIQ_NEW_SOURCE_VALIDATE:%' THEN 1 ELSE 0 END),0) AS prior_count,
 COALESCE(SUM(CASE WHEN reservation_id GLOB ?9 THEN 1 ELSE 0 END),0) AS same_provider_count
 FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2)
 WHERE reads+?3<=?6 AND writes+?4<=?7 AND unknown_count=0 AND prior_count<?8 AND same_provider_count<1`).bind(id,day,p.reservation.rows_read,p.reservation.rows_written,now,p.limits.rows_read-p.protected_next_full.rows_read,p.limits.rows_written-p.protected_next_full.rows_written,p.max_runs_day,id.startsWith('LIQ_NEW_SOURCE_VALIDATE:VIKE:')?'LIQ_NEW_SOURCE_VALIDATE:VIKE:*':id.startsWith('LIQ_NEW_SOURCE_VALIDATE:HYPERPERPS:')?'LIQ_NEW_SOURCE_VALIDATE:HYPERPERPS:*':'LIQ_NEW_SOURCE_VALIDATE:[0-9]*').run();
 if(ack?.meta?.changes!==1)return{allowed:false,status:'NEW_LIQ_SHARED_DAY_NOT_ADMITTED'};
 const row=await db.prepare('SELECT day_utc,reserve_rows_read,reserve_rows_written,state FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1 LIMIT 1').bind(id).first();
 if(row?.state!=='RESERVED'||row.day_utc!==day||row.reserve_rows_read!==p.reservation.rows_read||row.reserve_rows_written!==p.reservation.rows_written)throw Error('NEW_LIQ_RESERVATION_READBACK_REQUIRED');
 return{allowed:true,protected_next_full:p.protected_next_full,complete_day_guarantee:false,status:'ATOMIC_SHARED_DAY_RESERVED',reservation:p.reservation};
}
