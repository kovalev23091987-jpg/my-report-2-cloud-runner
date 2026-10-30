import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPumpSources, SOURCE_HTTP_PLAN} from '../../sources/index.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {selectZones} from '../../analytics/zones.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../../sources/registry-curated13-native-relative-v1.json', import.meta.url)));
const original = registry.instruments.find(x => x.instrument.base === 'SOL'), at = 1792961400000;
const account = n => ({address: '0x' + String(n).repeat(40), account_ref: 'SYNTHETIC_ACCOUNT_' + n,
  admission_ref: 'CONTROLLED_ROUTE_ADMISSION_NOT_NATIVE'});
function fixture() {
  const entry = structuredClone(original), i = entry.instrument;
  // Controlled evidence only; no existing registry entry is changed or proved.
  i.canonical_cross_venue_identity_qualified = true;
  const route = {provider: 'HYPERLIQUID', asset_id: i.asset_id, coin: 'SOL', market_id: 'HL:FIRST_PERP:SOL',
    admitted_accounts: [account(1)], account_admission_ref: 'CONTROLLED_FINITE_ACCOUNT_SET',
    price_quote: 'USDC', price_quote_evidence_ref: 'CONTROLLED_NATIVE_CURRENCY_PROOF',
    identity_binding: {status: 'VERIFIED_SAME_UNDERLYING', evidence_ref: 'CONTROLLED_INDEPENDENT_UNDERLYING_PROOF',
      bingx_instrument_id: i.instrument_id, bingx_asset_id: i.asset_id,
      bingx_identity_evidence_ref: i.identity_evidence_ref, hyperliquid_coin: 'SOL', hyperliquid_market_id: 'HL:FIRST_PERP:SOL'},
    position_semantics: {evidence_ref: 'CONTROLLED_FIELD_SEMANTICS', signed_size_field: 'szi', positive_side: 'LONG',
      negative_side: 'SHORT', liquidation_price_field: 'liquidationPx', liquidation_price_kind: 'CURRENT_ACCOUNT_ESTIMATE'},
    position_value: {field: 'positionValue', quote: 'USDC', evidence_ref: 'CONTROLLED_REPORTED_AMOUNT_UNIT'},
    price_mapping: {kind: 'EXPLICIT_PRICE_BASIS_AND_QUOTE_CONVERSION', evidence_ref: 'CONTROLLED_COMPARABLE_PRICE',
      quote_conversion_evidence_ref: 'CONTROLLED_USDC_USDT_CONVERSION', price_basis_evidence_ref: 'CONTROLLED_VENUE_PRICE_BASIS',
      from_quote: 'USDC', to_quote: 'USDT', from_market_id: 'HL:FIRST_PERP:SOL', to_instrument_id: i.instrument_id,
      from_price_basis: 'HYPERLIQUID_LIQUIDATION_PX', to_price_basis: 'BINGX_NATIVE_PRICE', multiplier_to_bingx: 1.01,
      event_ts: at - 1000, expires_ts: at + 10000}};
  entry.liquidations = {routes: [route]};
  const payload = {assetPositions: [{type: 'oneWay', position: {coin: 'SOL', szi: '5', liquidationPx: '90', positionValue: '70000'}}], time: at - 500};
  return {entry, route, payload};
}
function setup(change = () => {}, {deny = false, profile = START_PROFILE} = {}) {
  const f = fixture(); change(f); const calls = [];
  const sources = createPumpSources({identityRegistry: [f.entry], clock: () => at, profile, broker: {
    async request(request) {
      calls.push(request); assert.equal(request.method, 'POST'); assert.equal(request.url, 'https://api.hyperliquid.xyz/info');
      assert.deepEqual(request.json_body, {type: 'clearinghouseState', user: account(1).address});
      assert.equal(Object.hasOwn(request, 'body'), false); assert.equal(request.provider, 'HYPERLIQUID');
      assert.equal(request.family, 'LIQUIDATIONS'); assert.equal(request.estimated_cost.http, 1);
      assert.ok(request.timeout_ms > 0 && request.timeout_ms <= 10000); assert.equal(request.ttl_ms, 120000);
      if (deny) throw Object.assign(Error('CONTROLLED'), {code: 'PROVIDER_BUDGET_EXHAUSTED', receipt_id: 'CONTROLLED_DENIED'});
      return {ok: true, status: 200, data: f.payload, received_ts: at - 100, receipt_id: 'F556_SYNTHETIC_ONLY', cache_hit: false};
    }} });
  return {f, calls, sources, run: deadline_ts => sources.getLiquidations({instrument: f.entry.instrument, reference_price: 100, deadline_ts})};
}

