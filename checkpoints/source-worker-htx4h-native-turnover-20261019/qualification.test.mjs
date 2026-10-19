import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {qualifyCohort,saveCohort,repo,here} from './qualify-cohort.mjs';
import {qualifySavedHtx4hTurnover as qualify,deriveCompleteUtcBuckets as derive,sha256,FOUR_HOURS,DAY} from './htx4h-native-turnover.mjs';

const manifest=JSON.parse(fs.readFileSync(path.join(repo,'checkpoints/htx-compact-4h/AAVE-USDT.manifest.json')));
const original=gunzipSync(fs.readFileSync(path.join(repo,'checkpoints/htx-compact-4h/AAVE-USDT.raw.json.gz'))).toString('utf8');
// Adversarial mutations are CONTROLLED derivatives of one saved source, not
// provider responses. Reset their local hash only to reach semantic predicates.
function fixture(mutate=()=>{},rewrite=s=>s){
 const m=structuredClone(manifest),raw=JSON.parse(original);mutate({m,raw});const body=rewrite(JSON.stringify(raw));
 m.receipt.bytes=Buffer.byteLength(body);m.raw_sha256=m.receipt.sha256=sha256(body);
 return {contract:'AAVE-USDT',manifest:m,raw_utf8:body,expected_raw_sha256:sha256(body)};
}
let witness;
test('NEW actual37 saved raw→native lexemes→closed4h→complete derivedUTC cohort, preserving old OHLC',()=>{
 const result=qualifyCohort();saveCohort(result);witness=result.summary;
 assert.equal(witness.contracts,37);assert.equal(witness.forming_rows_excluded,37);assert.ok(witness.contracts_with_20_complete_derived_utc_weeks>20);
 for(const x of result.payload.artifacts){
  assert.equal(x.native.live_quote_eligible,false);assert.equal(x.native.entry_authorized,false);
  for(const r of x.native.rows){assert.ok(r.end_ts<=x.native.source_ts);assert.ok(r.end_ts<=x.native.first_known_ts);assert.ok(r.native_lexemes.trade_turnover);}
  for(const row of x.derived_utc.week.complete)assert.equal(row.first_known_ts,x.native.first_known_ts);
 }
});

const bad=[
 ['mark-price endpoint',x=>x.m.receipt.url=x.m.receipt.url.replace('/history/kline','/history/mark_price_kline')],
 ['index endpoint',x=>x.m.receipt.url=x.m.receipt.url.replace('linear-swap-ex/market','index/market')],
 ['different request contract',x=>x.m.receipt.contract='BTC-USDT'],
 ['different manifest contract',x=>x.m.contract='BTC-USDT'],
 ['non4hour request',x=>x.m.receipt.url=x.m.receipt.url.replace('4hour','15min')],
 ['mismatched channel',x=>x.raw.ch='market.BTC-USDT.kline.4hour'],
 ['mark zero response',x=>{x.raw.ch='market.AAVE-USDT.mark_price.4hour';x.raw.data[0].trade_turnover=0;}],
 ['non200 receipt',x=>x.m.receipt.http_status=503],
 ['future source response clock',x=>{x.raw.ts=x.m.source_ts=x.m.receipt.received_ts+1;}],
 ['source before original request',x=>{x.raw.ts=x.m.source_ts=x.m.receipt.requested_ts-1;}],
 ['unsafe received clock',x=>x.m.receipt.received_ts=Number.MAX_SAFE_INTEGER+1],
 ['missing original firstknown',x=>delete x.m.receipt.received_ts],
 ['negative turnover',x=>x.raw.data[0].trade_turnover=-1],
 ['unsafe turnover magnitude',x=>x.raw.data[0].trade_turnover=1e30],
 ['missing turnover',x=>delete x.raw.data[0].trade_turnover],
 ['string turnover',x=>x.raw.data[0].trade_turnover='123'],
 ['nonfinite turnover',x=>x.raw.data[0].trade_turnover=Infinity],
 ['fractional trade count',x=>x.raw.data[0].count=.5],
 ['zero price',x=>x.raw.data[0].open=0],
 ['inverted OHLC',x=>x.raw.data[0].high=.01],
 ['offgrid start',x=>x.raw.data[0].id++],
 ['duplicate start',x=>x.raw.data[1].id=x.raw.data[0].id],
 ['descending starts',x=>[x.raw.data[0],x.raw.data[1]]=[x.raw.data[1],x.raw.data[0]]],
 ['future bar start',x=>x.raw.data.at(-1).id+=1000000],
 ];
