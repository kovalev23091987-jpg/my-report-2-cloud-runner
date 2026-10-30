import {object, text, numeric, positive, proof, fail} from './bingx.mjs';

export const HYPERLIQUID_INFO_URL = 'https://api.hyperliquid.xyz/info';
export const HYPERLIQUID_POSITION_PROOF = 'pump-report/handoffs/sources/F556_HYPERLIQUID_PRIMARY_PROOFS_V1.json';
const ms = x => Number.isSafeInteger(x) && x >= 1000000000000 && x <= 9999999999999 ? x : null;
const accountAddress = x => typeof x === 'string' && /^0x[0-9a-fA-F]{40}$/.test(x) && !/^0x0{40}$/i.test(x);
const safeRef = x => typeof x === 'string' && /^[A-Za-z0-9:_-]{1,128}$/.test(x);
const budgetFailure = code => /BUDGET|QUOTA|ADMISSION|RESERVE|EXHAUSTED|BACKOFF|RATE_LIMIT|NOT_ADMITTED|NOT_MEASURED/.test(code);
const codeOf = e => /^[A-Z0-9_:.-]{1,160}$/.test(e?.code ?? '') ? e.code : 'HYPERLIQUID_SOURCE_ERROR';

function admittedAccounts(route) {
  const rows = route?.admitted_accounts;
  if (!Array.isArray(rows) || rows.length === 0) return {reason: 'FINITE_ADMITTED_ACCOUNT_LIST_REQUIRED'};
  if (rows.length > 2 || !text(route.account_admission_ref)) return {reason: 'HYPERLIQUID_ACCOUNT_ADMISSION_UNQUALIFIED'};
  if (rows.some(r => !object(r) || !accountAddress(r.address) || !safeRef(r.account_ref) || !text(r.admission_ref))
    || new Set(rows.map(r => r.address.toLowerCase())).size !== rows.length
    || new Set(rows.map(r => r.account_ref)).size !== rows.length) return {reason: 'HYPERLIQUID_ACCOUNT_ADMISSION_UNQUALIFIED'};
  if (route.dex !== undefined && (typeof route.dex !== 'string' || !/^[A-Za-z0-9_-]{0,64}$/.test(route.dex))) return {reason: 'HYPERLIQUID_DEX_UNQUALIFIED'};
  return {accounts: rows};
}

function sameUnderlying(route, instrument) {
  const b = route.identity_binding;
  return instrument.canonical_cross_venue_identity_qualified === true && proof(b)
    && b.status === 'VERIFIED_SAME_UNDERLYING'
    && b.bingx_instrument_id === instrument.instrument_id && b.bingx_asset_id === instrument.asset_id
    && b.bingx_identity_evidence_ref === instrument.identity_evidence_ref
    && b.hyperliquid_coin === route.coin && b.hyperliquid_market_id === route.market_id;
}

function semantics(route) {
  const s = route.position_semantics;
  return proof(s) && s.signed_size_field === 'szi' && s.positive_side === 'LONG' && s.negative_side === 'SHORT'
    && s.liquidation_price_field === 'liquidationPx' && s.liquidation_price_kind === 'CURRENT_ACCOUNT_ESTIMATE';
}

function priceMapping(route, instrument, now, received_ts, profile) {
  const m = route.price_mapping;
  const ttl = profile.freshness_ms.price;
  return Number.isSafeInteger(ttl) && ttl > 0 && sameUnderlying(route, instrument) && proof(m)
    && m.kind === 'EXPLICIT_PRICE_BASIS_AND_QUOTE_CONVERSION' && text(m.quote_conversion_evidence_ref)
    && text(m.price_basis_evidence_ref) && m.from_quote === route.price_quote && m.to_quote === 'USDT'
    && m.from_market_id === route.market_id && m.to_instrument_id === instrument.instrument_id
    && m.from_price_basis === 'HYPERLIQUID_LIQUIDATION_PX' && m.to_price_basis === 'BINGX_NATIVE_PRICE'
    && positive(m.multiplier_to_bingx) !== null && ms(m.event_ts) !== null && m.event_ts <= received_ts
    && m.event_ts <= now && now - m.event_ts <= ttl && ms(m.expires_ts) !== null && m.expires_ts >= now;
}

