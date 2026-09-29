import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(process.argv[2]||'runtime');
const output=path.resolve(process.argv[3]||'source-state-read-only.json');
const {RemoteD1Database}=await import(pathToFileURL(path.join(root,'report2-d1-adapter.mjs')));
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{fetchImpl:globalThis.fetch,timeoutMs:45000});
const now=Date.now();
const all=async(sql,...args)=>{if(db.usageSnapshot().rows_read>20000)throw Error('READ_AUDIT_HEADROOM_EXHAUSTED');const r=await db.prepare(sql).bind(...args).all();return r?.results||[];};
const schema=await all("SELECT name,sql FROM sqlite_master WHERE type='table' AND (name LIKE 'report2_%' OR name LIKE '%calibrat%' OR name LIKE '%performance%' OR name LIKE '%outcome%' OR name IN ('v3_telegram_dispatch_shadow','v3_dispatch_publication_binding_shadow','canonical_publication_shadow','full_evidence_shadow_log')) ORDER BY name");
const present=new Set(schema.map(r=>r.name));
const queries={
  source_health:"SELECT * FROM report2_liquidation_source_health ORDER BY source_id LIMIT 50",
  predictive_health:"SELECT * FROM report2_liquidation_predictive_health ORDER BY source_id LIMIT 50",
  provider_allowances:"SELECT provider,scope_id,window_start_ts,window_end_ts,allowance_units,used_units,active FROM report2_liq_source_allowance_shadow WHERE active=1 ORDER BY provider,window_start_ts DESC LIMIT 50",
  byk_usage:"SELECT month_key,official_quota,operational_cap,scheduled_cap,used_total,used_scheduled,used_manual,updated_ts FROM report2_byk_monthly_usage ORDER BY month_key DESC LIMIT 3",
  provider_budgets:"SELECT provider,accounting_period,project_cap,scheduled_cap,spent_or_outstanding,scheduled_spent_or_outstanding,updated_ts FROM report2_provider_budget_v2 ORDER BY accounting_period DESC LIMIT 50",
  source_daily:"SELECT source,day_utc,attempts,updated_at FROM report2_evidence_source_daily WHERE day_utc>=?1 ORDER BY day_utc DESC,source LIMIT 60",
  source_credits:"SELECT source,day_utc,credits,updated_at FROM report2_evidence_source_credit_daily WHERE day_utc>=?1 ORDER BY day_utc DESC,source LIMIT 60",
  evidence_cache:"SELECT source,asset_key,observed_ts,expires_ts,payload_json FROM report2_evidence_source_cache ORDER BY observed_ts DESC LIMIT 100",
  candidate_cache:"SELECT source,contract_code,observed_ts,expires_ts,payload_json FROM report2_candidate_source_cache ORDER BY observed_ts DESC LIMIT 100",
  global_cache:"SELECT source,observed_ts,expires_ts,status,payload_json FROM report2_global_source_cache LIMIT 20",
  cross_exchange_cache:"SELECT source,contract_code,observed_ts,expires_ts,payload_json FROM report2_cross_exchange_risk_cache ORDER BY observed_ts DESC LIMIT 100",
  identity_cache:"SELECT base_symbol,observed_ts,expires_ts,payload_json FROM report2_supplemental_identity_cache ORDER BY observed_ts DESC LIMIT 100",
  ox_credit_usage:"SELECT window_start_ts,window_end_ts,SUM(credits) AS reserved_credits,COUNT(*) AS reservations FROM report2_oxarchive_credit_ledger GROUP BY window_start_ts,window_end_ts LIMIT 5",
  recent_commands:"SELECT mode,contract,received_at,state,updated_at FROM report2_command_v2 ORDER BY received_at DESC LIMIT 10",
  tao_dispatches:"SELECT dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,state,decision_id,message_hash,telegram_message_id,created_ts,updated_ts,sent_ts,last_error FROM v3_telegram_dispatch_shadow WHERE contract='TAO-USDT' ORDER BY updated_ts DESC LIMIT 20",
  tao_publications:"SELECT publication_id,contract_code,direction,run_id,snapshot_id,wave_id,decision_id,observed_ts,valid_until_ts,lifecycle_event,canonical_state,analytical_fingerprint,canonical_json,telegram_text,actionability_status,actionability_reason,created_ts FROM canonical_publication_shadow WHERE contract_code='TAO-USDT' ORDER BY created_ts DESC LIMIT 20",
  tao_bindings:"SELECT * FROM v3_dispatch_publication_binding_shadow WHERE contract_code='TAO-USDT' ORDER BY created_ts DESC LIMIT 20",
};
const since=new Date(now-86400000).toISOString().slice(0,10);
const states={};
function compactPayload(value){
  let p;try{p=JSON.parse(value);}catch{return{status:'INVALID_JSON'};}
  const sources=Array.isArray(p?.sources)?p.sources:Object.entries(p?.sources||{}).map(([source,x])=>({source,status:x?.status}));
  return{status:p?.status||null,network_calls:p?.network_calls??null,source_ts:p?.source_ts??p?.observed_ts??null,identity_status:p?.identity_status??null,exact_identity:p?.exact_identity??null,
    identity:p?.asset_identity??p?.identity??null,identity_method:p?.identity_method??null,scope:p?.scope??null,
    evidence_count:(p?.evidence||[]).length,pool_count:(p?.pools||[]).length,event_count:(p?.events||p?.realized_liquidations||[]).length,
    evidence_blocks:[...new Set((p?.evidence||[]).map(x=>x.block_id))],sources:sources.map(x=>({source:x.source,status:x.status})),
    receipts:(p?.receipts||[]).map(x=>({source:x.source||null,route:x.route||null,status:x.status||null,http_status:x.http_status??null})),
    market_regime:p?.market_regime??null,whale_rows:(p?.whale_radar||[]).length,liquidation_rows:(p?.realized_liquidations||[]).length};
}
for(const [label,sql] of Object.entries(queries)){
  const table=sql.match(/\bFROM\s+(\w+)/i)?.[1];if(!present.has(table)){states[label]={status:'TABLE_NOT_PRESENT',rows:[]};continue;}
  try{
    const rows=await all(sql,...(sql.includes('?1')?[since]:[]));
    states[label]={status:'CLOSED',rows:rows.map(({payload_json,...row})=>({
      ...row,
      ...(payload_json?{payload:compactPayload(payload_json)}:{}),
      ...(row.expires_ts?{valid_now:row.expires_ts>now}:{})
    }))};
  }
  catch(error){states[label]={status:'READ_ERROR',error:String(error.message).slice(0,180),rows:[]};}
}
const usage=db.usageSnapshot();
if(usage.unknown_ops!==0||usage.rows_written!==0||usage.rows_read>34000)throw Error('READ_AUDIT_USAGE_NOT_CLOSED');
const result={schema:'report2-source-audit-read-only-v1',captured_at:new Date(now).toISOString(),github_head:process.env.GITHUB_SHA,production_base:'410fbfe95f0463635e17d53a4b1d7ec4e055ea34',
  worker_sha256:createHash('sha256').update(fs.readFileSync(path.join(root,'src/worker.js'))).digest('hex'),states,schema_inventory:schema,
  secrets_present:Object.fromEntries(['OXARCHIVE_API_KEY','LIQFLOW_API_KEY','COINALYZE_API_KEY','BLOCKSCOUT_PRO_API_KEY','REPORT2_SUPPLEMENTAL_IDENTITY_REGISTRY_JSON'].map(k=>[k,Boolean(process.env[k])])),
  database_usage:usage,source_http_calls:0,telegram_calls:0,rows_written:0,secrets_included:false};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:'CLOSED_READ_ONLY',tables:schema.length,rows_read:usage.rows_read,requests:usage.requests,rows_written:0,source_http_calls:0,telegram_calls:0}));
