import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareHtxExecutionFacts } from '../src/tz101-execution-facts.mjs';
import { produceTz101HardVeto } from '../src/tz101-hard-veto-producer.mjs';
import { buildSafetyGateSnapshot } from '../src/stage392-proof-runtime.mjs';
import { fullEvidence, NOW, CONTRACT, SNAPSHOT } from './final-decision-integration-fixtures.mjs';

const RECEIPT='SGR:R5:TEST';
function raw({status=1,bids=[[100,20],[99,30]],asks=[[101,20],[102,30]],received=NOW}={}) {
  return {
    contract_code:CONTRACT,requested_notional_usdt:1000,received_ts:received,
    info_response:{ok:true,data:{status:'ok',ts:received-2000,data:[{contract_code:CONTRACT,contract_size:1,price_tick:1,contract_status:status}]}},
    depth_response:{ok:true,data:{status:'ok',ch:`market.${CONTRACT}.depth.step0`,ts:received-600,tick:{ts:received-1000,bids,asks}}},
  };
}
const prepared=(opts={})=>prepareHtxExecutionFacts(raw(opts));
function produce({full=fullEvidence(),execution=prepared(),observed=NOW}={}) {
  return produceTz101HardVeto({contract_code:CONTRACT,snapshot_id:SNAPSHOT,observed_ts:observed,
    safety_gate_receipt_id:RECEIPT,full_evidence_record:full,execution_snapshot:execution});
}

test('closed producer-owned safety scope becomes authoritative CLEAR while other entry gates stay separate',()=>{
  const v=produce();
  assert.equal(v.status,'CLEAR');assert.equal(v.authoritative,true);
  assert.equal(v.producer_owned_status,'CLEAR');assert.equal(v.producer_owned_assessment_complete,true);
  assert.deepEqual(v.reasons,[]);assert.deepEqual(v.unknown_reasons,[]);
  assert.ok(v.non_owned_entry_gates.includes('SCENARIO_REQUIRED_EVIDENCE'));
  assert.ok(v.non_owned_entry_gates.includes('REALISTIC_TARGET_RISK_ALL_COSTS'));
  assert.equal(v.semantics,'AUTHORITATIVE_SAFETY_VETO_SCOPE_CLEAR_OTHER_DECISION_AND_PUBLICATION_GATES_REMAIN_SEPARATE');
});

test('missing or partial ENTRY-CRITICAL data remains UNKNOWN rather than CLEAR or VETO',()=>{
  assert.equal(produce({full:null}).status,'UNKNOWN');
  const f=fullEvidence();f.data_quality={...f.data_quality,status:'PARTIAL',not_closed_items:1};
  f.chain_status.MARKET_STRENGTH_SPOT={...f.chain_status.MARKET_STRENGTH_SPOT,chain_closed:false};
  const v=produce({full:f});assert.equal(v.status,'UNKNOWN');assert.equal(v.authoritative,false);
  assert.ok(v.unknown_reasons.includes('ENTRY_CRITICAL_DATA_CHAINS_NOT_CLOSED'));
});

test('supporting weighted gap stays visible but does not become a hard veto',()=>{
  const f=fullEvidence();f.missing_weighted_chains=['SMART_MONEY_ONCHAIN'];f.data_quality={...f.data_quality,status:'PARTIAL'};
  const v=produce({full:f});assert.equal(v.status,'CLEAR');assert.equal(v.authoritative,true);assert.equal(v.producer_owned_status,'CLEAR');
  const c=v.checks.find(x=>x.name==='MANDATORY_WEIGHTED_DATA_BLOCKS');assert.deepEqual(c.detail.supporting_uncertainty,['SMART_MONEY_ONCHAIN']);
});

test('entry-critical weighted gap remains UNKNOWN and blocks safety clearance',()=>{
  const f=fullEvidence();f.missing_weighted_chains=['CROSS_EXCHANGE_DERIVATIVES'];
  f.chain_status.CROSS_EXCHANGE_DERIVATIVES={...f.chain_status.CROSS_EXCHANGE_DERIVATIVES,chain_closed:false};
  f.data_quality={...f.data_quality,status:'PARTIAL'};
  const v=produce({full:f});assert.equal(v.status,'UNKNOWN');
  assert.ok(v.unknown_reasons.includes('ENTRY_CRITICAL_WEIGHTED_DATA_BLOCKS_NOT_CLOSED'));
});

