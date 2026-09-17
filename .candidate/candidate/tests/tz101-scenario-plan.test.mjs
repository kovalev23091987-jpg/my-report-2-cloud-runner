import assert from 'node:assert/strict';
import { immutableReceipt } from '../src/upstream-proof-utils.mjs';
import { prepareHtxExecutionFacts } from '../src/tz101-execution-facts.mjs';
import { buildTz101ScenarioPlan } from '../src/tz101-scenario-plan.mjs';

const NOW=Date.UTC(2026,8,17,12,0,0), SNAP='S392:TEST-USDT:1', CONTRACT='TEST-USDT';
const campaign={
  campaign_id:'MW:TEST-USDT:1',schema_version:'multi-wave-decision-state-v1',rules_version:'multi-wave-decision-state-rules-v1',
  contract_code:CONTRACT,campaign_start:NOW-20*60_000,first_detected_time:NOW-20*60_000,last_observed_ts:NOW-1_000,campaign_end:null,
  current_phase:'ENTRY_TRIGGER',direction:'LONG',direction_at_detection:'LONG',direction_locked_ts:NOW-19*60_000,direction_lock_observation_id:'E1',
  wave_index:1,completed_wave_count:0,current_wave_id:'MW:TEST-USDT:1:W1',base_start:null,entry_trigger_time:NOW-60_000,entry_trigger_price:100,
  impulse_start:null,impulse_start_price:null,impulse_peak_price:null,impulse_peak_ts:null,exhaustion_warning_ts:null,edge_spent_ts:null,last_event_id:'E1',last_event_ts:NOW-2_000,
  origin_episode_id:'EP1',episode_revision:1,state_revision:4,observation_id:'OBS4',wave_facts_immutable:true,cas_persisted:true,wave_ledger_offset:0,wave_ledger_anchor:null,
  transition_history:[],history_truncated:false,history_anchor:null,wave_ledger:[],
};
const anchor={schema_version:'multi-wave-entry-scenario-anchor-v1',rules_version:'multi-wave-campaign-v1',scenario_type:'FIRST_IMPULSE_THRESHOLD',
  campaign_id:campaign.campaign_id,contract_code:CONTRACT,wave_index:1,direction:'LONG',source_phase:'ENTRY_TRIGGER',source_observation_ts:campaign.last_observed_ts,
  base_start:NOW-10*60_000,base_low:98,base_high:101,entry_trigger_time:campaign.entry_trigger_time,entry_trigger_price:100,
  invalidation_price:98,invalidation_basis:'PRECOMMITTED_CAMPAIGN_BASE_BREAK',target_move_pct:3,target_price:103,
  target_basis:'PRECOMMITTED_MULTI_WAVE_IMPULSE_THRESHOLD',prospective_only:true};
const entryWindow={status:'CLOSED',contract_code:CONTRACT,snapshot_id:SNAP,campaign_id:campaign.campaign_id,wave_id:campaign.current_wave_id,campaign_state_revision:4,
  observation_id:'OBS4',action_id:'FDE:ACTION1',single_use:true,consumed:false,source_ts:campaign.entry_trigger_time,valid_until_ts:NOW+10*60_000,max_age_ms:30*60_000,persistence:{status:'CLOSED'}};
const bridgeMaterial={schema_version:'multi-wave-decision-bridge-v1',status:'SHADOW_CAMPAIGN_EVALUATED',snapshot_id:SNAP,admitted_event_id:'E1',observation_id:'OBS4',campaign,
  chase_risk:{status:'CLOSED',active:false,contract_code:CONTRACT,snapshot_id:SNAP,source_ts:campaign.last_observed_ts,available_ts:campaign.last_observed_ts,max_age_ms:60_000,valid_until_ts:NOW+60_000,rules_version:'chase-risk-state-v1'},
  entry_window:entryWindow,entry_scenario_anchor:anchor};
const campaignProof=immutableReceipt(bridgeMaterial,`CMR:${campaign.campaign_id}:4:OBS4`,campaign.last_observed_ts);
const decision={decision_id:'FD1',snapshot_id:SNAP,contract_code:CONTRACT,observation_ts:NOW,direction:'LONG',entry_action:'SHADOW_ENTRY_ELIGIBLE',entry_action_id:'FDE:ACTION1',
  entry_quality:'CLOSED',campaign_receipt_id:campaignProof.persistence.receipt_id,safety_gate_receipt_id:'SGR1'};
