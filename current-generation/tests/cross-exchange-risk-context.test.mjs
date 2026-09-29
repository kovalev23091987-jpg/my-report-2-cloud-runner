import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeCrossExchangeCatalogs,normalizeCrossExchangeDepth,normalizeOkxLiquidationEvents,normalizeCoinalyzeLiquidationHistory,compactCoinalyzeMarkets,loadCoinalyzeMarkets} from '../files/src/cross-exchange-risk-context.mjs';
import {DatabaseSync} from 'node:sqlite';
import {installProviderMinuteLedger} from '../files/src/provider-minute-ledger.mjs';

test('only active exact USDT perpetual markets enter the cross-exchange catalog',()=>{
 const entries=normalizeCrossExchangeCatalogs({
  binance:{symbols:[{status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',baseAsset:'FIL',symbol:'FILUSDT'},{status:'BREAK',contractType:'PERPETUAL',quoteAsset:'USDT',baseAsset:'BAD',symbol:'BADUSDT'}]},
  bybit:{result:{list:[{status:'Trading',quoteCoin:'USDT',contractType:'LinearPerpetual',baseCoin:'FIL',symbol:'FILUSDT'}]}},
  okx:{data:[{state:'live',instType:'SWAP',settleCcy:'USDT',ctValCcy:'FIL',ctVal:'0.1',ctMult:'1',instId:'FIL-USDT-SWAP'}]},
 });
 assert.deepEqual(entries.FIL,{base:'FIL',binance:'FILUSDT',bybit:'FILUSDT',okx:'FIL-USDT-SWAP',okx_contract_value:0.1,okx_contract_multiplier:1,okx_contract_value_currency:'FIL'});assert.equal(entries.BAD,undefined);
});

test('depth metrics close only when the independent market price matches HTX',()=>{
 const good=normalizeCrossExchangeDepth({venue:'BINANCE',reference_price:10,observed_ts:1001,expected_symbol:'FILUSDT',payload:{symbol:'FILUSDT',T:1000,bids:[['9.95','3000'],['9.8','2000']],asks:[['10.05','1000'],['10.2','1000']]}});
 assert.equal(good.status,'CLOSED');assert.ok(good.bid.notional_2pct>good.ask.notional_2pct);assert.ok(good.depth_imbalance_2pct>0);
 const wrong=normalizeCrossExchangeDepth({venue:'BINANCE',reference_price:10,observed_ts:1001,expected_symbol:'FILUSDT',payload:{symbol:'FILUSDT',T:1000,bids:[['1','10']],asks:[['1.1','10']]}});
 assert.equal(wrong.status,'NOT_CLOSED');
});

test('OKX depth converts contracts with catalog units and fails closed without metadata',()=>{
 const payload={data:[{instId:'FIL-USDT-SWAP',ts:'1000',bids:[['9.95','100']],asks:[['10.05','100']]}]};
 const missing=normalizeCrossExchangeDepth({venue:'OKX',reference_price:10,observed_ts:1001,expected_symbol:'FIL-USDT-SWAP',payload});
 assert.equal(missing.status,'NOT_CLOSED');assert.equal(missing.reason,'OKX_UNIT_METADATA_REQUIRED');
 const good=normalizeCrossExchangeDepth({venue:'OKX',reference_price:10,observed_ts:1001,expected_symbol:'FIL-USDT-SWAP',payload,instrument:{base:'FIL',contract_value:0.1,contract_multiplier:1,contract_value_currency:'FIL'}});
 assert.equal(good.status,'CLOSED');assert.equal(good.bid.notional_2pct,99.5);assert.equal(good.ask.notional_2pct,100.5);
});

test('OKX liquidation contracts become base quantity before USD notional is calculated',()=>{
 const rows=normalizeOkxLiquidationEvents({data:[{instId:'FIL-USDT-SWAP',details:[{posSide:'short',side:'buy',bkPx:'5',sz:'13',ts:'1000'}]}]},'FIL-USDT-SWAP',{okx_contract_value:0.1,okx_contract_multiplier:1,okx_contract_value_currency:'FIL'});
 assert.equal(rows.length,1);assert.equal(rows[0].liquidated_side,'SHORT');assert.equal(rows[0].quantity,1.3);assert.equal(rows[0].notional_usd,6.5);
});

test('Coinalyze history produces a recent-versus-baseline liquidation intensity',()=>{
 const now=1_800_000_000_000,end=Math.floor(now/300000)*300000,point=(bucket,l,s)=>({t:bucket/1000,l,s}),history=[];
 for(let i=24;i>=1;i--){const recent=i<=3;history.push(point(end-i*300000,recent?5000:1000,recent?1000:1000));}
 const out=normalizeCoinalyzeLiquidationHistory([{symbol:'FIL.A',history}],now,{requested_symbols:['FIL.A']});
 assert.equal(out.status,'CLOSED');assert.equal(out.recent_total,18000);assert.ok(out.intensity_ratio>1);
});
test('K20-K23 Coinalyze rejects empty, future, open and conflicting duplicate intervals',()=>{
 const now=1_800_000_000_000,end=Math.floor(now/300000)*300000,symbol='FIL.A';
 assert.equal(normalizeCoinalyzeLiquidationHistory([],now,{requested_symbols:[symbol]}).status,'NO_DATA');
 const complete=Array.from({length:24},(_,i)=>({t:(end-(24-i)*300000)/1000,l:100,s:50}));
 const future={t:(end+3600000)/1000,l:999999,s:999999},open={t:end/1000,l:999999,s:999999};
 const ignored=normalizeCoinalyzeLiquidationHistory([{symbol,history:[...complete,future,open]}],now,{requested_symbols:[symbol]});assert.equal(ignored.status,'CLOSED');assert.equal(ignored.datapoints,24);
 const identical=normalizeCoinalyzeLiquidationHistory([{symbol,history:[...complete,{...complete[0]}]}],now,{requested_symbols:[symbol]});assert.equal(identical.status,'CLOSED');assert.equal(identical.datapoints,24);
 const conflicting=normalizeCoinalyzeLiquidationHistory([{symbol,history:[...complete,{...complete[0],l:101}]}],now,{requested_symbols:[symbol]});assert.equal(conflicting.status,'PARTIAL');assert.equal(conflicting.intensity_ratio,null);assert.equal(conflicting.datapoints,23);
 const incomplete=normalizeCoinalyzeLiquidationHistory([{symbol,history:complete.slice(1)}],now,{requested_symbols:[symbol]});assert.equal(incomplete.status,'PARTIAL');assert.equal(incomplete.intensity_ratio,null);
});
test('K24 stale, missing-time, symbol-mismatched and crossed books never close',()=>{
 const base={venue:'BINANCE',reference_price:10,observed_ts:100000,expected_symbol:'FILUSDT'};
 const payload={symbol:'FILUSDT',T:99999,bids:[['9.9','1']],asks:[['10.1','1']]};
 assert.equal(normalizeCrossExchangeDepth({...base,payload:{...payload,T:60000}}).status,'NOT_CLOSED');
 assert.equal(normalizeCrossExchangeDepth({...base,payload:{...payload,T:null}}).status,'NOT_CLOSED');
 assert.equal(normalizeCrossExchangeDepth({...base,payload:{...payload,symbol:'QNTUSDT'}}).status,'NOT_CLOSED');
 assert.equal(normalizeCrossExchangeDepth({...base,payload:{...payload,bids:[['10.2','1']]}}).status,'NOT_CLOSED');
});

test('Coinalyze catalog persistence keeps only compact exact-base perpetual markets',()=>{
 const rows=compactCoinalyzeMarkets([
  {symbol:'SOLUSDT_PERP.A',base_asset:'SOL',quote_asset:'USDT',exchange:'Binance',is_perpetual:true,large_unused_field:'x'.repeat(10000)},
  {symbol:'SOLUSD_QUARTER.A',base_asset:'SOL',quote_asset:'USD',exchange:'Other',is_perpetual:false},
  {symbol:'ETHUSDT_PERP.A',base_asset:'ETH',quote_asset:'USDT',exchange:'Binance',is_perpetual:true},
 ],'SOL');
 assert.deepEqual(rows,[{symbol:'SOLUSDT_PERP.A',base_asset:'SOL',quote_asset:'USDT',exchange:'BINANCE',is_perpetual:true}]);
 assert.ok(JSON.stringify(rows).length<512);
});

test('workflow wires the optional free Coinalyze key without embedding a value',()=>{
 const workflow=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8');
 assert.match(workflow,/COINALYZE_API_KEY: \$\{\{ secrets\.COINALYZE_API_KEY \}\}/);
 assert.match(workflow,/cross_exchange_validation_lane:/);
 assert.match(workflow,/REPORT2_CROSS_EXCHANGE_VALIDATION_LANE: \$\{\{ inputs\.cross_exchange_validation_lane \|\| '' \}\}/);
 const source=fs.readFileSync(new URL('../files/src/cross-exchange-risk-context.mjs',import.meta.url),'utf8');
 assert.match(source,/lanes\.includes\(requestedLane\)\?requestedLane:/);
 assert.match(source,/lane_forced:lanes\.includes\(requestedLane\)/);
});

test('one Coinalyze catalog refresh serves two exact assets and unsupported assets without new API units',async()=>{
 const sqlite=new DatabaseSync(':memory:'),db={prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;}};}};
 await installProviderMinuteLedger(db);let calls=0;
 const payload=['SOL','TAO'].map(base=>({symbol:`${base}.A`,base_asset:base,quote_asset:'USDT',exchange:'BINANCE',is_perpetual:true,ignored:'large'}));
 const fetch_impl=async()=>{calls++;return new Response(JSON.stringify(payload),{status:200});};
 const common={db,fetch_impl,api_key:'TEST_NOT_SECRET',now:1_800_000_000_000,run_id:'r'};
 const a=await loadCoinalyzeMarkets({...common,base:'SOL'}),b=await loadCoinalyzeMarkets({...common,base:'TAO'}),c=await loadCoinalyzeMarkets({...common,base:'MISSING'});
 assert.equal(calls,1);assert.equal(a.network_calls,1);assert.equal(b.network_calls,0);assert.equal(c.network_calls,0);assert.equal(b.rows[0].symbol,'TAO.A');assert.deepEqual(c.rows,[]);
 assert.equal(sqlite.prepare('SELECT SUM(units) AS units FROM report2_provider_minute_ledger_v1').get().units,1);sqlite.close();
});
