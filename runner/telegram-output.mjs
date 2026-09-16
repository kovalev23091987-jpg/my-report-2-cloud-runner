import crypto from "node:crypto";

const OUTPUT_VERSION = "telegram-output-v3-watch70-analysis";
const DEFAULT_RELAY_URL = "https://my-report-2-hub.kovalev23091987.workers.dev/telegram-test";
const RELAY_TIMEOUT_MS = 15_000;

function finite(v) {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function boolValue(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function moscowClock(ts) {
  const d = new Date(Number(ts) + 3 * 60 * 60 * 1000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    date_key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    hhmm: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
  };
}

function cleanTicker(contract) {
  const s = String(contract || "UNKNOWN");
  return s.replace(/-USDT$/i, "");
}

function formatFunding(rate) {
  const n = finite(rate);
  if (n === null) return "финансирование н/д";
  const pct = n * 100;
  const sign = pct > 0 ? "+" : "";
  return `финансирование ${sign}${pct.toFixed(3)}%`;
}

function formatUsd(v) {
  const n = finite(v);
  if (n === null) return "объём н/д";
  if (Math.abs(n) >= 1_000_000_000) return `объём ${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `объём ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `объём ${(n / 1_000).toFixed(0)}K`;
  return `объём ${Math.round(n)}`;
}

function parseCompactStage0Payload(payloadText) {
  let payload;
  try {
    payload = typeof payloadText === "string" ? JSON.parse(payloadText) : payloadText;
  } catch {
    return { status: "PAYLOAD_INVALID", rows: [] };
  }
  if (!payload || payload.schema !== "stage0-compact-v2" || !Array.isArray(payload.contracts)) {
    return { status: "PAYLOAD_UNSUPPORTED", rows: [] };
  }
  const rows = [];
  for (const raw of payload.contracts) {
    if (!Array.isArray(raw) || !raw.length) continue;
    const [
      contract, price, turnover, oiContracts, oiValue, fundingRate, fundingIntervalHours,
      marketAgeSec, dataStatus, longWatch = null, shortWatch = null,
      longTriggerCount = 0, shortTriggerCount = 0,
    ] = raw;
    if (!String(contract || "").trim()) continue;
    rows.push({
      contract: String(contract),
      price: finite(price),
      turnover_24h_usdt: finite(turnover),
      oi_contracts: finite(oiContracts),
      oi_value_usdt: finite(oiValue),
      funding_rate: finite(fundingRate),
      funding_interval_hours: finite(fundingIntervalHours),
      market_age_sec: finite(marketAgeSec),
      data_status: String(dataStatus || ""),
      long_watch: longWatch === true,
      short_watch: shortWatch === true,
      long_trigger_count: Number.isFinite(Number(longTriggerCount)) ? Number(longTriggerCount) : 0,
      short_trigger_count: Number.isFinite(Number(shortTriggerCount)) ? Number(shortTriggerCount) : 0,
    });
  }
  return { status: "CLOSED", rows };
}

function rankCandidates(rows, side, limit = 3) {
  const flag = side === "LONG" ? "long_watch" : "short_watch";
  const triggers = side === "LONG" ? "long_trigger_count" : "short_trigger_count";
  return rows
    .filter((r) => r.data_status === "CLOSED" && r[flag] === true && r.market_age_sec !== null && r.market_age_sec <= 300)
    .sort((a, b) => (b[triggers] - a[triggers]) || ((b.turnover_24h_usdt || 0) - (a.turnover_24h_usdt || 0)))
    .slice(0, limit);
}

function candidateLine(row, side) {
  const emoji = side === "LONG" ? "🟢" : "🔴";
  const triggers = side === "LONG" ? row.long_trigger_count : row.short_trigger_count;
  return `${emoji} ${cleanTicker(row.contract)} — наблюдение • признаков: ${triggers} • ${formatFunding(row.funding_rate)} • ${formatUsd(row.turnover_24h_usdt)}`;
}

export function buildMorningTelegramReport({ scanRow, telegramObserver, test = false, now = Date.now() } = {}) {
  if (!scanRow || Number(scanRow.stage0_coverage_pct || 0) < 99.9 || Number(scanRow.errors || 0) !== 0 || Number(scanRow.stale || 0) !== 0) {
    return { ok: false, status: "SCAN_NOT_CLOSED", message: null };
  }
  const parsed = parseCompactStage0Payload(scanRow.payload_json);
  if (parsed.status !== "CLOSED") return { ok: false, status: parsed.status, message: null };

  const longs = rankCandidates(parsed.rows, "LONG", 3);
  const shorts = rankCandidates(parsed.rows, "SHORT", 3);
  const clock = moscowClock(now);
  const lines = [
    test ? "🧪 Мой отчёт 2 — проверка Telegram" : "☀️ Мой отчёт 2 — утро",
    `${clock.date_key} • ${clock.hhmm} МСК`,
    `HTX: ${Number(scanRow.scanned || 0)}/${Number(scanRow.universe_total || 0)} • данные ${Number(scanRow.stage0_coverage_pct || 0).toFixed(0)}%`,
    "",
  ];

  if (!longs.length && !shorts.length) {
    lines.push("Сильных сигналов сейчас нет.");
  } else {
    if (longs.length) {
      lines.push("LONG:");
      for (const r of longs) lines.push(candidateLine(r, "LONG"));
    } else {
      lines.push("LONG: сильных кандидатов нет");
    }
    lines.push("");
    if (shorts.length) {
      lines.push("SHORT:");
      for (const r of shorts) lines.push(candidateLine(r, "SHORT"));
    } else {
      lines.push("SHORT: сильных кандидатов нет");
    }
  }

  if (telegramObserver?.status === "FOUND_SAFE_SHADOW_ROW") {
    const action = ["HOLD", "EXIT"].includes(String(telegramObserver.management_action || ""))
      ? String(telegramObserver.management_action)
      : String(telegramObserver.entry_action || "WAIT");
    lines.push("", `⚡ Final Decision: ${cleanTicker(telegramObserver.contract_code)} • ${String(telegramObserver.direction || "")} • ${action}`);
  }

  lines.push("", "Кандидаты — наблюдение, не торговый сигнал.");
  const message = lines.join("\n").trim();
  return {
    ok: message.length > 0 && message.length <= 4096,
    status: message.length <= 4096 ? "READY" : "MESSAGE_TOO_LONG",
    message: message.length <= 4096 ? message : null,
    long_count: longs.length,
    short_count: shorts.length,
  };
}

export function buildShadowDecisionTelegramMessage(observer) {
  if (!observer || observer.status !== "FOUND_SAFE_SHADOW_ROW") return { ok: false, status: "NO_SAFE_ROW", message: null };
  if (observer.hard_veto === true) return { ok: false, status: "HARD_VETO", message: null };
  const directionRaw = String(observer.direction || "").toUpperCase();
  const direction = directionRaw === "LONG" ? "ЛОНГ" : directionRaw === "SHORT" ? "ШОРТ" : "НЕ ОПРЕДЕЛЕНО";
  const rawAction = ["HOLD", "EXIT"].includes(String(observer.management_action || ""))
    ? String(observer.management_action)
    : String(observer.entry_action || "NOT_EVALUATED");
  const actionable = new Set(["SHADOW_ENTRY_ELIGIBLE", "HOLD", "EXIT"]);
  if (!actionable.has(rawAction)) return { ok: false, status: "NOT_ACTIONABLE", message: null };
  const actionMap = {
    SHADOW_ENTRY_ELIGIBLE: "ВХОД — теневой кандидат",
    HOLD: "УДЕРЖИВАТЬ — теневой режим",
    EXIT: "ВЫХОД — теневой режим",
  };
  const whyMap = {
    SHADOW_ENTRY_ELIGIBLE: "Финальные проверки закрыты, окно входа подтверждено.",
    HOLD: "Финальная логика управления допускает удержание.",
    EXIT: "Финальная логика управления требует выхода.",
  };
  const qualityMap = {
    CLOSED: "подтверждено",
    PARTIAL: "частично",
    CONFLICTING: "конфликт",
    BLOCKED: "заблокировано",
    INSUFFICIENT: "недостаточно данных",
    NOT_EVALUATED: "не проверено",
  };
  const lines = [
    "⚡ Мой отчёт 2 — финальное решение",
    "НЕ ТОРГОВЫЙ СИГНАЛ",
    "",
    `${directionRaw === "LONG" ? "🟢" : directionRaw === "SHORT" ? "🔴" : "⚪️"} ${cleanTicker(observer.contract_code)} • ${direction}`,
    `Действие: ${actionMap[rawAction]}`,
    `Почему: ${whyMap[rawAction]}`,
    `Данные: ${qualityMap[String(observer.data_quality || "NOT_EVALUATED")] || "не проверено"}`,
    "Автоторговля и вероятность выключены.",
  ];
  const message = lines.join("\n");
  return { ok: message.length <= 4096, status: message.length <= 4096 ? "READY" : "MESSAGE_TOO_LONG", message: message.length <= 4096 ? message : null, action: rawAction };
}

async function loadScanPayload(db, scanTs) {
  const ts = Number(scanTs || 0);
  if (!ts) return null;
  return db.prepare(`
    SELECT ts,universe_total,scanned,errors,stale,stage0_coverage_pct,payload_json
    FROM scan_runs
    WHERE ts BETWEEN ?1 AND ?2
    ORDER BY ABS(ts - ?3) ASC
    LIMIT 1
  `).bind(ts - 1500, ts + 1500, ts).first();
}

function messageHash(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

async function reserveDispatch(db, { dispatchKey, category, sourceRef, text, now }) {
  const existing = await db.prepare(`
    SELECT status,reserved_ts,updated_ts FROM telegram_output_dispatch_journal_v2
    WHERE dispatch_key=?1 LIMIT 1
  `).bind(dispatchKey).first();
  if (String(existing?.status || "") === "SENT") return { ok: true, reserved: false, reason: "ALREADY_SENT" };
  if (String(existing?.status || "") === "RESERVED" && Number(existing?.reserved_ts || 0) > Number(now) - 60 * 60_000) {
    return { ok: true, reserved: false, reason: "RECENT_RESERVATION" };
  }
  if (String(existing?.status || "") === "SEND_FAILED" && Number(existing?.updated_ts || 0) > Number(now) - 15 * 60_000) {
    return { ok: true, reserved: false, reason: "SEND_RETRY_COOLDOWN_15M" };
  }
  const hash = messageHash(text);
  await db.prepare(`
    INSERT OR REPLACE INTO telegram_output_dispatch_journal_v2
    (dispatch_key,category,source_ref,status,reserved_ts,updated_ts,message_hash,telegram_message_id,telegram_http_status,error_text)
    VALUES (?1,?2,?3,'RESERVED',?4,?4,?5,NULL,NULL,NULL)
  `).bind(dispatchKey, category, String(sourceRef || ""), Number(now), hash).run();
  return { ok: true, reserved: true, message_hash: hash };
}

async function finalizeDispatch(db, dispatchKey, sendResult, now) {
  const sent = sendResult?.ok === true;
  await db.prepare(`
    UPDATE telegram_output_dispatch_journal_v2
    SET status=?2,updated_ts=?3,telegram_message_id=?4,telegram_http_status=?5,error_text=?6
    WHERE dispatch_key=?1
  `).bind(
    dispatchKey,
    sent ? "SENT" : "SEND_FAILED",
    Number(now),
    sendResult?.message_id == null ? null : String(sendResult.message_id),
    sendResult?.http_status == null ? null : Number(sendResult.http_status),
    sent ? null : String(sendResult?.error || sendResult?.telegram_description || sendResult?.status || "SEND_FAILED").slice(0, 600),
  ).run();
  return { status: sent ? "SENT" : "SEND_FAILED" };
}

async function shadowCooldownActive(db, sourceRef, now) {
  const row = await db.prepare(`
    SELECT updated_ts FROM telegram_output_dispatch_journal_v2
    WHERE category='SHADOW_FINAL_DECISION' AND source_ref=?1 AND status='SENT' AND updated_ts>=?2
    ORDER BY updated_ts DESC LIMIT 1
  `).bind(String(sourceRef || ""), Number(now) - 30 * 60_000).first();
  return Boolean(row && Number(row.updated_ts || 0) > 0);
}


function scoreDirection(row) {
  const hint = String(row?.direction_hint || "").toUpperCase();
  const longScore = finite(row?.dc_long);
  const shortScore = finite(row?.dc_short);
  if (hint === "LONG" && longScore !== null) return { direction: "LONG", score: longScore };
  if (hint === "SHORT" && shortScore !== null) return { direction: "SHORT", score: shortScore };
  if (longScore === null && shortScore === null) return { direction: null, score: null };
  if (longScore !== null && shortScore !== null && Math.abs(longScore - shortScore) < 10) return { direction: null, score: Math.max(longScore, shortScore) };
  if ((longScore ?? -Infinity) > (shortScore ?? -Infinity)) return { direction: "LONG", score: longScore };
  return { direction: "SHORT", score: shortScore };
}

async function loadWatch70Candidates(db, now, threshold = 70) {
  const minTs = Number(now) - 30 * 60_000;
  const result = await db.prepare(`
    SELECT shadow_id, contract_code, observed_ts, direction_hint, dc_long, dc_short,
           eq_status, dq_status, stage, data_sufficiency, missing_chains_json, evidence_flags_json, calibrated,
           actual_decision_generated, validated, telegram_started
    FROM shadow_decision_log
    WHERE observed_ts >= ?1
    ORDER BY observed_ts DESC
    LIMIT 120
  `).bind(minTs).all();
  const rows = Array.isArray(result?.results) ? result.results : [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const observedTs = Number(row?.observed_ts || 0);
    if (!observedTs || observedTs > Number(now) + 60_000 || Number(now) - observedTs > 30 * 60_000) continue;
    if (Number(row?.calibrated || 0) !== 0) continue;
    if (Number(row?.actual_decision_generated || 0) !== 0) continue;
    if (Number(row?.validated || 0) !== 0) continue;
    if (Number(row?.telegram_started || 0) !== 0) continue;
    if (String(row?.eq_status || "") !== "SHADOW_MEASURABLE") continue;
    const dq = String(row?.dq_status || "");
    if (!(dq === "HTX_CLOSED_EXTERNAL_CHAINS_MISSING" || dq === "CLOSED")) continue;
    const ds = String(row?.data_sufficiency || "").toUpperCase();
    if (ds === "INSUFFICIENT") continue;
    const { direction, score } = scoreDirection(row);
    if (!direction || score === null || score < Number(threshold) || score > 100) continue;
    const contract = String(row?.contract_code || "").trim();
    if (!contract) continue;
    const key = `${contract}|${direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      shadow_id: String(row?.shadow_id || `${observedTs}:${contract}`),
      contract_code: contract,
      observed_ts: observedTs,
      direction,
      score,
      dq_status: dq,
      eq_status: String(row?.eq_status || ""),
      stage: String(row?.stage || ""),
      data_sufficiency: String(row?.data_sufficiency || ""),
      evidence_flags: parseJsonObject(row?.evidence_flags_json),
      missing_chains: parseJsonArray(row?.missing_chains_json),
    });
  }
  return out.slice(0, 5);
}

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value.map((x) => String(x));
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
  } catch { return []; }
}

function flagTrue(value) {
  if (value === true || value === 1) return true;
  const s = String(value ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function fmtSignedPct(value, digits = 1) {
  const n = finite(value);
  if (n === null) return null;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function explainWatch70Candidate(candidate) {
  const e = candidate?.evidence_flags || {};
  const side = String(candidate?.direction || "").toUpperCase();
  const isLong = side === "LONG";
  const funding = finite(e.funding_pct);
  const p1 = finite(e.price_1h_pct);
  const p4 = finite(e.price_4h_pct);
  const f1 = finite(e.futures_flow_1h_delta_pct);
  const f4 = finite(e.futures_flow_4h_delta_pct);
  const spot = finite(e.spot_flow_delta_pct);
  const oi1 = finite(e.oi_1h_change_pct);
  const oi4 = finite(e.oi_4h_change_pct);
  const coverage = finite(e.htx_coverage_pct);
  const absorption1 = flagTrue(e.absorption_1h);
  const absorption4 = flagTrue(e.absorption_4h);
  const spotGreen = String(e.spot_quality || "").toUpperCase() === "GREEN";

  const why = [];
  const patterns = [];
  const strengths = [];
  const risks = [];

  if (funding !== null && ((isLong && funding < 0) || (!isLong && funding > 0))) {
    why.push(`${isLong ? "отрицательный" : "положительный"} funding ${fmtSignedPct(funding, 3)}`);
    patterns.push(isLong ? "squeeze-фон по funding" : "перегрев по funding");
  }
  if (p1 !== null && ((isLong && p1 > 0) || (!isLong && p1 < 0))) {
    why.push(`цена ${fmtSignedPct(p1)} за 1ч`);
    patterns.push(isLong ? "цена подтверждает силу" : "цена подтверждает слабость");
  } else if (p4 !== null && ((isLong && p4 > 0) || (!isLong && p4 < 0))) {
    why.push(`цена ${fmtSignedPct(p4)} за 4ч`);
  }
  if (f1 !== null && ((isLong && f1 > 0) || (!isLong && f1 < 0))) {
    why.push(`фьючерсный поток ${fmtSignedPct(f1)}`);
    patterns.push(isLong ? "активные покупки поддерживают движение" : "активные продажи поддерживают движение");
  } else if (f4 !== null && ((isLong && f4 > 0) || (!isLong && f4 < 0))) {
    why.push(`поток 4ч ${fmtSignedPct(f4)}`);
  }

  if (oi1 !== null && p1 !== null) {
    if (isLong && oi1 > 0 && oi1 > Math.max(p1, 0) + 0.5) {
      patterns.push(`OI ${fmtSignedPct(oi1)} растёт быстрее цены`);
    }
    if (!isLong && oi1 > 0 && p1 <= 0) {
      patterns.push(`OI ${fmtSignedPct(oi1)} растёт при слабой цене`);
    }
  } else if (oi4 !== null && p4 !== null) {
    if (isLong && oi4 > 0 && oi4 > Math.max(p4, 0) + 1) patterns.push(`OI 4ч ${fmtSignedPct(oi4)} опережает цену`);
    if (!isLong && oi4 > 0 && p4 <= 0) patterns.push(`OI 4ч ${fmtSignedPct(oi4)} растёт при слабой цене`);
  }

  if (isLong && (absorption1 || absorption4)) patterns.push("продажи поглощаются");
  if (isLong && f1 !== null && f1 < 0 && p1 !== null && p1 >= 0) strengths.push(`продажи ${fmtSignedPct(f1)} не продавили цену`);
  if (!isLong && f1 !== null && f1 > 0 && p1 !== null && p1 <= 0) strengths.push(`покупки ${fmtSignedPct(f1)} не подняли цену`);
  if (spot !== null && ((isLong && spot > 0) || (!isLong && spot < 0))) strengths.push(`спот подтверждает: ${fmtSignedPct(spot)}`);
  if (spotGreen) strengths.push("спотовые данные качественные");
  if (coverage !== null) strengths.push(`HTX покрытие ${Math.round(coverage)}%`);

  const missing = new Set((candidate?.missing_chains || []).map(String));
  const priorityMissing = [
    ["btc_eth_and_sector_relative_strength", "сила к BTC/ETH ещё не закрыта"],
    ["cross_exchange_derivatives", "кросс-биржевая проверка ещё не закрыта"],
    ["smart_money_onchain", "Smart Money/on-chain ещё не закрыт"],
    ["external_market_regime_timing", "режим рынка и тайминг ещё не закрыты"],
    ["supporting_risk_supply_social_fundamentals", "social/unlock/fundamentals ещё не закрыты"],
    ["portfolio_risk_if_positions_known", "портфельный риск не проверен"],
  ];
  for (const [key, label] of priorityMissing) if (missing.has(key)) risks.push(label);

  if (funding !== null && ((isLong && funding > 0) || (!isLong && funding < 0))) risks.push(`funding ${fmtSignedPct(funding, 3)} не поддерживает ${isLong ? "LONG" : "SHORT"}`);
  if (spot !== null && ((isLong && spot < 0) || (!isLong && spot > 0))) risks.push(`спот-поток ${fmtSignedPct(spot)} идёт против идеи`);

  const whyFinal = unique(why).slice(0, 3);
  const patternsFinal = unique(patterns).slice(0, 4);
  const strengthsFinal = unique(strengths).slice(0, 2);
  const risksFinal = unique(risks).slice(0, 2);

  return {
    why: whyFinal.length ? whyFinal : [`совокупная оценка ${Math.round(Number(candidate?.score || 0))}/100 при закрытой HTX-исполнимости`],
    patterns: patternsFinal,
    strengths: strengthsFinal,
    risks: risksFinal,
  };
}

export function buildWatch70TelegramMessage(candidate, { test = false } = {}) {
  if (!candidate) return { ok: false, status: "CANDIDATE_MISSING", message: null };
  const score = finite(candidate?.score);
  const directionRaw = String(candidate?.direction || "").toUpperCase();
  if (!Number.isFinite(score) || score < 70 || score > 100) return { ok: false, status: "SCORE_BELOW_70_OR_INVALID", message: null };
  if (!new Set(["LONG","SHORT"]).has(directionRaw)) return { ok: false, status: "DIRECTION_INVALID", message: null };
  const emoji = directionRaw === "LONG" ? "🟢" : "🔴";
  const info = explainWatch70Candidate(candidate);
  const lines = [
    test ? `🧪 ${emoji} ${directionRaw} • ${cleanTicker(candidate.contract_code)}` : `${emoji} ${directionRaw} • ${cleanTicker(candidate.contract_code)}`,
    `Оценка: ${Math.round(score)}/100`,
    "",
    `Почему в списке: ${info.why.join(" • ")}.`,
  ];
  if (info.patterns.length) lines.push(`Паттерны: ${info.patterns.join(" • ")}.`);
  if (info.strengths.length) lines.push(`Сильное: ${info.strengths.join(" • ")}.`);
  if (info.risks.length) lines.push(`Перед входом: ${info.risks.join(" • ")}.`);
  else lines.push("Перед входом: перепроверить структуру, ликвидность и условие отмены идеи.");
  const message = lines.join("\n");
  return { ok: message.length <= 4096, status: message.length <= 4096 ? "READY" : "MESSAGE_TOO_LONG", message: message.length <= 4096 ? message : null };
}

async function watch70CooldownActive(db, sourceRef, now) {
  const row = await db.prepare(`
    SELECT updated_ts FROM telegram_output_dispatch_journal_v2
    WHERE category='WATCH70_CANDIDATE' AND source_ref=?1 AND status='SENT' AND updated_ts>=?2
    ORDER BY updated_ts DESC LIMIT 1
  `).bind(String(sourceRef || ""), Number(now) - 30 * 60_000).first();
  return Boolean(row && Number(row.updated_ts || 0) > 0);
}

async function sendRelay({ relayUrl, relayKey, text, fetchImpl }) {
  const url = String(relayUrl || DEFAULT_RELAY_URL).trim();
  const key = String(relayKey || "").trim();
  if (!url || !key) return { ok: false, status: "RELAY_NOT_CONFIGURED" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELAY_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=UTF-8",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ text: String(text || "") }),
      signal: controller.signal,
    });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    return {
      ok: response.ok && body?.ok === true,
      status: body?.status || (response.ok ? "SENT" : "HTTP_ERROR"),
      http_status: response.status,
      message_id: body?.message_id ?? null,
      telegram_description: body?.telegram_description ?? null,
    };
  } catch (error) {
    return { ok: false, status: "NETWORK_ERROR", error: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

export async function runTelegramOutputLayer({
  db,
  scan,
  telegramObserver,
  startedTs,
  source,
  relayUrl,
  relayKey,
  reportTest = false,
  shadowDecisionAuto = false,
  watch70Enabled = false,
  watch70Threshold = 70,
  enabled = false,
  fetchImpl = globalThis.fetch.bind(globalThis),
} = {}) {
  const ts = Number(startedTs || Date.now());
  const clock = moscowClock(ts);
  const testRequested = boolValue(reportTest) && source !== "schedule";
  const outputEnabled = boolValue(enabled);
  const morningDue = outputEnabled && source === "schedule" && clock.hour === 9;
  const shadowAuto = outputEnabled && boolValue(shadowDecisionAuto);
  const watch70Auto = outputEnabled && boolValue(watch70Enabled);
  const watch70Floor = Number.isFinite(Number(watch70Threshold)) ? Math.max(70, Math.min(100, Number(watch70Threshold))) : 70;
  const output = {
    version: OUTPUT_VERSION,
    enabled: outputEnabled,
    morning_due: morningDue,
    report_test_requested: testRequested,
    shadow_decision_auto: shadowAuto,
    watch70_auto: watch70Auto,
    watch70_threshold: watch70Floor,
    morning: { status: "NOT_DUE", sent: false },
    watch70: { status: watch70Auto ? "NO_MATCH" : (outputEnabled ? "AUTO_OFF" : "OUTPUT_DISABLED"), sent: 0 },
    shadow_decision: { status: shadowAuto ? "NO_EVENT" : (outputEnabled ? "AUTO_OFF" : "OUTPUT_DISABLED"), sent: false },
  };

  if (!outputEnabled && !testRequested) {
    output.morning = { status: "OUTPUT_DISABLED", sent: false };
    output.watch70 = { status: "OUTPUT_DISABLED", sent: 0 };
    console.log("TELEGRAM_OUTPUT_LAYER", JSON.stringify(output));
    return output;
  }

  if (testRequested || morningDue) {
    try {
      const scanRow = await loadScanPayload(db, scan?.ts);
      const built = buildMorningTelegramReport({ scanRow, telegramObserver, test: testRequested, now: ts });
      if (!built.ok) {
        output.morning = { status: built.status, sent: false };
      } else if (testRequested) {
        const sendResult = await sendRelay({ relayUrl, relayKey, text: built.message, fetchImpl });
        output.morning = { status: sendResult.ok ? "TEST_SENT" : "TEST_SEND_FAILED", sent: sendResult.ok === true, message_id: sendResult.message_id ?? null, http_status: sendResult.http_status ?? null };
      } else {
        const dispatchKey = `morning:${clock.date_key}`;
        const reservation = await reserveDispatch(db, { dispatchKey, category: "MORNING_REPORT", sourceRef: String(scan?.ts || ""), text: built.message, now: ts });
        if (!reservation.reserved) {
          output.morning = { status: reservation.reason || "DUPLICATE", sent: false };
        } else {
          const sendResult = await sendRelay({ relayUrl, relayKey, text: built.message, fetchImpl });
          await finalizeDispatch(db, dispatchKey, sendResult, Date.now());
          output.morning = { status: sendResult.ok ? "SENT" : "SEND_FAILED", sent: sendResult.ok === true, message_id: sendResult.message_id ?? null, http_status: sendResult.http_status ?? null };
        }
      }
    } catch (error) {
      output.morning = { status: "ERROR_FAIL_CLOSED", sent: false, error: String(error?.message || error).slice(0, 600) };
    }
  }


  if (watch70Auto) {
    try {
      const candidates = await loadWatch70Candidates(db, ts, watch70Floor);
      const sentRows = [];
      const skipped = [];
      for (const candidate of candidates) {
        const sourceRef = `${candidate.contract_code}|${candidate.direction}`;
        if (await watch70CooldownActive(db, sourceRef, ts)) {
          skipped.push({ contract: candidate.contract_code, reason: "COOLDOWN_30M" });
          continue;
        }
        const built = buildWatch70TelegramMessage(candidate);
        if (!built.ok) {
          skipped.push({ contract: candidate.contract_code, reason: built.status });
          continue;
        }
        const dispatchKey = `watch70:${candidate.shadow_id}`;
        const reservation = await reserveDispatch(db, { dispatchKey, category: "WATCH70_CANDIDATE", sourceRef, text: built.message, now: ts });
        if (!reservation.reserved) {
          skipped.push({ contract: candidate.contract_code, reason: reservation.reason || "DUPLICATE" });
          continue;
        }
        const sendResult = await sendRelay({ relayUrl, relayKey, text: built.message, fetchImpl });
        await finalizeDispatch(db, dispatchKey, sendResult, Date.now());
        if (sendResult.ok) sentRows.push({ contract: candidate.contract_code, direction: candidate.direction, score: candidate.score, message_id: sendResult.message_id ?? null });
        else skipped.push({ contract: candidate.contract_code, reason: sendResult.status || "SEND_FAILED" });
      }
      output.watch70 = { status: sentRows.length ? "SENT" : (candidates.length ? "NO_NEW_AFTER_DEDUP_COOLDOWN" : "NO_MATCH"), sent: sentRows.length, candidates: candidates.length, sent_rows: sentRows, skipped };
    } catch (error) {
      output.watch70 = { status: "ERROR_FAIL_CLOSED", sent: 0, error: String(error?.message || error).slice(0, 600) };
    }
  }

  if (shadowAuto && telegramObserver?.status === "FOUND_SAFE_SHADOW_ROW") {
    try {
      const persistedTs = Number(telegramObserver.persisted_ts || 0);
      if (!persistedTs || ts - persistedTs > 15 * 60_000 || persistedTs - ts > 60_000) {
        output.shadow_decision = { status: "STALE_OR_FUTURE_DECISION", sent: false };
      } else {
        const built = buildShadowDecisionTelegramMessage(telegramObserver);
        if (!built.ok) {
          output.shadow_decision = { status: built.status, sent: false };
        } else {
          const sourceRef = `${String(telegramObserver.contract_code || "UNKNOWN")}|${String(telegramObserver.direction || "UNKNOWN")}`;
          if (await shadowCooldownActive(db, sourceRef, ts)) {
            output.shadow_decision = { status: "COOLDOWN_30M", sent: false };
          } else {
            const dispatchKey = `decision:${String(telegramObserver.decision_id || "UNKNOWN")}:${String(built.action || "ACTION")}`;
            const reservation = await reserveDispatch(db, { dispatchKey, category: "SHADOW_FINAL_DECISION", sourceRef, text: built.message, now: ts });
            if (!reservation.reserved) {
              output.shadow_decision = { status: reservation.reason || "DUPLICATE", sent: false };
            } else {
              const sendResult = await sendRelay({ relayUrl, relayKey, text: built.message, fetchImpl });
              await finalizeDispatch(db, dispatchKey, sendResult, Date.now());
              output.shadow_decision = { status: sendResult.ok ? "SENT" : "SEND_FAILED", sent: sendResult.ok === true, message_id: sendResult.message_id ?? null, http_status: sendResult.http_status ?? null };
            }
          }
        }
      }
    } catch (error) {
      output.shadow_decision = { status: "ERROR_FAIL_CLOSED", sent: false, error: String(error?.message || error).slice(0, 600) };
    }
  }

  console.log("TELEGRAM_OUTPUT_LAYER", JSON.stringify(output));
  if (testRequested) {
    console.log("TELEGRAM_REPORT_TEST", output.morning.sent === true ? "STATUS_PASS SENT_TRUE" : `STATUS_FAIL ${output.morning.status}`);
  }
  return output;
}
