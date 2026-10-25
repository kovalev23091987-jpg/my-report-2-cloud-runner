import {assertInstrument, ownerInstrumentExcluded, TRADE_QUOTE_NOTIONAL_UNIT} from '../contracts/index.mjs';
import {object, positive, assertEnvelope, fail} from './bingx.mjs';

// Retained primary recent-method proof. No historical-trades semantics,
// quantity multiplier, API admission or per-token live coverage is implied.
export const RECENT_TRADE_SEMANTICS = Object.freeze({
  route: '/openApi/swap/v2/quote/trades',
  limit: 100,
  response_rows_max: 1000,
  id_mapping_evidence_ref: 'pump-report/handoffs/sources/F555_FILLID_ROOT_REVIEW_ACCEPTED_V1.json',
  unit: TRADE_QUOTE_NOTIONAL_UNIT,
  amount_field: 'quoteQty',
  maker_field: 'isBuyerMaker',
  evidence_ref: 'pump-report/handoffs/sources/T3_RECENT_TRADES_PRIMARY_PROOFS_V1.json',
  reference_commit: '7b1c40d29c248b18fcf418767c8e49760d1f6ef0',
  maker_descriptor_sha256: '512e0e2f994999aaf070e6e93ee3e55b95fb8d4fd93dafee28257cddf326cbc1'
});

const unixMs = value => {
  const n = typeof value === 'number' ? value
    : typeof value === 'string' && /^\d{13}$/.test(value) ? Number(value) : null;
  return Number.isSafeInteger(n) && n >= 1000000000000 && n <= 9999999999999 ? n : null;
};
const vendorId = value => {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  return typeof value === 'string' && /^(?:0|[1-9]\d{0,79})$/.test(value) ? value : null;
};

