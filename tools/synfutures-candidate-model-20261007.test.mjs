import test from 'node:test';import assert from 'node:assert/strict';import {calculateCandidateSynfuturesThreshold as calc} from './synfutures-candidate-model-20261007.mjs';
const W=10n**18n,base={position:{size:String(W),balance:String(100n*W),entryNotional:String(1000n*W),entrySocialLossIndex:'0',entryFundingIndex:'0'},amm:{longSocialLossIndex:'0',shortSocialLossIndex:'0',longFundingIndex:'0',shortFundingIndex:'0'},maintenance_margin_ratio:500},copy=()=>JSON.parse(JSON.stringify(base));
test('isolated native conditional thresholds preserve exact WAD units and protocol rounding for both sides',()=>{
 const long=calc(copy()),short=copy();short.position.size=String(-W);assert.equal(long.price_wad,'947368421052631578947');assert.equal(calc(short).price_wad,'1047619047619047619048');assert.equal(long.entry_authorized,false);assert.equal(long.execution_target_eligible,false);
});
test('native social loss raises long threshold and lowers short threshold, without inferred labels or HTX levels',()=>{
 const a=copy();a.amm.longSocialLossIndex=String(10n*W);assert.equal(calc(a).social_loss_wad,String(10n*W));assert.ok(BigInt(calc(a).price_wad)>BigInt(calc(base).price_wad));a.position.size=String(-W);a.amm.shortSocialLossIndex=String(10n*W);const b=copy();b.position.size=String(-W);assert.ok(BigInt(calc(a).price_wad)<BigInt(calc(b).price_wad));
});
test('signed funding rounds half away from zero using full exact native integer state',()=>{
 for(const sign of [1n,-1n]){const x=copy();x.position.size='1';x.position.entryNotional=String(W);x.position.balance='1';x.amm.longFundingIndex=String(sign*W/2n);assert.equal(calc(x).funding_fee_wad,String(sign));}
});
test('unknown invalid MMR or position, regressed loss and nonpositive denominator are rejected rather than invented',()=>{
 for(const mutate of [x=>x.position.size='0',x=>x.position.balance='0',x=>x.position.entryNotional='0',x=>x.maintenance_margin_ratio=10000,x=>x.maintenance_margin_ratio=0,x=>x.maintenance_margin_ratio=1.5,x=>x.position.entrySocialLossIndex='1']){const x=copy();mutate(x);assert.throws(()=>calc(x));}
});
test('an overcollateralized position has no positive conditional liquidation level',()=>{
 const x=copy();x.position.balance=String(2000n*W);const a=calc(x);assert.equal(a.price_wad,'0');assert.equal(a.positive_threshold,false);
});
