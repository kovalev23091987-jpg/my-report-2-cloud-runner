import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {collectOfficialTokenSchedule,normalizeOfficialTokenSchedule,exactTokenScheduleRoute} from '../files/src/official-token-schedule.mjs';
import {collectOfficialEventsEvidence,normalizeOfficialFeed} from '../files/src/official-events-evidence.mjs';
import {compileOfficialSourceRegistry} from '../files/src/official-source-registry.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';
import {planCandidateEvidenceRoutes} from '../files/src/candidate-evidence-v2-runtime.mjs';
const NOW=Date.parse('2026-10-05T04:30:00Z'),identity={chain:'cardano',asset_kind:'NATIVE',native_asset_id:'cardano:mainnet',contract_or_mint:null};
const body='Distribution of ada token vouchers October 2015 January 2017 648,176,761 2,074,165,644 2,463,071,701 25,927,070,538 31,112,484,646 staking rewards';
const rss='<rss><channel><title>Cardano Blog</title><link>https://cardano.org/news/</link><item><title>Cardano update</title><link>https://cardano.org/news/update/</link><pubDate>Wed, 30 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>';
const meta={official_domains:['cardano.org'],official_feeds:['https://cardano.org/news/rss.xml'],official_feed_specs:[{url:'https://cardano.org/news/rss.xml',format:'RSS',parser_id:'FIXED_RSS_V1',refresh_period:'6h',timezone:'UTC'}]};
function db(){const sqlite=new DatabaseSync(':memory:');return{prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;}};},async batch(rows){return Promise.all(rows.map(x=>x.run()));}};}
test('exact native ADA official routes are planned without wrapped substitution',()=>{
 const compiled=compileOfficialSourceRegistry((()=>{const r=JSON.parse(fs.readFileSync(new URL('../files/main-official-event-sources.json',import.meta.url)));r.entries=r.entries.filter(e=>Date.parse(e.verified_at)<=NOW);return r;})(),{now:NOW});
 assert.equal(compiled.registry.ADA.native_asset_id,'cardano:mainnet');assert.deepEqual(compiled.registry.ADA.official_feeds,meta.official_feeds);
 const planned=planCandidateEvidenceRoutes({contract:'ADA-USDT',asset_identity:identity,asset_metadata:compiled.registry.ADA,run_id:'C',now:NOW});assert.ok(planned.routes.some(x=>x.name==='TOKEN_SCHEDULE'));assert.ok(planned.routes.some(x=>x.name==='OFFICIAL'));
 for(const wrong of [{...identity,native_asset_id:'cardano:testnet'},{...identity,contract_or_mint:'0x'+'1'.repeat(40)},{...identity,asset_kind:'WRAPPED'}])assert.equal(exactTokenScheduleRoute({contract:'ADA-USDT',asset_identity:wrong}),null);
});
test('ADA historical distribution is useful bounded context without claiming future unlocks',()=>{
 const r=normalizeOfficialTokenSchedule({contract:'ADA-USDT',asset_identity:identity,body,source_url:'https://cardano.org/genesis/',observed_ts:NOW});assert.equal(r.status,'CLOSED');assert.equal(r.evidence[0].metric_family,'OFFICIAL_INITIAL_DISTRIBUTION_TERMS');
 const c=consumeBlockResultContext({evidence:r.evidence,contract:'ADA-USDT',now:NOW});assert.equal(c.facts.length,1);assert.match(c.facts[0].value,/будущие разблокировки/);assert.equal(consumeEvidenceV2(r.evidence,{base_interest:70,decision_ts:NOW}).adjustment,0);
 assert.equal(normalizeOfficialTokenSchedule({contract:'ADA-USDT',asset_identity:identity,body:body.replace('31,112,484,646','31,112,484,645'),source_url:'https://cardano.org/genesis/',observed_ts:NOW}).evidence.length,0);
 assert.equal(consumeBlockResultContext({evidence:[{...r.evidence[0],future_unlock_schedule_verified:true}],contract:'ADA-USDT',now:NOW}).facts.length,0);
});
test('native official event retains native identity and rejects a mismatched native binding',()=>{
 const p={contract:'ADA-USDT',asset_identity:identity,asset_metadata:meta,feed_url:meta.official_feeds[0],body:rss,content_type:'application/rss+xml',observed_ts:NOW};
 const r=normalizeOfficialFeed(p);assert.equal(r.status,'CLOSED');assert.equal(r.evidence[0].asset_id,'cardano:native:mainnet');assert.equal(r.evidence[0].directional_strength,null);assert.equal(consumeBlockResultContext({evidence:r.evidence,contract:'ADA-USDT',now:NOW}).facts.length,1);
 assert.equal(normalizeOfficialFeed({...p,contract:'NEAR-USDT'}).status,'EXACT_NATIVE_BINDING_REQUIRED');
});
test('ADA official document has a 24h cache and hard two-request daily cap including manual',async()=>{
 let calls=0;const base={db:db(),contract:'ADA-USDT',asset_identity:identity,now:NOW,clock:()=>NOW,request_admit:()=>({allowed:true}),fetch_impl:async()=>{calls++;return new Response(body);}};
 assert.equal((await collectOfficialTokenSchedule({...base,run_id:'D1'})).status,'CLOSED');assert.equal((await collectOfficialTokenSchedule({...base,run_id:'CACHE',now:NOW+6*3600000})).network_calls,0);
 assert.equal((await collectOfficialTokenSchedule({...base,run_id:'D2',strict_fresh_manual:true})).status,'CLOSED');assert.equal((await collectOfficialTokenSchedule({...base,run_id:'D3',strict_fresh_manual:true})).status,'OFFICIAL_DOCUMENT_DAILY_CAP');assert.equal(calls,2);
});
test('ADA RSS has a 6h cache, preserved evidence expiry and four-request daily cap',async()=>{
 let calls=0;const base={db:db(),contract:'ADA-USDT',asset_identity:identity,asset_metadata:meta,now:NOW,request_admit:()=>({allowed:true}),fetch_impl:async()=>{calls++;return new Response(rss,{headers:{'content-type':'application/rss+xml'}});}};
 const first=await collectOfficialEventsEvidence({...base,run_id:'F1'});assert.equal(first.status,'CLOSED');assert.equal(first.evidence[0].expires_at,NOW+6*3600000);
 assert.equal((await collectOfficialEventsEvidence({...base,run_id:'CACHE',now:NOW+2*3600000})).network_calls,0);
 for(let i=2;i<=4;i++)assert.equal((await collectOfficialEventsEvidence({...base,run_id:'F'+i,strict_fresh_manual:true})).status,'CLOSED');assert.equal((await collectOfficialEventsEvidence({...base,run_id:'F5',strict_fresh_manual:true})).status,'OFFICIAL_FEED_DAILY_CAP');assert.equal(calls,4);
 assert.equal((await collectOfficialEventsEvidence({...base,run_id:'WRONG',asset_identity:{...identity,native_asset_id:'cardano:testnet'}})).status,'EXACT_NATIVE_BINDING_REQUIRED');assert.equal(calls,4);
});
