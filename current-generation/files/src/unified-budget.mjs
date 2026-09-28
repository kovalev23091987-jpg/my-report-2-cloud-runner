export const BYK_PLAN=Object.freeze({
  month_days:31,units_per_deep:5,project_month_cap:13_500,scheduled_month_cap:12_900,
  categories:Object.freeze({scheduled:{daily:72,monthly_units:11_160,scheduled:true},manual_full:{daily:3,monthly_units:465,scheduled:false},manual_coin:{daily:5,monthly_units:775,scheduled:false},burst:{daily:6,monthly_units:930,scheduled:true}}),
  planned_month_units:13_330,planned_scheduled_units:12_090,project_headroom:170,
});
export const HTTP_LIMITS=Object.freeze({whole_job:164,hot:120,background:28,statistics:16,full_deep:50,standard_supplemental:5,liquidation_only:8,hub_daily:900});
export const D1_DAILY_LIMITS=Object.freeze({rows_read:3_500_000,rows_written:70_000,planned_rows_read:3_374_000,planned_rows_written:66_160});

const int=(value,min=0)=>Number.isSafeInteger(Number(value))&&Number(value)>=min?Number(value):null;
export function proveBykWorstCase(plan=BYK_PLAN){
  const categories=Object.entries(plan.categories);
  const monthly=categories.reduce((sum,[,{daily}])=>sum+daily*plan.month_days*plan.units_per_deep,0);
  const scheduled=categories.filter(([,v])=>v.scheduled).reduce((sum,[,{daily}])=>sum+daily*plan.month_days*plan.units_per_deep,0);
  const dailyFulls=categories.reduce((sum,[,{daily}])=>sum+daily,0);
  return {closed:monthly===plan.planned_month_units&&scheduled===plan.planned_scheduled_units&&monthly<=plan.project_month_cap&&scheduled<=plan.scheduled_month_cap,monthly_units:monthly,scheduled_units:scheduled,daily_fulls:dailyFulls,project_headroom:plan.project_month_cap-monthly};
}

export function admitDailyDeep({category,daily_counts={}}={}){
  const normalized=category==='liquidation_only'?'manual_coin':category;
  const spec=BYK_PLAN.categories[normalized];
  if(!spec)return {allowed:false,status:'UNKNOWN_CATEGORY',byk_units:0};
  const used=int(daily_counts[normalized]??0,0);
  if(used===null||used>=spec.daily)return {allowed:false,status:'DAILY_CATEGORY_CAP_EXHAUSTED',byk_units:0,category:normalized};
  return {allowed:true,status:'ADMITTED',category:normalized,byk_units:category==='liquidation_only'?0:BYK_PLAN.units_per_deep};
}

export function createUnifiedHttpBudget(limits=HTTP_LIMITS){
  const used={hot:0,background:0,statistics:0};const keys=new Map();
  const reserve=({logical_request_id,lane,attempts,unknown=false}={})=>{
    const id=String(logical_request_id||'').trim(),n=int(attempts,1);
    if(!id||!Object.hasOwn(used,lane)||n===null)return {allowed:false,status:'INVALID_HTTP_RESERVATION'};
    if(keys.has(id))return {...keys.get(id),duplicate:true};
    const laneCap=limits[lane],total=Object.values(used).reduce((a,b)=>a+b,0);
    if(used[lane]+n>laneCap||total+n>limits.whole_job)return {allowed:false,status:'HTTP_BUDGET_EXHAUSTED',lane};
    used[lane]+=n;const result={allowed:true,status:unknown?'RESERVED_UNKNOWN':'RESERVED',lane,attempts:n,logical_request_id:id,duplicate:false};keys.set(id,result);return result;
  };
  return {reserve,summary:()=>({used:{...used},total:Object.values(used).reduce((a,b)=>a+b,0),limits:{...limits},remaining:limits.whole_job-Object.values(used).reduce((a,b)=>a+b,0)})};
}

