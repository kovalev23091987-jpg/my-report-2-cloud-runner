import {createHash} from 'node:crypto';
export const LIQUIDATION_ALLOWANCE_GENERATION='DYNAMIC_PANEL_V3_20260927';
const fingerprint=provider=>createHash('sha256').update(`${LIQUIDATION_ALLOWANCE_GENERATION}|${provider}|REQUEST|10000`).digest('hex');
const providers=Object.freeze(['HYPERLIQUID','GTRADE','LIGHTER','GMX']);
const monthWindow=now=>{const d=new Date(now),start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1),end=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);return{start,end,key:new Date(start).toISOString().slice(0,7).replace('-','')};};

export async function installSourceAllowances({db,now=Date.now(),liqflow_key=''}={}){
 if(!db?.prepare||!db?.batch)throw Error('SOURCE_ALLOWANCE_DB_REQUIRED');
 const ddl=[`CREATE TABLE IF NOT EXISTS report2_liq_source_allowance_shadow (
  scope_id TEXT PRIMARY KEY, provider TEXT NOT NULL, unit TEXT NOT NULL CHECK(unit IN ('REQUEST','CREDIT','WEIGHT')),
  window_start_ts INTEGER NOT NULL, window_end_ts INTEGER NOT NULL CHECK(window_end_ts>window_start_ts),
  allowance_units INTEGER NOT NULL CHECK(allowance_units>=0), used_units INTEGER NOT NULL DEFAULT 0 CHECK(used_units>=0 AND used_units<=allowance_units),
  version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0), last_reservation_id TEXT, config_fingerprint TEXT NOT NULL,
  shared_quota_reviewed INTEGER NOT NULL CHECK(shared_quota_reviewed=1), active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)), schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version=1))`,
 `CREATE TABLE IF NOT EXISTS report2_liq_source_reservation_shadow (
  reservation_id TEXT PRIMARY KEY, scope_id TEXT NOT NULL REFERENCES report2_liq_source_allowance_shadow(scope_id), provider TEXT NOT NULL,
  contract_code TEXT NOT NULL, run_id TEXT NOT NULL, reserved_units INTEGER NOT NULL CHECK(reserved_units>0), expected_version INTEGER NOT NULL CHECK(expected_version>=0),
  committed_version INTEGER NOT NULL CHECK(committed_version=expected_version+1), created_ts INTEGER NOT NULL, reservation_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RESERVED_NOT_REFUNDED' CHECK(status='RESERVED_NOT_REFUNDED'))`,
 `CREATE INDEX IF NOT EXISTS idx_report2_liq_reservation_scope ON report2_liq_source_reservation_shadow(scope_id,created_ts)`];
 await db.batch(ddl.map(sql=>db.prepare(sql)));
 const window=monthWindow(now),active=[...providers,...(String(liqflow_key||'').trim()?['LIQFLOW']:[])],bindings={};
 const rows=active.map(provider=>{const scope_id=`${LIQUIDATION_ALLOWANCE_GENERATION}:${window.key}:${provider}`,config_fingerprint=fingerprint(provider);bindings[provider]={scope_id,config_fingerprint};return db.prepare(`INSERT INTO report2_liq_source_allowance_shadow
  (scope_id,provider,unit,window_start_ts,window_end_ts,allowance_units,used_units,version,last_reservation_id,config_fingerprint,shared_quota_reviewed,active,schema_version)
  VALUES(?1,?2,'REQUEST',?3,?4,10000,0,0,NULL,?5,1,1,1) ON CONFLICT(scope_id) DO NOTHING`).bind(scope_id,provider,window.start,window.end,config_fingerprint);});
 await db.batch(rows);
 return {status:'CLOSED',generation:LIQUIDATION_ALLOWANCE_GENERATION,window_start_ts:window.start,window_end_ts:window.end,bindings,providers:active,per_provider_operational_cap:10000,combined_run_http_cap:5,automatic_topup:false,old_generation_scope_reuse:false};
}
export default{installSourceAllowances};