export function parseRecentTrades(body, {instrument, received_ts} = {}) {
  assertInstrument(instrument);
  if (ownerInstrumentExcluded(instrument)) fail('OWNER_ASSET_DELIVERY_EXCLUDED');
  if (typeof received_ts !== 'number' || unixMs(received_ts) === null) fail('BINGX_TRADE_RECEIPT_MS_REQUIRED');
  assertEnvelope(body);
  // The captured successful reply returned 1000 rows to limit=100. Preserve the
  // bounded response rather than truncating before downstream conflict checks.
  if (!Array.isArray(body.data) || body.data.length > RECENT_TRADE_SEMANTICS.response_rows_max) fail('BINGX_BOUNDED_TRADE_ARRAY_REQUIRED');
  const counts = {qualified_before_dedup: 0, invalid_id: 0, invalid_clock: 0,
    invalid_price: 0, invalid_notional: 0, unknown_side: 0, identity_mismatch: 0,
    id_field_rows: 0, fillId_field_rows: 0, consistent_id_and_fillId_rows: 0, conflicting_id_fields: 0};
  const value = body.data.map(raw => {
    const row = object(raw) ? raw : {}, reasons = [];
    const identityKnown = !Object.hasOwn(row, 'symbol') || row.symbol === instrument.native_symbol;
    if (!identityKnown) { reasons.push('TRADE_SYMBOL_MISMATCH'); counts.identity_mismatch++; }
    const hasId = Object.hasOwn(row, 'id'), hasFillId = Object.hasOwn(row, 'fillId');
    const id = hasId ? vendorId(row.id) : null, fillId = hasFillId ? vendorId(row.fillId) : null;
    const idConflict = hasId && hasFillId && (id === null || fillId === null || id !== fillId);
    // ROOT reviewed this pinned consumer field. It does not establish vendor
    // uniqueness. Mixed fields must agree; never hide a conflict by fallback.
    const trade_id = identityKnown && !idConflict ? (hasId ? id : fillId) : null;
    if (idConflict) { reasons.push('CONFLICTING_OR_INVALID_VENDOR_ID_FIELDS'); counts.conflicting_id_fields++; }
    if (trade_id !== null) {
      if (hasId && hasFillId) counts.consistent_id_and_fillId_rows++;
      else if (hasId) counts.id_field_rows++;
      else counts.fillId_field_rows++;
    }
    if (trade_id === null) { reasons.push('ACTUAL_STABLE_VENDOR_TRADE_ID_REQUIRED'); counts.invalid_id++; }
    let event_ts = identityKnown ? unixMs(row.time) : null;
    if (event_ts !== null && event_ts > received_ts) { event_ts = null; reasons.push('TRADE_EVENT_CLOCK_FUTURE'); }
    if (event_ts === null) { reasons.push('TRADE_EVENT_UNIX_MS_REQUIRED'); counts.invalid_clock++; }
    const price = identityKnown ? positive(row.price) : null;
    if (price === null) { reasons.push('TRADE_POSITIVE_PRICE_REQUIRED'); counts.invalid_price++; }
    // qty is intentionally never read. quoteQty is the documented quote-asset
    // amount for this exact recent method and verified USDT instrument.
    const notional_quote = identityKnown ? positive(row.quoteQty) : null;
    if (notional_quote === null) { reasons.push('TRADE_POSITIVE_QUOTE_NOTIONAL_REQUIRED'); counts.invalid_notional++; }
    let aggressor_side = 'UNKNOWN';
    if (identityKnown && Object.hasOwn(row, 'isBuyerMaker') && !Object.hasOwn(row, 'buyerMaker')
      && typeof row.isBuyerMaker === 'boolean') aggressor_side = row.isBuyerMaker ? 'SELL' : 'BUY';
    else { reasons.push('TRADE_SINGLE_BOOLEAN_IS_BUYER_MAKER_REQUIRED'); counts.unknown_side++; }
    if (!reasons.length) counts.qualified_before_dedup++;
    // Preserve duplicate/conflicting IDs and invalid rows for consumer-side
    // conflict detection before filtering. Never invent execution IDs.
    return {trade_id, event_ts, price, notional_quote, aggressor_side, qualification_reasons: reasons};
  });
  const qualified = value.filter(row => row.qualification_reasons.length === 0);
  const clocks = qualified.map(row => row.event_ts);
  const event_ts = clocks.length ? Math.max(...clocks) : null;
  return {value, unit: RECENT_TRADE_SEMANTICS.unit, event_ts, qualified: qualified.length > 0,
    reason: !value.length ? 'NO_RETURNED_TRADES' : !qualified.length ? 'NO_QUALIFIED_RECENT_TRADE_ROWS'
      : qualified.length < value.length ? 'LATEST_RETURNED_TRADE_SAMPLE_PARTIAL' : null,
    coverage: {sample_kind: 'LATEST_RETURNED_BOUNDED_SAMPLE', requested_limit: RECENT_TRADE_SEMANTICS.limit,
      response_rows_max: RECENT_TRADE_SEMANTICS.response_rows_max,
      returned_rows: value.length, returned_more_than_requested: value.length > RECENT_TRADE_SEMANTICS.limit,
      response_bound_evidence_ref: 'pump-report/handoffs/sources/F553_ACTUAL1000_EVIDENCE_V1.json',
      trade_id_field: 'id_OR_ROOT_REVIEWED_fillId', fillId_alias_accepted: true,
      id_mapping_evidence_ref: RECENT_TRADE_SEMANTICS.id_mapping_evidence_ref,
      vendor_ID_uniqueness_guaranteed: false,
      ...counts, counts_are_before_consumer_dedup: true,
      duplicate_and_conflicting_ids_preserved: true, complete: false, full_window_coverage: false,
      complete_window_start: null, complete_window_end: null,
      qualified_sample_start: clocks.length ? Math.min(...clocks) : null, qualified_sample_end: event_ts,
      amount_field: 'quoteQty', amount_unit: RECENT_TRADE_SEMANTICS.unit,
      base_quantity_unit: 'UNKNOWN', base_quantity_derived: false,
      maker_field: 'isBuyerMaker', buyerMaker_alias_accepted: false,
      unit_and_maker_evidence_ref: RECENT_TRADE_SEMANTICS.evidence_ref,
      event_clock_basis: 'NATIVE_TRADE_TIME_UNIX_MS', receipt_time_used_as_trade_time: false}};
}
