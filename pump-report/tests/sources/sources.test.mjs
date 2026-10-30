import test from 'node:test';
import assert from 'node:assert/strict';
import {createPumpSources, SOURCE_HTTP_PLAN} from '../../sources/index.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {parseFunding, parseOpenInterest} from '../../sources/bingx.mjs';

// Synthetic values in the object shapes retained by PR639. These qualification
// references are fixtures, not native evidence, live permission or cost proof.
const T = 1800000000123, E = Math.floor(T / 60000) * 60000;
function registry(symbol = 'BTC') {
  return {instrument: {instrument_id: `BINGX:${symbol}-USDT`, asset_id: `SYNTHETIC_ASSET:${symbol}`,
    venue: 'BINGX', native_symbol: `${symbol}-USDT`, market_type: 'PERPETUAL', base: symbol, quote: 'USDT', settle: 'USDT',
    classification_status: 'VERIFIED_CRYPTO', identity_evidence_ref: 'FIXTURE_IDENTITY_NOT_NATIVE'},
  native_contract_id: `FIXTURE_${symbol}`,
  qualifications: {candles: {time: {semantics: 'OPEN_TIME', evidence_ref: 'FIXTURE_OPEN_TIME_NOT_NATIVE'},
    volume: {unit: 'BASE_ASSET', evidence_ref: 'FIXTURE_VOLUME_NOT_NATIVE'}},
  orderbook: {fields: 'COIN', unit: 'BASE_ASSET', evidence_ref: 'FIXTURE_COIN_SIZE_NOT_NATIVE'}}};
}
const btc = () => registry().instrument;
function mapRoute(entry) {
  return {provider: 'SWOLECHARTS', symbol: 'BTC', asset_id: entry.instrument.asset_id,
    identity_evidence_ref: 'FIXTURE_MAP_IDENTITY_NOT_NATIVE', model_evidence_ref: 'FIXTURE_MODEL_NOT_NATIVE',
    venue: 'AGGREGATED_CEX', market_id: 'SWOLE:BTC', price_quote: 'USD',
    magnitude: {kind: 'RELATIVE', field: 'usd', scale_id: 'FIXTURE_MODEL_SCALE', evidence_ref: 'FIXTURE_SCALE_NOT_NATIVE'},
    price_mapping: {from_quote: 'USD', to_quote: 'USDT', from_market_id: 'SWOLE:BTC', to_instrument_id: entry.instrument.instrument_id,
      multiplier_to_bingx: 2, event_ts: T - 1000, expires_ts: T + 10000, evidence_ref: 'FIXTURE_BASIS_NOT_NATIVE'}};
}
function fixtureBody(kind, query) {
  const symbol = query.searchParams.get('symbol') ?? 'BTC-USDT';
  if (kind === 'catalog') return {code: 0, data: [{symbol: 'BTC-USDT', asset: 'BTC', currency: 'USDT', contractId: 'FIXTURE_BTC', status: 1}]};
  if (kind === 'price') return {code: 0, data: [{symbol, price: '101.50', time: T - 1000}]};
  if (kind === 'ticker') return {code: 0, data: [{symbol, lastPrice: '101.5', openPrice: '80', closeTime: T - 1000, quoteVolume: '100000', volume: '999', priceChangePercent: '26.875'}]};
  if (kind === 'candles') {
    const count = Number(query.searchParams.get('limit')), start = Number(query.searchParams.get('startTime'));
    const end = Number(query.searchParams.get('endTime'));
    return {code: 0, data: Array.from({length: count}, (_, i) => ({time: start + i * 60000, open: '100', high: '102', low: '99', close: '101', volume: '10'}))
      .filter(row => row.time <= end).reverse()};
  }
  if (kind === 'orderbook') return {code: 0, data: {T: T - 1000, bids: [['100', '500']], asks: [['102', '600']], bidsCoin: [['100', '5']], asksCoin: [['102', '6']]}};
  if (kind === 'open_interest') return {code: 0, data: {symbol, openInterest: '200', time: T - 1000}};
  if (kind === 'funding') return {code: 0, data: {symbol, markPrice: '101.5', indexPrice: '101.4', lastFundingRate: '0.0001', fundingIntervalHours: 8, updateTime: T - 1000, nextFundingTime: T + 100000}};
  return {coin: 'BTC', estimated: true, has_data: true, model_version: 'FIXTURE_MODEL', as_of: T - 1000, price: 100,
    range: '24h', levels: {long: [{lo: 80, mid: 85, hi: 90, usd: 25}]}};
}
const paths = {contracts: 'catalog', ticker: 'ticker', price: 'price', klines: 'candles', depth: 'orderbook', openInterest: 'open_interest', premiumIndex: 'funding'};
function setup({entries = [registry()], handle, time = T} = {}) {
  const calls = [];
  const broker = {request: async request => {
    calls.push(structuredClone(request));
    const url = new URL(request.url), kind = request.provider === 'SWOLECHARTS' ? 'liquidations' : paths[url.pathname.split('/').at(-1)];
    assert.ok(kind, 'only known fixture routes');
    const response = {ok: true, status: 200, data: fixtureBody(kind, url), headers: {}, received_ts: time, cache_hit: false, receipt_id: `FIXTURE_RECEIPT_${calls.length}`};
    return handle ? await handle({request, kind, url, response, calls}) : response;
  }};
  return {sources: createPumpSources({broker, identityRegistry: entries, clock: () => time, profile: START_PROFILE}), calls};
}