const prepared=prepareHtxExecutionFacts({contract_code:CONTRACT,requested_notional_usdt:1000,received_ts:NOW-500,
  info_response:{ok:true,data:{status:'ok',ts:NOW-2_000,data:[{contract_code:CONTRACT,contract_size:1,price_tick:0.1,contract_status:1}]}},
  depth_response:{ok:true,data:{status:'ok',ch:`market.${CONTRACT}.depth.step0`,ts:NOW-600,tick:{ts:NOW-700,bids:[[99.5,100],[99.4,100]],asks:[[100.5,100],[100.6,100]]}}}});
assert.equal(prepared.status,'PREPARED_UNACKNOWLEDGED');
const executionGate={authoritative:true,snapshot_id:SNAP,contract_code:CONTRACT,safety_gate_receipt_id:'SGR1',factual_basis:prepared};
const evidence=[
  {status:'CLOSED',eligible_for_decision:true,stance:'LONG',snapshot_id:SNAP,contract_code:CONTRACT,causal_family:'PRICE_RESPONSE'},
  {status:'CLOSED',eligible_for_decision:true,stance:'LONG',snapshot_id:SNAP,contract_code:CONTRACT,causal_family:'RELATIVE_STRENGTH'},
];

const partial=buildTz101ScenarioPlan({decision_summary:decision,campaign_proof:campaignProof,execution_gate:executionGate,decision_evidence:evidence,observed_ts:NOW});
assert.equal(partial.status,'NOT_CLOSED');
assert.equal(partial.reason,'ENTRY_AREA_RULE_NOT_CALIBRATED_OR_PROVEN');
assert.equal(partial.scenario_identity_status,'CLOSED');
assert.equal(partial.required_evidence_status,'CLOSED');
assert.equal(partial.target_price,103);
assert.equal(partial.invalidation_price,98);
assert.equal(partial.entry_area,null);

const areaMaterial={schema_version:'tz101-entry-area-rule-v1',status:'CLOSED',calibration_status:'VALIDATED_OUT_OF_SAMPLE',contract_code:CONTRACT,snapshot_id:SNAP,decision_id:'FD1',direction:'LONG',
  campaign_receipt_id:campaignProof.persistence.receipt_id,min_price:100,max_price:101,source_ts:NOW-2_000,valid_until_ts:NOW+5*60_000};
const area=immutableReceipt(areaMaterial,'EAR1',NOW-1_500);
const closed=buildTz101ScenarioPlan({decision_summary:decision,campaign_proof:campaignProof,execution_gate:executionGate,decision_evidence:evidence,entry_area_rule:area,observed_ts:NOW});
assert.equal(closed.status,'CLOSED');
assert.equal(closed.current_price_in_entry_area,true);
assert.equal(closed.entry_area,'100–101 USDT');
assert.equal(closed.valid_until_ts,prepared.facts.valid_until_ts);

const wrong=structuredClone(area); wrong.decision_id='OTHER';
const wrongPlan=buildTz101ScenarioPlan({decision_summary:decision,campaign_proof:campaignProof,execution_gate:executionGate,decision_evidence:evidence,entry_area_rule:wrong,observed_ts:NOW});
assert.equal(wrongPlan.status,'NOT_CLOSED');
assert.equal(wrongPlan.entry_area_status,'UNKNOWN');

const oneDomain=buildTz101ScenarioPlan({decision_summary:decision,campaign_proof:campaignProof,execution_gate:executionGate,decision_evidence:evidence.slice(0,1),entry_area_rule:area,observed_ts:NOW});
assert.equal(oneDomain.status,'NOT_CLOSED');
assert.equal(oneDomain.required_evidence_status,'NOT_CLOSED');

const tampered=structuredClone(campaignProof);tampered.entry_scenario_anchor.target_price=999;
const tamperedPlan=buildTz101ScenarioPlan({decision_summary:decision,campaign_proof:tampered,execution_gate:executionGate,decision_evidence:evidence,entry_area_rule:area,observed_ts:NOW});
assert.match(tamperedPlan.reason,/CAMPAIGN_PROOF_INVALID:STORED_CAMPAIGN_CONTENT_DIGEST_MISMATCH/);

console.log(JSON.stringify({ok:true,suite:'tz101-scenario-plan',partial_without_entry_area:partial.status,closed_with_validated_area:closed.status,target:closed.target_price,invalidation:closed.invalidation_price}));
