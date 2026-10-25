import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseRecentTrades} from '../../sources/recent-trades.mjs';
import {createPumpSources} from '../../sources/index.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../../sources/registry-curated13-native-relative-v1.json', import.meta.url)));
const sol = registry.instruments.find(x => x.instrument.base === 'SOL'), at = 1792961000000;
const row = changes => ({price: '10', quoteQty: '25', qty: 'NOT_BASE', time: at - 1000,
  isBuyerMaker: false, ...changes});

test('ROOT-reviewed fillId preserves native IDs and conflicts without fallback or consumer dedup', async () => {
  const rows = [row({fillId: '900719925474099312345'}), row({id: '77'}), row({fillId: '77', price: '12'}),
    row({id: 8, fillId: '8'}), row({id: '9', fillId: '10'}), row({id: undefined, fillId: '11'}),
    row({fillId: Number.MAX_SAFE_INTEGER + 1}), row({fillId: '01'}), row({tradeId: '12'}),
    row({t: '13'}), row({fillId: '14', time: undefined, ts: at}), row({fillId: '15', quoteQty: undefined})];
  const p = parseRecentTrades({code: 0, data: rows}, {instrument: sol.instrument, received_ts: at});
  assert.equal(p.value.length, rows.length); assert.equal(p.value[0].trade_id, rows[0].fillId);
  assert.equal(p.value[1].trade_id, p.value[2].trade_id); assert.notEqual(p.value[1].price, p.value[2].price);
  assert.equal(p.value[3].trade_id, '8'); assert.equal(p.coverage.conflicting_id_fields, 2);
  assert.ok(p.value.slice(4, 10).every(x => x.trade_id === null));
  assert.equal(p.value[10].event_ts, null); assert.equal(p.value[11].notional_quote, null);
  assert.equal(p.coverage.qualified_before_dedup, 4); assert.equal(p.coverage.vendor_ID_uniqueness_guaranteed, false);
  assert.equal(p.coverage.full_window_coverage, false); assert.equal(p.coverage.base_quantity_derived, false);
  let calls = 0;
  const sources = createPumpSources({identityRegistry: [sol], profile: START_PROFILE, clock: () => at,
    broker: {async request(request) {
      calls++; assert.equal(new URL(request.url).searchParams.get('limit'), '100');
      return {ok: true, status: 200, data: {code: 0, data: [rows[0]]}, received_ts: at,
        receipt_id: 'F555_ID_SYNTHETIC_ONLY', cache_hit: false};
    }}});
  const fact = (await sources.getOptional({instrument: sol.instrument})).facts.trades;
  assert.equal(calls, 1); assert.equal(fact.status, 'USABLE'); assert.equal(fact.value[0].trade_id, rows[0].fillId);
  assert.equal(fact.event_ts, at - 1000); assert.equal(fact.expires_ts, at + 29000);
});
