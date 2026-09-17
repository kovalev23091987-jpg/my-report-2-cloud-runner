export const PUBLIC_EVIDENCE_ADAPTERS_VERSION = "public-evidence-adapters-v1";

const HOUR_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6500;

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function nfcUpper(value) {
  return text(value).normalize("NFC").toUpperCase();
}

function asciiOnly(value) {
  return /^[\x20-\x7E]+$/.test(String(value || ""));
}

function pctChange(from, to) {
  const a = finiteOrNull(from);
  const b = finiteOrNull(to);
  if (a === null || b === null || a === 0) return null;
  return ((b / a) - 1) * 100;
}

function safeMedian(values) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

export function parseHtxUsdtContract(contractCode) {
  const exact = text(contractCode).normalize("NFC");
  const m = exact.match(/^(.+)-USDT$/u);
  if (!m) {
    return {
      ok: false,
      contract_code: exact || null,
      base: null,
      quote: null,
      ascii_base: false,
      reason: "NOT_USDT_CONTRACT_SHAPE",
    };
  }
  const base = m[1];
  return {
    ok: Boolean(base),
    contract_code: exact,
    base,
    quote: "USDT",
    ascii_base: asciiOnly(base),
    reason: base ? null : "EMPTY_BASE",
  };
}

export function candidateVenueAliases(contractCode) {
  const p = parseHtxUsdtContract(contractCode);
  if (!p.ok || !p.ascii_base) {
    return {
      contract_code: p.contract_code,
      alias_candidate_safe: false,
      reason: p.ok ? "NON_ASCII_REQUIRES_VERIFIED_ALIAS" : p.reason,
      bybit: null,
      okx_swap: null,
      okx_spot: null,
      gate_futures: null,
      binance_futures: null,
      binance_spot: null,
    };
  }
  const base = nfcUpper(p.base);
  return {
    contract_code: p.contract_code,
    alias_candidate_safe: true,
    reason: null,
    bybit: `${base}USDT`,
    okx_swap: `${base}-USDT-SWAP`,
    okx_spot: `${base}-USDT`,
    gate_futures: `${base}_USDT`,
    binance_futures: `${base}USDT`,
    binance_spot: `${base}USDT`,
  };
}

async function fetchJson(fetchImpl, url, timeoutMs = FETCH_TIMEOUT_MS) {
  const f = fetchImpl || globalThis.fetch;
  if (typeof f !== "function") {
    return { ok: false, status: null, data: null, error: "FETCH_UNAVAILABLE", url };
  }
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await f(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller?.signal,
    });
    const status = Number(response?.status) || null;
    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      return { ok: false, status, data: null, error: `JSON_PARSE:${String(error?.message || error)}`.slice(0, 240), url };
    }
    return {
      ok: Boolean(response?.ok),
      status,
      data,
      error: response?.ok ? null : `HTTP_${status ?? "UNKNOWN"}`,
      url,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      data: null,
      error: String(error?.name === "AbortError" ? "TIMEOUT" : (error?.message || error)).slice(0, 240),
      url,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function bybitApiError(raw) {
  if (!raw?.ok) return raw?.error || "BYBIT_HTTP_ERROR";
  if (Number(raw?.data?.retCode) !== 0) return `BYBIT_API_${raw?.data?.retCode ?? "UNKNOWN"}:${text(raw?.data?.retMsg) || "ERROR"}`;
  return null;
}

function okxApiError(raw) {
  if (!raw?.ok) return raw?.error || "OKX_HTTP_ERROR";
  if (text(raw?.data?.code) !== "0") return `OKX_API_${text(raw?.data?.code) || "UNKNOWN"}:${text(raw?.data?.msg) || "ERROR"}`;
  return null;
}

function binanceApiError(raw) {
  if (!raw?.ok) return raw?.error || "BINANCE_HTTP_ERROR";
  if (raw?.data && !Array.isArray(raw.data) && raw.data.code !== undefined) {
    return `BINANCE_API_${raw.data.code}:${text(raw.data.msg) || "ERROR"}`;
  }
  return null;
}

function gateApiError(raw) {
  if (!raw?.ok) return raw?.error || "GATE_HTTP_ERROR";
  if (raw?.data && !Array.isArray(raw.data) && raw.data.label) {
    return `GATE_API_${text(raw.data.label) || "UNKNOWN"}:${text(raw.data.message) || "ERROR"}`;
  }
  return null;
}

function externalEvidenceBase({ contractCode, chain, metric, source, venue, marketType, nowTs, sourceTs, maxAgeSec, status, value, unit, coveragePct, historyCoveragePct, window, aliasRequired, aliasVerified, sourceCompatible, primaryMarketId, settlementPeriod, note, error }) {
  const venueObservationStatus = status;
  const identityBlocked = Boolean(aliasRequired && !aliasVerified);
  return {
    contract_code: contractCode,
    chain,
    metric,
    source,
    venue,
    market_type: marketType,
    value: value ?? null,
    unit: unit ?? null,
    observed_ts: nowTs,
    // Factual producer availability time: this adapter observed the payload now.
    available_ts: nowTs,
    source_ts: sourceTs ?? null,
    max_age_sec: finiteOrNull(maxAgeSec),
    now_ts: nowTs,
    status: identityBlocked ? "SOURCE_INCOMPATIBLE" : status,
    venue_observation_status: venueObservationStatus,
    eligible_for_chain_closure: !identityBlocked && status === "CLOSED" && !aliasRequired,
    coverage_pct: coveragePct ?? null,
    history_coverage_pct: historyCoveragePct ?? null,
    window: window ?? null,
    source_health: error ? "ERROR" : (status === "CLOSED" ? "OK" : "DEGRADED"),
    symbol_verified: true,
    alias_required: Boolean(aliasRequired),
    alias_verified: Boolean(aliasVerified),
    alias_verification_scope: aliasRequired ? "VENUE_MARKET_SYMBOL_ONLY" : "NOT_REQUIRED",
    asset_identity_verified: false,
    source_compatible: sourceCompatible !== false,
    independence_group: `${venue}_OFFICIAL_PUBLIC`,
    primary_market_id: primaryMarketId ?? null,
    settlement_period: settlementPeriod ?? null,
    note: note ?? null,
    error: error ?? null,
  };
}

export function parseBybitInstrumentVerification(payload, expectedSymbol) {
  const rows = Array.isArray(payload?.result?.list) ? payload.result.list : [];
  const expected = nfcUpper(expectedSymbol);
  const row = rows.find(r => nfcUpper(r?.symbol) === expected) || null;
  const apiOk = Number(payload?.retCode) === 0;
  const ok = apiOk && Boolean(row) &&
    nfcUpper(row?.quoteCoin) === "USDT" &&
    nfcUpper(row?.settleCoin) === "USDT" &&
    nfcUpper(row?.contractType) === "LINEARPERPETUAL" &&
    nfcUpper(row?.status) === "TRADING" &&
    row?.isPreListing !== true;
  return {
    api_ok: apiOk,
    verified: ok,
    exact_symbol: row?.symbol || null,
    base_coin: row?.baseCoin || null,
    quote_coin: row?.quoteCoin || null,
    settle_coin: row?.settleCoin || null,
    contract_type: row?.contractType || null,
    funding_interval_minutes: finiteOrNull(row?.fundingInterval),
    status: row?.status || null,
    error: ok ? null : (!apiOk ? `BYBIT_API_${payload?.retCode ?? "UNKNOWN"}:${text(payload?.retMsg) || "ERROR"}` : "BYBIT_ACTIVE_USDT_PERPETUAL_NOT_VERIFIED"),
  };
}

export function parseOkxInstrumentVerification(payload, expectedInstId, expectedType) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const expected = nfcUpper(expectedInstId);
  const row = rows.find(r => nfcUpper(r?.instId) === expected) || null;
  const type = nfcUpper(expectedType);
  const apiOk = text(payload?.code) === "0";
  const baseExpected = expected.replace(/-USDT(?:-SWAP)?$/u, "");
  const baseGot = nfcUpper(row?.baseCcy || row?.ctValCcy);
  const quoteOk = type === "SPOT" ? nfcUpper(row?.quoteCcy) === "USDT" : nfcUpper(row?.settleCcy) === "USDT";
  const ok = apiOk && Boolean(row) && nfcUpper(row?.instType) === type &&
    nfcUpper(row?.state) === "LIVE" && baseGot === baseExpected && quoteOk;
  return {
    api_ok: apiOk,
    verified: ok,
    exact_symbol: row?.instId || null,
    base_coin: row?.baseCcy || row?.ctValCcy || null,
    quote_coin: row?.quoteCcy || null,
    settle_coin: row?.settleCcy || null,
    instrument_type: row?.instType || null,
    state: row?.state || null,
    error: ok ? null : (!apiOk ? `OKX_API_${text(payload?.code) || "UNKNOWN"}:${text(payload?.msg) || "ERROR"}` : "OKX_ACTIVE_USDT_MARKET_NOT_VERIFIED"),
  };
}