test('catalog verifies independent asset identity; active status and provider claims cannot qualify a ticker', async () => {
  const {sources} = setup({handle: ({response}) => ({...response, data: {code: 0, data: [
    {symbol: 'BTC-USDT', asset: 'BTC', currency: 'USDT', contractId: 'FIXTURE_BTC', status: 1},
    {symbol: 'UNKNOWN-USDT', asset: 'UNKNOWN', currency: 'USDT', contractId: 'OTHER', status: 1, classification_status: 'VERIFIED_CRYPTO'},
    {symbol: 'BTC-USDC', asset: 'BTC', currency: 'USDC', contractId: 'OTHER', status: 1},
    {symbol: 'BTC-USD', asset: 'BTC', currency: 'BTC', status: 1}]}})});
  const result = await sources.getCatalog({run_id: 'FIXTURE'});
  assert.equal(result.instruments.length, 1);
  assert.deepEqual(result.unqualified.map(x => x.reason), ['CRYPTO_ASSET_IDENTITY_UNQUALIFIED', 'NON_USDT_SETTLEMENT', 'NON_USDT_SETTLEMENT']);
  assert.equal(result.coverage.qualified, 1); assert.equal(result.coverage.unqualified, 3);
});

test('duplicate catalog rows and ambiguous registry identities invalidate all duplicates', async () => {
  const duplicate = setup({handle: ({response}) => ({...response, data: {code: 0, data: [...response.data.data, ...response.data.data]}})});
  const result = await duplicate.sources.getCatalog();
  assert.equal(result.instruments.length, 0); assert.equal(result.unqualified.length, 2);
  const ambiguous = setup({entries: [registry(), registry()]});
  assert.equal((await ambiguous.sources.getCatalog()).instruments.length, 0);
  assert.equal(ambiguous.sources.getCoverage().totals.registry_verified_instruments, 0);
  const gold = setup({entries: [registry('PAXG')]});
  assert.equal(gold.sources.getCoverage().totals.registry_verified_instruments, 0);
});

test('core returns usable typed price, closed one-minute volume and base-quantity book with registry proofs', async () => {
  const {sources, calls} = setup();
  const result = await sources.getCore({instrument: btc(), run_id: 'FIXTURE', mode: 'MANUAL'});
  assert.equal(result.coverage.status, 'USABLE'); assert.equal(calls.length, 3);
  const {price, candles, orderbook} = result.facts;
  assert.equal(price.value, 101.5); assert.equal(price.event_ts, T - 1000);
  assert.equal(price.expires_ts, T - 1000 + 30000);
  assert.equal(candles.value.length, 121); assert.equal(candles.event_ts, E);
  assert.equal(candles.value.at(-1).close_ts, E); assert.equal(candles.value[0].volume_base, 10);
  assert.equal(candles.value[0].turnover_quote, null);
  assert.deepEqual(orderbook.value, {bids: [[100, 5]], asks: [[102, 6]]});
  assert.equal(orderbook.coverage.complete_book, null);
  assert.equal(new URL(calls.find(call => call.url.includes('/depth')).url).searchParams.get('limit'), '1000');
  assert.equal(orderbook.venue, 'BINGX');
  for (const call of calls) { assert.deepEqual(call.estimated_cost, {http: 1}); assert.equal(call.provider, 'BINGX'); assert.equal(call.family, 'USDT_M'); }
});

