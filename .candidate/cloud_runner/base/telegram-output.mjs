import crypto from "node:crypto";

const OUTPUT_VERSION = "telegram-output-v6-final-chain-only-ru-exact";
const DEFAULT_RELAY_URL = "https://my-report-2-hub.kovalev23091987.workers.dev/telegram-test";
const RELAY_TIMEOUT_MS = 15_000;
const FINAL_DECISION_FRESH_MS = 15 * 60_000;
const FINAL_SCORE_LOOKBACK_MS = 15 * 60_000;
const MAX_FINAL_ROWS = 20;
const MAX_SCORE_ROWS = 160;

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
function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
function scoreDirection(row) {
  const hint = String(row?.direction_hint || "").toUpperCase();
  const longScore = finite(row?.dc_long);
  const shortScore = finite(row?.dc_short);
  if (hint === "LONG" && longScore !== null) return { direction: "LONG", score: longScore };
  if (hint === "SHORT" && shortScore !== null) return { direction: "SHORT", score: shortScore };
  if (longScore === null && shortScore === null) return { direction: null, score: null };
  if (longScore !== null && shortScore !== null && Math.abs(longScore - shortScore) < 10) return { direction: null, score: Math.max(longScore, shortScore) };
  return (longScore ?? -Infinity) > (shortScore ?? -Infinity)
    ? { direction: "LONG", score: longScore }
    : { direction: "SHORT", score: shortScore };
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
  };
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
    SELECT decision_id, mode, decision_status, contract_code, observation_ts, direction,
           directional_quality, entry_action, entry_action_id, entry_quality, data_quality,
           execution_quality, entry_execution_quality, campaign_phase, campaign_quality,
           independence_state, timing_state, risk_state, position_state, management_action,
           hard_veto, hard_veto_state, shadow_only, live_probability, validated_signal,
           execution_authorized, telegram_eligible, persisted_ts,
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

async function loadRecentScoreRows(db, now) {
  const result = await db.prepare(`
    SELECT shadow_id, contract_code, observed_ts, direction_hint, dc_long, dc_short,
           evidence_flags_json, data_sufficiency
    FROM shadow_decision_log
    WHERE observed_ts >= ?1 AND observed_ts <= ?2
    ORDER BY observed_ts DESC
    LIMIT ${MAX_SCORE_ROWS}
  `).bind(Number(now) - 30 * 60_000, Number(now) + 60_000).all();
  return Array.isArray(result?.results) ? result.results : [];
}

function findFinalScoreContext(scoreRows, observer, threshold) {
  const obsTs = Number(observer?.observation_ts || observer?.persisted_ts || 0);
  const contract = String(observer?.contract_code || "").trim();
  const wantedDirection = String(observer?.direction || "").toUpperCase();
  if (!obsTs || !contract || !["LONG","SHORT"].includes(wantedDirection)) return null;
  const candidates = scoreRows
    .filter((row) => String(row?.contract_code || "") === contract)
    .filter((row) => Math.abs(Number(row?.observed_ts || 0) - obsTs) <= FINAL_SCORE_LOOKBACK_MS)
    .sort((a,b) => Math.abs(Number(a?.observed_ts||0)-obsTs)-Math.abs(Number(b?.observed_ts||0)-obsTs));
  for (const row of candidates) {
    if (String(row?.data_sufficiency || "").toUpperCase() === "INSUFFICIENT") continue;
    const { direction, score } = scoreDirection(row);
    if (direction !== wantedDirection || score === null || score < Number(threshold) || score > 100) continue;
    return {
      shadow_id: String(row?.shadow_id || ""),
      observed_ts: Number(row?.observed_ts || 0),
      direction,
      score,
      evidence_flags: parseJsonObject(row?.evidence_flags_json),
    };
  }
  return null;
}

