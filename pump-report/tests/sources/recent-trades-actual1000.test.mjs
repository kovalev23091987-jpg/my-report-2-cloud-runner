import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseRecentTrades, RECENT_TRADE_SEMANTICS} from '../../sources/recent-trades.mjs';
import {createPumpSources} from '../../sources/index.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../../sources/registry-curated13-native-relative-v1.json', import.meta.url)));
const sol = registry.instruments.find(x => x.instrument.base === 'SOL');
const at = 1792958218994;
const row = i => ({fillId: String(100000000 + i), isBuyerMaker: Boolean(i % 2),
  price: '10', qty: 'UNQUALIFIED', quoteQty: '25', time: at - 1000 - i, ts: at - 1000 - i});

test('actual recent shape retains 1000 to limit100 with reviewed fillId and bounds at1001', async () => {
  const rows = Array.from({length: 1000}, (_, i) => row(i));
  const p = parseRecentTrades({code: 0, data: rows}, {instrument: sol.instrument, received_ts: at});
  assert.equal(RECENT_TRADE_SEMANTICS.limit, 100);
  assert.equal(p.value.length, 1000); assert.equal(p.qualified, true);
  assert.equal(p.coverage.invalid_id, 0); assert.equal(p.event_ts, at - 1000);
  assert.equal(p.coverage.returned_more_than_requested, true);
  assert.equal(p.coverage.response_rows_max, 1000); assert.equal(p.coverage.fillId_alias_accepted, true);
  assert.equal(p.coverage.full_window_coverage, false); assert.equal(p.coverage.complete, false);
  assert.ok(p.value.every((x, i) => x.trade_id === rows[i].fillId && x.event_ts !== null && x.notional_quote === 25));
  assert.throws(() => parseRecentTrades({code: 0, data: [...rows, row(1000)]},
    {instrument: sol.instrument, received_ts: at}), /BINGX_BOUNDED_TRADE_ARRAY_REQUIRED/);

  // A defect beyond the requested first100 cannot disappear through slicing.
  const mixed = rows.map(r => ({...r, id: r.fillId}));
  mixed[999] = {...mixed[999], id: mixed[998].id, fillId: mixed[998].fillId, price: '12', quoteQty: '0'};
  const q = parseRecentTrades({code: 0, data: mixed}, {instrument: sol.instrument, received_ts: at});
  assert.equal(q.value.length, 1000); assert.equal(q.value[999].trade_id, q.value[998].trade_id);
  assert.equal(q.coverage.invalid_notional, 1); assert.equal(q.coverage.qualified_before_dedup, 999);
  assert.equal(q.coverage.duplicate_and_conflicting_ids_preserved, true);

  let calls = 0;
  const sources = createPumpSources({identityRegistry: [sol], profile: START_PROFILE, clock: () => at,
    broker: {async request(request) {
      calls++; const url = new URL(request.url);
      assert.equal(url.searchParams.get('limit'), '100'); assert.ok(url.pathname.endsWith('/quote/trades'));
      return {ok: true, status: 200, data: {code: 0, data: rows}, received_ts: at,
        receipt_id: 'F553_SYNTHETIC_OFFLINE_ONLY', cache_hit: false};
    }}});
  const fact = (await sources.getOptional({instrument: sol.instrument})).facts.trades;
  assert.equal(calls, 1); assert.equal(fact.status, 'USABLE'); assert.equal(fact.value.length, 1000);
  assert.equal(fact.event_ts, at - 1000); assert.equal(fact.expires_ts, at + 29000);
  assert.equal(fact.reason, null);
});