export async function installUnifiedBykLedger(db){
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS report2_provider_budget_v2(provider TEXT NOT NULL,accounting_period TEXT NOT NULL,project_cap INTEGER NOT NULL,scheduled_cap INTEGER NOT NULL,spent_or_outstanding INTEGER NOT NULL DEFAULT 0,scheduled_spent_or_outstanding INTEGER NOT NULL DEFAULT 0,last_reservation_key TEXT,version INTEGER NOT NULL DEFAULT 0,updated_ts INTEGER NOT NULL,PRIMARY KEY(provider,accounting_period))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS report2_provider_reservation_v2(provider TEXT NOT NULL,accounting_period TEXT NOT NULL,logical_request_id TEXT NOT NULL,attempt_no INTEGER NOT NULL,reservation_key TEXT NOT NULL UNIQUE,category TEXT NOT NULL,units INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('RESERVED','CONFIRMED','UNKNOWN')),created_ts INTEGER NOT NULL,updated_ts INTEGER NOT NULL,PRIMARY KEY(provider,accounting_period,logical_request_id,attempt_no))`),
  ]);
}

export async function reserveBykAttempt(db,{logical_request_id,attempt_no,category,units=5,protected_remaining=0,provider_remaining,now=Date.now()}={}){
  const request=String(logical_request_id||'').trim(),attempt=int(attempt_no,1),cost=int(units,1),protectedUnits=int(protected_remaining,0),remaining=int(provider_remaining,0);
  if(!request||attempt===null||cost===null||cost>5||protectedUnits===null||remaining===null)return {allowed:false,status:'INVALID_PROVIDER_RESERVATION'};
  const period=new Date(now).toISOString().slice(0,7),provider='BYK',scheduled=['scheduled','burst'].includes(category),key=`${provider}:${period}:${request}:${attempt}`;
  await db.batch([
    db.prepare(`INSERT INTO report2_provider_budget_v2(provider,accounting_period,project_cap,scheduled_cap,spent_or_outstanding,scheduled_spent_or_outstanding,last_reservation_key,version,updated_ts) VALUES(?1,?2,13500,12900,0,0,NULL,0,?3) ON CONFLICT(provider,accounting_period) DO NOTHING`).bind(provider,period,now),
    db.prepare(`UPDATE report2_provider_budget_v2 SET spent_or_outstanding=spent_or_outstanding+?1,scheduled_spent_or_outstanding=scheduled_spent_or_outstanding+CASE WHEN ?2=1 THEN ?1 ELSE 0 END,last_reservation_key=?3,version=version+1,updated_ts=?4 WHERE provider=?5 AND accounting_period=?6 AND spent_or_outstanding+?1+?7<=project_cap AND (?2=0 OR scheduled_spent_or_outstanding+?1<=scheduled_cap) AND ?1+?7<=?8 AND NOT EXISTS(SELECT 1 FROM report2_provider_reservation_v2 WHERE provider=?5 AND accounting_period=?6 AND logical_request_id=?9 AND attempt_no=?10)`).bind(cost,scheduled?1:0,key,now,provider,period,protectedUnits,remaining,request,attempt),
    db.prepare(`INSERT INTO report2_provider_reservation_v2(provider,accounting_period,logical_request_id,attempt_no,reservation_key,category,units,state,created_ts,updated_ts) SELECT ?1,?2,?3,?4,?5,?6,?7,'RESERVED',?8,?8 FROM report2_provider_budget_v2 WHERE provider=?1 AND accounting_period=?2 AND last_reservation_key=?5 ON CONFLICT(provider,accounting_period,logical_request_id,attempt_no) DO NOTHING`).bind(provider,period,request,attempt,key,category,cost,now),
  ]);
  const row=await db.prepare(`SELECT reservation_key,units,state FROM report2_provider_reservation_v2 WHERE provider=?1 AND accounting_period=?2 AND logical_request_id=?3 AND attempt_no=?4`).bind(provider,period,request,attempt).first();
  const allowed=row?.reservation_key===key&&Number(row?.units)===cost;
  return {allowed,status:allowed?(row.state==='RESERVED'?'RESERVED':'ALREADY_ACCOUNTED'):'QUOTA_OR_PROTECTED_RESERVE_BLOCKED',provider,accounting_period:period,reservation_key:allowed?key:null,units:allowed?cost:0,state:row?.state||null};
}

export async function markBykAttemptUnknown(db,reservation_key,{now=Date.now()}={}){
  await db.prepare(`UPDATE report2_provider_reservation_v2 SET state='UNKNOWN',updated_ts=?1 WHERE reservation_key=?2 AND state='RESERVED'`).bind(now,reservation_key).run();
  const row=await db.prepare(`SELECT state,units FROM report2_provider_reservation_v2 WHERE reservation_key=?1`).bind(reservation_key).first();
  return {status:row?.state||'NOT_FOUND',refunded:false,units:Number(row?.units||0)};
}
