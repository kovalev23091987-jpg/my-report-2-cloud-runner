import assert from 'node:assert/strict';
import { buildMultiWaveCampaignShadow } from '../src/multi-wave-campaign-engine.mjs';
import { buildMultiWaveDecisionBridge, verifyStoredMultiWaveDecisionBridge } from '../src/multi-wave-decision-bridge-producer.mjs';
import { completeInput, opportunity as provenOpportunity } from './final-decision-integration-fixtures.mjs';
import { evaluateFinalDecisionUpstreamCompatibility } from '../src/final-decision-upstream-compat-runtime.mjs';
import { loadActiveCampaign } from '../src/multi-wave-campaign-runtime.mjs';

const H=3_600_000, M=60_000;
const NOW=Date.UTC(2026,8,13,20,0,0);
function funding(){return {recent_history:[
  {funding_time_ts:NOW-12*H,funding_rate:-0.0001},
  {funding_time_ts:NOW-8*H,funding_rate:-0.0002},
  {funding_time_ts:NOW-4*H,funding_rate:-0.0004},
  {funding_time_ts:NOW,funding_rate:-0.0008},
]};}
function external(){
  const asset=[],btc=[],eth=[]; let ap=100,bp=100,ep=100;
  for(let i=0;i<=24;i++){
    const t=NOW-(24-i)*H;
    asset.push({ts:t,close:ap}); btc.push({ts:t,close:bp}); eth.push({ts:t,close:ep});
    ap*=i%2===0?1.012:0.998; bp*=i%3===0?1.002:0.999; ep*=i%4===0?0.999:1.001;
  }
  return {OKX_SPOT:asset,BTC_SPOT:btc,ETH_SPOT:eth};
}
function minuteCandles(){
  const start=NOW-10*M;
  return [
    {ts:start,end_ts:start+M,open:100,high:101,low:98,close:99,volume:100},
    {ts:start+M,end_ts:start+2*M,open:99,high:101,low:98.5,close:100.5,volume:90},
    {ts:start+2*M,end_ts:start+3*M,open:100.5,high:101,low:99.9,close:100.1,volume:60},
    {ts:start+3*M,end_ts:start+4*M,open:100.1,high:102,low:100,close:100.2,volume:50},
    {ts:start+4*M,end_ts:start+5*M,open:100.2,high:102.5,low:100.1,close:101.8,volume:45},
  ];
}
function mwOpportunity(stage='ENTRY_TRIGGER_SHADOW',currentReturn=1){
  const ev={
    event_id:'EVENT-1',episode_id:'EP:TEST:1',episode_revision:1,
    timestamp:NOW-60*M,event_close_ts:NOW-59*M,event_type:'ANOMALOUS_EFFORT_VS_RESULT',
    data_quality:'OK',direction_at_detection:'LONG',direction_locked_ts:NOW-59*M,
    candle:{open:100,high:102,low:98,close:100,volume:1000},
    volume_ratio_median:4,body_range_ratio:0.2,
    cross_exchange:{cross_exchange_confirmed:true},
    market_flow:{status:'OK',delta:-50},spot_perp_basis:{status:'OK',htx_basis_pct:-0.2},
    funding_at_event:{funding_rate:-0.0008},relative_strength:{status:'OK',improving:true},
    oi_flush_rebuild:{status:'OK',detected:true,setup_shadow:true,oi_rebuild_pct:5},
    liquidity_sweep:{sweep_detected:true,reclaim_detected:true,side:'LOW',pool:{level:100},reclaim_index:1,sweep_ts:NOW-60*M,reclaim_time_ms:30_000},
    post_event_current:{status:'OK',current_return_pct:currentReturn,low_held:true,reclaim_detected:true,ease_supply_exhaustion:true,event_volume_per_hour:4000,post_event_volume_per_hour:500},
    funnel:{stage},
  };
  return {contract:'TEST-USDT',snapshot_id:'RUN-TEST-1',status:'OK',newest_event:ev,spot_perp_basis:{status:'OK',htx_basis_pct:-0.2}};
}
const input={contract:'TEST-USDT',funding:funding(),external_hourly:external(),primary:{one_minute:minuteCandles()}};
const oppProof = provenOpportunity('LONG');

