import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {collectSpecialistContext,normalizeVyx,normalizeNansen,consumeSpecialistContext} from '../files/src/specialist-candidate-context.mjs';
import {collectSupplementalCandidateContext} from '../files/src/supplemental-candidate-context.mjs';
const now=Date.parse('2026-09-30T14:12:00Z');
const vyx={symbol_name:'SOL',symbol_id:123,candles:[{timestamp:'2026-09-30T14:11:00Z',interval:'1m',close:120,ofi:3,microprice:120.01,imb_cum_l10:-12}]};
const nansen={data:[{smart_trader_longs_usd:80,smart_trader_shorts_usd:20,smart_trader_total_usd:100,whale_longs_usd:200,whale_shorts_usd:100,whale_total_usd:300}]};
class DB{
 constructor(){this.sql=new DatabaseSync(':memory:');}
 prepare(sql){const db=this.sql;return {
  async run(){return db.prepare(sql).run();},
  bind(...xs){return {
   async first(){return db.prepare(sql).get(...xs)||null;},
   async run(){return db.prepare(sql).run(...xs);},
   async all(){return {results:db.prepare(sql).all(...xs)};}
  };}
 };}
}
const ok=p=>({ok:true,status:200,json:async()=>p,headers:new Headers()});
const params=()=>({db:new DB(),fetch_impl:async url=>ok(url.includes('vyx')?vyx:nansen),base:'SOL',now,primary_price:120,remaining:2,vyx_api_key:'secret-v',nansen_api_key:'secret-n'});
test('publication consumer assigns fields to their blocks and rechecks cache freshness and price',()=>{
 const sources={VYX:normalizeVyx(vyx,{base:'SOL',now,primary_price:120}),NANSEN:normalizeNansen(nansen,{base:'SOL',now})};
 const input={sources,contract:'SOL-USDT',now,primary_price:120};
 const r=consumeSpecialistContext(input);
 assert.equal(r.blocks.order_flow.decision_block,'MARKET_STRENGTH_SPOT');assert.equal(r.blocks.cohort_positions.decision_block,'SMART_MONEY_ONCHAIN');assert.equal(r.blocks.cohort_positions.not_exchange_netflows,true);
 assert.equal(r.facts.length,2);assert.ok(r.facts.every(x=>x.directional_vote===false&&x.score_contribution===0));assert.match(r.blocks.cohort_positions.facts[0].label,/время состояния неизвестно/);
 assert.equal(consumeSpecialistContext({...input,now:now+200000}).blocks.order_flow.status,'NOT_CLOSED');
 assert.equal(consumeSpecialistContext({...input,primary_price:80}).blocks.order_flow.status,'NOT_CLOSED');
 assert.equal(consumeSpecialistContext({...input,contract:'OTHER-USDT'}).facts.length,0);
 assert.equal(consumeSpecialistContext({...input,now:now+21600001}).facts.length,0);
});
test('closed minute, exact symbol and price checks; null is not zero',()=>{
 assert.equal(normalizeVyx(vyx,{base:'SOL',now,primary_price:120}).status,'CLOSED');
 for(const ctx of [{base:'OTHER',now,primary_price:120},{base:'SOL',now:now-30000,primary_price:120},{base:'SOL',now:now+200000,primary_price:120},{base:'SOL',now,primary_price:80}])assert.equal(normalizeVyx(vyx,ctx).status,'NOT_CLOSED');
 assert.equal(normalizeVyx({...vyx,candles:[{...vyx.candles[0],ofi:null}]},{base:'SOL',now,primary_price:120}).status,'NOT_CLOSED');
});
test('Nansen never invents source time, sums cohorts or grants decision authority',()=>{
 const r=normalizeNansen(nansen,{base:'SOL',now});assert.equal(r.status,'CONTEXT_UNTIMED');assert.equal(r.source_ts,null);assert.equal(r.decision_usable,false);assert.equal(r.cohorts_summed,false);assert.equal(Object.keys(r.cohorts).length,2);
 assert.equal(normalizeNansen({data:[{smart_trader_longs_usd:null,smart_trader_shorts_usd:0,smart_trader_total_usd:0}]},{base:'SOL',now}).status,'NOT_CLOSED');
});
test('maximum available slots, missing keys and fresh caches cause no extra HTTP',async()=>{
 const p=params();assert.equal((await collectSpecialistContext({...p,remaining:1})).network_calls,1);
 for(const extra of [{remaining:0},{vyx_api_key:'',nansen_api_key:''},{cached:{VYX:{},NANSEN:{}}}])assert.equal((await collectSpecialistContext({...params(),...extra})).network_calls,0);
});
test('Nansen daily attempt cap is durable across invocations; VYX continues',async()=>{
 const p=params();for(let i=0;i<5;i++)assert.equal((await collectSpecialistContext(p)).network_calls,2);
 const r=await collectSpecialistContext(p);assert.equal(r.network_calls,1);assert.ok(r.receipts.some(x=>x.source==='NANSEN'&&x.status==='LOCAL_BUDGET_OR_BACKOFF'));
});
test('quota cooldown covers all symbols, retains classification and does not leak secrets',async()=>{
 const p=params();p.fetch_impl=async url=>url.includes('vyx')?ok(vyx):({ok:false,status:429,headers:new Headers({'Retry-After':'120'}),json:async()=>({message:'secret-n'})});
 const r=await collectSpecialistContext(p);assert.equal(r.payloads[1].payload.status,'PROVIDER_QUOTA');assert.doesNotMatch(JSON.stringify(r),/secret-/);
 const s=await collectSpecialistContext(p);assert.equal(s.network_calls,1);
});
test('actual supplemental collector persists both additions inside existing five HTTP envelope',async()=>{
 const p=params(),calls=[];const fetch_impl=async(url,opts)=>{calls.push(url);if(url.includes('vyx'))return ok(vyx);if(url.includes('nansen'))return ok(nansen);return ok({data:[{symbol:'SOLUSDT',lastPr:'120'}]});};
 const r=await collectSupplementalCandidateContext({db:p.db,fetch_impl,contract:'SOL-USDT',run_id:'specialist',derivatives_venues:2,registry:{SOL:{chain:'solana',contract_or_mint:'So11111111111111111111111111111111111111112'}},primary_price:120,now,vyx_api_key:p.vyx_api_key,nansen_api_key:p.nansen_api_key});
 assert.ok(calls.length<=5);assert.equal(r.sources.VYX.status,'CLOSED');assert.equal(r.sources.NANSEN.status,'CONTEXT_UNTIMED');assert.equal(r.sources.NANSEN.source_ts,null);
});
