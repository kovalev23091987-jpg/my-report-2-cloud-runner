import {
  buildVenueIdentity,
  parseBybitAllLiquidation,
  parseGatePublicLiquidates,
  parseBinanceUsdmForceOrder,
} from './v3-liquidation-data-plane.mjs';

export const V3_COLLECTOR_VERSION = 'v3-free-first-liquidation-collector-shadow-v1';

export const COLLECTOR_SOURCE = Object.freeze({
  BYBIT: {
    venue: 'BYBIT',
    url: 'wss://stream.bybit.com/v5/public/linear',
    transport: 'WS',
    documented_coverage: 'REALIZED_EVENT_FULL_OR_PROVIDER_DOCUMENTED_ALL',
    server_push_cadence_ms: 500,
    client_headers_required: false,
    production_enabled: false,
  },
  GATE: {
    venue: 'GATE',
    url: 'wss://fx-ws.gateio.ws/v4/ws/usdt',
    transport: 'WS',
    documented_coverage: 'AGGREGATED_EVENT_FEED',
    server_push_cadence_ms: 1000,
    client_headers_required: true,
    required_header: { name: 'X-Gate-Size-Decimal', value: '1' },
    production_enabled: false,
  },
  BINANCE: {
    venue: 'BINANCE',
    // Official USD-M 2026 routing: liquidations are a MARKET stream.
    // Connect to /market/stream and subscribe with JSON SUBSCRIBE params.
    url: 'wss://fstream.binance.com/market/stream',
    route_status: 'CLOSED_OFFICIAL_USDM_MARKET_ROUTE_2026',
    transport: 'WS',
    documented_coverage: 'PARTIAL_SNAPSHOT',
    coverage_semantics: 'LARGEST_LIQUIDATION_ORDER_PER_SYMBOL_PER_APPROX_1000MS_WINDOW',
    server_push_cadence_ms: 1000,
    max_connection_age_ms: 24 * 60 * 60 * 1000,
    production_enabled: false,
  },
});