test('payload booleans do not qualify candle clocks or units and unknown values remain null', async () => {
  const entry = registry(); entry.qualifications = {};
  const {sources} = setup({entries: [entry], handle: ({response}) => ({...response, data: {...response.data,
    closed_ohlcv_qualified: true, volume_unit: 'USDT', quantity_unit: 'BASE_ASSET'}})});
  const result = await sources.getCore({instrument: btc()});
  assert.equal(result.facts.candles.status, 'INCOMPLETE');
  assert.equal(result.facts.candles.event_ts, null);
  assert.ok(result.facts.candles.value.every(c => c.closed === false && c.volume_base === null && c.close_ts === null));
  assert.equal(result.facts.orderbook.status, 'INCOMPLETE'); assert.equal(result.facts.orderbook.value, null);
});

test('missing and duplicate candle windows are rejected honestly; current open row is excluded', async () => {
  const missing = setup({handle: ({kind, response}) => {
    if (kind === 'candles') response.data.data.splice(40, 1); return response;
  }});
  const a = (await missing.sources.getCore({instrument: btc()})).facts.candles;
  assert.equal(a.status, 'USABLE'); assert.equal(a.coverage.gaps.length, 1);
  assert.equal(a.coverage.internal_gaps.length, 1); assert.equal(a.coverage.history_state, 'INTERNAL_GAPS_TRIMMED_TO_CONTIGUOUS_TAIL');
  assert.equal(a.value.length, a.coverage.contiguous_tail.closed_bars);
  const duplicate = setup({handle: ({kind, response}) => {
    if (kind === 'candles') response.data.data.push(response.data.data[0]); return response;
  }});
  assert.equal((await duplicate.sources.getCore({instrument: btc()})).facts.candles.reason, 'BINGX_DUPLICATE_CANDLE_TIME');
  const open = setup({handle: ({kind, response}) => {
    if (kind === 'candles') response.data.data.push({time: E, open: '101', high: '102', low: '100', close: '101', volume: '2'}); return response;
  }});
  assert.equal((await open.sources.getCore({instrument: btc()})).facts.candles.value.length, 121);
});

test('a cached forming candle never becomes a closed bar merely because time has passed', async () => {
  const {sources} = setup({handle: ({kind, response}) => {
    if (kind === 'candles') { response.received_ts = E - 1; response.cache_hit = true; } return response;
  }});
  const candles = (await sources.getCore({instrument: btc()})).facts.candles;
  assert.equal(candles.status, 'USABLE'); assert.equal(candles.reason, 'LATEST_REQUESTED_BAR_NOT_RECEIVED_CLOSED');
  assert.deepEqual(candles.coverage.gaps, [E - 60000]);
  assert.equal(candles.event_ts, E - 60000);
  assert.ok(candles.value.every(candle => candle.close_ts <= candles.received_ts));
});

test('book contract multiplier is applied once; crossed or unknown quantities cannot execute', async () => {
  const entry = registry(); entry.qualifications.orderbook = {fields: 'STANDARD', unit: 'CONTRACTS', base_per_contract: 0.01, evidence_ref: 'FIXTURE_MULTIPLIER_NOT_NATIVE'};
  const {sources} = setup({entries: [entry]});
  assert.deepEqual((await sources.getCore({instrument: btc()})).facts.orderbook.value, {bids: [[100, 5]], asks: [[102, 6]]});
  const crossed = setup({handle: ({kind, response}) => { if (kind === 'orderbook') response.data.data.asksCoin = [['99', '6']]; return response; }});
  assert.equal((await crossed.sources.getCore({instrument: btc()})).facts.orderbook.reason, 'BINGX_CROSSED_OR_LOCKED_DEPTH');
});

