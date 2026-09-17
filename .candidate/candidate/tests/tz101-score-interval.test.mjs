import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTz101ScoreInterval,BLOCKS} from '../src/tz101-score-interval.mjs';
const row=(domain,stance)=>({causal_domain:domain,stance,status:'CLOSED',eligible_for_decision:true,effect:'SUPPORT'});

test('weights remain exactly 35/30/20/15 and total 100',()=>{
 assert.deepEqual(BLOCKS.map(b=>b.weight),[35,30,20,15]);
 assert.equal(BLOCKS.reduce((s,b)=>s+b.weight,0),100);
});
test('only the two currently explicit detectors add lower-bound score',()=>{
 const s=buildTz101ScoreInterval({direction:'LONG',decision_evidence:[row('PRICE_ACTION','LONG'),row('RELATIVE_MARKET','LONG')]});
 assert.equal(s.score_lower_bound,20);assert.equal(s.score_upper_bound,100);
 assert.equal(s.status,'INCOMPLETE_REQUIRED_BLOCKS');
 assert.deepEqual(s.wholly_missing_blocks,['SMART_MONEY_ONCHAIN','SUPPORTING_RISK']);
 assert.equal(s.threshold_60_lower_bound_pass,false);assert.equal(s.threshold_70_lower_bound_pass,false);
});
test('funding/OI/score decorations cannot change interval',()=>{
 const base=[row('PRICE_ACTION','SHORT'),row('RELATIVE_MARKET','SHORT')];
 const a=buildTz101ScoreInterval({direction:'SHORT',decision_evidence:base});
 const b=buildTz101ScoreInterval({direction:'SHORT',decision_evidence:base,funding:999,oi:999,score:100});
 assert.deepEqual(a,b);
});
test('opposite evidence does not get relabelled to requested direction',()=>{
 const s=buildTz101ScoreInterval({direction:'LONG',decision_evidence:[row('PRICE_ACTION','SHORT'),row('RELATIVE_MARKET','SHORT')]});
 assert.equal(s.score_lower_bound,0);assert.equal(s.score_upper_bound,100);
});
test('unknown stays interval weight instead of zero or renormalization',()=>{
 const s=buildTz101ScoreInterval({direction:'LONG',decision_evidence:[]});
 assert.equal(s.score_lower_bound,0);assert.equal(s.score_upper_bound,100);
 assert.equal(s.safety.missing_as_zero,false);assert.equal(s.safety.renormalized_available_weight,false);
});
test('invalid direction cannot produce score',()=>{
 const s=buildTz101ScoreInterval({direction:'NEUTRAL',decision_evidence:[row('PRICE_ACTION','LONG')]});
 assert.equal(s.status,'NOT_CLOSED');assert.equal(s.score_lower_bound,null);
});
test('raw smart-money is visible but cannot add points before calibration',()=>{
 const raw={status:'CLOSED_RAW_UNCALIBRATED',score_eligible:false,directional_vote_eligible:false};
 const s=buildTz101ScoreInterval({direction:'LONG',decision_evidence:[row('PRICE_ACTION','LONG'),row('RELATIVE_MARKET','LONG')],smart_money_raw:raw});
 assert.equal(s.score_lower_bound,20);assert.equal(s.score_upper_bound,100);
 const block=s.weighted_blocks.find(b=>b.id==='SMART_MONEY_ONCHAIN');
 assert.equal(block.state,'UNKNOWN');assert.ok(block.subcriteria.every(x=>x.state==='UNKNOWN'));
 assert.ok(block.subcriteria.every(x=>x.raw_observed===true));
 assert.ok(block.subcriteria.every(x=>x.contribution_lower===0));
});