function text(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}
function finite(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function int(v) {
  const n = finite(v);
  return n !== null && Number.isSafeInteger(n) ? n : null;
}
function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}
function pctl(values, p) {
  const a = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * Math.min(1, Math.max(0, Number(p)));
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

export function buildCollectorPlan({ venue, htx_contracts = [], identity_by_contract = {}, websocket_header_capable = false, source_url_override = null } = {}) {
  const key = text(venue).toUpperCase();
  const cfg = COLLECTOR_SOURCE[key];
  if (!cfg) return { status: 'SOURCE_UNSUPPORTED', version: V3_COLLECTOR_VERSION, venue: key || null, production_enabled: false };

  const url = text(source_url_override) || text(cfg.url) || null;
  if (!url) return {
    version: V3_COLLECTOR_VERSION,
    status: cfg.route_status || 'SOURCE_UNVERIFIED_CURRENT_WS_URL',
    venue: key,
    url: null,
    subscriptions: [],
    blocked: unique(htx_contracts).map((contract)=>({contract,reason:'SOURCE_URL_UNVERIFIED'})),
    coverage_class: cfg.documented_coverage,
    production_enabled: false,
    shadow_only: true,
  };

  const contracts = unique(htx_contracts);
  const subscriptions = [];
  const blocked = [];

  for (const contract of contracts) {
    const supplied = identity_by_contract?.[contract] ?? null;
    const identity = supplied || buildVenueIdentity({ htx_contract: contract, venue: key, venue_symbol: null, verified: false });
    if (identity?.identity_status !== 'CLOSED') {
      blocked.push({ contract, reason: 'IDENTITY_UNRESOLVED', identity_status: identity?.identity_status ?? null });
      continue;
    }
    if (key === 'BYBIT') subscriptions.push(`allLiquidation.${identity.venue_symbol}`);
    if (key === 'BINANCE') subscriptions.push(`${String(identity.venue_symbol).toLowerCase()}@forceOrder`);
    if (key === 'GATE') subscriptions.push(identity.venue_symbol);
  }

  const gateDecimalClosed = key !== 'GATE' || websocket_header_capable === true;
  return {
    version: V3_COLLECTOR_VERSION,
    status: subscriptions.length ? (blocked.length ? 'PARTIAL' : 'CLOSED') : 'NOT_CLOSED',
    venue: key,
    url,
    transport: cfg.transport,
    subscriptions,
    blocked,
    coverage_class: cfg.documented_coverage,
    server_push_cadence_ms: cfg.server_push_cadence_ms,
    max_connection_age_ms: cfg.max_connection_age_ms ?? null,
    required_header: cfg.required_header ?? null,
    websocket_header_capable: websocket_header_capable === true,
    size_precision_status: gateDecimalClosed ? 'CLOSED' : 'DEGRADED_INTEGER_SIZE_ROUNDING_RISK',
    normalized_notional_allowed: gateDecimalClosed,
    production_enabled: false,
    shadow_only: true,
  };
}

export function buildCollectorSubscribeFrames(plan, { now_s = Math.floor(Date.now() / 1000) } = {}) {
  if (!plan || !Array.isArray(plan.subscriptions) || !plan.subscriptions.length) return [];
  if (plan.venue === 'BYBIT') {
    return [{ op: 'subscribe', args: plan.subscriptions }];
  }
  if (plan.venue === 'GATE') {
    return [{ time: now_s, channel: 'futures.public_liquidates', event: 'subscribe', payload: plan.subscriptions }];
  }
  if (plan.venue === 'BINANCE') {
    // Current Binance routed market endpoint supports websocket control messages.
    return [{ method: 'SUBSCRIBE', params: plan.subscriptions, id: 1 }];
  }
  return [];
}

export function createCollectorHealth({ venue, now_ts = Date.now() } = {}) {
  const now = int(now_ts);
  return {
    version: V3_COLLECTOR_VERSION,
    venue: text(venue).toUpperCase() || null,
    state: 'DISCONNECTED',
    started_ts: now,
    connected_ts: null,
    last_event_ts: null,
    last_received_ts: null,
    last_error: null,
    reconnect_count: 0,
    connection_count: 0,
    message_count: 0,
    normalized_event_count: 0,
    dropped_count: 0,
    parse_error_count: 0,
    schema_error_count: 0,
    identity_error_count: 0,
    rate_limit_count: 0,
    max_event_gap_ms: null,
    latency_samples_ms: [],
    shadow_only: true,
  };
}

export function collectorHealthTransition(health, event = {}) {
  const h = { ...(health || createCollectorHealth({ venue: event?.venue })) };
  const type = text(event?.type).toUpperCase();
  const now = int(event?.now_ts ?? Date.now());
  if (type === 'CONNECTED') {
    h.state = 'CONNECTED';
    h.connected_ts = now;
    h.connection_count = Number(h.connection_count || 0) + 1;
    h.last_error = null;
  } else if (type === 'RECONNECTED') {
    h.state = 'CONNECTED';
    h.connected_ts = now;
    h.connection_count = Number(h.connection_count || 0) + 1;
    h.reconnect_count = Number(h.reconnect_count || 0) + 1;
    h.last_error = null;
  } else if (type === 'MESSAGE') {
    const exchangeTs = int(event?.exchange_ts);
    const previous = int(h.last_event_ts);
    h.message_count = Number(h.message_count || 0) + 1;
    h.last_received_ts = now;
    if (exchangeTs !== null && exchangeTs > 0) {
      if (previous !== null && exchangeTs >= previous) {
        const gap = exchangeTs - previous;
        h.max_event_gap_ms = Math.max(Number(h.max_event_gap_ms || 0), gap);
      }
      h.last_event_ts = Math.max(Number(previous || 0), exchangeTs);
      const latency = now - exchangeTs;
      if (latency >= 0 && latency <= 24 * 60 * 60 * 1000) {
        h.latency_samples_ms = [...(h.latency_samples_ms || []), latency].slice(-256);
      }
    }
    h.normalized_event_count = Number(h.normalized_event_count || 0) + Math.max(0, Number(event?.normalized_events || 0));
    h.dropped_count = Number(h.dropped_count || 0) + Math.max(0, Number(event?.dropped || 0));
    h.parse_error_count = Number(h.parse_error_count || 0) + Math.max(0, Number(event?.parse_errors || 0));
    h.schema_error_count = Number(h.schema_error_count || 0) + Math.max(0, Number(event?.schema_errors || 0));
    h.identity_error_count = Number(h.identity_error_count || 0) + Math.max(0, Number(event?.identity_errors || 0));
  } else if (type === 'ERROR') {
    h.state = 'DEGRADED';
    h.last_error = text(event?.error) || 'UNKNOWN_ERROR';
    h.parse_error_count = Number(h.parse_error_count || 0) + (event?.parse_error ? 1 : 0);
    h.schema_error_count = Number(h.schema_error_count || 0) + (event?.schema_error ? 1 : 0);
    h.identity_error_count = Number(h.identity_error_count || 0) + (event?.identity_error ? 1 : 0);
    h.rate_limit_count = Number(h.rate_limit_count || 0) + (event?.rate_limit ? 1 : 0);
  } else if (type === 'DISCONNECTED') {
    h.state = 'DISCONNECTED';
    h.last_error = text(event?.error) || h.last_error;
  }
  return h;
}

export function assessCollectorHealth(health, {
  now_ts = Date.now(),
  stale_after_ms = 15_000,
  max_parse_error_rate = 0.01,
  max_drop_rate = 0.01,
  require_events = false,
} = {}) {
  const now = int(now_ts);
  if (!health || !health.venue || now === null) return { status: 'NOT_CLOSED', reason: 'HEALTH_INPUT_INVALID' };
  const messages = Number(health.message_count || 0);
  const errors = Number(health.parse_error_count || 0) + Number(health.schema_error_count || 0) + Number(health.identity_error_count || 0);
  const drops = Number(health.dropped_count || 0);
  const lastRecv = int(health.last_received_ts);
  const eventGap = lastRecv === null ? null : Math.max(0, now - lastRecv);
  const errorRate = messages > 0 ? errors / messages : null;
  const dropRate = messages > 0 ? drops / messages : null;
  const latencyP95 = pctl(health.latency_samples_ms, 0.95);
  const reasons = [];
  if (health.state !== 'CONNECTED') reasons.push('COLLECTOR_NOT_CONNECTED');
  if (require_events && messages <= 0) reasons.push('NO_MESSAGES_OBSERVED');
  if (lastRecv !== null && eventGap > stale_after_ms) reasons.push('EVENT_FEED_STALE');
  if (errorRate !== null && errorRate > max_parse_error_rate) reasons.push('PARSE_SCHEMA_IDENTITY_ERROR_RATE_HIGH');
  if (dropRate !== null && dropRate > max_drop_rate) reasons.push('DROP_RATE_HIGH');
  if (Number(health.rate_limit_count || 0) > 0) reasons.push('RATE_LIMIT_OBSERVED');
  return {
    status: reasons.length ? 'DEGRADED' : 'CLOSED',
    reasons,
    venue: health.venue,
    event_gap_ms: eventGap,
    error_rate: errorRate,
    drop_rate: dropRate,
    latency_p95_ms: latencyP95,
    reconnect_count: Number(health.reconnect_count || 0),
    message_count: messages,
    normalized_event_count: Number(health.normalized_event_count || 0),
    shadow_only: true,
  };
}

export function reconnectDelayMs(attempt, { base_ms = 1000, max_ms = 60_000, jitter_fraction = 0 } = {}) {
  const n = Math.max(0, Math.min(20, Math.trunc(Number(attempt) || 0)));
  const base = Math.max(100, Math.trunc(Number(base_ms) || 1000));
  const max = Math.max(base, Math.trunc(Number(max_ms) || 60_000));
  const raw = Math.min(max, base * (2 ** n));
  const jf = Math.max(0, Math.min(0.5, Number(jitter_fraction) || 0));
  // Deterministic by default. Live runtime may provide explicit randomized jitter externally.
  return Math.round(raw * (1 + jf));
}

export function normalizeCollectorMessage({ venue, message, identity, received_ts = Date.now(), gate_multiplier = null, gate_decimal_header_closed = true } = {}) {
  const key = text(venue).toUpperCase();
  let parsed;
  if (key === 'BYBIT') parsed = parseBybitAllLiquidation(message, { identity, received_ts });
  else if (key === 'GATE') parsed = parseGatePublicLiquidates(message, { identity, received_ts, quanto_multiplier: gate_multiplier });
  else if (key === 'BINANCE') parsed = parseBinanceUsdmForceOrder(message, { identity, received_ts });
  else return { status: 'SOURCE_UNSUPPORTED', events: [], errors: ['COLLECTOR_VENUE_UNSUPPORTED'], shadow_only: true };

  if (key === 'GATE' && gate_decimal_header_closed !== true && Array.isArray(parsed?.events)) {
    parsed = {
      ...parsed,
      status: parsed.status === 'CLOSED' ? 'PARTIAL' : parsed.status,
      events: parsed.events.map((row) => ({
        ...row,
        notional_usdt_normalized: null,
        notional_status: 'UNKNOWN_GATE_INTEGER_SIZE_ROUNDING_RISK',
      })),
      errors: [...(parsed.errors || []), 'GATE_DECIMAL_SIZE_HEADER_NOT_CLOSED'],
      source_semantics: `${parsed.source_semantics || ''} Gate size precision is not closed without X-Gate-Size-Decimal:1; notional is forced UNKNOWN.`,
    };
  }
  return parsed;
}

export function assessEnduranceProof({
  health,
  started_ts,
  completed_ts,
  required_duration_ms,
  min_messages = 1,
  max_reconnects = 12,
  max_event_gap_ms = 60_000,
  max_parse_error_rate = 0.01,
} = {}) {
  const start = int(started_ts);
  const end = int(completed_ts);
  const required = int(required_duration_ms);
  if (start === null || end === null || required === null || end < start || required <= 0) {
    return { status: 'NOT_CLOSED', reasons: ['ENDURANCE_WINDOW_INVALID'] };
  }
  const duration = end - start;
  const messages = Number(health?.message_count || 0);
  const totalErrors = Number(health?.parse_error_count || 0) + Number(health?.schema_error_count || 0) + Number(health?.identity_error_count || 0);
  const errorRate = messages > 0 ? totalErrors / messages : null;
  const reasons = [];
  if (duration < required) reasons.push('DURATION_NOT_PROVEN');
  if (messages < min_messages) reasons.push('MESSAGE_COVERAGE_NOT_PROVEN');
  if (Number(health?.reconnect_count || 0) > max_reconnects) reasons.push('RECONNECT_RATE_UNSAFE');
  if (Number(health?.max_event_gap_ms || 0) > max_event_gap_ms) reasons.push('EVENT_GAP_UNSAFE');
  if (errorRate !== null && errorRate > max_parse_error_rate) reasons.push('ERROR_RATE_UNSAFE');
  if (Number(health?.rate_limit_count || 0) > 0) reasons.push('RATE_LIMIT_OBSERVED');
  return {
    version: V3_COLLECTOR_VERSION,
    status: reasons.length ? 'NOT_CLOSED' : 'CLOSED',
    reasons,
    duration_ms: duration,
    required_duration_ms: required,
    messages,
    normalized_events: Number(health?.normalized_event_count || 0),
    reconnect_count: Number(health?.reconnect_count || 0),
    max_event_gap_ms: health?.max_event_gap_ms ?? null,
    error_rate: errorRate,
    latency_p95_ms: pctl(health?.latency_samples_ms, 0.95),
    production_enabled: false,
    shadow_only: true,
  };
}
