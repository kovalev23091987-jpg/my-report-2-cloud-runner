import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPumpSources, SOURCE_HTTP_PLAN} from '../../sources/index.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
const registry = JSON.parse(fs.readFileSync(new URL('../../sources/registry-curated13-native-relative-v1.json', import.meta.url), 'utf8'));
const original = registry.instruments.find(e => e.instrument.base === 'SOL');
const at = 1792948801000;

test('owner removal omits the entire market_context key and benchmarks while trades/OI/funding share two slots', async () => {
  for (const qualified of [false, true]) {
    const entry = structuredClone(original);
    if (qualified) {
      entry.qualifications.open_interest = {unit: 'BASE_ASSET', evidence_ref: 'CONTROLLED_ONLY_OI'};
      entry.qualifications.funding = {rate_clock_field: 'fundingTime', evidence_ref: 'CONTROLLED_ONLY_FUNDING'};
    }
    const calls = [];
    const sources = createPumpSources({clock: () => at, identityRegistry: [entry,
      registry.instruments.find(e => e.instrument.base === 'BTC'),
      registry.instruments.find(e => e.instrument.base === 'ETH')], broker: {
      request: async request => {
        calls.push(request);
        const url = new URL(request.url);
        assert.equal(url.searchParams.get('symbol'), 'SOL-USDT');
        assert.ok(url.pathname.endsWith('/trades') || url.pathname.endsWith('/openInterest'));
        const data = url.pathname.endsWith('/trades')
          ? [{id: 1, time: at - 1000, price: '10', quoteQty: '100', isBuyerMaker: false}]
          : url.pathname.endsWith('/openInterest')
          ? {symbol: 'SOL-USDT', time: at, openInterest: '10'}
          : {symbol: 'SOL-USDT', fundingTime: at, lastFundingRate: '0.001', fundingIntervalHours: 8, nextFundingTime: at + 28800000};
        return {ok: true, status: 200, received_ts: at, receipt_id: 'OWNER_CANCELLED_FIXTURE_' + calls.length, data: {code: 0, data}};
      }
    }});
    const result = await sources.getOptional({instrument: entry.instrument,
      facts: {candles: {event_ts: at - 1000}, market_context: {status: 'USABLE', value: {returns: ['BTC', 'ETH']}}}});
    assert.equal(Object.hasOwn(result.facts, 'market_context'), false);
    assert.equal(Object.hasOwn(result.coverage, 'market_context'), false);
    assert.equal(Object.hasOwn(result, 'http_plan'), false);
    assert.equal(result.facts.trades.status, 'USABLE');
    assert.equal(calls.length, qualified ? 2 : 1);
    assert.ok(calls.length <= START_PROFILE.optional_http_upper_bound);
    if (!qualified) {
      assert.equal(result.facts.open_interest.reason, 'OPEN_INTEREST_UNIT_UNQUALIFIED');
      assert.equal(result.facts.funding.reason, 'FUNDING_RATE_SOURCE_CLOCK_UNQUALIFIED');
    } else assert.equal(result.facts.funding.reason, 'OPTIONAL_BUDGET_SLOT_NOT_AVAILABLE');
  }
  assert.equal(START_PROFILE.optional_http_upper_bound, 2);
  assert.equal(SOURCE_HTTP_PLAN.optional_open_interest + SOURCE_HTTP_PLAN.optional_funding, 2);
  assert.equal(SOURCE_HTTP_PLAN.optional_trades, 1); assert.equal(SOURCE_HTTP_PLAN.optional_total_max, 2);
  assert.equal(SOURCE_HTTP_PLAN.optional_relative_context_benchmarks_max, undefined);
  assert.equal(fs.existsSync(new URL('../../sources/relative-context.mjs', import.meta.url)), false);
});

