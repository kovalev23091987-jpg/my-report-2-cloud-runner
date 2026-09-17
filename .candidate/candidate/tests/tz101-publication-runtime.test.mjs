import test from 'node:test';
import assert from 'node:assert/strict';
import { runTz101PublicationShadow } from '../src/tz101-publication-runtime.mjs';

const NOW=1_789_650_000_000;
const summary={decision_id:'FDI:AAA-USDT:1789650000000:abcdef0123456789',material_digest:'abcdef0123456789',snapshot_id:'S392:AAA-USDT:1789650000000',contract_code:'AAA-USDT',observation_ts:NOW,direction:'LONG',entry_action:'SHADOW_ENTRY_ELIGIBLE',entry_quality:'CLOSED',data_quality:'CLOSED',execution_quality:'CLOSED',independence_state:'CLOSED',timing_state:'ENTRY_WINDOW',risk_state:'CLEAR',hard_veto:false,hard_veto_state:'CLEAR',decision_evidence_receipt_id:'DER:1',full_evidence_receipt_id:'FER:1',safety_gate_receipt_id:'SGR:1'};
const persistence={status:'CLOSED',decision_inserted:true,decision_summary:summary};
const evidence=[
 {status:'CLOSED',eligible_for_decision:true,effect:'SUPPORT',stance:'LONG',causal_domain:'PRICE_ACTION'},
 {status:'CLOSED',eligible_for_decision:true,effect:'SUPPORT',stance:'LONG',causal_domain:'RELATIVE_MARKET'},
];
const trajectory={funding:{current:{funding_rate_pct:-.02},derived_settlement_interval_hours:8}};
class NoDB { prepare(){throw new Error('D1 MUST NOT BE TOUCHED');} }

test('current incomplete score/scenario/cost state stops with zero D1 statements',async()=>{
 const r=await runTz101PublicationShadow({env:{DATA_DB:new NoDB()},final_decision_persistence:persistence,decision_evidence:evidence,trajectory,trajectory_available_ts:NOW,observed_ts:NOW});
 assert.equal(r.status,'NOT_CLOSED');assert.equal(r.statements,0);assert.equal(r.score_interval.score_lower_bound,20);assert.equal(r.score_interval.score_upper_bound,100);assert.equal(r.publication_gate.status,'NOT_CLOSED');
 assert.ok(r.scenario_plan && typeof r.scenario_plan==='object');
 assert.ok(r.cost_assessment && typeof r.cost_assessment==='object');
 assert.equal(r.scenario_plan.status,'NOT_CLOSED');
 assert.equal(r.cost_assessment.status,'NOT_CLOSED');
 assert.ok(r.publication_gate.missing.some(x=>x.code==='SCENARIO_PLAN_NOT_CLOSED'));
});

test('uncommitted Final Decision cannot trigger score sidecar work',async()=>{
 const r=await runTz101PublicationShadow({env:{DATA_DB:new NoDB()},final_decision_persistence:{status:'NO_COMMIT_FAIL_CLOSED'},decision_evidence:evidence,observed_ts:NOW});
 assert.equal(r.status,'SKIPPED_FINAL_DECISION_NOT_COMMITTED');assert.equal(r.statements,0);assert.equal(r.score_interval,null);
});

test('missing funding remains explicit publication gap rather than guessed context',async()=>{
 const r=await runTz101PublicationShadow({env:{DATA_DB:new NoDB()},final_decision_persistence:persistence,decision_evidence:evidence,trajectory:{funding:{}},trajectory_available_ts:NOW,observed_ts:NOW});
 assert.equal(r.status,'NOT_CLOSED');assert.ok(r.publication_gate.missing.some(x=>x.code==='FUNDING_CONTEXT_NOT_COMPLETE'));
});
