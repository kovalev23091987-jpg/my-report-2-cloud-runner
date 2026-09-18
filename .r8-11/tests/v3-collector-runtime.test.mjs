import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCollectorPlan,
  buildCollectorSubscribeFrames,
  createCollectorHealth,
  collectorHealthTransition,
  assessCollectorHealth,
  normalizeCollectorMessage,
  assessEnduranceProof,
  reconnectDelayMs,
} from '../src/v3-collector-runtime.mjs';
import { buildVenueIdentity } from '../src/v3-liquidation-data-plane.mjs';

const bybitId = buildVenueIdentity({ htx_contract:'BTC-USDT', venue:'BYBIT', venue_symbol:'BTCUSDT', verified:true });
const gateId = buildVenueIdentity({ htx_contract:'BTC-USDT', venue:'GATE', venue_symbol:'BTC_USDT', verified:true, multiplier:0.0001 });
const binanceId = buildVenueIdentity({ htx_contract:'BTC-USDT', venue:'BINANCE', venue_symbol:'BTCUSDT', verified:true });

test('collector plans fail closed on identity and preserve venue coverage semantics', () => {
  const plan = buildCollectorPlan({ venue:'BYBIT', htx_contracts:['BTC-USDT','牛来-USDT'], identity_by_contract:{'BTC-USDT':bybitId} });
  assert.equal(plan.status, 'PARTIAL');
  assert.deepEqual(plan.subscriptions, ['allLiquidation.BTCUSDT']);
  assert.equal(plan.blocked[0].reason, 'IDENTITY_UNRESOLVED');
  assert.equal(plan.production_enabled, false);
  assert.deepEqual(buildCollectorSubscribeFrames(plan), [{op:'subscribe',args:['allLiquidation.BTCUSDT']}]);
});


test('Binance plan uses exact official 2026 USD-M market route and forceOrder subscription', () => {
  const exact = buildCollectorPlan({ venue:'BINANCE', htx_contracts:['BTC-USDT'], identity_by_contract:{'BTC-USDT':binanceId} });
  assert.equal(exact.status,'CLOSED');
  assert.equal(exact.url,'wss://fstream.binance.com/market/stream');
  assert.deepEqual(exact.subscriptions,['btcusdt@forceOrder']);
  assert.deepEqual(buildCollectorSubscribeFrames(exact), [{method:'SUBSCRIBE',params:['btcusdt@forceOrder'],id:1}]);
  assert.equal(exact.coverage_class,'PARTIAL_SNAPSHOT');
});

test('Gate without decimal header forces notional unknown instead of false precision', () => {
  const plan = buildCollectorPlan({ venue:'GATE', htx_contracts:['BTC-USDT'], identity_by_contract:{'BTC-USDT':gateId}, websocket_header_capable:false });
  assert.equal(plan.size_precision_status, 'DEGRADED_INTEGER_SIZE_ROUNDING_RISK');
  const msg={channel:'futures.public_liquidates',event:'update',result:[{contract:'BTC_USDT',price:'60000',size:'-10',time:1000}]};
  const out=normalizeCollectorMessage({venue:'GATE',message:msg,identity:gateId,received_ts:1100,gate_multiplier:0.0001,gate_decimal_header_closed:false});
  assert.equal(out.status,'PARTIAL');
  assert.equal(out.events[0].notional_usdt_normalized,null);
  assert.equal(out.events[0].notional_status,'UNKNOWN_GATE_INTEGER_SIZE_ROUNDING_RISK');
});

test('Bybit and Binance parser wiring retains distinct coverage', () => {
  const by=normalizeCollectorMessage({venue:'BYBIT',identity:bybitId,received_ts:1100,message:{topic:'allLiquidation.BTCUSDT',type:'snapshot',data:[{T:1000,s:'BTCUSDT',S:'Buy',v:'2',p:'50000'}]}});
  assert.equal(by.status,'CLOSED'); assert.equal(by.events[0].liquidated_side_normalized,'LONG');
  const bn=normalizeCollectorMessage({venue:'BINANCE',identity:binanceId,received_ts:1100,message:{e:'forceOrder',E:1000,o:{s:'BTCUSDT',S:'SELL',q:'2',ap:'50000',T:1000}}});
  assert.equal(bn.coverage_class,'PARTIAL_SNAPSHOT');
  assert.equal(bn.events[0].liquidated_side_normalized,'LONG');
});

test('health tracks gap latency errors and reconnects', () => {
  let h=createCollectorHealth({venue:'BYBIT',now_ts:0});
  h=collectorHealthTransition(h,{type:'CONNECTED',now_ts:1000});
  h=collectorHealthTransition(h,{type:'MESSAGE',now_ts:1200,exchange_ts:1100,normalized_events:1});
  h=collectorHealthTransition(h,{type:'MESSAGE',now_ts:1800,exchange_ts:1700,normalized_events:2});
  h=collectorHealthTransition(h,{type:'RECONNECTED',now_ts:2000});
  const a=assessCollectorHealth(h,{now_ts:2100,stale_after_ms:1000,require_events:true});
  assert.equal(a.status,'CLOSED'); assert.equal(a.reconnect_count,1); assert.equal(a.normalized_event_count,3);
  h=collectorHealthTransition(h,{type:'ERROR',now_ts:2200,error:'rate',rate_limit:true});
  assert.equal(assessCollectorHealth(h,{now_ts:2200}).status,'DEGRADED');
});

test('endurance proof is explicit and cannot pass a short run', () => {
  const h={message_count:100,normalized_event_count:40,reconnect_count:1,max_event_gap_ms:5000,parse_error_count:0,schema_error_count:0,identity_error_count:0,rate_limit_count:0,latency_samples_ms:[10,20,30]};
  assert.equal(assessEnduranceProof({health:h,started_ts:0,completed_ts:1000,required_duration_ms:2000}).status,'NOT_CLOSED');
  assert.equal(assessEnduranceProof({health:h,started_ts:0,completed_ts:3000,required_duration_ms:2000}).status,'CLOSED');
  assert.equal(reconnectDelayMs(0),1000); assert.equal(reconnectDelayMs(10),60000);
});
