import fs from 'node:fs/promises';
import { RemoteD1Database } from '../runner/report2-d1-adapter.mjs';
import { wilson95, entryAreaReadiness, ENTRY_AREA_MIN_TRAIN, ENTRY_AREA_MIN_HOLDOUT } from './readiness-lib.mjs';

const OUT_JSON = process.env.R8_19_JSON || 'R8_19_VALIDATION_READINESS.json';
const OUT_MD = process.env.R8_19_MD || 'R8_19_VALIDATION_READINESS.md';
const now = Date.now();

function required(name) {
  const v = String(process.env[name] || '').trim();
  if (!v) throw new Error(`${name}_REQUIRED`);
  return v;
}
function rowsOf(result) { return Array.isArray(result?.results) ? result.results : Array.isArray(result) ? result : []; }
function num(v) { const n=Number(v); return Number.isFinite(n)?n:null; }
function iso(v) { const n=num(v); return n ? new Date(n).toISOString() : null; }
function esc(s) { return String(s ?? '').replaceAll('|','\\|').replaceAll('\n',' '); }
function round(v,d=6){const n=num(v);return n===null?null:Number(n.toFixed(d));}

const db = new RemoteD1Database(required('REPORT2_D1_BRIDGE_URL'), required('REPORT2_D1_BRIDGE_TOKEN'), { timeoutMs: 45000 });

async function all(sql, params=[]) {
  let stmt=db.prepare(sql);
  if (params.length) stmt=stmt.bind(...params);
  return rowsOf(await stmt.all());
}
async function one(sql, params=[]) { return (await all(sql,params))[0] || null; }

const tableRows = await all("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name");
const tableSet = new Set(tableRows.map(r=>String(r.name)));
const has = name => tableSet.has(name);
const evidence = { tables: [...tableSet].sort() };

async function safeGroup(table, sql) {
  if (!has(table)) return { table, status:'TABLE_UNAVAILABLE', rows:[] };
  try { return { table, status:'CLOSED', rows:await all(sql) }; }
  catch (e) { return { table, status:'QUERY_FAILED', error:String(e?.message||e), rows:[] }; }
}

const scanHistory = has('scan_runs') ? await one('SELECT COUNT(*) row_count, MIN(ts) min_ts, MAX(ts) max_ts FROM scan_runs') : null;

const shadowSignals = await safeGroup('shadow_calibration_signal', `
  SELECT direction_hint, COUNT(*) samples, COUNT(DISTINCT contract_code) contracts,
         MIN(observed_ts) min_observed_ts, MAX(observed_ts) max_observed_ts
  FROM shadow_calibration_signal
  GROUP BY direction_hint ORDER BY direction_hint`);

const shadowOutcomes = await safeGroup('shadow_outcome_log', `
  SELECT direction_hint, horizon_hours, status,
         COUNT(*) rows_n, COUNT(DISTINCT shadow_id) samples, COUNT(DISTINCT contract_code) contracts,
         SUM(CASE WHEN direction_correct=1 THEN 1 ELSE 0 END) correct,
         SUM(CASE WHEN direction_correct=0 THEN 1 ELSE 0 END) incorrect,
         AVG(directional_return_pct) avg_directional_return_pct,
         AVG(mfe_directional_pct_snapshot) avg_mfe_pct,
         AVG(mae_directional_pct_snapshot) avg_mae_pct,
         AVG(path_coverage_pct) avg_path_coverage_pct,
         MIN(observed_ts) min_observed_ts, MAX(observed_ts) max_observed_ts
  FROM shadow_outcome_log
  GROUP BY direction_hint, horizon_hours, status
  ORDER BY direction_hint, horizon_hours, status`);

for (const row of shadowOutcomes.rows) {
  const n=(num(row.correct)||0)+(num(row.incorrect)||0);
  row.hit_rate = n ? round((num(row.correct)||0)/n) : null;
  row.hit_rate_wilson95 = n ? wilson95(num(row.correct)||0,n) : null;
  for (const k of ['avg_directional_return_pct','avg_mfe_pct','avg_mae_pct','avg_path_coverage_pct']) row[k]=round(row[k]);
}

