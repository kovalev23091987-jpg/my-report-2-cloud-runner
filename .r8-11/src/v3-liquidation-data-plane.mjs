export const V3_LIQUIDATION_DATA_PLANE_VERSION = "v3-liquidation-data-plane-shadow-v1";

export const COVERAGE_CLASS = Object.freeze({
  FULL_PROVIDER_DOCUMENTED_ALL: "REALIZED_EVENT_FULL_OR_PROVIDER_DOCUMENTED_ALL",
  PARTIAL_SNAPSHOT: "PARTIAL_SNAPSHOT",
  AGGREGATED_EVENT_FEED: "AGGREGATED_EVENT_FEED",
  SOURCE_UNVERIFIED: "SOURCE_UNVERIFIED",
});

export const IDENTITY_STATUS = Object.freeze({
  CLOSED: "CLOSED",
  CANDIDATE_ALIAS_UNVERIFIED: "CANDIDATE_ALIAS_UNVERIFIED",
  UNRESOLVED: "IDENTITY_UNRESOLVED",
});

const WINDOW_MS = Object.freeze({
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
});

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function txt(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function nfcUpper(value) {
  return txt(value).normalize("NFC").toUpperCase();
}

function parseHtxUsdtContract(contract) {
  const exact = txt(contract).normalize("NFC");
  const m = exact.match(/^(.+)-USDT$/u);
  if (!m || !m[1]) return { ok: false, contract: exact || null, base: null, quote: null };
  return { ok: true, contract: exact, base: m[1], quote: "USDT" };
}

function ascii(value) {
  return /^[\x20-\x7e]+$/.test(String(value || ""));
}

export function expectedVenueSymbol(htxContract, venue) {
  const p = parseHtxUsdtContract(htxContract);
  if (!p.ok || !ascii(p.base)) return null;
  const base = nfcUpper(p.base);
  switch (nfcUpper(venue)) {
    case "HTX": return `${base}-USDT`;
    case "BINANCE": return `${base}USDT`;
    case "BYBIT": return `${base}USDT`;
    case "OKX": return `${base}-USDT-SWAP`;
    case "GATE": return `${base}_USDT`;
    default: return null;
  }
}

export function buildVenueIdentity({ htx_contract, venue, venue_symbol, verified = false, product = "PERP", settle = "USDT", multiplier = null } = {}) {
  const htx = parseHtxUsdtContract(htx_contract);
  const expected = expectedVenueSymbol(htx_contract, venue);
  const actual = txt(venue_symbol).normalize("NFC");
  const venueName = nfcUpper(venue);
  const productOk = ["PERP", "SWAP", "FUTURES"].includes(nfcUpper(product));
  const settleOk = nfcUpper(settle) === "USDT";
  const symbolMatches = Boolean(expected && actual && nfcUpper(expected) === nfcUpper(actual));
  const closed = Boolean(htx.ok && expected && symbolMatches && productOk && settleOk && verified === true);
  return {
    htx_contract: htx.contract,
    normalized_base: htx.base ? nfcUpper(htx.base) : null,
    quote: htx.quote,
    venue: venueName || null,
    expected_venue_symbol: expected,
    venue_symbol: actual || null,
    symbol_matches_candidate: symbolMatches,
    product: nfcUpper(product) || null,
    settle: nfcUpper(settle) || null,
    multiplier: finite(multiplier),
    identity_status: closed
      ? IDENTITY_STATUS.CLOSED
      : (htx.ok && expected && symbolMatches ? IDENTITY_STATUS.CANDIDATE_ALIAS_UNVERIFIED : IDENTITY_STATUS.UNRESOLVED),
    verified: closed,
  };
}

function deterministicId(parts) {
  return parts.map(v => txt(v) || "_").join(":");
}

function eventResult({ status, coverage_class, aggregation_window = null, events = [], errors = [], source_semantics = null } = {}) {
  return {
    version: V3_LIQUIDATION_DATA_PLANE_VERSION,
    status,
    coverage_class,
    aggregation_window,
    events,
    errors,
    source_semantics,
    shadow_only: true,
  };
}

function baseEvent({ venue, contract, identity, ts_exchange, ts_received, side_raw, liquidated_side, price, price_semantics, qty_raw, qty_unit, notional, source_event_id, aggregation_window, coverage_class, raw_source_ref } = {}) {
  return {
    venue: nfcUpper(venue) || null,
    contract: txt(contract) || null,
    normalized_base: identity?.normalized_base ?? null,
    ts_exchange: finite(ts_exchange),
    ts_received: finite(ts_received),
    side_raw: side_raw === null || side_raw === undefined ? null : String(side_raw),
    liquidated_side_normalized: ["LONG", "SHORT"].includes(liquidated_side) ? liquidated_side : "UNKNOWN",
    price_raw: finite(price),
    price_semantics: txt(price_semantics) || "UNKNOWN",
    qty_raw: finite(qty_raw),
    qty_unit: txt(qty_unit) || "UNKNOWN",
    notional_usdt_normalized: finite(notional),
    leverage_if_factual: null,
    source_event_id: txt(source_event_id) || null,
    aggregation_window: txt(aggregation_window) || null,
    source_coverage_class: coverage_class,
    raw_source_ref: txt(raw_source_ref) || null,
    identity_status: identity?.identity_status ?? IDENTITY_STATUS.UNRESOLVED,
    shadow_only: true,
  };
}

function unwrapCombined(message) {
  if (message && typeof message === "object" && message.data && message.stream) return message.data;
  return message;
}

export function parseBybitAllLiquidation(message, { identity, received_ts = Date.now() } = {}) {
  if (identity?.venue !== "BYBIT" || identity?.identity_status !== IDENTITY_STATUS.CLOSED) {
    return eventResult({ status: "IDENTITY_UNRESOLVED", coverage_class: COVERAGE_CLASS.SOURCE_UNVERIFIED, errors: ["BYBIT_IDENTITY_NOT_CLOSED"] });
  }
  const msg = unwrapCombined(message) || {};
  if (!String(msg?.topic || "").startsWith("allLiquidation.") || msg?.type !== "snapshot" || !Array.isArray(msg?.data)) {
    return eventResult({ status: "SOURCE_SCHEMA_UNVERIFIED", coverage_class: COVERAGE_CLASS.SOURCE_UNVERIFIED, errors: ["BYBIT_ALL_LIQ_SCHEMA_MISMATCH"] });
  }
  const events = [];
  const errors = [];
  for (const row of msg.data) {
    const symbol = txt(row?.s);
    if (nfcUpper(symbol) !== nfcUpper(identity.venue_symbol)) {
      errors.push(`SYMBOL_MISMATCH:${symbol || "MISSING"}`);
      continue;
    }
    const side = txt(row?.S);
    const liquidatedSide = side === "Buy" ? "LONG" : side === "Sell" ? "SHORT" : "UNKNOWN";
    const qty = finite(row?.v);
    const price = finite(row?.p);
    const ts = finite(row?.T);
    const notional = qty !== null && price !== null ? Math.abs(qty) * price : null;
    events.push(baseEvent({
      venue: "BYBIT",
      contract: identity.htx_contract,
      identity,
      ts_exchange: ts,
      ts_received: received_ts,
      side_raw: side || null,
      liquidated_side: liquidatedSide,
      price,
      price_semantics: "BANKRUPTCY_PRICE",
      qty_raw: qty,
      qty_unit: "BASE_ASSET_QUANTITY",
      notional,
      source_event_id: deterministicId(["BYBIT", symbol, ts, side, qty, price]),
      aggregation_window: "500ms provider push cadence",
      coverage_class: COVERAGE_CLASS.FULL_PROVIDER_DOCUMENTED_ALL,
      raw_source_ref: "Bybit V5 public allLiquidation",
    }));
  }
  return eventResult({
    status: errors.length && !events.length ? "PARTIAL_FAIL_CLOSED" : "CLOSED",
    coverage_class: COVERAGE_CLASS.FULL_PROVIDER_DOCUMENTED_ALL,
    aggregation_window: "500ms provider push cadence",
    events,
    errors,
    source_semantics: "S=Buy => LONG liquidated; S=Sell => SHORT liquidated; p=bankruptcy price",
  });
}

export function parseGatePublicLiquidates(message, { identity, received_ts = Date.now(), quanto_multiplier = null } = {}) {
  if (identity?.venue !== "GATE" || identity?.identity_status !== IDENTITY_STATUS.CLOSED) {
    return eventResult({ status: "IDENTITY_UNRESOLVED", coverage_class: COVERAGE_CLASS.SOURCE_UNVERIFIED, errors: ["GATE_IDENTITY_NOT_CLOSED"] });
  }
  const msg = unwrapCombined(message) || {};
  if (msg?.channel !== "futures.public_liquidates" || msg?.event !== "update" || !Array.isArray(msg?.result)) {
    return eventResult({ status: "SOURCE_SCHEMA_UNVERIFIED", coverage_class: COVERAGE_CLASS.SOURCE_UNVERIFIED, errors: ["GATE_PUBLIC_LIQ_SCHEMA_MISMATCH"] });
  }
  const multiplier = finite(quanto_multiplier ?? identity?.multiplier);
  const events = [];
  const errors = [];
  for (const row of msg.result) {
    const symbol = txt(row?.contract);
    if (nfcUpper(symbol) !== nfcUpper(identity.venue_symbol)) {
      errors.push(`SYMBOL_MISMATCH:${symbol || "MISSING"}`);
      continue;
    }
    const size = finite(row?.size);
    const price = finite(row?.price);
    const ts = finite(row?.time);
    const liquidatedSide = size === null || size === 0 ? "UNKNOWN" : size < 0 ? "LONG" : "SHORT";
    const notional = size !== null && price !== null && multiplier !== null && multiplier > 0
      ? Math.abs(size) * multiplier * price
      : null;
    events.push(baseEvent({
      venue: "GATE",
      contract: identity.htx_contract,
      identity,
      ts_exchange: ts,
      ts_received: received_ts,
      side_raw: size === null ? null : String(size),
      liquidated_side: liquidatedSide,
      price,
      price_semantics: "ORDER_PRICE",
      qty_raw: size,
      qty_unit: "CONTRACTS",
      notional,
      source_event_id: deterministicId(["GATE", symbol, ts, size, price]),
      aggregation_window: "1s default; batched earlier when per-contract buffer reaches 20",
      coverage_class: COVERAGE_CLASS.AGGREGATED_EVENT_FEED,
      raw_source_ref: "Gate futures.public_liquidates",
    }));
  }
  return eventResult({
    status: errors.length && !events.length ? "PARTIAL_FAIL_CLOSED" : "CLOSED",
    coverage_class: COVERAGE_CLASS.AGGREGATED_EVENT_FEED,
    aggregation_window: "1s default; batched earlier at provider buffer 20",
    events,
    errors,
    source_semantics: "Provider batches all liquidation orders of one contract in aggregation period. Negative liquidate order size is sell => LONG liquidation; positive is buy => SHORT liquidation. Notional requires factual contract multiplier.",
  });
}

export function parseBinanceUsdmForceOrder(message, { identity, received_ts = Date.now() } = {}) {
  if (identity?.venue !== "BINANCE" || identity?.identity_status !== IDENTITY_STATUS.CLOSED) {
    return eventResult({ status: "IDENTITY_UNRESOLVED", coverage_class: COVERAGE_CLASS.SOURCE_UNVERIFIED, errors: ["BINANCE_IDENTITY_NOT_CLOSED"] });
  }
  const msg = unwrapCombined(message) || {};
  const order = msg?.o;
  if (msg?.e !== "forceOrder" || !order || typeof order !== "object") {
    return eventResult({ status: "SOURCE_SCHEMA_UNVERIFIED", coverage_class: COVERAGE_CLASS.SOURCE_UNVERIFIED, errors: ["BINANCE_FORCE_ORDER_SCHEMA_MISMATCH"] });
  }
  const symbol = txt(order?.s);
  if (nfcUpper(symbol) !== nfcUpper(identity.venue_symbol)) {
    return eventResult({ status: "IDENTITY_UNRESOLVED", coverage_class: COVERAGE_CLASS.PARTIAL_SNAPSHOT, errors: [`SYMBOL_MISMATCH:${symbol || "MISSING"}`] });
  }
  const side = nfcUpper(order?.S);
  const liquidatedSide = side === "SELL" ? "LONG" : side === "BUY" ? "SHORT" : "UNKNOWN";
  const qty = finite(order?.q ?? order?.z);
  const price = finite(order?.ap ?? order?.p);
  const ts = finite(order?.T ?? msg?.E);
  const notional = qty !== null && price !== null ? Math.abs(qty) * price : null;
  const event = baseEvent({
    venue: "BINANCE",
    contract: identity.htx_contract,
    identity,
    ts_exchange: ts,
    ts_received: received_ts,
    side_raw: side || null,
    liquidated_side: liquidatedSide,
    price,
    price_semantics: order?.ap !== undefined ? "AVERAGE_EXECUTION_PRICE" : "ORDER_PRICE",
    qty_raw: qty,
    qty_unit: "BASE_ASSET_QUANTITY",
    notional,
    source_event_id: deterministicId(["BINANCE", symbol, ts, side, qty, price]),
    aggregation_window: "~1000ms representative largest liquidation order per symbol (2026 semantics)",
    coverage_class: COVERAGE_CLASS.PARTIAL_SNAPSHOT,
    raw_source_ref: "Binance USD-M forceOrder public stream",
  });
  return eventResult({
    status: "CLOSED_PARTIAL_COVERAGE",
    coverage_class: COVERAGE_CLASS.PARTIAL_SNAPSHOT,
    aggregation_window: "~1000ms representative largest liquidation order per symbol",
    events: [event],
    source_semantics: "Partial representative stream; missing events are UNKNOWN, never zero. Order side SELL closes liquidated LONG; BUY closes liquidated SHORT.",
  });
}

export function normalizeHtxLiquidationTapeEvent(row, { identity, received_ts = Date.now() } = {}) {
  if (identity?.venue !== "HTX" || identity?.identity_status !== IDENTITY_STATUS.CLOSED) {
    return eventResult({ status: "IDENTITY_UNRESOLVED", coverage_class: COVERAGE_CLASS.SOURCE_UNVERIFIED, errors: ["HTX_IDENTITY_NOT_CLOSED"] });
  }
  if (!row || typeof row !== "object") return eventResult({ status: "SOURCE_SCHEMA_UNVERIFIED", coverage_class: COVERAGE_CLASS.SOURCE_UNVERIFIED, errors: ["HTX_EVENT_MISSING"] });
  const contract = txt(row.contract_code ?? row.contract);
  if (nfcUpper(contract) !== nfcUpper(identity.venue_symbol)) {
    return eventResult({ status: "IDENTITY_UNRESOLVED", coverage_class: COVERAGE_CLASS.SOURCE_UNVERIFIED, errors: [`SYMBOL_MISMATCH:${contract || "MISSING"}`] });
  }
  const raw = txt(row.side);
  const liquidatedSide = raw === "LONG_LIQUIDATED" ? "LONG" : raw === "SHORT_LIQUIDATED" ? "SHORT" : "UNKNOWN";
  const price = finite(row.price);
  const notional = finite(row.notional_usdt);
  const event = baseEvent({
    venue: "HTX",
    contract: identity.htx_contract,
    identity,
    ts_exchange: finite(row.created_at),
    ts_received: received_ts,
    side_raw: raw || null,
    liquidated_side: liquidatedSide,
    price,
    price_semantics: "ORDER_OR_EXECUTION_PRICE_PER_HTX_ENDPOINT",
    qty_raw: finite(row.volume_contracts ?? row.amount_base),
    qty_unit: row.amount_base !== undefined && row.amount_base !== null ? "BASE_ASSET_QUANTITY" : "CONTRACTS",
    notional,
    source_event_id: txt(row.event_id) || deterministicId(["HTX", contract, row.created_at, raw, price, notional]),
    aggregation_window: "REST endpoint observation",
    coverage_class: COVERAGE_CLASS.PARTIAL_SNAPSHOT,
    raw_source_ref: txt(row.source) || "HTX official public liquidation REST",
  });
  return eventResult({ status: "CLOSED_PARTIAL_COVERAGE", coverage_class: COVERAGE_CLASS.PARTIAL_SNAPSHOT, aggregation_window: "REST endpoint observation", events: [event], source_semantics: "Uses existing HTX factual endpoint normalization; endpoint coverage must be carried separately." });
}

export function okxLiquidationAdapterStatus() {
  return eventResult({
    status: "SOURCE_UNVERIFIED_CURRENT_CHANNEL",
    coverage_class: COVERAGE_CLASS.SOURCE_UNVERIFIED,
    events: [],
    errors: ["OKX_CURRENT_PUBLIC_LIQUIDATION_CHANNEL_SEMANTICS_NOT_CLOSED"],
    source_semantics: "Historical liquidation REST is not treated as available. No directional evidence until current public channel is independently verified.",
  });
}

export function dedupeNormalizedEvents(events) {
  const out = [];
  const seen = new Set();
  for (const event of Array.isArray(events) ? events : []) {
    const key = `${event?.venue || "_"}:${event?.source_event_id || "_"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}


function contextRows(series,start,now){return (Array.isArray(series)?series:[]).filter(r=>{const ts=finite(r?.ts);return ts!==null&&ts>start&&ts<=now;}).sort((a,b)=>a.ts-b.ts);}
function contextPct(series,field,start,now){const rows=(Array.isArray(series)?series:[]).filter(r=>{const ts=finite(r?.ts);return ts!==null&&ts<=now&&finite(r?.[field])!==null;}).sort((a,b)=>a.ts-b.ts);if(rows.length<2)return null;let base=null,current=null;for(const r of rows){if(r.ts<=start)base=r;if(r.ts<=now)current=r;}if(!base)base=rows.find(r=>r.ts>start)||null;if(!base||!current||base===current)return null;const a=finite(base[field]),b=finite(current[field]);return a!==null&&b!==null&&a!==0?100*(b/a-1):null;}
function longestConsecutiveMinuteBuckets(rows){const xs=[...new Set(rows.map(r=>Math.floor(Number(r.ts_exchange)/60000)).filter(Number.isFinite))].sort((a,b)=>a-b);let best=0,cur=0,prior=null;for(const x of xs){cur=prior!==null&&x===prior+1?cur+1:1;best=Math.max(best,cur);prior=x;}return best;}
function flowResponse(series,start,now){const rows=contextRows(series,start,now);if(!rows.length||rows.some(r=>r.coverage_closed!==true||finite(r.delta)===null))return null;return rows.reduce((sum,r)=>sum+finite(r.delta),0);}
function volumeTotal(series,start,now){const rows=contextRows(series,start,now);if(!rows.length||rows.some(r=>r.coverage_closed!==true||finite(r.notional_usdt)===null))return null;return rows.reduce((sum,r)=>sum+finite(r.notional_usdt),0);}

function aggregateOne(events, now, windowName, marketContext = {}) {
  const width = WINDOW_MS[windowName];
  const start = now - width;
  const rows = dedupeNormalizedEvents(events).filter(e => finite(e?.ts_exchange) !== null && e.ts_exchange > start && e.ts_exchange <= now);
  const knownSide = rows.filter(e => ["LONG", "SHORT"].includes(e?.liquidated_side_normalized));
  const knownNotional = rows.filter(e => finite(e?.notional_usdt_normalized) !== null);
  const longRows = knownSide.filter(e => e.liquidated_side_normalized === "LONG");
  const shortRows = knownSide.filter(e => e.liquidated_side_normalized === "SHORT");
  const sideClosed = knownSide.length === rows.length;
  const notionalClosed = knownNotional.length === rows.length;
  const sumN = arr => arr.reduce((s, e) => s + (finite(e?.notional_usdt_normalized) ?? 0), 0);
  const venues = [...new Set(rows.map(e => e.venue).filter(Boolean))].sort();
  const coverage = [...new Set(rows.map(e => e.source_coverage_class).filter(Boolean))].sort();
  const totalsByVenue = new Map();
  for (const e of rows) totalsByVenue.set(e.venue, (totalsByVenue.get(e.venue) || 0) + (finite(e.notional_usdt_normalized) ?? 0));
  const totalKnownNotional = sumN(knownNotional);
  const venueConcentration = totalKnownNotional > 0 && totalsByVenue.size
    ? Math.max(...totalsByVenue.values()) / totalKnownNotional
    : null;
  const maxEvent = knownNotional.length ? Math.max(...knownNotional.map(e => e.notional_usdt_normalized)) : null;
  const minutes=Math.max(1,width/60000),mid=start+width/2;
  const older=rows.filter(e=>e.ts_exchange<=mid),recent=rows.filter(e=>e.ts_exchange>mid),halfMinutes=Math.max(0.5,minutes/2);
  const burstVelocity=rows.length/minutes,recentRate=recent.length/halfMinutes,olderRate=older.length/halfMinutes;
  const volume=volumeTotal(marketContext.volume_series,start,now);
  const flow=flowResponse(marketContext.flow_series,start,now);
  return {
    window: windowName,
    start_ts: start,
    end_ts: now,
    event_count_observed: rows.length,
    known_side_count: knownSide.length,
    unknown_side_count: rows.length - knownSide.length,
    long_liquidation_count: sideClosed ? longRows.length : null,
    short_liquidation_count: sideClosed ? shortRows.length : null,
    known_long_liquidation_count: longRows.length,
    known_short_liquidation_count: shortRows.length,
    total_notional_usdt: notionalClosed ? sumN(rows) : null,
    known_notional_usdt: totalKnownNotional,
    long_notional_usdt: sideClosed && notionalClosed ? sumN(longRows) : null,
    short_notional_usdt: sideClosed && notionalClosed ? sumN(shortRows) : null,
    max_single_event_usdt: maxEvent,
    liquidation_side_imbalance: sideClosed && notionalClosed && totalKnownNotional > 0
      ? (sumN(longRows) - sumN(shortRows)) / totalKnownNotional
      : null,
    venue_breadth: venues.length,
    venues,
    venue_concentration: venueConcentration,
    burst_velocity_events_per_min: burstVelocity,
    burst_acceleration_events_per_min: recentRate-olderRate,
    consecutive_burst_minutes: longestConsecutiveMinuteBuckets(rows),
    liquidation_to_volume_ratio: notionalClosed && volume!==null && volume>0 ? totalKnownNotional/volume : null,
    price_response_pct: contextPct(marketContext.price_series,'price',start,now),
    oi_response_pct: contextPct(marketContext.oi_series,'oi',start,now),
    flow_response_delta_usdt: flow,
    coverage_classes: coverage,
    side_coverage_closed: sideClosed,
    notional_coverage_closed: notionalClosed,
    missing_is_zero: false,
  };
}

export function aggregateRealizedLiquidations(events, { now_ts = Date.now(), windows = Object.keys(WINDOW_MS), market_context = {} } = {}) {
  const now = finite(now_ts) ?? Date.now();
  const normalizedWindows = windows.filter(w => WINDOW_MS[w]);
  return {
    version: V3_LIQUIDATION_DATA_PLANE_VERSION,
    type: "REALIZED_LIQUIDATION_AGGREGATION",
    as_of_ts: now,
    windows: Object.fromEntries(normalizedWindows.map(w => [w, aggregateOne(events, now, w, market_context)])),
    projected_provider_map_included: false,
    modelled_proxy_included: false,
    shadow_only: true,
  };
}

export function buildRealizedDensityMap(events, { now_ts = Date.now(), lookback_ms = WINDOW_MS["24h"], bucket_size_pct = 0.25, reference_price = null } = {}) {
  const now = finite(now_ts) ?? Date.now();
  const ref = finite(reference_price);
  const widthPct = finite(bucket_size_pct);
  if (ref === null || ref <= 0 || widthPct === null || widthPct <= 0) {
    return { status: "NOT_CLOSED", reason: "REFERENCE_PRICE_OR_BUCKET_INVALID", type: "REALIZED_DENSITY_MAP", buckets: [], future_heatmap: false };
  }
  const bucketAbs = ref * widthPct / 100;
  const rows = dedupeNormalizedEvents(events).filter(e => {
    const ts = finite(e?.ts_exchange); const p = finite(e?.price_raw);
    return ts !== null && p !== null && ts > now - lookback_ms && ts <= now;
  });
  const map = new Map();
  for (const e of rows) {
    const index = Math.round(e.price_raw / bucketAbs);
    const center = index * bucketAbs;
    const key = `${e.venue}:${e.liquidated_side_normalized}:${index}`;
    const prior = map.get(key) || { venue: e.venue, side: e.liquidated_side_normalized, price_bucket_center: center, count: 0, known_notional_usdt: 0, unknown_notional_count: 0, first_ts: e.ts_exchange, last_ts: e.ts_exchange };
    prior.count += 1;
    if (finite(e.notional_usdt_normalized) !== null) prior.known_notional_usdt += e.notional_usdt_normalized;
    else prior.unknown_notional_count += 1;
    prior.first_ts = Math.min(prior.first_ts, e.ts_exchange);
    prior.last_ts = Math.max(prior.last_ts, e.ts_exchange);
    map.set(key, prior);
  }
  return {
    status: "CLOSED",
    type: "REALIZED_DENSITY_MAP",
    as_of_ts: now,
    lookback_ms,
    bucket_size_pct: widthPct,
    reference_price: ref,
    buckets: [...map.values()].sort((a, b) => b.known_notional_usdt - a.known_notional_usdt || b.count - a.count),
    future_heatmap: false,
    projected_provider_map_included: false,
    modelled_proxy_included: false,
  };
}

export function createCollectorHealth({ venue, expected_symbols = [], now_ts = Date.now() } = {}) {
  const now = finite(now_ts) ?? Date.now();
  return {
    version: V3_LIQUIDATION_DATA_PLANE_VERSION,
    venue: nfcUpper(venue) || null,
    connected: false,
    reconnect_count: 0,
    connected_since_ts: null,
    last_event_ts: null,
    last_received_ts: null,
    event_gap_sec: null,
    venue_latency_ms: null,
    dropped: 0,
    parse_error: 0,
    rate_limit_state: "UNKNOWN",
    expected_symbols: [...new Set(expected_symbols.map(nfcUpper).filter(Boolean))].sort(),
    observed_symbols: [],
    symbol_coverage_pct: null,
    stale_state: "NOT_CONNECTED",
    updated_ts: now,
  };
}

export function collectorConnected(health, { now_ts = Date.now(), reconnect = false } = {}) {
  const now = finite(now_ts) ?? Date.now();
  return { ...health, connected: true, reconnect_count: Number(health?.reconnect_count || 0) + (reconnect ? 1 : 0), connected_since_ts: reconnect || !health?.connected_since_ts ? now : health.connected_since_ts, stale_state: health?.last_event_ts ? health.stale_state : "AWAITING_FIRST_EVENT", updated_ts: now };
}

export function collectorObservedEvent(health, event, { now_ts = Date.now() } = {}) {
  const now = finite(now_ts) ?? Date.now();
  const ts = finite(event?.ts_exchange);
  const observed = new Set(Array.isArray(health?.observed_symbols) ? health.observed_symbols : []);
  if (event?.contract) observed.add(nfcUpper(event.contract));
  const expected = Array.isArray(health?.expected_symbols) ? health.expected_symbols : [];
  const coverage = expected.length ? ([...observed].filter(s => expected.includes(s)).length / expected.length) * 100 : null;
  return {
    ...health,
    connected: true,
    last_event_ts: ts,
    last_received_ts: now,
    event_gap_sec: health?.last_event_ts && ts ? Math.max(0, (ts - health.last_event_ts) / 1000) : null,
    venue_latency_ms: ts ? Math.max(0, now - ts) : null,
    observed_symbols: [...observed].sort(),
    symbol_coverage_pct: coverage,
    stale_state: ts ? "CURRENT_EVENT_RECEIVED" : "EVENT_TIMESTAMP_MISSING",
    updated_ts: now,
  };
}

export function collectorError(health, { parse_error = false, dropped = false, rate_limit_state = null, now_ts = Date.now() } = {}) {
  const now = finite(now_ts) ?? Date.now();
  return {
    ...health,
    parse_error: Number(health?.parse_error || 0) + (parse_error ? 1 : 0),
    dropped: Number(health?.dropped || 0) + (dropped ? 1 : 0),
    rate_limit_state: rate_limit_state ?? health?.rate_limit_state ?? "UNKNOWN",
    updated_ts: now,
  };
}

export function collectorDisconnected(health, { now_ts = Date.now() } = {}) {
  const now = finite(now_ts) ?? Date.now();
  return { ...health, connected: false, stale_state: "DISCONNECTED", updated_ts: now };
}

export function finalizeCollectorHealth(health, { now_ts = Date.now(), stale_after_sec = 5 } = {}) {
  const now = finite(now_ts) ?? Date.now();
  const last = finite(health?.last_received_ts);
  const ageSec = last === null ? null : Math.max(0, (now - last) / 1000);
  let stale = health?.stale_state || "UNKNOWN";
  if (!health?.connected) stale = "DISCONNECTED";
  else if (last === null) stale = "AWAITING_FIRST_EVENT";
  else if (ageSec > stale_after_sec) stale = "STALE";
  else stale = "CURRENT";
  return { ...health, last_received_age_sec: ageSec, stale_state: stale, updated_ts: now };
}

export function modelledLiquidationProxyStatus() {
  return {
    type: "MODELLED_LIQUIDATION_PRESSURE_PROXY",
    status: "NOT_IMPLEMENTED_SHADOW",
    label: "MODELLED_PROXY",
    projected_provider_map: false,
    factual_user_positions: false,
    directional_decision_eligible: false,
    shadow_only: true,
  };
}
