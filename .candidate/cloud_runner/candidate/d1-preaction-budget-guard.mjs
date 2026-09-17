const SCHEMA = 'report2-d1-reservation-budget-v2';

function nonNegInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
function posInt(value) {
  const n = nonNegInt(value);
  return n !== null && n > 0 ? n : null;
}
function utcDay(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) throw new Error('D1_BUDGET_TS_INVALID');
  return new Date(n).toISOString().slice(0, 10);
}

export function deriveRunReservation({ runsPerDay=288, maxDailyReads=3_500_000, maxDailyWrites=70_000 }={}) {
  const rpd=posInt(runsPerDay), maxR=posInt(maxDailyReads), maxW=posInt(maxDailyWrites);
  if ([rpd,maxR,maxW].some(v=>v===null)) return {ok:false,status:'LIMITS_INVALID'};
  const rr=Math.floor(maxR/rpd), rw=Math.floor(maxW/rpd);
  if (rr<1 || rw<1) return {ok:false,status:'PER_RUN_RESERVATION_ZERO'};
  return {ok:true,status:'CLOSED',runs_per_day:rpd,rows_read:rr,rows_written:rw,
    daily_reserved_if_all_runs:{rows_read:rr*rpd,rows_written:rw*rpd},
    daily_limits:{rows_read:maxR,rows_written:maxW}};
}

export function parseDailyUsageAggregate(row, expectedDay) {
  const day=String(expectedDay||'');
  const empty={ok:false,status:'NOT_CLOSED',day_utc:day,run_count:null,reserved_rows_read:null,reserved_rows_written:null,
    measured_rows_read:null,measured_rows_written:null,unknown_ops:null,unfinished_count:null};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) return {...empty,status:'DAY_KEY_INVALID'};
  if(row==null) return {...empty,status:'DAY_AGGREGATE_MISSING'};
  const count=nonNegInt(row.run_count);
  if(count===null) return {...empty,status:'DAY_RUN_COUNT_UNKNOWN'};
  if(count===0){
    const keys=['reserved_rows_read','reserved_rows_written','measured_rows_read','measured_rows_written','unknown_ops','unfinished_count'];
    if(!keys.every(k=>row[k]==null)) return {...empty,status:'EMPTY_DAY_SUM_CONTRADICTION',run_count:0};
    return {ok:true,status:'NEW_DAY_EMPTY_CONFIRMED',day_utc:day,run_count:0,reserved_rows_read:0,reserved_rows_written:0,
      measured_rows_read:0,measured_rows_written:0,unknown_ops:0,unfinished_count:0};
  }
  const values={
    reserved_rows_read:nonNegInt(row.reserved_rows_read), reserved_rows_written:nonNegInt(row.reserved_rows_written),
    measured_rows_read:nonNegInt(row.measured_rows_read), measured_rows_written:nonNegInt(row.measured_rows_written),
    unknown_ops:nonNegInt(row.unknown_ops), unfinished_count:nonNegInt(row.unfinished_count),
  };
  if(Object.values(values).some(v=>v===null)) return {...empty,status:'NONEMPTY_DAY_USAGE_NULL_OR_INVALID',run_count:count};
  if(values.unfinished_count>count) return {...empty,status:'DAY_UNFINISHED_COUNT_CONTRADICTION',run_count:count};
  return {ok:true,status:'DAY_USAGE_CLOSED',day_utc:day,run_count:count,...values};
}

export async function loadDailyUsageAggregate(db, now=Date.now()) {
  if(!db?.prepare) throw new Error('D1_DB_REQUIRED');
  const day=utcDay(now);
  const row=await db.prepare(`
    SELECT COUNT(*) AS run_count,
           SUM(reserve_rows_read) AS reserved_rows_read,
           SUM(reserve_rows_written) AS reserved_rows_written,
           SUM(CASE WHEN state='FINALIZED' THEN measured_rows_read ELSE 0 END) AS measured_rows_read,
           SUM(CASE WHEN state='FINALIZED' THEN measured_rows_written ELSE 0 END) AS measured_rows_written,
           SUM(CASE WHEN state='FINALIZED' THEN COALESCE(unknown_ops,1) ELSE 0 END) AS unknown_ops,
           SUM(CASE WHEN state='RESERVED' THEN 1 ELSE 0 END) AS unfinished_count
    FROM report2_runner_budget_ledger_shadow
    WHERE day_utc=?1
  `).bind(day).first();
  return parseDailyUsageAggregate(row,day);
}

export async function reserveRunBudget(db,{reservationId,now=Date.now(),reservation}={}){
  if(!db?.prepare) throw new Error('D1_DB_REQUIRED');
  const id=String(reservationId||'').trim();
  if(!id) throw new Error('D1_BUDGET_RESERVATION_ID_REQUIRED');
  const rr=posInt(reservation?.rows_read), rw=posInt(reservation?.rows_written);
  if(rr===null||rw===null) throw new Error('D1_BUDGET_RESERVATION_INVALID');
  const day=utcDay(now);
  const result=await db.prepare(`
    INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow
      (reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts)
    VALUES (?1,?2,?3,?4,'RESERVED',?5)
  `).bind(id,day,rr,rw,Number(now)).run();
  const changes=Number(result?.meta?.changes ?? result?.changes);
  if(!Number.isSafeInteger(changes)||changes<0||changes>1) throw new Error('D1_BUDGET_RESERVATION_ACK_INVALID');
  const row=await db.prepare(`SELECT reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1 LIMIT 1`).bind(id).first();
  if(!row||String(row.reservation_id)!==id||String(row.day_utc)!==day||Number(row.reserve_rows_read)!==rr||Number(row.reserve_rows_written)!==rw||!['RESERVED','FINALIZED'].includes(String(row.state||'')))
    throw new Error('D1_BUDGET_RESERVATION_READBACK_FAIL_CLOSED');
  if(changes===0) throw new Error(`D1_BUDGET_DUPLICATE_RESERVATION_${String(row.state||'UNKNOWN')}`);
  return {schema:SCHEMA,status:'RESERVED',reservation_id:id,day_utc:day,rows_read:rr,rows_written:rw};
}

