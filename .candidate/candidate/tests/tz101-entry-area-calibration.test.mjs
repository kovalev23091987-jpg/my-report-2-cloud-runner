import assert from 'node:assert/strict';
import { immutableReceipt } from '../src/upstream-proof-utils.mjs';
import { buildProspectiveEntryAreaSample, attachFactualEntryAreaOutcome, evaluateEntryAreaCalibrationReadiness } from '../src/tz101-entry-area-calibration.mjs';
const NOW=Date.UTC(2026,8,17,12,0,0), SNAP='S1', CONTRACT='TEST-USDT';
function proofAt(ts=NOW-1_000){
 const campaign={campaign_id:'MW1',schema_version:'multi-wave-decision-state-v1',rules_version:'multi-wave-decision-state-rules-v1',contract_code:CONTRACT,campaign_start:NOW-20*60_000,first_detected_time:NOW-20*60_000,last_observed_ts:ts,campaign_end:null,current_phase:'ENTRY_TRIGGER',direction:'LONG',direction_at_detection:'LONG',direction_locked_ts:NOW-19*60_000,direction_lock_observation_id:'E1',wave_index:1,completed_wave_count:0,current_wave_id:'MW1:W1',base_start:null,entry_trigger_time:NOW-60_000,entry_trigger_price:100,impulse_start:null,impulse_start_price:null,impulse_peak_price:null,impulse_peak_ts:null,exhaustion_warning_ts:null,edge_spent_ts:null,last_event_id:'E1',last_event_ts:NOW-2_000,origin_episode_id:'EP1',episode_revision:1,state_revision:4,observation_id:'OBS4',wave_facts_immutable:true,cas_persisted:true,wave_ledger_offset:0,wave_ledger_anchor:null,transition_history:[],history_truncated:false,history_anchor:null,wave_ledger:[]};
 const anchor={schema_version:'multi-wave-entry-scenario-anchor-v1',rules_version:'multi-wave-campaign-v1',scenario_type:'FIRST_IMPULSE_THRESHOLD',campaign_id:'MW1',contract_code:CONTRACT,wave_index:1,direction:'LONG',source_phase:'ENTRY_TRIGGER',source_observation_ts:ts,base_start:NOW-10*60_000,base_low:98,base_high:101,entry_trigger_time:NOW-60_000,entry_trigger_price:100,invalidation_price:98,invalidation_basis:'PRECOMMITTED_CAMPAIGN_BASE_BREAK',target_move_pct:3,target_price:103,target_basis:'PRECOMMITTED_MULTI_WAVE_IMPULSE_THRESHOLD',prospective_only:true};
 const material={schema_version:'multi-wave-decision-bridge-v1',status:'SHADOW_CAMPAIGN_EVALUATED',snapshot_id:SNAP,admitted_event_id:'E1',observation_id:'OBS4',campaign,chase_risk:{status:'CLOSED',active:false,contract_code:CONTRACT,snapshot_id:SNAP,source_ts:ts,available_ts:ts,max_age_ms:60_000,valid_until_ts:NOW+60_000,rules_version:'chase-risk-state-v1'},entry_window:{status:'CLOSED',contract_code:CONTRACT,snapshot_id:SNAP,campaign_id:'MW1',wave_id:'MW1:W1',campaign_state_revision:4,observation_id:'OBS4',action_id:'FDE:A',single_use:true,consumed:false,source_ts:NOW-60_000,valid_until_ts:NOW+10*60_000,max_age_ms:30*60_000,persistence:{status:'CLOSED'}},entry_scenario_anchor:anchor};
 return immutableReceipt(material,'CMR:MW1:4:OBS4',ts);
}
const proof=proofAt();
const decision={decision_id:'FD1',snapshot_id:SNAP,contract_code:CONTRACT,observation_ts:NOW,direction:'LONG',campaign_receipt_id:proof.persistence.receipt_id};
const sample=buildProspectiveEntryAreaSample({decision_summary:decision,campaign_proof:proof,observed_ts:NOW});
assert.equal(sample.status,'CAPTURED_PROSPECTIVE');
assert.equal(sample.live_promotion_allowed,false);
assert.equal(sample.sample.features.target_distance_pct,3);
const legacy=structuredClone(proof); legacy.entry_scenario_anchor.source_observation_ts-=60_000;
// Re-seal tampered material to prove this is a semantic anti-backfill check, not merely a digest check.
const lm=structuredClone(legacy); delete lm.persistence; const resealed=immutableReceipt(lm,'CMR:MW1:4:OBS4',proof.persistence.committed_ts);
assert.equal(buildProspectiveEntryAreaSample({decision_summary:decision,campaign_proof:resealed,observed_ts:NOW}).reason,'RETROSPECTIVE_OR_FUTURE_ANCHOR_FORBIDDEN');
const futureDecision={...decision,observation_ts:NOW-2_000};
assert.equal(buildProspectiveEntryAreaSample({decision_summary:futureDecision,campaign_proof:proof,observed_ts:NOW}).reason,'RETROSPECTIVE_OR_FUTURE_ANCHOR_FORBIDDEN');
const outcome={status:'CLOSED_FACTUAL',contract_code:CONTRACT,direction_hint:'LONG',observed_ts:NOW,horizon_hours:1,target_ts:NOW+60*60_000,outcome_scan_ts:NOW+65*60_000,directional_return_pct:2,mfe_directional_pct_snapshot:4,mae_directional_pct_snapshot:-3,path_coverage_pct:100,source:'STAGE0_COMPACT_FACTUAL_5M_SNAPSHOTS',interpolation_used:false,calibration_only:true,live_promotion_allowed:false};
const attached=attachFactualEntryAreaOutcome({sample_record:sample,outcome_record:outcome,computed_ts:NOW+70*60_000});
assert.equal(attached.status,'CLOSED_FACTUAL');
assert.equal(attached.outcome.path_order_status,'AMBIGUOUS_BOTH_TOUCHED_ORDER_UNKNOWN');
const futureOutcome={...outcome,outcome_scan_ts:NOW+2*60*60_000,target_ts:NOW+3*60*60_000};
assert.equal(attachFactualEntryAreaOutcome({sample_record:sample,outcome_record:futureOutcome,computed_ts:NOW+2*60*60_000}).status,'NOT_CLOSED');
const insufficient=evaluateEntryAreaCalibrationReadiness([{sample_record:sample,outcome_record:attached}],{min_train:2,min_holdout:1,as_of_ts:NOW+2*60*60_000});
assert.equal(insufficient.status,'NOT_VALIDATED_INSUFFICIENT_PROSPECTIVE_SAMPLE');
// Build three distinct prospective rows; readiness never auto-validates or creates a rule.
const rows=[];
for(let i=0;i<3;i++){
 const s=structuredClone(sample); s.sample_id=`EAC:${i}`; s.sample={...s.sample,decision_id:`FD${i}`,observed_ts:NOW+i*10*60_000};
 // Digest uses the exact mutated sample.
 const { digest }=await import('../src/upstream-proof-utils.mjs'); s.material_digest=digest(s.sample);
 const o={...attached,sample_id:s.sample_id,outcome:{...attached.outcome,sample_id:s.sample_id,observed_ts:s.sample.observed_ts,target_ts:s.sample.observed_ts+60*60_000,outcome_scan_ts:s.sample.observed_ts+65*60_000,computed_ts:s.sample.observed_ts+70*60_000}}; o.material_digest=digest(o.outcome);
 rows.push({sample_record:s,outcome_record:o});
}
const ready=evaluateEntryAreaCalibrationReadiness(rows,{min_train:2,min_holdout:1,as_of_ts:NOW+4*60*60_000});
assert.equal(ready.status,'CALIBRATION_DATA_READY_NOT_VALIDATED');
assert.equal(ready.validated_out_of_sample,false);
assert.equal(ready.rule_created,false);
assert.ok(ready.train_max_observed_ts<ready.holdout_min_observed_ts);
console.log(JSON.stringify({ok:true,suite:'tz101-entry-area-calibration',sample:sample.status,outcome:attached.outcome.path_order_status,insufficient:insufficient.status,ready:ready.status}));
