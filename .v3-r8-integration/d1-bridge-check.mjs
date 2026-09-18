import { RemoteD1Database } from "../runner/report2-d1-adapter.mjs";

const req = (n) => { const v=String(process.env[n]||"").trim(); if(!v) throw new Error(`${n}_REQUIRED`); return v; };
const GROUPS = {
  data_plane: { tables:["v3_source_health_1m","v3_realized_liquidation_aggregate","v3_realized_liquidation_density_5m","v3_projected_cluster_lifecycle_shadow","v3_market_microstructure_1m"], indexes:["idx_v3_source_health_venue_ts","idx_v3_realized_liq_contract_ts","idx_v3_realized_density_contract_ts","idx_v3_projected_cluster_contract_seen","idx_v3_market_micro_contract_ts"] },
  early_discovery: { tables:["v3_early_feature_snapshot","v3_early_candidate_wave","v3_early_outcome_journal"], indexes:["idx_v3_early_feature_ts","idx_v3_early_candidate_contract_seen","idx_v3_early_outcome_due"] },
  live_handoff: { tables:["v3_discovery_deep_handoff_shadow"], indexes:["idx_v3_handoff_pending","idx_v3_handoff_contract","idx_v3_handoff_wave"] },
  telegram: { tables:["v3_telegram_lifecycle_shadow","v3_telegram_dispatch_journal_shadow","v3_pipeline_health_transition_shadow"], indexes:["idx_v3_telegram_lifecycle_contract","idx_v3_telegram_dispatch_due","idx_v3_pipeline_health_transition_ts"] },
};
const BASE=["cron_runs","deep_check_scheduler_state","deep_check_run_log"];
const qlist=(xs)=>xs.map(x=>`'${String(x).replaceAll("'","''")}'`).join(",");
const db=new RemoteD1Database(req("REPORT2_D1_BRIDGE_URL"),req("REPORT2_D1_BRIDGE_TOKEN"),{timeoutMs:45000});
async function names(xs){ if(!xs.length)return new Set(); const r=await db.prepare(`SELECT name FROM sqlite_master WHERE name IN (${qlist(xs)})`).all(); return new Set((r?.results||[]).map(x=>String(x.name))); }
const base=await names(BASE); const missing=BASE.filter(x=>!base.has(x));
if(missing.length) throw new Error(`BASE_SCHEMA_MISSING:${missing.join(',')}`);
const states={};
for(const [group,spec] of Object.entries(GROUPS)){
  const need=[...(spec.tables||[]),...(spec.indexes||[])]; const have=await names(need); const n=need.filter(x=>have.has(x)).length;
  states[group]= n===0?"PENDING":n===need.length?"APPLIED":"PARTIAL_BLOCKED";
}
const handoffCols=["v3_handoff_id","v3_handoff_logical_key","v3_scan_ts","v3_base_ticker","v3_discovery_rank","v3_detectors_json","v3_evidence_ids_json","v3_first_seen_state_json","v3_current_state_json","v3_direction","v3_wave_id","v3_dedup_reentry_key"];
const cronCols=["v3_discovery_shortlist_count","v3_live_shortlist_count","v3_live_deep_check_count","v3_live_zero_reason","v3_pipeline_health_status","v3_pipeline_health_reason","v3_live_lane","v3_maintenance_deferred"];
async function cols(t){const r=await db.prepare(`PRAGMA table_info("${t}")`).all();return new Set((r?.results||[]).map(x=>String(x.name)));}
for(const [key,table,need] of [["handoff_wiring","deep_check_scheduler_state",handoffCols],["cron_telemetry","cron_runs",cronCols]]){
 const have=await cols(table); const n=need.filter(x=>have.has(x)).length; states[key]=n===0?"PENDING":n===need.length?"APPLIED":"PARTIAL_BLOCKED";
}
if(Object.values(states).includes("PARTIAL_BLOCKED")){
 console.log(JSON.stringify({status:"PARTIAL_BLOCKED",states,remote_d1_changed:false,query_usage:db.usageSnapshot()},null,2)); process.exit(3);
}
console.log(JSON.stringify({status:"CHECK_ONLY",states,remote_d1_changed:false,query_usage:db.usageSnapshot()},null,2));
