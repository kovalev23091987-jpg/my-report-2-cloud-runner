import test from 'node:test';import assert from 'node:assert/strict';
import {bitgetPublicProbePlan,coinbasePublicProbePlan,trackCoinbaseSequence,hyperliquidPublicProbePlan,deribitPublicProbePlan,normalizeOiObservation} from '../src/market-measurement-adapters.mjs';
import {normalizeOfficialEvent} from '../src/official-event-receipt.mjs';

test('Bitget measurement plan covers spot/futures instruments, trades, candles, book, OI, funding and mark/index without enabling voting',()=>{
  const p=bitgetPublicProbePlan('BTCUSDT');
  const metrics=new Set(p.calls.map(x=>x.metric));
  for(const m of ['spot_instruments','futures_instruments','futures_open_interest','futures_funding','futures_recent_trades','futures_book','futures_candles_1m','futures_candles_3m','futures_candles_5m','futures_ticker_mark_index','futures_symbol_price_mark_index'])assert.ok(metrics.has(m),m);
  assert.deepEqual(p.categories,['SPOT','USDT-FUTURES']);
  assert.equal(p.measurement_only,true);
  assert.match(p.rule,/NO_AUTOMATIC_VOTING/);
});
test('Coinbase USD/USDT/USDC context preserves quote currency',()=>{const a=coinbasePublicProbePlan('BTC-USD'),b=coinbasePublicProbePlan('BTC-USDT');assert.equal(a.quote_currency,'USD');assert.equal(b.quote_currency,'USDT');assert.notEqual(a.quote_currency,b.quote_currency);assert.equal(a.quotes_are_not_equivalent,true);});
test('Coinbase sequence duplicate and gaps are explicit',()=>{assert.equal(trackCoinbaseSequence({last_sequence:10,sequence:10}).status,'DUPLICATE');const g=trackCoinbaseSequence({last_sequence:10,sequence:12});assert.equal(g.status,'SEQUENCE_GAP');assert.equal(g.recovery_required,true);});
test('Hyperliquid known addresses remain sample only',()=>{const p=hyperliquidPublicProbePlan('BTC','0xabc');assert.equal(p.known_addresses_are_sample_only,true);assert.equal(p.not_htx_liquidation_map,true);assert.ok(p.calls.some(x=>x.metric==='l2Book'));});
test('Deribit is second priority background and production endpoint not testnet',()=>{const p=deribitPublicProbePlan('BTC');assert.equal(p.second_priority,true);assert.match(p.production_endpoint,/www\.deribit\.com/);assert.doesNotMatch(p.production_endpoint,/test\.deribit/);});
test('OI keeps venue units separate and flags USD price effect',()=>{const a=normalizeOiObservation({venue:'HTX',contracts:100,usd_value:1000,price:10}),b=normalizeOiObservation({venue:'Binance',contracts:90,usd_value:1100,price:12});assert.equal(a.do_not_average_across_venues,true);assert.equal(b.usd_change_may_include_price_effect,true);});
test('official event receipt requires official source, event date and contract identity',()=>{const r=normalizeOfficialEvent({source_url:'https://project.example/blog',published_at:'2026-09-25T00:00:00Z',event_at:'2026-10-01T00:00:00Z',chain:'ethereum',contract_or_mint:'0x1111111111111111111111111111111111111111',event_type:'TOKEN_UNLOCK',title:'Unlock'});assert.equal(r.status,'CLOSED');assert.equal(r.rumor,false);});
