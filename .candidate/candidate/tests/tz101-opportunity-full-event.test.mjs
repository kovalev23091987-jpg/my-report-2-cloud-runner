import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { buildOpportunityProofFromAdmissionWitness } from '../src/stage392-proof-runtime.mjs';
import { buildFinalDecisionIntegrationShadow } from '../src/final-decision-integration-engine.mjs';
import { completeInput, opportunity, NOW, SNAPSHOT } from './final-decision-integration-fixtures.mjs';
import { digest, immutableReceipt } from '../src/upstream-proof-utils.mjs';
function args(side='LONG') {
  const analysis=structuredClone(opportunity(side)), event=structuredClone(analysis.newest_event);
  event.independent_sample=true;
  event.factual_candle={open:100,high:102,low:98,close:side==='LONG'?101:99};
  return { analysis:{...analysis,newest_event:event}, witness:{event,event_id:event.event_id,
    persisted_ts:event.event_close_ts+500,control_group:false,independent_sample:true,directional_evaluation_eligible:true,
    d1_acknowledged:true,immutable_row:true,episode_revision:1,raw_event_digest:digest({episode_revision:1,event})},
    snapshot_id:SNAPSHOT,observed_ts:NOW,receipt_committed_ts:NOW-200 };
}
function engineInput(side='LONG') {
  const a=args(side), p=buildOpportunityProofFromAdmissionWitness(a);
  assert.equal(p.status,'CLOSED');
  const i=completeInput(side);i.opportunity=p.proof;
  i.campaign=immutableReceipt(i.campaign,i.campaign.persistence.receipt_id,NOW-100);
  return i;
}
function rehash(i) {i.opportunity=immutableReceipt(i.opportunity,i.opportunity.persistence.receipt_id,NOW-200);return i;}
for(const side of ['LONG','SHORT']) test(`${side}: real stage392 producer full event reaches existing opportunity gate`,()=>{
  const i=engineInput(side), o=buildFinalDecisionIntegrationShadow(i);
  assert.equal(i.opportunity.schema_version,'opportunity-integrity-shadow-v2-full-event');
  assert.equal(o.source_quality.opportunity,'CLOSED',JSON.stringify(o.reason_codes));
  assert.ok(!o.reason_codes.includes('OPPORTUNITY_RAW_EVENT_DIGEST_MISMATCH'));
  assert.equal(o.execution_authorized,false);assert.equal(o.telegram_eligible,false);
});
for(const side of ['LONG','SHORT']) test(`${side}: legacy v1 exact fixture remains accepted`,()=>{
  const i=completeInput(side), o=buildFinalDecisionIntegrationShadow(i);
  assert.equal(o.source_quality.opportunity,'CLOSED');
});
const mutations={
 'witness missing': i=>delete i.opportunity.source_event_payload,
 'witness array': i=>i.opportunity.source_event_payload=[],
 'witness revision missing': i=>delete i.opportunity.source_event_episode_revision,
 'witness revision string': i=>i.opportunity.source_event_episode_revision='1',
 'witness revision mismatches event': i=>i.opportunity.source_event_episode_revision=2,
 'raw event revision differs from witness': i=>i.opportunity.source_event_payload.episode_revision=7,
 'raw event numeric value changed': i=>i.opportunity.source_event_payload.factual_candle.close+=1,
 'proven event numeric value changed': i=>i.opportunity.newest_event.factual_candle.close+=1,
 'raw direction changed': i=>i.opportunity.source_event_payload.direction_at_event='SHORT',
 'raw directionless': i=>i.opportunity.source_event_payload.direction_at_event='DIRECTIONLESS_EVENT',
 'raw control group': i=>i.opportunity.source_event_payload.control_group=true,
 'raw independent_sample false': i=>i.opportunity.source_event_payload.independent_sample=false,
 'proven independent_sample false': i=>i.opportunity.newest_event.independent_sample=false,
 'raw wrong contract': i=>i.opportunity.source_event_payload.contract='OTHER-USDT',
 'raw wrong episode': i=>i.opportunity.source_event_payload.episode_id='OTHER',
 'raw lock changes': i=>i.opportunity.source_event_payload.direction_locked_ts+=1,
 'raw close changes': i=>i.opportunity.source_event_payload.event_close_ts+=1,
 'raw data_quality changes': i=>i.opportunity.source_event_payload.data_quality='PARTIAL',
 'raw digest replaced with legacy identity digest': i=>{
  const e=i.opportunity.newest_event,d=digest([e.event_id,e.episode_id,e.episode_revision,e.contract,e.timestamp,e.event_close_ts]);
  e.raw_event_digest=d;i.opportunity.control_group_receipt.raw_event_digest=d;i.opportunity.direction_receipt.raw_event_digest=d;
 },
 'unbounded witness': i=>i.opportunity.source_event_payload.extra='x'.repeat(65_537),
 'unsupported schema': i=>i.opportunity.schema_version='opportunity-integrity-shadow-future',
};
for(const [name,mutate] of Object.entries(mutations)) test(name,()=>{
 const i=engineInput();mutate(i);rehash(i);
 const o=buildFinalDecisionIntegrationShadow(i);
 assert.notEqual(o.source_quality.opportunity,'CLOSED',JSON.stringify(o));
 assert.notEqual(o.entry_action,'SHADOW_ENTRY_ELIGIBLE');
 assert.equal(o.execution_authorized,false);
});
test('full-event mismatch persists on exact R1 baseline (reproduced, not assumed)',async t=>{
 if(!process.env.TZ101_BASELINE_DIR) return t.skip('Baseline path is supplied by the paired runner.');
 const b=process.env.TZ101_BASELINE_DIR;
 const [producer,engine]=await Promise.all([
  import(pathToFileURL(resolve(b,'src/stage392-proof-runtime.mjs')).href),
  import(pathToFileURL(resolve(b,'src/final-decision-integration-engine.mjs')).href),
 ]);
 const old=producer.buildOpportunityProofFromAdmissionWitness(args());
 assert.equal(old.status,'CLOSED');
 const i=completeInput();i.opportunity=old.proof;i.campaign=immutableReceipt(i.campaign,i.campaign.persistence.receipt_id,NOW-100);
 const before=engine.buildFinalDecisionIntegrationShadow(i);
 assert.ok(before.reason_codes.includes('OPPORTUNITY_RAW_EVENT_DIGEST_MISMATCH'));
 const after=buildFinalDecisionIntegrationShadow(engineInput());
 assert.ok(!after.reason_codes.includes('OPPORTUNITY_RAW_EVENT_DIGEST_MISMATCH'));
 assert.equal(after.source_quality.opportunity,'CLOSED');
});