export function normalizeHyperliquidAccount(payload, {route, instrument, account_ref, received_ts, now, profile, receipt_id, reference_price}) {
  if (!Number.isSafeInteger(profile.freshness_ms.observed_positions) || profile.freshness_ms.observed_positions <= 0) fail('OBSERVED_POSITION_FRESHNESS_PROFILE_REQUIRED');
  if (!object(payload) || !Array.isArray(payload.assetPositions) || payload.assetPositions.length > 1000) fail('HYPERLIQUID_BOUNDED_ACCOUNT_STATE_REQUIRED');
  const matches = payload.assetPositions.filter(r => object(r?.position) && r.position.coin === route.coin);
  if (matches.length > 1) fail('HYPERLIQUID_DUPLICATE_TARGET_POSITION');
  const event_ts = ms(payload.time), expires_ts = event_ts === null ? null : event_ts + profile.freshness_ms.observed_positions;
  const coverage = {account_ref, source_ts: event_ts, received_ts, expires_ts,
    scope: 'EXPLICIT_OBSERVED_ACCOUNTS_SUBSET', market_coverage_complete: false,
    response_position_rows: payload.assetPositions.length, exact_target_rows: matches.length,
    primary_field_proof_ref: HYPERLIQUID_POSITION_PROOF,
    clock_basis: 'NATIVE_ACCOUNT_RESPONSE_TIME_NOT_PER_POSITION_UPDATE', receipt_used_as_source_time: false};
  const clock = event_ts === null ? 'HYPERLIQUID_SOURCE_TIME_UNQUALIFIED'
    : event_ts > received_ts || event_ts > now ? 'HYPERLIQUID_SOURCE_TIME_FUTURE'
      : expires_ts < now ? 'HYPERLIQUID_ACCOUNT_STATE_STALE' : null;
  if (!matches.length) return {zones: [], coverage, status: clock ? (clock.includes('STALE') ? 'STALE' : clock.includes('FUTURE') ? 'ERROR' : 'PARTIAL') : 'ABSENT',
    reason: clock ?? 'NO_TARGET_POSITION_IN_OBSERVED_ACCOUNT'};
  const p = matches[0].position, size = numeric(p.szi), nativePrice = positive(p.liquidationPx);
  if (matches[0].type !== 'oneWay' || size === null) return {zones: [], coverage, status: 'PARTIAL', reason: 'HYPERLIQUID_POSITION_SCHEMA_UNQUALIFIED'};
  if (size === 0) return {zones: [], coverage, status: clock ? 'PARTIAL' : 'ABSENT', reason: clock ?? 'OBSERVED_POSITION_SIZE_ZERO'};
  if (nativePrice === null) return {zones: [], coverage, status: 'PARTIAL', reason: 'HYPERLIQUID_LIQUIDATION_PX_UNAVAILABLE'};
  const identityKnown = sameUnderlying(route, instrument), semanticKnown = semantics(route);
  const quoteKnown = text(route.price_quote) && text(route.price_quote_evidence_ref);
  const mappingKnown = quoteKnown && priceMapping(route, instrument, now, received_ts, profile);
  // A converted zone cannot outlive either the native snapshot or the
  // independently reviewed price/quote conversion used to qualify its price.
  const zone_expires_ts = expires_ts === null ? null : mappingKnown
    ? Math.min(expires_ts, route.price_mapping.expires_ts, route.price_mapping.event_ts + profile.freshness_ms.price) : expires_ts;
  const side = semanticKnown ? (size > 0 ? 'LONG' : 'SHORT') : 'UNKNOWN';
  // No implicit factor1 or ticker-based alignment. Unknown prices stay native.
  const mappedPrice = mappingKnown ? nativePrice * Number(route.price_mapping.multiplier_to_bingx) : null;
  if (mappedPrice !== null && (!Number.isFinite(mappedPrice) || mappedPrice <= 0)) fail('HYPERLIQUID_PRICE_MAPPING_OVERFLOW');
  const blockers = [];
  if (!identityKnown) blockers.push('CROSS_VENUE_UNDERLYING_UNQUALIFIED');
  if (!semanticKnown) blockers.push('SIGNED_POSITION_AND_LIQUIDATION_SEMANTICS_UNQUALIFIED');
  if (!quoteKnown) blockers.push('HYPERLIQUID_PRICE_CURRENCY_UNQUALIFIED');
  if (!mappingKnown) blockers.push('CROSS_VENUE_PRICE_MAPPING_UNQUALIFIED', 'NOT_FOR_EXACT_BINGX_ORDERS');
  if (clock) blockers.push(clock);
  if (mappingKnown && semanticKnown && (side === 'LONG' ? mappedPrice >= reference_price : mappedPrice <= reference_price)) blockers.push('LIQUIDATION_SIDE_OR_REFERENCE_PRICE_UNQUALIFIED');
  const magnitudeKnown = proof(route.position_value) && route.position_value.field === 'positionValue'
    && route.position_value.quote === route.price_quote && quoteKnown;
  const magnitude = magnitudeKnown ? positive(p.positionValue) : null;
  const limitations = ['OBSERVED_ACCOUNTS_SUBSET_NOT_MARKET_CENSUS', 'CURRENT_ACCOUNT_LIQUIDATION_ESTIMATE_CAN_CHANGE', ...blockers];
  if (magnitude === null) limitations.push('POSITION_VALUE_OR_CURRENCY_UNQUALIFIED');
  const position_id = `HYPERLIQUID:${account_ref}:${route.market_id}:ONEWAY`;
  const zone = {zone_id: `${position_id}:${event_ts ?? 'UNKNOWN_TIME'}`, asset_id: identityKnown ? instrument.asset_id : null,
    source: 'HYPERLIQUID_ACCOUNT_STATE', primary_provider: 'HYPERLIQUID', venue: 'HYPERLIQUID', market_id: route.market_id,
    native_coin: route.coin, basis_type: 'OBSERVED_POSITION', liquidated_side: side,
    lower: mappedPrice ?? nativePrice, upper: mappedPrice ?? nativePrice,
    native_lower: nativePrice, native_upper: nativePrice, native_price_quote: quoteKnown ? route.price_quote : null,
    price_quote: mappingKnown ? 'USDT' : quoteKnown ? route.price_quote : null,
    price_currency: mappingKnown ? 'USDT' : quoteKnown ? route.price_quote : null,
    native_signed_size_decimal: String(p.szi), native_size_unit: 'UNKNOWN_NATIVE_POSITION_SIZE',
    magnitude_value: magnitude, magnitude_unit: magnitude === null ? null : route.price_quote,
    magnitude_basis: 'SOURCE_REPORTED_POSITION_VALUE_NOT_VALUE_AT_LIQUIDATION',
    event_ts, received_ts, expires_ts: zone_expires_ts, native_expires_ts: expires_ts, evidence_ref: receipt_id,
    identity_evidence_ref: identityKnown ? route.identity_binding.evidence_ref : null,
    price_mapping_evidence_ref: mappingKnown ? route.price_mapping.evidence_ref : null,
    price_comparability: {status: mappingKnown ? 'VERIFIED' : 'UNKNOWN',
      evidence_ref: mappingKnown ? route.price_mapping.evidence_ref : null,
      from_market_id: route.market_id, to_instrument_id: instrument.instrument_id,
      from_currency: quoteKnown ? route.price_quote : null, to_currency: 'USDT',
      multiplier: mappingKnown ? Number(route.price_mapping.multiplier_to_bingx) : null,
      event_ts: mappingKnown ? route.price_mapping.event_ts : null,
      expires_ts: mappingKnown ? route.price_mapping.expires_ts : null},
    position_ids: [position_id], overlap_group: position_id,
    coverage: {...coverage, position_size_derived_to_BASE: false}, limitations,
    usable: blockers.length === 0, bingx_order_eligible: blockers.length === 0};
  return {zones: [zone], coverage, status: clock?.includes('STALE') ? 'STALE' : clock?.includes('FUTURE') ? 'ERROR' : 'PARTIAL',
    reason: blockers[0] ?? 'OBSERVED_ACCOUNTS_SUBSET_ONLY'};
}

