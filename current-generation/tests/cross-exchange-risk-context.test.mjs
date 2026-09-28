import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeCrossExchangeCatalogs,normalizeCrossExchangeDepth,normalizeOkxLiquidationEvents,normalizeCoinalyzeLiquidationHistory,compactCoinalyzeMarkets} from '../files/src/cross-exchange-risk-context.mjs';

test('only active exact USDT perpetual markets enter the cross-exchange catalog',()=>{
 const entries=normalizeCrossExchangeCatalogs({
  binance:{symbols:[{status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',baseAsset:'FIL',symbol:'FILUSDT'},{status:'BREAK',contractType:'PERPETUAL',quoteAsset:'USDT',baseAsset:'BAD',symbol:'BADUSDT'}]},
  bybit:{result:{list:[{status:'Trading',quoteCoin:'USDT',contractType:'LinearPerpetual',baseCoin:'FIL',symbol:'FILUSDT'}]}},
  okx:{data:[{state:'live',instType:'SWAP',settleCcy:'USDT',ctValCcy:'FIL',ctVal:'0.1',ctMult:'1',instId:'FIL-USDT-SWAP'}]},
 });
 assert.deepEqual(entries.FIL,{base:'FIL',binance:'FILUSDT',bybit:'FILUSDT',okx:'FIL-USDT-SWAP',okx_contract_value:0.1,okx_contract_multiplier:1,okx_contract_value_currency:'FIL'});assert.equal(entries.BAD,undefined);
});

test('depth metrics close only when the independent market price matches HTX',()=>{
 const good=normalizeCrossExchangeDepth({venue:'BINANCE',reference_price:10,observed_ts:1,payload:{symbol:'FILUSDT',bids:[['9.95','3000'],['9.8','2000']],asks:[['10.05','1000'],['10.2','1000']]}});
 assert.equal(good.status,'CLOSED');assert.ok(good.bid.notional_2pct>good.ask.notional_2pct);assert.ok(good.depth_imbalance_2pct>0);
 const wrong=normalizeCrossExchangeDepth({venue:'BINANCE',reference_price:10,observed_ts:1,payload:{symbol:'FILUSDT',bids:[['1','10']],asks:[['1.1','10']]}});
 assert.equal(wrong.status,'NOT_CLOSED');
});

test('OKX depth converts contracts with catalog units and fails closed without metadata',()=>{
 const payload={data:[{instId:'FIL-USDT-SWAP',ts:'1000',bids:[['9.95','100']],asks:[['10.05','100']]}]};
 const missing=normalizeCrossExchangeDepth({venue:'OKX',reference_price:10,observed_ts:1001,payload});
 assert.equal(missing.status,'NOT_CLOSED');assert.equal(missing.reason,'OKX_UNIT_METADATA_REQUIRED');
 const good=normalizeCrossExchangeDepth({venue:'OKX',reference_price:10,observed_ts:1001,payload,instrument:{base:'FIL',contract_value:0.1,contract_multiplier:1,contract_value_currency:'FIL'}});
 assert.equal(good.status,'CLOSED');assert.equal(good.bid.notional_2pct,99.5);assert.equal(good.ask.notional_2pct,100.5);
});

test('OKX liquidation contracts become base quantity before USD notional is calculated',()=>{
 const rows=normalizeOkxLiquidationEvents({data:[{instId:'FIL-USDT-SWAP',details:[{posSide:'short',side:'buy',bkPx:'5',sz:'13',ts:'1000'}]}]},'FIL-USDT-SWAP',{okx_contract_value:0.1,okx_contract_multiplier:1,okx_contract_value_currency:'FIL'});
 assert.equal(rows.length,1);assert.equal(rows[0].liquidated_side,'SHORT');assert.equal(rows[0].quantity,1.3);assert.equal(rows[0].notional_usd,6.5);
});

test('Coinalyze history produces a recent-versus-baseline liquidation intensity',()=>{
 const now=1_800_000_000_000,point=(minutes,l,s)=>({t:Math.floor((now-minutes*60000)/1000),l,s});
 const out=normalizeCoinalyzeLiquidationHistory([{symbol:'FIL.A',history:[point(5,5000,1000),point(30,1000,1000),point(60,1000,1000)]}],now);
 assert.equal(out.status,'CLOSED');assert.equal(out.recent_total,6000);assert.ok(out.intensity_ratio>1);
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
