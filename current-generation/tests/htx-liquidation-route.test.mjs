import test from 'node:test';
import assert from 'node:assert/strict';
import {liquidationMapPriority,parseHtxFuturesContract,resolveHtxLiquidationSources} from '../files/src/liquidation-extension/htx-liquidation-route.mjs';

test('all valid HTX Futures symbols remain eligible for factual HTX liquidation data',()=>{
 for(const contract of ['BTC-USDT','FIL-USDT','1000PEPE-USDT','龙虾-USDT']){
  const route=resolveHtxLiquidationSources({contract});
  assert.equal(route.htx_factual,true);
  assert.equal(route.contract,contract);
  assert.equal(route.guessed_alias,false);
 }
});

test('BTC and ETH do not consume projected-map or native-source budget',()=>{
 for(const base of ['BTC','ETH']){
  const route=resolveHtxLiquidationSources({
   contract:`${base}-USDT`,
   byk_registry:{symbols:[{symbol:`${base}USDT`}]},
   hyperliquid_catalog:[{universe:[{name:base,isDelisted:false}]},{}],
   gtrade_variables:{pairs:[{from:base,to:'USD'}]},
  });
  assert.equal(route.external_liquidation_map_needed,false);
  assert.equal(route.projected_routes.length,0);
  assert.equal(route.native_routes.length,0);
  assert.equal(route.coverage_status,'BTC_ETH_SKIPPED_BY_POLICY');
 }
});

test('5, 40, 100 and 200 percent moves are all urgent with no upper ceiling',()=>{
 for(const move_pct of [5,-5,40,-40,100,200,-250]){
  const priority=liquidationMapPriority({contract:'FIL-USDT',move_pct});
  assert.equal(priority.eligible,true);
  assert.equal(priority.priority,'URGENT_MOVE_5_PLUS_NO_CEILING');
  assert.equal(priority.no_upper_move_cap,true);
 }
});

test('OI, funding, volume or spot anomaly can prioritize a coin before five percent',()=>{
 const cases=[{move_pct:1,oi_delta_pct:3},{move_pct:2,funding_shift_abs:0.0001},{move_pct:0.5,volume_spike_ratio:2},{move_pct:0,spot_flow_anomaly:true}];
 for(const input of cases)assert.equal(liquidationMapPriority({contract:'FIL-USDT',...input}).priority,'EARLY_PREMOVE_ANOMALY');
});

test('all HTX coins except BTC and ETH use the same rules regardless of size label',()=>{
 for(const contract of ['SOL-USDT','FIL-USDT','PUMP-USDT','1000PEPE-USDT','龙虾-USDT']){
  const priority=liquidationMapPriority({contract,move_pct:6});
  assert.equal(priority.eligible,true);
  assert.equal(priority.priority,'URGENT_MOVE_5_PLUS_NO_CEILING');
 }
});

test('external routes require exact provider-owned registry matches',()=>{
 const route=resolveHtxLiquidationSources({
  contract:'FIL-USDT',
  byk_registry:{symbols:[{symbol:'FILUSDT'}]},
  hyperliquid_catalog:[{universe:[{name:'FIL',isDelisted:false}]},{}],
  gtrade_variables:{pairs:[{from:'FIL',to:'USD'}]},
 });
 assert.deepEqual(route.projected_routes,[{provider:'BYKARANTELI',symbol:'FIL',registry_symbol:'FILUSDT'}]);
 assert.deepEqual(route.native_routes,[{provider:'HYPERLIQUID_LIQFLOW',symbol:'FIL'},{provider:'GTRADE',symbol:'FIL'}]);
 assert.equal(route.coverage_status,'EXTERNAL_ROUTE_CONFIRMED');
});

test('unsupported external symbol falls back to HTX factual data without guessed alias',()=>{
 const route=resolveHtxLiquidationSources({
  contract:'1000PEPE-USDT',
  byk_registry:{symbols:[{symbol:'PEPEUSDT'}]},
  hyperliquid_catalog:[{universe:[{name:'kPEPE',isDelisted:false}]},{}],
 });
 assert.equal(route.htx_factual,true);
 assert.equal(route.projected_routes.length,0);
 assert.equal(route.native_routes.length,0);
 assert.equal(route.coverage_status,'HTX_FACTUAL_ONLY_EXTERNAL_UNSUPPORTED');
});

test('unicode HTX base can be routed only by exact unicode registry identity',()=>{
 const route=resolveHtxLiquidationSources({contract:'龙虾-USDT',byk_registry:{symbols:[{symbol:'龙虾USDT'}]}});
 assert.equal(route.htx_factual,true);
 assert.equal(route.projected_routes[0].registry_symbol,'龙虾USDT');
});

test('non-USDT or malformed contracts are rejected',()=>{
 for(const contract of ['BTC-USD','BTC/USDT','-USDT','BTC-USDT-SWAP'])assert.equal(parseHtxFuturesContract(contract).ok,false);
});