export function evaluateDailyReservationBudget({daily,nextReservation=null,maxDailyReads=3_500_000,maxDailyWrites=70_000}={}){
  const base={schema:SCHEMA,allowed:false,status:'NOT_CLOSED'};
  if(!daily?.ok) return {...base,status:daily?.status||'DAY_USAGE_NOT_CLOSED',daily:daily??null};
  const maxR=posInt(maxDailyReads),maxW=posInt(maxDailyWrites);
  if(maxR===null||maxW===null) return {...base,status:'LIMITS_INVALID',daily};
  if(daily.unknown_ops>0) return {...base,status:'UNMEASURED_FINALIZED_USAGE',daily};
  const addR=nextReservation===null?0:posInt(nextReservation?.rows_read);
  const addW=nextReservation===null?0:posInt(nextReservation?.rows_written);
  if(addR===null||addW===null) return {...base,status:'NEXT_RESERVATION_INVALID',daily};
  const projectedReservedReads=daily.reserved_rows_read+addR;
  const projectedReservedWrites=daily.reserved_rows_written+addW;
  const reasons=[];
  if(projectedReservedReads>maxR) reasons.push('DAY_RESERVED_READS_UNSAFE');
  if(projectedReservedWrites>maxW) reasons.push('DAY_RESERVED_WRITES_UNSAFE');
  return {...base,allowed:reasons.length===0,status:reasons.length?'BLOCKED':'CLOSED',reasons,daily,
    next_reservation:nextReservation===null?null:{rows_read:addR,rows_written:addW},
    projected_reserved:{rows_read:projectedReservedReads,rows_written:projectedReservedWrites},
    limits:{rows_read:maxR,rows_written:maxW}};
}

export function evaluateWithinRunReservation({reservation,currentUsage,extraRowsRead=0,extraRowsWritten=0}={}){
  const base={schema:SCHEMA,allowed:false,status:'NOT_CLOSED'};
  const rr=nonNegInt(currentUsage?.rows_read),rw=nonNegInt(currentUsage?.rows_written),req=nonNegInt(currentUsage?.requests),uo=nonNegInt(currentUsage?.unknown_ops);
  const capR=posInt(reservation?.rows_read),capW=posInt(reservation?.rows_written),xR=nonNegInt(extraRowsRead),xW=nonNegInt(extraRowsWritten);
  if([rr,rw,req,uo,capR,capW,xR,xW].some(v=>v===null)) return {...base,status:'CURRENT_USAGE_OR_RESERVATION_INVALID'};
  if(uo>0) return {...base,status:'UNMEASURED_D1_USAGE',current_usage:currentUsage};
  const reasons=[];
  if(rr+xR>capR) reasons.push('RUN_READ_RESERVATION_EXCEEDED');
  if(rw+xW>capW) reasons.push('RUN_WRITE_RESERVATION_EXCEEDED');
  return {...base,allowed:reasons.length===0,status:reasons.length?'BLOCKED':'CLOSED',reasons,
    current_usage:{rows_read:rr,rows_written:rw,requests:req,unknown_ops:uo},extra:{rows_read:xR,rows_written:xW},reservation:{rows_read:capR,rows_written:capW},
    remaining:{rows_read:Math.max(0,capR-rr),rows_written:Math.max(0,capW-rw)}};
}

export async function finalizeRunUsage(db,{reservationId,sourceRunId,now=Date.now(),usage}={}){
  if(!db?.prepare) throw new Error('D1_DB_REQUIRED');
  const id=String(reservationId||'').trim(),run=String(sourceRunId||'').trim();
  if(!id||!run) throw new Error('D1_USAGE_IDENTIFIERS_REQUIRED');
  const rr=nonNegInt(usage?.rows_read),rw=nonNegInt(usage?.rows_written),req=nonNegInt(usage?.requests),uo=nonNegInt(usage?.unknown_ops);
  if([rr,rw,req,uo].some(v=>v===null)) throw new Error('D1_USAGE_SNAPSHOT_INVALID');
  // Account for this UPDATE itself as one write/request. The reservation, not this
  // measured telemetry, is the authoritative daily safety ceiling.
  const result=await db.prepare(`
    UPDATE report2_runner_budget_ledger_shadow
    SET source_run_id=?2, measured_rows_read=?3, measured_rows_written=?4,
        measured_requests=?5, unknown_ops=?6, state='FINALIZED', completed_ts=?7
    WHERE reservation_id=?1 AND state='RESERVED'
  `).bind(id,run,rr,rw+1,req+1,uo,Number(now)).run();
  const changes=Number(result?.meta?.changes ?? result?.changes);
  if(changes!==1) throw new Error(`D1_USAGE_FINALIZE_ACK_INVALID:${String(changes)}`);
  return {schema:SCHEMA,status:'FINALIZED',reservation_id:id,source_run_id:run,measured_rows_read:rr,measured_rows_written_accounted:rw+1,measured_requests_accounted:req+1,unknown_ops:uo};
}

export default {deriveRunReservation,parseDailyUsageAggregate,loadDailyUsageAggregate,reserveRunBudget,evaluateDailyReservationBudget,evaluateWithinRunReservation,finalizeRunUsage};