for(const[name,fn]of bad)test(`NEW CONTROLLED rejection: ${name}`,()=>assert.throws(()=>qualify(fixture(fn))));
test('NEW exact original bytes/hash mismatch refuses before semantic admission',()=>{
 const f=fixture();f.raw_utf8+=' ';assert.throws(()=>qualify(f),/HASH_AND_BYTES/);
});
test('NEW duplicate numeric property refuses rather than last-wins',()=>assert.throws(()=>qualify(fixture(()=>{},s=>s.replace('"trade_turnover":108430.9838','"trade_turnover":1,"trade_turnover":108430.9838'))),/DUPLICATE/));
test('NEW unsafe huge exponent refuses without expansion',()=>assert.throws(()=>qualify(fixture(()=>{},s=>s.replace('"trade_turnover":108430.9838','"trade_turnover":1e999999'))),/UNSAFE/));
test('NEW gaps stay absent, incomplete UTC buckets are omitted, original firstknown is not candleclose',()=>{
 const f=fixture(x=>x.raw.data.splice(60,1)),q=qualify(f),d=derive(q,'DAY'),w=derive(q,'WEEK_MONDAY');
 assert.equal(q.gaps.length,1);assert.equal(q.gaps[0].missing_4h_bars,1);assert.equal(q.rows.length,1198);
 assert.ok(d.incomplete.some(x=>x.observed_4h_bars===5));assert.ok(w.incomplete.some(x=>x.observed_4h_bars===41));
 assert.equal(q.first_known_ts,manifest.receipt.received_ts);assert.ok(q.rows[0].end_ts<q.first_known_ts);assert.equal(q.live_quote_eligible,false);
});
test('NEW native zeros remain measured only for exact trade endpoint, not fabricated gaps',()=>{
 const f=fixture(x=>{for(const k of ['amount','vol','trade_turnover','count'])x.raw.data[0][k]=0;}),q=qualify(f);
 assert.equal(q.rows[0].native_lexemes.trade_turnover,'0');assert.equal(q.rows.length,1199);assert.equal(q.gaps.length,0);
});
test('NEW lexical precision/exponent/both-sides retained, derived sum is exact and not divided by2',()=>{
 const f=fixture(x=>{x.raw.data=x.raw.data.slice(5,11);},s=>s.replace(/"trade_turnover":[^,}]+/g,'"trade_turnover":1.230000000000000001e2'));
 // Six original AAVE rows starting at the following UTC midnight.
 const q=qualify(f),d=derive(q,'DAY');assert.equal(q.rows[0].native_lexemes.trade_turnover,'1.230000000000000001e2');
 assert.equal(d.complete.length,1);assert.equal(d.complete[0].derived_quote_turnover_usdt_exact,'738.0000000000000006');assert.equal(q.conversion_applied,false);
 assert.equal(d.complete[0].end_ts-d.complete[0].start_ts,DAY);
 assert.throws(()=>derive(q,'15MIN'));assert.equal(q.period,'4hour');assert.equal(q.rows[0].end_ts-q.rows[0].open_ts,FOUR_HOURS);
});
test.after(()=>{
 if(witness)fs.writeFileSync(path.join(here,'qualification-boundaries.json'),JSON.stringify({schema:'HTX4H_NATIVE_TURNOVER_NEW_QUALIFICATION_BOUNDARIES_V1',actual_source_cohort:37,new_test_file_only:true,old_test_modules_imported:[],production_imports:false,source_HTTP:0,native_SQL:0,score_contribution:0,ENTRY:false,live_coverage:false,body_completion_ACK:false,first_known_basis:witness.first_known_limitation,adversarial_cases:'CONTROLLED mutations from retained AAVE; never native source agreement or executed provider failures'},null,2)+'\n');
});
