import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createReviewedNativeScopeRegistry} from '../../registry/native-reviewed550.mjs';
import {BINGX_IDENTITY_REGISTRY} from '../../registry/index.mjs';
import {reviewedNativeCoinOrderbook} from '../../sources/native-coin-unit-review.mjs';
import {NATIVE_COIN_REVIEWED_ROWS, NATIVE_COIN_REVIEW_REF, NATIVE_COIN_REVIEW_SHA256} from '../../sources/native-coin-unit-reviewed-data.mjs';
import {createPumpSources} from '../../sources/index.mjs';
import {measureLiquidity} from '../../analytics/liquidity.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';

test('frozen general native Coin review reaches real Source and liquidity for ordinary exact tuples while package ambiguities stay unqualified', async () => {
  const reviewBytes = fs.readFileSync(new URL('../../handoffs/sources/F564_EXACT_NATIVE_COIN_UNIT_REVIEW_V1.json', import.meta.url));
  assert.equal(createHash('sha256').update(reviewBytes).digest('hex'), NATIVE_COIN_REVIEW_SHA256);
  const review = JSON.parse(reviewBytes), retained = JSON.stringify(BINGX_IDENTITY_REGISTRY);
  assert.equal(review.rows.length, 550); assert.equal(NATIVE_COIN_REVIEWED_ROWS.length, 541);
  const baseRegistry = createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY);
  // This is the exact proposed ROOT registry adoption seam, not a second
  // identity source or a default promotion inside the Source parser.
  const registry = {resolve: query => reviewedNativeCoinOrderbook(baseRegistry.resolve(query))};
  let newlyQualified = 0;
  for (const row of review.rows) {
    const before = baseRegistry.resolve({native_symbol: row.tuple.native_symbol});
    assert.ok(before);
    const after = registry.resolve({native_symbol: row.tuple.native_symbol});
    if (row.unit_decision === 'UNKNOWN_PACKAGED_DENOMINATION') {
      assert.equal(after.qualifications.orderbook, undefined); assert.equal(row.native_base_unit, null);
    } else {
      assert.equal(after.qualifications.orderbook.fields, 'COIN');
      assert.equal(after.qualifications.orderbook.unit, 'BASE_ASSET');
      if (!before.qualifications.orderbook) {
        newlyQualified++; assert.equal(after.qualifications.orderbook.native_base_unit, row.native_asset);
        assert.match(after.qualifications.orderbook.evidence_ref, /F564_EXACT_NATIVE_COIN_UNIT_REVIEW/);
      } else assert.deepEqual(after, before);
    }
    assert.deepEqual(after.instrument, before.instrument);
    assert.deepEqual(after.qualifications.candles, before.qualifications.candles);
    assert.equal(after.instrument.contract_multiplier, null);
    assert.equal(after.instrument.canonical_cross_venue_identity_qualified, false);
    assert.equal(after.qualifications.candles.volume.native_quantity_unit, 'UNKNOWN');
  }
  assert.equal(newlyQualified, 529);
  for (const symbol of ['0G-USDT', '1INCH-USDT', '2Z-USDT', '4-USDT', '4STOCK-USDT', 'BNLIFE-USDT', 'APR-USDT']) {
    const e = registry.resolve({native_symbol: symbol}); assert.ok(e.qualifications.orderbook.evidence_ref.startsWith(NATIVE_COIN_REVIEW_REF));
  }
  const ordinary = baseRegistry.resolve({native_symbol: '1INCH-USDT'});
  for (const [where, key, value] of [
    ['instrument', 'asset_id', 'ARTIFICIAL_OTHER_ASSET'], ['instrument', 'base', 'INCH'],
    ['instrument', 'native_symbol', '1INCH-USDC'], ['instrument', 'settle', 'USDC'],
    ['instrument', 'margin', 'COIN'], ['instrument', 'classification_status', 'UNKNOWN'],
    ['entry', 'native_contract_id', '999999999999'], ['entry', 'native_base', 'INCH'], ['entry', 'family', 'COIN_M']
  ]) {
    const changed = structuredClone(ordinary); (where === 'entry' ? changed : changed.instrument)[key] = value;
    assert.equal(reviewedNativeCoinOrderbook(changed).qualifications.orderbook, undefined);
  }
  assert.equal(registry.resolve({native_symbol: 'ARTIFICIAL_UNREVIEWED-USDT'}), null);
  const T = 1800100000000, calls = [], payload = {code: 0, data: {T,
    bidsCoin: [['0.2', '100000']], asksCoin: [['0.2002', '100000']],
    bids: [['0.2', '1']], asks: [['0.2002', '1']]}};
  let data = structuredClone(payload);
  const source = createPumpSources({identityRegistry: registry, clock: () => T, broker: {request: async args => {
    calls.push(args); return {ok: true, status: 200, data: structuredClone(data), received_ts: T, receipt_id: 'ARTIFICIAL_F564_NOT_NATIVE_' + calls.length};
  }}});
  const instrument = registry.resolve({native_symbol: '1INCH-USDT'}).instrument;
  const core = await source.getCore({instrument, only_facts: ['orderbook']});
  assert.equal(core.facts.orderbook.status, 'USABLE'); assert.equal(core.facts.orderbook.unit, 'USDT_PRICE_BASE_QUANTITY');
  assert.deepEqual(core.facts.orderbook.value, {bids: [[0.2, 100000]], asks: [[0.2002, 100000]]});
  assert.equal(core.facts.orderbook.event_ts, T); assert.equal(core.facts.orderbook.coverage.complete_book, null);
  assert.equal(measureLiquidity(core.facts.orderbook.value, instrument, START_PROFILE).status, 'USABLE');
  assert.match(calls[0].url, /symbol=1INCH-USDT/);
  data = {code: 0, data: {T, bids: payload.data.bids, asks: payload.data.asks}};
  const missingCoin = await source.getCore({instrument, only_facts: ['orderbook'], force_refresh: true});
  assert.equal(missingCoin.facts.orderbook.status, 'ERROR'); assert.equal(missingCoin.facts.orderbook.reason, 'BINGX_DEPTH_PAIRS_REQUIRED');
  data = structuredClone(payload); delete data.data.T;
  const missingT = await source.getCore({instrument, only_facts: ['orderbook'], force_refresh: true});
  assert.notEqual(missingT.facts.orderbook.status, 'USABLE'); assert.equal(missingT.facts.orderbook.event_ts, null);
  const scaled = registry.resolve({native_symbol: '1000PEPE-USDT'}).instrument;
  data = structuredClone(payload);
  const unresolved = await source.getCore({instrument: scaled, only_facts: ['orderbook']});
  assert.notEqual(unresolved.facts.orderbook.status, 'USABLE'); assert.equal(unresolved.facts.orderbook.value, null);
  assert.equal(calls.length, 4); assert.equal(JSON.stringify(BINGX_IDENTITY_REGISTRY), retained);
});
