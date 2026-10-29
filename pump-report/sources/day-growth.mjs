import {assertInstrument, createFact, CANDLE_CCXT_TIME_BASIS, GROWTH_24H_UNIT, GROWTH_24H_WINDOW_MS, PRICE_STRUCTURE_UNIT, PRICE_STRUCTURE_BOUNDS} from '../contracts/index.mjs';
import {START_PROFILE} from '../profile/start-v1.mjs';
import {ROUTES, object, text, positive, timestamp, assertEnvelope, requestUrl, fail} from './bingx.mjs';
import {nativeRelativeCandleQualified} from './native-relative-qualification.mjs';

// Keep the source aliases stable while consuming ROOT's additive constants.
// This module has no IO at import; runtime integration remains ROOT-owned.
export const DAY_GROWTH_UNIT = GROWTH_24H_UNIT;
export const DAY_WINDOW_MS = GROWTH_24H_WINDOW_MS;
const STEP = 60000, ROWS = 1440, VERSION = 'pump-report-sources-day-growth-v1';
const BUDGET = /BUDGET|QUOTA|ADMISSION|RESERVE|EXHAUSTED|BACKOFF|RATE_LIMIT|NOT_ADMITTED|NOT_MEASURED/;
const identityKeys = ['instrument_id', 'asset_id', 'venue', 'native_symbol', 'market_type', 'base', 'quote', 'settle', 'classification_status', 'identity_evidence_ref'];
const safeCode = e => ['AbortError', 'TimeoutError'].includes(e?.name) ? 'DAY_SOURCE_TIMEOUT'
  : /^[A-Z0-9_:.-]{1,160}$/.test(e?.code ?? '') ? e.code : 'DAY_SOURCE_REQUEST_FAILED';

export function parseDayGrowth(body, {instrument, qualification, start_ts, end_ts, received_ts}) {
  assertEnvelope(body);
  if (timestamp(start_ts) === null || timestamp(end_ts) === null || timestamp(received_ts) === null
    || start_ts % STEP || end_ts % STEP || end_ts - start_ts !== DAY_WINDOW_MS) fail('DAY_EXACT_1440_MINUTE_WINDOW_REQUIRED');
  const timeQualified = nativeRelativeCandleQualified(qualification, instrument, STEP);
  const coverage = {window_start: start_ts, window_end: end_ts, window_ms: DAY_WINDOW_MS, interval_ms: STEP,
    expected_rows: ROWS, complete: false, time_qualified: timeQualified,
    time_basis: timeQualified ? CANDLE_CCXT_TIME_BASIS : null,
    time_evidence_ref: timeQualified ? qualification.time.evidence_ref : null,
    owner_decision_ref: timeQualified ? qualification.owner_decision_ref : null,
    source_route: ROUTES.candles, quantity_used: false, absolute_quantity: null,
    independent_vendor_guarantee_claimed: false};
  if (!timeQualified) return {value: null, event_ts: null, qualified: false,
    reason: 'DAY_TIME_OR_IDENTITY_QUALIFICATION_REQUIRED', coverage};
  if (!Array.isArray(body.data) || body.data.length > ROWS) fail('DAY_BOUNDED_OBJECT_CANDLES_REQUIRED');
  const seen = new Set(), included = new Map(); let outside = 0, capturedOpen = 0;
  for (const row of body.data) {
    if (!object(row)) fail('DAY_OBJECT_CANDLE_REQUIRED');
    const t = timestamp(row.time), open = positive(row.open), high = positive(row.high), low = positive(row.low), close = positive(row.close);
    if (t === null || t % STEP || t > received_ts || [open, high, low, close].includes(null)
      || low > Math.min(open, close) || high < Math.max(open, close) || low > high) fail('DAY_CANDLE_OHLC_OR_TIME_INVALID');
    if (seen.has(t)) fail('DAY_DUPLICATE_CANDLE_TIME'); seen.add(t);
    if (t < start_ts || t >= end_ts) {outside++; continue;}
    if (t + STEP > received_ts) {capturedOpen++; continue;}
    // Quantity is intentionally irrelevant to this price-only window. Never
    // infer an absolute unit or substitute volume for unavailable prices.
    included.set(t, {open, high, low, close});
  }
  const gaps = [];
  for (let t = start_ts; t < end_ts; t += STEP) if (!included.has(t)) gaps.push(t);
  Object.assign(coverage, {native_returned_rows: body.data.length, included_closed_rows: included.size,
    outside_window_rows: outside, captured_unclosed_rows: capturedOpen, gaps,
    start_boundary_present: included.has(start_ts), end_boundary_present: included.has(end_ts - STEP),
    complete: included.size === ROWS && gaps.length === 0});
  if (!coverage.complete) return {value: null, event_ts: null, qualified: false,
    reason: !coverage.start_boundary_present || !coverage.end_boundary_present ? 'DAY_WINDOW_BOUNDARY_MISSING' : 'DAY_WINDOW_GRID_INCOMPLETE', coverage};
  // Additional price-only context from this same qualified response. The
  // existing day scalar and the separate CORE volume window stay unchanged.
  const price_structure_rows = [];
  for (let t = start_ts; t < end_ts; t += STEP) {
    const row = included.get(t);
    price_structure_rows.push([t, row.open, row.high, row.low, row.close]);
  }
  return {value: {open: included.get(start_ts).open, last: included.get(end_ts - STEP).close,
    start_ts, end_ts, window_ms: DAY_WINDOW_MS}, event_ts: end_ts, qualified: true, reason: null, coverage, price_structure_rows};
}

