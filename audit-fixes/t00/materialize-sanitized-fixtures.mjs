import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const input=path.resolve(process.argv[2]||'t00-d1-inventory.json');
const output=path.resolve(process.argv[3]||'audit-fixes/t00/fixtures');
const source=JSON.parse(fs.readFileSync(input,'utf8'));
if(source?.schema!=='my-report-2-t00-read-only-d1-inventory-v1'||source.changed_db!==false||source.rows_written!==0)throw new Error('READ_ONLY_SOURCE_RECEIPT_REQUIRED');
const forbiddenKey=/api.?key|authorization|bearer|secret|token|password|bridge_url|proxy_url|relay_url/i;
function sanitized(value,key=''){
  if(forbiddenKey.test(key)&&value!==null)return '[REDACTED]';
  if(Array.isArray(value))return value.map(v=>sanitized(v));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sanitized(v,k)]));
  if(typeof value==='string'&&/^\s*[\[{]/.test(value)){
    try{return JSON.stringify(sanitized(JSON.parse(value)));}catch{}
  }
  return value;
}
const query=name=>{const q=source.queries.find(x=>x.name===name);if(!q||q.status!=='CLOSED')throw new Error(`QUERY_NOT_CLOSED:${name}`);return sanitized(q.rows);};
const canonical=query('v4_canonical_rows');
const delivery={dispatch:query('v4_dispatch_rows'),lifecycle:query('v4_lifecycle_rows')};
const failed=query('failed_cron_rows');
const timeout=failed.find(row=>String(row.error_text||'').includes('"contracts":"timeout"')&&String(row.error_text||'').includes('"market":"timeout"')&&String(row.error_text||'').includes('"oi":"timeout"')&&String(row.error_text||'').includes('"funding":"timeout"'));
if(canonical.length!==4||!timeout)throw new Error('REQUIRED_HISTORICAL_FIXTURES_NOT_FOUND');
fs.mkdirSync(output,{recursive:true});
const receipt={schema:'my-report-2-t00-sanitized-production-fixtures-v1',source_capture_run_id:36359630895,source_captured_at:source.captured_at,changed_db:false,rows_written:0,contracts:canonical.map(x=>x.contract_code).sort(),htx_timeout_run_id:timeout.run_id,sanitizer:'key-name denylist plus nested JSON traversal'};
const files={
  'd1-schema.json':{receipt,rows:query('sqlite_schema')},
  'v4-canonical-ETC-ETHFI-DOT-LSK.json':{receipt,rows:canonical},
  'v4-delivery-ETC-ETHFI-DOT-LSK.json':{receipt,...delivery},
  'htx-four-endpoint-timeout.json':{receipt,row:timeout},
};
for(const [name,data] of Object.entries(files))fs.writeFileSync(path.join(output,name),`${JSON.stringify(data,null,2)}\n`,'utf8');
const hashes=Object.fromEntries(Object.keys(files).sort().map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(output,name))).digest('hex')]));
fs.writeFileSync(path.join(output,'FIXTURE_MANIFEST.json'),`${JSON.stringify({...receipt,hashes},null,2)}\n`,'utf8');
console.log(JSON.stringify({status:'SANITIZED_FIXTURES_WRITTEN',files:Object.keys(files).length,canonical_rows:canonical.length,timeout_run_id:timeout.run_id}));