test('connected HL account POST yields bounded observed zones only with independent identity/currency/basis and original clocks', async () => {
  const good = setup(), result = await good.run();
  assert.equal(good.calls.length, 1); assert.equal(result.status, 'PARTIAL'); assert.equal(result.zones.length, 1);
  const zone = result.zones[0]; assert.equal(zone.basis_type, 'OBSERVED_POSITION'); assert.equal(zone.venue, 'HYPERLIQUID');
  assert.equal(zone.liquidated_side, 'LONG'); assert.equal(zone.native_lower, 90); assert.equal(zone.lower, 90.9);
  assert.equal(zone.price_currency, 'USDT'); assert.equal(zone.native_price_quote, 'USDC');
  assert.equal(zone.magnitude_value, 70000); assert.equal(zone.magnitude_unit, 'USDC');
  assert.equal(zone.event_ts, at - 500); assert.equal(zone.received_ts, at - 100);
  assert.equal(zone.native_expires_ts, at + 119500); assert.equal(zone.expires_ts, at + 10000);
  assert.equal(result.coverage.whole_market_positions_known, false); assert.equal(result.coverage.market_coverage_complete, false);
  assert.equal(zone.coverage.position_size_derived_to_BASE, false);
  const selected = selectZones(result, good.f.entry.instrument, 100, 10, at, START_PROFILE);
  assert.equal(selected.zones_down.length, 1); assert.equal(selected.status, 'PARTIAL');
  assert.equal(selectZones(result, good.f.entry.instrument, 100, 10, at + 10001, START_PROFILE).zones_down.length, 0);
  assert.equal(good.sources.getCoverage().instruments[0].liquidations.checked_sources[0], 'HYPERLIQUID');

  for (const change of [f => { delete f.route.admitted_accounts; }, f => { f.route.admitted_accounts = [account(1), account(1)]; },
    f => { f.route.admitted_accounts = [account(1), account(2), account(3)]; }]) {
    const e = setup(change), r = await e.run(); assert.equal(e.calls.length, 0); assert.equal(r.status, 'NOT_CHECKED');
  }
  const bounded = setup(f => { f.route.admitted_accounts.push(account(2)); }), partial = await bounded.run();
  assert.equal(bounded.calls.length, 1); assert.equal(partial.coverage.admitted_accounts, 2);
  assert.equal(partial.coverage.unchecked_accounts, 1); assert.equal(partial.coverage.accounts_complete, false);
  assert.equal(SOURCE_HTTP_PLAN.liquidation_hyperliquid_per_candidate_max, 1);
  const zero = setup(() => {}, {profile: {...START_PROFILE, map_http_upper_bound: 0}});
  assert.equal((await zero.run()).status, 'NOT_CHECKED_BUDGET'); assert.equal(zero.calls.length, 0);
  const tight = setup(() => {}, {profile: {...START_PROFILE, freshness_ms: {...START_PROFILE.freshness_ms, price: 500}}});
  assert.equal((await tight.run()).zones[0].price_comparability.multiplier, null);
  const invalidTtl = setup(() => {}, {profile: {...START_PROFILE, freshness_ms: {...START_PROFILE.freshness_ms, observed_positions: 0}}});
  assert.equal((await invalidTtl.run()).status, 'NOT_CHECKED'); assert.equal(invalidTtl.calls.length, 0);

  for (const change of [f => { f.entry.instrument.canonical_cross_venue_identity_qualified = false; },
    f => { delete f.route.price_mapping; }, f => { delete f.route.price_quote_evidence_ref; },
    f => { delete f.route.position_semantics; }]) {
    const e = setup(change), r = await e.run(); assert.equal(e.calls.length, 1); assert.equal(r.zones[0].usable, false);
    if (!e.f.route.price_mapping || !e.f.entry.instrument.canonical_cross_venue_identity_qualified) {
      assert.equal(r.zones[0].lower, 90); assert.equal(r.zones[0].price_comparability.multiplier, null);
    }
  }
  const stale = setup(f => { f.payload.time = at - 120001; }), old = await stale.run();
  assert.equal(old.status, 'STALE'); assert.equal(old.zones[0].event_ts, at - 120001); assert.equal(old.zones[0].usable, false);
  const unknown = setup(f => { delete f.payload.time; }), noClock = await unknown.run();
  assert.equal(noClock.zones[0].event_ts, null); assert.equal(noClock.zones[0].usable, false);
  const short = setup(f => { f.payload.assetPositions[0].position.szi = '-5'; f.payload.assetPositions[0].position.liquidationPx = '110'; });
  assert.equal((await short.run()).zones[0].liquidated_side, 'SHORT');
  const missing = setup(f => { f.payload.assetPositions[0].position.liquidationPx = null; });
  assert.equal((await missing.run()).zones.length, 0);
  const duplicate = setup(f => { f.payload.assetPositions.push(structuredClone(f.payload.assetPositions[0])); });
  assert.equal((await duplicate.run()).reason, 'HYPERLIQUID_DUPLICATE_TARGET_POSITION');
  const denied = setup(() => {}, {deny: true}), refused = await denied.run();
  assert.equal(denied.calls.length, 1); assert.equal(refused.status, 'NOT_CHECKED_BUDGET');
  assert.equal(refused.coverage.spent_or_unknown_not_refunded, true);
  const expired = setup(); assert.equal((await expired.run(at - 1)).status, 'TIMEOUT'); assert.equal(expired.calls.length, 0);
});
