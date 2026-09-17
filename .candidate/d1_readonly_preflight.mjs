import { RemoteD1Database } from './runner/report2-d1-adapter.mjs';
function req(name){const v=String(process.env[name]||'').trim(); if(!v) throw new Error(`${name}_REQUIRED`); return v;}
const db=new RemoteD1Database(req('REPORT2_D1_BRIDGE_URL'),req('REPORT2_D1_BRIDGE_TOKEN'),{timeoutMs:45000});
const latest=await db.prepare(`SELECT run_id,status,completed_ts,universe_total,scanned,persistence_status FROM cron_runs ORDER BY started_ts DESC LIMIT 1`).first();
if(!latest||latest.status!=='SUCCESS'||latest.persistence_status!=='CLOSED'||Number(latest.universe_total)<=0||Number(latest.scanned)!==Number(latest.universe_total)) throw new Error('LIVE_D1_LATEST_CRON_NOT_CLOSED');
const tables=await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('final_decision_integration_shadow','scan_runs','cron_runs','final_decision_telegram_context_shadow','report2_runner_budget_ledger_shadow') ORDER BY name`).all();
const names=(tables?.results||[]).map(x=>String(x.name));
for(const n of ['final_decision_integration_shadow','scan_runs','cron_runs']) if(!names.includes(n)) throw new Error(`LIVE_D1_REQUIRED_TABLE_MISSING:${n}`);
const sidecar=names.includes('final_decision_telegram_context_shadow');
const budget=names.includes('report2_runner_budget_ledger_shadow');
console.log(JSON.stringify({ok:true,status:'READ_ONLY_PASS',latest_cron:latest,existing_tables:names,migrations_needed:{telegram_sidecar:!sidecar,runner_budget_ledger:!budget},usage:db.usageSnapshot()}));
