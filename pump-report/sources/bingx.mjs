// Pure wire-shape checks adapted from PR639 bingx-perpetual-market.mjs.
// Qualification belongs to the independently supplied identity registry.
import {CANDLE_NATIVE_RELATIVE_UNIT, CANDLE_NATIVE_RELATIVE_KIND, CANDLE_CCXT_TIME_BASIS} from '../contracts/index.mjs';
import {qualifyBingxFundingQuote, FUNDING_RATE_QUOTE_SNAPSHOT} from './funding-qualification.mjs';
import {nativeRelativeRequested, nativeRelativeCandleQualified} from './native-relative-qualification.mjs';
export const ROUTES = Object.freeze({
  catalog: '/openApi/swap/v2/quote/contracts',
  ticker: '/openApi/swap/v2/quote/ticker',
  price: '/openApi/swap/v1/ticker/price',
  candles: '/openApi/swap/v3/quote/klines',
  orderbook: '/openApi/swap/v2/quote/depth',
  trades: '/openApi/swap/v2/quote/trades',
  open_interest: '/openApi/swap/v2/quote/openInterest',
  funding: '/openApi/swap/v2/quote/premiumIndex'
});

export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 512;
export const numeric = value => {
  if (!['string', 'number'].includes(typeof value)) return null;
  const raw = String(value);
  if (raw.length > 96 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
};
export const positive = value => { const n = numeric(value); return n !== null && n > 0 ? n : null; };
export const timestamp = value => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,16}$/.test(value) ? Number(value) : null;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
export const proof = value => object(value) && text(value.evidence_ref);
export function fail(code) { throw Object.assign(new Error(code), {code}); }

export function assertEnvelope(body) {
  if (object(body) && body.code === 100410) fail('BINGX_RATE_LIMITED');
  if (object(body) && body.code === 100421) fail('BINGX_CLOCK_MISMATCH');
  if (!object(body) || body.code !== 0) fail('BINGX_SUCCESS_ENVELOPE_REQUIRED');
}

export function wireRows(body) {
  assertEnvelope(body);
  const rows = Array.isArray(body.data) ? body.data : [body.data];
  if (rows.length > 20000 || !Array.isArray(body.data) && !object(body.data)) fail('BINGX_OBJECT_ROWS_REQUIRED');
  return rows;
}

export function selectRow(body, symbol) {
  const rows = wireRows(body).filter(row => object(row) && row.symbol === symbol);
  if (rows.length !== 1) fail('BINGX_EXACT_UNIQUE_SYMBOL_REQUIRED');
  return rows[0];
}

export function requestUrl(kind, params = {}) {
  if (!Object.hasOwn(ROUTES, kind)) fail('BINGX_ROUTE_NOT_IMPLEMENTED');
  const url = new URL('https://open-api.bingx.com' + ROUTES[kind]);
  for (const [key, value] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
  }
  return String(url);
}

export function parsePrice(body, instrument, kind = 'price') {
  const row = selectRow(body, instrument.native_symbol);
  const value = positive(kind === 'price' ? row.price : row.lastPrice);
  if (value === null) fail('BINGX_POSITIVE_LAST_REQUIRED');
  return {value, event_ts: timestamp(kind === 'price' ? row.time : row.closeTime)};
}

function baseQuantity(raw, qualification) {
  const quantity = numeric(raw);
  if (quantity === null || quantity < 0) fail('BINGX_NONNEGATIVE_QUANTITY_REQUIRED');
  if (!proof(qualification)) return null;
  if (qualification.unit === 'BASE_ASSET') return quantity;
  if (qualification.unit === 'CONTRACTS' && positive(qualification.base_per_contract) !== null) {
    const converted = quantity * Number(qualification.base_per_contract);
    if (!Number.isFinite(converted)) fail('BINGX_QUANTITY_OVERFLOW');
    return converted;
  }
  return null;
}

