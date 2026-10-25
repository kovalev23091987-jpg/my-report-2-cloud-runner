import {BudgetRefusal,RESOURCE_LIMITS,utcDay} from './budget.mjs';
import {D1Store} from './store.mjs';

// Reuse the project's existing shared day ledger, rather than create an
// independent SQL quota. Every legacy reservation/unknown retains its meaning.
export const NATIVE_POLICY = Object.freeze({version:'pump-native-v1',rows_read:5000,rows_written:300,manual_checks:6,bootstrap_or_external_floor:{rows_read:59000,rows_written:920},outcomes_protected:{rows_read:20000,rows_written:8000},delivery_protected:{rows_read:2000,rows_written:600},next_full:{rows_read:59000,rows_written:920},evidence_ref:'checkpoints/pump-report-20261025/MANUAL_RELATIVE_MAP_ADMISSION.json'});
export const LOOKUP_ENVELOPE=Object.freeze({rows_read:500,rows_written:30,max_runs_day:10});

function knownMeta(result){return result?.success!==false&&['rows_read','rows_written'].every(k=>Number.isSafeInteger(result?.meta?.[k])&&result.meta[k]>=0);}

export async function reserveNativeRun({db,run_id,mode,clock=Date.now,policy=NATIVE_POLICY}){
  if(!db?.prepare||!run_id||!['AUTO','MANUAL','STATISTICS','CONTROL','LOOKUP','DELIVERY_CHECK','MAP_CHECK'].includes(mode)||!policy.evidence_ref)throw new BudgetRefusal('NATIVE_RESERVATION_CONTEXT_REQUIRED');
  const now=clock(),day=utcDay(now),id='PUMP:'+mode+':'+run_id;
  const envelope=['LOOKUP','MAP_CHECK'].includes(mode)?LOOKUP_ENVELOPE:policy;
  const protectedR=policy.bootstrap_or_external_floor.rows_read+policy.outcomes_protected.rows_read+policy.delivery_protected.rows_read+policy.next_full.rows_read;
  const protectedW=policy.bootstrap_or_external_floor.rows_written+policy.outcomes_protected.rows_written+policy.delivery_protected.rows_written+policy.next_full.rows_written;
  const sql=`INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts)
    SELECT ?1,?2,?3,?4,'RESERVED',?5 FROM (
      SELECT COALESCE(SUM(MAX(reserve_rows_read,COALESCE(measured_rows_read,0)+CASE WHEN state='FINALIZED' THEN 1 ELSE 0 END)),0) AS r,
      COALESCE(SUM(MAX(reserve_rows_written,COALESCE(measured_rows_written,0))),0) AS w,
      COALESCE(SUM(CASE WHEN state='FINALIZED' AND COALESCE(unknown_ops,1)>0 THEN 1 ELSE 0 END),0) AS unknown_count,
      COALESCE(SUM(CASE WHEN state='RESERVED' AND (reservation_id NOT LIKE 'PUMP:%' OR started_ts<?6) THEN 1 ELSE 0 END),0) AS unacknowledged,
      COALESCE(SUM(CASE WHEN reservation_id LIKE 'PUMP:MANUAL:%' THEN 1 ELSE 0 END),0) AS manual_count
      ,COALESCE(SUM(CASE WHEN reservation_id LIKE 'PUMP:CONTROL:%' THEN 1 ELSE 0 END),0) AS control_count
      ,COALESCE(SUM(CASE WHEN reservation_id LIKE 'PUMP:LOOKUP:%' THEN 1 ELSE 0 END),0) AS lookup_count
      ,COALESCE(SUM(CASE WHEN reservation_id LIKE 'PUMP:DELIVERY_CHECK:%' THEN 1 ELSE 0 END),0) AS delivery_check_count
      ,COALESCE(SUM(CASE WHEN reservation_id LIKE 'PUMP:MAP_CHECK:%' THEN 1 ELSE 0 END),0) AS map_check_count
      FROM report2_runner_budget_ledger_shadow INDEXED BY idx_report2_runner_budget_day WHERE day_utc=?2
    ) WHERE unknown_count=0 AND unacknowledged=0
      AND (?13=0 OR control_count<5)
      AND (?16=0 OR lookup_count<?17)
      AND (?18=0 OR delivery_check_count<1)
      AND (?19=0 OR map_check_count<1)
      AND r+?3+?7+MAX(0,?8-manual_count-?9)*?14<=?10
      AND w+?4+?11+MAX(0,?8-manual_count-?9)*?15<=?12`;
  let inserted;const usage={requests:0,rows_read:0,rows_written:0,unknown_ops:0};
  try{inserted=await db.prepare(sql).bind(id,day,envelope.rows_read,envelope.rows_written,now,now-900000,protectedR,policy.manual_checks,mode==='MANUAL'?1:0,RESOURCE_LIMITS.d1_reads_day,protectedW,RESOURCE_LIMITS.d1_writes_day,mode==='CONTROL'?1:0,policy.rows_read,policy.rows_written,mode==='LOOKUP'?1:0,LOOKUP_ENVELOPE.max_runs_day,mode==='DELIVERY_CHECK'?1:0,mode==='MAP_CHECK'?1:0).all();}catch{throw new BudgetRefusal('NATIVE_RESERVATION_ACK_UNKNOWN');}
  usage.requests++;if(!knownMeta(inserted))throw new BudgetRefusal('NATIVE_RESERVATION_COST_UNKNOWN');
  usage.rows_read+=inserted.meta.rows_read;usage.rows_written+=inserted.meta.rows_written;
  if(inserted.meta.changes!==1)throw new BudgetRefusal('SHARED_NATIVE_DAY_BLOCKED_OR_DUPLICATE',{usage});
  let back;try{back=await db.prepare('SELECT reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1 LIMIT 1').bind(id).all();}catch{throw new BudgetRefusal('NATIVE_RESERVATION_READBACK_UNKNOWN');}
  usage.requests++;if(!knownMeta(back))throw new BudgetRefusal('NATIVE_RESERVATION_READBACK_COST_UNKNOWN');
  usage.rows_read+=back.meta.rows_read;usage.rows_written+=back.meta.rows_written;
  const row=back.results?.[0];if(row?.reservation_id!==id||row.state!=='RESERVED'||row.day_utc!==day||row.reserve_rows_read!==envelope.rows_read||row.reserve_rows_written!==envelope.rows_written)throw new BudgetRefusal('NATIVE_RESERVATION_READBACK_MISMATCH');
  const admission={evidence_ref:policy.evidence_ref+'#'+id,expires_ts:now+900000,max_rows_read:envelope.rows_read,max_rows_written:envelope.rows_written};
  const store=new D1Store({db,admission,clock,initial_usage:usage,finalization_reserve:{rows_read:2,rows_written:1}});
  return {store,reservation_id:id,run_id,mode,day_utc:day,policy,admission};
}