export function parseBinanceEchoVerification(payload, expectedSymbol) {
  const expected = nfcUpper(expectedSymbol);
  const rows = Array.isArray(payload?.symbols) ? payload.symbols : [];
  const row = rows.find(r => nfcUpper(r?.symbol) === expected) || null;
  const apiOk = !payload?.code && Array.isArray(payload?.symbols);
  const ok = apiOk && Boolean(row) && nfcUpper(row?.contractType) === "PERPETUAL" &&
    nfcUpper(row?.status) === "TRADING" && nfcUpper(row?.quoteAsset) === "USDT" &&
    nfcUpper(row?.marginAsset) === "USDT";
  return {
    api_ok: apiOk,
    verified: ok,
    exact_symbol: row?.symbol || null,
    base_coin: row?.baseAsset || null,
    quote_coin: row?.quoteAsset || null,
    settle_coin: row?.marginAsset || null,
    contract_type: row?.contractType || null,
    status: row?.status || null,
    error: ok ? null : (!apiOk ? `BINANCE_API_${payload?.code ?? "UNKNOWN"}:${text(payload?.msg) || "ERROR"}` : "BINANCE_ACTIVE_USDT_PERPETUAL_NOT_VERIFIED"),
  };
}


export function parseGateInstrumentVerification(payload, expectedContract) {
  const expected = nfcUpper(expectedContract);
  const exact = nfcUpper(payload?.name);
  const apiOk = Boolean(payload && typeof payload === "object" && !Array.isArray(payload) && !payload?.label && text(payload?.name));
  const quoteOk = exact.endsWith("_USDT");
  const ok = apiOk && exact === expected && quoteOk && payload?.in_delisting !== true;
  const fundingIntervalSec = finiteOrNull(payload?.funding_interval);
  return {
    api_ok: apiOk,
    verified: ok,
    exact_symbol: payload?.name || null,
    base_coin: exact ? exact.replace(/_USDT$/u, "") : null,
    quote_coin: quoteOk ? "USDT" : null,
    settle_coin: quoteOk ? "USDT" : null,
    contract_type: quoteOk ? "USDT_PERPETUAL" : null,
    funding_interval_minutes: fundingIntervalSec === null ? null : fundingIntervalSec / 60,
    status: payload?.in_delisting === true ? "DELISTING" : (ok ? "TRADING" : null),
    error: ok ? null : (!apiOk ? `GATE_API_${text(payload?.label) || "UNKNOWN"}:${text(payload?.message) || "ERROR"}` : "GATE_ACTIVE_USDT_PERPETUAL_NOT_VERIFIED"),
  };
}

export function parseBybitFunding(payload) {
  const rows = Array.isArray(payload?.result?.list) ? payload.result.list : [];
  const series = rows.map(r => ({ ts: finiteOrNull(r?.fundingRateTimestamp), rate: finiteOrNull(r?.fundingRate) }))
    .filter(r => r.ts !== null && r.rate !== null)
    .sort((a, b) => a.ts - b.ts);
  return fundingSeriesSummary(series);
}

export function parseOkxFunding(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const series = rows.map(r => {
    const realized = finiteOrNull(r?.realizedRate);
    return { ts: finiteOrNull(r?.fundingTime), rate: realized };
  })
    .filter(r => r.ts !== null && r.rate !== null)
    .sort((a, b) => a.ts - b.ts);
  return fundingSeriesSummary(series);
}

export function parseBinanceFunding(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  const series = rows.map(r => ({ ts: finiteOrNull(r?.fundingTime), rate: finiteOrNull(r?.fundingRate) }))
    .filter(r => r.ts !== null && r.rate !== null)
    .sort((a, b) => a.ts - b.ts);
  return fundingSeriesSummary(series);
}

function fundingSeriesSummary(series) {
  const duplicates = Math.max(0, series.length - new Set(series.map(r=>r.ts)).size);
  const deltas = [];
  for (let i = 1; i < series.length; i++) {
    const delta = (series[i].ts - series[i - 1].ts) / HOUR_MS;
    if (delta > 0) deltas.push(delta);
  }
  const latestInterval = deltas.at(-1) ?? null;
  const recent = deltas.slice(-3);
  const intervalConsistent = recent.length > 0 && latestInterval !== null && recent.every(x=>Math.abs(x-latestInterval)<=0.01);
  return {
    series,
    latest: series.at(-1) || null,
    inferred_interval_hours: latestInterval,
    median_interval_hours: safeMedian(deltas),
    duplicate_settlements: duplicates,
    interval_consistent: intervalConsistent,
  };
}

export function parseBybitOi(payload) {
  const rows = Array.isArray(payload?.result?.list) ? payload.result.list : [];
  const series = rows.map(r => ({ ts: finiteOrNull(r?.timestamp), oi: finiteOrNull(r?.openInterest) }))
    .filter(r => r.ts !== null && r.oi !== null)
    .sort((a, b) => a.ts - b.ts);
  return { series, latest: series.at(-1) || null };
}

export function parseOkxOi(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const series = rows.map(r => ({ ts: finiteOrNull(r?.ts), oi: finiteOrNull(r?.oi), oi_ccy: finiteOrNull(r?.oiCcy), oi_usd: finiteOrNull(r?.oiUsd) }))
    .filter(r => r.ts !== null && (r.oi !== null || r.oi_usd !== null))
    .sort((a, b) => a.ts - b.ts);
  return { series, latest: series.at(-1) || null };
}

