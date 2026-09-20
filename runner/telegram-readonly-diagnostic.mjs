// Read-only production diagnosis. Never imports the Worker or a sender.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { RemoteD1Database } from './report2-d1-adapter.mjs';
const db = new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL, process.env.REPORT2_D1_BRIDGE_TOKEN);
const rows = async (sql, args=[]) => {
  if (!/^SELECT\s/i.test(sql) || /;|\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|ATTACH)\b/i.test(sql)) throw new Error('READ_ONLY_REQUIRED');
  if (db.usageSnapshot().requests >= 16 || db.usageSnapshot().rows_read > 2000) throw new Error('DIAGNOSTIC_READ_BUDGET');
  const r = await db.prepare(sql).bind(...args).all();
  if (r?.success === false || !Array.isArray(r?.results)) throw new Error('READ_RESULT_UNKNOWN');
  const u = db.usageSnapshot();
  if (u.rows_written !== 0 || u.unknown_ops !== 0) throw new Error('READ_ONLY_USAGE_NOT_PROVEN');
  return r.results;
};
const fingerprints = {};
for (const name of ['worker.js','v3-early-sidecar.mjs','v3-telegram-lifecycle-sidecar.mjs','v3-telegram-lifecycle.mjs','v3-telegram-runtime.mjs']) {
  fingerprints[name] = crypto.createHash('sha256').update(await fs.readFile('runtime/src/'+name)).digest('hex');
}
const deep = await rows(`SELECT run_id,contract_code,started_ts,completed_ts,execution_status,data_sufficiency,error_text,
  v3_handoff_id,v3_scan_ts,v3_wave_id,v3_direction FROM deep_check_run_log
  INDEXED BY idx_deep_check_run_log_completed_ts ORDER BY completed_ts DESC LIMIT 2`);
const evidence = [];
for (const d of deep) {
  const contract=d.contract_code;
  const h=await rows('SELECT * FROM v3_discovery_deep_handoff_shadow WHERE handoff_id=?1 LIMIT 1',[d.v3_handoff_id]);
  const early=await rows('SELECT wave_id,contract_code,lifecycle_stage,direction_hint,direction_state,last_seen_ts,first_seen_ts FROM v3_early_candidate_wave WHERE contract_code=?1 ORDER BY last_seen_ts DESC LIMIT 2',[contract]);
  const shadow=await rows('SELECT shadow_id,contract_code,observed_ts,direction_hint,eq_status,dq_status,stage,data_sufficiency,missing_chains_json,evidence_flags_json,created_ts FROM shadow_decision_log WHERE contract_code=?1 ORDER BY observed_ts DESC LIMIT 2',[contract]);
  const final=await rows('SELECT decision_id,contract_code,observation_ts,direction,directional_quality,data_quality,execution_quality,hard_veto,persisted_ts FROM final_decision_integration_shadow WHERE contract_code=?1 ORDER BY observation_ts DESC LIMIT 1',[contract]);
  const lifecycle=await rows('SELECT contract,direction,wave_id,status,reason,observation_ts,valid_until_ts,updated_ts FROM v3_user_lifecycle_shadow WHERE contract=?1 LIMIT 4',[contract]);
  evidence.push({deep:d,handoff:h,early,shadow,final,lifecycle});
}
const indices = await rows("SELECT name,tbl_name,sql FROM sqlite_master WHERE type='index' AND tbl_name IN ('v3_discovery_deep_handoff_shadow','v3_early_candidate_wave','shadow_decision_log','final_decision_integration_shadow','v3_user_lifecycle_shadow') LIMIT 40");
const result={schema:'telegram-readonly-diagnosis-v1',head:process.env.GITHUB_SHA,observed_at:new Date().toISOString(),fingerprints,evidence,indices,usage:db.usageSnapshot(),production_writes:false,network_send:false};
await fs.writeFile('telegram-readonly-diagnosis.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({status:'READ_ONLY_DIAGNOSIS_CLOSED',production_writes:false,network_send:false,evidence:evidence.map(x=>({contract:x.deep.contract_code,deep_status:x.deep.execution_status,sufficiency:x.deep.data_sufficiency,wave_present:x.early.length>0,shadow:x.shadow.map(s=>({stage:s.stage,direction:s.direction_hint,quality:s.dq_status})),final_present:x.final.length>0,lifecycle:x.lifecycle.map(s=>s.status)})),usage:db.usageSnapshot()}));