function explainFinalCandidate(observer, context) {
  const e = context?.evidence_flags || {};
  const isLong = String(observer?.direction || "").toUpperCase() === "LONG";
  const funding = finite(e.funding_pct);
  const p1 = finite(e.price_1h_pct);
  const p4 = finite(e.price_4h_pct);
  const f1 = finite(e.futures_flow_1h_delta_pct);
  const spot = finite(e.spot_flow_delta_pct);
  const oi1 = finite(e.oi_1h_change_pct);
  const why = [];
  const risks = [];

  if (funding !== null && ((isLong && funding < 0) || (!isLong && funding > 0))) why.push("ставка финансирования поддерживает идею");
  if (p1 !== null && ((isLong && p1 > 0) || (!isLong && p1 < 0))) why.push(isLong ? "цена сохраняет движение вверх" : "цена сохраняет движение вниз");
  else if (p4 !== null && ((isLong && p4 > 0) || (!isLong && p4 < 0))) why.push(isLong ? "за последние часы сохраняется сила" : "за последние часы сохраняется слабость");
  if (f1 !== null && ((isLong && f1 > 0) || (!isLong && f1 < 0))) why.push(isLong ? "покупатели активнее продавцов" : "продавцы активнее покупателей");
  if (oi1 !== null && p1 !== null && oi1 > 0) {
    if (isLong && oi1 > Math.max(p1, 0) + 0.5) why.push("открытый интерес растёт быстрее цены");
    if (!isLong && p1 <= 0) why.push("открытый интерес растёт при слабой цене");
  }
  if (spot !== null && ((isLong && spot > 0) || (!isLong && spot < 0))) why.push("спотовый рынок подтверждает направление");

  if (funding !== null && ((isLong && funding > 0) || (!isLong && funding < 0))) risks.push("ставка финансирования может ослабить идею");
  if (spot !== null && ((isLong && spot < 0) || (!isLong && spot > 0))) risks.push("спотовый рынок пока не полностью поддерживает направление");
  if (!risks.length) risks.push(isLong ? "главный риск — быстрое ослабление покупателей и открытого интереса" : "главный риск — быстрое ослабление продавцов и открытого интереса");

  return {
    why: unique(why).slice(0,4),
    strengths: ["прошла все обязательные проверки", "качество данных и входа подтверждено"],
    risks: unique(risks).slice(0,2),
  };
}

export function buildFinalChainTelegramMessage(observer, context) {
  const gate = finalObserverGate(observer);
  if (!gate.ok) return { ok:false, status:gate.status, message:null };
  const score = finite(context?.score);
  if (score === null || score < 70 || score > 100) return { ok:false, status:"FINAL_SCORE_BELOW_70_OR_MISSING", message:null };
  const direction = String(observer.direction).toUpperCase();
  if (String(context?.direction || "").toUpperCase() !== direction) return { ok:false, status:"SCORE_DIRECTION_MISMATCH", message:null };
  const emoji = direction === "LONG" ? "🟢" : "🔴";
  const directionRu = direction === "LONG" ? "ЛОНГ" : "ШОРТ";
  const info = explainFinalCandidate(observer, context);
  const why = info.why.length ? info.why.join(", ") : "полная цепочка проверок подтвердила направление и подходящее окно входа";
  const lines = [
    `${emoji} ${directionRu} • ${cleanTicker(observer.contract_code)}`,
    `Оценка: ${Math.round(score)} из 100`,
    "",
    `Почему выбрана: ${why}.`,
    `Сильные стороны: ${info.strengths.join(", ")}.`,
    `Риск: ${info.risks.join(", ")}.`,
  ];
  const message = lines.join("\n");
  return { ok:message.length <= 4096, status:message.length <= 4096 ? "READY" : "MESSAGE_TOO_LONG", message:message.length <= 4096 ? message : null };
}

function messageHash(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}
async function reserveDispatch(db, { dispatchKey, category, sourceRef, text, now }) {
  const existing = await db.prepare(`SELECT status,reserved_ts,updated_ts FROM telegram_output_dispatch_journal_v2 WHERE dispatch_key=?1 LIMIT 1`).bind(dispatchKey).first();
  if (String(existing?.status || "") === "SENT") return { ok:true, reserved:false, reason:"ALREADY_SENT" };
  if (String(existing?.status || "") === "RESERVED" && Number(existing?.reserved_ts || 0) > Number(now)-60*60_000) return { ok:true, reserved:false, reason:"RECENT_RESERVATION" };
  if (String(existing?.status || "") === "SEND_FAILED" && Number(existing?.updated_ts || 0) > Number(now)-15*60_000) return { ok:true, reserved:false, reason:"SEND_RETRY_COOLDOWN_15M" };
  const hash = messageHash(text);
  await db.prepare(`INSERT OR REPLACE INTO telegram_output_dispatch_journal_v2 (dispatch_key,category,source_ref,status,reserved_ts,updated_ts,message_hash,telegram_message_id,telegram_http_status,error_text) VALUES (?1,?2,?3,'RESERVED',?4,?4,?5,NULL,NULL,NULL)`).bind(dispatchKey, category, String(sourceRef||""), Number(now), hash).run();
  return { ok:true, reserved:true };
}
async function finalizeDispatch(db, dispatchKey, sendResult, now) {
  const sent = sendResult?.ok === true;
  await db.prepare(`UPDATE telegram_output_dispatch_journal_v2 SET status=?2,updated_ts=?3,telegram_message_id=?4,telegram_http_status=?5,error_text=?6 WHERE dispatch_key=?1`).bind(
    dispatchKey, sent?"SENT":"SEND_FAILED", Number(now), sendResult?.message_id==null?null:String(sendResult.message_id), sendResult?.http_status==null?null:Number(sendResult.http_status), sent?null:String(sendResult?.error||sendResult?.telegram_description||sendResult?.status||"SEND_FAILED").slice(0,600)
  ).run();
}
async function finalCooldownActive(db, sourceRef, now) {
  const row = await db.prepare(`SELECT updated_ts FROM telegram_output_dispatch_journal_v2 WHERE category='FINAL_CHAIN_CANDIDATE' AND source_ref=?1 AND status='SENT' AND updated_ts>=?2 ORDER BY updated_ts DESC LIMIT 1`).bind(String(sourceRef||""), Number(now)-30*60_000).first();
  return Boolean(row && Number(row.updated_ts||0)>0);
}
async function sendRelay({ relayUrl, relayKey, text, fetchImpl }) {
  const url = String(relayUrl || DEFAULT_RELAY_URL).trim();
  const key = String(relayKey || "").trim();
  if (!url || !key) return {ok:false,status:"RELAY_NOT_CONFIGURED"};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELAY_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url,{method:"POST",headers:{"content-type":"application/json; charset=UTF-8",authorization:`Bearer ${key}`},body:JSON.stringify({text:String(text||"")}),signal:controller.signal});
    let body=null; try { body=await response.json(); } catch { body=null; }
    return {ok:response.ok&&body?.ok===true,status:body?.status||(response.ok?"SENT":"HTTP_ERROR"),http_status:response.status,message_id:body?.message_id??null,telegram_description:body?.telegram_description??null};
  } catch(error) { return {ok:false,status:"NETWORK_ERROR",error:String(error?.message||error)}; }
  finally { clearTimeout(timer); }
}

