import {object, text, numeric, positive, timestamp, proof, fail} from './bingx.mjs';

export function verifiedSwoleRoute(route, instrument) {
  return object(route) && route.provider === 'SWOLECHARTS' && route.asset_id === instrument.asset_id
    && text(route.identity_evidence_ref) && text(route.model_evidence_ref)
    && /^[A-Z0-9]{1,32}$/.test(route.symbol ?? '') && text(route.venue) && text(route.market_id)
    && ['USD', 'USDT', 'USDC'].includes(route.price_quote);
}

export function normalizeSwoleMap(payload, {route, instrument, received_ts, now, profile, receipt_id}) {
  if (!verifiedSwoleRoute(route, instrument)) fail('LIQUIDATION_ASSET_MAPPING_UNQUALIFIED');
  if (!object(payload) || payload.coin !== route.symbol) fail('SWOLE_EXACT_ASSET_MODEL_REQUIRED');
  if (payload.has_data === false) return {status: 'ABSENT', reason: 'SOURCE_REPORTS_NO_MAP', zones: [],
    checked_sources: ['SWOLECHARTS'], coverage: {scope: route.coverage ?? null, support_permanently_absent: false}};
  if (payload.estimated !== true || !text(payload.model_version)) fail('SWOLE_EXACT_ASSET_MODEL_REQUIRED');
  const event_ts = timestamp(payload.as_of);
  if (event_ts === null) fail('LIQUIDATION_SOURCE_CLOCK_MISSING');
  if (event_ts > received_ts || event_ts > now) fail('LIQUIDATION_SOURCE_CLOCK_FUTURE');
  const expires_ts = event_ts + profile.freshness_ms.model_map;
  if (expires_ts < now) return {status: 'STALE', reason: 'LIQUIDATION_MODEL_STALE', zones: [],
    checked_sources: ['SWOLECHARTS'], coverage: {source_ts: event_ts, scope: route.coverage ?? null}};
  if (payload.has_data !== true || !object(payload.levels)) fail('SWOLE_MAP_SHAPE_REQUIRED');
  const mapping = route.price_mapping;
  const mapping_event_ts = timestamp(mapping?.event_ts), mapping_expires_ts = timestamp(mapping?.expires_ts);
  const mappingKnown = proof(mapping) && positive(mapping.multiplier_to_bingx) !== null
    && mapping.from_quote === route.price_quote && mapping.to_quote === 'USDT'
    && mapping.from_market_id === route.market_id && mapping.to_instrument_id === instrument.instrument_id
    && mapping_event_ts !== null && mapping_event_ts <= now && mapping_event_ts <= received_ts
    && now - mapping_event_ts <= profile.freshness_ms.price
    && mapping_expires_ts !== null && mapping_expires_ts >= now;
  // A mapped zone cannot outlive its original model or the price conversion.
  const zone_expires_ts = mappingKnown
    ? Math.min(expires_ts, mapping_expires_ts, mapping_event_ts + profile.freshness_ms.price) : expires_ts;
  const magnitude = route.magnitude;
  // A field called "usd" is not independent evidence of dollar notional.
  const scaleKnown = proof(magnitude) && magnitude.kind === 'RELATIVE' && text(magnitude.scale_id)
    && ['intensity', 'usd', 'strength'].includes(magnitude.field);
  const sourcePrice = positive(payload.price), zones = [], sides = []; let rejected = 0;
  for (const [side, key] of [['LONG', 'long'], ['SHORT', 'short']]) {
    const rows = payload.levels[key];
    if (rows === undefined || rows === null) continue;
    if (!Array.isArray(rows) || rows.length > 1000) fail('SWOLE_BOUNDED_ZONE_ARRAY_REQUIRED');
    sides.push(side);
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index], lower = positive(row?.lo), upper = positive(row?.hi), mid = positive(row?.mid);
      const limitations = [];
      if (lower === null || upper === null || mid === null || lower > mid || mid > upper) { rejected++; continue; }
      if (sourcePrice === null || side === 'LONG' && upper >= sourcePrice || side === 'SHORT' && lower <= sourcePrice) limitations.push('ZONE_SIDE_OR_REFERENCE_PRICE_UNQUALIFIED');
      if (!mappingKnown) limitations.push('CROSS_VENUE_PRICE_MAPPING_UNQUALIFIED', 'NOT_FOR_EXACT_BINGX_ORDERS');
      if (!scaleKnown) limitations.push('MODEL_MAGNITUDE_SCALE_UNQUALIFIED');
      const intensity = scaleKnown ? numeric(row[magnitude.field]) : null;
      if (scaleKnown && (intensity === null || intensity < 0)) limitations.push('MODEL_MAGNITUDE_INVALID');
      const factor = mappingKnown ? Number(mapping.multiplier_to_bingx) : 1;
      if (![lower * factor, upper * factor].every(Number.isFinite)) fail('LIQUIDATION_PRICE_OVERFLOW');
      zones.push({zone_id: `SWOLE:${instrument.asset_id}:${payload.model_version}:${event_ts}:${side}:${lower}:${upper}`,
        asset_id: instrument.asset_id, source: 'SWOLECHARTS', primary_provider: route.primary_provider ?? 'SWOLECHARTS',
        venue: route.venue, market_id: route.market_id, lower: lower * factor, upper: upper * factor,
        price_quote: mappingKnown ? 'USDT' : route.price_quote, native_lower: lower, native_upper: upper, native_price_quote: route.price_quote,
        price_currency: mappingKnown ? 'USDT' : route.price_quote, model_id: route.model_id ?? 'SWOLECHARTS_LIQUIDATION_HEATMAP', model_version: payload.model_version,
        price_comparability: {status: mappingKnown ? 'VERIFIED' : 'UNKNOWN', evidence_ref: mappingKnown ? mapping.evidence_ref : null,
          from_market_id: route.market_id, to_instrument_id: instrument.instrument_id, from_currency: route.price_quote,
          to_currency: 'USDT', multiplier: mappingKnown ? Number(mapping.multiplier_to_bingx) : null,
          event_ts: mappingKnown ? mapping_event_ts : null,
          expires_ts: mappingKnown ? mapping_expires_ts : null},
        event_ts, received_ts, expires_ts: zone_expires_ts, native_expires_ts: expires_ts, basis_type: 'EXTERNAL_MODEL',
        magnitude_value: intensity, magnitude_unit: scaleKnown ? 'RELATIVE_INTENSITY' : null,
        relative_scale: scaleKnown ? {scale_id: magnitude.scale_id, model_version: payload.model_version, source_field: magnitude.field, evidence_ref: magnitude.evidence_ref} : null,
        coverage: route.coverage ?? {scope: 'PROVIDER_RETURNED_BINS_ONLY', range: payload.range ?? null},
        limitations, position_ids: [], overlap_group: route.overlap_group ?? `SWOLECHARTS:${payload.model_version}`,
        usable: limitations.length === 0, bingx_order_eligible: limitations.length === 0,
        evidence_ref: receipt_id, identity_evidence_ref: route.identity_evidence_ref,
        model_evidence_ref: route.model_evidence_ref, price_mapping_evidence_ref: mappingKnown ? mapping.evidence_ref : null,
        liquidated_side: side});
    }
  }
  const usable = zones.filter(zone => zone.usable).length;
  return {status: usable ? (usable === zones.length && sides.length === 2 && rejected === 0 ? 'USABLE' : 'PARTIAL') : 'ABSENT',
    reason: usable ? (sides.length < 2 ? 'ONE_SIDED_PROVIDER_MAP' : usable < zones.length ? 'SOME_ZONES_UNQUALIFIED' : null)
      : zones.length ? 'NO_QUALIFIED_MODEL_ZONES' : 'SOURCE_RETURNED_NO_ZONES',
    zones, checked_sources: ['SWOLECHARTS'], coverage: {source_ts: event_ts, available_sides: sides,
      returned_zones: zones.length, rejected_invalid_boundaries: rejected, usable_zones: usable, scope: route.coverage ?? null, source_market_coverage_complete: false}};
}