test('cache re-download preserves source and receipt ages; stale LAST fallback remains stale', async () => {
  const old = T - 120000;
  const {sources, calls} = setup({handle: ({kind, response}) => {
    if (kind === 'price' || kind === 'ticker') {
      response.data.data[0][kind === 'price' ? 'time' : 'closeTime'] = old;
      response.received_ts = old + 1000; response.cache_hit = true;
    } return response;
  }});
  const price = (await sources.getCore({instrument: btc()})).facts.price;
  assert.equal(price.status, 'STALE'); assert.equal(price.event_ts, old); assert.equal(price.received_ts, old + 1000);
  assert.equal(price.expires_ts, old + 30000); assert.equal(price.cache_hit, true); assert.equal(calls.length, 4);
});

test('fallback replaces the same last-price fact when its primary source clock is absent', async () => {
  const {sources, calls} = setup({handle: ({kind, response}) => { if (kind === 'price') delete response.data.data[0].time; return response; }});
  const price = (await sources.getCore({instrument: btc()})).facts.price;
  assert.equal(price.status, 'USABLE'); assert.equal(price.value, 101.5); assert.equal(calls.length, 4);
  assert.equal(price.fallback_reason, 'SOURCE_EVENT_CLOCK_UNKNOWN');
});

test('future source clock fails without laundering it through another price route', async () => {
  const {sources, calls} = setup({handle: ({kind, response}) => { if (kind === 'price') response.data.data[0].time = T + 100; return response; }});
  const result = await sources.getCore({instrument: btc()});
  assert.equal(result.facts.price.status, 'ERROR'); assert.equal(result.facts.price.value, null);
  assert.equal(result.facts.price.reason, 'SOURCE_EVENT_CLOCK_FUTURE'); assert.equal(calls.length, 3);
});

test('one failed instrument leaves its other facts and another instrument usable', async () => {
  const other = registry('SOL');
  const {sources} = setup({entries: [registry(), other], handle: ({kind, url, response}) => {
    if (kind === 'price' && url.searchParams.get('symbol') === 'BTC-USDT') response.data.data[0].symbol = 'DIFFERENT-USDT'; return response;
  }});
  const a = await sources.getCore({instrument: btc()}), b = await sources.getCore({instrument: other.instrument});
  assert.equal(a.facts.price.status, 'ERROR'); assert.equal(a.facts.candles.status, 'USABLE');
  assert.equal(b.coverage.status, 'USABLE');
});

test('budget denial stops price fallback, preserves unknown costs and never substitutes zeros', async () => {
  const {sources, calls} = setup({handle: () => { throw Object.assign(new Error('fixture'), {code: 'RUN_HTTP_EXHAUSTED'}); }});
  const core = await sources.getCore({instrument: btc()});
  assert.equal(calls.length, 3);
  assert.ok(Object.values(core.facts).every(fact => fact.status === 'NOT_CHECKED' && fact.value === null));
  assert.equal(sources.getCoverage().actual_provider_cost, null); assert.equal(sources.getCoverage().totals.core_checked, 0);
  assert.equal(SOURCE_HTTP_PLAN.six_manual_checks_reserved, false);
});

test('the coordinator synchronous identity resolver supplies independent entries, never provider classification', async () => {
  const queries = [];
  const broker = {request: async request => {
    const url = new URL(request.url), kind = paths[url.pathname.split('/').at(-1)];
    return {ok: true, status: 200, data: fixtureBody(kind, url), received_ts: T, cache_hit: false, receipt_id: 'FIXTURE_RESOLVED_' + kind};
  }};
  const sources = createPumpSources({broker, clock: () => T, identityRegistry: {resolve: query => {
    queries.push(query); return query.native_symbol === 'BTC-USDT' ? registry() : null;
  }}});
  assert.equal((await sources.getCatalog()).instruments.length, 1);
  assert.equal((await sources.getCore({instrument: btc()})).coverage.status, 'USABLE');
  assert.deepEqual(queries[0], {native_symbol: 'BTC-USDT', native_contract_id: 'FIXTURE_BTC', venue: 'BINGX', market_type: 'PERPETUAL', quote: 'USDT', settle: 'USDT'});
});