export function parseBinanceOi(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  const series = rows.map(r => ({ ts: finiteOrNull(r?.timestamp), oi: finiteOrNull(r?.sumOpenInterest), oi_value: finiteOrNull(r?.sumOpenInterestValue) }))
    .filter(r => r.ts !== null && (r.oi !== null || r.oi_value !== null))
    .sort((a, b) => a.ts - b.ts);
  return { series, latest: series.at(-1) || null };
}


export function parseGateContractStats(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  const series = rows.map(r => ({
    ts: finiteOrNull(r?.time) === null ? null : finiteOrNull(r?.time) * 1000,
    oi: finiteOrNull(r?.open_interest),
    oi_usd: finiteOrNull(r?.open_interest_usd),
    mark_price: finiteOrNull(r?.mark_price),
    funding_rate: finiteOrNull(r?.last_funding_rate),
    long_taker_size: finiteOrNull(r?.long_taker_size),
    short_taker_size: finiteOrNull(r?.short_taker_size),
    long_liq_usd: finiteOrNull(r?.long_liq_usd_new ?? r?.long_liq_usd),
    short_liq_usd: finiteOrNull(r?.short_liq_usd_new ?? r?.short_liq_usd),
  })).filter(r => r.ts !== null).sort((a,b)=>a.ts-b.ts);
  return { series, latest: series.at(-1) || null };
}

export function parseGateHourlyCandles(payload, nowTs = Date.now()) {
  const rows = Array.isArray(payload) ? payload : [];
  return rows.map(r => {
    const openTsSec = finiteOrNull(r?.t);
    const openTs = openTsSec === null ? null : openTsSec * 1000;
    return normalizedCandle(openTs, r?.o, r?.h, r?.l, r?.c, r?.v, openTs !== null && openTs + HOUR_MS <= nowTs);
  }).filter(Boolean).filter(r => r.closed).sort((a,b)=>a.ts-b.ts);
}

function exactHourlyCoverage(series, endTs, hours) {
  const targetTs = endTs - Number(hours) * HOUR_MS;
  const expectedPoints = Number(hours) + 1;
  const inWindow = (Array.isArray(series) ? series : [])
    .filter(r => Number.isFinite(r?.ts) && r.ts >= targetTs && r.ts <= endTs)
    .sort((a,b)=>a.ts-b.ts);
  const timestamps = inWindow.map(r=>r.ts);
  const unique = new Set(timestamps);
  let maxGapMs = null;
  for (let i=1;i<timestamps.length;i++) {
    const gap=timestamps[i]-timestamps[i-1];
    maxGapMs=maxGapMs===null?gap:Math.max(maxGapMs,gap);
  }
  const targetPresent = unique.has(targetTs);
  const endPresent = unique.has(endTs);
  const exactCadence = timestamps.length >= 2 && timestamps.every((ts,i)=>i===0 || ts-timestamps[i-1]===HOUR_MS);
  const closed = targetPresent && endPresent && unique.size === expectedPoints && timestamps.length === expectedPoints && exactCadence;
  return {
    target_ts: targetTs,
    expected_points: expectedPoints,
    received_points: timestamps.length,
    unique_points: unique.size,
    max_gap_ms: maxGapMs,
    target_present: targetPresent,
    end_present: endPresent,
    exact_cadence: exactCadence,
    coverage_pct: expectedPoints ? Math.min(100, unique.size / expectedPoints * 100) : 0,
    closed,
  };
}

export function oiWindowChange(series, hours) {
  const xs = Array.isArray(series) ? series.filter(r => Number.isFinite(r?.ts) && Number.isFinite(r?.oi)).sort((a,b)=>a.ts-b.ts) : [];
  if (xs.length < 2) return null;
  const end = xs.at(-1);
  const target = end.ts - Number(hours) * HOUR_MS;
  const coverage = exactHourlyCoverage(xs, end.ts, hours);
  let ref = null;
  for (const row of xs) {
    if (row.ts <= target) ref = row;
    else break;
  }
  if (!ref) ref = xs[0];
  return {
    hours: Number(hours),
    from_ts: ref.ts,
    to_ts: end.ts,
    from_oi: ref.oi,
    to_oi: end.oi,
    change_pct: pctChange(ref.oi, end.oi),
    actual_window_hours: (end.ts - ref.ts) / HOUR_MS,
    ...coverage,
    window_target_closed: coverage.closed,
  };
}

export function candleWindowChange(series, hours) {
  const xs = Array.isArray(series) ? series.filter(r => Number.isFinite(r?.ts) && Number.isFinite(r?.close)).sort((a,b)=>a.ts-b.ts) : [];
  if (xs.length < 2) return null;
  const end = xs.at(-1);
  const target = end.ts - Number(hours) * HOUR_MS;
  const coverage = exactHourlyCoverage(xs, end.ts, hours);
  let ref = null;
  for (const row of xs) {
    if (row.ts <= target) ref = row;
    else break;
  }
  if (!ref) ref = xs[0];
  return {
    hours: Number(hours),
    from_ts: ref.ts,
    to_ts: end.ts,
    from_close: ref.close,
    to_close: end.close,
    change_pct: pctChange(ref.close, end.close),
    actual_window_hours: (end.ts - ref.ts) / HOUR_MS,
    ...coverage,
    window_target_closed: coverage.closed,
  };
}

function targetWindowClosed(actualHours, targetHours, toleranceHours = 0.25) {
  const actual = finiteOrNull(actualHours);
  const target = finiteOrNull(targetHours);
  if (actual === null || target === null) return false;
  return Math.abs(actual - target) <= Number(toleranceHours);
}

function normalizedCandle(ts, open, high, low, close, volume, closed) {
  const row = {
    ts: finiteOrNull(ts),
    open: finiteOrNull(open),
    high: finiteOrNull(high),
    low: finiteOrNull(low),
    close: finiteOrNull(close),
    volume: finiteOrNull(volume),
    closed: Boolean(closed),
  };
  return row.ts !== null && row.close !== null ? row : null;
}

export function parseBybitHourlyCandles(payload, nowTs = Date.now()) {
  const rows = Array.isArray(payload?.result?.list) ? payload.result.list : [];
  return rows.map(r => normalizedCandle(r?.[0], r?.[1], r?.[2], r?.[3], r?.[4], r?.[5], finiteOrNull(r?.[0]) + HOUR_MS <= nowTs))
    .filter(Boolean).filter(r => r.closed).sort((a,b)=>a.ts-b.ts);
}

export function parseOkxHourlyCandles(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map(r => normalizedCandle(r?.[0], r?.[1], r?.[2], r?.[3], r?.[4], r?.[5], String(r?.[8]) === "1"))
    .filter(Boolean).filter(r => r.closed).sort((a,b)=>a.ts-b.ts);
}

export function parseBinanceHourlyCandles(payload, nowTs = Date.now()) {
  const rows = Array.isArray(payload) ? payload : [];
  return rows.map(r => {
    const openTs = finiteOrNull(r?.[0]);
    const closeTs = finiteOrNull(r?.[6]);
    return normalizedCandle(openTs, r?.[1], r?.[2], r?.[3], r?.[4], r?.[5], closeTs !== null ? closeTs < nowTs : openTs + HOUR_MS <= nowTs);
  }).filter(Boolean).filter(r => r.closed).sort((a,b)=>a.ts-b.ts);
}

