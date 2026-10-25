// Pure offline audit reader. Does not import runtime, perform IO or return prices.
export const BULK_COVERAGE_VERSION = 'F551_SAVED_SCOPE_PRICE_COVERAGE_V1';
export const BULK_PRICE_TTL_MS = 30000;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const ms = x => {
  const n = typeof x === 'number' ? x : typeof x === 'string' && /^\d{13}$/.test(x) ? Number(x) : null;
  return Number.isSafeInteger(n) && n >= 1000000000000 && n <= 9999999999999 ? n : null;
};
const type = x => x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x;
const positivePrice = x => {
  if (!['number', 'string'].includes(typeof x)) return false;
  const s = String(x);
  return s.length <= 96 && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)
    && Number.isFinite(Number(s)) && Number(s) > 0;
};
export function stableCapturedJSON(value) {
  if (Array.isArray(value)) return '[' + value.map(v => stableCapturedJSON(v) ?? 'null').join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + stableCapturedJSON(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function bulkURL(entry) {
  try {
    if (entry?.request?.method !== undefined && entry.request.method !== 'GET') return false;
    const u = new URL(entry?.request?.url);
    return u.protocol === 'https:' && u.hostname === 'open-api.bingx.com' && !u.port && !u.username && !u.password
      && u.pathname === '/openApi/swap/v2/quote/ticker'
      && [...u.searchParams.keys()].every(k => ['timestamp', 'recvWindow'].includes(k));
  } catch { return false; }
}
const nullableMetric = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;

export function analyzeCapturedBulkPrices({capture, expected_symbols, as_of_ts, sha256 = null, file_evidence = null} = {}) {
  if (!Array.isArray(expected_symbols) || !expected_symbols.length || expected_symbols.length > 20000
    || expected_symbols.some(s => typeof s !== 'string' || !s || s.length > 160 || /\s/.test(s))
    || new Set(expected_symbols).size !== expected_symbols.length) throw Error('EXACT_UNIQUE_EXPECTED_SCOPE_REQUIRED');
  if (typeof as_of_ts !== 'number' || ms(as_of_ts) === null) throw Error('EXPLICIT_ANALYSIS_UNIX_MS_REQUIRED');
  const legacy = capture?.body?.result?.raw_responses, direct = capture?.body?.raw_responses;
  if (Array.isArray(legacy) && Array.isArray(direct)) throw Error('AMBIGUOUS_CAPTURE_ENVELOPE_BRANCHES');
  const directAllowed = capture?.body?.schema === 'PUMP_SOURCE_FEASIBILITY_ACTUAL_V1';
  const raw = Array.isArray(legacy) ? legacy : directAllowed ? direct : null;
  const captureLayout = Array.isArray(legacy) ? 'BODY_RESULT_RAW_RESPONSES' : 'ACTUAL_V1_BODY_RAW_RESPONSES';
  if (!Array.isArray(raw) || raw.length > 16) throw Error('CAPTURE_SUPPORTED_BOUNDED_RAW_RESPONSES_REQUIRED');
  const candidates = raw.filter(bulkURL), selected = candidates.length === 1 ? candidates[0] : null;
  const response = selected?.response, body = response?.data;
  const reasons = [];
  if (!candidates.length) reasons.push('BULK_REQUEST_NOT_CAPTURED');
  if (candidates.length > 1) reasons.push('AMBIGUOUS_MULTIPLE_BULK_RESPONSES');
  if (selected) {
    if (!object(response) || response.ok !== true || response.status !== 200) reasons.push('HTTP_RESPONSE_NOT_SUCCESSFUL');
    if (response?.semantic_status !== 'SUCCESS') reasons.push('BROKER_SEMANTIC_SUCCESS_REQUIRED');
    if (typeof response?.receipt_id !== 'string' || !response.receipt_id || response.receipt_id.length > 512) reasons.push('ORIGINAL_RECEIPT_ID_REQUIRED');
    if (typeof response?.received_ts !== 'number' || ms(response.received_ts) === null) reasons.push('ORIGINAL_RECEIVED_UNIX_MS_REQUIRED');
    else if (response.received_ts > as_of_ts) reasons.push('RECEIVED_CLOCK_AFTER_ANALYSIS');
    if (typeof response?.cache_hit !== 'boolean') reasons.push('CACHE_HIT_BOOLEAN_REQUIRED');
    if (!object(body) || body.code !== 0 || !Array.isArray(body.data) || body.data.length > 20000) reasons.push('SUCCESS_ENVELOPE_AND_BOUNDED_ARRAY_REQUIRED');
  }
  const sourceOK = reasons.length === 0, bySymbol = new Map(), invalidRows = [];
  if (sourceOK) body.data.forEach((r, index) => {
    if (!object(r) || typeof r.symbol !== 'string' || !r.symbol || r.symbol.length > 160) {
      invalidRows.push({row_index:index,reason:'ROW_OR_SYMBOL_TYPE_INVALID'}); return;
    }
    const bucket = bySymbol.get(r.symbol) ?? [];
    bucket.push(r); bySymbol.set(r.symbol, bucket);
  });
  const rows = expected_symbols.map(symbol => {
    const hits = sourceOK ? bySymbol.get(symbol) ?? [] : [], r = hits.length === 1 ? hits[0] : null;
    const issues = [], event = r ? ms(r.closeTime) : null, received = response?.received_ts ?? null;
    let status, priceValid = null, atReceive = null, atAsOf = false;
    if (!sourceOK) { status = 'NOT_CHECKED_SOURCE'; issues.push(...reasons); }
    else if (!hits.length) { status = 'MISSING'; issues.push('EXACT_NATIVE_SYMBOL_MISSING'); }
    else if (hits.length > 1) { status = 'AMBIGUOUS'; issues.push('DUPLICATE_NATIVE_SYMBOL_ALL_OCCURRENCES_REJECTED'); }
    else {
      priceValid = positivePrice(r.lastPrice);
      if (!priceValid) issues.push('POSITIVE_NUMBER_OR_DECIMAL_STRING_LAST_PRICE_REQUIRED');
      if (event === null) issues.push('ORIGINAL_CLOSE_TIME_UNIX_MS_REQUIRED');
      if (event !== null && event > received) issues.push('EVENT_AFTER_ORIGINAL_RECEIVE');
      if (event !== null && event > as_of_ts) issues.push('EVENT_AFTER_ANALYSIS');
      if (issues.length) status = 'INVALID';
      else {
        atReceive = received <= event + BULK_PRICE_TTL_MS;
        atAsOf = as_of_ts <= event + BULK_PRICE_TTL_MS;
        status = atAsOf ? 'FRESH_PRICE' : 'STALE_PRICE';
        if (!atReceive) issues.push('ALREADY_STALE_AT_ORIGINAL_RECEIVE');
        if (!atAsOf) issues.push('STALE_AT_ANALYSIS_AS_OF');
      }
    }
    return {native_symbol:symbol,status,matched_rows:sourceOK ? hits.length : null,reason_codes:issues,
      positive_price_valid:priceValid,price_wire_type:r ? type(r.lastPrice) : null,price_value_exported:false,
      event_ts:event,received_ts:selected && typeof received === 'number' ? received : null,
      expires_ts:event === null ? null : event + BULK_PRICE_TTL_MS,
      fresh_at_original_receive:atReceive,fresh_at_analysis_as_of:atAsOf,
      native_clock_field:'closeTime',receipt_id:response?.receipt_id ?? null,
      strict_asset_identity_assessed:false,full_CORE_assessed:false,
      quantity_unit:null,execution_multiplier:null,scaled_price_basis_qualified:false};
  });
  const totals = {expected_symbols:rows.length,raw_array_rows:sourceOK ? body.data.length : null,
    fresh_price:0,stale_price:0,missing:0,ambiguous:0,invalid:0,not_checked_source:0,
    fresh_at_original_receive:rows.filter(r=>r.fresh_at_original_receive===true).length,
    invalid_wire_rows:sourceOK ? invalidRows.length : null};
  const keys = {FRESH_PRICE:'fresh_price',STALE_PRICE:'stale_price',MISSING:'missing',AMBIGUOUS:'ambiguous',INVALID:'invalid',NOT_CHECKED_SOURCE:'not_checked_source'};
  rows.forEach(r=>totals[keys[r.status]]++);
  const expected = new Set(expected_symbols), extras = [...bySymbol].filter(([s])=>!expected.has(s))
    .map(([native_symbol,rs])=>({native_symbol,rows:rs.length,status:'OUTSIDE_SAVED_SCOPE_NOT_CLASSIFIED'}));
  const canonical = body === undefined ? null : stableCapturedJSON(body);
  let canonicalHash = null;
  if (sha256 !== null && canonical !== null) {
    if (typeof sha256 !== 'function') throw Error('SYNCHRONOUS_SHA256_CALLBACK_REQUIRED');
    canonicalHash = sha256(canonical);
    if (typeof canonicalHash !== 'string' || !/^[0-9a-f]{64}$/i.test(canonicalHash)) throw Error('CANONICAL_SHA256_HEX_REQUIRED');
    canonicalHash = canonicalHash.toLowerCase();
  }
  const started = ms(selected?.request?.started_ts), received = ms(response?.received_ts);
  const elapsed = started !== null && received !== null && started <= received ? received-started : null;
  const wire = response?.wire_bytes_basis === 'MEASURED_WIRE_BODY_BYTES' && Number.isSafeInteger(response?.wire_bytes)
    && response.wire_bytes >= 0 ? response.wire_bytes : null;
  const fetchBodyBytes = response?.body_bytes_basis === 'FETCH_RESPONSE_BODY_BYTES_NOT_COMPRESSED_NETWORK_WIRE'
    && Number.isSafeInteger(response?.body_bytes) && response.body_bytes >= 0 ? response.body_bytes : null;
  return {schema:BULK_COVERAGE_VERSION,capture_layout:captureLayout,capture_run_id:capture?.body?.run_id??null,
    analysis_as_of_ts:as_of_ts,source_status:sourceOK?'SUCCESS':'NOT_QUALIFIED',source_reason_codes:reasons,
    captured_bulk_responses:candidates.length,ignored_raw_responses:raw.length-candidates.length,
    request_url:selected?.request?.url ?? null,receipt_id:response?.receipt_id ?? null,cache_hit:response?.cache_hit ?? null,
    original_received_ts:typeof response?.received_ts==='number'?response.received_ts:null,
    captured_file_evidence:file_evidence,
    payload_evidence:{response_data_canonical_sha256:canonicalHash,
      canonical_utf8_bytes:canonical===null?null:new TextEncoder().encode(canonical).byteLength,
      canonical_format:'Stable sorted JSON keys/array order, not original HTTP wire bytes or RFC8785 claim',
      wire_body_bytes:wire,wire_bytes_reason:wire===null?'MEASURED_WIRE_BODY_BYTES_NOT_RECORDED':null,
      fetch_response_body_bytes:fetchBodyBytes,
      fetch_response_body_bytes_basis:fetchBodyBytes===null?null:'FETCH_RESPONSE_BODY_BYTES_NOT_COMPRESSED_NETWORK_WIRE',
      provided_latency_ms:nullableMetric(response?.latency_ms),request_started_ts:started,
      elapsed_request_start_to_received_ms:elapsed,elapsed_basis:elapsed===null?null:'PROVIDED_REQUEST_START_TO_ORIGINAL_RECEIVE_INCLUDES_BODY_PARSE',
      HTTP_Date_used_as_data_clock:false,raw_body_or_prices_exported:false},
    saved_scope_price_coverage:{denominator:rows.length,fresh_numerator:totals.fresh_price,
      complete:sourceOK&&totals.fresh_price===rows.length,at_original_receive_numerator:totals.fresh_at_original_receive},
    current_membership:{status:'NOT_CHECKED_CATALOG_NOT_UPDATED_BY_THIS_CAPTURE',count:null},
    strict_asset_identity:{status:'NOT_ASSESSED_BY_PRICE_PRESENCE',verified_count:null},
    full_CORE:{status:'NOT_ASSESSED_BY_BULK_PRICE',verified_count:null},
    all550_operationally_verified:false,totals,rows,outside_saved_scope:extras,invalid_wire_rows:invalidRows};
}