test('six newly listed closed minutes remain usable while a recent internal hole reduces usable windows', async () => {
  const short = setup({handle: ({kind, response}) => { if (kind === 'candles') response.data.data = response.data.data.slice(0, 6); return response; }});
  const a = (await short.sources.getCore({instrument: btc()})).facts.candles;
  assert.equal(a.status, 'USABLE'); assert.equal(a.coverage.complete, false); assert.equal(a.coverage.internal_gaps.length, 0);
  assert.equal(a.coverage.history_state, 'SHORT_CONTIGUOUS_HISTORY'); assert.equal(a.coverage.available_start, E - 6 * 60000);
  assert.deepEqual(a.coverage.usable_windows.map(window => window.window_ms), [300000]);
  const hole = setup({handle: ({kind, response}) => { if (kind === 'candles') response.data.data.splice(2, 1); return response; }});
  const b = (await hole.sources.getCore({instrument: btc()})).facts.candles;
  assert.equal(b.coverage.internal_gaps.length, 1); assert.equal(b.value.length, 2);
  assert.deepEqual(b.coverage.usable_windows, []); assert.equal(b.coverage.contiguous_tail.duration_ms, 120000);
});

test('HTTP-200 provider rate-limit envelope stops fallback and retains its broker evidence', async () => {
  const {sources, calls} = setup({handle: ({kind, response}) => kind === 'price' ? {...response, data: {code: 100410}} : response});
  const core = await sources.getCore({instrument: btc()});
  assert.equal(core.facts.price.status, 'NOT_CHECKED'); assert.equal(core.facts.price.reason, 'BINGX_RATE_LIMITED');
  assert.equal(core.facts.price.evidence_ref, 'FIXTURE_RECEIPT_1'); assert.equal(calls.length, 3);
});

test('overview separates preliminary percentages from qualified rolling-24h facts', async () => {
  const {sources} = setup();
  const result = await sources.getOverview({instruments: [btc()]});
  assert.equal(result.observations[0].reported_change_pct, 26.875);
  assert.equal(result.observations[0].facts.price.status, 'USABLE');
  assert.equal(result.observations[0].facts.ticker_24h.status, 'INCOMPLETE');
  assert.equal(result.observations[0].facts.ticker_24h.value.open, null);
  assert.equal(sources.getCoverage().totals.overview_price_usable, 1);
});

test('fresh overview LAST is reused by core with the same original fact and clocks', async () => {
  const {sources, calls} = setup();
  const overview = await sources.getOverview({instruments: [btc()]});
  const core = await sources.getCore({instrument: btc()});
  assert.equal(calls.length, 3); // one bulk ticker, one candle window, one depth
  assert.equal(core.facts.price.fact_id, overview.observations[0].facts.price.fact_id);
  assert.equal(core.facts.price.event_ts, T - 1000); assert.equal(core.facts.price.reused_from_overview, true);
});

test('an invalid bulk row or one missing symbol does not discard another instrument', async () => {
  const other = registry('SOL');
  const {sources} = setup({entries: [registry(), other], handle: ({kind, response}) => {
    if (kind === 'ticker') response.data.data.push(null); return response;
  }});
  const overview = await sources.getOverview({instruments: [btc(), other.instrument]});
  assert.equal(overview.observations[0].facts.price.status, 'USABLE');
  assert.equal(overview.observations[1].facts.ticker_24h.status, 'ERROR');
  assert.equal(overview.coverage.invalid_response_rows, 1);
});

test('future candle rows and HTTP access denial cannot qualify core data or trigger a price retry', async () => {
  const {sources, calls} = setup({handle: ({kind, response}) => {
    if (kind === 'candles') response.data.data.push({time: E + 60000, open: '100', high: '102', low: '99', close: '101', volume: '10'});
    if (kind === 'price') return {...response, ok: false, status: 403};
    return response;
  }});
  const core = await sources.getCore({instrument: btc()});
  assert.equal(core.facts.price.reason, 'SOURCE_ACCESS_BLOCKED');
  assert.equal(core.facts.candles.reason, 'BINGX_CANDLE_FIELDS_INVALID');
  assert.equal(core.facts.price.evidence_ref, 'FIXTURE_RECEIPT_1'); assert.equal(calls.length, 3);
});