function attachOpportunityHourlyCandles(evidence, candles) {
  Object.defineProperty(evidence, "_opportunity_hourly_candles", {
    enumerable: false,
    value: Array.isArray(candles) ? candles : [],
  });
  return evidence;
}

export function synchronizedReturns(candidateCandles, btcCandles, ethCandles, windows = [1,4,24]) {
  const maps = [candidateCandles, btcCandles, ethCandles].map(rows => new Map((rows || []).map(r => [Number(r.ts), r])));
  const common = [...maps[0].keys()].filter(ts => maps[1].has(ts) && maps[2].has(ts)).sort((a,b)=>a-b);
  if (common.length < 2) {
    return { common_points: common.length, latest_common_ts: common.at(-1) ?? null, windows: {} };
  }
  const latestTs = common.at(-1);
  const latest = maps.map(m => m.get(latestTs));
  const out = {};
  for (const h of windows) {
    const target = latestTs - Number(h) * HOUR_MS;
    const refTs = common.includes(target) ? target : (common.filter(ts => ts <= target).at(-1) ?? null);
    if (refTs === null) {
      out[`${h}h`] = { status: "NOT_CLOSED", target_ts: target, reference_ts: null };
      continue;
    }
    const refs = maps.map(m => m.get(refTs));
    const c = pctChange(refs[0]?.close, latest[0]?.close);
    const b = pctChange(refs[1]?.close, latest[1]?.close);
    const e = pctChange(refs[2]?.close, latest[2]?.close);
    const actualWindowHours = (latestTs - refTs) / HOUR_MS;
    const coverage = exactHourlyCoverage(common.map(ts=>({ts})), latestTs, Number(h));
    const windowClosed = targetWindowClosed(actualWindowHours, Number(h)) && coverage.closed;
    out[`${h}h`] = {
      status: c === null || b === null || e === null || !windowClosed ? "NOT_CLOSED" : "CLOSED",
      target_ts: target,
      reference_ts: refTs,
      latest_ts: latestTs,
      actual_window_hours: actualWindowHours,
      window_target_closed: windowClosed,
      expected_points: coverage.expected_points,
      received_points: coverage.received_points,
      max_gap_ms: coverage.max_gap_ms,
      coverage_pct: coverage.coverage_pct,
      candidate_pct: c,
      btc_pct: b,
      eth_pct: e,
      vs_btc_pp: c === null || b === null ? null : c - b,
      vs_eth_pp: c === null || e === null ? null : c - e,
    };
  }
  return { common_points: common.length, latest_common_ts: latestTs, windows: out };
}

export function downMarketRelativeObservations(candidateCandles, benchmarkCandles) {
  const c = new Map((candidateCandles || []).map(r => [Number(r.ts), r]));
  const b = new Map((benchmarkCandles || []).map(r => [Number(r.ts), r]));
  const common = [...c.keys()].filter(ts => b.has(ts)).sort((a,b)=>a-b);
  const rows = [];
  for (let i = 1; i < common.length; i++) {
    const prevTs = common[i-1];
    const ts = common[i];
    if (ts - prevTs !== HOUR_MS) continue;
    const cr = pctChange(c.get(prevTs)?.close, c.get(ts)?.close);
    const br = pctChange(b.get(prevTs)?.close, b.get(ts)?.close);
    if (cr === null || br === null || br >= 0) continue;
    rows.push({ ts, candidate_pct: cr, benchmark_pct: br, relative_pp: cr - br });
  }
  const avg = rows.length ? rows.reduce((s,r)=>s+r.relative_pp,0)/rows.length : null;
  const betterCount = rows.filter(r => r.relative_pp > 0).length;
  return {
    negative_benchmark_hours: rows.length,
    candidate_better_hours: betterCount,
    better_share_pct: rows.length ? (betterCount / rows.length) * 100 : null,
    average_relative_pp: avg,
    rows: rows.slice(-24),
  };
}


export function buildCrossVenueAssetIdentityProof(contractCode, verification = {}) {
  const aliases = candidateVenueAliases(contractCode);
  const canonicalBase = aliases.alias_candidate_safe
    ? nfcUpper(String(contractCode).replace(/-USDT$/u, ""))
    : null;
  if (!aliases.alias_candidate_safe || !canonicalBase) {
    return {
      verified: false,
      method: "UNSAFE_OR_NON_ASCII_ALIAS_FAIL_CLOSED",
      canonical_base: canonicalBase,
      corroborators: [],
    };
  }

  const matchesBase = (row) =>
    row?.verified === true && nfcUpper(row?.base_coin) === canonicalBase;
  const bybit = matchesBase(verification?.bybit);
  const okxSwap = matchesBase(verification?.okx_swap);
  const okxSpot = matchesBase(verification?.okx_spot);
  const gate = matchesBase(verification?.gate_futures);
  const binance = matchesBase(verification?.binance_futures);
  const corroborators = [];
  if (bybit) corroborators.push("BYBIT_LINEAR_PERP");
  if (okxSwap) corroborators.push("OKX_SWAP");
  if (okxSpot) corroborators.push("OKX_SPOT");
  if (gate) corroborators.push("GATE_USDT_PERP");
  if (binance) corroborators.push("BINANCE_USDT_PERP");

  let verified = false;
  let method = "VENUE_MARKET_SYMBOL_ONLY";
  if (okxSpot && okxSwap) {
    verified = true;
    method = "HTX_CANONICAL_PLUS_OKX_SPOT_SWAP_EXACT_BASE";
  } else if (okxSpot && (bybit || gate || binance)) {
    verified = true;
    method = "HTX_CANONICAL_PLUS_OKX_SPOT_PLUS_EXTERNAL_PERP_EXACT_BASE";
  } else if ((bybit && gate) || (bybit && binance) || (gate && okxSwap)) {
    verified = true;
    method = gate ? "HTX_CANONICAL_PLUS_TWO_EXTERNAL_EXACT_BASE_WITH_GATE" : "HTX_CANONICAL_PLUS_BYBIT_BINANCE_EXACT_BASE";
  }
  return {
    verified,
    method,
    canonical_base: canonicalBase,
    corroborators,
  };
}

function promoteCorroboratedAssetIdentity(evidence, proof) {
  return (Array.isArray(evidence) ? evidence : []).map((row) => {
    if (
      proof?.verified !== true ||
      row?.alias_required !== true ||
      row?.alias_verified !== true ||
      row?.venue_observation_status !== "CLOSED" ||
      row?.source_compatible === false ||
      row?.error
    ) {
      return row;
    }
    return {
      ...row,
      status: "CLOSED",
      eligible_for_chain_closure: true,
      alias_verification_scope: proof.method,
      asset_identity_verified: true,
      note: [row?.note, `asset_identity=${proof.method}`].filter(Boolean).join("; "),
    };
  });
}

