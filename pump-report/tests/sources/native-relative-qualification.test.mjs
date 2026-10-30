import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPumpSources} from '../../sources/index.mjs';
import {parseCandles} from '../../sources/bingx.mjs';
import {createNativeRelativeCandleQualification} from '../../sources/native-relative-qualification.mjs';
import {candleNativeComparisonKey, CANDLE_NATIVE_RELATIVE_UNIT, CANDLE_NATIVE_RELATIVE_KIND,
  CANDLE_CCXT_TIME_BASIS} from '../../contracts/index.mjs';

const root = new URL('../../../', import.meta.url);
const read = p => fs.readFile(new URL(p, root));
const hash = b => createHash('sha256').update(b).digest('hex');
const expiry = 1792938146287;
test('approved relative candles: exact binding, null absolutes, closed gaps, zero and original freshness; owner catalog exclusion', async () => {
  assert(Date.now() < expiry, 'own semantic lease expired');
  globalThis.fetch = () => { throw Error('OFFLINE_ONLY_NO_PROVIDER_IO'); };
  const baseRaw = await read('pump-report/sources/registry-core8-retained-v1.json');
  const deltaRaw = await read('pump-report/sources/registry-next5-retained-v1.json');
  assert.equal(hash(baseRaw), 'd53dd25ad347a7fc9049cc1a48f1bb6af6c0b42c24a61c7d5297c761b72c27b5');
  assert.equal(hash(deltaRaw), 'b30f795497a67dacc6719581e6ff7bae26843a6af9ed34a3add396cf62fe7db1');
  const entries = [...JSON.parse(baseRaw).instruments, ...JSON.parse(deltaRaw).instruments];
  const btc = entries.find(e => e.instrument.base === 'BTC'), eth = entries.find(e => e.instrument.base === 'ETH');
  const step = 60000, end = Math.floor(Date.now() / step) * step, start = end - 121 * step;
  const qualification = createNativeRelativeCandleQualification(btc.instrument);
  const body = {code: 0, data: Array.from({length: 121}, (_, i) => ({time: start + i * step,
    open: '100', high: '102', low: '99', close: '101', volume: '10.000'}))};
  const options = {start, end, interval_ms: step, received_ts: end + 1000, instrument: btc.instrument,
    windows_ms: [300000, 900000, 3600000], qualification};
  const parse = (data = body, extra = {}) => parseCandles(data, {...options, ...extra});
  const p = parse();
  assert.equal(p.qualified, true); assert.equal(p.unit, CANDLE_NATIVE_RELATIVE_UNIT);
  assert.equal(p.coverage.time_basis, CANDLE_CCXT_TIME_BASIS); assert.equal(p.coverage.time_qualified, true);
  assert.equal(p.coverage.volume_qualified, false); assert.equal(p.coverage.relative_volume_qualified, true);
  assert.equal(p.coverage.absolute_base_amount_qualified, false); assert.equal(p.coverage.absolute_USD_amount_qualified, false);
  assert.equal(p.coverage.complete, true); assert.equal(p.coverage.usable_windows.length, 3);
  assert.equal(p.event_ts, end);
  for (const row of p.value) {
    assert.equal(row.volume_base, null); assert.equal(row.turnover_quote, null);
    assert.equal(row.volume_native, 10); assert.equal(row.native_volume_decimal, '10.000');
    assert.equal(row.native_quantity_unit, 'UNKNOWN'); assert.equal(row.comparison_kind, CANDLE_NATIVE_RELATIVE_KIND);
    assert.equal(row.volume_comparison_key, candleNativeComparisonKey(btc.instrument));
    assert.equal(row.close_ts, row.open_ts + step); assert.equal(row.closed, true);
  }
  // Every qualification seam must fail closed, including outcome time use.
  for (const mutate of [q => q.volume.comparison_key = candleNativeComparisonKey(eth.instrument),
    q => q.volume.instrument_id = eth.instrument.instrument_id, q => q.volume.route += '/other',
    q => q.volume.field = 'turnover', q => q.volume.interval_ms = 300000,
    q => q.time.pinned_commit = 'unapproved', q => q.owner_decision_git_blob = 'unapproved',
    q => q.volume.identity_evidence_ref = eth.instrument.identity_evidence_ref,
    q => {q.mode = 'OTHER'; q.time.basis = 'OTHER'; q.volume.unit = 'BASE_ASSET'; q.volume.comparison_kind = 'OTHER';}]) {
    const bad = structuredClone(qualification); mutate(bad);
    const rejected = parse(body, {qualification: bad});
    assert.equal(rejected.qualified, false); assert.equal(rejected.coverage.time_qualified, false);
    assert.equal(rejected.reason, 'NATIVE_RELATIVE_QUALIFICATION_MISMATCH');
    assert.equal(rejected.event_ts, null); assert(rejected.value.every(r => r.volume_native === null && r.volume_base === null));
  }
  assert.throws(() => createNativeRelativeCandleQualification(btc.instrument, 300000));
  const zero = parse({...body, data: body.data.map(r => ({...r, volume: '0'}))});
  assert(zero.value.every(r => r.volume_native === 0 && r.volume_base === null && r.turnover_quote === null));
  assert(zero.value.every(r => !Object.hasOwn(r, 'volume_ratio')), 'source must not manufacture division by zero');
  const missing = structuredClone(body); missing.data[0].volume = null;
  assert.throws(() => parse(missing), e => e.code === 'BINGX_CANDLE_FIELDS_INVALID');
  const gap = parse({...body, data: body.data.filter((_, i) => i !== 60)});
  assert.equal(gap.coverage.complete, false); assert.equal(gap.coverage.gaps.length, 1);
  assert.equal(gap.value.length, 60); assert.equal(gap.coverage.noncontiguous_older_rows_excluded, 60);
  assert.equal(gap.coverage.contiguous_tail.duration_ms, 3600000);
  const capturedOpen = parse(body, {received_ts: end - 30000});
  assert.equal(capturedOpen.value.length, 120); assert.equal(capturedOpen.event_ts, end - step);
  assert.equal(capturedOpen.coverage.complete, false);
  const strictUnknown = parse(body, {qualification: {}});
  assert.equal(strictUnknown.qualified, false); assert.equal(strictUnknown.event_ts, null);
  const strictBase = parse(body, {qualification: {time: {semantics: 'OPEN_TIME', evidence_ref: 'FIXTURE'},
    volume: {unit: 'BASE_ASSET', evidence_ref: 'FIXTURE'}}});
  assert.equal(strictBase.qualified, true); assert.equal(strictBase.value[0].volume_base, 10);
  let calls = 0;
  const entry = structuredClone(btc); entry.qualifications.candles = qualification;
  const sourceAt = at => createPumpSources({identityRegistry: [entry], clock: () => at,
    broker: {async request(r) {calls++; assert.equal(r.purpose, 'CORE');
      return {ok: true, status: 200, data: body, received_ts: end + 1000, receipt_id: 'SYNTHETIC_RELATIVE_ONLY', cache_hit: true};}}});
  const fresh = await sourceAt(end + 5000).getCore({instrument: btc.instrument, only_facts: ['candles']});
  assert.equal(fresh.facts.candles.status, 'USABLE'); assert.equal(fresh.facts.candles.unit, CANDLE_NATIVE_RELATIVE_UNIT);
  const stale = await sourceAt(end + 100000).getCore({instrument: btc.instrument, only_facts: ['candles']});
  assert.equal(stale.facts.candles.status, 'STALE'); assert.equal(stale.facts.candles.event_ts, end);
  assert.equal(stale.facts.candles.received_ts, end + 1000); assert.equal(stale.facts.candles.expires_ts, end + 90000);
  const invalidEntry = structuredClone(entry); invalidEntry.qualifications.candles.volume.comparison_key = candleNativeComparisonKey(eth.instrument);
  const invalidHistory = createPumpSources({identityRegistry: [invalidEntry], clock: () => end + 5000,
    broker: {async request() {calls++; return {ok: true, status: 200, data: body, received_ts: end + 1000, receipt_id: 'SYNTHETIC_BAD_HISTORY'};}}});
  const h = await invalidHistory.getOutcomeHistory({instrument: btc.instrument, start_ts: start, end_ts: end});
  assert.equal(h.facts.candles.status, 'INCOMPLETE'); assert.equal(h.coverage.time_qualified, false);
  const nativeRaw = await fs.readFile('/private/tmp/pump-report-native-candles.json');
  assert.equal(hash(nativeRaw), '0147e292d099f5f13ba395ca3fbaebd22571453c87928752e8a4b89d7644f555');
  const native = JSON.parse(nativeRaw).body.response, times = native.data.data.map(r => r.time).sort((a,b) => a-b);
  const observed = parseCandles(native.data, {...options, start: times[0], end: times.at(-1) + step, received_ts: native.received_ts});
  assert.equal(observed.qualified, true); assert.equal(observed.value.length, 125); assert.equal(observed.coverage.complete, true);
  for (const r of observed.value) {assert.equal(r.volume_base, null); assert.equal(r.turnover_quote, null);
    assert(Number.isFinite(r.volume_native) && r.volume_native >= 0); assert.equal(r.close_ts, r.native_time + step);}
  assert(Date.now() > observed.event_ts + 90000, 'native capture remains historical now');
  const catalog = createPumpSources({identityRegistry: [btc], clock: () => end + 5000,
    broker: {async request() {calls++; return {ok: true, status: 200, received_ts: end + 1000, receipt_id: 'SYNTHETIC_CATALOG_EXCLUSIONS',
      data: {code: 0, data: [{symbol: 'PAXG-USDT', asset: 'PAXG', currency: 'USDT', status: 1},
        {symbol: 'XAUT-USDT', asset: 'XAUT', currency: 'USDT', status: 1},
        {symbol: 'UNQUALIFIED-USDT', asset: 'UNQUALIFIED', currency: 'USDT', status: 1}]}};}}});
  const cat = await catalog.getCatalog(); assert.equal(cat.instruments.length, 0);
  assert.deepEqual(cat.unqualified.map(r => r.reason), ['OWNER_EXCLUDED_GOLD_BACKED_ASSET',
    'OWNER_EXCLUDED_GOLD_BACKED_ASSET', 'CRYPTO_ASSET_IDENTITY_UNQUALIFIED']);
  assert.equal(calls, 4); assert(Date.now() < expiry);
});