export async function runTelegramOutputLayer({
  db, startedTs, source, relayUrl, relayKey,
  reportTest=false, shadowDecisionAuto=false, watch70Enabled=false, watch70Threshold=70,
  enabled=false, fetchImpl=globalThis.fetch.bind(globalThis),
}={}) {
  const ts=Number(startedTs||Date.now());
  const outputEnabled=boolValue(enabled);
  const finalAuto=outputEnabled && boolValue(shadowDecisionAuto);
  const threshold=Number.isFinite(Number(watch70Threshold)) ? Math.max(70,Math.min(100,Number(watch70Threshold))) : 70;
  const output={
    version:OUTPUT_VERSION, enabled:outputEnabled, final_chain_auto:finalAuto, final_chain_threshold:threshold,
    morning:{status:"DISABLED_FINAL_CHAIN_ONLY",sent:false},
    watch70:{status:"DISABLED_FINAL_CHAIN_ONLY",sent:0},
    shadow_decision:{status:finalAuto?"NO_EVENT":"AUTO_OFF",sent:false,count:0},
  };
  if (!outputEnabled) {
    output.shadow_decision={status:"OUTPUT_DISABLED",sent:false,count:0};
    console.log("TELEGRAM_OUTPUT_LAYER",JSON.stringify(output));
    return output;
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
    const scoreRows=await loadRecentScoreRows(db,ts);
    const sentRows=[];
    const skipped=[];
    const seen=new Set();
    for (const observer of finalRows) {
      const persistedTs=Number(observer?.persisted_ts||0);
      if (!persistedTs || ts-persistedTs>FINAL_DECISION_FRESH_MS || persistedTs-ts>60_000) { skipped.push({contract:observer.contract_code,reason:"STALE_OR_FUTURE_FINAL_DECISION"}); continue; }
      const gate=finalObserverGate(observer);
      if (!gate.ok) { skipped.push({contract:observer.contract_code,reason:gate.status}); continue; }
      const context=findFinalScoreContext(scoreRows,observer,threshold);
      if (!context) { skipped.push({contract:observer.contract_code,reason:"NO_MATCHING_SCORE_70_AFTER_FINAL_CHAIN"}); continue; }
      const key=`${observer.contract_code}|${observer.direction}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const built=buildFinalChainTelegramMessage(observer,context);
      if (!built.ok) { skipped.push({contract:observer.contract_code,reason:built.status}); continue; }
      if (await finalCooldownActive(db,key,ts)) { skipped.push({contract:observer.contract_code,reason:"COOLDOWN_30M"}); continue; }
      const dispatchKey=`final-chain:${String(observer.decision_id||"UNKNOWN")}`;
      const reservation=await reserveDispatch(db,{dispatchKey,category:"FINAL_CHAIN_CANDIDATE",sourceRef:key,text:built.message,now:ts});
      if (!reservation.reserved) { skipped.push({contract:observer.contract_code,reason:reservation.reason||"DUPLICATE"}); continue; }
      const sendResult=await sendRelay({relayUrl,relayKey,text:built.message,fetchImpl});
      await finalizeDispatch(db,dispatchKey,sendResult,Date.now());
      if (sendResult.ok) sentRows.push({contract:observer.contract_code,direction:observer.direction,score:context.score,message_id:sendResult.message_id??null});
      else skipped.push({contract:observer.contract_code,reason:sendResult.status||"SEND_FAILED"});
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