async function verifyAliases(contractCode, fetchImpl, nowTs) {
  const aliases = candidateVenueAliases(contractCode);
  if (!aliases.alias_candidate_safe) {
    return {
      aliases,
      bybit: { verified: false, status: "SOURCE_INCOMPATIBLE", reason: aliases.reason },
      okx_swap: { verified: false, status: "SOURCE_INCOMPATIBLE", reason: aliases.reason },
      okx_spot: { verified: false, status: "SOURCE_INCOMPATIBLE", reason: aliases.reason },
      gate_futures: { verified: false, status: "SOURCE_INCOMPATIBLE", reason: aliases.reason },
      binance_futures: { verified: false, status: "SOURCE_INCOMPATIBLE", reason: aliases.reason },
      binance_spot: { verified: false, status: "SOURCE_INCOMPATIBLE", reason: aliases.reason },
    };
  }

  const urls = {
    bybit: `https://api.bybit.com/v5/market/instruments-info?category=linear&status=Trading&symbol=${encodeURIComponent(aliases.bybit)}`,
    okx_swap: `https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=${encodeURIComponent(aliases.okx_swap)}`,
    okx_spot: `https://www.okx.com/api/v5/public/instruments?instType=SPOT&instId=${encodeURIComponent(aliases.okx_spot)}`,
    gate_futures: `https://api.gateio.ws/api/v4/futures/usdt/contracts/${encodeURIComponent(aliases.gate_futures)}`,
  };
  const [bybitRaw, okxSwapRaw, okxSpotRaw, gateFutRaw] = await Promise.all([
    fetchJson(fetchImpl, urls.bybit),
    fetchJson(fetchImpl, urls.okx_swap),
    fetchJson(fetchImpl, urls.okx_spot),
    fetchJson(fetchImpl, urls.gate_futures),
  ]);
  const wrap = (raw, parsed) => ({ ...parsed, status: parsed.verified ? "CLOSED" : (parsed.api_ok ? "SOURCE_INCOMPATIBLE" : "NOT_CLOSED"), http_status: raw.status, fetched_ts: nowTs, fetch_error: raw.error || (parsed.api_ok ? null : parsed.error) });
  const result = {
    aliases,
    bybit: wrap(bybitRaw, parseBybitInstrumentVerification(bybitRaw.data, aliases.bybit)),
    okx_swap: wrap(okxSwapRaw, parseOkxInstrumentVerification(okxSwapRaw.data, aliases.okx_swap, "SWAP")),
    okx_spot: wrap(okxSpotRaw, parseOkxInstrumentVerification(okxSpotRaw.data, aliases.okx_spot, "SPOT")),
    gate_futures: wrap(gateFutRaw, parseGateInstrumentVerification(gateFutRaw.data, aliases.gate_futures)),
    binance_futures: { verified: false, status: "REPLACED_BY_GATE", reason: "Gate is the active public fallback for this production path." },
    binance_spot: { verified: false, status: "UNUSED_IN_3_7", reason: "No Binance Spot adapter is promoted in 3.7." },
  };
  result.asset_identity = buildCrossVenueAssetIdentityProof(contractCode, result);
  return result;
}

async function collectBybitDerivatives(contractCode, alias, verification, fetchImpl, nowTs) {
  const venue = "BYBIT";
  if (!verification?.verified) {
    return [externalEvidenceBase({ contractCode, chain:"CROSS_EXCHANGE_DERIVATIVES", metric:"venue_status", source:"Bybit Public V5", venue, marketType:"LINEAR_PERP", nowTs, status: verification?.status || "NOT_CLOSED", value:null, unit:null, coveragePct:0, aliasRequired:true, aliasVerified:false, sourceCompatible:verification?.status !== "SOURCE_INCOMPATIBLE", primaryMarketId:null, note:verification?.reason || verification?.error, error:verification?.fetch_error || null })];
  }
  const fundUrl = `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${encodeURIComponent(alias)}&limit=12`;
  const oiUrl = `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${encodeURIComponent(alias)}&intervalTime=1h&limit=30`;
  const klineUrl = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(alias)}&interval=60&limit=30`;
  const [fundRaw, oiRaw, candleRaw] = await Promise.all([fetchJson(fetchImpl,fundUrl),fetchJson(fetchImpl,oiUrl),fetchJson(fetchImpl,klineUrl)]);
  const fundError = bybitApiError(fundRaw);
  const oiError = bybitApiError(oiRaw);
  const candleError = bybitApiError(candleRaw);
  const fund = parseBybitFunding(fundRaw.data);
  const oi = parseBybitOi(oiRaw.data);
  const oi1h = oiWindowChange(oi.series, 1);
  const oi1hClosed = Boolean(!oiError && oi1h?.window_target_closed);
  const candles = parseBybitHourlyCandles(candleRaw.data, nowTs);
  const price4h = candleWindowChange(candles, 4);
  const price4hClosed = Boolean(!candleError && price4h?.window_target_closed);
  const latestCandle = candles.at(-1) || null;
  const sourceTs = Math.max(fund.latest?.ts || 0, oi.latest?.ts || 0, latestCandle?.ts || 0) || null;
  const settlement = fund.inferred_interval_hours ? `${fund.inferred_interval_hours}h` : (verification.funding_interval_minutes ? `${verification.funding_interval_minutes/60}h` : null);
  const instrumentFundingHours = finiteOrNull(verification.funding_interval_minutes) === null ? null : finiteOrNull(verification.funding_interval_minutes) / 60;
  const fundingPeriodMatchesInstrument = instrumentFundingHours === null || fund.inferred_interval_hours === null || Math.abs(instrumentFundingHours-fund.inferred_interval_hours) <= 0.01;
  const fundingClosed = Boolean(!fundError && fund.latest && fund.series.length >= 2 && settlement && fund.interval_consistent && fund.duplicate_settlements === 0 && fundingPeriodMatchesInstrument);
  return attachOpportunityHourlyCandles([
    externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"funding_rate",source:"Bybit Public V5",venue,marketType:"LINEAR_PERP",nowTs,sourceTs:fund.latest?.ts,maxAgeSec:Math.max(7200,(fund.inferred_interval_hours||verification.funding_interval_minutes/60||8)*5400),status:fundingClosed?"CLOSED":"NOT_CLOSED",value:fund.latest?.rate,unit:"rate_per_settlement",coveragePct:fundingClosed?100:0,historyCoveragePct:fund.series.length>=2?100:0,window:"FUNDING_HISTORY",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:BYBIT:LINEAR_PERP`,settlementPeriod:settlement,note:`history_points=${fund.series.length}; interval_consistent=${fund.interval_consistent}; duplicate_settlements=${fund.duplicate_settlements}; period_matches_instrument=${fundingPeriodMatchesInstrument}`,error:fundError}),
    externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"oi_change_1h",source:"Bybit Public V5",venue,marketType:"LINEAR_PERP",nowTs,sourceTs:oi.latest?.ts,maxAgeSec:3*60*60,status:oi1hClosed?"CLOSED":"NOT_CLOSED",value:oi1h?.change_pct,unit:"pct",coveragePct:oi1h?.coverage_pct??0,historyCoveragePct:oi1h?.coverage_pct??0,window:"1h",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:BYBIT:LINEAR_PERP`,note:`oi_points=${oi.series.length}; actual_window_hours=${oi1h?.actual_window_hours ?? "NA"}; expected_points=${oi1h?.expected_points??"NA"}; received_points=${oi1h?.received_points??"NA"}; max_gap_ms=${oi1h?.max_gap_ms??"NA"}`,error:oiError}),
    externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"price_change_4h",source:"Bybit Public V5",venue,marketType:"LINEAR_PERP",nowTs,sourceTs:latestCandle?.ts,maxAgeSec:2*60*60,status:price4hClosed?"CLOSED":"NOT_CLOSED",value:price4h?.change_pct,unit:"pct",coveragePct:price4h?.coverage_pct??0,historyCoveragePct:price4h?.coverage_pct??0,window:"4h",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:BYBIT:LINEAR_PERP`,note:`closed_hourly_candles=${candles.length}; actual_window_hours=${price4h?.actual_window_hours ?? "NA"}; expected_points=${price4h?.expected_points??"NA"}; received_points=${price4h?.received_points??"NA"}; max_gap_ms=${price4h?.max_gap_ms??"NA"}`,error:candleError}),
  ], candles);
}

