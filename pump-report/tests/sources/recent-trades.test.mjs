import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPumpSources, SOURCE_HTTP_PLAN} from '../../sources/index.mjs';
import {parseRecentTrades} from '../../sources/recent-trades.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {TRADE_QUOTE_NOTIONAL_UNIT} from '../../contracts/index.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../../sources/registry-curated13-native-relative-v1.json', import.meta.url), 'utf8'));
const sol = registry.instruments.find(entry => entry.instrument.base === 'SOL');
const at = 1792952600000;
const trade = (changes = {}) => ({id: 1, price: '10', quoteQty: '25', qty: 'UNQUALIFIED_DO_NOT_READ',
  time: at - 1000, isBuyerMaker: false, ...changes});
function setup({rows = [trade()], entry = sol, profile = START_PROFILE, received_ts = at, business_code = 0,
  reject_trade = false, current = at} = {}) {
  const calls = [];
  const sources = createPumpSources({identityRegistry: [entry], profile, clock: () => current, broker: {
    async request(request) {
      calls.push(request);
      const url = new URL(request.url);
      assert.equal(url.origin, 'https://open-api.bingx.com');
      assert.equal(url.searchParams.get('symbol'), entry.instrument.native_symbol);
      let data;
      if (url.pathname.endsWith('/quote/trades')) {
        assert.deepEqual([...url.searchParams.keys()], ['limit', 'symbol']);
        assert.equal(url.searchParams.get('limit'), '100');
        if (reject_trade) throw Object.assign(Error('DENIED'), {code: 'PROVIDER_BUDGET_EXHAUSTED', receipt_id: 'DENIED_FIXTURE'});
        data = rows;
      } else if (url.pathname.endsWith('/openInterest')) data = {symbol: entry.instrument.native_symbol, time: at, openInterest: '42'};
      else if (url.pathname.endsWith('/premiumIndex')) data = {symbol: entry.instrument.native_symbol, fundingTime: at,
        lastFundingRate: '0.001', fundingIntervalHours: 8, nextFundingTime: at + 28800000};
      else assert.fail('Unexpected route ' + url.pathname);
      return {ok: true, status: 200, data: {code: url.pathname.endsWith('/quote/trades') ? business_code : 0, data},
        received_ts, receipt_id: 'SYNTHETIC_T3_RECEIPT_' + calls.length, cache_hit: received_ts < current};
    }
  }});
  return {sources, calls, optional: () => sources.getOptional({instrument: entry.instrument})};
}

test('connected recent producer emits direct USDT quote notional, native IDs/clock and bounded sample provenance', async () => {
  const rows = [trade({id: '900719925474099312345', price: '2', quoteQty: '7', qty: '999999', isBuyerMaker: true}),
    trade({id: 2, time: at - 500, price: '4', quoteQty: '11', isBuyerMaker: false})];
  const {optional, calls, sources} = setup({rows});
  const result = await optional(), fact = result.facts.trades;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, 'BINGX'); assert.equal(calls[0].family, 'USDT_M');
  assert.equal(calls[0].candidate_id, sol.instrument.instrument_id); assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].purpose, 'CORE'); assert.equal(calls[0].ttl_ms, 30000);
  assert.equal(calls[0].timeout_ms, 10000); assert.deepEqual(calls[0].estimated_cost, {http: 1});
  assert.equal(fact.status, 'USABLE'); assert.equal(fact.unit, TRADE_QUOTE_NOTIONAL_UNIT);
  assert.equal(fact.value[0].trade_id, rows[0].id); assert.equal(fact.value[0].notional_quote, 7);
  assert.equal(fact.value[0].aggressor_side, 'SELL'); assert.equal(fact.value[1].aggressor_side, 'BUY');
  assert.equal(Object.hasOwn(fact.value[0], 'quantity_base'), false);
  assert.equal(fact.event_ts, at - 500); assert.equal(fact.received_ts, at); assert.equal(fact.expires_ts, at - 500 + 30000);
  assert.equal(fact.evidence_ref, 'SYNTHETIC_T3_RECEIPT_1'); assert.equal(fact.coverage.base_quantity_derived, false);
  assert.equal(fact.coverage.complete, false); assert.equal(fact.coverage.full_window_coverage, false);
  assert.equal(fact.coverage.sample_kind, 'LATEST_RETURNED_BOUNDED_SAMPLE');
  assert.equal(fact.coverage.complete_window_start, null);
  assert.equal(sources.getCoverage().instruments[0].optional.trades.coverage.returned_rows, 2);
  assert.equal(result.facts.open_interest.status, 'NOT_CHECKED'); assert.equal(result.facts.funding.status, 'NOT_CHECKED');
  assert.equal(Object.hasOwn(result.facts, 'market_context'), false);
});

