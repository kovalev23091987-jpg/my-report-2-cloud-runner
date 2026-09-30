import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bindVerifiedFuturesFlow} from '../files/src/verified-futures-flow-binding.mjs';

const END = 1_790_788_020_000, NOW = END + 30_000, START = END - 900_000;
function fixture() {
  const common = {source:'HTX official public API',market:'HTX USDT-M Futures',contract:'NIL-USDT',timestamp:NOW-1000,contract_info:{contract_code:'NIL-USDT',contract_size:1}};
  const factual = {status:'COMPLETE',exact_1m_bars:true,trade_count_fields_complete:true,expected_1m_bars:15,received_1m_bars:15,factual_1m_trade_count:15};
  const integrity = {status:'COMPLETE',complete:true,source_truncated:false,missing_trade_id_count:0,duplicate_trade_id_count:0,invalid_payload_count:0,source_rows_dropped:0,raw_records:15,unique_trade_ids:15};
  const flow = {sample_trades:15,window_start_ts:START,window_end_ts:END,usable:true,cvd_delta_usable:true,cvd_delta_reliable:true,raw_delta_is_diagnostic_only:false,cvd_delta_quality:{status:'COMPLETE',reliable:true,trade_count_exact_match:true,raw_record_integrity_complete:true,raw_trade_count:15,factual_1m_trade_count:15,factual_coverage:factual,record_integrity:integrity}};
  const window = {label:'15m',synchronized_window_start_ts:START,synchronized_window_end_ts:END,order_flow:flow,price:{window_start_ts:START,window_end_ts:END,usable:true,exact_1m_bars:true,trade_count_complete:true,expected_1m_bars:15,received_1m_bars:15,trade_count:15}};
  return {snapshot:{...structuredClone(common),coverage:{htx_futures_order_flow:'not_closed',htx_futures_order_flow_sample:'closed'},order_flow:{usable:false,raw_delta_is_diagnostic_only:true}},trajectory:{...structuredClone(common),coverage:{flow_15m:'closed',flow_24h:'not_closed'},windows:{'15m':window}}};
}
test('binds only ready 15m coverage and retains the unwindowed sample and 24h gap',()=>{
  const {snapshot,trajectory}=fixture();const original=JSON.stringify({snapshot,trajectory});
  const result=bindVerifiedFuturesFlow(snapshot,trajectory,NOW);
  assert.equal(result.coverage.htx_futures_order_flow,'closed');
  assert.equal(result.order_flow,snapshot.order_flow);assert.equal(result.order_flow.usable,false);
  assert.equal(trajectory.coverage.flow_24h,'not_closed');
  assert.equal(result.verified_order_flow.binding.full_24h_coverage_claimed,false);
  assert.equal(result.verified_order_flow.binding.additional_http_requests,0);
  assert.equal(result.verified_order_flow.binding.additional_directional_votes,0);
  assert.equal(JSON.stringify({snapshot,trajectory}),original);
});
test('rejects wrong identity, scale, source, stale or future clocks and misbound windows',()=>{
  const changes=[
    f=>f.trajectory.contract='RIVER-USDT',f=>f.trajectory.contract_info.contract_code='RIVER-USDT',
    f=>f.trajectory.contract_info.contract_size=10,f=>f.trajectory.market='SPOT',
    f=>f.trajectory.source='OTHER',f=>f.trajectory.timestamp=NOW-120001,
    f=>f.snapshot.timestamp=NOW+1,f=>f.trajectory.windows['15m'].order_flow.window_end_ts=NOW+1,
    f=>f.trajectory.windows['15m'].synchronized_window_start_ts=START-60000,
    f=>f.trajectory.windows['15m'].price.window_end_ts=END-60000,
    f=>f.trajectory.windows['15m'].label='1h',
  ];
  for(const change of changes){const f=fixture();change(f);assert.equal(bindVerifiedFuturesFlow(f.snapshot,f.trajectory,NOW),f.snapshot);}
  const f=fixture();assert.equal(bindVerifiedFuturesFlow(f.snapshot,f.trajectory,NOW+120001),f.snapshot);
});
test('a coverage label or reliable flag cannot bypass factual counts and payload integrity',()=>{
  const changes=[
    f=>f.trajectory.coverage.flow_15m='not_closed',
    f=>f.trajectory.windows['15m'].order_flow.usable=false,
    f=>f.trajectory.windows['15m'].order_flow.cvd_delta_quality.raw_trade_count=14,
    f=>f.trajectory.windows['15m'].order_flow.cvd_delta_quality.record_integrity.unique_trade_ids=14,
    f=>f.trajectory.windows['15m'].order_flow.cvd_delta_quality.record_integrity.duplicate_trade_id_count=1,
    f=>f.trajectory.windows['15m'].order_flow.cvd_delta_quality.record_integrity.source_truncated=true,
    f=>f.trajectory.windows['15m'].order_flow.cvd_delta_quality.record_integrity.invalid_payload_count=1,
    f=>f.trajectory.windows['15m'].order_flow.cvd_delta_quality.factual_coverage.received_1m_bars=14,
    f=>f.trajectory.windows['15m'].price.trade_count=16,
    f=>f.trajectory.windows['15m'].order_flow.cvd_delta_quality=null,
    f=>f.trajectory.windows['15m'].order_flow.raw_delta_is_diagnostic_only=true,
  ];
  for(const change of changes){const f=fixture();change(f);assert.equal(bindVerifiedFuturesFlow(f.snapshot,f.trajectory,NOW),f.snapshot);}
});
test('the actual deep consumer binds after both components settle, before sufficiency',()=>{
 const source=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');
 const settle=source.indexOf('settled(results[2])'),bind=source.indexOf('futures.data = bindVerifiedFuturesFlow('),quality=source.indexOf('const dataSufficiency =');
 assert.ok(settle>0&&bind>settle&&quality>bind);assert.match(source,/factual_order_flow_window =/);
 assert.match(source,/htx_futures_order_flow: "not_closed"/,'unwindowed snapshot stays unverified');
});