async function collectOkxDerivatives(contractCode, alias, verification, fetchImpl, nowTs) {
  const venue = "OKX";
  if (!verification?.verified) {
    return [externalEvidenceBase({ contractCode, chain:"CROSS_EXCHANGE_DERIVATIVES", metric:"venue_status", source:"OKX Public V5", venue, marketType:"SWAP", nowTs, status: verification?.status || "NOT_CLOSED", value:null, coveragePct:0, aliasRequired:true, aliasVerified:false, sourceCompatible:verification?.status !== "SOURCE_INCOMPATIBLE", note:verification?.reason || verification?.error, error:verification?.fetch_error || null })];
  }
  const fundUrl = `https://www.okx.com/api/v5/public/funding-rate-history?instId=${encodeURIComponent(alias)}&limit=12`;
  const oiUrl = `https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${encodeURIComponent(alias)}`;
  const klineUrl = `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(alias)}&bar=1H&limit=30`;
  const [fundRaw, oiRaw, candleRaw] = await Promise.all([fetchJson(fetchImpl,fundUrl),fetchJson(fetchImpl,oiUrl),fetchJson(fetchImpl,klineUrl)]);
  const fundError = okxApiError(fundRaw);
  const oiError = okxApiError(oiRaw);
  const candleError = okxApiError(candleRaw);
  const fund = parseOkxFunding(fundRaw.data);
  const oi = parseOkxOi(oiRaw.data);
  const candles = parseOkxHourlyCandles(candleRaw.data);
  const price4h = candleWindowChange(candles, 4);
  const price4hClosed = Boolean(!candleError && price4h?.window_target_closed);
  const latestCandle = candles.at(-1) || null;
  const settlement = fund.inferred_interval_hours ? `${fund.inferred_interval_hours}h` : null;
  const fundingClosed = Boolean(!fundError && fund.latest && fund.series.length >= 2 && settlement && fund.interval_consistent && fund.duplicate_settlements === 0);
  return attachOpportunityHourlyCandles([
    externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"funding_rate",source:"OKX Public V5",venue,marketType:"SWAP",nowTs,sourceTs:fund.latest?.ts,maxAgeSec:Math.max(7200,(fund.inferred_interval_hours||8)*5400),status:fundingClosed?"CLOSED":"NOT_CLOSED",value:fund.latest?.rate,unit:"rate_per_settlement",coveragePct:fundingClosed?100:0,historyCoveragePct:fund.series.length>=2?100:0,window:"FUNDING_HISTORY",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SWAP`,settlementPeriod:settlement,note:`realized_history_points=${fund.series.length}; announced_rate_fallback=DISABLED; interval_consistent=${fund.interval_consistent}; duplicate_settlements=${fund.duplicate_settlements}`,error:fundError}),
    externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"open_interest_current",source:"OKX Public V5",venue,marketType:"SWAP",nowTs,sourceTs:oi.latest?.ts,maxAgeSec:15*60,status:!oiError&&oi.latest?"CLOSED":"NOT_CLOSED",value:oi.latest?.oi_usd ?? oi.latest?.oi,unit:oi.latest?.oi_usd!==null?"usd":"contracts",coveragePct:!oiError&&oi.latest?100:0,window:"CURRENT",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SWAP`,note:"current OI only; not promoted as OI trajectory",error:oiError}),
    externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"price_change_4h",source:"OKX Public V5",venue,marketType:"SWAP",nowTs,sourceTs:latestCandle?.ts,maxAgeSec:2*60*60,status:price4hClosed?"CLOSED":"NOT_CLOSED",value:price4h?.change_pct,unit:"pct",coveragePct:price4h?.coverage_pct??0,historyCoveragePct:price4h?.coverage_pct??0,window:"4h",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SWAP`,note:`closed_hourly_candles=${candles.length}; actual_window_hours=${price4h?.actual_window_hours ?? "NA"}; expected_points=${price4h?.expected_points??"NA"}; received_points=${price4h?.received_points??"NA"}; max_gap_ms=${price4h?.max_gap_ms??"NA"}`,error:candleError}),
  ], candles);
}

async function collectGateDerivatives(contractCode, alias, verification, fetchImpl, nowTs) {
  const venue = "GATE";
  if (!verification?.verified) {
    return [externalEvidenceBase({ contractCode, chain:"CROSS_EXCHANGE_DERIVATIVES", metric:"venue_status", source:"Gate Public Futures", venue, marketType:"USDT_PERP", nowTs, status: verification?.status || "NOT_CLOSED", value:null, coveragePct:0, aliasRequired:true, aliasVerified:false, sourceCompatible:verification?.status !== "SOURCE_INCOMPATIBLE", note:verification?.reason || verification?.error, error:verification?.fetch_error || null })];
  }
  const statsUrl = `https://api.gateio.ws/api/v4/futures/usdt/contract_stats?contract=${encodeURIComponent(alias)}&interval=1h&limit=30`;
  const candleUrl = `https://api.gateio.ws/api/v4/futures/usdt/candlesticks?contract=${encodeURIComponent(alias)}&interval=1h&limit=30`;
  const [statsRaw, candleRaw] = await Promise.all([fetchJson(fetchImpl,statsUrl), fetchJson(fetchImpl,candleUrl)]);
  const statsError = gateApiError(statsRaw);
  const candleError = gateApiError(candleRaw);
  const stats = parseGateContractStats(statsRaw.data);
  const oiSeries = stats.series.filter(r => r.oi !== null).map(r => ({ts:r.ts,oi:r.oi}));
  const oi1h = oiWindowChange(oiSeries, 1);
  const oi1hClosed = Boolean(!statsError && oi1h?.window_target_closed);
  const candles = parseGateHourlyCandles(candleRaw.data, nowTs);
  const price4h = candleWindowChange(candles, 4);
  const price4hClosed = Boolean(!candleError && price4h?.window_target_closed);
  const latest = stats.latest || null;
  const latestCandle = candles.at(-1) || null;
  const fundingHours = finiteOrNull(verification?.funding_interval_minutes) === null ? null : finiteOrNull(verification.funding_interval_minutes) / 60;
  const settlement = fundingHours && fundingHours > 0 ? `${fundingHours}h` : null;
  const fundingClosed = Boolean(!statsError && latest && latest.funding_rate !== null && settlement);
  const takerDen = latest && latest.long_taker_size !== null && latest.short_taker_size !== null ? latest.long_taker_size + latest.short_taker_size : null;
  const takerDeltaPct = takerDen && takerDen > 0 ? ((latest.long_taker_size - latest.short_taker_size) / takerDen) * 100 : null;
  return attachOpportunityHourlyCandles([
    externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"funding_rate",source:"Gate Public Futures",venue,marketType:"USDT_PERP",nowTs,sourceTs:latest?.ts,maxAgeSec:2*60*60,status:fundingClosed?"CLOSED":"NOT_CLOSED",value:latest?.funding_rate,unit:"rate_per_settlement",coveragePct:fundingClosed?100:0,historyCoveragePct:stats.series.length>=2?100:0,window:"CURRENT_HOURLY_STATS",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:GATE:USDT_PERP`,settlementPeriod:settlement,note:`stats_points=${stats.series.length}; settlement_period_from_verified_contract=${settlement||"NA"}`,error:statsError}),
    externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"oi_change_1h",source:"Gate Public Futures",venue,marketType:"USDT_PERP",nowTs,sourceTs:latest?.ts,maxAgeSec:2*60*60,status:oi1hClosed?"CLOSED":"NOT_CLOSED",value:oi1h?.change_pct,unit:"pct",coveragePct:oi1h?.coverage_pct??0,historyCoveragePct:oi1h?.coverage_pct??0,window:"1h",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:GATE:USDT_PERP`,note:`oi_points=${oiSeries.length}; actual_window_hours=${oi1h?.actual_window_hours??"NA"}; expected_points=${oi1h?.expected_points??"NA"}; received_points=${oi1h?.received_points??"NA"}`,error:statsError}),
    externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"price_change_4h",source:"Gate Public Futures",venue,marketType:"USDT_PERP",nowTs,sourceTs:latestCandle?.ts,maxAgeSec:2*60*60,status:price4hClosed?"CLOSED":"NOT_CLOSED",value:price4h?.change_pct,unit:"pct",coveragePct:price4h?.coverage_pct??0,historyCoveragePct:price4h?.coverage_pct??0,window:"4h",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:GATE:USDT_PERP`,note:`closed_hourly_candles=${candles.length}; actual_window_hours=${price4h?.actual_window_hours??"NA"}; expected_points=${price4h?.expected_points??"NA"}; received_points=${price4h?.received_points??"NA"}`,error:candleError}),
    externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"taker_balance_1h_raw",source:"Gate Public Futures",venue,marketType:"USDT_PERP",nowTs,sourceTs:latest?.ts,maxAgeSec:2*60*60,status:!statsError&&takerDeltaPct!==null?"CLOSED":"NOT_CLOSED",value:takerDeltaPct,unit:"pct_long_minus_short_of_total",coveragePct:!statsError&&takerDeltaPct!==null?100:0,window:"1h",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:GATE:USDT_PERP`,note:"Descriptive taker-flow evidence only; no new decision weight.",error:statsError}),
  ], candles);
}