test('optional OI unit stays unknown and funding metadata update is not the rate clock', async () => {
  const {sources, calls} = setup();
  const result = await sources.getOptional({instrument: btc()});
  assert.equal(calls.length, 0); assert.equal(result.facts.open_interest.value, null);
  assert.equal(result.facts.open_interest.unit, null); assert.equal(result.facts.funding.event_ts, null);
  assert.equal(result.facts.funding.value, null); assert.equal(result.facts.funding.status, 'NOT_CHECKED');
  assert.equal(result.facts.trades.status, 'NOT_CHECKED'); assert.equal(result.facts.market_context.value, null);
  const nativeFunding = parseFunding(fixtureBody('funding', new URL('https://fixture.invalid?symbol=BTC-USDT')), btc());
  assert.equal(nativeFunding.event_ts, null); assert.equal(nativeFunding.value.period_ms, 8 * 3600000);
  const nativeOi = parseOpenInterest(fixtureBody('open_interest', new URL('https://fixture.invalid?symbol=BTC-USDT')), btc());
  assert.equal(nativeOi.value, null); assert.equal(nativeOi.native_value_decimal, '200');
});

test('qualified optional inputs use their own source clocks and units via the common broker', async () => {
  const entry = registry(); entry.qualifications.open_interest = {unit: 'CONTRACTS', evidence_ref: 'FIXTURE_OI_UNIT_NOT_NATIVE'};
  entry.qualifications.funding = {rate_clock_field: 'rateTime', evidence_ref: 'FIXTURE_RATE_TIME_NOT_NATIVE'};
  const {sources, calls} = setup({entries: [entry], handle: ({kind, response}) => {
    if (kind === 'funding') response.data.data.rateTime = T - 1000; return response;
  }});
  const {facts} = await sources.getOptional({instrument: btc()});
  assert.equal(calls.length, 2); assert.equal(facts.open_interest.status, 'USABLE'); assert.equal(facts.open_interest.unit, 'CONTRACTS');
  assert.equal(facts.funding.status, 'USABLE'); assert.equal(facts.funding.event_ts, T - 1000);
});

test('no configured or POST-only map route causes no HTTP and does not block core', async () => {
  const entry = registry(); entry.liquidations = {routes: [{provider: 'ORDERLY'}]};
  const {sources, calls} = setup({entries: [entry]});
  const map = await sources.getLiquidations({instrument: btc(), reference_price: 101});
  assert.equal(map.status, 'NOT_CHECKED'); assert.equal(map.reason, 'POST_BODY_NOT_IN_BROKER_CONTRACT'); assert.equal(calls.length, 0);
  assert.equal((await sources.getCore({instrument: btc()})).coverage.status, 'USABLE');
});

test('one-sided model preserves scale, venue and original bounds without invented dollar amounts', async () => {
  const entry = registry(); entry.liquidations = {routes: [mapRoute(entry)]};
  const {sources, calls} = setup({entries: [entry]});
  const map = await sources.getLiquidations({instrument: btc(), reference_price: 200, deadline_ts: T + 5000});
  assert.equal(map.status, 'PARTIAL'); assert.equal(map.zones.length, 1); assert.equal(calls.length, 1);
  assert.equal(calls[0].family, 'LIQUIDATIONS'); assert.equal(calls[0].candidate_id, btc().instrument_id);
  const zone = map.zones[0]; assert.equal(zone.venue, 'AGGREGATED_CEX'); assert.equal(zone.lower, 160); assert.equal(zone.native_lower, 80);
  assert.equal(zone.magnitude_value, 25); assert.equal(zone.magnitude_unit, 'RELATIVE_INTENSITY'); assert.equal(zone.usable, true);
  assert.deepEqual(zone.position_ids, []); assert.equal(zone.relative_scale.source_field, 'usd');
  assert.equal(zone.price_currency, 'USDT'); assert.equal(zone.price_comparability.status, 'VERIFIED'); assert.equal(zone.model_version, 'FIXTURE_MODEL');
  assert.equal(sources.getCoverage().totals.map_usable, 1);
});

test('unqualified basis or scale retains diagnostic zones but makes them unusable', async () => {
  const entry = registry(), route = mapRoute(entry); delete route.price_mapping; delete route.magnitude;
  entry.liquidations = {routes: [route]};
  const {sources} = setup({entries: [entry]});
  const map = await sources.getLiquidations({instrument: btc(), reference_price: 100});
  assert.equal(map.status, 'ABSENT'); assert.equal(map.zones[0].usable, false);
  assert.equal(map.zones[0].magnitude_value, null); assert.equal(map.zones[0].magnitude_unit, null);
  assert.ok(map.zones[0].limitations.includes('NOT_FOR_EXACT_BINGX_ORDERS'));
});

