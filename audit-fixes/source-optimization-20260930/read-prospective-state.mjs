import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(process.argv[2]||'runtime');
const output=path.resolve(process.argv[3]||'prospective-state.json');
const load=rel=>import(pathToFileURL(path.join(root,rel)).href);
const {RemoteD1Database}=await load('report2-d1-adapter.mjs');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{timeoutMs:45000});
const queries=[];
const delta=(a,b)=>Object.fromEntries(['rows_read','rows_written','requests','unknown_ops'].map(k=>[k,b[k]-a[k]]));
const readOnly={prepare(sql){
  if(!/^\s*(?:SELECT|WITH|EXPLAIN QUERY PLAN)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP)\s/i.test(sql))throw Error('READ_ONLY_SQL_REQUIRED');
  let params=[];
  const stmt={bind(...values){params=values;return stmt;},async all(){return execute('all');},async first(){return execute('first');},run(){throw Error('READ_ONLY_WRITE_REFUSED');}};
  async function execute(method){
    const before=db.usageSnapshot();
    if(before.rows_read>24000||before.requests>=24||before.unknown_ops||before.rows_written)throw Error('READ_ONLY_AUDIT_HEADROOM_EXHAUSTED');
    try{const result=await db.prepare(sql).bind(...params)[method]();queries.push({sql,params,method,usage:delta(before,db.usageSnapshot()),status:'CLOSED'});return result;}
    catch(e){queries.push({sql,params,method,usage:delta(before,db.usageSnapshot()),status:'ERROR',error:String(e.message).slice(0,200)});throw e;}
  }
  return stmt;
},usageSnapshot:()=>db.usageSnapshot()};
const results={};
const now=Date.now();
try{
  results.schema=(await readOnly.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name IN ('v3_early_outcome_journal','report2_market_snapshot_batch_v1','scan_runs','tz101_entry_area_calibration_signal','tz101_entry_area_calibration_outcome','tz101_entry_area_calibration_state') ORDER BY tbl_name,type,name").all()).results;
  results.activation=await readOnly.prepare('SELECT state_key,status,updated_ts FROM tz101_entry_area_calibration_state WHERE state_key=?1 LIMIT 1').bind('R8_20_PROSPECTIVE_ACTIVATION_V1').first();
  results.early_due=(await readOnly.prepare("SELECT outcome_id,contract_code,first_seen_ts,horizon_hours,target_ts,outcome_status,computed_ts,json_extract(first_seen_context_json,'$.first_seen_price') AS first_seen_price FROM v3_early_outcome_journal WHERE shadow_only=1 AND computed_ts IS NULL AND outcome_status='PENDING' AND target_ts<=?1 ORDER BY target_ts,outcome_id LIMIT 12").bind(now).all()).results;
  const {HISTORY_COMPATIBILITY}=await load('src/market-history-reader.mjs');
  const generations=HISTORY_COMPATIBILITY.generations;
  results.history_boundaries=[];
  for(const generation of generations){
    for(const order of ['ASC','DESC']){
      const row=await readOnly.prepare(`SELECT bucket,actor,generation,received_ts,status,shard,contract_count FROM report2_market_snapshot_batch_v1 WHERE generation=?1 ORDER BY bucket ${order},shard ${order} LIMIT 1`).bind(generation).first();
      results.history_boundaries.push({generation,edge:order==='ASC'?'first':'last',row});
    }
  }
  const module=await load('r8-20-prospective-validation-sidecar.mjs');
  const head=results.early_due?.[0];
  if(head)results.head_factual_path=await module.loadProspectiveFactualPathForTest(readOnly,{contract:head.contract_code,startTs:Number(head.first_seen_ts),endTs:Number(head.target_ts),allowAfterTarget:false});
  if(results.activation){
    results.entry_capture_read_only=await module.captureOneEntryAreaSample(readOnly,{activation_ts:Number(results.activation.updated_ts),now_ts:now});
    results.readiness=await module.loadProspectiveReadinessSnapshot(readOnly,{activation_ts:Number(results.activation.updated_ts),now_ts:now});
  }
}catch(e){results.audit_error=String(e.message).slice(0,250);}
const usage=db.usageSnapshot();
const result={schema:'report2-prospective-chain-read-only-v1',captured_at:new Date(now).toISOString(),github_head:process.env.GITHUB_SHA,production_base:'2c1b121a96e6fb406d61715327083da1be034702',worker_sha256:createHash('sha256').update(fs.readFileSync(path.join(root,'src/worker.js'))).digest('hex'),results,queries,database_usage:usage,source_http_calls:0,telegram_calls:0,trade_calls:0,secrets_included:false};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:results.audit_error?'PARTIAL_READ_ONLY':'CLOSED_READ_ONLY',error:results.audit_error||null,queries:queries.length,database_usage:usage,head_contract:results.early_due?.[0]?.contract_code,head_path:results.head_factual_path?.status,telegram_calls:0,source_http_calls:0}));
if(usage.rows_written||usage.unknown_ops||usage.rows_read>34000)throw Error('READ_AUDIT_ENVELOPE_NOT_CLOSED');

// Explicit bounded read-only audit request: 2026-09-30T11:19:26Z.