export function parseCandles(body, {start, end, interval_ms, received_ts, instrument = null, windows_ms = [], preserve_disjoint_closed_rows = false, qualification = {}}) {
  assertEnvelope(body);
  if (!Array.isArray(body.data) || body.data.length > 1440) fail('BINGX_OBJECT_CANDLES_REQUIRED');
  const relativeRequested = nativeRelativeRequested(qualification);
  const relativeKnown = relativeRequested && nativeRelativeCandleQualified(qualification, instrument, interval_ms);
  const timeKnown = relativeRequested ? relativeKnown : proof(qualification.time) && qualification.time.semantics === 'OPEN_TIME';
  const volumeKnown = !relativeRequested && proof(qualification.volume) && ['BASE_ASSET', 'CONTRACTS'].includes(qualification.volume.unit)
    && (qualification.volume.unit !== 'CONTRACTS' || positive(qualification.volume.base_per_contract) !== null);
  const turnoverKnown = !relativeRequested && proof(qualification.turnover) && qualification.turnover.unit === 'USDT'
    && ['quoteVolume', 'quoteAssetVolume', 'turnover'].includes(qualification.turnover.field);
  const seen = new Set(), candles = [];
  for (const row of body.data) {
    if (!object(row)) fail('BINGX_ARRAY_CANDLE_NOT_ACCEPTED');
    const nativeTime = timestamp(row.time), open = positive(row.open), high = positive(row.high), low = positive(row.low), close = positive(row.close);
    const volume = numeric(row.volume);
    if (nativeTime === null || nativeTime > received_ts || nativeTime % interval_ms !== 0 || [open, high, low, close, volume].includes(null)
      || volume < 0 || low > Math.min(open, close) || high < Math.max(open, close) || high < low) fail('BINGX_CANDLE_FIELDS_INVALID');
    if (seen.has(nativeTime)) fail('BINGX_DUPLICATE_CANDLE_TIME');
    seen.add(nativeTime);
    // A later cache read cannot finish a bar captured before its interval ended.
    if (nativeTime < start || nativeTime + interval_ms > end || nativeTime + interval_ms > received_ts) continue;
    const turnover = turnoverKnown ? numeric(row[qualification.turnover.field]) : null;
    if (turnoverKnown && (turnover === null || turnover < 0)) fail('BINGX_CANDLE_TURNOVER_INVALID');
    candles.push({open_ts: timeKnown ? nativeTime : null, close_ts: timeKnown ? nativeTime + interval_ms : null,
      closed: timeKnown, open, high, low, close,
      volume_base: volumeKnown ? baseQuantity(row.volume, qualification.volume) : null, turnover_quote: turnover,
      ...(relativeRequested ? {volume_native: relativeKnown ? volume : null, native_quantity_unit: 'UNKNOWN',
        comparison_kind: relativeKnown ? CANDLE_NATIVE_RELATIVE_KIND : null,
        volume_comparison_key: relativeKnown ? qualification.volume.comparison_key : null} : {}),
      native_time: nativeTime, native_volume_decimal: String(row.volume),
      native_time_semantics: timeKnown ? 'OPEN_TIME' : 'UNQUALIFIED',
      time_evidence_ref: timeKnown ? qualification.time.evidence_ref : null,
      volume_evidence_ref: volumeKnown || relativeKnown ? qualification.volume.evidence_ref : null});
  }
  candles.sort((a, b) => a.native_time - b.native_time);
  const expected = (end - start) / interval_ms;
  const included = new Set(candles.map(row => row.native_time)), gaps = [];
  for (let t = start; t < end; t += interval_ms) if (!included.has(t)) gaps.push(t);
  let tailStart = candles.length - 1;
  while (tailStart > 0 && candles[tailStart].native_time - candles[tailStart - 1].native_time === interval_ms) tailStart--;
  const tail = candles.slice(Math.max(0, tailStart)), availableStart = candles[0]?.native_time ?? null;
  const availableEnd = candles.length ? candles.at(-1).native_time + interval_ms : null;
  const internalGaps = gaps.filter(t => availableStart !== null && t >= availableStart && t < availableEnd);
  const missingPrefix = gaps.filter(t => availableStart !== null && t < availableStart);
  const usableWindows = timeKnown && (volumeKnown || relativeKnown) && tail.length ? windows_ms.filter(window => window <= tail.length * interval_ms)
    .map(window => ({window_ms: window, window_start: availableEnd - window, window_end: availableEnd, closed_bars: window / interval_ms})) : [];
  const historyState = internalGaps.length ? 'INTERNAL_GAPS_TRIMMED_TO_CONTIGUOUS_TAIL'
    : missingPrefix.length ? 'SHORT_CONTIGUOUS_HISTORY' : gaps.length ? 'LATEST_REQUESTED_BAR_NOT_RECEIVED_CLOSED' : 'COMPLETE_REQUESTED_WINDOW';
  const emitted = preserve_disjoint_closed_rows ? candles : tail;
  return {value: emitted, unit: relativeRequested ? CANDLE_NATIVE_RELATIVE_UNIT : 'OHLC_USDT_VOLUME_BASE',
    event_ts: timeKnown && tail.length ? tail.at(-1).close_ts : null,
    qualified: timeKnown && (volumeKnown || relativeKnown) && tail.length > 0,
    reason: relativeRequested && !relativeKnown ? 'NATIVE_RELATIVE_QUALIFICATION_MISMATCH'
      : !timeKnown ? 'CANDLE_OPEN_TIME_UNQUALIFIED' : !volumeKnown && !relativeKnown ? 'CANDLE_VOLUME_UNIT_UNQUALIFIED' : !tail.length ? 'NO_CLOSED_CANDLES' : gaps.length ? historyState : null,
    coverage: {window_start: start, window_end: end, interval_ms, expected_rows: expected, returned_rows: candles.length,
      emitted_rows: emitted.length, noncontiguous_older_rows_excluded: candles.length - emitted.length,
      complete: gaps.length === 0 && candles.length === expected, gaps, internal_gaps: internalGaps, missing_older_prefix: missingPrefix,
      history_state: historyState, observed_available_start: timeKnown ? availableStart : null,
      available_start: timeKnown && tail.length ? tail[0].open_ts : null, available_end: timeKnown ? availableEnd : null,
      contiguous_tail: timeKnown && tail.length ? {start_ts: tail[0].open_ts, end_ts: availableEnd, closed_bars: tail.length, duration_ms: tail.length * interval_ms} : null,
      usable_windows: usableWindows, time_qualified: timeKnown, volume_qualified: volumeKnown, exact_turnover_available: turnoverKnown,
      ...(relativeRequested ? {relative_volume_qualified: relativeKnown, time_basis: relativeKnown ? CANDLE_CCXT_TIME_BASIS : null,
        time_evidence_ref: relativeKnown ? qualification.time.evidence_ref : null,
        owner_decision_ref: relativeKnown ? qualification.owner_decision_ref : null,
        independent_vendor_guarantee_claimed: false, native_quantity_unit: 'UNKNOWN',
        comparison_kind: relativeKnown ? CANDLE_NATIVE_RELATIVE_KIND : null,
        volume_comparison_key: relativeKnown ? qualification.volume.comparison_key : null,
        absolute_base_amount_qualified: false, absolute_USD_amount_qualified: false} : {})}};
}

