import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPumpSources} from '../../sources/index.mjs';

const at = 1792946700000;
const registry = JSON.parse(fs.readFileSync(new URL('../../sources/registry-curated13-native-relative-v1.json', import.meta.url), 'utf8'));
const sol = registry.instruments.find(entry => entry.instrument.native_symbol === 'SOL-USDT');
assert.ok(sol);
function setup() {
  const calls = [];
  const sources = createPumpSources({identityRegistry: [sol], clock: () => at, broker: {
    request: async request => {
      calls.push(request);
      const pathname = new URL(request.url).pathname;
      const data = pathname.endsWith('/contracts')
        ? [{symbol: sol.instrument.native_symbol, contractId: sol.native_contract_id, asset: sol.instrument.base, currency: 'USDT', status: 1}]
        : [{symbol: sol.instrument.native_symbol, lastPrice: '10', closeTime: at, openPrice: '9', priceChangePercent: '11', quoteVolume: '1000'}];
      return {ok: true, status: 200, received_ts: at, receipt_id: 'OFFLINE_PURPOSE_' + calls.length, data: {code: 0, data}};
    }
  }});
  return {sources, calls};
}

test('catalog defaults CORE and forwards trusted DISCOVERY descriptor with identical wire request and cost', async () => {
  const {sources, calls} = setup();
  const core = await sources.getCatalog();
  const discovery = await sources.getCatalog({purpose: 'DISCOVERY'});
  assert.equal(core.instruments.length, 1);
  assert.equal(discovery.instruments.length, 1);
  assert.deepEqual(calls.map(c => c.purpose), ['CORE', 'DISCOVERY']);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, calls[1].url);
  assert.equal(new URL(calls[0].url).pathname, '/openApi/swap/v2/quote/contracts');
  assert.equal(calls[0].cache_key, calls[1].cache_key);
  assert.deepEqual(calls.map(c => c.estimated_cost), [{http: 1}, {http: 1}]);
  assert.ok(calls.every(c => c.provider === 'BINGX' && c.family === 'USDT_M' && c.method === 'GET'));
  assert.equal(new URL(calls[1].url).searchParams.has('purpose'), false);
});

test('overview defaults CORE and forwards DISCOVERY internally without altering preliminary facts or adding calls', async () => {
  const {sources, calls} = setup();
  const core = await sources.getOverview({instruments: [sol.instrument]});
  const discovery = await sources.getOverview({instruments: [sol.instrument], purpose: 'DISCOVERY'});
  assert.equal(core.observations.length, 1);
  assert.equal(discovery.observations.length, 1);
  assert.equal(core.observations[0].facts.price.status, 'USABLE');
  assert.equal(discovery.observations[0].facts.price.status, 'USABLE');
  assert.equal(core.observations[0].facts.ticker_24h.reason, discovery.observations[0].facts.ticker_24h.reason);
  assert.deepEqual(calls.map(c => c.purpose), ['CORE', 'DISCOVERY']);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, calls[1].url);
  assert.equal(new URL(calls[1].url).pathname, '/openApi/swap/v2/quote/ticker');
  assert.equal(calls[0].cache_key, calls[1].cache_key);
  assert.deepEqual(calls[0].estimated_cost, calls[1].estimated_cost);
  assert.equal(new URL(calls[1].url).searchParams.has('purpose'), false);
});

