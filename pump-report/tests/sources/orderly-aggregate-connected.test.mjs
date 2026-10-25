import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPumpSources} from '../../sources/index.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {createUnifiedBudget, createRequestBroker} from '../../runtime/budget.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {selectZones} from '../../analytics/zones.mjs';
import {ORDERLY_POSITIONS_BODY, ORDERLY_QUERY_URL} from '../../sources/orderly-observed-positions.mjs';

const originals = JSON.parse(fs.readFileSync(new URL('../../sources/registry-curated13-native-relative-v1.json', import.meta.url)));
const T = 1800100000000;
const row = (symbol = 'PERP_SOL_USDC', id = 'ARTIFICIAL_SOL_POSITION', extra = {}) => ({symbol, position_id: id,
  side: 'LONG', margin_mode: 'CROSS', mark_price: '100', est_liq_price: '90', notional: '70000',
  opened_at: T - 999999999, ...extra});
const body = (rows = [row()], extra = {}) => ({success: true, ts: T - 100, data: {rows, total_positions: 1000, next_cursor: 'ARTIFICIAL_NEXT_PAGE', ...extra}});
function fixtures() {
  const entries = ['SOL', 'ADA', 'XRP'].map(base => structuredClone(originals.instruments.find(e => e.instrument.base === base)));
  const bindings = entries.map(e => {
    const i = e.instrument; i.canonical_cross_venue_identity_qualified = true;
    return {status: 'VERIFIED_SAME_UNDERLYING', evidence_ref: 'ARTIFICIAL_INDEPENDENT_IDENTITY_NOT_NATIVE',
      bingx_instrument_id: i.instrument_id, bingx_asset_id: i.asset_id, bingx_identity_evidence_ref: i.identity_evidence_ref,
      source_venue: 'ORDERLY', source_symbol: 'PERP_' + i.base + '_USDC', source_market_id: 'ARTIFICIAL_ORDERLY_' + i.base,
      price_quote: 'USDC', price_quote_evidence_ref: 'ARTIFICIAL_NATIVE_CURRENCY_PROOF',
      position_semantics: {evidence_ref: 'ARTIFICIAL_POSITION_FIELD_REVIEW', side_field: 'side', long_value: 'LONG', short_value: 'SHORT',
        liquidation_price_field: 'est_liq_price', liquidation_price_kind: 'ESTIMATED_CURRENT_OPEN_POSITION_LIQUIDATION_PRICE'},
      position_identity: {kind: 'SOURCE_STABLE_POSITION_ID', scope: 'PLATFORM_UNIQUE_CURRENT_POSITION', field: 'position_id',
        evidence_ref: 'ARTIFICIAL_FIXTURE_ID_FIELD_NOT_A_VENDOR_FIELD_CLAIM'},
      position_value: {field: 'notional', unit: 'USDC', evidence_ref: 'ARTIFICIAL_REPORTED_NOTIONAL_UNIT'},
      price_mapping: {kind: 'EXPLICIT_QUOTE_RATE_AND_VENUE_PRICE_BASIS', evidence_ref: 'ARTIFICIAL_MAPPING_NOT_NATIVE',
        quote_conversion_evidence_ref: 'ARTIFICIAL_USDC_RATE', price_basis_evidence_ref: 'ARTIFICIAL_VENUE_BASIS',
        from_market_id: 'ARTIFICIAL_ORDERLY_' + i.base, to_instrument_id: i.instrument_id,
        from_quote: 'USDC', to_quote: 'USDT', from_price_basis: 'ORDERLY_EST_LIQ_PRICE', to_price_basis: 'BINGX_NATIVE_PRICE',
        quote_rate_to_usdt: 0.99, venue_price_basis_multiplier: 1.02, event_ts: T - 1000, expires_ts: T + 10000}};
  });
  const route = {provider: 'ORDERLY', market_bindings: bindings};
  for (const e of entries) e.liquidations = {routes: [route]};
  return {entries, bindings, route};
}
async function setup(payload = body(), change = () => {}, {admitBody = true, profile = START_PROFILE} = {}) {
  const f = fixtures(); change(f);
  let now = T, fetches = 0;
  const store = new MemoryStore(), version = 'ARTIFICIAL_F565_READ_ONLY', day = new Date(T).toISOString().slice(0, 10), month = day.slice(0, 7);
  const previousUnknown = {ARTIFICIAL_OLD_UNKNOWN: {provider: 'ORDERLY', cost: 1, run_id: 'ARTIFICIAL_PREVIOUS'}};
  await store.set('pump:resources', {schema: 'PUMP_SHARED_RESOURCE_V1', days: {[day]: 1},
    providers: {ORDERLY: {days: {[day]: 1}, months: {[month]: 1}, recent: []}}, outstanding: {}, unknown: previousUnknown});
  const policy = {version, evidence_ref: 'ARTIFICIAL_EXACT_POST_ADMISSION', allowed_hosts: ['api.orderly.org'], allowed_paths: ['/v1/public/query'],
    project_daily_cap: 900, project_monthly_cap: 27900, per_minute_cap: 10,
    readonly_json_post_templates: [{method: 'POST', read_only: true, path: '/v1/public/query',
      body: admitBody ? ORDERLY_POSITIONS_BODY : {type: 'platformPositions', min_notional: '0', limit: 499}}]};
  const budget = createUnifiedBudget({store, run_id: 'ARTIFICIAL_ORDERLY_AGGREGATE', mode: 'MANUAL', clock: () => now,
    policies: {ORDERLY: policy}, protected_reserves: {http_by_provider: {ORDERLY: 0}, delivery_http: 0, outcomes_http: 0},
    admission: {provider_policy_version: version, expires_ts: T + 60000, max_http_attempts: 1, run_purpose: 'PRODUCTION'}});
  const broker = createRequestBroker({store, budget, clock: () => now, max_response_bytes: 2000000,
    fetch_impl: async (url, request) => {
      fetches++; assert.equal(url, ORDERLY_QUERY_URL); assert.equal(request.method, 'POST'); assert.equal(request.redirect, 'manual');
      assert.deepEqual(JSON.parse(request.body), ORDERLY_POSITIONS_BODY); assert.equal(Object.hasOwn(JSON.parse(request.body), 'symbol'), false);
      assert.ok(request.signal); return new Response(JSON.stringify(payload), {status: 200});
    }});
  const source = createPumpSources({identityRegistry: f.entries, broker, clock: () => now, profile});
  return {...f, source, budget, store, previousUnknown, fetches: () => fetches, advance: n => {now += n;},
    run: (base = 'SOL', deadline_ts) => source.getLiquidations({instrument: f.entries.find(e => e.instrument.base === base).instrument,
      reference_price: 100, deadline_ts})};
}

