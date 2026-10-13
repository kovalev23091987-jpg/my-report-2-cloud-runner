import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {coingeckoAccessPolicy,coingeckoDemoTransport,collectCoingeckoSectorEvidence} from '../files/src/coingecko-sector-evidence.mjs';
import {createProviderReferenceReader} from '../files/src/provider-reference-cache.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts} from '../files/src/evidence-source-store.mjs';
import {installProviderMinuteLedger,reserveProviderMinuteUnits} from '../files/src/provider-minute-ledger.mjs';
const KEY='CG-test-only-credential-1234';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/ready-sector-36745185948.json',import.meta.url))).coingecko;
const identity={chain:'ethereum',contract_or_mint:'0x514910771af9ca656af840dff83e8264ecf986ca'};
function db(){const sqlite=new DatabaseSync(':memory:');return{sqlite,prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return{results:sqlite.prepare(sql).all(...this.args)};}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};}
function config(database,now,extra={}){return{db:database,contract:'LINK-USDT',asset_identity:identity,asset_metadata:{coingecko_id:'chainlink',coingecko_category_id:'oracle',coingecko_category_name:'Oracle'},run_id:'demo-fixture',now,coingecko_demo_api_key:KEY,request_admit:()=>({allowed:true}),fetch_impl:async(url,opts)=>{assert.equal(opts.headers.get('x-cg-demo-api-key'),KEY);return new Response(JSON.stringify(url.includes('/categories/list')?fixture.categories:url.includes('/markets?')?fixture.quotes.map(r=>({...r,last_updated:new Date(now-60000).toISOString()})):fixture.metadata));},...extra};}
test('free Demo bound includes manual reserve and never increases keyless limits',()=>{
 assert.equal(coingeckoAccessPolicy(null).daily_cap,48);
 assert.equal(coingeckoAccessPolicy(KEY).daily_cap,224);
 assert.equal(coingeckoAccessPolicy(KEY,{strict_fresh_manual:true}).daily_cap,256);
 assert.equal(coingeckoAccessPolicy(KEY).monthly_module_bound,256*31);
 assert.ok(256*31<10000);assert.equal(coingeckoAccessPolicy('bad\nkey-value').allowed,false);
});
test('credential goes only in a Demo header; no Pro credential or query export',async()=>{
 let seen;await coingeckoDemoTransport(async(url,opts)=>{seen={url,opts};return new Response('{}');},KEY)('https://api.coingecko.com/api/v3/coins/chainlink',{headers:{accept:'application/json','x-cg-pro-api-key':'foreign'},redirect:'follow'});
 assert.equal(seen.opts.headers.get('x-cg-demo-api-key'),KEY);assert.equal(seen.opts.headers.has('x-cg-pro-api-key'),false);assert.equal(seen.opts.redirect,'error');assert.equal(seen.url.includes(KEY),false);
});
test('credential cannot reach foreign, Pro, userinfo or credential-query routes',async()=>{
 let calls=0;const f=coingeckoDemoTransport(async()=>{calls++;},KEY);
 for(const url of ['https://pro-api.coingecko.com/api/v3/coins/list','https://api.coingecko.com.evil.example/api/v3/coins/list','http://api.coingecko.com/api/v3/coins/list','https://user:password@api.coingecko.com/api/v3/coins/list','https://api.coingecko.com/api/v3/coins/list?x_cg_demo_api_key=other'])await assert.rejects(f(url),/ORIGIN_REQUIRED/);
 assert.equal(calls,0);
});
test('transport error redaction never persists credential returned by a client error',async()=>{
 await assert.rejects(coingeckoDemoTransport(async()=>{throw Error(KEY);},KEY)('https://api.coingecko.com/api/v3/coins/list'),e=>e.message==='COINGECKO_TRANSPORT_FAILED'&&!e.message.includes(KEY));
});
test('actual collector headers, source clocks, cache and receipt contain no credential',async()=>{
 const database=db(),now=Date.now(),a=await collectCoingeckoSectorEvidence(config(database,now));assert.equal(a.status,'CLOSED');assert.equal(a.auth_mode,'DEMO_HEADER');assert.equal(a.network_calls,3);assert.equal(a.evidence[0].source_ts,now-60000);
 assert.equal(JSON.stringify(a).includes(KEY),false);assert.equal(JSON.stringify(database.sqlite.prepare('SELECT * FROM report2_evidence_source_cache').all()).includes(KEY),false);
 const b=await collectCoingeckoSectorEvidence(config(database,now+1000,{run_id:'demo-next'}));assert.equal(b.network_calls,0);assert.equal(b.evidence[0].source_ts,a.evidence[0].source_ts);database.sqlite.close();
});
test('ordinary request cannot consume protected manual remainder; manual reuses same daily ledger',async()=>{
 const database=db(),now=Date.now();await installEvidenceSourceStore(database);await reserveEvidenceSourceAttempts(database,{source:'COINGECKO_SECTOR',reservation_id:'earlier',attempts:224,daily_cap:256,now});let admissions=0;
 const ordinary=await collectCoingeckoSectorEvidence(config(database,now,{request_admit:()=>{admissions++;return{allowed:true};}}));assert.equal(ordinary.network_calls,0);assert.equal(admissions,0);
 const manual=await collectCoingeckoSectorEvidence(config(database,now,{run_id:'manual',strict_fresh_manual:true}));assert.equal(manual.status,'CLOSED');assert.equal(manual.network_calls,3);assert.equal(database.sqlite.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='COINGECKO_SECTOR'").get().attempts,227);database.sqlite.close();
});
test('full Demo exhaustion fails before caller admission and never resets existing usage',async()=>{
 const database=db(),now=Date.now();await installEvidenceSourceStore(database);await reserveEvidenceSourceAttempts(database,{source:'COINGECKO_SECTOR',reservation_id:'earlier',attempts:256,daily_cap:256,now});let admissions=0;
 const r=await collectCoingeckoSectorEvidence(config(database,now,{strict_fresh_manual:true,request_admit:()=>{admissions++;return{allowed:true};}}));assert.equal(r.network_calls,0);assert.equal(admissions,0);assert.equal(database.sqlite.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='COINGECKO_SECTOR'").get().attempts,256);database.sqlite.close();
});
test('known exhausted minute frees whole HTTP admission for another source',async()=>{
 const database=db(),now=Date.now();await installEvidenceSourceStore(database);await installProviderMinuteLedger(database);await reserveProviderMinuteUnits(database,{provider:'COINGECKO',reservation_id:'earlier',units:9,cap:9,now});let admissions=0;
 const reader=createProviderReferenceReader({db:database,source:'COINGECKO_SECTOR',run_id:'blocked-minute',now,daily_cap:256,minute_provider:'COINGECKO',minute_cap:9,request_admit:()=>{admissions++;return{allowed:true};},fetch_impl:async()=>{throw Error('NOT_ALLOWED');}});
 assert.equal(await reader.get('DIRECTORY','https://api.coingecko.com/api/v3/coins/categories/list'),null);assert.equal(reader.summary().admission.status,'PROVIDER_RATE_LIMIT_LOCAL');assert.equal(admissions,0);database.sqlite.close();
});
test('auth failure does not retry keyless, another host or another asset while backoff applies',async()=>{
 const database=db(),now=Date.now();let calls=0;const opts={fetch_impl:async(url,headers)=>{calls++;assert.equal(headers.headers.get('x-cg-demo-api-key'),KEY);return new Response('{}',{status:401});}};
 const a=await collectCoingeckoSectorEvidence(config(database,now,opts));assert.equal(a.status,'SOURCE_ACCESS_BLOCKED');const b=await collectCoingeckoSectorEvidence(config(database,now+1000,{...opts,run_id:'other'}));assert.equal(b.network_calls,0);assert.equal(calls,1);database.sqlite.close();
});
test('production workflow supplies the optional secret to the authoritative runtime',()=>{
 const y=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8'),r=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');assert.match(y,/REPORT2_COINGECKO_DEMO_API_KEY: \$\{\{ secrets\.REPORT2_COINGECKO_DEMO_API_KEY \}\}/);assert.match(r,/coingecko_demo_api_key:envText\('REPORT2_COINGECKO_DEMO_API_KEY',\{required:false\}\)/);
});
