import { runInformationalTelegram } from './telegram-info-runtime.mjs';
export { buildMorningInformationalMessage, buildWaitInformationalMessage } from './telegram-info-runtime.mjs';
import crypto from "node:crypto";

const OUTPUT_VERSION = "telegram-output-v8-sidecar-exact-decision-context";
const DEFAULT_RELAY_URL = "https://my-report-2-hub.kovalev23091987.workers.dev/telegram-test";
const RELAY_TIMEOUT_MS = 15_000;
const FINAL_DECISION_FRESH_MS = 15 * 60_000;
const MAX_FINAL_ROWS = 20;
const EXACT_SCORE_SCHEMA = "telegram-final-context-v1";
const EXACT_SCORE_SEMANTICS = "FOUR_BLOCK_35_30_20_15_V1";
const BLOCKS = Object.freeze([
  ["DERIVATIVES_CROSS_VENUE", 35],
  ["RELATIVE_STRENGTH_SPOT", 30],
  ["SMART_MONEY_ONCHAIN", 20],
  ["SUPPORTING_RISK", 15],
]);
const ACCEPTED_BLOCK_STATES = new Set(["CLOSED", "PARTIAL", "NOT_APPLICABLE_PROFILED"]);

function finite(v) {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function boolValue(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}
function cleanTicker(contract) {
  return String(contract || "UNKNOWN").replace(/-USDT$/i, "");
}
function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
}
function normalizeFinalRow(row) {
  return {
    ...row,
    observation_ts: Number(row?.observation_ts || 0) || null,
    persisted_ts: Number(row?.persisted_ts || 0) || null,
    hard_veto: Number(row?.hard_veto || 0) === 1,
    shadow_only: Number(row?.shadow_only || 0),
    validated_signal: Number(row?.validated_signal || 0),
    execution_authorized: Number(row?.execution_authorized || 0),
    telegram_eligible: Number(row?.telegram_eligible || 0),
    decision_json_object: parseJsonObject(row?.decision_json),
  };
}
function changesFromRun(result) {
  const values = [result?.meta?.changes, result?.changes, result?.meta?.rows_written, result?.rows_written];
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
function approximatelyEqual(a, b, eps = 1e-6) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}
function textValue(v, max = 240) {
  const s = String(v ?? "").trim();
  return s && s.length <= max ? s : null;
}
function formatScore(lower, upper) {
  const lo = Number(lower), hi = Number(upper);
  const fmt = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
  return approximatelyEqual(lo, hi) ? `${fmt(lo)} из 100` : `${fmt(lo)}–${fmt(hi)} из 100`;
}
function formatMsk(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "н/д";
  const d = new Date(n + 3 * 60 * 60 * 1000);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dd}.${mm} ${hh}:${mi} МСК`;
}
function formatFunding(funding) {
  const rate = finite(funding?.rate_pct);
  const interval = finite(funding?.interval_hours);
  if (rate === null || interval === null || interval <= 0) return null;
  const sign = rate > 0 ? "+" : "";
  const effect = rate > 0 ? "лонг платит" : rate < 0 ? "лонг получает" : "расчёт нейтральный";
  return `Ставка: ${sign}${rate.toFixed(4)}% за ${Number.isInteger(interval) ? interval : interval.toFixed(1)} ч; ${effect}.`;
}
function safeReasons(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => textValue(v, 220))
    .filter(Boolean)
    .filter((v) => !/funding|финансир|ставк[аиу]/i.test(v))
    .slice(0, 3);
}
function safeRisk(value) {
  const s = textValue(value, 260);
  if (!s) return "изменение цены, ликвидности или условий исполнения";
  if (/funding|финансир|ставк[аиу]/i.test(s)) return "стоимость удержания учитывается отдельно; следить за ценой, ликвидностью и условиями исполнения";
  return s;
}

export function finalObserverGate(observer) {
  if (!observer) return { ok:false, status:"NO_FINAL_DECISION" };
  const checks = [
    [String(observer.mode || "") === "SHADOW_ONLY_NO_EXECUTION", "NOT_SHADOW_ONLY"],
    [Number(observer.shadow_only || 0) === 1, "SHADOW_FLAG_NOT_ONE"],
    [observer.live_probability === null || observer.live_probability === undefined, "LIVE_PROBABILITY_PRESENT"],
    [Number(observer.validated_signal || 0) === 0, "VALIDATED_SIGNAL_PRESENT"],
    [Number(observer.execution_authorized || 0) === 0, "EXECUTION_AUTHORIZED"],
    [Number(observer.telegram_eligible || 0) === 0, "WORKER_TELEGRAM_ELIGIBLE_UNEXPECTED"],
    [String(observer.decision_status || "") === "SHADOW_EVALUATED", "DECISION_NOT_EVALUATED"],
    [["LONG","SHORT"].includes(String(observer.direction || "").toUpperCase()), "DIRECTION_NOT_CLOSED"],
    [String(observer.entry_action || "") === "SHADOW_ENTRY_ELIGIBLE", "ENTRY_NOT_FINAL_ELIGIBLE"],
    [String(observer.entry_action_id || "").startsWith("FDE:"), "ENTRY_ACTION_ID_NOT_CLOSED"],
    [String(observer.directional_quality || "") === "CLOSED", "DIRECTION_QUALITY_NOT_CLOSED"],
    [String(observer.entry_quality || "") === "CLOSED", "ENTRY_QUALITY_NOT_CLOSED"],
    [String(observer.data_quality || "") === "CLOSED", "DATA_QUALITY_NOT_CLOSED"],
    [String(observer.execution_quality || "") === "CLOSED", "EXECUTION_QUALITY_NOT_CLOSED"],
    [String(observer.entry_execution_quality || "") === "CLOSED", "ENTRY_EXECUTION_QUALITY_NOT_CLOSED"],
    [["ENTRY_TRIGGER","NEXT_IMPULSE_ENTRY"].includes(String(observer.campaign_phase || "")), "CAMPAIGN_PHASE_NOT_ENTRY"],
    [String(observer.campaign_quality || "") === "CLOSED", "CAMPAIGN_QUALITY_NOT_CLOSED"],
    [String(observer.independence_state || "") === "CLOSED", "EVIDENCE_INDEPENDENCE_NOT_CLOSED"],
    [String(observer.timing_state || "") === "ENTRY_WINDOW", "ENTRY_WINDOW_NOT_CLOSED"],
    [String(observer.risk_state || "") === "CLEAR", "RISK_NOT_CLEAR"],
    [Number(observer.hard_veto || 0) === 0, "HARD_VETO_ACTIVE"],
    [String(observer.hard_veto_state || "") === "CLEAR", "HARD_VETO_STATE_NOT_CLEAR"],
    [["NONE","FLAT"].includes(String(observer.position_state || "")), "POSITION_NOT_FLAT"],
    [String(observer.position_source_quality || "") === "CLOSED", "POSITION_SOURCE_NOT_CLOSED"],
  ];
  for (const [ok, status] of checks) if (!ok) return { ok:false, status };
  return { ok:true, status:"FINAL_CHAIN_CLOSED" };
}

async function loadFinalEligibleRows(db, now) {
  const minTs = Number(now) - FINAL_DECISION_FRESH_MS;
  const result = await db.prepare(`
    SELECT decision_id, material_digest, snapshot_id, mode, decision_status, contract_code, observation_ts, direction,
           directional_quality, entry_action, entry_action_id, entry_quality, data_quality,
           execution_quality, entry_execution_quality, campaign_phase, campaign_quality,
           independence_state, timing_state, risk_state, position_state, management_action,
           hard_veto, hard_veto_state, shadow_only, live_probability, validated_signal,
           execution_authorized, telegram_eligible, decision_evidence_receipt_id,
           full_evidence_receipt_id, safety_gate_receipt_id, decision_json, persisted_ts,
           json_extract(decision_json,'$.source_quality.position') AS position_source_quality
    FROM final_decision_integration_shadow
    WHERE persisted_ts >= ?1 AND persisted_ts <= ?2
      AND entry_action='SHADOW_ENTRY_ELIGIBLE'
    ORDER BY persisted_ts DESC
    LIMIT ${MAX_FINAL_ROWS}
  `).bind(minTs, Number(now) + 60_000).all();
  const rows = Array.isArray(result?.results) ? result.results : [];
  return rows.map(normalizeFinalRow);
}

async function loadExactScoreContextRows(db, observers) {
  const ids = [...new Set((Array.isArray(observers) ? observers : [])
    .map((row) => String(row?.decision_id || "").trim())
    .filter(Boolean))].slice(0, MAX_FINAL_ROWS);
  if (!ids.length) return new Map();
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
  const result = await db.prepare(`
    SELECT context_id, decision_id, material_digest, snapshot_id, contract_code, observation_ts, direction,
           decision_evidence_receipt_id, full_evidence_receipt_id, safety_gate_receipt_id,
           score_schema, score_semantics, score_lower_bound, score_upper_bound, valid_until_ts,
           context_json, context_digest, status, persisted_ts
    FROM final_decision_telegram_context_shadow
    WHERE decision_id IN (${placeholders})
    LIMIT ${MAX_FINAL_ROWS}
  `).bind(...ids).all();
  const rows = Array.isArray(result?.results) ? result.results : [];
  const out = new Map();
  for (const row of rows) {
    const id = String(row?.decision_id || "").trim();
    if (id && !out.has(id)) out.set(id, row);
  }
  return out;
}

export function extractExactScoreContext(observer, sidecarRow, threshold = 70, now = Date.now()) {
  if (!observer) return { ok:false, status:"NO_FINAL_DECISION", context:null };
  if (!sidecarRow) return { ok:false, status:"EXACT_SCORE_CONTEXT_NOT_AVAILABLE", context:null };
  if (String(sidecarRow.status || "") !== "CLOSED") return { ok:false, status:"EXACT_SCORE_CONTEXT_NOT_CLOSED", context:null };
  if (String(sidecarRow.score_schema || "") !== EXACT_SCORE_SCHEMA || String(sidecarRow.score_semantics || "") !== EXACT_SCORE_SEMANTICS) {
    return { ok:false, status:"EXACT_SCORE_CONTEXT_SCHEMA_INVALID", context:null };
  }

  const rawContext = String(sidecarRow.context_json || "");
  if (!rawContext || sha256Text(rawContext) !== String(sidecarRow.context_digest || "").toLowerCase()) {
    return { ok:false, status:"EXACT_SCORE_CONTEXT_DIGEST_MISMATCH", context:null };
  }
  const c = parseJsonObject(rawContext);
  if (!c || c.schema !== EXACT_SCORE_SCHEMA || c.score_semantics !== EXACT_SCORE_SEMANTICS || c.is_probability !== false) {
    return { ok:false, status:"EXACT_SCORE_CONTEXT_SCHEMA_INVALID", context:null };
  }

  const direction = String(observer.direction || "").toUpperCase();
  const rowBindings = [
    [String(sidecarRow.decision_id || "") === String(observer.decision_id || ""), "SCORE_DECISION_ID_MISMATCH"],
    [String(sidecarRow.material_digest || "") === String(observer.material_digest || ""), "SCORE_MATERIAL_DIGEST_MISMATCH"],
    [String(sidecarRow.snapshot_id || "") === String(observer.snapshot_id || ""), "SCORE_SNAPSHOT_ID_MISMATCH"],
    [String(sidecarRow.contract_code || "") === String(observer.contract_code || ""), "SCORE_CONTRACT_MISMATCH"],
    [Number(sidecarRow.observation_ts || 0) === Number(observer.observation_ts || 0), "SCORE_OBSERVATION_TS_MISMATCH"],
    [String(sidecarRow.direction || "").toUpperCase() === direction, "SCORE_DIRECTION_MISMATCH"],
    [String(sidecarRow.decision_evidence_receipt_id || "") === String(observer.decision_evidence_receipt_id || ""), "SCORE_DECISION_EVIDENCE_RECEIPT_MISMATCH"],
    [String(sidecarRow.full_evidence_receipt_id || "") === String(observer.full_evidence_receipt_id || ""), "SCORE_FULL_EVIDENCE_RECEIPT_MISMATCH"],
    [String(sidecarRow.safety_gate_receipt_id || "") === String(observer.safety_gate_receipt_id || ""), "SCORE_SAFETY_GATE_RECEIPT_MISMATCH"],
  ];
  for (const [ok, status] of rowBindings) if (!ok) return { ok:false, status, context:null };

  const bindings = [
    [String(c.decision_id || "") === String(sidecarRow.decision_id || ""), "CONTEXT_DECISION_ID_MISMATCH"],
    [String(c.material_digest || "") === String(sidecarRow.material_digest || ""), "CONTEXT_MATERIAL_DIGEST_MISMATCH"],
    [String(c.snapshot_id || "") === String(sidecarRow.snapshot_id || ""), "CONTEXT_SNAPSHOT_ID_MISMATCH"],
    [Number(c.observation_ts || 0) === Number(sidecarRow.observation_ts || 0), "CONTEXT_OBSERVATION_TS_MISMATCH"],
    [String(c.direction || "").toUpperCase() === String(sidecarRow.direction || "").toUpperCase(), "CONTEXT_DIRECTION_MISMATCH"],
    [String(c.decision_evidence_receipt_id || "") === String(sidecarRow.decision_evidence_receipt_id || ""), "CONTEXT_DECISION_EVIDENCE_RECEIPT_MISMATCH"],
    [String(c.full_evidence_receipt_id || "") === String(sidecarRow.full_evidence_receipt_id || ""), "CONTEXT_FULL_EVIDENCE_RECEIPT_MISMATCH"],
    [String(c.safety_gate_receipt_id || "") === String(sidecarRow.safety_gate_receipt_id || ""), "CONTEXT_SAFETY_GATE_RECEIPT_MISMATCH"],
  ];
  for (const [ok, status] of bindings) if (!ok) return { ok:false, status, context:null };

  const persistedTs = Number(sidecarRow.persisted_ts || 0);
  const decisionPersistedTs = Number(observer.persisted_ts || 0);
  const tsNow = Number(now || Date.now());
  if (!persistedTs || (decisionPersistedTs && persistedTs < decisionPersistedTs) || persistedTs > tsNow + 60_000) {
    return { ok:false, status:"SCORE_CONTEXT_PERSISTENCE_TIME_INVALID", context:null };
  }

  const positionSemantics = {
    scope:"INTERNAL_SHADOW_ANALYTICAL_EPISODE",
    analytical_episode_state:String(observer.position_state || "UNKNOWN"),
    user_portfolio_state:"UNKNOWN",
    user_position_confirmed:false,
    user_position_quantity_contracts:null,
    user_management_authorized:false,
    alert_implies_user_trade:false,
  };

  const lower = finite(c.score_lower_bound), upper = finite(c.score_upper_bound);
  if (lower === null || upper === null || lower < 0 || upper > 100 || lower > upper) return { ok:false, status:"SCORE_INTERVAL_INVALID", context:null };
  if (!approximatelyEqual(lower, finite(sidecarRow.score_lower_bound)) || !approximatelyEqual(upper, finite(sidecarRow.score_upper_bound))) return { ok:false, status:"SCORE_INTERVAL_ROW_MISMATCH", context:null };
  if (lower < Number(threshold)) return { ok:false, status:"SCORE_LOWER_BOUND_BELOW_THRESHOLD", context:null };

  const blocks = Array.isArray(c.weighted_blocks) ? c.weighted_blocks : [];
  if (blocks.length !== BLOCKS.length) return { ok:false, status:"FOUR_BLOCK_CONTEXT_INCOMPLETE", context:null };
  let sumLower = 0, sumUpper = 0;
  for (const [id, weight] of BLOCKS) {
    const b = blocks.find((row) => String(row?.id || "") === id);
    if (!b || Number(b.weight) !== weight || !ACCEPTED_BLOCK_STATES.has(String(b.state || ""))) {
      return { ok:false, status:`BLOCK_${id}_INVALID`, context:null };
    }
    const lo = finite(b.contribution_lower), hi = finite(b.contribution_upper);
    if (lo === null || hi === null || lo < 0 || hi < lo || hi > weight) return { ok:false, status:`BLOCK_${id}_INTERVAL_INVALID`, context:null };
    sumLower += lo; sumUpper += hi;
  }
  if (!approximatelyEqual(sumLower, lower) || !approximatelyEqual(sumUpper, upper)) return { ok:false, status:"FOUR_BLOCK_SCORE_SUM_MISMATCH", context:null };

  const validUntil = Number(c.valid_until_ts || 0);
  if (validUntil !== Number(sidecarRow.valid_until_ts || 0) || !validUntil || validUntil < tsNow || validUntil > Number(observer.observation_ts || 0) + FINAL_DECISION_FRESH_MS) {
    return { ok:false, status:"SCORE_CONTEXT_STALE_OR_INVALID_EXPIRY", context:null };
  }

  const entry = c.entry || {};
  const entryArea = textValue(entry.area), target = textValue(entry.target), invalidation = textValue(entry.invalidation);
  if (!entryArea || !target || !invalidation) return { ok:false, status:"ENTRY_TARGET_INVALIDATION_NOT_BOUND", context:null };

  const funding = c.funding || {};
  const fundingRate = finite(funding.rate_pct), fundingInterval = finite(funding.interval_hours), fundingTs = Number(funding.observed_ts || 0);
  if (fundingRate === null || fundingInterval === null || fundingInterval <= 0 || fundingInterval > 168 || !fundingTs || fundingTs > Number(observer.observation_ts || 0) || Number(observer.observation_ts || 0) - fundingTs > FINAL_DECISION_FRESH_MS) {
    return { ok:false, status:"FUNDING_CONTEXT_NOT_FRESH_OR_COMPLETE", context:null };
  }

  return {
    ok:true,
    status:"EXACT_SCORE_CONTEXT_CLOSED",
    context:{
      ...c,
      score_lower_bound:lower,
      score_upper_bound:upper,
      entry:{ area:entryArea, target, invalidation },
      funding:{...funding, rate_pct:fundingRate, interval_hours:fundingInterval, observed_ts:fundingTs},
      reasons:safeReasons(c.reasons),
      risk:safeRisk(c.risk),
      position_semantics:positionSemantics,
    },
  };
}

function liquidationLines(context) {
  const l = context?.liquidations;
  if (!l || !["CONFIRMED","PARTIAL"].includes(String(l.status || ""))) {
    return ["Ликвидации: уровни крупных ликвидаций не подтверждены."];
  }
  const above = textValue(l.short_above, 500) || "не подтверждены";
  const below = textValue(l.long_below, 500) || "не подтверждены";
  const map = l.status === "PARTIAL" ? "частичная" : "подтверждённая";
  return [
    `Ликвидации шортов сверху: ${above}.`,
    `Ликвидации лонгов снизу: ${below}.`,
    `Карта: ${map}.`,
  ];
}

export function buildFinalChainTelegramMessage(observer, context, { now = Date.now() } = {}) {
  const gate = finalObserverGate(observer);
  if (!gate.ok) return { ok:false, status:gate.status, message:null };
  if (!context || context.schema !== EXACT_SCORE_SCHEMA || context.score_semantics !== EXACT_SCORE_SEMANTICS) return { ok:false, status:"EXACT_SCORE_CONTEXT_NOT_CLOSED", message:null };
  const direction = String(observer.direction || "").toUpperCase();
  if (String(context.direction || "").toUpperCase() !== direction) return { ok:false, status:"SCORE_DIRECTION_MISMATCH", message:null };
  if (context.position_semantics?.alert_implies_user_trade !== false || context.position_semantics?.user_position_confirmed !== false) return { ok:false, status:"USER_POSITION_SEMANTICS_NOT_SAFE", message:null };
  if (Number(context.valid_until_ts || 0) < Number(now)) return { ok:false, status:"SCORE_CONTEXT_EXPIRED", message:null };

  const emoji = direction === "LONG" ? "🟢" : "🔴";
  const directionRu = direction === "LONG" ? "ЛОНГ" : "ШОРТ";
  const reasons = context.reasons?.length ? context.reasons.join("; ") : "полная проверенная цепочка закрыта на этом снимке данных";
  const fundingLine = formatFunding(context.funding);
  if (!fundingLine) return { ok:false, status:"FUNDING_CONTEXT_NOT_COMPLETE", message:null };
  const lines = [
    `${emoji} ${directionRu} • ${cleanTicker(observer.contract_code)}`,
    "Условия входа подтверждены",
    `Оценка: ${formatScore(context.score_lower_bound, context.score_upper_bound)}`,
    "",
    `Вход: ${context.entry.area}`,
    `Цель: ${context.entry.target} | Отмена: ${context.entry.invalidation}`,
    `Почему: ${reasons}.`,
    fundingLine,
    `Риск: ${context.risk}.`,
    ...liquidationLines(context),
    `Проверено: ${formatMsk(observer.observation_ts)}. Действительно до ${formatMsk(context.valid_until_ts)}.`,
    "Уведомление означает рыночную возможность, а не подтверждение открытой позиции пользователя.",
  ];
  const message = lines.join("\n");
  return { ok:message.length <= 4096, status:message.length <= 4096 ? "READY" : "MESSAGE_TOO_LONG", message:message.length <= 4096 ? message : null };
}

function messageHash(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

export async function reserveDispatch(db, { dispatchKey, category, sourceRef, text, now }) {
  const hash = messageHash(text);
  const inserted = await db.prepare(`INSERT OR IGNORE INTO telegram_output_dispatch_journal_v2 (dispatch_key,category,source_ref,status,reserved_ts,updated_ts,message_hash,telegram_message_id,telegram_http_status,error_text) VALUES (?1,?2,?3,'RESERVED',?4,?4,?5,NULL,NULL,NULL)`).bind(
    dispatchKey, category, String(sourceRef || ""), Number(now), hash
  ).run();
  const changes = changesFromRun(inserted);
  if (changes === 1) return { ok:true, reserved:true, reason:"ATOMIC_RESERVATION_ACQUIRED" };
  if (changes === null) return { ok:false, reserved:false, reason:"RESERVATION_ACK_UNKNOWN" };

  const existing = await db.prepare(`SELECT status,reserved_ts,updated_ts,message_hash,error_text FROM telegram_output_dispatch_journal_v2 WHERE dispatch_key=?1 LIMIT 1`).bind(dispatchKey).first();
  if (!existing) return { ok:false, reserved:false, reason:"RESERVATION_CONFLICT_WITHOUT_ROW" };
  const status = String(existing.status || "");
  if (status === "SENT") return { ok:true, reserved:false, reason:"ALREADY_SENT" };
  if (status === "RESERVED") {
    const unknown = /DELIVERY_UNKNOWN/i.test(String(existing.error_text || ""));
    return { ok:true, reserved:false, reason:unknown ? "DELIVERY_UNKNOWN_NO_AUTORETRY" : "EXISTING_RESERVATION_NO_AUTORETRY" };
  }
  if (status === "SEND_FAILED") return { ok:true, reserved:false, reason:"DEFINITE_FAILURE_REQUIRES_NEW_DECISION_OR_EXPLICIT_RETRY" };
  return { ok:true, reserved:false, reason:"EXISTING_DISPATCH_STATE_NO_AUTORETRY" };
}

async function finalizeDispatch(db, dispatchKey, sendResult, now) {
  if (sendResult?.delivery_state === "SENT") {
    await db.prepare(`UPDATE telegram_output_dispatch_journal_v2 SET status='SENT',updated_ts=?2,telegram_message_id=?3,telegram_http_status=?4,error_text=NULL WHERE dispatch_key=?1 AND status='RESERVED'`).bind(
      dispatchKey, Number(now), sendResult?.message_id == null ? null : String(sendResult.message_id), sendResult?.http_status == null ? null : Number(sendResult.http_status)
    ).run();
    return "SENT";
  }
  if (sendResult?.delivery_state === "SEND_FAILED") {
    await db.prepare(`UPDATE telegram_output_dispatch_journal_v2 SET status='SEND_FAILED',updated_ts=?2,telegram_http_status=?3,error_text=?4 WHERE dispatch_key=?1 AND status='RESERVED'`).bind(
      dispatchKey, Number(now), sendResult?.http_status == null ? null : Number(sendResult.http_status), String(sendResult?.error || sendResult?.telegram_description || sendResult?.status || "SEND_FAILED").slice(0,600)
    ).run();
    return "SEND_FAILED";
  }
  const detail = String(sendResult?.error || sendResult?.telegram_description || sendResult?.status || "AMBIGUOUS_DELIVERY").slice(0,520);
  await db.prepare(`UPDATE telegram_output_dispatch_journal_v2 SET updated_ts=?2,telegram_http_status=?3,error_text=?4 WHERE dispatch_key=?1 AND status='RESERVED'`).bind(
    dispatchKey, Number(now), sendResult?.http_status == null ? null : Number(sendResult.http_status), `DELIVERY_UNKNOWN:${detail}`
  ).run();
  return "DELIVERY_UNKNOWN";
}

async function sendRelay({ relayUrl, relayKey, text, fetchImpl }) {
  const url = String(relayUrl || DEFAULT_RELAY_URL).trim();
  const key = String(relayKey || "").trim();
  if (!url || !key) return {ok:false,status:"RELAY_NOT_CONFIGURED",delivery_state:"SEND_FAILED",error:"RELAY_NOT_CONFIGURED"};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELAY_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url,{method:"POST",headers:{"content-type":"application/json; charset=UTF-8",authorization:`Bearer ${key}`},body:JSON.stringify({text:String(text||"")}),signal:controller.signal});
    let body=null, parsed=false;
    try { body=await response.json(); parsed=true; } catch { body=null; }
    if (response.ok && parsed && body?.ok === true) {
      return {ok:true,status:body?.status||"SENT",delivery_state:"SENT",http_status:response.status,message_id:body?.message_id??null,telegram_description:body?.telegram_description??null};
    }
    if (parsed && body?.ok === false) {
      return {ok:false,status:body?.status||"RELAY_REJECTED",delivery_state:"SEND_FAILED",http_status:response.status,message_id:body?.message_id??null,telegram_description:body?.telegram_description??null,error:body?.error??null};
    }
    return {ok:false,status:"AMBIGUOUS_RELAY_RESPONSE",delivery_state:"DELIVERY_UNKNOWN",http_status:response.status,error:parsed?"RELAY_RESPONSE_WITHOUT_EXPLICIT_RESULT":"RELAY_INVALID_JSON"};
  } catch(error) {
    return {ok:false,status:error?.name === "AbortError" ? "RELAY_TIMEOUT" : "NETWORK_ERROR",delivery_state:"DELIVERY_UNKNOWN",error:String(error?.message||error)};
  } finally { clearTimeout(timer); }
}

export function buildBudgetBlockedTelegramOutput({enabled=false,infoEnabled=false,shadowDecisionAuto=false}={}) {
  const outputEnabled=boolValue(enabled);
  const infoOn=outputEnabled && boolValue(infoEnabled);
  const finalAuto=outputEnabled && boolValue(shadowDecisionAuto);
  return {
    version:"telegram-output-budget-guard", enabled:outputEnabled, info_enabled:infoOn, final_chain_auto:finalAuto,
    morning:{status:"BLOCKED_D1_PREACTION_BUDGET",sent:false},
    early_info:{status:"BLOCKED_D1_PREACTION_BUDGET",sent:false,count:0},
    watch70:{status:"DISABLED_FINAL_CHAIN_ONLY",sent:0},
    shadow_decision:{status:"BLOCKED_D1_PREACTION_BUDGET",sent:false,count:0,skipped:[{reason:"BLOCKED"}]},
  };
}


export async function runTelegramOutputLayer({
  db, startedTs, source, relayUrl, relayKey,
  reportTest=false, shadowDecisionAuto=false, watch70Enabled=false, watch70Threshold=70,
  infoEnabled=false, infoTestId=null, enabled=false, clock=Date.now, fetchImpl=globalThis.fetch.bind(globalThis),
  infoObserveEnabled=false, currentLifecycle=null,
}={}) {
  const ts=Number(startedTs||Date.now());
  const outputEnabled=boolValue(enabled);
  const finalAuto=outputEnabled && boolValue(shadowDecisionAuto);
  const threshold=Number.isFinite(Number(watch70Threshold)) ? Math.max(70,Math.min(100,Number(watch70Threshold))) : 70;
  const infoOn=outputEnabled && boolValue(infoEnabled);
  const output={
    version:OUTPUT_VERSION, enabled:outputEnabled, info_enabled:infoOn, final_chain_auto:finalAuto, final_chain_threshold:threshold,
    morning:{status:infoOn?"NOT_DUE":"INFO_DISABLED",sent:false},
    early_info:{status:infoOn?"NO_NEW_WAIT":"INFO_DISABLED",sent:false,count:0},
    watch70:{status:"DISABLED_FINAL_CHAIN_ONLY",sent:0},
    shadow_decision:{status:finalAuto?"NO_EVENT":"AUTO_OFF",sent:false,count:0},
  };
  if (!outputEnabled) {
    output.shadow_decision={status:"OUTPUT_DISABLED",sent:false,count:0};
    console.log("TELEGRAM_OUTPUT_LAYER",JSON.stringify(output));
    return output;
  }
  if (infoOn && finalAuto) {
    output.morning={status:"INFO_FINAL_AUTO_CONFLICT",sent:false};
    output.shadow_decision={status:"INFO_FINAL_AUTO_CONFLICT",sent:false,count:0};
    console.log("TELEGRAM_OUTPUT_LAYER",JSON.stringify(output));
    return output;
  }
  if (infoOn) {
    try {
      // A lifecycle persisted during this cycle is newer than startedTs.
      // Validate against the actual publication clock, never move timestamps.
      const info=await runInformationalTelegram({db,now:clock(),source,relayUrl,relayKey,fetchImpl,reportTest,infoTestId,sendRelay,clock,
        observeEnabled:boolValue(infoObserveEnabled),currentLifecycle});
      output.morning=info.morning;
      output.early_info=info.early_info;
    } catch(error) {
      output.morning={status:"INFO_ERROR_FAIL_CLOSED",sent:false,error:String(error?.message||error).slice(0,400)};
      output.early_info={status:"INFO_ERROR_FAIL_CLOSED",sent:false,count:0};
    }
  }
  if (!finalAuto) {
    console.log("TELEGRAM_OUTPUT_LAYER",JSON.stringify(output));
    return output;
  }

  try {
    const finalRows=await loadFinalEligibleRows(db,ts);
    if (!finalRows.length) {
      output.shadow_decision={status:"NO_FINAL_ENTRY_ELIGIBLE",sent:false,count:0};
      console.log("TELEGRAM_OUTPUT_LAYER",JSON.stringify(output));
      return output;
    }
    const scoreContexts=await loadExactScoreContextRows(db,finalRows);
    const sentRows=[];
    const skipped=[];
    const seenDecisionIds=new Set();
    for (const observer of finalRows) {
      const decisionId=String(observer?.decision_id||"");
      if (!decisionId || seenDecisionIds.has(decisionId)) continue;
      seenDecisionIds.add(decisionId);
      const persistedTs=Number(observer?.persisted_ts||0);
      if (!persistedTs || ts-persistedTs>FINAL_DECISION_FRESH_MS || persistedTs-ts>60_000) { skipped.push({decision_id:decisionId,contract:observer.contract_code,reason:"STALE_OR_FUTURE_FINAL_DECISION"}); continue; }
      const gate=finalObserverGate(observer);
      if (!gate.ok) { skipped.push({decision_id:decisionId,contract:observer.contract_code,reason:gate.status}); continue; }
      const extracted=extractExactScoreContext(observer,scoreContexts.get(decisionId) || null,threshold,ts);
      if (!extracted.ok) { skipped.push({decision_id:decisionId,contract:observer.contract_code,reason:extracted.status}); continue; }
      const built=buildFinalChainTelegramMessage(observer,extracted.context,{now:ts});
      if (!built.ok) { skipped.push({decision_id:decisionId,contract:observer.contract_code,reason:built.status}); continue; }
      const dispatchKey=`final-chain:${decisionId}`;
      const sourceRef=`${decisionId}|${String(observer.snapshot_id||"")}`;
      const reservation=await reserveDispatch(db,{dispatchKey,category:"FINAL_CHAIN_CANDIDATE",sourceRef,text:built.message,now:ts});
      if (!reservation.reserved) { skipped.push({decision_id:decisionId,contract:observer.contract_code,reason:reservation.reason||"DUPLICATE"}); continue; }
      const sendResult=await sendRelay({relayUrl,relayKey,text:built.message,fetchImpl});
      const dispatchState=await finalizeDispatch(db,dispatchKey,sendResult,Date.now());
      if (dispatchState === "SENT") {
        sentRows.push({decision_id:decisionId,contract:observer.contract_code,direction:observer.direction,score_lower_bound:extracted.context.score_lower_bound,score_upper_bound:extracted.context.score_upper_bound,message_id:sendResult.message_id??null});
      } else {
        skipped.push({decision_id:decisionId,contract:observer.contract_code,reason:dispatchState});
      }
    }
    output.shadow_decision={
      status:sentRows.length?"SENT":(finalRows.length?"NO_NEW_FINAL_AFTER_GATES":"NO_FINAL_ENTRY_ELIGIBLE"),
      sent:sentRows.length>0,count:sentRows.length,sent_rows:sentRows,skipped,
    };
  } catch(error) {
    output.shadow_decision={status:"ERROR_FAIL_CLOSED",sent:false,count:0,error:String(error?.message||error).slice(0,600)};
  }
  console.log("TELEGRAM_OUTPUT_LAYER",JSON.stringify(output));
  return output;
}