test('negative map response differs from not checked; old map does not get a new source clock', async () => {
  const entry = registry(); entry.liquidations = {routes: [mapRoute(entry)]};
  const absent = setup({entries: [entry], handle: ({response}) => ({...response, data: {coin: 'BTC', has_data: false}})});
  assert.equal((await absent.sources.getLiquidations({instrument: btc(), reference_price: 100})).reason, 'SOURCE_REPORTS_NO_MAP');
  assert.equal(absent.sources.getCoverage().totals.map_checked, 1);
  const stale = setup({entries: [entry], handle: ({response}) => { response.data.as_of = T - 400000; return response; }});
  assert.equal((await stale.sources.getLiquidations({instrument: btc(), reference_price: 100})).status, 'STALE');
});

test('map quota denial and bounded timeout preserve unknown attempt accounting and do not retry', async () => {
  const entry = registry(); entry.liquidations = {routes: [mapRoute(entry)]};
  const denied = setup({entries: [entry], handle: () => { throw Object.assign(new Error('fixture'), {code: 'MAP_QUOTA_EXHAUSTED'}); }});
  const deniedMap = await denied.sources.getLiquidations({instrument: btc(), reference_price: 100});
  assert.equal(deniedMap.status, 'NOT_CHECKED_BUDGET'); assert.equal(denied.calls.length, 1);
  assert.equal(denied.sources.getCoverage().totals.map_checked, 0);
  assert.equal(deniedMap.coverage.spent_or_unknown_not_refunded, true);
  const timeout = setup({entries: [entry], handle: () => new Promise(() => {})});
  assert.equal((await timeout.sources.getLiquidations({instrument: btc(), reference_price: 100, deadline_ts: T + 5})).status, 'TIMEOUT');
  assert.equal(timeout.calls.length, 1);
});

test('foreign asset maps are rejected and source cache keys are reused across manual/automatic runs', async () => {
  const entry = registry(); entry.liquidations = {routes: [mapRoute(entry)]};
  const wrong = setup({entries: [entry], handle: ({response}) => ({...response, data: {...response.data, coin: 'OTHER'}})});
  assert.equal((await wrong.sources.getLiquidations({instrument: btc(), reference_price: 100})).reason, 'SWOLE_EXACT_ASSET_MODEL_REQUIRED');
  const {sources, calls} = setup();
  await sources.getCore({instrument: btc(), mode: 'AUTO', run_id: 'A'});
  await sources.getCore({instrument: btc(), mode: 'MANUAL', run_id: 'B'});
  assert.deepEqual(calls.slice(0, 3).map(c => c.cache_key), calls.slice(3, 6).map(c => c.cache_key));
});

test('existing overview price is validated by identity, units, clocks and provenance; stale claimed-USABLE is fetched again', async () => {
  const source = setup(), overview = await source.sources.getOverview({instruments: [btc()]});
  const existing = overview.observations[0].facts;
  const next = setup(), result = await next.sources.getCore({instrument: btc(), existing_facts: existing});
  assert.equal(next.calls.length, 2); assert.equal(result.facts.price.reused_from_existing_facts, true);
  assert.equal(result.facts.price.fact_id, existing.price.fact_id);
  const stale = structuredClone(existing); stale.price.event_ts = T - 120000; stale.price.expires_ts = T + 999999;
  const check = setup(); await check.sources.getCore({instrument: btc(), existing_facts: stale}); assert.equal(check.calls.length, 3);
  const wrongUnit = structuredClone(existing); wrongUnit.price.unit = 'USD_PER_BASE';
  const mismatch = setup(); await mismatch.sources.getCore({instrument: btc(), existing_facts: wrongUnit}); assert.equal(mismatch.calls.length, 3);
});