test('one bounded aggregate Orderly POST through the real broker serves multiple Source targets, preserves honest clocks and rejects incomplete boundaries', async () => {
  const originalsBefore = JSON.stringify(originals);
  const good = await setup(body([row(), row('PERP_ADA_USDC', 'ARTIFICIAL_ADA_POSITION', {side: 'SHORT', est_liq_price: '110'})]));
  const [sol, ada, missing] = await Promise.all([good.run('SOL'), good.run('ADA'), good.run('XRP')]);
  assert.equal(good.fetches(), 1); assert.equal(good.budget.summary().total, 1);
  assert.equal(sol.coverage.receipt_id, ada.coverage.receipt_id); assert.equal(sol.coverage.receipt_id, missing.coverage.receipt_id);
  assert.equal(sol.status, 'PARTIAL'); assert.equal(missing.status, 'NOT_CHECKED');
  assert.equal(missing.reason, 'TARGET_NOT_CHECKED_BEYOND_BOUNDED_FIRST_PAGE');
  assert.equal(sol.coverage.has_next_cursor, true); assert.equal(sol.coverage.pagination, 'PARTIAL_NO_AUTOPAGES');
  assert.equal(sol.coverage.native_position_observations.length, 1); assert.equal(ada.coverage.native_position_observations.length, 1);
  const observation = sol.coverage.native_position_observations[0];
  assert.equal(observation.basis_type, 'OBSERVED_POSITION'); assert.equal(observation.venue, 'ORDERLY');
  assert.equal(observation.native_est_liq_price, 90); assert.equal(observation.native_notional_unit, 'USDC');
  assert.equal(observation.native_reported_position_notional, 70000); assert.equal(observation.projected_position_notional_usdt, 69300);
  assert.ok(Math.abs(observation.projected_bingx_liquidation_price_usdt - 90 * 0.99 * 1.02) < 1e-10);
  assert.equal(observation.event_ts, null); assert.equal(observation.generation_event_ts, null); assert.equal(observation.expires_ts, null);
  assert.equal(observation.source_response_ts, T - 100); assert.equal(observation.source_asof_bound.earliest_ts, T - 5100);
  assert.equal(observation.source_asof_bound.latest_ts, T - 100); assert.equal(observation.conservative_bound_expires_ts, T + 10000);
  assert.match(observation.position_id, /^ORDERLY:POSITION:SHA256:[a-f0-9]{64}$/); assert.equal(observation.position_id.includes('ARTIFICIAL_SOL_POSITION'), false);
  assert.equal(observation.usable, false); assert.equal(observation.bingx_order_eligible, false); assert.deepEqual(sol.zones, []);
  assert.equal(selectZones(sol, good.entries[0].instrument, 100, 10, T, START_PROFILE).qualified_zone_count, 0);
  good.advance(1000); const cached = await good.run(); assert.equal(good.fetches(), 1); assert.equal(cached.coverage.cache_hit, true);
  assert.equal(cached.coverage.source_response_ts, T - 100); assert.equal(cached.coverage.received_ts, T);
  assert.equal(good.source.getCoverage().totals.map_usable, 0); assert.equal(good.source.getCoverage().totals.map_checked_without_usable, 2);
  assert.equal(good.source.getCoverage().totals.map_checked, 2); assert.equal(good.source.getCoverage().totals.map_not_checked, 1);
  const ledger = await good.store.get('pump:resources'); assert.equal(ledger.days[new Date(T).toISOString().slice(0, 10)], 2);
  assert.deepEqual(ledger.unknown, good.previousUnknown); assert.deepEqual(ledger.outstanding, {});

  for (const change of [f => {f.route.market_bindings = [];}, f => {f.entries[0].instrument.canonical_cross_venue_identity_qualified = false;},
    f => {delete f.bindings[0].position_identity;}, f => {f.bindings[0].position_value.unit = 'UNKNOWN';}]) {
    const x = await setup(body(), change); assert.equal((await x.run()).status, 'NOT_CHECKED'); assert.equal(x.fetches(), 0);
  }
  const noMapping = await setup(body(), f => {delete f.bindings[0].price_mapping;});
  const native = (await noMapping.run()).coverage.native_position_observations[0];
  assert.equal(native.native_reported_position_notional, 70000); assert.equal(native.projected_bingx_liquidation_price_usdt, null);
  assert.equal(native.projected_position_notional_usdt, null); assert.equal(native.quote_rate_to_usdt, null);
  const oldMapping = await setup(body(), f => {f.bindings[0].price_mapping.event_ts = T - 30001;});
  assert.equal((await oldMapping.run()).coverage.native_position_observations[0].projected_bingx_liquidation_price_usdt, null);
  const invalidRows = await setup(body([row('PERP_SOL_USDC', 'ARTIFICIAL_NULL', {est_liq_price: null}), row('PERP_SOL_USDC', 'ARTIFICIAL_ZERO', {est_liq_price: 0}),
    row('PERP_SOL_USDC', 'ARTIFICIAL_DUPLICATE'), row('PERP_SOL_USDC', 'ARTIFICIAL_DUPLICATE'), row('PERP_SOL_USDC', '', {}),
    row('PERP_SOL_USDC', 'ARTIFICIAL_SIDE', {side: 'BUY'}), row('PERP_SOL_USDC', 'ARTIFICIAL_NOTIONAL', {notional: null})]));
  const invalid = await invalidRows.run(); assert.equal(invalid.coverage.native_position_observations.length, 0);
  assert.deepEqual(invalid.coverage.excluded_positions, {invalid_or_null_estimate: 2, identity_missing: 1, duplicate_position_id: 2, invalid_side_or_price: 1, invalid_notional: 1});
  const tooMany = await setup(body(Array.from({length: 501}, (_, n) => row('PERP_SOL_USDC', 'ARTIFICIAL_' + n))));
  assert.equal((await tooMany.run()).reason, 'ORDERLY_POSITION_ROW_LIMIT'); assert.equal(tooMany.fetches(), 1); assert.equal(tooMany.budget.summary().total, 1);
  for (const [value, expected] of [[undefined, 'PARTIAL'], [T + 1, 'ERROR'], [T - 120000, 'STALE']]) {
    const payload = body(); if (value === undefined) delete payload.ts; else payload.ts = value;
    const x = await setup(payload), r = await x.run(); assert.equal(r.status, expected); assert.equal(r.zones.length, 0);
    assert.equal(r.coverage.event_ts, null); assert.equal(x.fetches(), 1);
  }
  const ended = await setup(body([row()], {total_positions: 1, next_cursor: null}));
  assert.equal((await ended.run('XRP')).status, 'ABSENT'); assert.equal(ended.fetches(), 1);
  const malformed = await setup({success: true, ts: T, data: {rows: null}});
  assert.equal((await malformed.run()).reason, 'ORDERLY_POSITION_PAGE_REQUIRED'); assert.equal(malformed.fetches(), 1);
  const invalidSymbol = await setup(body([null], {total_positions: 1, next_cursor: null}));
  assert.equal((await invalidSymbol.run()).reason, 'ORDERLY_POSITION_SYMBOL_REQUIRED'); assert.equal(invalidSymbol.fetches(), 1);
  const denied = await setup(body(), () => {}, {admitBody: false});
  assert.equal((await denied.run()).status, 'NOT_CHECKED_BUDGET'); assert.equal(denied.fetches(), 0); assert.equal(denied.budget.summary().total, 0);
  const zero = await setup(body(), () => {}, {profile: {...START_PROFILE, map_http_upper_bound: 0}});
  assert.equal((await zero.run()).status, 'NOT_CHECKED_BUDGET'); assert.equal(zero.fetches(), 0);
  const expired = await setup(); assert.equal((await expired.run('SOL', T - 1)).status, 'TIMEOUT'); assert.equal(expired.fetches(), 0);
  assert.equal(JSON.stringify(originals), originalsBefore);
});
