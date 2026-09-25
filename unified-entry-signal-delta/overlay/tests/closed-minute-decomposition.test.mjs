import test from 'node:test';
import assert from 'node:assert/strict';
import {buildClosedMinuteDecomposition} from '../src/closed-minute-decomposition.mjs';
const M=60_000,START=1_800_000_000_000;
function bars(n=15){return Array.from({length:n},(_,i)=>{const o=100+i*0.01,c=o+(i%2?-0.03:0.02);return{ts:START+i*M,end_ts:START+(i+1)*M,duration_ms:M,closed:true,open:o,high:Math.max(o,c)+0.04,low:Math.min(o,c)-0.04,close:c,volume:100+i,trade_count:10+i};});}
const event={timestamp:START,event_close_ts:START+15*M};
const hypotheses={ABSORPTION_ACCUMULATION:{evidence_score:70},DISTRIBUTION:{evidence_score:25},TWO_WAY_TRANSFER:{evidence_score:45},DERIVATIVE_LIQUIDATION_NOISE:{evidence_score:20}};
test('complete closed 1m history produces exact 1m/3m/5m decomposition and four competing hypotheses',()=>{
 const out=buildClosedMinuteDecomposition({event,one_minute:bars(),now:START+20*M,hypotheses});
 assert.equal(out.status,'CLOSED');assert.equal(out.bars['1m'].length,15);assert.equal(out.bars['3m'].length,5);assert.equal(out.bars['5m'].length,3);assert.equal(out.classification_allowed,true);assert.deepEqual(Object.keys(out.classification),['accumulation','distribution','two_sided_transfer','liquidation_futures_noise']);
});
test('missing one minute blocks final classification instead of interpolating',()=>{
 const xs=bars();xs.splice(7,1);const out=buildClosedMinuteDecomposition({event,one_minute:xs,now:START+20*M,hypotheses});
 assert.equal(out.status,'NOT_CLOSED');assert.equal(out.classification_allowed,false);assert.equal(out.classification,null);assert.equal(out.reason,'INCOMPLETE_OR_GAPPED_1M_HISTORY');
});
test('unclosed or future event cannot classify',()=>{
 const xs=bars();xs[2].closed=false;const bad=buildClosedMinuteDecomposition({event,one_minute:xs,now:START+20*M,hypotheses});assert.equal(bad.classification_allowed,false);
 const future=buildClosedMinuteDecomposition({event,one_minute:bars(),now:START+10*M,hypotheses});assert.equal(future.reason,'EVENT_NOT_CLOSED_YET');
});