let operationalPrior=null, bridgePrior=null;
const steps=[
  {at:NOW-2*M, stage:'EARLY_WATCH', ret:1},
  {at:NOW-M, stage:'EARLY_WATCH', ret:1.1},
  {at:NOW, stage:'ENTRY_TRIGGER_SHADOW', ret:1.2},
];
let current, bridgeResult;
for (const step of steps) {
  current=buildMultiWaveCampaignShadow({opportunity:mwOpportunity(step.stage,step.ret),input,prior_campaign:operationalPrior,now:step.at});
  assert.equal(current.status,'SHADOW_CAMPAIGN_EVALUATED');
  bridgeResult=buildMultiWaveDecisionBridge({
    multi_wave_result:current,
    opportunity:oppProof,
    prior_bridge:bridgePrior,
    prior_operational_campaign:operationalPrior,
    snapshot_id:'RUN-TEST-1',
    observed_ts:step.at,
    persistence_ack:{status:'CLOSED',cas_persisted:true,changes:1},
  });
  assert.equal(bridgeResult.status,'CLOSED', bridgeResult.reason);
  operationalPrior=current.campaign;
  bridgePrior=bridgeResult.bridge;
}
assert.equal(current.campaign.current_phase,'ENTRY_TRIGGER');
assert.equal(bridgePrior.campaign.current_phase,'ENTRY_TRIGGER');
assert.equal(bridgePrior.campaign.state_revision,4);
assert.equal(bridgePrior.campaign.origin_episode_id,'EP:TEST:1');
assert.equal(bridgePrior.campaign.wave_facts_immutable,true);
assert.equal(bridgePrior.campaign.cas_persisted,true);
assert.equal(bridgePrior.campaign.transition_history.length,3);
assert.equal(bridgePrior.campaign.wave_ledger.length,1);
assert.equal(bridgePrior.campaign.wave_ledger[0].entry_observation_id,bridgePrior.campaign.transition_history[2].observation_id);

const proven=completeInput('LONG');
const evaluated=evaluateFinalDecisionUpstreamCompatibility({
  contract_code:proven.contract_code,
  snapshot_id:proven.snapshot_id,
  observed_ts:NOW,
  full_evidence:proven.full_evidence,
  opportunity:proven.opportunity,
  multi_wave:bridgePrior,
  decision_evidence:proven.decision_evidence,
  evidence_registry:proven.evidence_registry,
  hard_veto:proven.hard_veto,
  execution_gate:proven.execution_gate,
  safety_gate_receipt:proven.safety_gate_receipt,
  position:proven.position,
});
assert.equal(evaluated.status,'READY_FOR_FINAL_DECISION_SHADOW', JSON.stringify(evaluated.findings));
assert.equal(evaluated.decision.entry_action,'SHADOW_ENTRY_ELIGIBLE');

const legacy=buildMultiWaveDecisionBridge({
  multi_wave_result:current,
  opportunity:oppProof,
  prior_bridge:null,
  prior_operational_campaign:operationalPrior,
  snapshot_id:'RUN-TEST-1',observed_ts:NOW,
  persistence_ack:{status:'CLOSED',cas_persisted:true,changes:1},
});
assert.equal(legacy.status,'LEGACY_UNPROVEN');



// A stored bridge is not trusted by shape: digest and operational identity are
// re-verified before it can seed the next state transition.
assert.equal(verifyStoredMultiWaveDecisionBridge(bridgePrior).ok, true);
{
  const tampered = structuredClone(bridgePrior);
  tampered.campaign.wave_index += 1;
  const checked = verifyStoredMultiWaveDecisionBridge(tampered);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'STORED_CAMPAIGN_CONTENT_DIGEST_MISMATCH');
  const resealAttempt = buildMultiWaveDecisionBridge({
    multi_wave_result: current,
    opportunity: oppProof,
    prior_bridge: tampered,
    snapshot_id: 'RUN-TEST-1',
    observed_ts: NOW,
    persistence_ack: {status:'CLOSED',cas_persisted:true,changes:1},
  });
  assert.equal(resealAttempt.status, 'FAIL_CLOSED');
  assert.match(resealAttempt.reason, /^PRIOR_CAMPAIGN_RECEIPT_INVALID:/);
}

