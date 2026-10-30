import {object, text, positive, proof, fail} from './bingx.mjs';
import {textHash} from '../runtime/text-hash.mjs';

export const ORDERLY_QUERY_URL = 'https://api.orderly.org/v1/public/query';
export const ORDERLY_POSITIONS_BODY = Object.freeze({type: 'platformPositions', min_notional: '0', limit: 500});
export const ORDERLY_PRIMARY_REF = 'checkpoints/pump-report-20261025/ROOT_ORDERLY_CURRENT_PRIMARY_DELTA.json';
const ms = n => Number.isSafeInteger(n) && n >= 1000000000000 && n <= 9999999999999 ? n : null;
const field = n => typeof n === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(n);
const stableId = n => Number.isSafeInteger(n) && n >= 0 ? String(n)
  : typeof n === 'string' && n.length > 0 && n.length <= 256 && !/[\x00-\x20\x7f]/.test(n) ? n : null;
const safeCode = e => /^[A-Z0-9_:.-]{1,160}$/.test(e?.code ?? '') ? e.code : 'ORDERLY_SOURCE_ERROR';

function bindingFor(route, instrument) {
  if (!Array.isArray(route?.market_bindings) || route.market_bindings.length === 0) return null;
  if (route.market_bindings.length > 550) return null;
  const matches = route.market_bindings.filter(b => b?.bingx_instrument_id === instrument.instrument_id);
  if (matches.length !== 1) return null;
  const b = matches[0];
  return instrument.canonical_cross_venue_identity_qualified === true && proof(b)
    && b.status === 'VERIFIED_SAME_UNDERLYING' && b.bingx_asset_id === instrument.asset_id
    && b.bingx_identity_evidence_ref === instrument.identity_evidence_ref
    && text(b.source_symbol) && b.source_symbol.length <= 120 && text(b.source_market_id)
    && b.source_venue === 'ORDERLY' ? b : null;
}

function fieldSemantics(b) {
  const s = b.position_semantics, id = b.position_identity, value = b.position_value;
  return proof(s) && s.side_field === 'side' && s.long_value === 'LONG' && s.short_value === 'SHORT'
    && s.liquidation_price_field === 'est_liq_price' && s.liquidation_price_kind === 'ESTIMATED_CURRENT_OPEN_POSITION_LIQUIDATION_PRICE'
    && proof(id) && id.kind === 'SOURCE_STABLE_POSITION_ID' && id.scope === 'PLATFORM_UNIQUE_CURRENT_POSITION'
    && field(id.field) && !['symbol', 'side', 'opened_at', 'mark_price', 'est_liq_price', 'notional'].includes(id.field)
    && b.price_quote === 'USDC' && text(b.price_quote_evidence_ref)
    && proof(value) && value.field === 'notional' && value.unit === 'USDC';
}

export const orderlyRouteConfigured = (route, instrument) => {
  const binding = bindingFor(route, instrument);
  return binding !== null && fieldSemantics(binding);
};

function projection(b, instrument, received_ts, now, profile) {
  const p = b.price_mapping;
  return proof(p) && p.kind === 'EXPLICIT_QUOTE_RATE_AND_VENUE_PRICE_BASIS'
    && text(p.quote_conversion_evidence_ref) && text(p.price_basis_evidence_ref)
    && p.from_market_id === b.source_market_id && p.to_instrument_id === instrument.instrument_id
    && p.from_quote === 'USDC' && p.to_quote === 'USDT'
    && p.from_price_basis === 'ORDERLY_EST_LIQ_PRICE' && p.to_price_basis === 'BINGX_NATIVE_PRICE'
    && positive(p.quote_rate_to_usdt) !== null && positive(p.venue_price_basis_multiplier) !== null
    && Number.isSafeInteger(profile.freshness_ms.price) && profile.freshness_ms.price > 0
    && ms(p.event_ts) !== null && p.event_ts <= received_ts && p.event_ts <= now
    && now - p.event_ts <= profile.freshness_ms.price && ms(p.expires_ts) !== null && p.expires_ts >= now ? p : null;
}

