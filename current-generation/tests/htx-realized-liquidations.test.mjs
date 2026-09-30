import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {normalizeHtxRealizedLiquidations} from '../files/src/htx-realized-liquidations.mjs';
import {collectCrossExchangeRiskContext} from '../files/src/cross-exchange-risk-context.mjs';
import {formatLiquidationHistoryFacts} from '../files/src/gate-liquidation-history.mjs';
const T=1_800_000_000_000,args={contract:'BTW-USDT',window_start_ts:T-7200000,window_end_ts:T,now:T};
const event={query_id:118685710546,contract_code:'BTW-USDT',pair:'BTW-USDT',business_type:'swap',trade_partition:'USDT',direction:'buy',offset:'close',price:1.377686,amount:950,trade_turnover:1308.8017,created_at:T-300000};
const payload=rows=>({code:200,msg:'ok',ts:T,data:rows}),reply=body=>new Response(JSON.stringify(body),{status:200});
test('HTX v3 proves realized short/long close events with quote units; duplicated IDs are not summed',()=>{
 const out=normalizeHtxRealizedLiquidations(payload([event,{...event},{...event,query_id:118685710547,direction:'sell'}]),args);
 assert.equal(out.status,'CLOSED');assert.equal(out.observed_event_count,2);assert.equal(out.short_liquidated_observed_usd,1308.8017);assert.equal(out.long_liquidated_observed_usd,1308.8017);assert.equal(out.events[0].price,1.377686);assert.equal(out.complete_window,false);assert.equal(out.projected_liquidation_prices,false);assert.equal(out.independent_vote_added,false);
 assert.match(formatLiquidationHistoryFacts({sources:{HTX_REALIZED_LIQUIDATIONS:out}})[1],/события уже произошли/);
 const empty=normalizeHtxRealizedLiquidations(payload([]),args);assert.equal(empty.status,'CLOSED');assert.equal(empty.empty_response_is_not_full_window_zero,true);
});
test('HTX rejects cross-symbol, wrong side, wrong units, open/future times and malformed or conflicting events',()=>{
 for(const change of [{contract_code:'OTHER-USDT'},{pair:'OTHER-USDT'},{direction:'invalid'},{offset:'open'},{trade_partition:'BTC'},{price:0},{amount:-1},{trade_turnover:3000},{created_at:T},{created_at:T-7200001},{query_id:Number.MAX_SAFE_INTEGER+1}])assert.equal(normalizeHtxRealizedLiquidations(payload([{...event,...change}]),args).status,'NOT_CLOSED');
 assert.equal(normalizeHtxRealizedLiquidations({...payload([event]),ts:T-60001},args).status,'NOT_CLOSED');assert.equal(normalizeHtxRealizedLiquidations({...payload([]),code:403},args).status,'NOT_CLOSED');
 assert.equal(normalizeHtxRealizedLiquidations(payload([event,{...event,price:1.38,trade_turnover:1311}]),args).status,'NOT_CLOSED');
});
test('production history obtains native HTX and exact Gate without a key, within the same three requests',async()=>{
 const sql=new DatabaseSync(':memory:'),db={prepare(query){return{args:[],bind(...args){this.args=args;return this;},async run(){return sql.prepare(query).run(...this.args);},async first(){return sql.prepare(query).get(...this.args)||null;},async all(){return{results:sql.prepare(query).all(...this.args)};}};}};
 const urls=[],fetch_impl=async url=>{urls.push(String(url));if(String(url).includes('hbdm')){assert.match(url,/v3\/swap_liquidation_orders/);return reply(payload([event]));}return reply(String(url).includes('/contracts/')?{name:'BTW_USDT',type:'direct',quanto_multiplier:'10',in_delisting:false}:Array.from({length:26},(_,i)=>({time:(T-i*300000)/1000,long_liq_usd:0,short_liq_usd:0,open_interest_usd:9000000})));};
 const out=await collectCrossExchangeRiskContext({db,fetch_impl,contract:'BTW-USDT',run_id:'NATIVE',lane_override:'HISTORY',include_htx_realized:true,allowed_lanes:['HISTORY'],now:T});
 assert.equal(urls.length,3);assert.equal(out.network_calls,3);assert.equal(out.sources.HTX_REALIZED_LIQUIDATIONS.observed_event_count,1);assert.equal(out.sources.GATE_LIQUIDATION_HISTORY.history.observed_buckets,24);assert.equal(out.status,'CLOSED');sql.close();
});