export function parseOrderbook(body, qualification = {}) {
  assertEnvelope(body);
  if (!object(body.data)) fail('BINGX_DEPTH_OBJECT_REQUIRED');
  const row = body.data, event_ts = timestamp(row.T);
  if (!['COIN', 'STANDARD'].includes(qualification.fields)) return {value: null, event_ts, qualified: false, reason: 'ORDERBOOK_FIELD_SEMANTICS_UNQUALIFIED'};
  const fields = qualification.fields === 'COIN' ? ['bidsCoin', 'asksCoin'] : ['bids', 'asks'];
  const quantityProof = proof(qualification) && ['BASE_ASSET', 'CONTRACTS'].includes(qualification.unit) ? qualification : null;
  if (!quantityProof) return {value: null, event_ts, qualified: false, reason: 'ORDERBOOK_QUANTITY_UNIT_UNQUALIFIED'};
  const parsed = fields.map(field => {
    if (!Array.isArray(row[field]) || row[field].length > 1000) fail('BINGX_DEPTH_PAIRS_REQUIRED');
    return row[field].map(pair => {
      if (!Array.isArray(pair) || pair.length !== 2 || positive(pair[0]) === null) fail('BINGX_DEPTH_PAIR_INVALID');
      const quantity = baseQuantity(pair[1], quantityProof);
      if (quantity === null) fail('ORDERBOOK_CONTRACT_MULTIPLIER_UNQUALIFIED');
      return [Number(pair[0]), quantity];
    }).filter(([, quantity]) => quantity > 0);
  });
  const [bids, asks] = parsed;
  bids.sort((a, b) => b[0] - a[0]); asks.sort((a, b) => a[0] - b[0]);
  if (!bids.length || !asks.length) fail('BINGX_TWO_SIDED_DEPTH_REQUIRED');
  if (new Set(bids.map(([p]) => p)).size !== bids.length || new Set(asks.map(([p]) => p)).size !== asks.length) fail('BINGX_DUPLICATE_DEPTH_PRICE');
  if (bids[0][0] >= asks[0][0]) fail('BINGX_CROSSED_OR_LOCKED_DEPTH');
  return {value: {bids, asks}, event_ts, qualified: true, reason: null,
    coverage: {bids: bids.length, asks: asks.length, requested_depth_limit: 1000,
      returned_at_limit: bids.length === 1000 || asks.length === 1000,
      complete_book: null, depth_coverage_reason: 'BOUNDED_VISIBLE_DEPTH_NOT_FULL_BOOK_CENSUS', quantity_evidence_ref: qualification.evidence_ref}};
}