test('selected force refresh bypasses source reuse and broker TTL without redownloading candles', async () => {
  const {sources, calls} = setup();
  const normal = await sources.getCore({instrument: btc()});
  await sources.getOverview({instruments: [btc()]});
  const before = calls.length;
  const fresh = await sources.getCore({instrument: btc(), force_refresh: true, only_facts: ['price', 'orderbook']});
  assert.equal(calls.length - before, 2); assert.ok(calls.slice(before).every(call => call.ttl_ms === 0));
  assert.deepEqual(Object.keys(fresh.facts), ['price', 'orderbook']);
  assert.equal(fresh.facts.price.event_ts, normal.facts.price.event_ts);
  assert.equal(fresh.facts.price.expires_ts, normal.facts.price.expires_ts);
  assert.ok(calls.slice(0, 3).every(call => call.ttl_ms > 0));
  await assert.rejects(sources.getCore({instrument: btc(), only_facts: ['funding']}), /INVALID_CORE_FACT_SELECTION/);
  assert.equal(calls.length - before, 2);
});

test('delivery refresh never spends a third fallback request when its primary price fails', async () => {
  const {sources, calls} = setup({handle: ({kind, response}) => { if (kind === 'price') delete response.data.data[0].time; return response; }});
  const result = await sources.getCore({instrument: btc(), force_refresh: true, only_facts: ['price', 'orderbook']});
  assert.equal(calls.length, 2); assert.equal(result.facts.price.status, 'INCOMPLETE');
});

test('one historical request covers an old four-hour window without pretending it is a live-price fact', async () => {
  const {sources, calls} = setup();
  const result = await sources.getOutcomeHistory({instrument: btc(), start_ts: E - 6 * 3600000, end_ts: E - 2 * 3600000});
  assert.equal(calls.length, 1); assert.equal(result.facts.candles.status, 'USABLE'); assert.equal(result.facts.candles.expires_ts, null);
  assert.equal(result.facts.candles.event_ts, E - 2 * 3600000); assert.equal(result.facts.candles.value.length, 240);
  assert.equal(result.coverage.complete, true); assert.equal(result.coverage.boundary_ambiguity, false);
  assert.equal(new URL(calls[0].url).searchParams.get('limit'), '241');
});

test('outcome boundary highs are not exact HIT proof; internal holes and unfinished periods remain explicit', async () => {
  const {sources} = setup();
  const end = E - 60000 + 456, start = end - 4 * 3600000;
  const boundary = await sources.getOutcomeHistory({instrument: btc(), start_ts: start, end_ts: end});
  assert.equal(boundary.coverage.boundary_candles.length, 2); assert.equal(boundary.coverage.complete, true);
  assert.equal(boundary.facts.candles.value[0].high_is_exact_period_hit_eligible, false);
  assert.equal(boundary.facts.candles.value.at(-1).high_is_exact_period_hit_eligible, false);
  const missing = setup({handle: ({kind, response}) => { if (kind === 'candles') response.data.data.splice(100, 1); return response; }});
  const hole = await missing.sources.getOutcomeHistory({instrument: btc(), start_ts: E - 4 * 3600000, end_ts: E});
  assert.equal(hole.coverage.complete, false); assert.equal(hole.coverage.internal_gaps.length, 1);
  assert.equal(hole.facts.candles.value.length, 239); // keep facts on both sides for a genuine HIT if one exists
  const unfinished = await sources.getOutcomeHistory({instrument: btc(), start_ts: E - 60000, end_ts: E + 3 * 3600000});
  assert.equal(unfinished.coverage.period_finished, false); assert.equal(unfinished.coverage.complete, false);
  assert.ok(unfinished.facts.candles.value.every(candle => candle.close_ts <= unfinished.facts.candles.received_ts));
});

test('outcome span is bounded before HTTP and volume unknown does not invent units in qualified historical OHLC', async () => {
  const entry = registry(); delete entry.qualifications.candles.volume;
  const {sources, calls} = setup({entries: [entry]});
  await assert.rejects(sources.getOutcomeHistory({instrument: btc(), start_ts: E - 1441 * 60000, end_ts: E}), /1440/);
  assert.equal(calls.length, 0);
  const result = await sources.getOutcomeHistory({instrument: btc(), start_ts: E - 4 * 3600000, end_ts: E});
  assert.equal(result.facts.candles.status, 'USABLE'); assert.ok(result.facts.candles.value.every(candle => candle.volume_base === null));
  assert.equal(result.coverage.volume_qualified, false); assert.equal(result.facts.candles.unit, 'OHLC_USDT');
});
