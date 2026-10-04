import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditCanonicalBlockDecisionUse} from '../files/src/block-decision-use-audit.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-use-input-20261004.json',import.meta.url)));
const saved=JSON.parse(fs.readFileSync(new URL('../../checkpoints/main-all15-live-audit-20261004.json',import.meta.url)));
function canonical(){const c=structuredClone(fixture.canonical);c.metadata.internal_market_context.evidence_v2.block_coverage=saved.candidates[0].block_coverage;return c;}

test('same actual BTW snapshot separates four eligible facts from zero applied score blocks',()=>{
 const c=canonical(),before=JSON.stringify(c),r=auditCanonicalBlockDecisionUse(c);
 assert.equal(r.checked_block_count,15);assert.equal(r.directional_eligible_block_count,3);
 assert.equal(r.score_status,'BASE_SCORE_MISSING');assert.equal(r.score_applied_block_count,0);
 assert.equal(r.blocks.N15.score_application_status,'NO_BASE_SCORE_NO_APPLICATION');
 assert.equal(r.blocks.N09.score_application_status,'VALID_CONTEXT_NO_SCORE_EFFECT');
 assert.equal(r.blocks.N10.score_application_status,'CONTROL_CHECK_APPLICATION_NOT_PROVEN');
 assert.equal(r.all_blocks_have_proven_decision_effect,false);
 assert.equal(JSON.stringify(c),before);assert.equal(Object.keys(r.blocks).length,15);
 assert.equal(r.blocks.N13,undefined);assert.equal(r.blocks.N17,undefined);
});
test('assigned consumer, HTTP checks or forged unbound score receipts cannot prove use',()=>{
 const c=canonical();c.direction='LONG';c.metadata.supplemental_score_adjustment={status:'CLOSED',base_score:70,final_score:70,receipts:[{source_id:'EVIDENCE_V2',provider_object_id:'UNKNOWN',score_contribution:0.1}]};
 assert.equal(auditCanonicalBlockDecisionUse(c).score_applied_block_count,0);
 const e=c.metadata.internal_market_context.evidence_v2.evidence.find(row=>row.block_id==='N15');
 c.metadata.supplemental_score_adjustment.receipts=[{source_id:'EVIDENCE_V2',provider_object_id:e.evidence_id,score_contribution:0.1,evidence_v2_receipts:[{evidence_id:e.evidence_id,block_id:'N15',reason:'CONSUMED'}]}];
 assert.equal(auditCanonicalBlockDecisionUse(c).blocks.N15.score_application_status,'SCORE_APPLICATION_PROVEN');
 e.htx_contract='OTHER-USDT';assert.equal(auditCanonicalBlockDecisionUse(c).score_applied_block_count,0);
});
test('stale real evidence, null direction and missing final score remain unproven',()=>{
 for(const change of [c=>{c.metadata.internal_market_context.decision_ts=Date.now();},c=>{c.direction=null;},c=>{c.metadata.supplemental_score_adjustment.final_score=null;}]){
  const c=canonical(),e=c.metadata.internal_market_context.evidence_v2.evidence.find(row=>row.block_id==='N15');
  c.direction='LONG';c.metadata.supplemental_score_adjustment={status:'CLOSED',base_score:70,final_score:70,receipts:[{source_id:'EVIDENCE_V2',provider_object_id:e.evidence_id,score_contribution:0.1,evidence_v2_receipts:[{evidence_id:e.evidence_id,block_id:'N15',reason:'CONSUMED'}]}]};
  change(c);assert.equal(auditCanonicalBlockDecisionUse(c).score_applied_block_count,0);
 }
});
