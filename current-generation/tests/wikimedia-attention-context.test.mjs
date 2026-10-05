import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {normalizeWikimediaAttention,collectWikimediaAttention,exactWikimediaPage} from '../files/src/wikimedia-attention-context.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';
import {planCandidateEvidenceRoutes,auditCandidateBlocks} from '../files/src/candidate-evidence-v2-runtime.mjs';
const NOW=Date.parse('2026-10-05T05:00:00Z'),DAY=86400000,identity={chain:'cardano',asset_kind:'NATIVE',native_asset_id:'cardano:mainnet',contract_or_mint:null},rows=Array.from({length:14},(_,i)=>({project:'en.wikipedia',article:'Cardano_(blockchain_platform)',access:'all-access',agent:'user',granularity:'daily',timestamp:new Date(Date.parse('2026-09-20T00:00:00Z')+i*DAY).toISOString().slice(0,10).replaceAll('-','')+'00',views:i<7?10:20})),base={contract:'ADA-USDT',asset_identity:identity,payload:{items:rows},observed_ts:NOW};
function db(){const sqlite=new DatabaseSync(':memory:');return{prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;}};},async batch(rows){return Promise.all(rows.map(x=>x.run()));}};}
test('additional native pageview context reaches consumer without replacing primary or assigning scores',()=>{
 const r=normalizeWikimediaAttention(base);assert.equal(r.status,'CLOSED');assert.equal(r.summary.recent_7day_views,140);assert.equal(r.summary.previous_7day_views,70);assert.equal(r.summary.change_pct,100);const c=consumeBlockResultContext({contract:base.contract,evidence:r.evidence,now:NOW});assert.equal(c.facts.length,1);assert.match(c.facts[0].value,/число трейдеров/);assert.equal(consumeEvidenceV2(r.evidence,{base_interest:70,decision_ts:NOW}).adjustment,0);const a=auditCandidateBlocks({sources:{WIKIMEDIA_ATTENTION:r},evidence:r.evidence,decision_ts:NOW});assert.equal(a.blocks.N06.checked,false);assert.ok(a.blocks.N06.missing_required.includes('BLUESKY_PUBLIC'));assert.ok(planCandidateEvidenceRoutes({...base,run_id:'R',now:NOW}).routes.some(x=>x.name==='WIKIMEDIA'&&x.role==='ADDITIONAL_DAILY_PAGEVIEW_CONTEXT'));
});
test('pageview route rejects wrapped, foreign native or ambiguous page bindings',()=>{
 for(const x of [{...identity,native_asset_id:'cardano:testnet'},{...identity,contract_or_mint:'0x'+'1'.repeat(40)},{...identity,asset_kind:'WRAPPED'}])assert.equal(exactWikimediaPage({contract:'ADA-USDT',asset_identity:x}),null);assert.equal(exactWikimediaPage({contract:'BTC-USDT',asset_identity:identity}),null);
 for(const mutate of [x=>x[0].article='Cardano',x=>x[0].agent='all-agents',x=>x[0].views=-1,x=>x[0].timestamp=x[1].timestamp,x=>x.pop()]){const items=structuredClone(rows);mutate(items);assert.notEqual(normalizeWikimediaAttention({...base,payload:{items}}).status,'CLOSED');}
});
test('admitted one-request collector caches, retains exact timestamps and caps minute bursts',async()=>{
 let calls=0;const b={db:db(),contract:base.contract,asset_identity:identity,now:NOW,clock:()=>NOW,request_admit:()=>({allowed:true}),fetch_impl:async()=>{calls++;return new Response(JSON.stringify({items:rows}));}};
 const first=await collectWikimediaAttention({...b,run_id:'A'});assert.equal(first.status,'CLOSED');assert.equal(first.network_calls,1);assert.equal((await collectWikimediaAttention({...b,run_id:'C',now:NOW+1000})).network_calls,0);assert.equal((await collectWikimediaAttention({...b,run_id:'B',strict_fresh_manual:true})).status,'CLOSED');assert.equal((await collectWikimediaAttention({...b,run_id:'D',strict_fresh_manual:true})).status,'ROLLING_60S_CAP_REACHED');assert.equal(calls,2);
});
test('429 installs shared backoff and incomplete responses do not become zero views',async()=>{
 let calls=0;const b={db:db(),contract:base.contract,asset_identity:identity,now:NOW,clock:()=>NOW,request_admit:()=>({allowed:true}),fetch_impl:async()=>{calls++;return new Response('rate limited',{status:429,headers:{'retry-after':'7200'}});}};
 assert.equal((await collectWikimediaAttention({...b,run_id:'E'})).status,'PROVIDER_RATE_LIMITED');assert.equal((await collectWikimediaAttention({...b,run_id:'F',now:NOW+60000})).network_calls,0);assert.equal(calls,1);assert.equal(normalizeWikimediaAttention({...base,payload:{items:[]}}).evidence.length,0);
});