export function parseOpenInterest(body, instrument, qualification) {
  const row = selectRow(body, instrument.native_symbol), native = numeric(row.openInterest);
  if (native === null || native < 0) fail('BINGX_OPEN_INTEREST_INVALID');
  const known = proof(qualification) && ['CONTRACTS', 'BASE_ASSET', 'USDT'].includes(qualification.unit);
  return {value: known ? native : null, event_ts: timestamp(row.time), unit: known ? qualification.unit : null,
    qualified: known, reason: known ? null : 'OPEN_INTEREST_UNIT_UNQUALIFIED', native_value_decimal: String(row.openInterest)};
}

export function parseFunding(body, instrument, qualification) {
  const row = selectRow(body, instrument.native_symbol), rate = numeric(row.lastFundingRate);
  if (rate === null) fail('BINGX_FUNDING_RATE_INVALID');
  const checked = qualifyBingxFundingQuote(qualification, instrument);
  const hours = checked.period_qualified ? numeric(row.fundingIntervalHours) : null;
  const period = hours !== null && Number.isInteger(hours) && hours > 0 && hours <= 24 ? hours * 3600000 : null;
  // Supported-consumer quote time is not a settled funding/payment event.
  // Neither the next scheduled funding time nor receipt time substitutes for it.
  const quoteTime = checked.clock_qualified ? timestamp(row.updateTime) : null;
  const reason = checked.reason ?? (period === null ? 'FUNDING_PERIOD_UNKNOWN'
    : quoteTime === null ? 'FUNDING_QUOTE_SNAPSHOT_CLOCK_MISSING' : null);
  return {value: {rate: checked.unit_qualified ? rate : null, period_ms: period,
      next_funding_ts: timestamp(row.nextFundingTime), funding_quote_kind: FUNDING_RATE_QUOTE_SNAPSHOT,
      rate_snapshot_ts: quoteTime, funding_payment_event_ts: null},
    unit: checked.unit_qualified && period !== null ? 'RATE_FRACTION_PER_ACTUAL_PERIOD' : null,
    event_ts: quoteTime, qualified: reason === null, reason,
    raw_rate_decimal: String(row.lastFundingRate), native_value_decimal: String(row.lastFundingRate),
    native_rate_quote_update_ts: quoteTime, native_metadata_update_ts: null,
    funding_quote_kind: FUNDING_RATE_QUOTE_SNAPSHOT, clock_semantics: 'RATE_QUOTE_SNAPSHOT',
    funding_payment_event_ts: null, unit_evidence_ref: checked.unit_evidence_ref,
    unit_qualification_basis: checked.unit_qualification_basis,
    coverage: {...checked, quote_clock_field: 'updateTime', clock_semantics: 'RATE_QUOTE_SNAPSHOT',
      rate_event_clock_proven: false, funding_payment_event_ts: null,
      period_source: 'SAME_RESPONSE_ROW', period_field: 'fundingIntervalHours'}};
}
