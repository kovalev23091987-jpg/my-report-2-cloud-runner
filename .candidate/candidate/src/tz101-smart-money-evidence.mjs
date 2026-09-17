/**
 * TZ 10.1 raw Smart Money evidence adapter.
 *
 * This module intentionally does NOT score, choose direction, or close the
 * Smart Money / On-chain block. It only validates factual ByKaranteli public
 * payloads and preserves them as uncalibrated raw evidence.
 */
import { digest } from './upstream-proof-utils.mjs';

export const TZ101_SMART_MONEY_EVIDENCE_VERSION = 'tz101-smart-money-raw-r8';
export const TZ101_BYK_SMART_MONEY_SOURCE = 'ByKaranteli Smart Money Public API';
export const TZ101_BYK_WHALE_SERIES_SOURCE = 'Hyperliquid whale event recorder';

const obj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const stamp = (v) => Number.isSafeInteger(v) && v >= 1_000_000_000_000;
const text = (v) => typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= 320;

function parseTimestamp(v) {
  if (stamp(v)) return v;
  if (typeof v !== 'string' || !v.trim()) return null;
  const n = Date.parse(v);
  return Number.isSafeInteger(n) && n >= 1_000_000_000_000 ? n : null;
}

function normalizeContract(contractCode) {
  if (!text(contractCode)) return null;
  const exact = contractCode.toUpperCase();
  if (exact !== contractCode || !/^[A-Z0-9]{1,24}-USDT$/.test(exact)) return null;
  const base = exact.slice(0, -5);
  if (!base || !/^[A-Z0-9]{1,24}$/.test(base)) return null;
  return { contract_code: exact, provider_symbol: `${base}USDT`, base };
}

function validPctPair(a, b, tolerance = 0.25) {
  return finite(a) && finite(b) && a >= 0 && a <= 100 && b >= 0 && b <= 100 && Math.abs((a + b) - 100) <= tolerance;
}

function freshness(ts, now, maxAgeMs, futureToleranceMs = 60_000) {
  if (!stamp(ts) || !stamp(now)) return { ok: false, reason: 'SOURCE_TIMESTAMP_INVALID' };
  if (ts > now + futureToleranceMs) return { ok: false, reason: 'SOURCE_FROM_FUTURE' };
  if (now - ts > maxAgeMs) return { ok: false, reason: 'SOURCE_STALE' };
  return { ok: true, age_ms: Math.max(0, now - ts) };
}

function base(status, reason, extra = {}) {
  return {
    version: TZ101_SMART_MONEY_EVIDENCE_VERSION,
    status,
    reason,
    score_eligible: false,
    directional_vote_eligible: false,
    calibration_required: true,
    block_owner: 'SMART_MONEY_ONCHAIN',
    automatic_trade: false,
    ...extra,
  };
}

export function contractToByKaranteliSymbol(contractCode) {
  return normalizeContract(contractCode)?.provider_symbol ?? null;
}

