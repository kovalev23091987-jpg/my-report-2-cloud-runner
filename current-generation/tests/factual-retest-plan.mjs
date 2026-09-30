import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Exercise the exact observation-plan function from the adapter. This bounded
// plan replay is deliberately not presented as full publication acceptance.
const root=path.resolve(process.argv[2]||'current-generation/files');
const source=fs.readFileSync(path.join(root,'src/canonical-runtime-adapter.mjs'),'utf8');
const {evaluateTechnicalMovePotential}=await import(pathToFileURL(path.join(root,'src/technical-move-potential.mjs')).href);
const start=source.indexOf('function observationPlan('),end=source.indexOf('function targetsFrom(',start);
assert.ok(start>=0&&end>start,'exact adapter plan function must exist');
const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const plan=new Function('finite','evaluateTechnicalMovePotential',source.slice(start,end)+';return observationPlan;')(finite,evaluateTechnicalMovePotential);
const make=(direction,price,candle={high:110,low:100})=>plan({direction,price,observedTs:1790787993046,opportunity:{newest_event:{candle,minute_decomposition:{classification_allowed:true}}}});
const long=make('LONG',111),short=make('SHORT',99);
assert.ok(long&&short,'crossed LONG and SHORT levels stay eligible for observation');
assert.equal(long.trigger.value,110);
assert.equal(short.trigger.value,100);
assert.equal(long.trigger.confirmation_mode,'RECONFIRM_AT_RECHECK');
assert.equal(short.trigger.confirmation_mode,'RECONFIRM_AT_RECHECK');
assert.equal(long.trigger.next_recheck_ts,1790787993046+300000);
assert.equal(make('LONG',116),null,'remaining move below five percent is rejected');
assert.equal(make('SHORT',94),null,'remaining move below five percent is rejected');
assert.equal(make('LONG',99),null,'already cancelled LONG is rejected');
assert.equal(make('SHORT',111),null,'already cancelled SHORT is rejected');
assert.equal(make('LONG',111,{high:100,low:110}),null,'malformed candle is rejected');
assert.equal(plan({direction:'LONG',price:111,observedTs:1790787993046,opportunity:{newest_event:{candle:{high:110,low:100},minute_decomposition:{classification_allowed:false}}}}),null);
assert.equal(make('LONG',105).trigger.confirmation_mode,'FIRST_CONFIRMATION');
console.log(JSON.stringify({status:'PASS',scope:'EXACT_OBSERVATION_PLAN_ONLY',checks:11,publication_acceptance:false,telegram_calls:0}));