const shadowState = has('shadow_outcome_state') ? await one('SELECT * FROM shadow_outcome_state WHERE state_key=\'main\' LIMIT 1') : null;

const earlyWaves = await safeGroup('v3_early_candidate_wave', `
  SELECT COALESCE(direction_hint,'NULL') direction_hint, lifecycle_stage,
         COUNT(*) waves, COUNT(DISTINCT contract_code) contracts,
         AVG(early_detection_quality_0_100) avg_early_quality,
         MIN(first_seen_ts) min_first_seen_ts, MAX(first_seen_ts) max_first_seen_ts
  FROM v3_early_candidate_wave
  GROUP BY COALESCE(direction_hint,'NULL'), lifecycle_stage
  ORDER BY direction_hint,lifecycle_stage`);

const earlyOutcomes = await safeGroup('v3_early_outcome_journal', `
  SELECT COALESCE(direction_hint,'NULL') direction_hint, horizon_hours, outcome_status,
         COUNT(*) rows_n, COUNT(DISTINCT wave_id) waves, COUNT(DISTINCT contract_code) contracts,
         SUM(CASE WHEN directional_return_pct>0 THEN 1 ELSE 0 END) positive,
         SUM(CASE WHEN directional_return_pct<=0 AND directional_return_pct IS NOT NULL THEN 1 ELSE 0 END) nonpositive,
         AVG(directional_return_pct) avg_directional_return_pct,
         AVG(mfe_pct) avg_mfe_pct, AVG(mae_pct) avg_mae_pct,
         AVG(realized_r) avg_realized_r, AVG(model_r) avg_model_r, AVG(lost_rr) avg_lost_rr,
         SUM(COALESCE(prevented_bad_entry,0)) prevented_bad_entry,
         SUM(COALESCE(missed_good_entry,0)) missed_good_entry,
         SUM(COALESCE(late_entry_avoided,0)) late_entry_avoided,
         SUM(COALESCE(early_alert_useful,0)) early_alert_useful,
         MIN(first_seen_ts) min_first_seen_ts, MAX(first_seen_ts) max_first_seen_ts
  FROM v3_early_outcome_journal
  GROUP BY COALESCE(direction_hint,'NULL'), horizon_hours, outcome_status
  ORDER BY direction_hint,horizon_hours,outcome_status`);
for (const row of earlyOutcomes.rows) {
  const n=(num(row.positive)||0)+(num(row.nonpositive)||0);
  row.positive_rate=n?round((num(row.positive)||0)/n):null;
  row.positive_rate_wilson95=n?wilson95(num(row.positive)||0,n):null;
  for (const k of ['avg_directional_return_pct','avg_mfe_pct','avg_mae_pct','avg_realized_r','avg_model_r','avg_lost_rr']) row[k]=round(row[k]);
}

const opportunity = await safeGroup('opportunity_shadow_outcome', `
  SELECT horizon,status,COUNT(*) rows_n,COUNT(DISTINCT event_id) events,COUNT(DISTINCT contract_code) contracts,
         AVG(return_pct) avg_return_pct,AVG(mfe_pct) avg_mfe_pct,AVG(mae_pct) avg_mae_pct,
         SUM(COALESCE(missed_opportunity_detected,0)) missed_opportunity,
         SUM(COALESCE(false_rejection_candidate,0)) false_rejection,
         SUM(COALESCE(late_entry_candidate,0)) late_entry
  FROM opportunity_shadow_outcome
  GROUP BY horizon,status ORDER BY horizon,status`);
for (const row of opportunity.rows) for (const k of ['avg_return_pct','avg_mfe_pct','avg_mae_pct']) row[k]=round(row[k]);