export function parseByKaranteliSmartMoney({
  contract_code: contractCode,
  payload,
  observed_ts: observedTs = Date.now(),
  max_age_ms: maxAgeMs = 10 * 60_000,
} = {}) {
  const mapping = normalizeContract(contractCode);
  if (!mapping) return base('NOT_CLOSED', 'CONTRACT_MAPPING_NOT_PROVEN');
  if (!obj(payload)) return base('NOT_CLOSED', 'PAYLOAD_INVALID', { contract_code: mapping.contract_code });
  if (payload.symbol !== mapping.provider_symbol) return base('NOT_CLOSED', 'PROVIDER_SYMBOL_MISMATCH', { contract_code: mapping.contract_code, provider_symbol: mapping.provider_symbol });
  const sourceTs = parseTimestamp(payload.fetchedAt ?? payload.fetched_at ?? payload.timestamp);
  const fresh = freshness(sourceTs, observedTs, maxAgeMs);
  if (!fresh.ok) return base('NOT_CLOSED', fresh.reason, { contract_code: mapping.contract_code, provider_symbol: mapping.provider_symbol, source_ts: sourceTs });

  const topLong = payload.topTraderPositionLongPct;
  const topShort = payload.topTraderPositionShortPct;
  const globalLong = payload.globalAccountLongPct;
  const globalShort = payload.globalAccountShortPct;
  if (!validPctPair(topLong, topShort)) return base('NOT_CLOSED', 'TOP_TRADER_PERCENTAGES_INVALID', { contract_code: mapping.contract_code, provider_symbol: mapping.provider_symbol, source_ts: sourceTs });
  if (!validPctPair(globalLong, globalShort)) return base('NOT_CLOSED', 'GLOBAL_ACCOUNT_PERCENTAGES_INVALID', { contract_code: mapping.contract_code, provider_symbol: mapping.provider_symbol, source_ts: sourceTs });

  const divergence = payload.positioningDivergencePct;
  const takerRatio = payload.takerBuySellRatio;
  if (divergence != null && !finite(divergence)) return base('NOT_CLOSED', 'POSITIONING_DIVERGENCE_INVALID', { contract_code: mapping.contract_code });
  if (takerRatio != null && (!finite(takerRatio) || takerRatio < 0)) return base('NOT_CLOSED', 'TAKER_RATIO_INVALID', { contract_code: mapping.contract_code });

  const factual = {
    schema_version: 'tz101-byk-smart-money-factual-v1',
    source: TZ101_BYK_SMART_MONEY_SOURCE,
    contract_code: mapping.contract_code,
    provider_symbol: mapping.provider_symbol,
    source_ts: sourceTs,
    observed_ts: observedTs,
    age_ms: fresh.age_ms,
    top_trader_position_long_pct: topLong,
    top_trader_position_short_pct: topShort,
    global_account_long_pct: globalLong,
    global_account_short_pct: globalShort,
    positioning_divergence_pct: divergence ?? null,
    taker_buy_sell_ratio: takerRatio ?? null,
    provider_interpretation: text(payload.interpretation) ? payload.interpretation : null,
  };
  return base('CLOSED_RAW_UNCALIBRATED', null, {
    contract_code: mapping.contract_code,
    provider_symbol: mapping.provider_symbol,
    source_ts: sourceTs,
    factual_basis: factual,
    material_digest: digest(factual),
  });
}

export function parseByKaranteliWhaleSeries({
  contract_code: contractCode,
  payload,
  observed_ts: observedTs = Date.now(),
  max_age_ms: maxAgeMs = 10 * 60_000,
  min_points: minPoints = 12,
} = {}) {
  const mapping = normalizeContract(contractCode);
  if (!mapping) return base('NOT_CLOSED', 'CONTRACT_MAPPING_NOT_PROVEN');
  if (!obj(payload) || payload.metric !== 'whale_net' || payload.symbol !== mapping.provider_symbol || payload.period !== '1h') {
    return base('NOT_CLOSED', 'WHALE_SERIES_IDENTITY_MISMATCH', { contract_code: mapping.contract_code, provider_symbol: mapping.provider_symbol });
  }
  if (payload.source !== TZ101_BYK_WHALE_SERIES_SOURCE || payload.unit !== 'usd') return base('NOT_CLOSED', 'WHALE_SERIES_SEMANTICS_MISMATCH', { contract_code: mapping.contract_code });
  const sourceTs = parseTimestamp(payload.as_of);
  const fresh = freshness(sourceTs, observedTs, maxAgeMs);
  if (!fresh.ok) return base('NOT_CLOSED', fresh.reason, { contract_code: mapping.contract_code, source_ts: sourceTs });
  const points = Array.isArray(payload.points) ? payload.points : [];
  if (points.length < minPoints) return base('NOT_CLOSED', 'WHALE_SERIES_COVERAGE_INSUFFICIENT', { contract_code: mapping.contract_code, point_count: points.length, source_ts: sourceTs });
  let priorTs = null;
  let net = 0;
  let positive = 0;
  let negative = 0;
  let zero = 0;
  const normalized = [];
  for (const row of points) {
    if (!Array.isArray(row) || row.length !== 2 || !stamp(row[0]) || !finite(row[1])) return base('NOT_CLOSED', 'WHALE_SERIES_POINT_INVALID', { contract_code: mapping.contract_code });
    const [ts, value] = row;
    if (priorTs !== null && ts <= priorTs) return base('NOT_CLOSED', 'WHALE_SERIES_TIME_NOT_STRICTLY_INCREASING', { contract_code: mapping.contract_code });
    if (ts > observedTs + 60_000) return base('NOT_CLOSED', 'WHALE_SERIES_POINT_FROM_FUTURE', { contract_code: mapping.contract_code });
    priorTs = ts;
    net += value;
    if (value > 0) positive += 1; else if (value < 0) negative += 1; else zero += 1;
    normalized.push([ts, value]);
  }
  const factual = {
    schema_version: 'tz101-byk-whale-series-factual-v1',
    source: TZ101_BYK_WHALE_SERIES_SOURCE,
    contract_code: mapping.contract_code,
    provider_symbol: mapping.provider_symbol,
    source_ts: sourceTs,
    observed_ts: observedTs,
    age_ms: fresh.age_ms,
    period: '1h',
    point_count: normalized.length,
    first_point_ts: normalized[0][0],
    last_point_ts: normalized.at(-1)[0],
    net_sum_usd: net,
    positive_points: positive,
    negative_points: negative,
    zero_points: zero,
    points: normalized,
  };
  return base('CLOSED_RAW_UNCALIBRATED', null, {
    contract_code: mapping.contract_code,
    provider_symbol: mapping.provider_symbol,
    source_ts: sourceTs,
    factual_basis: factual,
    material_digest: digest(factual),
  });
}

