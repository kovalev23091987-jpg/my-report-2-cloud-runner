import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {actual,controlled,end} from './gate-n12-saved-inputs.mjs';
const modulePath=n=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${n}`):new URL(`../files/src/${n}`,import.meta.url);
const {normalizeGateN12BoundedTradeSample:normalize,validateGateN12BoundedTradeSample:valid}=await import(modulePath('gate-n12-bounded-trade-sample.mjs'));
test('both actual saved Gate pages preserve real observation and yield no currently fresh fact',()=>{
 assert.equal(normalize(actual()).status,'NO_RECENT_ORIGINAL_TRADES');assert.equal(normalize(actual('SUSHI')).status,'SOURCE_SAMPLE_EXPIRED');
});
test('explicit People event-clock control produces one bounded15.8067USDT sample at its retained observation',()=>{
 const p=controlled(),r=normalize(p);assert.equal(r.status,'CLOSED_BOUNDED_SAMPLE');assert.equal(r.network_calls,0);assert(Math.abs(r.evidence[0].value-15.8067)<1e-10);assert.equal(r.evidence[0].valid_recent_rows,1);assert.equal(r.evidence[0].observed_ts,p.observed_ts);assert.equal(r.evidence[0].first_known_ts,p.observed_ts);assert.equal(r.evidence[0].source_ts,end-1000);assert.equal(valid(r.evidence[0],p.observed_ts),true);assert.equal(valid(r.evidence[0],r.evidence[0].expires_at),false);
});
const rawMutations={
 'missing identity method':p=>delete p.identity_method,
 'foreign identity':p=>p.identity.contract_or_mint='0x'+'1'.repeat(40),
 'wrong receipt symbol':p=>p.trade_receipts[0].url=p.trade_receipts[0].url.replace('PEOPLE_USDT','SUSHI_USDT'),
 'wrong receipt endpoint':p=>p.trade_receipts[0].url=p.trade_receipts[0].url.replace('spot/trades','futures/trades'),
 'wrong receipt window':p=>p.trade_receipts[0].url=p.trade_receipts[0].url.replace('1791621720','1791621780'),
 'missing wire digest':p=>delete p.trade_receipts[0].body_sha256,
 'missing parsed digest':p=>delete p.trade_receipts[0].payload_sha256,
 'foreign body under old digest':p=>p.pages[0][0].currency_pair='SUSHI_USDT',
 'changed amount under old digest':p=>p.pages[0][0].amount='1',
 'duplicate page':p=>p.pages.push(structuredClone(p.pages[0])),
 'future receipt':p=>p.trade_receipts[0].received_ts++,
 'observation older than receipt':p=>p.observed_ts--,
 'four trade pages':p=>p.pages.push(...[1,2,3].map(()=>[])),
 'null contract':p=>p.contract=null,
 'numeric contract':p=>p.contract=1,
};
for(const [name,change]of Object.entries(rawMutations))test(`Gate source refuses ${name} before a bounded fact`,()=>{const p=controlled();change(p);assert.equal(normalize(p).evidence.length,0);});
const cacheMutations={
 'foreign quote':r=>r.quote='USD',
 'foreign provider':r=>r.provider_id='HTX_LARGE_TRADES',
 'different market':r=>r.market='FUTURES',
 'future first knowledge':r=>r.first_known_ts++,
 'renewed observation':r=>r.observed_ts++,
 'extended original expiry':r=>r.expires_at++,
 'string quote turnover':r=>r.buy_quote_turnover_usdt=String(r.buy_quote_turnover_usdt),
 'mismatched turnover':r=>r.value++,
 'mismatched imbalance':r=>r.taker_imbalance=0,
 'false complete window':r=>r.whole_window_coverage_proven=true,
 'false decision coverage':r=>r.coverage_fraction=1,
 'null reference chain':r=>r.asset_reference.currencies[0].chains=[null],
 'missing physical ID':r=>{delete r.origin_event_id;delete r.physical_root_key;delete r.dependency_group;},
};
for(const [name,change]of Object.entries(cacheMutations))test(`compact Gate sample refuses ${name} without throwing`,()=>{const p=controlled(),r=structuredClone(normalize(p).evidence[0]);change(r);assert.equal(valid(r,p.observed_ts),false);});
