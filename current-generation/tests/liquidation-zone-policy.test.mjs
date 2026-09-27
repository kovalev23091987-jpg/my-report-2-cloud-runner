import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPumpLiquidationZones,classifyPump24h} from '../files/src/pump-liquidation-zones.mjs';
const zones=[{price:110,status:'CLOSED',source:'ByKaranteli',notional_usdt:1000},{price:90,status:'CLOSED',source:'ByKaranteli',notional_usdt:900}];
test('five percent starts liquidation-map urgency and has no upper ceiling',()=>{
 for(const move of [5,40,100,200,-250])assert.equal(classifyPump24h(move).is_pump,true);
 assert.equal(classifyPump24h(200).upper_ceiling_pct,null);
});
test('early anomaly can show verified zones before five percent',()=>{
 const x=buildPumpLiquidationZones({contract:'FIL-USDT',rolling_24h_change_pct:2,current_price:100,early_anomaly:true,projected:zones});
 assert.equal(x.status,'CLOSED');assert.equal(x.above.length,1);assert.equal(x.below.length,1);
});
test('BTC and ETH never show liquidation maps',()=>{
 for(const contract of ['BTC-USDT','ETH-USDT'])assert.equal(buildPumpLiquidationZones({contract,rolling_24h_change_pct:200,current_price:100,projected:zones}).status,'EXCLUDED_BY_USER_POLICY');
});