async function collectOkxRelativeStrength(contractCode, alias, verification, fetchImpl, nowTs) {
  if (!verification?.verified) {
    return {
      evidence: [externalEvidenceBase({contractCode,chain:"MARKET_STRENGTH_SPOT",metric:"relative_strength_status",source:"OKX Spot Public V5",venue:"OKX",marketType:"SPOT",nowTs,status:verification?.status||"NOT_CLOSED",value:null,coveragePct:0,aliasRequired:true,aliasVerified:false,sourceCompatible:verification?.status!=="SOURCE_INCOMPATIBLE",note:verification?.reason||verification?.error,error:verification?.fetch_error||null})],
      detail: null,
    };
  }
  const urls = [alias, "BTC-USDT", "ETH-USDT"].map(inst => `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(inst)}&bar=1H&limit=30`);
  const [candidateRaw, btcRaw, ethRaw] = await Promise.all(urls.map(u=>fetchJson(fetchImpl,u)));
  const candidateError = okxApiError(candidateRaw);
  const btcError = okxApiError(btcRaw);
  const ethError = okxApiError(ethRaw);
  const rsError = candidateError || btcError || ethError;
  const candidate = parseOkxHourlyCandles(candidateRaw.data);
  const btc = parseOkxHourlyCandles(btcRaw.data);
  const eth = parseOkxHourlyCandles(ethRaw.data);
  const sync = synchronizedReturns(candidate, btc, eth, [1,4,24]);
  const downBtc = downMarketRelativeObservations(candidate, btc);
  const downEth = downMarketRelativeObservations(candidate, eth);
  const evidence = [];
  if (rsError || Object.keys(sync.windows).length === 0) {
    evidence.push(externalEvidenceBase({contractCode,chain:"MARKET_STRENGTH_SPOT",metric:"relative_strength_status",source:"OKX Spot Public V5",venue:"OKX",marketType:"SPOT",nowTs,sourceTs:sync.latest_common_ts,maxAgeSec:2*60*60,status:"NOT_CLOSED",value:null,coveragePct:0,historyCoveragePct:0,window:"1h/4h/24h",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SPOT`,note:"Synchronized candidate/BTC/ETH closed-hourly evidence unavailable.",error:rsError || "INSUFFICIENT_SYNCHRONIZED_CANDLES"}));
  }
  for (const [window, row] of Object.entries(sync.windows)) {
    const status = !rsError && row.status === "CLOSED" ? "CLOSED" : "NOT_CLOSED";
    const note = `synchronized_closed_hourly_points=${sync.common_points}; expected_points=${row.expected_points??"NA"}; received_points=${row.received_points??"NA"}; max_gap_ms=${row.max_gap_ms??"NA"}`;
    evidence.push(externalEvidenceBase({contractCode,chain:"MARKET_STRENGTH_SPOT",metric:`rs_vs_btc_${window}`,source:"OKX Spot Public V5",venue:"OKX",marketType:"SPOT",nowTs,sourceTs:row.latest_ts??sync.latest_common_ts,maxAgeSec:2*60*60,status,value:row.vs_btc_pp,unit:"percentage_points",coveragePct:row.coverage_pct??0,historyCoveragePct:row.coverage_pct??0,window,aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SPOT`,note,error:rsError}));
    evidence.push(externalEvidenceBase({contractCode,chain:"MARKET_STRENGTH_SPOT",metric:`rs_vs_eth_${window}`,source:"OKX Spot Public V5",venue:"OKX",marketType:"SPOT",nowTs,sourceTs:row.latest_ts??sync.latest_common_ts,maxAgeSec:2*60*60,status,value:row.vs_eth_pp,unit:"percentage_points",coveragePct:row.coverage_pct??0,historyCoveragePct:row.coverage_pct??0,window,aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SPOT`,note,error:rsError}));
  }
  const spot24 = sync.windows?.["24h"] || null;
  if (spot24?.status === "CLOSED") {
    const spotRows = candidate.filter(row => row.ts > spot24.reference_ts && row.ts <= spot24.latest_ts);
    const spotVolume24h = spotRows.length === 24 && spotRows.every(row => Number.isFinite(row.volume) && row.volume >= 0)
      ? spotRows.reduce((sum, row) => sum + row.volume, 0)
      : null;
    evidence.push(externalEvidenceBase({contractCode,chain:"MARKET_STRENGTH_SPOT",metric:"spot_turnover_24h",source:"OKX Spot Public V5",venue:"OKX",marketType:"SPOT",nowTs,sourceTs:spot24.latest_ts,maxAgeSec:2*60*60,status:spotVolume24h !== null && spotVolume24h > 0 ? "CLOSED" : "NOT_CLOSED",value:spotVolume24h,unit:"base_volume_24h",coveragePct:spot24.coverage_pct??0,historyCoveragePct:spot24.coverage_pct??0,window:"24h",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SPOT`,note:`closed_hourly_volume_points=${spotRows.length}; factual OKX spot activity fallback`,error:rsError}));
  }
  evidence.push(externalEvidenceBase({contractCode,chain:"MARKET_STRENGTH_SPOT",metric:"down_market_rs_vs_btc_raw",source:"OKX Spot Public V5",venue:"OKX",marketType:"SPOT",nowTs,sourceTs:sync.latest_common_ts,maxAgeSec:2*60*60,status:!rsError&&downBtc.negative_benchmark_hours?"CLOSED":"NOT_CLOSED",value:downBtc.average_relative_pp,unit:"average_percentage_points",coveragePct:!rsError&&downBtc.negative_benchmark_hours?100:0,window:"LAST_24_CONTIGUOUS_HOURS",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SPOT`,note:`negative_btc_hours=${downBtc.negative_benchmark_hours}; uncalibrated raw feature`,error:rsError}));
  evidence.push(externalEvidenceBase({contractCode,chain:"MARKET_STRENGTH_SPOT",metric:"down_market_rs_vs_eth_raw",source:"OKX Spot Public V5",venue:"OKX",marketType:"SPOT",nowTs,sourceTs:sync.latest_common_ts,maxAgeSec:2*60*60,status:!rsError&&downEth.negative_benchmark_hours?"CLOSED":"NOT_CLOSED",value:downEth.average_relative_pp,unit:"average_percentage_points",coveragePct:!rsError&&downEth.negative_benchmark_hours?100:0,window:"LAST_24_CONTIGUOUS_HOURS",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SPOT`,note:`negative_eth_hours=${downEth.negative_benchmark_hours}; uncalibrated raw feature`,error:rsError}));
  return {
    evidence,
    detail: {
      synchronized_returns: sync,
      down_market_vs_btc: downBtc,
      down_market_vs_eth: downEth,
      hourly_candles: { candidate, btc, eth },
    },
  };
}

