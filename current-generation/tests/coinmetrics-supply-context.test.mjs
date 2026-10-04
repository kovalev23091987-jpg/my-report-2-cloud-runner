import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const root=process.env.REPORT2_COINMETRICS_MODULE_ROOT,load=n=>import(root?pathToFileURL(root+'/'+n):new URL('../files/src/'+n,import.meta.url));
const {collectCoinmetricsSupplyContext,deriveCoinmetricsSupplyContext,COINMETRICS_FREE_LIMITS}=await load('coinmetrics-supply-context.mjs');
const {consumeBlockResultContext}=await load('block-result-context.mjs');
const {consumeEvidenceV2}=await load('evidence-v2.mjs');
const {auditCandidateBlocks,planCandidateEvidenceRoutes}=await load('candidate-evidence-v2-runtime.mjs');
const f=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('fixtures/coinmetrics-daily-native-supply-20261004.json.gz',import.meta.url))));
const identity=coin=>({chain:coin==='BTC'?'bitcoin':'ethereum',asset_kind:'NATIVE',native_asset_id:(coin==='BTC'?'bitcoin':'ethereum')+':mainnet',contract_or_mint:null});
class DB{constructor(){this.sql=new DatabaseSync(':memory:');}prepare(sql){const db=this;return{args:[],bind(...args){this.args=args;return this;},async run(){return db.sql.prepare(sql).run(...this.args);},async first(){return db.sql.prepare(sql).get(...this.args)||null;}};}async batch(rows){return Promise.all(rows.map(r=>r.run()));}}
const run=(coin='BTC',extras={})=>collectCoinmetricsSupplyContext({db:new DB(),contract:coin+'-USDT',asset_identity:identity(coin),run_id:'UNIT',now:f.now,clock:()=>f.now,request_admit:()=>({allowed:true}),fetch_impl:async u=>new Response(JSON.stringify(String(u).includes('/catalog-')?f.catalog:f.series)),...extras});
test('actual daily history reaches N02 context with exact decimal arithmetic and no score or finalized-chain substitution',async()=>{
 for(const coin of ['BTC','ETH']){const r=await run(coin);assert.equal(r.status,'CLOSED');assert.equal(r.network_calls,2);const ctx=r.summary;assert.equal(ctx.sample_count,8);assert.equal(ctx.chain_finalized_block_claim,false);assert.equal(consumeBlockResultContext({contract:coin+'-USDT',evidence:r.evidence,now:f.now}).facts.length,1);assert.equal(consumeEvidenceV2(r.evidence,{base_interest:70,decision_ts:f.now}).adjustment,0);const audit=auditCandidateBlocks({evidence:r.evidence,sources:{COINMETRICS_SUPPLY:r},decision_ts:f.now});assert.equal(audit.blocks.N02.checked,false);assert.equal(audit.blocks.N03.checked,false);assert.equal(audit.blocks.N02.source_checks.COINMETRICS_SUPPLY.checked,true);assert.ok(planCandidateEvidenceRoutes({contract:coin+'-USDT',asset_identity:identity(coin)}).routes.some(r=>r.name==='COINMETRICS'));}
});
test('wrong native identity, wrapped coin, paid or experimental capability, stale/incomplete history and duplicate timestamps fail closed',()=>{
 const p={contract:'BTC-USDT',identity:identity('BTC'),catalog:f.catalog,series:f.series,observed_ts:f.now};assert.ok(deriveCoinmetricsSupplyContext(p));
 for(const patch of [{identity:{...identity('BTC'),native_asset_id:'bitcoin:testnet'}},{identity:{...identity('BTC'),contract_or_mint:'wrapped'}},{contract:'BR-USDT'},{observed_ts:f.now+4*86400000},{catalog:{...f.catalog,next_page_url:'NEXT'}},{series:{...f.series,next_page_url:'NEXT'}}])assert.equal(deriveCoinmetricsSupplyContext({...p,...patch}),null);
 const catalog=structuredClone(f.catalog);catalog.data.find(r=>r.asset==='btc').metrics[0].frequencies[0].community=false;assert.equal(deriveCoinmetricsSupplyContext({...p,catalog}),null);
 const series=structuredClone(f.series);series.data[1].time=series.data[0].time;assert.equal(deriveCoinmetricsSupplyContext({...p,series}),null);
 assert.equal(deriveCoinmetricsSupplyContext({...p,series:{data:f.series.data.slice(1)}}),null);
});
test('consumer rejects forged totals and data retain exact decimal supply precision',async()=>{
 const r=await run('ETH'),row=structuredClone(r.evidence[0]);assert.equal(r.summary.latest_native_units,'122098979.264709937402091751');row.supply_history_context.latest_native_units='999';assert.equal(consumeBlockResultContext({contract:'ETH-USDT',evidence:[row],now:f.now}).facts.length,0);
});
test('two shared provider requests cover BTC and ETH; non-supported native/Unicode market causes no source calls',async()=>{
 const db=new DB();let calls=0;const fetch_impl=async u=>{calls++;return new Response(JSON.stringify(String(u).includes('/catalog-')?f.catalog:f.series));};assert.equal((await run('BTC',{db,fetch_impl})).network_calls,2);assert.equal((await run('ETH',{db,fetch_impl})).network_calls,0);assert.equal(calls,2);assert.equal((await run('一',{db,fetch_impl})).network_calls,0);assert.equal(calls,2);
});
test('daily/whole-job denial and durable 429 backoff preserve reserve and prevent repeated transport',async()=>{
 let calls=0;const fetch_impl=async()=>{calls++;return new Response('{}');};assert.equal((await run('BTC',{fetch_impl,request_admit:()=>({allowed:false})})).network_calls,0);
 const db=new DB();await run('BTC',{db,request_admit:()=>({allowed:false})});db.sql.exec(`INSERT INTO report2_evidence_source_daily VALUES('COINMETRICS_SUPPLY','2026-10-04',8,NULL,${f.now})`);assert.equal((await run('BTC',{db,fetch_impl})).network_calls,0);assert.equal(calls,0);
 const blocked=new DB(),rate=async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':'7200'}});};assert.equal((await run('BTC',{db:blocked,fetch_impl:rate})).network_calls,1);assert.equal((await run('ETH',{db:blocked,fetch_impl:rate})).network_calls,0);assert.equal(calls,1);assert.equal(COINMETRICS_FREE_LIMITS.retries,0);
});