export async function fetchByKaranteliSmartMoneyRaw({
  fetch_impl: fetchImpl = globalThis.fetch,
  contract_code: contractCode,
  api_key: apiKey,
  observed_ts: observedTs = Date.now(),
  max_age_ms: maxAgeMs = 10 * 60_000,
} = {}) {
  const symbol = contractToByKaranteliSymbol(contractCode);
  if (!symbol) return base('NOT_CLOSED', 'CONTRACT_MAPPING_NOT_PROVEN');
  if (typeof fetchImpl !== 'function') return base('NOT_CLOSED', 'FETCH_IMPL_MISSING', { contract_code: contractCode });
  if (!text(apiKey)) return base('NOT_CLOSED', 'BYKARANTELI_API_KEY_MISSING', { contract_code: contractCode });
  const url = `https://bykaranteli.com/api/public/smart-money/${encodeURIComponent(symbol)}`;
  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` } });
  } catch (error) {
    return base('NOT_CLOSED', 'SOURCE_FETCH_ERROR', { contract_code: contractCode, error: String(error?.message ?? error).slice(0, 240), external_fetches: 1 });
  }
  if (!response?.ok) return base('NOT_CLOSED', `SOURCE_HTTP_${Number(response?.status ?? 0) || 'ERROR'}`, { contract_code: contractCode, external_fetches: 1 });
  let payload;
  try { payload = await response.json(); } catch { return base('NOT_CLOSED', 'SOURCE_JSON_INVALID', { contract_code: contractCode, external_fetches: 1 }); }
  return { ...parseByKaranteliSmartMoney({ contract_code: contractCode, payload, observed_ts: observedTs, max_age_ms: maxAgeMs }), external_fetches: 1, request_url: url };
}

export function smartMoneyRawEvidenceRows(raw, observedTs=Date.now()) {
  const f=raw?.factual_basis;
  if(raw?.status!=='CLOSED_RAW_UNCALIBRATED'||!obj(f)||!stamp(observedTs)||!text(f.contract_code)||!stamp(f.source_ts)) return [];
  const base={contract_code:f.contract_code,chain:'SMART_MONEY_ONCHAIN',source:TZ101_BYK_SMART_MONEY_SOURCE,venue:'BYKARANTELI',market_type:'DERIVATIVES_POSITIONING',observed_ts:observedTs,available_ts:observedTs,source_ts:f.source_ts,max_age_sec:600,now_ts:observedTs,status:'PARTIAL',venue_observation_status:'CLOSED_RAW_UNCALIBRATED',eligible_for_chain_closure:false,coverage_pct:100,history_coverage_pct:null,window:'CURRENT',source_health:'OK',symbol_verified:true,alias_required:false,alias_verified:true,alias_verification_scope:'EXACT_ASCII_CONTRACT_TO_PROVIDER_SYMBOL',asset_identity_verified:true,source_compatible:true,independence_group:'BYKARANTELI_SMART_MONEY',primary_market_id:`${f.contract_code}:BYKARANTELI:SMART_MONEY`,settlement_period:null,error:null,note:'Factual raw Smart Money observation only. Uncalibrated; no score or directional vote.'};
  const defs=[
    ['top_trader_position_long_pct',f.top_trader_position_long_pct,'pct'],
    ['global_account_long_pct',f.global_account_long_pct,'pct'],
    ['positioning_divergence_pct',f.positioning_divergence_pct,'pct'],
    ['taker_buy_sell_ratio',f.taker_buy_sell_ratio,'ratio'],
  ];
  return defs.filter(([,v])=>finite(v)).map(([metric,value,unit])=>({...base,metric,value,unit}));
}
