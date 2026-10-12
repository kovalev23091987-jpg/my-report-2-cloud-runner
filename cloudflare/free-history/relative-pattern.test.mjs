import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeBtcEthRelativePattern} from './relative-pattern.mjs';

const H=3_600_000,start=1_791_800_000_000-1_791_800_000_000%H;
const series=(contract,prices,venue='HTX')=>({status:'CLOSED',decision_usable:false,contract,market:'FUTURES',venue,samples:prices.map((price,i)=>({hour_bucket:start+i*H,price}))});
test('observes matched fall resistance and rise acceleration without score or entry',()=>{
  const btc=series('BTC-USDT',[100,99,98,97,98,99,100]);
  const eth=series('ETH-USDT',[100,98,96,94,96,98,100]);
  const coin=series('ADA-USDT',[100,99.5,99,98.5,101,104,107]);
  const r=summarizeBtcEthRelativePattern({coin,btc,eth});
  assert.equal(r.status,'DESCRIPTIVE_CONTEXT');assert.equal(r.down_hours,3);assert.equal(r.up_hours,3);assert.equal(r.down_outperformed_both,3);assert.equal(r.up_outperformed_both,3);assert.equal(r.score_contribution,0);assert.equal(r.entry_authorized,false);assert.equal(r.report_ready,false);
});
test('missing adjacent hours or wrong venue cannot make a comparative pattern',()=>{
  const btc=series('BTC-USDT',[100,99,98,97,98,99,100]);
  const eth=series('ETH-USDT',[100,98,96,94,96,98,100]);
  const coin=series('ADA-USDT',[100,99.5,99,98.5,101,104,107]);
  coin.samples.splice(3,1);
  assert.equal(summarizeBtcEthRelativePattern({coin,btc,eth}).status,'INSUFFICIENT_BOTH_REGIMES');
  assert.equal(summarizeBtcEthRelativePattern({coin:series('ADA-USDT',[100,101], 'GATE'),btc,eth}).status,'EXACT_SAME_MARKET_SERIES_REQUIRED');
  assert.equal(summarizeBtcEthRelativePattern({coin:{...series('ADA-USDT',[100,99.5,99,98.5,101,104,107]),identity_scope:'EXTERNAL_PAIR_IDENTITY_UNVERIFIED'},btc,eth}).status,'EXACT_SAME_MARKET_SERIES_REQUIRED');
});
