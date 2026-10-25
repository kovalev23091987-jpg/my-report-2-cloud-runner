import {assertInstrument, createFact, factUsable, emptyMap, CONTRACT_VERSION, ownerInstrumentExcluded} from '../contracts/index.mjs';
import {START_PROFILE} from '../profile/start-v1.mjs';
import {object, text, numeric, positive, timestamp, proof, fail, wireRows, selectRow, requestUrl,
  parsePrice, parseCandles, parseOrderbook, parseOpenInterest, parseFunding} from './bingx.mjs';
import {verifiedSwoleRoute, normalizeSwoleMap} from './liquidations.mjs';
import {createDayGrowthLoader} from './day-growth.mjs';
import {isExactSavedNonTargetDecision} from './saved-nontarget-decisions.mjs';
import {parseRecentTrades, RECENT_TRADE_SEMANTICS} from './recent-trades.mjs';
import {collectHyperliquidPositions} from './hyperliquid-observed-positions.mjs';
import {collectOrderlyPositions, orderlyRouteConfigured} from './orderly-observed-positions.mjs';

export const SOURCE_VERSION = 'pump-report-sources-v1';
export const SOURCE_HTTP_PLAN = Object.freeze({catalog: 1, overview_bulk: 1, core: 3,
  core_price_fallback_max: 1, optional_open_interest: 1, optional_funding: 1,
  optional_trades: 1, optional_total_max: 2,
  selected_delivery_refresh_max: 2, outcome_history_per_window_max: 1, day_growth_per_window_max: 1,
  liquidation_swole_per_candidate: 1, liquidation_hyperliquid_per_candidate_max: 1,
  liquidation_orderly_shared_page_max: 1,
  automatic_retries: 0, SQL_owned_by_sources: 0,
  actual_provider_and_SQL_cost: null, six_manual_checks_reserved: false});
const IDENTITY_KEYS = ['instrument_id', 'asset_id', 'venue', 'native_symbol', 'market_type', 'base', 'quote', 'settle', 'classification_status'];
const BUDGET_ERROR = /BUDGET|QUOTA|ADMISSION|RESERVE|EXHAUSTED|BACKOFF|RATE_LIMIT|NOT_ADMITTED|NOT_MEASURED|ALREADY_RESERVED/;
const safeCode = error => ['AbortError', 'TimeoutError'].includes(error?.name) ? 'SOURCE_TIMEOUT'
  : /^[A-Z0-9_:.-]{1,160}$/.test(error?.code ?? '') ? error.code : 'SOURCE_REQUEST_FAILED';
const plain = value => structuredClone(value);
const decode = (response, parse) => { try { return parse(); } catch (error) { error.receipt_id = response.receipt_id; throw error; } };

function entriesOf(registry) {
  if (registry instanceof Map) return [...registry.values()];
  if (Array.isArray(registry)) return registry;
  if (Array.isArray(registry?.instruments)) return registry.instruments;
  if (typeof registry?.resolve === 'function') return [];
  fail('INDEPENDENT_IDENTITY_REGISTRY_REQUIRED');
}

