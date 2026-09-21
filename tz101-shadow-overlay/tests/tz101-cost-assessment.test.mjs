import assert from 'node:assert/strict';
import { immutableReceipt } from '../src/upstream-proof-utils.mjs';
import { prepareHtxExecutionFacts } from '../src/tz101-execution-facts.mjs';
import { buildTz101CostAssessment } from '../src/tz101-cost-assessment.mjs';
import { buildHtxFeeScheduleReceipt } from '../src/tz101-fee-source.mjs';
const NOW=Date.UTC(2026,8,17,12,0,0),CONTRACT='TEST-USDT',SNAP='S1';
const decision={decision_id:'FD1',snapshot_id:SNAP,contract_code:CONTRACT,direction:'LONG',observation_ts:NOW};
const prepared=prepareHtxExecutionFacts({contract_code:CONTRACT,requested_notional_usdt:1000,received_ts:NOW-500,
  info_response:{ok:true,data:{status:'ok',ts:NOW-2_000,data:[{contract_code:CONTRACT,contract_size:1,price_tick:0.1,contract_status:1}]}},
  depth_response:{ok:true,data:{status:'ok',ch:`market.${CONTRACT}.depth.step0`,ts:NOW-600,tick:{ts:NOW-700,bids:[[99.5,5],[99.4,100]],asks:[[100.5,5],[100.6,100]]}}}});
const gate={factual_basis:prepared};
const scenario={status:'CLOSED',target_price:103,invalidation_price:98};
const funding={rate_pct:0.02,interval_hours:8,observed_ts:NOW-1_000,next_funding_time_ts:NOW+2*60*60_000};
const partial=buildTz101CostAssessment({decision_summary:decision,execution_gate:gate,scenario_plan:scenario,funding_context:funding,observed_ts:NOW});
assert.equal(partial.status,'NOT_CLOSED');
assert.ok(partial.spread_cost_usdt>0);
assert.ok(partial.slippage_cost_usdt>0);
assert.equal(partial.fees_usdt,null);
assert.equal(partial.funding_cost_usdt,null);
assert.equal(partial.double_count_free,true);

const fee=buildHtxFeeScheduleReceipt({contract_code:CONTRACT,observed_ts:NOW,source_record:{venue:'HTX',market_type:'USDT_PERP',contract_code:CONTRACT,fee_role:'TAKER',
  source_kind:'OFFICIAL_CONSERVATIVE_RATE',source_receipt_id:'HTX:OFFICIAL:1',source_ts:NOW-10_000,valid_until_ts:NOW+60*60_000,entry_rate:0.001,exit_rate:0.001,
  source_authority:'HTX_OFFICIAL',source_url:'https://www.htx.com/support/fees',conservative_for_unknown_account:true}}).fee_schedule;
const hold=immutableReceipt({schema_version:'tz101-holding-plan-v1',status:'CLOSED',contract_code:CONTRACT,decision_id:'FD1',direction:'LONG',
  source_kind:'PRECOMMITTED_CAMPAIGN_POLICY',source_receipt_id:'HOLD-POLICY:1',source_ts:NOW-1_000,entry_ts:NOW,planned_exit_no_later_than_ts:NOW+60*60_000,
  prospective_only:true,automatic_trade:false},'HOLD1',NOW);
const closed=buildTz101CostAssessment({decision_summary:decision,execution_gate:gate,scenario_plan:scenario,funding_context:funding,fee_schedule:fee,holding_plan:hold,observed_ts:NOW});
assert.equal(closed.status,'CLOSED');
assert.equal(closed.funding_cost_usdt,0);
assert.ok(closed.fees_usdt>0);
assert.equal(closed.risk_reward_after_costs_status,'CLOSED');
assert.ok(closed.total_cost_usdt>closed.spread_cost_usdt);

const crosses=immutableReceipt({schema_version:'tz101-holding-plan-v1',status:'CLOSED',contract_code:CONTRACT,decision_id:'FD1',direction:'LONG',
  source_kind:'PRECOMMITTED_CAMPAIGN_POLICY',source_receipt_id:'HOLD-POLICY:2',source_ts:NOW-1_000,entry_ts:NOW,planned_exit_no_later_than_ts:NOW+3*60*60_000,
  prospective_only:true,automatic_trade:false},'HOLD2',NOW);
const unknownFunding=buildTz101CostAssessment({decision_summary:decision,execution_gate:gate,scenario_plan:scenario,funding_context:funding,fee_schedule:fee,holding_plan:crosses,observed_ts:NOW});
assert.equal(unknownFunding.status,'NOT_CLOSED');
assert.equal(unknownFunding.funding_cost_usdt,null);
assert.ok(unknownFunding.reasons.includes('FUNDING_HOLDING_COST_NOT_PROVEN'));

const tamperedFee=structuredClone(fee);tamperedFee.entry_rate=0;
const badFee=buildTz101CostAssessment({decision_summary:decision,execution_gate:gate,scenario_plan:scenario,funding_context:funding,fee_schedule:tamperedFee,holding_plan:hold,observed_ts:NOW});
assert.equal(badFee.status,'NOT_CLOSED');
assert.equal(badFee.fees_usdt,null);
console.log(JSON.stringify({ok:true,suite:'tz101-cost-assessment',partial_spread:partial.spread_cost_usdt,partial_slippage:partial.slippage_cost_usdt,closed_total_cost:closed.total_cost_usdt,rr:closed.risk_reward_ratio}));
