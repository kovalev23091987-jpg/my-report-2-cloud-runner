import fs from 'node:fs';
import path from 'node:path';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';

const required=name=>{const value=String(process.env[name]||'').trim();if(!value)throw new Error(`${name}_REQUIRED`);return value;};
const here=path.dirname(new URL(import.meta.url).pathname);
const db=new RemoteD1Database(required('REPORT2_D1_BRIDGE_URL'),required('REPORT2_D1_BRIDGE_TOKEN'),{timeoutMs:45_000});
for(const file of ['004_market_snapshot_batch.sql','009_public_collector_runtime.sql']){
  const sql=fs.readFileSync(path.resolve(here,'../../current-generation/migrations',file),'utf8');
  const statements=sql.split(';').map(value=>value.trim()).filter(Boolean);
  for(const statement of statements)await db.prepare(statement).run();
}
const result=await db.prepare(`SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name IN (
  'report2_market_snapshot_batch_v1','idx_report2_market_snapshot_batch_v1_range',
  'report2_public_collector_usage_v1','idx_report2_public_collector_usage_v1_day',
  'report2_public_collector_health_v1') ORDER BY name`).all();
const names=(result?.results||[]).map(row=>String(row.name));
if(names.length!==5)throw new Error(`PUBLIC_COLLECTOR_SCHEMA_READBACK_FAILED:${names.join(',')}`);
console.log(JSON.stringify({status:'PUBLIC_COLLECTOR_SCHEMA_CLOSED',objects:names,usage:db.usageSnapshot()}));
