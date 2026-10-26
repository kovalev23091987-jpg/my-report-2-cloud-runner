import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPumpSources, BINGX_FUNDING_QUOTE_PROFILE_V1, qualifyBingxFundingQuote} from '../../sources/index.mjs';
import {parseFunding} from '../../sources/bingx.mjs';

const T = 1793010000000; // Synthetic clock; no saved market original is replayed.
const resultPath = new URL('../../handoffs/sources/F588_CONTROLLED_CASE_ACTUAL_V1.json', import.meta.url);
const instrument = {instrument_id: 'BINGX:USDT_M:101207:DOOD-USDT', asset_id: 'BINGX_UNDERLYING:DOOD',
  venue: 'BINGX', native_symbol: 'DOOD-USDT', market_type: 'PERPETUAL', base: 'DOOD',
  quote: 'USDT', settle: 'USDT', margin: 'USDT', classification_status: 'VERIFIED_CRYPTO',
  identity_evidence_ref: 'CONTROLLED_F588_DOOD_IDENTITY_NOT_NATIVE', canonical_cross_venue_identity_qualified: false};
const entry = funding => ({instrument, native_contract_id: '101207', native_base: 'DOOD', family: 'USDT_M',
  qualifications: {funding}, liquidations: {routes: []}});

test('F588 DOOD selected trades+funding keeps quote clock/actual period and fails closed on unknown unit', async () => {
  const controlled = structuredClone(BINGX_FUNDING_QUOTE_PROFILE_V1);
  controlled.evidence_ref = 'CONTROLLED_F588_COMPLETE_PROFILE_NOT_VENDOR_PROOF';
  // A controlled unit premise tests the interface; it is not evidence that the
  // real unresolved unit premise has been proved or admitted for production.
  controlled.unit_proof_parts.unified_fraction = {status: 'VERIFIED', unit: 'RATE_FRACTION',
    evidence_ref: 'CONTROLLED_F588_UNIFIED_FRACTION_PREMISE_NOT_NATIVE'};
  const fundingBody = {code: 0, data: {symbol: 'DOOD-USDT', lastFundingRate: '-0.0100',
    fundingIntervalHours: '1', updateTime: T - 1000, nextFundingTime: T + 3600000}};
  const calls = [], unexpected = [];
  const sources = createPumpSources({identityRegistry: [entry(controlled)], clock: () => T, broker: {
    async request(request) {
      calls.push(request);
      const url = new URL(request.url);
      if (url.searchParams.get('symbol') !== 'DOOD-USDT') throw Object.assign(Error('OTHER_SYMBOL'), {code: 'CONTROLLED_UNEXPECTED_SYMBOL'});
      let data;
      if (url.pathname === '/openApi/swap/v2/quote/trades') data = {code: 0, data: [
        {symbol: 'DOOD-USDT', fillId: '91', price: '2', quoteQty: '12.00', time: T - 200, isBuyerMaker: false}]};
      else if (url.pathname === '/openApi/swap/v2/quote/premiumIndex') data = fundingBody;
      else { unexpected.push(url.pathname); throw Object.assign(Error('OTHER_ROUTE'), {code: 'CONTROLLED_UNEXPECTED_ROUTE'}); }
      return {ok: true, status: 200, data, received_ts: T - 100,
        receipt_id: 'CONTROLLED_F588_' + calls.length, cache_hit: false};
    }}});
  const good = await sources.getOptional({instrument, deadline_ts: T + 5000, requested_kinds: ['trades', 'funding']});
  const unknownCalls = [];
  const inactive = createPumpSources({identityRegistry: [entry(structuredClone(BINGX_FUNDING_QUOTE_PROFILE_V1))],
    clock: () => T, broker: {async request(request) {unknownCalls.push(request); throw Error('UNKNOWN_PROFILE_MUST_NOT_FETCH');}}});
  const unknown = await inactive.getOptional({instrument, deadline_ts: T + 5000, requested_kinds: ['funding']});
  const noPeriod = parseFunding({code: 0, data: {...fundingBody.data, fundingIntervalHours: undefined}}, instrument, controlled);
  const report = {schema: 'F588_ONE_CONTROLLED_CONNECTED_CASE_ACTUAL_V1', fixture: 'SYNTHETIC_ONLY_NOT_NATIVE_UNIT_PROOF',
    status: 'ASSERTIONS_PENDING', source_native_IO: 0, SQL: 0, Telegram: 0, real_original_replay: false,
    instrument_id: instrument.instrument_id, calls: calls.map(r => ({url: r.url, method: r.method, provider: r.provider})),
    unknown_profile_calls: unknownCalls.length, unexpected_routes: unexpected,
    funding: {status: good.facts.funding.status, unit: good.facts.funding.unit,
      event_ts: good.facts.funding.event_ts, next_funding_ts: good.facts.funding.value?.next_funding_ts,
      payment_event_ts: good.facts.funding.value?.funding_payment_event_ts,
      period_ms: good.facts.funding.value?.period_ms, raw_decimal: good.facts.funding.native_value_decimal,
      basis: good.facts.funding.unit_qualification_basis},
    unknown_funding: {status: unknown.facts.funding.status, reason: unknown.facts.funding.reason},
    no_period: {qualified: noPeriod.qualified, reason: noPeriod.reason, period_ms: noPeriod.value.period_ms}};
  fs.writeFileSync(resultPath, JSON.stringify(report, null, 2) + '\n'); // Preserve actual outcome before assertions.
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(r => new URL(r.url).pathname), ['/openApi/swap/v2/quote/trades', '/openApi/swap/v2/quote/premiumIndex']);
  assert.equal(unexpected.length, 0);
  assert.equal(good.facts.open_interest.status, 'NOT_CHECKED');
  assert.equal(good.facts.open_interest.reason, 'OPTIONAL_KIND_NOT_REQUESTED');
  assert.equal(good.facts.trades.status, 'USABLE');
  assert.equal(good.facts.funding.status, 'USABLE');
  assert.equal(good.facts.funding.unit, 'RATE_FRACTION_PER_ACTUAL_PERIOD');
  assert.equal(good.facts.funding.value.rate, -0.01);
  assert.equal(good.facts.funding.native_value_decimal, '-0.0100');
  assert.equal(good.facts.funding.event_ts, T - 1000);
  assert.notEqual(good.facts.funding.event_ts, good.facts.funding.received_ts);
  assert.notEqual(good.facts.funding.event_ts, good.facts.funding.value.next_funding_ts);
  assert.equal(good.facts.funding.value.funding_payment_event_ts, null);
  assert.equal(good.facts.funding.value.period_ms, 3600000);
  assert.equal(good.facts.funding.coverage.clock_semantics, 'RATE_QUOTE_SNAPSHOT');
  assert.equal(good.facts.funding.coverage.vendor_unit_guarantee_claimed, false);
  assert.equal(good.facts.funding.unit_qualification_basis, 'ADAPTER_BASED_INFERENCE');
  assert.equal(unknownCalls.length, 0);
  assert.equal(unknown.facts.funding.status, 'NOT_CHECKED');
  assert.equal(unknown.facts.funding.reason, 'FUNDING_RATE_UNIT_UNQUALIFIED');
  assert.equal(noPeriod.qualified, false);
  assert.equal(noPeriod.reason, 'FUNDING_PERIOD_UNKNOWN');
  assert.equal(noPeriod.value.period_ms, null);
  const scheduleClock = structuredClone(controlled);
  scheduleClock.clock_proof.field = 'nextFundingTime';
  assert.equal(qualifyBingxFundingQuote(scheduleClock, instrument).qualified, false);
  assert.equal(qualifyBingxFundingQuote(BINGX_FUNDING_QUOTE_PROFILE_V1, instrument).qualified, false);
  await assert.rejects(sources.getOptional({instrument, requested_kinds: ['funding', 'funding']}), {code: 'OPTIONAL_KIND_SELECTION_INVALID'});
  assert.equal(calls.length + unknownCalls.length, 2);
  report.status = 'PASS'; report.affected_cases = 1; report.fake_broker_attempts = 2; report.OI_attempts = 0;
  fs.writeFileSync(resultPath, JSON.stringify(report, null, 2) + '\n');
});
