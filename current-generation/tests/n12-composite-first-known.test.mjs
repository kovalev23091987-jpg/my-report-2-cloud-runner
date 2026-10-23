import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {n12CompositeFirstKnown} from '../files/src/n12-composite-first-known.mjs';

const saved=JSON.parse(fs.readFileSync(new URL('../../checkpoints/source-worker-n12-composite-clock-20261019/nil-original-origins.json',import.meta.url)));
const input=()=>({contract:saved.contract,evidence_ids:structuredClone(saved.receipt.evidence_ids),component_origins:structuredClone(saved.receipt.component_origins),decision_ts:saved.candidate_ts});
test('actual NIL three represented IDs / two N12 facts become available 18970ms after base HTX',()=>{
 const p=input(),before=structuredClone(saved.receipt);
 assert.equal(saved.n12_valid_fact_count,2);assert.equal(p.evidence_ids.length,3);
 assert.equal(n12CompositeFirstKnown(p),1792395181364);
 assert.equal(n12CompositeFirstKnown(p)-saved.receipt.observed_ts,18970);
 assert(n12CompositeFirstKnown(p)<=saved.candidate_ts);
 assert.deepEqual(saved.receipt,before);
});
test('input order never changes the original maximum or mutates origins',()=>{
 const p=input(),before=structuredClone(p);Object.freeze(p.evidence_ids);p.component_origins.forEach(Object.freeze);Object.freeze(p.component_origins);
 assert.equal(n12CompositeFirstKnown(p),1792395181364);assert.deepEqual(p,before);
 assert.equal(n12CompositeFirstKnown({...p,component_origins:[...p.component_origins].reverse()}),1792395181364);
});
test('Telegram represented subset recomputes its own clock, never inherits omitted Bitget',()=>{
 const p=input(),base=p.component_origins[0];
 assert.equal(n12CompositeFirstKnown({...p,evidence_ids:[base.evidence_id],component_origins:[base]}),1792395162394);
 assert.equal(n12CompositeFirstKnown({...p,evidence_ids:[base.evidence_id]}),null);
});
test('availability remains the original time at another still-valid evaluation',()=>{
 const p=input();assert.equal(n12CompositeFirstKnown({...p,decision_ts:p.decision_ts+1000}),1792395181364);
});
for(const [name,change] of [
 ['missing component origin',p=>p.component_origins.pop()],
 ['extra unrepresented origin',p=>p.evidence_ids.pop()],
 ['duplicate expected ID',p=>p.evidence_ids[2]=p.evidence_ids[1]],
 ['duplicate identical origin',p=>p.component_origins[2]=structuredClone(p.component_origins[1])],
 ['foreign evidence ID',p=>p.component_origins[2].evidence_id='EV2:'+'f'.repeat(64)],
 ['foreign contract',p=>p.component_origins[2].htx_contract='BR-USDT'],
 ['conflicting origin',p=>p.component_origins[2].origin_status='CONFLICTING_EVIDENCE_ID_ORIGIN'],
 ['unverified origin',p=>p.component_origins[2].origin_status='UNKNOWN'],
 ['missing origin status',p=>delete p.component_origins[2].origin_status],
 ['null origin',p=>p.component_origins[2]=null],
 ['empty expected ID',p=>p.evidence_ids[1]=''],
 ['nonstring expected ID',p=>p.evidence_ids[1]=7],
 ['missing contract',p=>delete p.contract],
 ['malformed contract',p=>p.contract=' NIL-USDT'],
 ['missing decision clock',p=>delete p.decision_ts],
 ['zero decision clock',p=>p.decision_ts=0],
 ['string decision clock',p=>p.decision_ts=String(p.decision_ts)],
 ['component not yet known',p=>p.decision_ts=1792395181363],
 ['observed before original knowledge',p=>p.component_origins[1].observed_ts--],
 ['source after original knowledge',p=>p.component_origins[1].source_ts=p.component_origins[1].first_known_ts+1],
 ['expired base component',p=>p.decision_ts=1792395222395],
 ['expired related component',p=>p.component_origins[2].expires_at=p.decision_ts-1],
 ['expiry before original observation',p=>p.component_origins[2].expires_at=p.component_origins[2].observed_ts-1],
 ])test(name+' yields UNKNOWN/null',()=>{const p=input();change(p);assert.equal(n12CompositeFirstKnown(p),null);});
for(const value of [undefined,null,0,'1792395181364',NaN,Infinity,1792395181364.5,Number.MAX_SAFE_INTEGER+1])
 test('invalid original first-known '+String(value)+' is not coerced or refreshed',()=>{const p=input();p.component_origins[1].first_known_ts=value;assert.equal(n12CompositeFirstKnown(p),null);});
for(const field of ['source_ts','observed_ts','expires_at'])test('missing '+field+' stays UNKNOWN',()=>{const p=input();delete p.component_origins[1][field];assert.equal(n12CompositeFirstKnown(p),null);});
test('explicit original expiry equality follows generic evidence boundary; no TTL extension',()=>{
 const p=input(),expiry=Math.min(...p.component_origins.map(o=>o.expires_at));
 assert.equal(n12CompositeFirstKnown({...p,decision_ts:expiry}),1792395181364);
 assert.equal(n12CompositeFirstKnown({...p,decision_ts:expiry+1}),null);
});
test('missing and empty input are unknown, never epoch zero',()=>{
 for(const p of [undefined,null,{}, {...input(),evidence_ids:[]}, {...input(),component_origins:[]}])assert.equal(n12CompositeFirstKnown(p),null);
});
