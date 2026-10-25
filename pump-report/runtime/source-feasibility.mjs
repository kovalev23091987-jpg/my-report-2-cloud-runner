import {ownerInstrumentExcluded} from '../contracts/index.mjs';
import {BINGX_IDENTITY_REGISTRY} from '../registry/index.mjs';

export async function readSharedNativeDayBudget({store,clock=Date.now}){
  const observed_ts=clock(),day=new Date(observed_ts).toISOString().slice(0,10);
  const reply=await store.query(`SELECT COUNT(*) AS reservation_count,
    COALESCE(SUM(MAX(reserve_rows_read,COALESCE(measured_rows_read,0)+CASE WHEN state='FINALIZED' THEN 1 ELSE 0 END)),0) AS accounted_reads_upper,
    COALESCE(SUM(MAX(reserve_rows_written,COALESCE(measured_rows_written,0))),0) AS accounted_writes_upper,
    COALESCE(SUM(CASE WHEN state='FINALIZED' AND COALESCE(unknown_ops,1)>0 THEN 1 ELSE 0 END),0) AS unknown_count,
    COALESCE(SUM(CASE WHEN state='RESERVED' AND (reservation_id NOT LIKE 'PUMP:%' OR started_ts<?2) THEN 1 ELSE 0 END),0) AS unacknowledged
    FROM (SELECT reservation_id,reserve_rows_read,reserve_rows_written,measured_rows_read,measured_rows_written,state,unknown_ops,started_ts
      FROM report2_runner_budget_ledger_shadow INDEXED BY idx_report2_runner_budget_day WHERE day_utc=?1 LIMIT 501)`,[day,observed_ts-900000],{read:1100});
  const row=reply.results?.[0];if(!row||Object.values(row).some(v=>!Number.isSafeInteger(v)||v<0))throw Error('SHARED_NATIVE_BUDGET_SNAPSHOT_INVALID');
  return {schema:'PUMP_SHARED_NATIVE_DAY_BOUNDED_SNAPSHOT_V1',day_utc:day,observed_ts,...row,complete:row.reservation_count<501,covers:'CURRENT_SHARED_SHADOW_TABLE_ONLY',whole_account_complete:false,original_reservations_not_refunded:true};
}

// A fixed source acceptance operation, never a trading signal or Telegram path.
export async function runSourceFeasibility({sources,broker,store,run_id,clock=Date.now,captured=[]}){
  const native_budget_snapshot=typeof store.query==='function'?await readSharedNativeDayBudget({store,clock}):null;
  if(native_budget_snapshot&&(!native_budget_snapshot.complete||native_budget_snapshot.unknown_count||native_budget_snapshot.unacknowledged))throw Error('SHARED_NATIVE_BUDGET_SNAPSHOT_INCOMPLETE_OR_UNKNOWN');
  await broker.awaitProviderWindow({provider:'BINGX',cost:3,deadline_ts:clock()+60001});
  const instruments=BINGX_IDENTITY_REGISTRY.map(r=>r.instrument).filter(i=>!ownerInstrumentExcluded(i));
  const instrument=instruments.find(i=>i.native_symbol==='SOL-USDT');
  if(!instrument)throw Error('SAVED_SOL_NATIVE_IDENTITY_UNBOUND');
  let optional=null,history=null,overview=null;
  const finish=async status=>{
    const provider_ledger_snapshot=await store.get('pump:resources');
    const result={schema:'PUMP_SOURCE_FEASIBILITY_ACTUAL_V1',run_id,status,run_purpose:'ACCEPTANCE_TEST',instrument,history,optional,overview,native_budget_snapshot,provider_ledger_snapshot,raw_responses:captured,publication_allowed:false,Telegram_attempts:0,current_catalog_refreshed:false,all550_operationally_qualified:false};
    const {raw_responses,...summary}=result;await store.set('pump:source-feasibility:'+run_id,summary);return result;
  };
  optional=await sources.getOptional({instrument,run_id,mode:'MANUAL'});if(broker.operationFailed())return finish('INCOMPLETE');
  history=await sources.getCore({instrument,run_id,mode:'MANUAL',force_refresh:true,only_facts:['candles']});if(broker.operationFailed())return finish('INCOMPLETE');
  overview=await sources.getOverview({run_id,instruments});return finish(broker.operationFailed()?'INCOMPLETE':'OBSERVED');
}