export async function finalizeNativeRun(receipt,{clock=Date.now}={}){
  const {store,reservation_id,run_id}=receipt,cost=store.usage();
  if(cost.unknown_ops>0)throw new BudgetRefusal('UNKNOWN_NATIVE_RUN_REMAINS_RESERVED');
  store.beginFinalization();
  // Include the final UPDATE and exact PK readback; retain original envelopes.
  const read=cost.rows_read+2,write=cost.rows_written+1,requests=cost.requests+2;
  const r=await store.query(`UPDATE report2_runner_budget_ledger_shadow SET source_run_id=?2,measured_rows_read=?3,measured_rows_written=?4,measured_requests=?5,unknown_ops=0,state='FINALIZED',completed_ts=?6,reserve_rows_read=MAX(reserve_rows_read,?3),reserve_rows_written=MAX(reserve_rows_written,?4) WHERE reservation_id=?1 AND state='RESERVED'`,[reservation_id,run_id,read,write,requests,clock()],{read:1,write:1});
  if(r.meta.changes!==1)throw new BudgetRefusal('NATIVE_FINALIZATION_NOT_OWNED');
  const back=await store.query('SELECT source_run_id,state,measured_rows_read,measured_rows_written FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1 LIMIT 1',[reservation_id]);
  const row=back.results?.[0];if(row?.state!=='FINALIZED'||row.source_run_id!==run_id||row.measured_rows_read!==read||row.measured_rows_written!==write)throw new BudgetRefusal('NATIVE_FINALIZATION_READBACK_MISMATCH');
  return {state:'FINALIZED',reservation_id,usage:store.usage(),accounted_upper_bound:{rows_read:read,rows_written:write},original_envelope_never_reduced:true};
}
