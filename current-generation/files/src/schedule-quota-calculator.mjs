export const SCHEDULE_QUOTA_CALCULATOR_VERSION='schedule-quota-calculator-v1-20260927';

const int=(value,name,{min=0}={})=>{
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<min)throw new Error(`${name}_INVALID`);
  return n;
};

export function runsPerDayForInterval(intervalMinutes){
  const interval=int(intervalMinutes,'INTERVAL_MINUTES',{min:1});
  return Math.ceil(1440/interval);
}

export function calculateScheduleQuota({
  interval_minutes,
  days=31,
  manual_runs_per_day=8,
  units_per_run=5,
  operational_cap=13_500,
  official_quota=15_000,
  scheduled_cap=12_900,
}={}){
  const interval=int(interval_minutes,'INTERVAL_MINUTES',{min:1});
  const monthDays=int(days,'DAYS',{min:1});
  const manual=int(manual_runs_per_day,'MANUAL_RUNS_PER_DAY');
  const units=int(units_per_run,'UNITS_PER_RUN',{min:1});
  const operational=int(operational_cap,'OPERATIONAL_CAP',{min:1});
  const official=int(official_quota,'OFFICIAL_QUOTA',{min:1});
  const scheduledLimit=int(scheduled_cap,'SCHEDULED_CAP',{min:1});
  const scheduledRunsPerDay=runsPerDayForInterval(interval);
  const scheduledRuns=scheduledRunsPerDay*monthDays;
  const manualRuns=manual*monthDays;
  const scheduledUnits=scheduledRuns*units;
  const manualUnits=manualRuns*units;
  const totalUnits=scheduledUnits+manualUnits;
  const reasons=[];
  if(scheduledUnits>scheduledLimit)reasons.push('SCHEDULED_CAP_EXCEEDED');
  if(totalUnits>operational)reasons.push('OPERATIONAL_CAP_EXCEEDED');
  if(totalUnits>official)reasons.push('OFFICIAL_QUOTA_EXCEEDED');
  return Object.freeze({
    version:SCHEDULE_QUOTA_CALCULATOR_VERSION,
    interval_minutes:interval,
    days:monthDays,
    scheduled_runs_per_day:scheduledRunsPerDay,
    scheduled_runs:scheduledRuns,
    manual_runs:manualRuns,
    scheduled_units:scheduledUnits,
    manual_units:manualUnits,
    total_units:totalUnits,
    scheduled_headroom:scheduledLimit-scheduledUnits,
    operational_headroom:operational-totalUnits,
    official_headroom:official-totalUnits,
    safe:reasons.length===0,
    reasons,
  });
}

export function fastestSafeInterval({minimum=1,maximum=1440,...limits}={}){
  const lo=int(minimum,'MINIMUM_INTERVAL',{min:1});
  const hi=int(maximum,'MAXIMUM_INTERVAL',{min:lo});
  for(let interval=lo;interval<=hi;interval+=1){
    const result=calculateScheduleQuota({interval_minutes:interval,...limits});
    if(result.safe)return result;
  }
  return null;
}

export function cachedSourceMonthlyCalls({calls_per_refresh,ttl_minutes,days=31}={}){
  const calls=int(calls_per_refresh,'CALLS_PER_REFRESH');
  const ttl=int(ttl_minutes,'TTL_MINUTES',{min:1});
  const monthDays=int(days,'DAYS',{min:1});
  return calls*runsPerDayForInterval(ttl)*monthDays;
}

export default{runsPerDayForInterval,calculateScheduleQuota,fastestSafeInterval,cachedSourceMonthlyCalls};