test('unresolved factual conflict is an authoritative VETO',()=>{
  const f=fullEvidence();f.conflicts=[{unresolved:true,metric:'x'}];
  f.data_quality={...f.data_quality,status:'PARTIAL',unresolved_conflicts:1};
  const v=produce({full:f});assert.equal(v.status,'VETO');assert.equal(v.authoritative,true);
  assert.ok(v.reasons.includes('UNRESOLVED_CRITICAL_DATA_CONFLICT'));
});

test('strictly proven HTX non-trading state is an authoritative VETO',()=>{
  const nonTrading=prepared({status:3});
  assert.equal(nonTrading.reasons[0],'HTX_CONTRACT_NOT_TRADING');
  const v=produce({execution:nonTrading});assert.equal(v.status,'VETO');assert.equal(v.authoritative,true);
  assert.ok(v.reasons.includes('HTX_CONTRACT_NOT_TRADING'));
});

test('stale/malformed execution source is UNKNOWN, not invented VETO',()=>{
  const stale=prepared();
  const v=produce({execution:stale,observed:NOW+15_001});
  assert.equal(v.status,'UNKNOWN');assert.equal(v.authoritative,false);
});

test('one executable direction closes owned execution check and safety veto scope is CLEAR',()=>{
  const ex=prepared({bids:[[100,9]],asks:[[101,10]]});
  assert.equal(ex.plans.LONG.status,'CLOSED');assert.equal(ex.plans.SHORT.status,'NOT_CLOSED');
  const v=produce({execution:ex});assert.equal(v.status,'CLEAR');assert.equal(v.authoritative,true);assert.equal(v.producer_owned_status,'CLEAR');
  const cap=v.checks.find(c=>c.name==='REFERENCE_SIZE_EXECUTABILITY');
  assert.deepEqual(cap.detail.closed_directions,['LONG']);
});

test('neither direction executable at reference size is VETO for this analytical size',()=>{
  const ex=prepared({bids:[[100,1]],asks:[[101,1]]});
  assert.equal(ex.plans.LONG.check,'REFUTED');assert.equal(ex.plans.SHORT.check,'REFUTED');
  const v=produce({execution:ex});assert.equal(v.status,'VETO');
  assert.ok(v.reasons.includes('REFERENCE_SIZE_NOT_EXECUTABLE_IN_EITHER_DIRECTION'));
});

test('funding/OI/score/portfolio decorations cannot change hard-veto result',()=>{
  const f=fullEvidence();const ex=prepared();const expected=produce({full:f,execution:ex});
  for(const funding of [-1,0,1,null]) {
    const decorated=structuredClone(f);decorated.funding=funding;decorated.oi=1e99;decorated.score=100;
    decorated.portfolio={state:'FLAT',quantity:999};
    assert.deepEqual(produce({full:decorated,execution:ex}),expected);
  }
});

test('safety snapshot links authoritative hard-veto to immutable receipt but keeps other gates separate',()=>{
  const s=buildSafetyGateSnapshot({contract_code:CONTRACT,snapshot_id:SNAPSHOT,observed_ts:NOW,committed_ts:NOW,
    full_evidence_record:fullEvidence(),shadow_decision:{eq:{status:'SHADOW_MEASURABLE'}},execution_snapshot:prepared()});
  assert.equal(s.hard_veto.status,'CLEAR');assert.equal(s.hard_veto.authoritative,true);assert.equal(s.hard_veto.producer_owned_status,'CLEAR');
  assert.equal(s.hard_veto.safety_gate_receipt_id,s.receipt.receipt_id);
  assert.equal(s.hard_veto.partial_execution_assessment.full_hard_veto_assessment_complete,false);
  assert.equal(s.hard_veto.partial_execution_assessment.producer_owned_hard_veto_assessment_complete,true);
  assert.equal(s.execution_gate.costs_checked,false);
});
