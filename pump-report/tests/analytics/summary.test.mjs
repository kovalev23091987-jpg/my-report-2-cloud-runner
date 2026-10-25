import test from 'node:test';import assert from 'node:assert/strict';
import {summarizeOutcomes,PROPOSED_SAMPLE_REQUIREMENTS} from '../../analytics/summary.mjs';
const T=1800000000000,H=3600000,DAY=24*H;
// Every record here is fabricated. Even the OBSERVED category is only an
// artificial declaration for testing grouping; it is not native provenance.
function record(id,options={}){
  const o={instrument_id:options.instrument_id??'ARTIFICIAL:TEST',asset_id:options.asset_id??'ARTIFICIAL:ASSET',wave_id:options.wave_id??id,signal_id:options.signal_id??('SIGNAL:'+id),
    t0:options.t0??T-4*H,reference_price:100,rules_version:options.rules_version??'RULES_1',profile_version:'PROFILE_1',mode:options.mode??'AUTO',map_mode:options.map_mode??'NO_MAP',
    evidence_class:options.evidence_class??'ARTIFICIAL',ready:options.ready??true};
  const status=options.status??'HIT',outcome={signal_id:o.signal_id,wave_id:o.wave_id,t0:o.t0,reference_price:o.reference_price,rules_version:o.rules_version,mode:o.mode,
    map_mode:o.map_mode==='NO_MAP'?'WITHOUT_MAP':'WITH_MAP',target_price:110,deadline_ts:o.t0+4*H,status,hit_ts:status==='HIT'?o.t0+H:null,hit_interval:null,
    coverage:{complete:status!=='UNKNOWN'},reasons:status==='UNKNOWN'?['INSUFFICIENT_HISTORY_COVERAGE']:[]};
  return {record_id:id,recorded_ts:options.recorded_ts??T,origin:o,publication:{state:options.publication??'UNSENT',message_id:options.publication==='SENT'?'123':null,
    receipt_ref:options.publication==='SENT'?'ARTIFICIAL_SAVED_RECEIPT':null},outcome:options.no_outcome?null:outcome};
}
const summarize=rows=>summarizeOutcomes(rows,{as_of_ts:T});
test('explicit mature denominators keep HIT/MISS/UNKNOWN separate without a percentage',()=>{
  const a=summarize([record('H'),record('M',{status:'MISS'}),record('U',{status:'UNKNOWN'})]);
  assert.deepEqual(a.mature_outcomes,{hit:1,miss:1,unknown:1});assert.equal(a.denominators.mature_waves,3);assert.equal(a.denominators.resolved_mature_waves,2);
  assert.equal(a.gapped_mature_waves,1);assert.equal(a.success_rate_pct,null);assert.equal(a.probability.value_pct,null);assert.match(a.status_text_ru,/UNKNOWN 1/);
});
test('record replays and wave updates are not independent wins, and later UNKNOWN does not erase HIT',()=>{
  const a=record('A',{wave_id:'W',signal_id:'S',status:'UNKNOWN',recorded_ts:T-2}),b=record('B',{wave_id:'W',signal_id:'S',recorded_ts:T-1}),c=record('C',{wave_id:'W',signal_id:'S',status:'UNKNOWN'});
  const q=summarize([a,a,b,c]);assert.equal(q.independent_waves,1);assert.equal(q.mature_outcomes.hit,1);assert.equal(q.duplicate_record_replays,1);assert.equal(q.wave_update_snapshots_collapsed,2);
});
test('AUTO/MANUAL, SENT/UNSENT/UNKNOWN and full/partial/no map are distinct cohorts',()=>{
  const rows=[];for(const mode of ['AUTO','MANUAL'])for(const publication of ['SENT','UNSENT','UNKNOWN'])for(const map_mode of ['MAP','PARTIAL_MAP','NO_MAP'])rows.push(record(mode+publication+map_mode,{mode,publication,map_mode}));
  const q=summarize(rows);assert.equal(q.cohorts.length,18);assert.equal(q.independent_waves,18);assert.deepEqual(q.publication_counts,{sent:6,unsent:6,unknown:6});
  for(const c of q.cohorts){assert.equal(c.independent_waves,1);assert.equal(c.readiness.probability.value_pct,null);}
});
test('unbound SENT stays unknown delivery instead of becoming sent or unsent',()=>{
  const r=record('S',{publication:'SENT'});r.publication.receipt_ref=null;
  const q=summarize([r]);assert.equal(q.publication_counts.sent,0);assert.equal(q.publication_counts.unsent,0);assert.equal(q.publication_counts.unknown,1);assert.equal(q.reason_counts.SENT_RECEIPT_NOT_BOUND,1);
});
test('early HIT is known but cannot bias the mature denominator before four hours',()=>{
  const r=record('E',{t0:T-H}),q=summarize([r]);assert.equal(q.outcomes.hit,1);assert.equal(q.pending_known_hits,1);assert.equal(q.mature_waves,0);assert.equal(q.denominators.resolved_mature_waves,0);
});
test('future knowledge is excluded even when it would turn an unknown result into a win',()=>{
  const a=record('A',{wave_id:'W',signal_id:'S',status:'UNKNOWN'}),b=record('B',{wave_id:'W',signal_id:'S',recorded_ts:T+1});
  const q=summarize([a,b]);assert.equal(q.excluded_future_records,1);assert.equal(q.outcomes.hit,0);assert.equal(q.outcomes.unknown,1);
});
test('contradictory HIT and complete MISS censor one wave instead of selecting the winner',()=>{
  const a=record('A',{wave_id:'W',signal_id:'S'}),b=record('B',{wave_id:'W',signal_id:'S',status:'MISS'}),q=summarize([a,b]);
  assert.equal(q.independent_waves,1);assert.equal(q.outcome_conflict_waves,1);assert.deepEqual(q.outcomes,{hit:0,miss:0,unknown:1});assert.equal(q.denominators.resolved_mature_waves,0);
});
test('changing the initial map or origin on a wave update cannot rewrite its cohort retrospectively',()=>{
  const a=record('A',{wave_id:'W',signal_id:'S'}),b=record('B',{wave_id:'W',signal_id:'S',map_mode:'MAP'}),q=summarize([a,b]);
  assert.equal(q.independent_waves,1);assert.equal(q.origin_conflict_waves,1);assert.equal(q.outcomes.unknown,1);assert.equal(q.outcomes.hit,0);
});
test('wrong event target or horizon is not silently accepted as the new +10%/4h event',()=>{
  const a=record('A');a.outcome.target_price=105;const b=record('B');b.outcome.deadline_ts++;
  const q=summarize([a,b]);assert.equal(q.invalid_records,2);assert.equal(q.outcomes.hit,0);assert.equal(q.mature_outcomes.unknown,2);
});
test('MISS needs a finished original horizon and sufficient coverage',()=>{
  const a=record('A',{status:'MISS'});a.outcome.coverage.complete=false;
  const b=record('B',{status:'MISS',t0:T-H});const q=summarize([a,b]);assert.equal(q.invalid_records,2);assert.equal(q.outcomes.miss,0);assert.equal(q.pending_waves,1);
});
test('a HIT without a contained point or candle interval is censored',()=>{
  const a=record('A');a.outcome.hit_ts=a.outcome.deadline_ts+1;
  const b=record('B');b.outcome.hit_ts=null;b.outcome.hit_interval={start_ts:b.origin.t0-1,end_ts:b.origin.t0+60000};
  const q=summarize([a,b]);assert.equal(q.outcomes.hit,0);assert.equal(q.invalid_records,2);
});
test('a contained candle interval is a valid HIT proof while gapped history stays explicit',()=>{
  const a=record('A');a.outcome.hit_ts=null;a.outcome.hit_interval={start_ts:a.origin.t0+60000,end_ts:a.origin.t0+120000};a.outcome.coverage.complete=false;
  const q=summarize([a]);assert.equal(q.outcomes.hit,1);assert.equal(q.gapped_mature_waves,1);assert.equal(q.denominators.resolved_mature_waves,1);
});
test('rejected analyses do not become unsent forecast samples',()=>{
  const q=summarize([record('NO_IDEA',{ready:false})]);assert.equal(q.excluded_non_ready_records,1);assert.equal(q.independent_waves,0);
});
test('instruments namespace wave identity without relying on ticker text',()=>{
  const q=summarize([record('A',{wave_id:'SAME',instrument_id:'A'}),record('B',{wave_id:'SAME',instrument_id:'B'})]);assert.equal(q.independent_waves,2);
});
test('a synthetic population meeting proposed floors still publishes neither probability nor success percentage',()=>{
  const rows=Array.from({length:300},(_,i)=>record('W'+i,{instrument_id:'INSTRUMENT'+i%20,asset_id:'ASSET'+i%20,t0:T-(15+i%14)*DAY,evidence_class:'OBSERVED'})),q=summarize(rows),r=q.cohorts[0].readiness;
  assert.deepEqual(r.requirements,PROPOSED_SAMPLE_REQUIREMENTS);assert.equal(r.sample_floor_met,true);assert.equal(r.temporal_holdout_wave_keys.length,100);assert.equal(r.training_wave_keys.length,200);
  assert.equal(new Set([...r.temporal_holdout_wave_keys,...r.training_wave_keys]).size,300);assert.equal(r.calibration_validated,false);assert.equal(r.publication_allowed,false);assert.equal(r.probability.value_pct,null);assert.equal(q.success_rate_pct,null);assert.equal(q.external_provenance_authenticated,false);
});
test('sample sufficiency cannot be borrowed from a different map regime',()=>{
  const rows=Array.from({length:300},(_,i)=>record('W'+i,{instrument_id:'INSTRUMENT'+i%20,asset_id:'ASSET'+i%20,t0:T-(15+i%14)*DAY,evidence_class:'OBSERVED',map_mode:i%2?'MAP':'NO_MAP'}));
  const q=summarize(rows);assert.equal(q.cohorts.length,2);assert.ok(q.cohorts.every(c=>c.readiness.sample_floor_met===false));assert.ok(q.cohorts.every(c=>c.readiness.probability.value_pct===null));
});
test('controlled and backfilled populations remain separate from observed populations',()=>{
  const q=summarize(['ARTIFICIAL','BACKFILLED','OBSERVED','UNCLASSIFIED'].map(e=>record(e,{evidence_class:e})));
  assert.equal(q.cohorts.length,4);for(const c of q.cohorts.filter(c=>c.evidence_class!=='OBSERVED'))assert.ok(c.readiness.blockers.includes('NON_OBSERVED_COHORT_NOT_NATIVE_CALIBRATION'));
});
test('an immutable record ID with conflicting bodies cannot create two favorable records',()=>{
  const a=record('SAME'),b=record('SAME',{status:'MISS'}),q=summarize([a,b]);assert.equal(q.independent_waves,1);assert.equal(q.outcomes.unknown,1);assert.equal(q.outcomes.hit,0);assert.equal(q.invalid_records,2);
});
test('later confirmed delivery resolves uncertainty without creating another wave',()=>{
  const a=record('A',{wave_id:'W',signal_id:'S',publication:'UNKNOWN',recorded_ts:T-1}),b=record('B',{wave_id:'W',signal_id:'S',publication:'SENT'}),q=summarize([a,b]);
  assert.equal(q.independent_waves,1);assert.deepEqual(q.publication_counts,{sent:1,unsent:0,unknown:0});assert.equal(q.cohorts.length,1);
});
test('rule and profile groups never pool automatically',()=>{
  const q=summarize([record('A'),record('B',{rules_version:'RULES_2'})]);assert.equal(q.cohorts.length,2);assert.equal(q.probability.value_pct,null);
});
test('missing future outcome remains mature UNKNOWN with explicit denominator and reason',()=>{
  const q=summarize([record('A',{no_outcome:true})]);assert.equal(q.mature_outcomes.unknown,1);assert.equal(q.reason_counts.OUTCOME_NOT_AVAILABLE,1);assert.equal(q.denominators.resolved_mature_waves,0);
});
test('summary is deterministic, pure and requires an explicit time rather than a system clock',()=>{
  const rows=[record('A')],before=JSON.stringify(rows),a=summarize(rows);assert.deepEqual(summarize(rows),a);assert.equal(JSON.stringify(rows),before);
  assert.throws(()=>summarizeOutcomes(rows),/SUMMARY_AS_OF_REQUIRED/);assert.throws(()=>summarizeOutcomes(rows,{as_of_ts:T,sample_requirements:{assets:0}}),/REQUIREMENTS_INVALID/);
});
test('one instrument cannot manufacture the required asset diversity by changing asset labels',()=>{
  const q=summarize([record('A',{asset_id:'A'}),record('B',{asset_id:'B'})]);assert.equal(q.identity_conflict_waves,2);assert.equal(q.outcomes.hit,0);assert.equal(q.outcomes.unknown,2);
});
test('NON_NATIVE first-run records cannot qualify for an observed calibration sample',()=>{
  const q=summarize([record('A',{evidence_class:'NON_NATIVE'})]);assert.equal(q.cohorts[0].evidence_class,'NON_NATIVE');assert.ok(q.cohorts[0].readiness.blockers.includes('NON_OBSERVED_COHORT_NOT_NATIVE_CALIBRATION'));assert.equal(q.probability.value_pct,null);
});
test('an unknown conflicting outcome is not falsely labelled a history gap',()=>{
  const a=record('A',{wave_id:'W',signal_id:'S'}),b=record('B',{wave_id:'W',signal_id:'S',status:'MISS'}),q=summarize([a,b]);
  assert.equal(q.outcomes.unknown,1);assert.equal(q.gapped_mature_waves,0);assert.equal(q.coverage_unknown_mature_waves,0);
  const missing=summarize([record('NO_HISTORY',{no_outcome:true})]);assert.equal(missing.coverage_unknown_mature_waves,1);assert.equal(missing.gapped_mature_waves,0);
});
