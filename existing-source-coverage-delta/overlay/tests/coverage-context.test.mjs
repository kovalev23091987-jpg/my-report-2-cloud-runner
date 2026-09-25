import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeHyperliquidContext,classifyHyperliquidPositionChange,normalizeBitgetContext,normalizeCoinbaseContext,decideDeribitUtility} from '../src/existing-source-coverage-normalizers.mjs';
import {consumeExistingSourceReceipts} from '../src/existing-source-consumer.mjs';
test('Hyperliquid market context normalizes and never becomes global liquidation map',()=>{
 const h=normalizeHyperliquidContext({coin:'BTC',metaAndAssetCtxs:[{universe:[{name:'BTC'}]},[{markPx:'100',openInterest:'10',funding:'0.0001'}]],fundingHistory:[{coin:'BTC',fundingRate:'0.0002',time:2}],l2Book:{levels:[[{px:'99',sz:'1'}],[{px:'101',sz:'1'}]]},clearinghouseState:{assetPositions:[]}});
 assert.equal(h.status,'CLOSED');assert.equal(h.open_interest_usd,1000);assert.equal(h.known_addresses_are_sample_only,true);assert.equal(h.not_global_liquidation_map,true);
});
test('Hyperliquid position changes distinguish open increase decrease close and flip',()=>{
 assert.equal(classifyHyperliquidPositionChange({szi:0},{szi:1}).status,'OPENED');
 assert.equal(classifyHyperliquidPositionChange({szi:1},{szi:2}).status,'INCREASED');
 assert.equal(classifyHyperliquidPositionChange({szi:2},{szi:1}).status,'DECREASED');
 assert.equal(classifyHyperliquidPositionChange({szi:1},{szi:0}).status,'CLOSED');
 assert.equal(classifyHyperliquidPositionChange({szi:1},{szi:-1}).status,'FLIPPED');
});
test('Bitget context is measurement-only and never voting',()=>{const b=normalizeBitgetContext({ticker:{data:[{symbol:'BTCUSDT',lastPr:'100'}]},openInterest:{data:{openInterestList:[{symbol:'BTCUSDT',size:'5'}]}},funding:{data:[{symbol:'BTCUSDT',fundingRate:'0.0001'}]}});assert.equal(b.status,'CLOSED');assert.equal(b.no_automatic_voting,true);});
test('Coinbase context preserves quote identity',()=>{const c=normalizeCoinbaseContext({product:'BTC-USD',ticker:{price:'100',bid:'99',ask:'101'},book:{sequence:10,bids:[['99','1',1]],asks:[['101','1',1]]}});assert.equal(c.status,'CLOSED');assert.equal(c.quote_currency,'USD');assert.equal(c.quotes_are_not_equivalent,true);});
test('Deribit stays disabled for direct altcoin signal',()=>{const d=decideDeribitUtility({summary:{result:[{open_interest:5},{open_interest:7}]},target_asset:'ONG'});assert.equal(d.status,'CLOSED');assert.equal(d.decision,'DISABLED_NO_DIRECT_ALTCOIN_SIGNAL');assert.equal(d.directional_vote,false);});
test('extended consumer accepts existing Hyperliquid Bitget Coinbase facts only as advisory context',()=>{
 const h={status:'CLOSED',coin:'BTC',funding_rate:0.1,open_interest_usd:1000,spread_pct:0.02};
 const b={status:'CLOSED',funding_rate:0.2,open_interest:5,open_interest_unit:'контрактов'};
 const c={status:'CLOSED',price:100,quote_currency:'USD'};
 const r=consumeExistingSourceReceipts({hyperliquid:h,bitget:b,coinbase:c});
 assert.equal(r.status,'CLOSED');assert.ok(r.facts.some(x=>x.source==='Hyperliquid'));assert.ok(r.facts.some(x=>x.source==='Bitget'));assert.ok(r.facts.some(x=>x.source==='Coinbase Exchange'));assert.ok(r.facts.every(x=>x.advisory_only&&x.directional_vote===false&&x.hard_gate===false));
});
