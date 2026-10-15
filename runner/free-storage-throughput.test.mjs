import test from 'node:test';import assert from 'node:assert/strict';import {storageThroughputPlan} from './free-storage-throughput.mjs';
test('two body families and manual full reports cannot fit the existing two48 slots',()=>{
 const p=storageThroughputPlan({unknown_families:['primary_collector','hourly','control','failed_unknown']});assert.equal(p.scheduled_rows_day,144);assert.equal(p.planned_rows_day_with_manual,188);assert.equal(p.existing_max_rows_day,96);assert.equal(p.arithmetic_backlog_rows_day,92);assert.equal(p.minimum_catchup_slots_at_full48,4);assert.equal(p.existing_row_envelope_sufficient,false);assert.equal(p.sustainability_proved,false);assert.equal(p.proposal_only.owner_approval_required,true);assert.equal(p.limits_changed,false);
});
test('more nominal slots never become sustainability proof without byte growth, references and native full-day costs',()=>{
 for(const actual of [null,0,16,48]){const p=storageThroughputPlan({slots_day:4,observed_rows_slot:actual});assert.equal(p.sustainability_proved,false);assert.equal(p.automatic_activation,false);assert.equal(p.observed_max_rows_day,actual===null?null:actual*4);}
 assert.equal(storageThroughputPlan({manual_full_runs_day:0}).scheduled_rows_day,144);assert.throws(()=>storageThroughputPlan({finalists:1}));
});