// Operational state cannot drift away from the immutable campaign identity.
{
  const drifted = structuredClone(current);
  drifted.campaign.contract_code = 'OTHER-USDT';
  const driftAttempt = buildMultiWaveDecisionBridge({
    multi_wave_result: drifted,
    opportunity: oppProof,
    prior_bridge: bridgePrior,
    snapshot_id: 'RUN-TEST-1',
    observed_ts: NOW,
    persistence_ack: {status:'CLOSED',cas_persisted:true,changes:1},
  });
  assert.equal(driftAttempt.status, 'FAIL_CLOSED');
  assert.equal(driftAttempt.reason, 'CAMPAIGN_OPERATIONAL_IDENTITY_MISMATCH');
}

// A later call may never move the proven observation clock backwards.
{
  const regressed = structuredClone(current);
  regressed.campaign.last_observed_ts = bridgePrior.campaign.last_observed_ts - 1;
  const regressionAttempt = buildMultiWaveDecisionBridge({
    multi_wave_result: regressed,
    opportunity: oppProof,
    prior_bridge: bridgePrior,
    snapshot_id: 'RUN-TEST-1',
    observed_ts: NOW,
    persistence_ack: {status:'CLOSED',cas_persisted:true,changes:1},
  });
  assert.equal(regressionAttempt.status, 'FAIL_CLOSED');
  assert.equal(regressionAttempt.reason, 'OBSERVATION_TIME_REGRESSION');
}



// The D1 read path independently verifies the stored receipt before returning
// an operational campaign. A corrupted row must fail closed on read.
{
  function rowFor(bridge) {
    const c = current.campaign;
    return {
      campaign_id: c.campaign_id,
      contract_code: c.contract_code,
      campaign_start: c.campaign_start,
      current_phase: c.current_phase,
      direction: c.direction,
      direction_at_detection: c.direction_at_detection,
      direction_confidence_at_detection: c.direction_confidence_at_detection,
      wave_index: c.wave_index,
      completed_wave_count: c.completed_wave_count,
      last_observed_ts: c.last_observed_ts,
      campaign_json: JSON.stringify(c),
      stage392_proof_bundle_json: JSON.stringify({campaign_bridge: bridge}),
      position_state: null,
    };
  }
  function envFor(row) {
    return { DATA_DB: { prepare() { return { bind() { return { async first() { return row; } }; } }; } } };
  }
  const loaded = await loadActiveCampaign(envFor(rowFor(bridgePrior)), 'TEST-USDT');
  assert.equal(loaded.campaign_id, current.campaign.campaign_id);

  const corrupt = structuredClone(bridgePrior);
  corrupt.campaign.completed_wave_count += 1;
  await assert.rejects(
    () => loadActiveCampaign(envFor(rowFor(corrupt)), 'TEST-USDT'),
    /STAGE392_STORED_CAMPAIGN_RECEIPT_INVALID:STORED_CAMPAIGN_CONTENT_DIGEST_MISMATCH/,
  );
}

const noCas=buildMultiWaveDecisionBridge({
  multi_wave_result:current, opportunity:oppProof, prior_bridge:bridgePrior,
  prior_operational_campaign:operationalPrior, snapshot_id:'RUN-TEST-1', observed_ts:NOW,
  persistence_ack:{status:'CLOSED',cas_persisted:false,changes:1},
});
assert.equal(noCas.status,'FAIL_CLOSED');

console.log(JSON.stringify({ok:true,suite:'multi-wave-decision-bridge-producer',phase:bridgePrior.campaign.current_phase,state_revision:bridgePrior.campaign.state_revision,final_status:evaluated.status,entry:evaluated.decision.entry_action,legacy:legacy.status,no_cas:noCas.status},null,2));
