import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPumpSources} from '../../sources/index.mjs';
import {createRequestBroker} from '../../runtime/budget.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../../sources/registry-curated13-native-relative-v1.json', import.meta.url)));
const original = registry.instruments.find(x => x.instrument.base === 'SOL');
const T = 1792965000000;

function fixture({paced = true, map = true} = {}) {
  let at = T, fetches = 0, reserves = 0, finalized = 0;
  const seen = [], sleeps = [], starts = [];
  const entry = structuredClone(original);
  entry.qualifications.open_interest = {unit: 'BASE_ASSET', evidence_ref: 'F563_CONTROLLED_UNIT_ONLY'};
  entry.liquidations = {routes: map ? [{provider: 'SWOLECHARTS', asset_id: entry.instrument.asset_id,
    symbol: 'SOL', venue: 'CONTROLLED_UPSTREAM', market_id: 'CONTROLLED_SOL', price_quote: 'USDT',
    identity_evidence_ref: 'F563_CONTROLLED_IDENTITY', model_evidence_ref: 'F563_CONTROLLED_MODEL'}] : []};
  const store = new MemoryStore();
  // Only a controlled budget surface, no native policy/admission or SQL. The
  // production ROOT request broker itself owns pacing/inflight/cache/fetch.
  const budget = {
    minimumIntervalMs: provider => paced && provider === 'BINGX' ? 1000 : 0,
    assertTarget(provider, url, options) {
      const u = new URL(url); assert.ok(['open-api.bingx.com', 'swolecharts.com'].includes(u.hostname));
      assert.equal(options.method, 'GET'); return {};
    },
    async reserve(request) { reserves++; return {...request, state: 'RESERVED'}; },
    async finalize(receipt, result) { finalized++; receipt.state = result.state ?? 'FINALIZED'; }
  };
  const actual = createRequestBroker({budget, store, clock: () => at,
    sleep_impl: async ms => { sleeps.push(ms); at += ms; },
    fetch_impl: async url => {
      fetches++; starts.push(at); at += 10;
      if (url.includes('swolecharts')) return Response.json({coin: 'SOL', has_data: false});
      if (url.includes('openInterest')) return Response.json({code: 0, data: {symbol: 'SOL-USDT', openInterest: '5', time: at - 1}});
      return Response.json({code: 0, data: [{fillId: '900719925474099312345', price: '10', quoteQty: '25',
        qty: 'UNQUALIFIED', isBuyerMaker: false, time: at - 1}]});
    }});
  const broker = {request(request) { seen.push(structuredClone(request)); return actual.request(request); }};
  const sources = createPumpSources({identityRegistry: [entry], broker, clock: () => at, profile: START_PROFILE});
  return {sources, entry, actual, seen, sleeps, starts, time: () => at,
    counts: () => ({fetches, reserves, finalized})};
}

test('source wrapper forwards one absolute optional deadline to the real broker and leaves no late paced call', async () => {
  const f = fixture(), deadline = T + 500;
  // Establish real broker pacing state; all transport is synthetic.
  await f.actual.request({provider: 'BINGX', family: 'USDT_M', url: 'https://open-api.bingx.com/openApi/swap/v2/quote/trades?limit=1&symbol=SOL-USDT',
    cache_key: 'F563_SYNTHETIC_PACING_SEED', timeout_ms: 1000});
  const map = await f.sources.getLiquidations({instrument: f.entry.instrument, reference_price: 10, deadline_ts: deadline});
  assert.equal(map.status, 'ABSENT'); assert.equal(f.seen[0].deadline_ts, deadline);
  const optional = await f.sources.getOptional({instrument: f.entry.instrument, deadline_ts: deadline});
  assert.equal(optional.deadline_ts, deadline); assert.equal(optional.deadline_status, 'TIMEOUT');
  assert.equal(optional.facts.trades.status, 'NOT_CHECKED');
  assert.equal(optional.facts.trades.reason, 'SOURCE_DEADLINE_EXPIRED');
  assert.equal(optional.facts.open_interest.reason, 'OPTIONAL_STAGE_DEADLINE_EXPIRED');
  assert.equal(optional.facts.funding.reason, 'OPTIONAL_STAGE_DEADLINE_EXPIRED');
  assert.equal(f.seen.length, 2); assert.equal(f.seen[1].deadline_ts, deadline);
  assert.ok(f.seen[1].timeout_ms <= deadline - (T + 20));
  assert.deepEqual(f.sleeps, []); assert.deepEqual(f.counts(), {fetches: 2, reserves: 2, finalized: 2});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.counts(), {fetches: 2, reserves: 2, finalized: 2});
  assert.ok(f.starts.every(at => at < deadline));

  for (const bad of [T - 1, T, '1792965000500', NaN]) {
    const e = fixture({map: false});
    const result = await e.sources.getOptional({instrument: e.entry.instrument, deadline_ts: bad});
    assert.ok(Object.values(result.facts).every(row => row.status === 'NOT_CHECKED'));
    assert.equal(e.seen.length, 0); assert.equal(e.counts().fetches, 0);
  }
  const good = fixture({paced: false, map: false});
  const result = await good.sources.getOptional({instrument: good.entry.instrument, deadline_ts: T + 500});
  assert.equal(result.facts.trades.status, 'USABLE'); assert.equal(result.facts.open_interest.status, 'USABLE');
  assert.ok(good.seen.every(request => request.deadline_ts === T + 500));
  assert.equal(result.facts.trades.expires_ts, result.facts.trades.event_ts + START_PROFILE.freshness_ms.trades);
  assert.equal(good.counts().fetches, 2);
});