// The documented 5s maximum age is represented as a bound. Neither endpoint
// response ts, receipt time nor opened_at is relabelled as generation time.
export async function normalizeOrderlyPositions(payload, {binding, instrument, received_ts, now, profile, receipt_id, body_bytes, reference_price}) {
  if (ms(received_ts) === null || ms(now) === null || received_ts > now) fail('ORDERLY_ORIGINAL_RECEIPT_CLOCK_REQUIRED');
  if (!object(payload) || payload.success !== true || !object(payload.data) || !Array.isArray(payload.data.rows)) fail('ORDERLY_POSITION_PAGE_REQUIRED');
  const rows = payload.data.rows;
  if (rows.length > 500) fail('ORDERLY_POSITION_ROW_LIMIT');
  if (rows.some(r => !object(r) || !text(r.symbol) || r.symbol.length > 120)) fail('ORDERLY_POSITION_SYMBOL_REQUIRED');
  if (!Number.isSafeInteger(body_bytes) || body_bytes < 0 || body_bytes > 2000000) fail('ORDERLY_BOUNDED_BODY_RECEIPT_REQUIRED');
  const cursor = payload.data.next_cursor;
  if (cursor !== undefined && cursor !== null && (typeof cursor !== 'string' || cursor.length > 4096)) fail('ORDERLY_OPAQUE_CURSOR_INVALID');
  const total = payload.data.total_positions;
  if (total !== undefined && (!Number.isSafeInteger(total) || total < rows.length)) fail('ORDERLY_POSITION_TOTAL_INVALID');
  const response_ts = ms(payload.ts), ttl = profile.freshness_ms.observed_positions;
  if (!Number.isSafeInteger(ttl) || ttl <= 0) fail('OBSERVED_POSITION_FRESHNESS_PROFILE_REQUIRED');
  const lower = response_ts === null ? null : response_ts - 5000;
  const bound_expiry = lower === null ? null : lower + ttl;
  const clock_error = response_ts === null ? 'ORDERLY_RESPONSE_TIME_UNQUALIFIED'
    : response_ts > received_ts || response_ts > now ? 'ORDERLY_RESPONSE_TIME_FUTURE'
      : bound_expiry < now ? 'ORDERLY_SNAPSHOT_BOUND_STALE' : null;
  const complete_page = !cursor && rows.length < 500 && total === rows.length;
  const coverage = {scope: 'BOUNDED_PLATFORM_POSITIONS_FIRST_PAGE', page_rows: rows.length,
    max_rows: 500, source_reported_total: total ?? null, has_next_cursor: Boolean(cursor),
    pagination: complete_page ? 'EXPLICIT_FIRST_PAGE_END' : 'PARTIAL_NO_AUTOPAGES',
    market_coverage_complete: false, whole_market_positions_known: false,
    source_response_ts: response_ts, generation_event_ts: null, received_ts,
    source_asof_bound: {earliest_ts: lower, latest_ts: response_ts, documented_max_age_ms: 5000,
      basis: 'DOCUMENTED_MAX_SNAPSHOT_AGE_AT_SERVER_RESPONSE', evidence_ref: ORDERLY_PRIMARY_REF},
    conservative_bound_expires_ts: bound_expiry, clock_error,
    event_ts: null, receipt_used_as_event_time: false, opened_at_used_as_freshness: false,
    bound_contract_in_common_consumer: 'ROOT_ACCEPTANCE_REQUIRED', primary_provider: 'ORDERLY',
    primary_field_proof_ref: ORDERLY_PRIMARY_REF, evidence_ref: receipt_id};
  const target = rows.filter(r => object(r) && r.symbol === binding.source_symbol);
  coverage.exact_target_rows = target.length;
  coverage.target_fully_surveyed = complete_page;
  if (!target.length) return {zones: [], observations: [], coverage,
    status: clock_error?.includes('STALE') ? 'STALE' : clock_error ? 'PARTIAL' : complete_page ? 'ABSENT' : 'NOT_CHECKED',
    reason: clock_error ?? (complete_page ? 'NO_TARGET_POSITION_IN_BOUNDED_PLATFORM_PAGE' : 'TARGET_NOT_CHECKED_BEYOND_BOUNDED_FIRST_PAGE')};
  const idField = binding.position_identity.field, idCounts = new Map();
  for (const r of rows) { const id = object(r) ? stableId(r[idField]) : null; if (id !== null) idCounts.set(id, (idCounts.get(id) ?? 0) + 1); }
  const projected = projection(binding, instrument, received_ts, now, profile), observations = [];
  const excluded = {invalid_or_null_estimate: 0, identity_missing: 0, duplicate_position_id: 0, invalid_side_or_price: 0, invalid_notional: 0};
  for (const r of target) {
    const native_liq = positive(r.est_liq_price), mark = positive(r.mark_price), notional = positive(r.notional), id = stableId(r[idField]);
    if (native_liq === null) { excluded.invalid_or_null_estimate++; continue; }
    if (id === null) { excluded.identity_missing++; continue; }
    if (idCounts.get(id) !== 1) { excluded.duplicate_position_id++; continue; }
    if (mark === null || !['LONG', 'SHORT'].includes(r.side) || !['CROSS', 'ISOLATED'].includes(r.margin_mode)
      || (r.side === 'LONG' ? native_liq >= mark : native_liq <= mark)) { excluded.invalid_side_or_price++; continue; }
    if (notional === null) { excluded.invalid_notional++; continue; }
    const position_id = 'ORDERLY:POSITION:SHA256:' + await textHash(JSON.stringify([binding.source_market_id, id]));
    let price = projected ? native_liq * Number(projected.quote_rate_to_usdt) * Number(projected.venue_price_basis_multiplier) : null;
    const money = projected ? notional * Number(projected.quote_rate_to_usdt) : null;
    if (price !== null && (!Number.isFinite(price) || price <= 0 || !Number.isFinite(money) || money <= 0)) fail('ORDERLY_PROJECTION_OVERFLOW');
    const sideComparable = price !== null && positive(reference_price) !== null && (r.side === 'LONG' ? price < reference_price : price > reference_price);
    if (!sideComparable) price = null;
    observations.push({position_id, asset_id: instrument.asset_id, source: 'ORDERLY_PLATFORM_POSITIONS', primary_provider: 'ORDERLY',
      venue: 'ORDERLY', market_id: binding.source_market_id, native_symbol: binding.source_symbol,
      basis_type: 'OBSERVED_POSITION', liquidated_side: r.side, margin_mode: r.margin_mode,
      native_est_liq_price: native_liq, native_mark_price: mark, native_price_quote: 'USDC',
      native_reported_position_notional: notional, native_notional_unit: 'USDC',
      notional_basis: 'SOURCE_REPORTED_OPEN_POSITION_NOTIONAL_NOT_VALUE_AT_LIQUIDATION',
      projected_bingx_liquidation_price_usdt: price, projected_position_notional_usdt: money,
      quote_rate_to_usdt: projected ? Number(projected.quote_rate_to_usdt) : null,
      venue_price_basis_multiplier: projected ? Number(projected.venue_price_basis_multiplier) : null,
      price_mapping_evidence_ref: projected?.evidence_ref ?? null, identity_evidence_ref: binding.evidence_ref,
      source_response_ts: response_ts, source_asof_bound: coverage.source_asof_bound,
      event_ts: null, generation_event_ts: null, received_ts, expires_ts: null,
      conservative_bound_expires_ts: clock_error ? null : projected
        ? Math.min(bound_expiry, projected.expires_ts, projected.event_ts + profile.freshness_ms.price) : bound_expiry,
      position_ids: [position_id], overlap_group: position_id, no_sum_across_overlapping_aggregates: true,
      evidence_ref: receipt_id, usable: false, bingx_order_eligible: false,
      blockers: [...(clock_error ? [clock_error] : []), 'ORDERLY_BOUND_CLOCK_COMMON_CONTRACT_REQUIRED',
        ...(!projected ? ['CROSS_VENUE_PRICE_MAPPING_UNQUALIFIED'] : !sideComparable ? ['PROJECTED_PRICE_NOT_ON_LIQUIDATION_SIDE_OF_REFERENCE'] : [])],
      limitations: ['BOUNDED_FIRST_PAGE_NOT_MARKET_CENSUS', 'ESTIMATED_OPEN_POSITION_LIQUIDATION_CAN_CHANGE',
        'SOURCE_RESPONSE_TIME_IS_NOT_GENERATION_TIME', 'NOT_A_QUALIFIED_NORMALIZED_ZONE']});
  }
  coverage.excluded_positions = excluded;
  coverage.native_position_observations = observations;
  coverage.usable_zones = 0;
  return {zones: [], observations, coverage,
    status: clock_error?.includes('STALE') ? 'STALE' : clock_error?.includes('FUTURE') ? 'ERROR' : 'PARTIAL',
    reason: clock_error ?? (observations.length ? 'ORDERLY_BOUND_CLOCK_COMMON_CONTRACT_REQUIRED' : 'NO_VALID_IDENTIFIED_POSITION_IN_BOUNDED_PAGE')};
}

