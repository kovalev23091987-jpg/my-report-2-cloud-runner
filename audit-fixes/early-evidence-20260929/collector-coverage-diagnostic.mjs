import fs from 'node:fs';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';

const required=name=>{const value=String(process.env[name]||'').trim();if(!value)throw new Error(`${name}_REQUIRED`);return value;};
const output=process.argv[2]||'report2-collector-coverage.json';
const db=new RemoteD1Database(required('REPORT2_D1_BRIDGE_URL'),required('REPORT2_D1_BRIDGE_TOKEN'),{timeoutMs:45_000});
const slot=5*60_000;
// Exclude the newest two slots so a normally delayed cron is not called missing.
const end=Math.floor(Date.now()/slot)*slot-2*slot;
const start=end-71*slot;
const generation='MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V12_CONTRACT_INTEGRITY_20M';
const rows=async(sql,args)=>((await db.prepare(sql).bind(...args).all())?.results||[]);
const usage=await rows(`SELECT bucket,state,status,error_text,external_requests,rows_read,rows_written
  FROM report2_public_collector_usage_v1
  WHERE actor=?1 AND generation=?2 AND bucket BETWEEN ?3 AND ?4 ORDER BY bucket`,['HUB_PUBLIC_COLLECTOR',generation,start,end]);
const batches=await rows(`SELECT bucket,COUNT(*) AS shards,MIN(status) AS min_status,MAX(status) AS max_status,
  SUM(contract_count) AS contracts FROM report2_market_snapshot_batch_v1
  WHERE generation=?1 AND actor=?2 AND bucket BETWEEN ?3 AND ?4 GROUP BY bucket ORDER BY bucket`,[generation,'HUB_PUBLIC_COLLECTOR',start,end]);
const byUsage=new Map(usage.map(row=>[Number(row.bucket),row]));
const byBatch=new Map(batches.map(row=>[Number(row.bucket),row]));
const slots=Array.from({length:72},(_,i)=>{
  const bucket=start+i*slot,u=byUsage.get(bucket),b=byBatch.get(bucket);
  const complete=u?.state==='CLOSED'&&u?.status==='CLOSED'&&b?.min_status==='COMPLETE'&&b?.max_status==='COMPLETE'&&Number(b?.contracts)>0;
  return {bucket,status:complete?'COMPLETE':u?.status||u?.state||'NO_COLLECTOR_CLAIM',error:u?.error_text?String(u.error_text).slice(0,160):null,shards:Number(b?.shards||0),contracts:Number(b?.contracts||0),external_requests:Number(u?.external_requests||0)};
});
const counts=Object.fromEntries([...new Set(slots.map(row=>row.status))].sort().map(status=>[status,slots.filter(row=>row.status===status).length]));
const result={schema:'report2-collector-coverage-read-only-v1',generation,start,end,slots,counts,rows_written:db.usageSnapshot().rows_written,rows_read:db.usageSnapshot().rows_read,unknown_ops:db.usageSnapshot().unknown_ops};
if(result.rows_written!==0||result.unknown_ops!==0)throw new Error('COLLECTOR_DIAGNOSTIC_NOT_READ_ONLY');
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:'CLOSED_READ_ONLY',counts,rows_read:result.rows_read,rows_written:0,unknown_ops:0}));
