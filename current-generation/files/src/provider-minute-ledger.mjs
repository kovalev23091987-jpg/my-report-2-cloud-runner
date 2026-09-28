export const PROVIDER_MINUTE_LEDGER_VERSION='provider-minute-ledger-v1-20260928';

const text=value=>String(value??'').trim().toUpperCase();

export async function installProviderMinuteLedger(db){
 if(!db?.prepare)throw new Error('PROVIDER_MINUTE_LEDGER_DB_REQUIRED');
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_provider_minute_ledger_v1(
   provider TEXT NOT NULL,minute_bucket INTEGER NOT NULL,reservation_id TEXT NOT NULL,
   units INTEGER NOT NULL CHECK(units>0),created_ts INTEGER NOT NULL,
   PRIMARY KEY(provider,minute_bucket,reservation_id))`).run();
 await db.prepare(`CREATE INDEX IF NOT EXISTS idx_report2_provider_minute_ledger_v1_window
   ON report2_provider_minute_ledger_v1(provider,created_ts)`).run();
 await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_report2_provider_minute_ledger_v1_reservation
   ON report2_provider_minute_ledger_v1(provider,reservation_id)`).run();
}

export async function reserveProviderMinuteUnits(db,{provider,reservation_id,units,now=Date.now(),cap=30}={}){
 const source=text(provider),id=String(reservation_id??'').trim(),count=Number(units),limit=Number(cap),ts=Number(now),minute=Math.floor(ts/60_000)*60_000;
 if(!db?.prepare||!source||!id||!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(limit)||limit<1||count>limit||!Number.isSafeInteger(ts))return{allowed:false,status:'INVALID_PROVIDER_MINUTE_RESERVATION',reserved_units:0};
 try{
  await db.prepare(`INSERT INTO report2_provider_minute_ledger_v1(provider,minute_bucket,reservation_id,units,created_ts)
    SELECT ?1,?2,?3,?4,?5
    WHERE (SELECT COALESCE(SUM(units),0) FROM report2_provider_minute_ledger_v1 WHERE provider=?1 AND created_ts>?6 AND created_ts<=?5) + ?4 <= ?7
    ON CONFLICT DO NOTHING`).bind(source,minute,id,count,ts,ts-60_000,limit).run();
  const exact=await db.prepare(`SELECT units FROM report2_provider_minute_ledger_v1 WHERE provider=?1 AND reservation_id=?2 LIMIT 1`).bind(source,id).first();
  const total=await db.prepare(`SELECT COALESCE(SUM(units),0) AS units FROM report2_provider_minute_ledger_v1 WHERE provider=?1 AND created_ts>?2 AND created_ts<=?3`).bind(source,ts-60_000,ts).first();
  const allowed=Number(exact?.units)===count&&Number(total?.units)<=limit;
  return{allowed,status:allowed?'RESERVED_OR_IDENTICAL':'ROLLING_60S_CAP_REACHED',provider:source,minute_bucket:minute,reserved_units:allowed?count:0,rolling_units:Number(total?.units??0),cap:limit};
 }catch(error){return{allowed:false,status:'ADMISSION_LEDGER_UNAVAILABLE',provider:source,reserved_units:0,error:String(error?.message||error).slice(0,160)};}
}

export default{PROVIDER_MINUTE_LEDGER_VERSION,installProviderMinuteLedger,reserveProviderMinuteUnits};