let entryRows=[];
if (has('tz101_entry_area_calibration_signal') && has('tz101_entry_area_calibration_outcome')) {
  entryRows = await all(`
    SELECT s.sample_id,s.direction,s.contract_code,s.observed_ts,
           o.horizon_hours,o.outcome_scan_ts,o.path_order_status
    FROM tz101_entry_area_calibration_signal s
    JOIN tz101_entry_area_calibration_outcome o ON o.sample_id=s.sample_id
    ORDER BY s.observed_ts ASC,o.horizon_hours ASC
    LIMIT 5000`);
}
const entryReadiness=[];
for (const direction of ['LONG','SHORT']) {
  for (const horizon of [1,4,12,24]) {
    const subset=entryRows.filter(r=>String(r.direction)===direction && Number(r.horizon_hours)===horizon);
    entryReadiness.push({ direction,horizon_hours:horizon,...entryAreaReadiness(subset) });
  }
}
const entryState = has('tz101_entry_area_calibration_state') ? await all('SELECT * FROM tz101_entry_area_calibration_state ORDER BY updated_ts DESC LIMIT 20') : [];

const finalDecision = await safeGroup('final_decision_integration_shadow', `
  SELECT direction,entry_action,decision_status,COUNT(*) rows_n,COUNT(DISTINCT contract_code) contracts,
         SUM(CASE WHEN live_probability IS NOT NULL THEN 1 ELSE 0 END) live_probability_nonnull,
         SUM(validated_signal) validated_signal_sum,
         SUM(execution_authorized) execution_authorized_sum,
         SUM(telegram_eligible) telegram_eligible_sum,
         SUM(calibration_eligible) calibration_eligible_sum,
         SUM(shadow_outcome_collection_eligible) shadow_outcome_collection_eligible_sum,
         MIN(observation_ts) min_observation_ts,MAX(observation_ts) max_observation_ts
  FROM final_decision_integration_shadow
  GROUP BY direction,entry_action,decision_status
  ORDER BY direction,entry_action,decision_status`);

const finalDecisionOutcomeTables = [...tableSet].filter(n=>/final_decision.*outcome|outcome.*final_decision/i.test(n));
const finalDecisionRows = finalDecision.rows.reduce((a,r)=>a+(num(r.rows_n)||0),0);
const calibrationEligible = finalDecision.rows.reduce((a,r)=>a+(num(r.calibration_eligible_sum)||0),0);
const outcomeEligible = finalDecision.rows.reduce((a,r)=>a+(num(r.shadow_outcome_collection_eligible_sum)||0),0);
const finalDecisionProspectiveOutcome = {
  status: finalDecisionOutcomeTables.length && outcomeEligible>0 ? 'PERSISTENCE_PRESENT_NOT_VALIDATED' : 'NOT_IMPLEMENTED_OR_NOT_ENROLLED',
  final_decision_rows: finalDecisionRows,
  calibration_eligible_rows: calibrationEligible,
  outcome_collection_eligible_rows: outcomeEligible,
  outcome_tables: finalDecisionOutcomeTables,
};

const safety = {
  d1_read_only: true,
  live_probability: false,
  validated_signal: false,
  trading_execution: false,
  strategy_changed: false,
  decision_weights_changed: false,
};

const blockers=[];
if (finalDecisionProspectiveOutcome.status !== 'PERSISTENCE_PRESENT_NOT_VALIDATED') blockers.push('FINAL_DECISION_PROSPECTIVE_OUTCOME_PERSISTENCE_NOT_ACTIVE');
const readyCells=entryReadiness.filter(r=>r.status==='CALIBRATION_DATA_READY_NOT_VALIDATED');
if (!readyCells.length) blockers.push('ENTRY_AREA_LONG_SHORT_OOS_DATA_NOT_READY_AT_EXISTING_80_PLUS_40_THRESHOLD');
blockers.push('PRECOMMITTED_STATISTICAL_ACCEPTANCE_RULE_NOT_YET_CLOSED');

const usage=db.usageSnapshot();
if (Number(usage.rows_written||0)!==0 || Number(usage.unknown_ops||0)!==0) throw new Error(`READ_ONLY_AUDIT_USAGE_VIOLATION:${JSON.stringify(usage)}`);