export async function collectOrderlyPositions({route, instrument, request, now, profile, deadline, http_limit, reference_price}) {
  const base = {response_checked: false, scope: 'BOUNDED_PLATFORM_POSITIONS_FIRST_PAGE', max_rows: 500,
    max_HTTP: 1, provider_weight_per_HTTP: 20, retries: 0, automatic_pages: 0,
    shared_multiasset_response: true, actual_cost_authority: 'ROOT_BROKER', spent_or_unknown_not_refunded: true,
    whole_market_positions_known: false, market_coverage_complete: false, usable_zones: 0};
  const empty = (status, reason) => ({status, reason, zones: [], checked_sources: [], coverage: {...base}});
  const binding = bindingFor(route, instrument);
  if (!binding) return empty('NOT_CHECKED', 'ORDERLY_INDEPENDENT_MARKET_BINDING_REQUIRED');
  if (!fieldSemantics(binding)) return empty('NOT_CHECKED', 'ORDERLY_PRIMARY_FIELD_UNIT_AND_STABLE_ID_PROOFS_REQUIRED');
  if (!Number.isSafeInteger(http_limit) || http_limit < 1) return empty('NOT_CHECKED_BUDGET', 'OPTIONAL_MAP_REQUEST_LIMIT_REACHED');
  if (!Number.isSafeInteger(profile.freshness_ms.observed_positions) || profile.freshness_ms.observed_positions <= 0) return empty('NOT_CHECKED', 'OBSERVED_POSITION_FRESHNESS_PROFILE_REQUIRED');
  if (now() >= deadline) return empty('TIMEOUT', 'SOURCE_DEADLINE_EXPIRED');
  let response;
  try {
    response = await request({provider: 'ORDERLY', family: 'LIQUIDATIONS', url: ORDERLY_QUERY_URL, method: 'POST', json_body: ORDERLY_POSITIONS_BODY});
    if (now() >= deadline) fail('SOURCE_DEADLINE_EXPIRED');
    const result = await normalizeOrderlyPositions(response.data, {binding, instrument, received_ts: response.received_ts,
      now: now(), profile, receipt_id: response.receipt_id, body_bytes: response.body_bytes, reference_price});
    return {status: result.status, reason: result.reason, zones: result.zones, checked_sources: ['ORDERLY'],
      coverage: {...base, ...result.coverage, response_checked: true, receipt_id: response.receipt_id,
        cache_hit: response.cache_hit === true, source_network_attempts: null,
        target_checked_in_this_page: result.coverage.target_fully_surveyed || result.coverage.exact_target_rows > 0}};
  } catch (error) {
    const code = safeCode(error), status = /DEADLINE|TIMEOUT/.test(code) ? 'TIMEOUT'
      : /BUDGET|QUOTA|ADMISSION|RESERVE|EXHAUSTED|BACKOFF|RATE_LIMIT|NOT_ADMITTED|NOT_MEASURED/.test(code) ? 'NOT_CHECKED_BUDGET' : 'ERROR';
    return {...empty(status, code), checked_sources: response ? ['ORDERLY'] : [], coverage: {...base,
      response_checked: Boolean(response), evidence_ref: response?.receipt_id ?? error.receipt_id ?? null}};
  }
}
