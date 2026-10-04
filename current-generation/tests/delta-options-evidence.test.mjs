import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const root=process.env.REPORT2_DELTA_MODULE_ROOT,load=n=>import(root?pathToFileURL(root+'/'+n):new URL('../files/src/'+n,import.meta.url));
const {collectDeltaOptionsEvidence,deriveDeltaOptionRisk,DELTA_FREE_LIMITS}=await load('delta-options-evidence.mjs');
const {consumeBlockResultContext}=await load('block-result-context.mjs');
const {consumeEvidenceV2}=await load('evidence-v2.mjs');
const {auditCandidateBlocks}=await load('candidate-evidence-v2-runtime.mjs');
const f=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('fixtures/delta-options-primary-20261004.json.gz',import.meta.url))));
class DB{constructor(){this.sql=new DatabaseSync(':memory:');}prepare(sql){const db=this;return{args:[],bind(...args){this.args=args;return this;},async run(){return db.sql.prepare(sql).run(...this.args);},async first(){return db.sql.prepare(sql).get(...this.args)||null;}};}async batch(rows){return Promise.all(rows.map(r=>r.run()));}}
const run=(contract='XAUT-USDT',extras={})=>collectDeltaOptionsEvidence({db:new DB(),contract,run_id:'UNIT',now:f.now,clock:()=>f.now,request_admit:()=>({allowed:true}),fetch_impl:async u=>new Response(JSON.stringify(String(u).includes('/products?')?f.products:f.tickers)),...extras});
test('real BTC/ETH/XAUT quotes yield exact USD option risk, percentage conversion once and zero directional weight',async()=>{
 for(const coin of ['BTC','ETH','XAUT']){const r=await run(coin+'-USDT');assert.equal(r.status,'CLOSED',coin);assert.equal(r.network_calls,2);const row=r.evidence[0],risk=row.option_risk_context;assert.equal(risk.sample_count,8);assert.ok(risk.mark_iv_median_pct>0&&risk.mark_iv_median_pct<200);assert.equal(risk.settlement_currency,'USD');assert.equal(consumeBlockResultContext({contract:coin+'-USDT',evidence:r.evidence,now:f.now}).facts.length,1);assert.equal(consumeEvidenceV2(r.evidence,{base_interest:70,decision_ts:f.now}).adjustment,0);assert.equal(risk.entry_authorized,false);const audit=auditCandidateBlocks({evidence:r.evidence,sources:{DELTA_OPTIONS:r},decision_ts:f.now,strict_fresh:true});assert.equal(audit.blocks.N14.checked,true);assert.equal(audit.blocks.N14.usable_facts,1);assert.equal(audit.checked_block_count,1);}
});
test('provider identity, microsecond clock, settlement, expiry, reversed book and percent/fraction confusion fail closed',async()=>{
 const r=await run(),samples=r.evidence[0].option_risk_context.samples;
 for(const change of [s=>s.base_currency='PAXG',s=>s.underlying_name='Gold CFD',s=>s.quote_currency='USDT',s=>s.source_timestamp_us=Math.floor(s.source_timestamp_us/1000),s=>s.source_ts=f.now-1200001,s=>s.ask_price=0,s=>s.mark_iv_fraction=20,s=>s.expiration_timestamp=f.now+60000]){const rows=structuredClone(samples);change(rows[0]);assert.equal(deriveDeltaOptionRisk({samples:rows,base_currency:'XAUT',observed_ts:f.now}),null);}
 const rows=structuredClone(samples);rows[0].product_id=rows[1].product_id;assert.equal(deriveDeltaOptionRisk({samples:rows,base_currency:'XAUT',observed_ts:f.now}),null);
 const row=structuredClone(r.evidence[0]);row.option_risk_context.mark_iv_median_pct=999;assert.equal(consumeBlockResultContext({contract:'XAUT-USDT',evidence:[row],now:f.now}).facts.length,0);
});
test('shared admitted reference bodies are reused across supported assets without a second transport',async()=>{
 const db=new DB();let calls=0;const fetch_impl=async u=>{calls++;return new Response(JSON.stringify(String(u).includes('/products?')?f.products:f.tickers));};assert.equal((await run('XAUT-USDT',{db,fetch_impl})).network_calls,2);const r=await run('BTC-USDT',{db,fetch_impl});assert.equal(r.status,'CLOSED');assert.equal(r.network_calls,0);assert.equal(calls,2);assert.equal(r.evidence[0].htx_contract,'BTC-USDT');assert.equal(r.evidence[0].source_ts<f.now,true);
});
test('whole-job denial, daily exhaustion and durable access/rate backoff make no unadmitted or repeated calls',async()=>{
 let calls=0;const fetch_impl=async()=>{calls++;return new Response('{}');};const no=await run('BTC-USDT',{request_admit:()=>({allowed:false,status:'BUDGET_DENIED'}),fetch_impl});assert.equal(no.network_calls,0);assert.equal(calls,0);
 const db=new DB();await run('BTC-USDT',{db,request_admit:()=>({allowed:false})});db.sql.exec(`INSERT INTO report2_evidence_source_daily VALUES('DELTA_OPTIONS','2026-10-04',96,NULL,${f.now})`);assert.equal((await run('BTC-USDT',{db,fetch_impl})).network_calls,0);assert.equal(calls,0);
 const blockedDB=new DB(),blocked=async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':'1800'}});};assert.equal((await run('BTC-USDT',{db:blockedDB,fetch_impl:blocked})).network_calls,1);assert.equal((await run('ETH-USDT',{db:blockedDB,fetch_impl:blocked})).network_calls,0);assert.equal(calls,1);assert.equal(DELTA_FREE_LIMITS.retries,0);
});
test('partial catalogue or non-covered source asset cannot imply completeness or nonexistent zero risk',async()=>{
 const partial={...f.products,meta:{...f.products.meta,after:'NEXT'}};const r=await run('XAUT-USDT',{fetch_impl:async()=>new Response(JSON.stringify(partial))});assert.equal(r.evidence.length,0);assert.equal(r.status,'SOURCE_NOT_CLOSED');const no=await run('一-USDT');assert.equal(no.evidence.length,0);assert.equal(no.network_calls,0);assert.equal(no.status,'NOT_IN_VERIFIED_DELTA_OPTION_CAPABILITY');
});
