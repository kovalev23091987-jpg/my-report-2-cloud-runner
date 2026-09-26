export const R88_BURST_RESERVATION = Object.freeze({ rows_read: 28000, rows_written: 560 });
export const R88_BUDGET_MODE = 'ADAPTIVE_DAILY_ACTUAL_WITH_BURST_CAP_V3_TZ_RECONCILED';

function nonNegInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
function posInt(value) {
  const n = nonNegInt(value);
  return n !== null && n > 0 ? n : null;
}

export function buildR88BurstReservation(nominal, burst = R88_BURST_RESERVATION) {
  if (!nominal?.ok) return { ...(nominal || {}), ok:false, status:nominal?.status || 'NOMINAL_RESERVATION_NOT_CLOSED' };
  const read = posInt(burst?.rows_read), write = posInt(burst?.rows_written);
  const maxRead = posInt(nominal?.daily_limits?.rows_read), maxWrite = posInt(nominal?.daily_limits?.rows_written);
  if ([read,write,maxRead,maxWrite].some(v => v === null)) return { ...nominal, ok:false, status:'R88_BURST_CONFIG_INVALID' };
  if (read > maxRead || write > maxWrite) return { ...nominal, ok:false, status:'R88_BURST_EXCEEDS_DAILY_LIMIT' };
  return {
    ...nominal,
    ok:true,
    status:'CLOSED_BURST',
    budget_mode:R88_BUDGET_MODE,
    nominal_rows_read:Number(nominal.rows_read),
    nominal_rows_written:Number(nominal.rows_written),
    rows_read:read,
    rows_written:write,
  };
}

export function buildR88DailyAdmissionView(daily, reservation) {
  if (!daily?.ok) return { ...(daily || {}), ok:false, status:daily?.status || 'DAY_USAGE_NOT_CLOSED' };
  const unfinished=nonNegInt(daily.unfinished_count);
  const measuredRead=nonNegInt(daily.measured_rows_read), measuredWrite=nonNegInt(daily.measured_rows_written);
  const capRead=posInt(reservation?.rows_read), capWrite=posInt(reservation?.rows_written);
  if ([unfinished,measuredRead,measuredWrite,capRead,capWrite].some(v=>v===null)) {
    return { ...daily, ok:false, status:'R88_DAILY_ADMISSION_VIEW_INVALID' };
  }
  const effectiveRead=measuredRead + unfinished*capRead;
  const effectiveWrite=measuredWrite + unfinished*capWrite;
  return {
    ...daily,
    budget_mode:R88_BUDGET_MODE,
    raw_reserved_rows_read:daily.reserved_rows_read,
    raw_reserved_rows_written:daily.reserved_rows_written,
    reserved_rows_read:effectiveRead,
    reserved_rows_written:effectiveWrite,
    adaptive_effective_rows_read:effectiveRead,
    adaptive_effective_rows_written:effectiveWrite,
    unfinished_reservation_cap:{rows_read:capRead,rows_written:capWrite},
  };
}

export function enforceR88RunBudget(db,{reservation,dayAdmission,runsPerDay=288,maxDailyReads=3500000,maxDailyWrites=70000}={}) {
  if (!db?.usageSnapshot) throw new Error('R88_D1_USAGE_SNAPSHOT_REQUIRED');
  const usage=db.usageSnapshot();
  const rr=nonNegInt(usage?.rows_read), rw=nonNegInt(usage?.rows_written), req=nonNegInt(usage?.requests), uo=nonNegInt(usage?.unknown_ops);
  const capR=posInt(reservation?.rows_read), capW=posInt(reservation?.rows_written);
  if ([rr,rw,req,uo,capR,capW].some(v=>v===null)) throw new Error('R88_RUN_USAGE_INVALID');
  if (uo>0) throw new Error(`D1_USAGE_UNMEASURED_OPS_${uo}`);
  if (rr>capR) throw new Error(`R88_RUN_READ_BURST_CAP_EXCEEDED:${rr}>${capR}`);
  if (rw>capW) throw new Error(`R88_RUN_WRITE_BURST_CAP_EXCEEDED:${rw}>${capW}`);
  if (dayAdmission?.allowed !== true) throw new Error(`R88_DAY_ADMISSION_NOT_CLOSED:${String(dayAdmission?.status||'UNKNOWN')}`);
  const targets=Object.entries(usage.targets||{}).map(([target,v])=>({target,...v}))
    .sort((a,b)=>(b.rows_read-a.rows_read)||(b.rows_written-a.rows_written)).slice(0,12);
  const report={
    budget_mode:R88_BUDGET_MODE,
    measured_rows_read:rr,measured_rows_written:rw,measured_requests:req,unknown_ops:uo,
    run_burst_cap:{rows_read:capR,rows_written:capW},
    run_headroom:{rows_read:capR-rr,rows_written:capW-rw},
    runs_per_day:Number(runsPerDay),
    naive_projected_daily_rows_read:rr*Number(runsPerDay),
    naive_projected_daily_rows_written:rw*Number(runsPerDay),
    safety_budget_daily_rows_read:Number(maxDailyReads),
    safety_budget_daily_rows_written:Number(maxDailyWrites),
    daily_admission_status:dayAdmission?.status||null,
    top_targets:targets,
  };
  console.log('D1_USAGE_TELEMETRY', JSON.stringify(report));
  return report;
}

export default {R88_BURST_RESERVATION,R88_BUDGET_MODE,buildR88BurstReservation,buildR88DailyAdmissionView,enforceR88RunBudget};