const report={
  schema:'report2-r8-19-validation-readiness-v1',
  status:'VALIDATION_READINESS_AUDIT_COMPLETE_NOT_VALIDATED',
  generated_ts:now,
  production_main:process.env.BASE_MAIN_SHA || null,
  existing_entry_area_threshold:{min_train:ENTRY_AREA_MIN_TRAIN,min_holdout:ENTRY_AREA_MIN_HOLDOUT,required:ENTRY_AREA_MIN_TRAIN+ENTRY_AREA_MIN_HOLDOUT,source:'tz101-entry-area-calibration.mjs'},
  validation_policy:{long_short_separate:true,probability_activation:false,validated_signal_activation:false,automatic_weight_tuning:false,precommitted_statistical_acceptance_rule_closed:false},
  blockers,
  scan_history:scanHistory?{...scanHistory,min_ts_iso:iso(scanHistory.min_ts),max_ts_iso:iso(scanHistory.max_ts)}:null,
  shadow_calibration:{signals:shadowSignals,outcomes:shadowOutcomes,state:shadowState},
  early_discovery:{waves:earlyWaves,outcomes:earlyOutcomes},
  opportunity_outcomes:opportunity,
  entry_area:{readiness_by_direction_horizon:entryReadiness,state:entryState,closed_rows_loaded:entryRows.length},
  final_decision:{summary:finalDecision,prospective_outcome:finalDecisionProspectiveOutcome},
  d1_usage:usage,
  safety,
};

function sectionRows(title, rows, cols) {
  let s=`\n## ${title}\n\n`;
  if (!rows?.length) return s+'Нет данных / таблица недоступна.\n';
  s+=`| ${cols.join(' | ')} |\n| ${cols.map(()=> '---').join(' | ')} |\n`;
  for (const r of rows) s+=`| ${cols.map(c=>esc(r[c] ?? '')).join(' | ')} |\n`;
  return s;
}
let md=`# MY REPORT 2 — R8.19 STATISTICAL VALIDATION READINESS\n\n`;
md+=`Status: **${report.status}**\n\n`;
md+=`Никакая probability/validated signal не включена. Audit read-only; D1 writes=${usage.rows_written}, unknown_ops=${usage.unknown_ops}.\n\n`;
md+=`Existing entry-area readiness gate: ${ENTRY_AREA_MIN_TRAIN} train + ${ENTRY_AREA_MIN_HOLDOUT} holdout = ${ENTRY_AREA_MIN_TRAIN+ENTRY_AREA_MIN_HOLDOUT} prospective samples, применён отдельно к LONG/SHORT и каждому горизонту.\n\n`;
md+=`## Блокеры validation\n\n${blockers.map(x=>`- ${x}`).join('\n')}\n`;
md+=sectionRows('Entry-area readiness LONG/SHORT', entryReadiness, ['direction','horizon_hours','status','closed_samples','required_samples','train_samples','holdout_samples']);
md+=sectionRows('Shadow outcome factual metrics', shadowOutcomes.rows, ['direction_hint','horizon_hours','status','samples','contracts','correct','incorrect','hit_rate','avg_directional_return_pct','avg_mfe_pct','avg_mae_pct','avg_path_coverage_pct']);
md+=sectionRows('Early Discovery outcome metrics', earlyOutcomes.rows, ['direction_hint','horizon_hours','outcome_status','waves','contracts','positive_rate','avg_directional_return_pct','avg_mfe_pct','avg_mae_pct','avg_realized_r','avg_model_r','avg_lost_rr']);
md+=`\n## Final Decision prospective outcome\n\n- status: ${finalDecisionProspectiveOutcome.status}\n- final_decision_rows: ${finalDecisionRows}\n- calibration_eligible_rows: ${calibrationEligible}\n- outcome_collection_eligible_rows: ${outcomeEligible}\n- outcome_tables: ${finalDecisionOutcomeTables.join(', ') || 'NONE'}\n`;
md+=`\n## Вывод\n\nТекущие данные можно использовать только как shadow/calibration telemetry. Этот audit не является statistical validation и не разрешает live probability, validated signal, изменение весов или trading execution.\n`;

await fs.writeFile(OUT_JSON, JSON.stringify(report,null,2));
await fs.writeFile(OUT_MD, md);
console.log(JSON.stringify({status:report.status,blockers,entry_ready_cells:readyCells.length,final_decision_outcome:finalDecisionProspectiveOutcome,d1_usage:usage}));