function fundingPerHourDetail(evidence) {
  const rows = (Array.isArray(evidence) ? evidence : [])
    .filter(r => r?.chain === "CROSS_EXCHANGE_DERIVATIVES" && r?.metric === "funding_rate" && r?.venue_observation_status === "CLOSED" && !r?.error)
    .map(r => {
      const hours = Number(String(r?.settlement_period || "").replace(/h$/i, ""));
      const rate = finiteOrNull(r?.value);
      return {
        venue: r?.venue || null,
        funding_rate: rate,
        settlement_hours: Number.isFinite(hours) && hours > 0 ? hours : null,
        funding_rate_per_hour: rate !== null && Number.isFinite(hours) && hours > 0 ? rate / hours : null,
        source_ts: r?.source_ts ?? null,
        asset_identity_verified: r?.asset_identity_verified === true,
        eligible_for_chain_closure: r?.eligible_for_chain_closure === true,
      };
    });
  const normalized = rows.map(r => r.funding_rate_per_hour).filter(Number.isFinite);
  return {
    rows,
    comparable_venues: normalized.length,
    min_per_hour: normalized.length ? Math.min(...normalized) : null,
    max_per_hour: normalized.length ? Math.max(...normalized) : null,
    spread_per_hour: normalized.length >= 2 ? Math.max(...normalized) - Math.min(...normalized) : null,
    note: "Cross-venue funding dispersion is descriptive evidence, not a same-market source conflict and not a promoted threshold.",
  };
}

export async function collectPublicFullEvidence({ contract_code, fetch_impl, now_ts = Date.now() } = {}) {
  const contractCode = text(contract_code).normalize("NFC");
  const nowTs = finiteOrNull(now_ts) ?? Date.now();
  const verification = await verifyAliases(contractCode, fetch_impl, nowTs);

  const [bybit, okx, gate, rs] = await Promise.all([
    collectBybitDerivatives(contractCode, verification.aliases.bybit, verification.bybit, fetch_impl, nowTs),
    collectOkxDerivatives(contractCode, verification.aliases.okx_swap, verification.okx_swap, fetch_impl, nowTs),
    collectGateDerivatives(contractCode, verification.aliases.gate_futures, verification.gate_futures, fetch_impl, nowTs),
    collectOkxRelativeStrength(contractCode, verification.aliases.okx_spot, verification.okx_spot, fetch_impl, nowTs),
  ]);

  const externalRequired = [
    externalEvidenceBase({contractCode,chain:"SMART_MONEY_ONCHAIN",metric:"chain_status",source:"EXTERNAL_EVIDENCE_REQUIRED",venue:null,marketType:null,nowTs,status:"NOT_CLOSED",value:null,coveragePct:0,aliasRequired:false,aliasVerified:true,sourceCompatible:true,note:"No autonomous first-party Smart Money/on-chain source is configured inside Worker. Missing data is DQ uncertainty, not directional evidence.",error:null}),
    externalEvidenceBase({contractCode,chain:"SUPPORTING_RISK",metric:"chain_status",source:"EXTERNAL_EVIDENCE_REQUIRED",venue:null,marketType:null,nowTs,status:"NOT_CLOSED",value:null,coveragePct:0,aliasRequired:false,aliasVerified:true,sourceCompatible:true,note:"Supply/social/fundamental evidence remains not_closed unless a factual autonomous source is configured. No synthetic penalty is applied.",error:null}),
    externalEvidenceBase({contractCode,chain:"MARKET_REGIME_TIMING",metric:"chain_status",source:"HTX_TIMING_EXISTING_ONLY",venue:"HTX",marketType:"PERP",nowTs,status:"PARTIAL",value:null,coveragePct:null,aliasRequired:false,aliasVerified:true,sourceCompatible:true,note:"Timing remains a gate/layer without new weight; full promotion disabled in 3.7.",error:null}),
  ];

  const rawEvidence = [...bybit, ...okx, ...gate, ...rs.evidence, ...externalRequired];
  const allEvidence = promoteCorroboratedAssetIdentity(rawEvidence, verification.asset_identity);
  const response = {
    version: PUBLIC_EVIDENCE_ADAPTERS_VERSION,
    contract_code: contractCode,
    observed_ts: nowTs,
    alias_verification: verification,
    evidence: allEvidence,
    cross_venue_derivatives_detail: { funding: fundingPerHourDetail(allEvidence) },
    relative_strength_detail: rs.detail,
    safety: {
      strategy_weights_changed: false,
      missing_data_directional_penalty: false,
      live_promotion: false,
      telegram: false,
      execution: false,
    },
  };
  Object.defineProperty(response, "_opportunity_hourly_candles", {
    enumerable: false,
    value: {
      BYBIT_PERP: bybit._opportunity_hourly_candles || [],
      OKX_PERP: okx._opportunity_hourly_candles || [],
      GATE_PERP: gate._opportunity_hourly_candles || [],
      OKX_SPOT: rs.detail?.hourly_candles?.candidate || [],
      BTC_SPOT: rs.detail?.hourly_candles?.btc || [],
      ETH_SPOT: rs.detail?.hourly_candles?.eth || [],
    },
  });
  return response;
}
