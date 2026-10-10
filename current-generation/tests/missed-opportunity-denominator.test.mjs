import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeMissedOpportunityEvidence as summarize} from '../files/src/missed-opportunity-denominator.mjs';
const close=1791000000000,target=close+3600000,now=target+120000;
const base=()=>({horizon:'1h',source_artifact_digest:'sha256:'+'a'.repeat(64),
 event:{contract:'NEAR-USDT',episode_id:'EP1',independent_sample:true,control_group:false,control_eligible:false,event_close_ts:close,direction_at_event:'LONG',directional_evaluation_eligible:true,direction_locked_ts:close-1000,funnel:{stage:'CONFIRMATION_PENDING'}},
 decision:{contract:'NEAR-USDT',episode_id:'EP1',direction:'LONG',stage:'CONFIRMATION_PENDING',head:'b'.repeat(40),run_id:'RUN1',snapshot_id:'S1',observed_ts:close+60000},
 outcome:{status:'OK',horizon:'1h',trajectory_complete:true,target_ts:target,source_start_ts:close,source_end_ts:target,as_of_ts:target,expected_bars:60,observed_bars:60,trajectory_coverage_pct:100,direction_at_event:'LONG',direction_locked_ts:close-1000,directional_evaluation_eligible:true,mfe_pct:6,directional_return_pct:2,missed_opportunity_detected:true,late_entry_candidate:false,false_rejection_candidate:true}});
const run=rows=>summarize({rows,now_ts:now});
test('exact precommitted independent episode with full future path enters denominator once',()=>{
 const row=base(),r=run([row,row]);assert.equal(r.status,'SCOPED_PROVENANCE_BOUND_SHADOW_DENOMINATOR');
 assert.equal(r.eligible,1);assert.equal(r.missed,1);assert.equal(r.not_missed,0);assert.equal(r.duplicate_replays,1);assert.equal(r.missed_rate_pct,100);assert.equal(r.actual_ENTRY,false);
});
test('precommitted triggered shadow is not retroactively called missed',()=>{
 const row=base();row.event.funnel.stage='ENTRY_TRIGGER_SHADOW';row.decision.stage='ENTRY_TRIGGER_SHADOW';row.outcome.missed_opportunity_detected=false;row.outcome.false_rejection_candidate=false;
 const r=run([row]);assert.equal(r.eligible,1);assert.equal(r.not_missed,1);assert.equal(r.missed_rate_pct,0);
});
test('unproven direction, late decision, incomplete path and foreign identity are censored',()=>{
 const cases=[];
 for(const patch of [r=>r.event.directional_evaluation_eligible=false,r=>r.event.direction_locked_ts=close+1000,r=>r.decision.observed_ts=target+1,r=>r.outcome.observed_bars=59,r=>r.decision.snapshot_id='',r=>r.decision.contract='FOREIGN-USDT',r=>r.outcome.source_start_ts++,r=>r.outcome.as_of_ts=target-1]){const row=base();patch(row);row.event.episode_id='EP'+cases.length;row.decision.episode_id=row.event.episode_id;cases.push(row);}
 const r=run(cases);assert.equal(r.eligible,0);assert.equal(r.censored,cases.length);assert.equal(r.missed_rate_pct,null);
});
test('conflicting duplicate episode never contributes to denominator',()=>{
 const a=base(),b=structuredClone(a);b.outcome.mfe_pct=2;b.outcome.missed_opportunity_detected=false;b.outcome.false_rejection_candidate=false;
 const r=run([a,b]);assert.equal(r.eligible,0);assert.equal(r.conflicting_duplicates,1);assert.equal(r.censored,1);
});
test('retrospective false-rejection or missed label conflicts are censored',()=>{
 const a=base();a.outcome.missed_opportunity_detected=false;
 const b=base();b.event.episode_id='EP2';b.decision.episode_id='EP2';b.outcome.false_rejection_candidate=false;
 const r=run([a,b]);assert.equal(r.eligible,0);assert.equal(r.censored,2);
});
test('empty actual cohort cannot be reported as 0 percent misses',()=>{
 const r=run([]);assert.equal(r.status,'NO_ACTUAL_PROVEN_DIRECTIONAL_DENOMINATOR');assert.equal(r.missed_rate_pct,null);
 assert.equal(summarize({rows:[base()],now_ts:0}).status,'INVALID_BOUNDED_COHORT');
});
