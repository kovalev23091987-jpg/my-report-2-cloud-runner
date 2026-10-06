import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewBoundedMoneyFlow} from '../files/src/bounded-money-flow-diagnostic.mjs';
import {summarizeAssignedSourceUse,auditCanonicalBlockDecisionUse} from '../files/src/block-decision-use-audit.mjs';

test('shared providers and physical roots never multiply route counts into independent confirmations',()=>{
 const route={attempted:true,checked:true,actual_http:0,cache_status:'VALID_CACHE_REUSED',valid_fact_count:1,meaningful_fact_count:1,used_fact_count:1,nonzero_score_fact_count:0,provider_ids:['HTX'],used_provider_ids:['HTX'],rendered_provider_ids:['HTX'],neutral_assessed_provider_ids:['HTX'],used_declared_upstream_ids:['HTX_OFFICIAL'],used_physical_root_keys:['same-wire-reply']};
 const a=summarizeAssignedSourceUse({book:route,spread:route});
 assert.equal(a.configured_route_count,2);assert.equal(a.used_provider_count,1);assert.equal(a.validated_cache_route_count,2);assert.equal(a.live_contacted_route_count,0);assert.deepEqual(a.used_physical_root_keys,['same-wire-reply']);assert.equal(a.independence_claimed,false);assert.equal(a.control_effect_provider_count,0);
 const denied=summarizeAssignedSourceUse({missing:{...route,checked:false,actual_http:0,used_fact_count:0,provider_ids:[],used_provider_ids:[],rendered_provider_ids:[],cache_status:null}});
 assert.equal(denied.checked_without_new_http_route_count,0);assert.equal(denied.used_provider_count,0);
});

test('actual bounded BR/FIL receipts preserve unscored use and exact provider/source identities',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/actual-n12-context-37382044550.json',import.meta.url)));
 for(const item of fixture.candidates){
  const c=structuredClone(item.canonical),before=JSON.stringify(c),args={evidence:c.metadata.internal_market_context.evidence_v2.evidence,contract:c.metadata.contract,run_id:c.run_id,snapshot_id:c.snapshot_id,decision_ts:c.observed_ts};
  c.metadata.bounded_money_flow_diagnostic=reviewBoundedMoneyFlow(args);
  const audit=auditCanonicalBlockDecisionUse(c,{manual:item.manual}),a=audit.blocks.N12.source_accounting;
  assert.equal(audit.participating_block_count,1);assert.equal(audit.score_applied_block_count,0);
  assert.equal(audit.unscored_diagnostic_assessed_and_rendered_block_count,1);
  assert.deepEqual(a.used_provider_ids,['HTX_LARGE_TRADES']);assert.equal(a.used_provider_count,1);
  assert.deepEqual(a.unscored_diagnostic_provider_ids,['HTX_LARGE_TRADES']);assert.deepEqual(a.nonzero_score_provider_ids,[]);assert.deepEqual(a.neutral_assessed_provider_ids,[]);
  assert.deepEqual(a.used_declared_upstream_ids,['HTX_PUBLIC_FUTURES_TRADES']);assert.equal(a.used_physical_root_keys.length,1);
  assert.equal(a.live_contacted_route_count,1);assert.equal(a.configured_route_count,1);
  assert.equal(a.checked_without_new_http_route_count,0);assert.equal(a.control_effect_provider_count,0);
  delete c.metadata.bounded_money_flow_diagnostic;assert.equal(JSON.stringify(c),before);
 }
});