export function createPumpSources({broker, identityRegistry, clock = Date.now, profile = START_PROFILE} = {}) {
  if (typeof broker?.request !== 'function' || typeof clock !== 'function') fail('PUMP_SOURCE_DEPENDENCIES_REQUIRED');
  const registry = new Map(), registryRejected = [], blockedIds = new Set(), blockedSymbols = new Set();
  function registerEntry(raw, repeat = false) {
    if (raw == null) return null;
    if (typeof raw?.then === 'function') fail('SYNCHRONOUS_IDENTITY_RESOLVER_REQUIRED');
    const entry = plain(raw), instrument = entry?.instrument ?? entry;
    try {
      assertInstrument(instrument);
      if (!text(instrument.identity_evidence_ref) || !text(entry.native_contract_id ?? instrument.native_contract_id)) fail('IDENTITY_EVIDENCE_AND_NATIVE_CONTRACT_ID_REQUIRED');
      if (!/^[^\s/?&#]{1,120}-USDT$/.test(instrument.native_symbol)) fail('BINGX_NATIVE_USDT_SYMBOL_REQUIRED');
      if (['PAXG', 'XAUT'].includes(instrument.base.toUpperCase())) fail('OWNER_EXCLUDES_GOLD_BACKED_ASSETS');
      if (instrument.margin !== undefined && instrument.margin !== 'USDT' || entry.family !== undefined && entry.family !== 'USDT_M') fail('NON_USDT_MARGIN_OR_FAMILY');
      const existing = registry.get(instrument.instrument_id);
      if (repeat && existing && JSON.stringify(existing.instrument) === JSON.stringify(instrument)
        && String(existing.native_contract_id ?? existing.instrument.native_contract_id) === String(entry.native_contract_id ?? instrument.native_contract_id)) return existing;
      const conflicts = [...registry.values()].filter(e => e.instrument.instrument_id === instrument.instrument_id || e.instrument.native_symbol === instrument.native_symbol);
      if (conflicts.length || blockedIds.has(instrument.instrument_id) || blockedSymbols.has(instrument.native_symbol)) {
        blockedIds.add(instrument.instrument_id); blockedSymbols.add(instrument.native_symbol);
        for (const conflicting of conflicts) { registry.delete(conflicting.instrument.instrument_id); blockedIds.add(conflicting.instrument.instrument_id); blockedSymbols.add(conflicting.instrument.native_symbol);
          registryRejected.push({instrument_id: conflicting.instrument.instrument_id, native_symbol: conflicting.instrument.native_symbol, reason: 'DUPLICATE_REGISTRY_IDENTITY'}); }
        fail('DUPLICATE_REGISTRY_IDENTITY');
      }
      registry.set(instrument.instrument_id, {...entry, instrument, qualifications: entry.qualifications ?? {}});
      return registry.get(instrument.instrument_id);
    } catch (error) { registryRejected.push({instrument_id: instrument?.instrument_id ?? null, native_symbol: instrument?.native_symbol ?? null, reason: safeCode(error)}); }
    return null;
  }
  for (const raw of entriesOf(identityRegistry)) registerEntry(raw);
  const lookup = query => typeof identityRegistry?.resolve === 'function' ? registerEntry(identityRegistry.resolve(query), true) : null;
  const coverageRows = new Map();
  // Reuse an already normalized fact from this same source invocation. Durable
  // cache, coalescing, backoff and expense accounting remain in ROOT's broker.
  const overviewPrices = new Map();
  let catalogCoverage = {status: 'NOT_CHECKED', total: null, qualified: null, unqualified: null};
  const now = () => { const t = timestamp(clock()); if (t === null) fail('SOURCE_CLOCK_INVALID'); return t; };
  const resolve = input => {
    assertInstrument(input);
    const entry = registry.get(input.instrument_id) ?? lookup({instrument_id: input.instrument_id, native_symbol: input.native_symbol,
      venue: 'BINGX', market_type: 'PERPETUAL', quote: 'USDT', settle: 'USDT'});
    if (!entry || IDENTITY_KEYS.some(key => entry.instrument[key] !== input[key])) fail('INDEPENDENT_REGISTRY_IDENTITY_MISMATCH');
    return entry;
  };
  const note = (instrument, section, value) => {
    const row = coverageRows.get(instrument.instrument_id) ?? {instrument_id: instrument.instrument_id, asset_id: instrument.asset_id, native_symbol: instrument.native_symbol, overview: null, core: null, growth_24h: null, optional: null, liquidations: null};
    row[section] = plain(value); coverageRows.set(instrument.instrument_id, row);
  };
  const request = async (kind, {instrument = null, params = {}, ttl_ms = 0, timeout_ms = 10000, deadline_ts = null, route = null, purpose = 'CORE'} = {}) => {
    const url = route?.url ?? requestUrl(kind, {...params, ...(instrument ? {symbol: instrument.native_symbol} : {})});
    const provider = route?.provider ?? 'BINGX', family = route?.family ?? 'USDT_M';
    const remaining = deadline_ts === null ? timeout_ms : Math.min(timeout_ms, deadline_ts - now());
    if (remaining <= 0) fail('SOURCE_DEADLINE_EXPIRED');
    const method = route?.method ?? 'GET';
    if (!['GET', 'POST'].includes(method)) fail('SOURCE_READONLY_METHOD_REQUIRED');
    // ROOT adds the canonical body SHA to POST cache/coalescing keys and checks
    // exact read-only templates. This wrapper creates no provider admission.
    const result = await broker.request({provider, family, purpose, cache_key: `${SOURCE_VERSION}:${provider}:${family}:${url}`,
      url, method, ...(method === 'POST' ? {json_body: route.json_body} : {}),
      timeout_ms: remaining, ...(deadline_ts === null ? {} : {deadline_ts}),
      ttl_ms, candidate_id: instrument?.instrument_id ?? null, estimated_cost: {http: 1}});
    // The broker owns pacing, abort and finalization. Await that work instead
    // of returning from a local timer while the admitted request keeps running.
    if (deadline_ts !== null && now() >= deadline_ts) throw Object.assign(new Error('SOURCE_DEADLINE_EXPIRED'),
      {code: 'SOURCE_DEADLINE_EXPIRED', receipt_id: result?.receipt_id ?? null, received_ts: result?.received_ts ?? null});
    if (!object(result) || result.ok !== true || result.status !== 200) {
      const code = result?.status === 429 ? 'SOURCE_RATE_LIMITED' : [401, 403, 451].includes(result?.status) ? 'SOURCE_ACCESS_BLOCKED' : `SOURCE_HTTP_${Number.isInteger(result?.status) ? result.status : 'UNKNOWN'}`;
      throw Object.assign(new Error(code), {code, receipt_id: result?.receipt_id ?? null, received_ts: result?.received_ts ?? null});
    }
    if (timestamp(result.received_ts) === null || result.received_ts > now()) fail('BROKER_ORIGINAL_RECEIPT_CLOCK_INVALID');
    if (!text(result.receipt_id)) fail('BROKER_RECEIPT_ID_REQUIRED');
    return result;
  };
  function fact(entry, kind, value, unit, event_ts, response, {qualified = true, reason = null, coverage = null, origin = 'OBSERVED', extra = {}} = {}) {
    const at = now(), received = response?.received_ts ?? at;
    const ttl = profile.freshness_ms[kind === 'ticker_24h' ? 'price' : kind];
    if (!Number.isSafeInteger(ttl) || ttl <= 0) fail('FACT_FRESHNESS_PROFILE_REQUIRED');
    let status = qualified ? 'USABLE' : 'INCOMPLETE';
    if (event_ts === null) { status = 'INCOMPLETE'; reason ??= 'SOURCE_EVENT_CLOCK_UNKNOWN'; }
    if (event_ts !== null && (event_ts > received || event_ts > at)) { status = 'ERROR'; reason = 'SOURCE_EVENT_CLOCK_FUTURE'; value = null; event_ts = null; }
    const expires_ts = event_ts === null ? null : event_ts + ttl;
    if (status === 'USABLE' && expires_ts < at) { status = 'STALE'; reason = 'SOURCE_FACT_STALE'; }
    return createFact({fact_id: `${SOURCE_VERSION}:${entry.instrument.instrument_id}:${kind}:${response?.receipt_id ?? 'NO_RECEIPT'}`,
      instrument_id: entry.instrument.instrument_id, kind, value, unit, event_ts, received_ts: received, expires_ts,
      asset_id: entry.instrument.asset_id, market_type: 'PERPETUAL', quote: 'USDT', settle: 'USDT',
      source: 'BINGX_OFFICIAL_PUBLIC_API', primary_provider: 'BINGX', venue: 'BINGX', status, origin, coverage, reason,
      evidence_ref: response?.receipt_id ?? null, cache_hit: response?.cache_hit === true,
      identity_evidence_ref: entry.instrument.identity_evidence_ref, ...extra});
  }
  const absent = (entry, kind, reason, status = 'ABSENT') => createFact({fact_id: `${SOURCE_VERSION}:${entry.instrument.instrument_id}:${kind}:${reason}`,
    instrument_id: entry.instrument.instrument_id, kind, received_ts: now(), source: 'BINGX_OFFICIAL_PUBLIC_API', primary_provider: 'BINGX',
    asset_id: entry.instrument.asset_id, market_type: 'PERPETUAL', quote: 'USDT', settle: 'USDT',
    status, reason, coverage: {checked: status !== 'NOT_CHECKED'}, evidence_ref: null});
  const failed = (entry, kind, error) => { const code = safeCode(error); return {...absent(entry, kind, code, BUDGET_ERROR.test(code) ? 'NOT_CHECKED' : 'ERROR'),
    evidence_ref: text(error?.receipt_id) ? error.receipt_id : null}; };
  const reusablePrice = (value, entry) => object(value) && factUsable(value, now()) && value.kind === 'price'
    && value.instrument_id === entry.instrument.instrument_id && value.unit === 'USDT_PER_BASE'
    && typeof value.value === 'number' && positive(value.value) !== null && value.venue === 'BINGX'
    && value.primary_provider === 'BINGX' && value.source === 'BINGX_OFFICIAL_PUBLIC_API'
    && value.identity_evidence_ref === entry.instrument.identity_evidence_ref && text(value.evidence_ref)
    && value.event_ts <= value.received_ts && now() - value.event_ts <= profile.freshness_ms.price
    && value.expires_ts <= value.event_ts + profile.freshness_ms.price;
  async function price(entry, {force_refresh = false, existing_fact = null, purpose = 'CORE'} = {}) {
    if (!force_refresh && reusablePrice(existing_fact, entry)) return {...plain(existing_fact), reused_from_existing_facts: true};
    const observed = overviewPrices.get(entry.instrument.instrument_id);
    if (!force_refresh && reusablePrice(observed, entry)) return {...plain(observed), reused_from_overview: true};
    let first;
    try {
      const response = await request('price', {instrument: entry.instrument, ttl_ms: force_refresh ? 0 : profile.freshness_ms.price, purpose});
      const parsed = decode(response, () => parsePrice(response.data, entry.instrument));
      first = fact(entry, 'price', parsed.value, 'USDT_PER_BASE', parsed.event_ts, response);
      if (force_refresh || first.status === 'USABLE' || first.status === 'ERROR') return first;
    } catch (error) {
      first = failed(entry, 'price', error);
      if (force_refresh || first.status === 'NOT_CHECKED' || /SYMBOL|IDENTITY|ACCESS_BLOCKED|CLOCK_MISMATCH/.test(first.reason)) return first;
    }
    try {
      const response = await request('ticker', {instrument: entry.instrument, ttl_ms: profile.freshness_ms.price, purpose});
      const parsed = decode(response, () => parsePrice(response.data, entry.instrument, 'ticker'));
      return fact(entry, 'price', parsed.value, 'USDT_PER_BASE', parsed.event_ts, response,
        {extra: {fallback_from_fact_id: first.fact_id, fallback_reason: first.reason,
          attempt_receipt_ids: [first.evidence_ref, response.receipt_id].filter(Boolean)}});
    } catch (error) { const result = failed(entry, 'price', error); return {...result, primary_failure_reason: first.reason,
      attempt_receipt_ids: [first.evidence_ref, result.evidence_ref].filter(Boolean)}; }
  }
  async function candles(entry, {force_refresh = false, purpose = 'CORE'} = {}) {
    const step = profile.candle_interval_ms;
    if (step !== 60000) fail('PACKAGE_A_ONE_MINUTE_INTERVAL_REQUIRED');
    // The oldest searched impulse needs its own preceding full baseline:
    // wave search60m + impulse5m + baseline60m =125 closed minutes.
    const durations = [profile.wave_search_ms, profile.impulse_window_ms, profile.volume_baseline_ms,
      ...profile.automatic_growth.short_windows_ms];
    if (durations.some(ms => !Number.isSafeInteger(ms) || ms <= 0)) fail('CORE_CANDLE_WINDOW_PROFILE_INVALID');
    const count = Math.ceil(Math.max(Math.max(...profile.automatic_growth.short_windows_ms),
      profile.wave_search_ms + profile.impulse_window_ms + profile.volume_baseline_ms) / step);
    if (count > 1440) fail('BINGX_CANDLE_WINDOW_EXCEEDS_REQUEST_LIMIT');
    const end = Math.floor(now() / step) * step, start = end - count * step;
    try {
      const response = await request('candles', {instrument: entry.instrument, params: {interval: '1m', startTime: start, endTime: end - 1, limit: count}, ttl_ms: force_refresh ? 0 : profile.freshness_ms.candles, purpose});
      const parsed = decode(response, () => parseCandles(response.data, {start, end, interval_ms: step, received_ts: response.received_ts,
        instrument: entry.instrument, windows_ms: profile.automatic_growth.short_windows_ms, qualification: entry.qualifications.candles}));
      return fact(entry, 'candles', parsed.value, parsed.unit, parsed.event_ts, response,
        {qualified: parsed.qualified, reason: parsed.reason, coverage: parsed.coverage});
    } catch (error) { return failed(entry, 'candles', error); }
  }
  async function orderbook(entry, {force_refresh = false, purpose = 'CORE'} = {}) {
    try {
      const response = await request('orderbook', {instrument: entry.instrument, params: {limit: 1000}, ttl_ms: force_refresh ? 0 : profile.freshness_ms.orderbook, purpose});
      const parsed = decode(response, () => parseOrderbook(response.data, entry.qualifications.orderbook));
      return fact(entry, 'orderbook', parsed.value, parsed.qualified ? 'USDT_PRICE_BASE_QUANTITY' : null, parsed.event_ts, response,
        {qualified: parsed.qualified, reason: parsed.reason, coverage: parsed.coverage});
    } catch (error) { return failed(entry, 'orderbook', error); }
  }
  async function getCatalog({purpose = 'CORE'} = {}) {
    try {
      const response = await request('catalog', {purpose});
      if (!Array.isArray(response.data?.data)) fail('BINGX_CATALOG_ARRAY_REQUIRED');
      const rows = decode(response, () => wireRows(response.data)), instruments = [], unqualified = [], seen = new Set();
      for (const row of rows) {
        if (!object(row)) { unqualified.push({native_symbol: null, reason: 'INVALID_CATALOG_ROW'}); continue; }
        const symbol = typeof row.symbol === 'string' ? row.symbol : null;
        let entry = [...registry.values()].find(item => item.instrument.native_symbol === symbol);
        if (!entry && typeof identityRegistry?.resolve === 'function' && symbol?.endsWith('-USDT') && row.currency === 'USDT') {
          try { entry = lookup({native_symbol: symbol, native_contract_id: String(row.contractId ?? ''), venue: 'BINGX', market_type: 'PERPETUAL', quote: 'USDT', settle: 'USDT'}); }
          catch { entry = null; }
        }
        let catalogDecision = null;
        if (typeof identityRegistry?.resolveCatalogDecision === 'function') {
          try { catalogDecision = identityRegistry.resolveCatalogDecision(row); }
          catch { catalogDecision = {decision: 'INVALID_CATALOG_DECISION'}; }
        }
        const knownNonTarget = isExactSavedNonTargetDecision(catalogDecision, row);
        let reason = null;
        if (!symbol || seen.has(symbol)) reason = 'MISSING_OR_DUPLICATE_NATIVE_SYMBOL';
        else if (!symbol.endsWith('-USDT') || row.currency !== 'USDT') reason = 'NON_USDT_SETTLEMENT';
        else if (row.status !== 1) reason = 'INSTRUMENT_NOT_ONLINE';
        else if (['PAXG', 'XAUT'].includes(String(row.asset ?? '').toUpperCase())
          || ['PAXG-USDT', 'XAUT-USDT'].includes(symbol)) reason = 'OWNER_EXCLUDED_GOLD_BACKED_ASSET';
        else if (catalogDecision && (!knownNonTarget || entry)) reason = 'CATALOG_REGISTRY_IDENTITY_MISMATCH';
        else if (knownNonTarget) reason = 'KNOWN_NON_TARGET_EXACT_SAVED_TUPLE';
        else if (!entry) reason = 'CRYPTO_ASSET_IDENTITY_UNQUALIFIED';
        else if (String(row.contractId ?? '') !== String(entry.native_contract_id ?? entry.instrument.native_contract_id)
          || row.asset !== (entry.native_base ?? entry.instrument.base)) reason = 'CATALOG_REGISTRY_IDENTITY_MISMATCH';
        if (symbol) seen.add(symbol);
        if (reason) unqualified.push({native_symbol: symbol, reason});
        else instruments.push(plain(entry.instrument));
      }
      // A duplicate invalidates every occurrence, including an earlier accepted row.
      const duplicates = new Set(unqualified.filter(row => row.reason === 'MISSING_OR_DUPLICATE_NATIVE_SYMBOL').map(row => row.native_symbol));
      for (const item of instruments) if (duplicates.has(item.native_symbol)) unqualified.push({native_symbol: item.native_symbol, reason: 'MISSING_OR_DUPLICATE_NATIVE_SYMBOL'});
      const qualified = instruments.filter(item => !duplicates.has(item.native_symbol));
      catalogCoverage = {status: 'CHECKED', total: rows.length, qualified: qualified.length, unqualified: rows.length - qualified.length,
        registry_rejected: registryRejected, registry_missing_from_catalog: [...registry.values()].filter(item => !seen.has(item.instrument.native_symbol)).map(item => item.instrument.instrument_id),
        evidence_ref: response.receipt_id, received_ts: response.received_ts, qualified_count_is_not_status1_count: true};
      return {instruments: qualified, unqualified, coverage: plain(catalogCoverage)};
    } catch (error) { catalogCoverage = {status: BUDGET_ERROR.test(safeCode(error)) ? 'NOT_CHECKED' : 'ERROR', reason: safeCode(error), total: null, qualified: null, unqualified: null};
      return {instruments: [], unqualified: [], coverage: plain(catalogCoverage)}; }
  }
  async function getOverview({instruments = [], purpose = 'CORE'} = {}) {
    if (!Array.isArray(instruments)) fail('OVERVIEW_INSTRUMENTS_REQUIRED');
    const entries = instruments.map(resolve);
    if (!entries.length) return {observations: [], coverage: {status: 'NOT_CHECKED', reason: 'EMPTY_VERIFIED_UNIVERSE', expected: 0, checked: 0}};
    let response;
    try { response = await request('ticker', {ttl_ms: profile.freshness_ms.price, purpose}); wireRows(response.data); }
    catch (error) { for (const entry of entries) note(entry.instrument, 'overview', {status: 'NOT_CHECKED', reason: safeCode(error)});
      return {observations: entries.map(entry => ({instrument: plain(entry.instrument), facts: {ticker_24h: failed(entry, 'ticker_24h', error)}})),
      coverage: {status: 'INCOMPLETE', expected: entries.length, checked: 0, reason: safeCode(error)}}; }
    const observations = entries.map(entry => {
      try {
        const row = selectRow(response.data, entry.instrument.native_symbol), p = parsePrice(response.data, entry.instrument, 'ticker');
        const qualified = proof(entry.qualifications.ticker_24h) && entry.qualifications.ticker_24h.window === 'ROLLING_24H';
        const open = positive(row.openPrice), reported = numeric(row.priceChangePercent), turn = numeric(row.quoteVolume);
        const value = {last: p.value, open: qualified ? open : null, change_pct: qualified && open !== null ? (p.value / open - 1) * 100 : null,
          turnover_quote: turn !== null && turn >= 0 ? turn : null, volume_base: null};
        return {instrument: plain(entry.instrument), preliminary: true, reported_change_pct: reported,
          facts: {price: fact(entry, 'price', p.value, 'USDT_PER_BASE', p.event_ts, response),
            ticker_24h: fact(entry, 'ticker_24h', value, 'USDT_ROLLING_24H', p.event_ts, response,
              {qualified: qualified && open !== null, reason: qualified && open !== null ? null : 'ROLLING_24H_OPEN_UNQUALIFIED'})}};
      } catch (error) { return {instrument: plain(entry.instrument), facts: {ticker_24h: failed(entry, 'ticker_24h', error)}}; }
    });
    for (const observation of observations) {
      if (factUsable(observation.facts.price, now())) overviewPrices.set(observation.instrument.instrument_id, plain(observation.facts.price));
      note(observation.instrument, 'overview', {status: observation.facts.price?.status ?? observation.facts.ticker_24h.status,
        reason: observation.facts.price?.reason ?? observation.facts.ticker_24h.reason, evidence_ref: response.receipt_id});
    }
    return {observations, coverage: {status: observations.every(item => item.facts.price?.status === 'USABLE') ? 'CHECKED' : 'INCOMPLETE',
      expected: entries.length, checked: observations.filter(item => item.facts.price).length,
      invalid_response_rows: wireRows(response.data).filter(row => !object(row)).length, evidence_ref: response.receipt_id}};
  }
  async function getCore({instrument, force_refresh = false, only_facts = ['price', 'candles', 'orderbook'], existing_facts = {}, purpose = 'CORE'} = {}) {
    if (typeof force_refresh !== 'boolean' || !Array.isArray(only_facts) || !only_facts.length
      || new Set(only_facts).size !== only_facts.length || only_facts.some(kind => !['price', 'candles', 'orderbook'].includes(kind))) fail('INVALID_CORE_FACT_SELECTION');
    if (!['CORE', 'DELIVERY'].includes(purpose)) fail('INVALID_CORE_REQUEST_PURPOSE');
    const entry = resolve(instrument), loaders = {price, candles, orderbook};
    const values = await Promise.all(only_facts.map(kind => loaders[kind](entry, {force_refresh, existing_fact: kind === 'price' ? existing_facts?.price : null, purpose})));
    const facts = Object.fromEntries(values.map(value => [value.kind, value]));
    const coverage = {status: values.every(value => value.status === 'USABLE') ? 'USABLE' : 'INCOMPLETE',
      selected_facts: [...only_facts], force_refresh,
      facts: Object.fromEntries(values.map(value => [value.kind, {status: value.status, reason: value.reason, coverage: value.coverage}])),
      cost_authority: 'BROKER', receipt_ids: [...new Set(values.flatMap(value => value.attempt_receipt_ids ?? [value.evidence_ref]).filter(Boolean))]};
    note(instrument, 'core', coverage); return {facts, coverage};
  }
  let dayGrowthLoader = null;
  async function getDayGrowth({instrument, force_refresh = false} = {}) {
    dayGrowthLoader ??= createDayGrowthLoader({broker, resolveEntry: resolve, clock, profile});
    const result = await dayGrowthLoader.getDayGrowth({instrument, force_refresh});
    note(instrument, 'growth_24h', result.coverage);
    return result;
  }
  async function getOutcomeHistory({instrument, start_ts, end_ts} = {}) {
    const entry = resolve(instrument), step = profile.candle_interval_ms;
    if (step !== 60000 || timestamp(start_ts) === null || timestamp(end_ts) === null || start_ts >= end_ts) fail('INVALID_OUTCOME_WINDOW');
    const start = Math.floor(start_ts / step) * step, end = Math.ceil(end_ts / step) * step, count = (end - start) / step;
    if (count > 1440) fail('OUTCOME_WINDOW_EXCEEDS_1440_BARS');
    const at = now(), queryEnd = Math.min(end, Math.floor(at / step) * step);
    const finish = (candles, coverage) => { note(instrument, 'outcome_history', coverage); return {facts: {candles}, coverage}; };
    if (queryEnd <= start) return finish(absent(entry, 'candles', 'OUTCOME_PERIOD_NOT_STARTED', 'NOT_CHECKED'),
      {purpose: 'HISTORICAL_OUTCOME', complete: false, period_finished: false, start_ts, end_ts, window_start: start, window_end: end});
    let response;
    try {
      response = await request('candles', {instrument, params: {interval: '1m', startTime: start, endTime: queryEnd, limit: Math.min(1440, count + 1)},
        ttl_ms: profile.freshness_ms.candles});
      const parsed = decode(response, () => parseCandles(response.data, {start, end, interval_ms: step, received_ts: response.received_ts,
        instrument: entry.instrument, preserve_disjoint_closed_rows: true, qualification: entry.qualifications.candles}));
      const qualified = parsed.coverage.time_qualified && parsed.value.length > 0;
      const value = parsed.value.map(candle => ({...candle,
        outcome_boundary: {overlaps_start: candle.open_ts !== null && candle.open_ts < start_ts,
          overlaps_end: candle.close_ts !== null && candle.close_ts > end_ts},
        high_is_exact_period_hit_eligible: candle.closed && candle.open_ts >= start_ts && candle.close_ts <= end_ts}));
      const coverage = {...parsed.coverage, purpose: 'HISTORICAL_OUTCOME', start_ts, end_ts,
        query_end: queryEnd, period_finished: at >= end_ts,
        complete: parsed.coverage.time_qualified && parsed.coverage.complete && at >= end_ts,
        boundary_ambiguity: start_ts !== start || end_ts !== end,
        boundary_candles: value.filter(candle => candle.outcome_boundary.overlaps_start || candle.outcome_boundary.overlaps_end)
          .map(candle => ({open_ts: candle.open_ts, close_ts: candle.close_ts})),
        cost_authority: 'BROKER', receipt_ids: [response.receipt_id]};
      // Historical close clocks stay historical. No live-price freshness or
      // refreshed source age is asserted; generic factUsable deliberately
      // cannot feed this no-expiry history fact into a current core decision.
      const history = createFact({fact_id: `${SOURCE_VERSION}:${instrument.instrument_id}:outcome:${start_ts}:${end_ts}:${response.receipt_id}`,
        instrument_id: instrument.instrument_id, asset_id: instrument.asset_id, kind: 'candles', value, unit: 'OHLC_USDT',
        event_ts: parsed.event_ts, received_ts: response.received_ts, expires_ts: null,
        source: 'BINGX_OFFICIAL_PUBLIC_API', primary_provider: 'BINGX', venue: 'BINGX', market_type: 'PERPETUAL', settle: 'USDT',
        status: qualified ? 'USABLE' : 'INCOMPLETE', origin: 'OBSERVED', purpose: 'HISTORICAL_OUTCOME', coverage,
        reason: !qualified ? 'HISTORICAL_CLOSED_TIME_UNQUALIFIED' : !coverage.complete ? 'OUTCOME_COVERAGE_INCOMPLETE' : 'HISTORICAL_WINDOW_NOT_LIVE_FRESHNESS',
        evidence_ref: response.receipt_id, cache_hit: response.cache_hit === true});
      return finish(history, coverage);
    } catch (error) { return finish(failed(entry, 'candles', error), {purpose: 'HISTORICAL_OUTCOME', complete: false,
      start_ts, end_ts, reason: safeCode(error), evidence_ref: response?.receipt_id ?? null}); }
  }
  async function getOptional({instrument, deadline_ts} = {}) {
    const entry = resolve(instrument), facts = {}, at = now();
    if (!Number.isSafeInteger(profile.liquidation_deadline_ms) || profile.liquidation_deadline_ms <= 0) fail('OPTIONAL_DEADLINE_PROFILE_INVALID');
    const validDeadline = deadline_ts === undefined || typeof deadline_ts === 'number' && timestamp(deadline_ts) !== null;
    const deadline = validDeadline ? Math.min(deadline_ts ?? at + profile.liquidation_deadline_ms, at + profile.liquidation_deadline_ms) : null;
    let timedOut = false;
    const exhausted = () => timedOut || deadline !== null && now() >= deadline;
    const optionalFailure = (kind, error) => {
      const result = failed(entry, kind, error);
      if (/DEADLINE|TIMEOUT/.test(result.reason)) {
        timedOut = true;
        return {...result, status: 'NOT_CHECKED', coverage: {...result.coverage, deadline_status: 'TIMEOUT', spent_or_unknown_not_refunded: true}};
      }
      return result;
    };
    const upper = profile.optional_http_upper_bound;
    if (!Number.isSafeInteger(upper) || upper < 0 || upper > SOURCE_HTTP_PLAN.optional_total_max) fail('OPTIONAL_BUDGET_PROFILE_INVALID');
    const finish = () => {
      const coverage = Object.fromEntries(Object.entries(facts).map(([kind, value]) => [kind,
        {status: value.status, reason: value.reason, ...(value.coverage ? {coverage: value.coverage} : {})}]));
      note(instrument, 'optional', coverage);
      return {facts, coverage, deadline_ts: deadline, deadline_status: !validDeadline ? 'INVALID' : exhausted() ? 'TIMEOUT' : 'WITHIN_BOUND'};
    };
    if (ownerInstrumentExcluded(instrument)) {
      for (const kind of ['trades', 'open_interest', 'funding']) facts[kind] = absent(entry, kind, 'OWNER_ASSET_DELIVERY_EXCLUDED', 'NOT_CHECKED');
      return finish();
    }
    if (!validDeadline || exhausted()) {
      for (const kind of ['trades', 'open_interest', 'funding']) facts[kind] = absent(entry, kind,
        validDeadline ? 'OPTIONAL_STAGE_DEADLINE_EXPIRED' : 'INVALID_OPTIONAL_DEADLINE', 'NOT_CHECKED');
      return finish();
    }
    // Every attempted broker request consumes a slot even when it fails or is
    // denied. These per-kind maxima are alternatives within the same upper2.
    let attempts = 0;
    if (attempts >= upper) facts.trades = absent(entry, 'trades', 'OPTIONAL_BUDGET_SLOT_NOT_AVAILABLE', 'NOT_CHECKED');
    else {
      attempts++;
      try {
        const response = await request('trades', {instrument, params: {limit: RECENT_TRADE_SEMANTICS.limit}, ttl_ms: profile.freshness_ms.trades, deadline_ts: deadline});
        const parsed = decode(response, () => parseRecentTrades(response.data, {instrument: entry.instrument, received_ts: response.received_ts}));
        facts.trades = fact(entry, 'trades', parsed.value, parsed.unit, parsed.event_ts, response,
          {qualified: parsed.qualified, reason: parsed.reason, coverage: parsed.coverage,
            extra: {unit_evidence_ref: RECENT_TRADE_SEMANTICS.evidence_ref, base_quantity_qualified: false}});
      } catch (error) { facts.trades = optionalFailure('trades', error); }
    }
    for (const [kind, parse] of [['open_interest', parseOpenInterest], ['funding', parseFunding]]) {
      if (exhausted()) { facts[kind] = absent(entry, kind, 'OPTIONAL_STAGE_DEADLINE_EXPIRED', 'NOT_CHECKED'); continue; }
      const qualification = entry.qualifications[kind];
      const usableQualification = proof(qualification) && (kind === 'open_interest'
        ? ['CONTRACTS', 'BASE_ASSET', 'USDT'].includes(qualification.unit)
        : text(qualification.rate_clock_field) && qualification.rate_clock_field !== 'updateTime');
      if (!usableQualification) { facts[kind] = absent(entry, kind,
        kind === 'open_interest' ? 'OPEN_INTEREST_UNIT_UNQUALIFIED' : 'FUNDING_RATE_SOURCE_CLOCK_UNQUALIFIED', 'NOT_CHECKED'); continue; }
      if (attempts >= upper) { facts[kind] = absent(entry, kind, 'OPTIONAL_BUDGET_SLOT_NOT_AVAILABLE', 'NOT_CHECKED'); continue; }
      attempts++;
      try {
        const response = await request(kind, {instrument, ttl_ms: profile.freshness_ms[kind], deadline_ts: deadline});
        const parsed = decode(response, () => parse(response.data, instrument, entry.qualifications[kind]));
        facts[kind] = fact(entry, kind, parsed.value, kind === 'funding' ? 'RATE_FRACTION_PER_ACTUAL_PERIOD' : parsed.unit,
          parsed.event_ts, response, {qualified: parsed.qualified, reason: parsed.reason,
            extra: {unit_evidence_ref: proof(entry.qualifications[kind]) ? entry.qualifications[kind].evidence_ref : null,
              native_value_decimal: parsed.native_value_decimal ?? null, native_metadata_update_ts: parsed.native_metadata_update_ts ?? null}});
      } catch (error) { facts[kind] = optionalFailure(kind, error); }
    }
    return finish();
  }
  async function getLiquidations({instrument, reference_price, deadline_ts} = {}) {
    const entry = resolve(instrument), at = now(), deadline = Math.min(timestamp(deadline_ts) ?? at + profile.liquidation_deadline_ms, at + profile.liquidation_deadline_ms);
    const finish = result => { note(instrument, 'liquidations', {status: result.status, reason: result.reason, checked_sources: result.checked_sources,
      usable_zone_count: Array.isArray(result.zones) ? result.zones.filter(zone => zone.usable === true).length : 0, coverage: result.coverage}); return result; };
    if (positive(reference_price) === null) return finish(emptyMap('NOT_CHECKED', 'REFERENCE_PRICE_REQUIRED'));
    if (deadline_ts !== undefined && timestamp(deadline_ts) === null) return finish(emptyMap('NOT_CHECKED', 'INVALID_LIQUIDATION_DEADLINE'));
    if (deadline <= at) return finish(emptyMap('TIMEOUT', 'LIQUIDATION_DEADLINE_EXPIRED'));
    const routes = Array.isArray(entry.liquidations?.routes) ? entry.liquidations.routes : [];
    const route = routes.find(candidate => verifiedSwoleRoute(candidate, instrument));
    if (!route) {
      const orderly = routes.find(candidate => candidate?.provider === 'ORDERLY' && orderlyRouteConfigured(candidate, instrument));
      const collectOrderly = candidate => collectOrderlyPositions({route: candidate, instrument, now, profile, deadline, reference_price,
        http_limit: Number.isSafeInteger(profile.map_http_upper_bound) && profile.map_http_upper_bound >= 0
          ? Math.min(profile.map_http_upper_bound, SOURCE_HTTP_PLAN.liquidation_orderly_shared_page_max) : 0,
        request: postRoute => request('liquidations', {instrument, ttl_ms: profile.freshness_ms.observed_positions,
          deadline_ts: deadline, route: postRoute})});
      if (orderly) return finish(await collectOrderly(orderly));
      const hyperliquid = routes.find(candidate => candidate?.provider === 'HYPERLIQUID');
      if (hyperliquid) return finish(await collectHyperliquidPositions({route: hyperliquid, instrument, now, profile, deadline,
        reference_price, http_limit: Number.isSafeInteger(profile.map_http_upper_bound) && profile.map_http_upper_bound >= 0
          ? Math.min(profile.map_http_upper_bound, SOURCE_HTTP_PLAN.liquidation_hyperliquid_per_candidate_max) : 0,
        request: postRoute => request('liquidations', {instrument, ttl_ms: profile.freshness_ms.observed_positions,
          deadline_ts: deadline, route: postRoute})}));
      const dormantOrderly = routes.find(candidate => candidate?.provider === 'ORDERLY');
      if (dormantOrderly) return finish(await collectOrderly(dormantOrderly));
      return finish(emptyMap('NOT_CHECKED', 'NO_VERIFIED_LIQUIDATION_ROUTE'));
    }
    let response;
    try {
      response = await request('liquidations', {instrument, ttl_ms: profile.freshness_ms.model_map, deadline_ts: deadline,
        route: {provider: 'SWOLECHARTS', family: 'LIQUIDATIONS', url: `https://swolecharts.com/api/liquidation-levels/${encodeURIComponent(route.symbol)}`}});
      if (now() >= deadline) fail('SOURCE_DEADLINE_EXPIRED');
      const result = normalizeSwoleMap(response.data, {route, instrument, received_ts: response.received_ts, now: now(), profile, receipt_id: response.receipt_id});
      result.coverage = {...result.coverage, response_checked: true, evidence_ref: response.receipt_id};
      return finish(result);
    } catch (error) {
      const code = safeCode(error), status = /DEADLINE|TIMEOUT/.test(code) ? 'TIMEOUT' : BUDGET_ERROR.test(code) ? 'NOT_CHECKED_BUDGET' : 'ERROR';
      return finish({...emptyMap(status, code), checked_sources: status === 'NOT_CHECKED_BUDGET' ? [] : ['SWOLECHARTS'],
        coverage: {request_outcome: code, response_checked: Boolean(response), evidence_ref: response?.receipt_id ?? null, actual_cost_authority: 'BROKER', spent_or_unknown_not_refunded: true}});
    }
  }
  function getCoverage() {
    const instruments = [...coverageRows.values()].map(plain), maps = instruments.map(row => row.liquidations).filter(Boolean);
    const checked = maps.filter(map => map.coverage?.response_checked === true);
    const targetChecked = checked.filter(map => map.coverage?.target_checked_in_this_page !== false);
    return {version: SOURCE_VERSION, contract_version: CONTRACT_VERSION, catalog: plain(catalogCoverage), instruments,
      totals: {registry_verified_instruments: registry.size, core_checked: instruments.filter(row => row.core && Object.values(row.core.facts).some(value => value.status !== 'NOT_CHECKED')).length,
        overview_price_usable: instruments.filter(row => row.overview?.status === 'USABLE').length,
        core_usable: instruments.filter(row => row.core?.status === 'USABLE' && row.core.selected_facts?.length === 3).length,
        selected_core_usable: instruments.filter(row => row.core?.status === 'USABLE').length, map_checked: targetChecked.length,
        day_growth_checked: instruments.filter(row => row.growth_24h && row.growth_24h.status !== 'NOT_CHECKED').length,
        day_growth_usable: instruments.filter(row => row.growth_24h?.status === 'USABLE').length,
        map_usable: maps.filter(map => map.usable_zone_count > 0).length,
        map_checked_without_usable: targetChecked.filter(map => !(map.usable_zone_count > 0)).length,
        map_not_checked: registry.size - targetChecked.length},
      expense_ledger: 'ROOT_BROKER_ONLY', actual_provider_cost: null, actual_SQL_cost: null};
  }
  return {getCatalog, getOverview, getCore, getDayGrowth, getOptional, getLiquidations, getOutcomeHistory, getCoverage};
}
