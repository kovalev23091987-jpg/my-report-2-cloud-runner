import fs from 'node:fs';
import path from 'node:path';

const API='https://api.cloudflare.com/client/v4';
const GENERATION='MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V10_20M';
const ACTOR='HUB_PUBLIC_COLLECTOR';
const outDir=path.resolve(process.argv[2]||new URL('./dist',import.meta.url).pathname);
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!token)throw new Error('CLOUDFLARE_API_TOKEN_REQUIRED');
const config=JSON.parse(fs.readFileSync(path.join(outDir,'wrangler.json'),'utf8'));
const account=String(config.account_id||'').trim();
const database=String(config.d1_databases?.find(row=>row.binding==='DATA_DB')?.database_id||'').trim();
if(!account||!database)throw new Error('PUBLIC_COLLECTOR_D1_IDENTITY_REQUIRED');

async function query(sql,params=[]){
  const response=await fetch(`${API}/accounts/${account}/d1/database/${database}/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(45_000)});
  const payload=await response.json().catch(()=>null);
  if(!response.ok||payload?.success!==true)throw new Error(`PUBLIC_COLLECTOR_D1_QUERY_HTTP_${response.status}`);
  return payload?.result?.[0]?.results||[];
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deployedAt=Date.now();
const deadline=deployedAt+8*60_000;
let health=null,usage=null,batch=null,lastReason='NO_HEALTH_ROW';
while(Date.now()<deadline){
  health=(await query(`SELECT last_bucket,last_completed_ts,status,contract_count,shard_count,external_requests,rows_read,rows_written,payload_bytes,error_text,updated_ts FROM report2_public_collector_health_v1 WHERE actor=?1 AND generation=?2 LIMIT 1`,[ACTOR,GENERATION]))[0]||null;
  if(health&&Number(health.updated_ts)>=deployedAt-60_000&&health.status==='CLOSED'){
    usage=(await query(`SELECT state,status,external_requests,rows_read,rows_written,payload_bytes,error_text FROM report2_public_collector_usage_v1 WHERE actor=?1 AND generation=?2 AND bucket=?3 LIMIT 1`,[ACTOR,GENERATION,Number(health.last_bucket)]))[0]||null;
    batch=(await query(`SELECT COUNT(*) AS shards,COALESCE(SUM(contract_count),0) AS contracts,COALESCE(SUM(payload_bytes),0) AS payload_bytes,MIN(status) AS min_status,MAX(status) AS max_status FROM report2_market_snapshot_batch_v1 WHERE actor=?1 AND generation=?2 AND bucket=?3`,[ACTOR,GENERATION,Number(health.last_bucket)]))[0]||null;
    const closed=usage?.state==='CLOSED'&&usage?.status==='CLOSED'&&batch?.min_status==='COMPLETE'&&batch?.max_status==='COMPLETE';
    const counts=Number(batch?.shards)===Number(health.shard_count)&&Number(batch?.contracts)===Number(health.contract_count)&&Number(health.contract_count)>0;
    const bounded=Number(health.external_requests)>=3&&Number(health.external_requests)<=4&&Number(health.rows_written)<=35&&Number(health.payload_bytes)<=2*1024*1024;
    if(closed&&counts&&bounded)break;
    lastReason=`SAMPLE_NOT_CLOSED:${closed}:${counts}:${bounded}`;
  }else lastReason=health?.error_text||health?.status||'NO_FRESH_CLOSED_HEALTH';
  health=null;usage=null;batch=null;
  await sleep(20_000);
}
if(!health||!usage||!batch)throw new Error(`PUBLIC_COLLECTOR_FIRST_SAMPLE_TIMEOUT:${lastReason}`);
const proof={status:'FIRST_LIVE_SAMPLE_CLOSED',actor:ACTOR,generation:GENERATION,bucket:Number(health.last_bucket),completed_ts:Number(health.last_completed_ts),contracts:Number(health.contract_count),shards:Number(health.shard_count),external_requests:Number(health.external_requests),rows_read:Number(health.rows_read),rows_written:Number(health.rows_written),payload_bytes:Number(health.payload_bytes),batch_contracts:Number(batch.contracts),batch_shards:Number(batch.shards),analytical_decision:false,telegram:false,paid_source:false,verified_at:new Date().toISOString()};
fs.writeFileSync(path.join(outDir,'first-live-sample-proof.json'),`${JSON.stringify(proof,null,2)}\n`);
console.log(JSON.stringify(proof));
