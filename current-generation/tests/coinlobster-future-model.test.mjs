import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {parseCoinLobsterMcpResponse,normalizeCoinLobsterFuture,collectCoinLobsterFutureModel} from '../files/src/coinlobster-future-model.mjs';
const T=1_800_000_000_000;
function database(){const sql=new DatabaseSync(':memory:');return{sql,prepare(query){return{args:[],bind(...args){this.args=args;return this;},async run(){return sql.prepare(query).run(...this.args);},async first(){return sql.prepare(query).get(...this.args)||null;},async all(){return{results:sql.prepare(query).all(...this.args)};}};}};}
const frame=p=>'event: message\ndata: '+JSON.stringify({jsonrpc:'2.0',id:1,result:{content:[{type:'text',text:JSON.stringify(p)}]}})+'\n\n';
test('a public forward headline is retained as a partial hint and cannot become priced liquidation levels',()=>{
 const p={available:true,coin:'BTW',detail:'headline',as_of:new Date(T).toISOString(),headline:{nearest_liquidation_zone:'below'},access_note:'price rows withheld'};
 const parsed=parseCoinLobsterMcpResponse(frame(p)),out=normalizeCoinLobsterFuture(parsed,{contract:'BTW-USDT',now:T});assert.equal(out.status,'PARTIAL_FUTURE_HEADLINE_ONLY');assert.equal(out.nearest_side,'below');assert.deepEqual(out.levels,[]);assert.equal(out.access_note,'price rows withheld');
});
test('explicit future rows must match identity, source clock and liquidated side geometry',()=>{
 const p={available:true,coin:'BTW',as_of:new Date(T).toISOString(),projection:{reference_price:100,levels:[{price:110,side:'short',notional_usd:20000},{price:90,side:'long',notional_usd:25000}]}};
 assert.equal(normalizeCoinLobsterFuture(p,{contract:'BTW-USDT',now:T}).status,'CLOSED');assert.equal(normalizeCoinLobsterFuture(p,{contract:'OTHER-USDT',now:T}).status,'IDENTITY_NOT_CLOSED');assert.equal(normalizeCoinLobsterFuture(p,{contract:'BTW-USDT',now:T+31*60000}).status,'SOURCE_CLOCK_NOT_CURRENT');p.projection.levels[0].side='long';assert.equal(normalizeCoinLobsterFuture(p,{contract:'BTW-USDT',now:T}).status,'SCHEMA_NOT_CLOSED');
});
test('a public future call uses the official read-only MCP tool, caches partial context and does not double-spend a run',async()=>{
 const db=database();let calls=0;const fetch_impl=async(url,init)=>{calls++;assert.equal(url,'https://coinlobster.com/mcp');assert.equal(JSON.parse(init.body).method,'tools/call');assert.equal(JSON.parse(init.body).params.name,'liq_zones');return new Response(frame({available:true,coin:'BTW',detail:'headline',as_of:new Date(T).toISOString(),headline:{nearest_liquidation_zone:'below'}}));};
 const params={db,fetch_impl,contract:'BTW-USDT',run_id:'FUTURE',now:T};assert.equal((await collectCoinLobsterFutureModel(params)).network_calls,1);assert.equal((await collectCoinLobsterFutureModel(params)).network_calls,0);assert.equal(calls,1);
 await db.prepare('DELETE FROM report2_coinlobster_future_cache').run();assert.equal((await collectCoinLobsterFutureModel(params)).network_calls,0);assert.equal(calls,1);db.sql.close();
});
