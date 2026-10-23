import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../observer/observer.mjs';
import {fixture} from '../observer/fixtures.mjs';
import {commitOutcomePlan,evaluateOutcome,summarizeOutcomes} from './outcomes.mjs';
function inputs(){const c=fixture().result.events[0],p=commitOutcomePlan(c,{committed_ts:c.first_known_ts,anchor:{instrument:c.instrument,price:100,source_ts:c.first_known_ts-1,received_ts:c.first_known_ts,raw_sha256:hash('CONTROLLED:KNOWN'),raw_ref:'CONTROLLED:KNOWN'},horizons:['1h']}),points=Array.from({length:12},(_,n)=>({instrument:c.instrument,price:100,source_ts:c.first_known_ts+(n+1)*300000,received_ts:c.first_known_ts+(n+1)*300000+1,raw_sha256:hash({n}),raw_ref:'CONTROLLED:'+n}));return{c,p,points};}
function outputs(){const {c,p,points}=inputs(),run=(as_of_ts,points)=>evaluateOutcome(p,{direction:'LONG',horizon:'1h',points,as_of_ts});return{c,p,points,pending:run(c.first_known_ts+1,[]),censored:run(c.first_known_ts+3600001,[]),complete:run(c.first_known_ts+3600001,points)};}
function rewrite(o,patch={},omit=[]){const {outcome_hash,...body}=o,b={...body,...patch};for(const k of omit)delete b[k];return{...b,outcome_hash:hash(b)};}
function rejected(o,reason){const s=summarizeOutcomes([o]);assert.equal(s.invalid_rows,1);assert.equal(s.total_unique_event_cells,0);assert.deepEqual(s.cells,[]);if(reason)assert.equal(s.invalid_row_reason_counts[reason],1);assert.equal(s.empirical_predictive_accuracy,null);assert.equal(s.weights_changed,false);return s;}

test('self-consistent digest with missing or malformed instrument is counted invalid instead of crashing',()=>{
 const {pending}=outputs();for(const o of[rewrite(pending,{},['instrument']),rewrite(pending,{instrument:null}),rewrite(pending,{instrument:{}}),rewrite(pending,{instrument:{...pending.instrument,asset_id:''}})])assert.doesNotThrow(()=>rejected(o,'OUTCOME_IDENTITY_INVALID'));
});
test('self-consistent premature terminal label cannot count as success before its target',()=>{
 const {pending}=outputs(),o=rewrite(pending,{status:'SUCCESSFUL',complete:true});assert.equal(o.outcome_hash,hash((({outcome_hash,...body})=>body)(o)));assert(o.as_of_ts<o.target_ts);rejected(o,'OUTCOME_NOT_MATURE');
});
test('producer rejects as-of before firstknown while preserving the immutable plan and input path',()=>{
 const {c,p,points}=inputs(),before=JSON.stringify({p,points});assert.throws(()=>evaluateOutcome(p,{direction:'LONG',horizon:'1h',points,as_of_ts:c.first_known_ts-1}),/OUTCOME_ARGUMENTS/);assert.equal(JSON.stringify({p,points}),before);
});
test('typed cell identity and exact firstknown/horizon clock binding fail closed without negative outcomes',()=>{
 const {pending}=outputs();for(const patch of[{schema:'FOREIGN_SCHEMA'},{plan_hash:''},{card_hash:''},{cohort:'REAL_PROVEN'},{direction:'UP'},{horizon:'UNKNOWN'},{timeframe:'2h'},{target_ts:pending.target_ts+1},{as_of_ts:pending.first_known_ts-1},{first_known_ts:'1700000000000'}])rejected(rewrite(pending,patch));
});
test('pending, censored, unknown status and unqualified native scope cannot masquerade as complete',()=>{
 const {pending,censored}=outputs();for(const o of[rewrite(pending,{complete:true}),rewrite(pending,{as_of_ts:pending.target_ts}),rewrite(censored,{complete:true}),rewrite(censored,{status:'UNSUPPORTED'}),rewrite(censored,{external_native_commit_ACK_qualified:true}),rewrite(censored,{not_executed_profit:false})])rejected(o);
});
test('complete snapshot requires typed metrics, observed endpoint and causally ordered passage facts',()=>{
 const {complete}=outputs();for(const patch of[{samples:0},{samples:'12'},{directional_return_pct:null},{sampled_mfe_pct:-1},{sampled_mae_pct:1},{actual_end_source_ts:complete.target_ts+1},{endpoint_lag_ms:1},{favorable_first_observed_ts:complete.target_ts+1},{status:'SUCCESSFUL'}])rejected(rewrite(complete,patch));
});
test('all valid producer result shapes still summarize and malformed neighbors cannot increase their denominator',()=>{
 const {pending,censored,complete}=outputs();for(const [o,key]of[[pending,'pending'],[censored,'censored'],[complete,'complete']]){const before=JSON.stringify(o),s=summarizeOutcomes([o,rewrite(o,{},['instrument'])]);assert.equal(s.invalid_rows,1);assert.equal(s.total_unique_event_cells,1);assert.equal(s.cells[0][key],1);assert.equal(s.cells[0].total_events,1);assert.equal(JSON.stringify(o),before);assert.equal(s.empirical_predictive_accuracy,null);}
});
test('blank identity or event labels cannot create a summary population from a recomputed digest',()=>{
 const {pending}=outputs();rejected(rewrite(pending,{event_id:' '}),'OUTCOME_SCHEMA_INVALID');for(const key of['asset_id','venue','upstream','contract','quote','price_unit','volume_unit','binding_ref'])rejected(rewrite(pending,{instrument:{...pending.instrument,[key]:' \t'}}),'OUTCOME_IDENTITY_INVALID');
});
test('nonscalar cell keys reject before JavaScript property-key coercion can crash the summary',()=>{
 const {pending}=outputs();for(const key of['timeframe','horizon'])for(const value of[{}, {toString:null}, [],12,null])assert.doesNotThrow(()=>rejected(rewrite(pending,{[key]:value}),'OUTCOME_COHORT_CELL_INVALID'));
});