// resolveEntry must be ROOT's existing independent registry resolver. The
// caller cannot grant this route with a boolean or a ticker-only identity.
export function createDayGrowthLoader({broker, resolveEntry, clock = Date.now, profile = START_PROFILE} = {}) {
  if (typeof broker?.request !== 'function' || typeof resolveEntry !== 'function' || typeof clock !== 'function'
    || profile.candle_interval_ms !== STEP || !Number.isSafeInteger(profile.freshness_ms?.candles)
    || profile.freshness_ms.candles <= 0) fail('DAY_SOURCE_DEPENDENCIES_REQUIRED');
  const now = () => {const t = timestamp(clock()); if (t === null) fail('DAY_SOURCE_CLOCK_INVALID'); return t;};
  async function getDayGrowth({instrument, force_refresh = false} = {}) {
    assertInstrument(instrument);
    if (typeof force_refresh !== 'boolean') fail('DAY_FORCE_REFRESH_BOOLEAN_REQUIRED');
    const entry = resolveEntry(instrument);
    if (entry?.then || !entry?.instrument || identityKeys.some(k => entry.instrument[k] !== instrument[k])) fail('DAY_INDEPENDENT_REGISTRY_IDENTITY_MISMATCH');
    assertInstrument(entry.instrument);
    const qualification = entry.qualifications?.candles;
    const finish = ({value = null, event_ts = null, status = 'INCOMPLETE', reason, coverage = null, response = null, price_structure_rows = null} = {}) => {
      const received = response?.received_ts ?? now(), expires_ts = event_ts === null ? null : event_ts + profile.freshness_ms.candles;
      if (status === 'USABLE' && expires_ts < now()) {status = 'STALE'; reason = 'DAY_SOURCE_FACT_STALE';}
      const fact = createFact({fact_id: `${VERSION}:${instrument.instrument_id}:${response?.receipt_id ?? 'NO_RECEIPT'}`,
        instrument_id: instrument.instrument_id, asset_id: instrument.asset_id, kind: 'growth_24h', value,
        unit: DAY_GROWTH_UNIT, event_ts, received_ts: received, expires_ts, status, reason, coverage,
        source: 'BINGX_OFFICIAL_PUBLIC_API', primary_provider: 'BINGX', venue: 'BINGX', market_type: 'PERPETUAL',
        quote: 'USDT', settle: 'USDT', origin: 'OBSERVED', identity_evidence_ref: instrument.identity_evidence_ref,
        evidence_ref: response?.receipt_id ?? null, cache_hit: response?.cache_hit === true,
        derived_from: event_ts === null ? null : {kind: 'OBSERVED_OHLC_WINDOW_BOUNDARIES', source_route: ROUTES.candles,
          interval_ms: STEP, observed_closed_rows: ROWS, original_receipt_id: response.receipt_id,
          original_received_ts: response.received_ts, open_field: 'first.open', last_field: 'last.close',
          start_field: 'first.time', end_field: 'last.time+60000', time_basis: CANDLE_CCXT_TIME_BASIS,
          time_evidence_ref: qualification.time.evidence_ref, absolute_quantity: null}});
      // No second request or independent receipt/clock. Oversized additional
      // context is omitted explicitly without changing the already valid scalar.
      let structureValue = null, structureStatus = status, structureReason = reason ?? null, structureBytes = null;
      if (status === 'USABLE') {
        if (!Array.isArray(price_structure_rows) || price_structure_rows.length !== PRICE_STRUCTURE_BOUNDS.rows || coverage?.complete !== true) {
          structureStatus = 'INCOMPLETE'; structureReason = 'PRICE_STRUCTURE_COMPLETE_ROWS_REQUIRED';
        } else {
          structureBytes = new TextEncoder().encode(JSON.stringify(price_structure_rows)).byteLength;
          if (structureBytes > PRICE_STRUCTURE_BOUNDS.bytes) {
            structureStatus = 'INCOMPLETE'; structureReason = 'PRICE_STRUCTURE_BYTE_BOUND_EXCEEDED';
          } else structureValue = price_structure_rows;
        }
      }
      const priceStructure = createFact({...fact,
        fact_id: `${VERSION}:${instrument.instrument_id}:price_structure:${response?.receipt_id ?? 'NO_RECEIPT'}`,
        kind: 'price_structure', value: structureValue, unit: PRICE_STRUCTURE_UNIT,
        status: structureStatus, reason: structureReason,
        coverage: {...coverage, quantity_used: false, absolute_quantity: null, price_only: true,
          row_columns: ['open_ts', 'open', 'high', 'low', 'close'],
          serialized_value_utf8_bytes: structureBytes, maximum_value_utf8_bytes: PRICE_STRUCTURE_BOUNDS.bytes},
        derived_from: event_ts === null ? null : {...fact.derived_from,
          kind: 'SAME_OBSERVED_CLOSED_DAY_OHLC_PRICE_ONLY', parent_fact_id: fact.fact_id,
          additional_request: false}});
      return {facts: {growth_24h: fact, price_structure: priceStructure}, coverage: {status, reason, ...coverage, cost_authority: 'ROOT_BROKER',
        receipt_ids: response?.receipt_id ? [response.receipt_id] : []}};
    };
    if (!nativeRelativeCandleQualified(qualification, instrument, STEP)) return finish({status: 'NOT_CHECKED',
      reason: 'DAY_TIME_OR_IDENTITY_QUALIFICATION_REQUIRED', coverage: {checked: false, complete: false}});
    const at = now(), end_ts = Math.floor(at / STEP) * STEP, start_ts = end_ts - DAY_WINDOW_MS;
    const url = requestUrl('candles', {symbol: instrument.native_symbol, interval: '1m', startTime: start_ts, endTime: end_ts - 1, limit: ROWS});
    let response;
    try {
      response = await broker.request({provider: 'BINGX', family: 'USDT_M', purpose: 'CORE', candidate_id: instrument.instrument_id,
        cache_key: `${VERSION}:BINGX:USDT_M:${url}`, url, method: 'GET', timeout_ms: 10000,
        ttl_ms: force_refresh ? 0 : profile.freshness_ms.candles, estimated_cost: {http: 1}});
      if (!object(response) || response.ok !== true || response.status !== 200) fail(response?.status === 429 ? 'DAY_SOURCE_RATE_LIMITED'
        : [401, 403, 451].includes(response?.status) ? 'DAY_SOURCE_ACCESS_BLOCKED' : 'DAY_SOURCE_HTTP_ERROR');
      if (timestamp(response.received_ts) === null || response.received_ts > now() || !text(response.receipt_id)) fail('DAY_ORIGINAL_RECEIPT_REQUIRED');
      const parsed = parseDayGrowth(response.data, {instrument, qualification, start_ts, end_ts, received_ts: response.received_ts});
      return finish({...parsed, status: parsed.qualified ? 'USABLE' : 'INCOMPLETE', response});
    } catch (error) {
      const code = safeCode(error);
      const receipt = text(response?.receipt_id) && timestamp(response.received_ts) !== null && response.received_ts <= now() ? response : null;
      return finish({status: BUDGET.test(code) ? 'NOT_CHECKED' : 'ERROR', reason: code, response: receipt,
        coverage: {checked: Boolean(receipt), complete: false, window_start: start_ts, window_end: end_ts,
          original_request_window_preserved: true, estimated_HTTP_attempts_max: 1, charged_or_unknown_not_refunded: true}});
    }
  }
  return {getDayGrowth};
}
