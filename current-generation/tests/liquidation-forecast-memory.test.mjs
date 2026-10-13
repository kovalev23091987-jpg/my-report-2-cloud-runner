import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {buildLiquidationForecastSnapshot,createLiquidationForecastMemory} from '../files/src/liquidation-forecast-memory.mjs';

const T=1_791_828_000_000;
const zone=(side,price,sourceTs=T-1_000)=>({source:'CoinBoss',independence_group:'COINBOSS_AGGREGATED_CEX_MODEL',side,price,price_quote:'USD',source_ts:sourceTs,scenario_only:true,source_backed_calculated:true,kind:'PROJECTED',notional:null,exact_amount_available:false,estimated:true,distance_pct:(price-1)*100,distance_reference_price:1,native_reference_price:1,price_semantics:'COINBOSS_AGGREGATED_LEVERAGE_MODEL',scenario_estimated_size_tier:'средняя'});
const input={contract:'FIL-USDT',run_id:'saved-run:1',observed_ts:T,reference_price:1,liquidations:{current_price:1,calculated_scenarios:[zone('ABOVE',1.1),zone('BELOW',0.9)]}};

test('forecast memory keeps original clocks and non-decision model levels',()=>{
 const snapshot=buildLiquidationForecastSnapshot(input);
 assert.equal(snapshot.status,'CLOSED');assert.equal(snapshot.zones.length,2);
 assert.equal(snapshot.zones[0].source_ts,T-1_000);assert.equal(snapshot.zones[0].reported_notional,null);
 assert.equal(snapshot.decision_effect,false);assert.equal(snapshot.report_effect,false);assert.equal(snapshot.historical_outcome_only,true);
 assert.equal(buildLiquidationForecastSnapshot({...input,contract:'BTC-USDT'}).status,'NOT_RECORDED');
 assert.equal(buildLiquidationForecastSnapshot({...input,liquidations:{current_price:1,calculated_scenarios:[zone('ABOVE',1.1,T-300_001)]}}).status,'NOT_RECORDED');
});

test('retained real Hyperliquid level keeps its independent primary identity',()=>{
 const native={source:'Hyperliquid official',independence_group:null,kind:'NATIVE_FUTURE_LEVEL',side:'BELOW',price:0.95,price_quote:'USDC',source_ts:T-1_000,distance_pct:-5,distance_reference_price:1,distance_reference_basis:'ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE',notional:120_000,notional_unit:'USDC',exact_amount_available:true,estimated:false,price_semantics:'EXCHANGE_ACCOUNT_LIQUIDATION_PRICE'};
 const snapshot=buildLiquidationForecastSnapshot({...input,liquidations:{current_price:1,display_source_zones:[native],calculated_scenarios:[]}});
 assert.equal(snapshot.status,'CLOSED');assert.equal(snapshot.zones.length,1);
 assert.equal(snapshot.zones[0].group,'HYPERLIQUID');
 assert.equal(snapshot.zones[0].reported_notional,120_000);
 assert.equal(snapshot.zones[0].source_ts,T-1_000);
});

class D1{constructor(){this.db=new DatabaseSync(':memory:');this.bytes=16_384;}prepare(sql){const stmt=this.db.prepare(sql),args=[],self=this;return{bind(...values){args.push(...values);return this;},async run(){return stmt.run(...args);},async all(){return{results:stmt.all(...args),meta:{size_after:self.bytes}};}};}close(){this.db.close();}}

test('record is idempotent and storage guard leaves existing archive untouched',async()=>{
 const db=new D1(),memory=createLiquidationForecastMemory({db});
 try{
  const a=await memory.record(input),b=await memory.record(input);
  assert.equal(a.status,'RECORDED');assert.equal(b.status,'RECORDED');
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM report2_liq_forecast_snapshots').get().n,1);
  const saved=JSON.parse(db.db.prepare('SELECT payload_json FROM report2_liq_forecast_snapshots').get().payload_json);
  assert.equal(saved.run_id,input.run_id);assert.equal(saved.zones.length,2);
  db.bytes=400_000_001;
  assert.equal((await memory.record({...input,run_id:'saved-run:2'})).status,'DEFERRED_FREE_STORAGE_GUARD');
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM report2_liq_forecast_snapshots').get().n,1);
 }finally{db.close();}
});