test('mixed maker schemas, unsafe/missing IDs, invalid amounts/clocks/identity stay unqualified; conflicts remain intact', () => {
  const rows = [trade(), trade({id: 1, price: '12'}), trade({id: 2, isBuyerMaker: true, buyerMaker: true}),
    trade({id: 3, isBuyerMaker: false, buyerMaker: true}), trade({id: 4, isBuyerMaker: 'false'}),
    trade({id: 5, isBuyerMaker: undefined, buyerMaker: false}), trade({id: undefined}),
    trade({id: Number.MAX_SAFE_INTEGER + 1}), trade({id: 8, quoteQty: undefined, qty: '99'}),
    trade({id: 9, quoteQty: '0'}), trade({id: 10, price: 'NaN'}), trade({id: 11, time: Math.floor(at / 1000)}),
    trade({id: 12, time: at + 1}), trade({id: 13, symbol: 'ETH-USDT'}), null];
  const p = parseRecentTrades({code: 0, data: rows}, {instrument: sol.instrument, received_ts: at});
  assert.equal(p.value.length, rows.length); assert.equal(p.coverage.qualified_before_dedup, 2);
  assert.deepEqual(p.value.slice(0, 2).map(r => [r.trade_id, r.price]), [['1', 10], ['1', 12]]);
  for (const i of [2, 3, 4, 5]) assert.equal(p.value[i].aggressor_side, 'UNKNOWN');
  for (const i of [6, 7, 13, 14]) assert.equal(p.value[i].trade_id, null);
  for (const i of [8, 9]) assert.equal(p.value[i].notional_quote, null);
  assert.equal(p.value[10].price, null);
  for (const i of [11, 12, 13, 14]) assert.equal(p.value[i].event_ts, null);
  assert.equal(p.value[13].price, null); assert.equal(p.value[13].notional_quote, null);
  assert.equal(p.reason, 'LATEST_RETURNED_TRADE_SAMPLE_PARTIAL');
  assert.equal(p.coverage.duplicate_and_conflicting_ids_preserved, true);
  assert.throws(() => parseRecentTrades({code: 0, data: Array.from({length: 1001}, () => trade())},
    {instrument: sol.instrument, received_ts: at}), /BOUNDED_TRADE_ARRAY/);
});

test('original qualified execution clock controls age; fresh invalid rows and cache reads cannot refresh it', async () => {
  const old = setup({rows: [trade({time: at - 121000}), trade({time: at, id: undefined})], received_ts: at, current: at});
  const a = (await old.optional()).facts.trades;
  assert.equal(a.event_ts, at - 121000); assert.equal(a.expires_ts, at - 91000); assert.equal(a.status, 'STALE');
  const cached = setup({rows: [trade({time: at - 121000})], received_ts: at - 120000});
  const b = (await cached.optional()).facts.trades;
  assert.equal(b.received_ts, at - 120000); assert.equal(b.cache_hit, true); assert.equal(b.status, 'STALE');
  for (const rows of [[], [trade({id: undefined})], [trade({buyerMaker: false})]]) {
    const fact = (await setup({rows}).optional()).facts.trades;
    assert.equal(fact.status, 'INCOMPLETE'); assert.equal(fact.event_ts, null); assert.equal(fact.expires_ts, null);
    assert.equal(fact.value.length, rows.length);
  }
});

test('trades and strictly qualified OI/funding share upper2, preserve failures and never create a third request', async () => {
  for (const [oi, funding, upper, reject_trade] of [[true, true, 2, false], [false, true, 2, false],
    [true, true, 2, true], [true, true, 1, false], [true, true, 0, false]]) {
    const entry = structuredClone(sol);
    if (oi) entry.qualifications.open_interest = {unit: 'BASE_ASSET', evidence_ref: 'CONTROLLED_T3_OI_ONLY'};
    if (funding) entry.qualifications.funding = {rate_clock_field: 'fundingTime', evidence_ref: 'CONTROLLED_T3_FUNDING_ONLY'};
    const env = setup({entry, profile: {...START_PROFILE, optional_http_upper_bound: upper}, reject_trade});
    const result = await env.optional();
    assert.equal(env.calls.length, upper); assert.ok(env.calls.length <= 2);
    if (upper === 2) assert.ok(new URL(env.calls[1].url).pathname.endsWith(oi ? '/openInterest' : '/premiumIndex'));
    if (oi && funding) assert.equal(result.facts.funding.reason, 'OPTIONAL_BUDGET_SLOT_NOT_AVAILABLE');
    if (reject_trade) { assert.equal(result.facts.trades.status, 'NOT_CHECKED'); assert.equal(result.facts.trades.evidence_ref, 'DENIED_FIXTURE'); }
  }
  const bad = setup({business_code: 109425});
  const refusal = (await bad.optional()).facts.trades;
  assert.equal(bad.calls.length, 1); assert.equal(refusal.status, 'ERROR');
  assert.equal(refusal.reason, 'BINGX_SUCCESS_ENVELOPE_REQUIRED');
  assert.equal(refusal.evidence_ref, 'SYNTHETIC_T3_RECEIPT_1'); assert.equal(/UNSUPPORTED/.test(refusal.reason), false);
  const invalid = setup({profile: {...START_PROFILE, optional_http_upper_bound: 3}});
  await assert.rejects(invalid.optional, /OPTIONAL_BUDGET_PROFILE_INVALID/); assert.equal(invalid.calls.length, 0);
  assert.equal(SOURCE_HTTP_PLAN.optional_total_max, 2); assert.equal(START_PROFILE.optional_http_upper_bound, 2);
});

test('owner BTC/ETH exclusion and independent registry mismatch cause zero optional requests', async () => {
  for (const base of ['BTC', 'ETH']) {
    const entry = registry.instruments.find(row => row.instrument.base === base), env = setup({entry});
    const result = await env.optional(); assert.equal(env.calls.length, 0);
    for (const fact of Object.values(result.facts)) assert.equal(fact.reason, 'OWNER_ASSET_DELIVERY_EXCLUDED');
  }
  const env = setup();
  await assert.rejects(() => env.sources.getOptional({instrument: {...sol.instrument, asset_id: 'WRONG_ASSET'}}), /INDEPENDENT_REGISTRY_IDENTITY_MISMATCH/);
  assert.equal(env.calls.length, 0);
});