// Connected by createPumpSources.getLiquidations. request is the existing
// admitted ROOT broker wrapper, never a direct fetch or an admission creator.
export async function collectHyperliquidPositions({route, instrument, request, now, profile, deadline, reference_price, http_limit}) {
  const admitted = admittedAccounts(route), base = {scope: 'EXPLICIT_OBSERVED_ACCOUNTS_SUBSET',
    market_coverage_complete: false, whole_market_positions_known: false, pagination: 'ONE_ACCOUNT_STATE_RESPONSE_PER_ACCOUNT_NO_CURSOR',
    max_accounts: 2, max_response_pages: 2, actual_cost_authority: 'BROKER', spent_or_unknown_not_refunded: true};
  const empty = (status, reason) => ({status, reason, zones: [], checked_sources: [], coverage: {...base, response_checked: false}});
  if (admitted.reason) return empty('NOT_CHECKED', admitted.reason);
  if (!Number.isSafeInteger(profile.freshness_ms.observed_positions) || profile.freshness_ms.observed_positions <= 0) return empty('NOT_CHECKED', 'OBSERVED_POSITION_FRESHNESS_PROFILE_REQUIRED');
  if (route.asset_id !== instrument.asset_id || !text(route.coin) || route.coin.length > 80 || !text(route.market_id)) return empty('NOT_CHECKED', 'HYPERLIQUID_ROUTE_SCOPE_UNQUALIFIED');
  if (!Number.isSafeInteger(http_limit) || http_limit < 0 || http_limit > 2) return empty('NOT_CHECKED', 'HYPERLIQUID_REQUEST_BOUND_REQUIRED');
  if (http_limit === 0) return empty('NOT_CHECKED_BUDGET', 'OPTIONAL_MAP_REQUEST_LIMIT_REACHED');
  const accounts = admitted.accounts, outcomes = [], zones = []; let attempts = 0, checked = 0, responses_received = 0;
  for (const account of accounts.slice(0, http_limit)) {
    if (now() >= deadline) { outcomes.push({account_ref: account.account_ref, status: 'TIMEOUT', reason: 'SOURCE_DEADLINE_EXPIRED'}); break; }
    const json_body = {type: 'clearinghouseState', user: account.address};
    if (route.dex !== undefined) json_body.dex = route.dex;
    if (new TextEncoder().encode(JSON.stringify(json_body)).length > 4096) fail('HYPERLIQUID_POST_BODY_LIMIT');
    let response;
    try {
      attempts++;
      response = await request({provider: 'HYPERLIQUID', family: 'LIQUIDATIONS', url: HYPERLIQUID_INFO_URL, method: 'POST', json_body});
      responses_received++;
      if (now() >= deadline) fail('SOURCE_DEADLINE_EXPIRED');
      const result = normalizeHyperliquidAccount(response.data, {route, instrument, account_ref: account.account_ref,
        received_ts: response.received_ts, now: now(), profile, receipt_id: response.receipt_id, reference_price});
      checked++; zones.push(...result.zones);
      outcomes.push({account_ref: account.account_ref, status: result.status, reason: result.reason,
        evidence_ref: response.receipt_id, coverage: result.coverage});
    } catch (error) {
      const code = codeOf(error), status = /DEADLINE|TIMEOUT/.test(code) ? 'TIMEOUT' : budgetFailure(code) ? 'NOT_CHECKED_BUDGET' : 'ERROR';
      outcomes.push({account_ref: account.account_ref, status, reason: code, evidence_ref: response?.receipt_id ?? error.receipt_id ?? null});
      if (status === 'TIMEOUT' || status === 'NOT_CHECKED_BUDGET') break;
    }
  }
  const usable = zones.filter(z => z.usable).length;
  const status = usable || zones.length ? (usable ? 'PARTIAL' : outcomes.every(x => x.status === 'STALE') ? 'STALE' : outcomes.some(x => x.status === 'ERROR') ? 'ERROR' : 'PARTIAL')
    : outcomes.find(x => ['NOT_CHECKED_BUDGET', 'TIMEOUT', 'ERROR', 'PARTIAL', 'STALE'].includes(x.status))?.status ?? 'ABSENT';
  return {status, reason: usable ? 'OBSERVED_ACCOUNTS_SUBSET_ONLY' : outcomes.find(x => x.reason)?.reason ?? 'NO_TARGET_POSITION_IN_OBSERVED_ACCOUNTS',
    zones, checked_sources: responses_received || outcomes.some(x => x.status === 'ERROR') ? ['HYPERLIQUID'] : [],
    coverage: {...base, admitted_accounts: accounts.length, attempted_accounts: attempts, checked_accounts: checked,
      unchecked_accounts: accounts.length - checked, request_limit: http_limit, source_responses: outcomes,
      responses_received, response_checked: responses_received > 0, usable_zones: usable, returned_zones: zones.length, accounts_complete: checked === accounts.length,
      no_qualified_zones_is_not_market_absence: true}};
}
