import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditCohortSample,auditPairedAnalyses,FEATURE_SCHEMA_VERSION,AUDIT_BOUNDS} from '../../analytics/cohort-audit.mjs';
import {T,MINUTE} from './fixtures.mjs';

const H=4*60*MINUTE,SPLIT=T+24*60*MINUTE,NOW=T+3*24*60*MINUTE;
const sha='a'.repeat(64);
// Typed synthetic boundary inputs only. They are never fitted forecasts or
// audit-sample estimates; public probabilities in every audit result stay null.
function record(id,t0=T,extra={}){
  const origin={instrument_id:'ARTIFICIAL:F:I',asset_id:'ARTIFICIAL:F:A',wave_id:id,signal_id:'SIG:'+id,t0,reference_price:100,rules_version:'R1',profile_version:'P1',mode:'AUTO',map_mode:'NO_MAP',evidence_class:'ARTIFICIAL',ready:true,...extra};
  const o={signal_id:origin.signal_id,wave_id:id,t0,reference_price:100,rules_version:origin.rules_version,mode:origin.mode,map_mode:origin.map_mode==='NO_MAP'?'WITHOUT_MAP':'WITH_MAP',target_price:110,deadline_ts:t0+H,status:'MISS',hit_ts:null,hit_interval:null,coverage:{complete:true},reasons:[]};
  return {record_id:id,recorded_ts:t0+H+1000,origin,publication:{state:'SENT',message_id:'123',receipt_ref:'ARTIFICIAL_RECEIPT'},outcome:o,
    audit_meta:{analysis_sha256:sha,implementation_sha256:sha,feature_schema_version:FEATURE_SCHEMA_VERSION,
      origin_anchor:{analysis_id:id,analysis_sha256:sha,origin:structuredClone(origin),immutable:true,selection:{kind:'FIRST_POSSIBLE_OR_CONFIRMED_SEND',selected_ts:t0+1,recorded_ts:t0+1}},
      features:[{name:'wave_state',value:'CALM_PULLBACK',source_event_ts:t0-1000,received_ts:t0,known_ts:t0,evidence_ref:'ARTIFICIAL_SOURCE'}],
      forecast:{value_pct:0,model_version:'ARTIFICIAL_VALIDATION_SENTINEL_NOT_A_MODEL',training_manifest_sha256:sha,created_ts:t0,training_cutoff_ts:T-2*H,trained_through_label_ts:T-2*H,
        mode:origin.mode,map_mode:origin.map_mode,rules_version:origin.rules_version,profile_version:origin.profile_version,feature_schema_version:FEATURE_SCHEMA_VERSION}}};
}
const audit=(rows,extra={})=>auditCohortSample(rows,{as_of_ts:NOW,split_plan:{split_ts:SPLIT,declared_ts:T-H,plan_ref:'ARTIFICIAL_PREDECLARED_SPLIT'},...extra});
const issues=q=>q.waves.flatMap(w=>w.issues);

test('F01 clean temporal train and holdout partitions never enable publication or estimate probability',()=>{
  const q=audit([record('TRAIN'),record('HOLDOUT',SPLIT+MINUTE)]);assert.equal(q.partitions.TRAIN,1);assert.equal(q.partitions.HOLDOUT,1);assert.equal(q.cohorts.length,1);assert.equal(q.cohorts[0].clean_holdout_wave_keys.length,1);assert.equal(q.probability_pct,null);assert.equal(q.calibration_validated,false);assert.equal(q.publication_allowed,false);assert.equal(q.external_provenance_authenticated,false);
});
test('F02 labels whose four-hour horizon crosses split are purged, including early known hits',()=>{
  const r=record('CROSS',SPLIT-H+MINUTE);r.outcome.status='HIT';r.outcome.hit_ts=r.origin.t0+MINUTE;r.recorded_ts=r.outcome.hit_ts;
  const q=audit([r]);assert.equal(q.partitions.PURGED_HORIZON_CROSSES_SPLIT,1);assert.equal(q.partitions.TRAIN,0);
});
test('F03 an ended horizon with label received after split is not usable for training',()=>{
  const r=record('LATE',SPLIT-H-MINUTE);r.recorded_ts=SPLIT+1;const q=audit([r]);assert.equal(q.partitions.PURGED_LABEL_NOT_KNOWN_AT_SPLIT,1);
});
test('F04 a wave update crossing the split remains in the original partition once',()=>{
  const r=record('W'),update={...structuredClone(r),record_id:'UPDATE',recorded_ts:SPLIT+H};const q=audit([r,update,r]);assert.equal(q.inspected_waves,1);assert.equal(q.partitions.TRAIN,1);assert.equal(q.duplicate_record_replays,1);assert.equal(q.cohorts[0].clean_train_wave_keys.length,1);
});
test('F05 post hoc split declaration is blocked even when a partition could be formed',()=>{
  const q=audit([record('W')],{split_plan:{split_ts:SPLIT,declared_ts:SPLIT+1,plan_ref:'POST_HOC'}});assert.equal(q.split_predeclared,false);assert.ok(issues(q).includes('SPLIT_NOT_PREDECLARED'));assert.equal(q.cohorts[0].clean_train_wave_keys.length,0);
});
test('F06 future received/known features cannot become original inputs',()=>{
  const r=record('W');r.audit_meta.features[0].received_ts=T+1;r.audit_meta.features[0].known_ts=T+1;assert.ok(issues(audit([r])).includes('FUTURE_FEATURE_LEAKAGE'));
});
test('F07 outcome or arbitrary post-outcome feature names are excluded despite plausible clocks',()=>{
  const r=record('W');r.audit_meta.features[0].name='outcome_hit';assert.ok(issues(audit([r])).includes('NON_INITIAL_OR_UNKNOWN_FEATURE'));
});
test('F08 null requires a reason but zero is retained as an observed value',()=>{
  const r=record('W'),f=r.audit_meta.features[0];f.name='open_interest';f.value=0;assert.equal(issues(audit([r])).length,0);f.value=null;assert.ok(issues(audit([r])).includes('FEATURE_VALUE_UNQUALIFIED'));f.absence_reason='NOT_AVAILABLE';assert.equal(issues(audit([r])).length,0);
});
test('F09 duplicate feature names and unknown feature schema fail input qualification',()=>{
  const r=record('W');r.audit_meta.features.push(structuredClone(r.audit_meta.features[0]));r.audit_meta.feature_schema_version='GUESS';const q=audit([r]);assert.ok(issues(q).includes('DUPLICATE_FEATURE_NAME'));assert.ok(issues(q).includes('FEATURE_SCHEMA_UNQUALIFIED'));
});
test('F10 changing an original feature snapshot or analysis digest on an update is quarantined',()=>{
  const r=record('W'),u=structuredClone(r);u.record_id='UPDATE';u.recorded_ts+=1000;u.audit_meta.analysis_sha256='b'.repeat(64);u.audit_meta.features[0].value='RESUMING';const q=audit([r,u]);assert.ok(issues(q).includes('IMMUTABLE_FEATURE_OR_FORECAST_CHANGED'));assert.equal(q.cohorts[0].clean_train_wave_keys.length,0);
});
test('F11 mode, map, delivery, rules, profile and implementation remain distinct cohorts',()=>{
  const rows=[record('BASE'),record('M',T,{mode:'MANUAL'}),record('MAP',T,{map_mode:'MAP'}),record('R',T,{rules_version:'R2'}),record('P',T,{profile_version:'P2'}),record('IMPL'),record('UNKNOWN')];rows[5].audit_meta.implementation_sha256='b'.repeat(64);rows[6].publication={state:'UNKNOWN'};
  const q=audit(rows);assert.equal(q.cohorts.length,7);assert.equal(q.inspected_waves,7);
});
test('F12 late forecasts, training labels from the future and map-cohort transfers are rejected',()=>{
  const r=record('W');r.audit_meta.forecast.created_ts=T+1;r.audit_meta.forecast.trained_through_label_ts=T+1;r.audit_meta.forecast.map_mode='MAP';const q=audit([r]);for(const s of ['FORECAST_AFTER_ORIGIN','FORECAST_TRAINING_LEAKAGE','FORECAST_COHORT_MISMATCH'])assert.ok(issues(q).includes(s));
});
test('F13 a holdout forecast trained past the frozen split cannot pass as out-of-time validation',()=>{
  const r=record('H',SPLIT+H);r.audit_meta.forecast.training_cutoff_ts=SPLIT+MINUTE;assert.ok(issues(audit([r])).includes('HOLDOUT_TRAINING_PAST_SPLIT'));
});
test('F14 mature UNKNOWN and not-yet-mature HIT remain outside train and mature holdout labels',()=>{
  const u=record('U');u.outcome.status='UNKNOWN';u.outcome.coverage.complete=false;
  const p=record('P',NOW-MINUTE);p.outcome.status='HIT';p.outcome.hit_ts=NOW;p.recorded_ts=NOW;
  const q=audit([u,p]);assert.equal(q.partitions.UNKNOWN,1);assert.equal(q.partitions.PENDING,1);assert.equal(q.partitions.HOLDOUT,0);
});
test('F15 future records are excluded and contradictory immutable origins cannot form a clean cohort',()=>{
  const r=record('W'),u=structuredClone(r);u.record_id='U';u.origin.reference_price=99;u.outcome=null;u.recorded_ts+=1000;
  const future=record('FUTURE',NOW+MINUTE),q=audit([r,u,future]);assert.equal(q.excluded_future_records,1);assert.ok(issues(q).includes('IMMUTABLE_ORIGIN_CHANGED'));assert.equal(q.cohorts[0].clean_train_wave_keys.length,0);
});
test('F16 OBSERVED labels and claimed hashes alone never authenticate native provenance',()=>{
  const r=record('W',T,{evidence_class:'OBSERVED'}),q=audit([r]);assert.equal(q.waves[0].native_evidence_claim,true);assert.equal(q.waves[0].external_provenance_authenticated,false);assert.equal(q.publication_allowed,false);
});
test('F17 input and feature bounds prevent unbounded offline audit work',()=>{
  assert.throws(()=>audit(Array(AUDIT_BOUNDS.records+1).fill(null)),/BOUND/);const r=record('W');r.audit_meta.features=Array(65).fill(r.audit_meta.features[0]);assert.ok(issues(audit([r])).includes('FEATURE_BOUND_EXCEEDED'));
});
test('F18 missing snapshots and forecasts in retained records stay missing, never backfilled',()=>{
  const r=record('W');delete r.audit_meta;const q=audit([r]);for(const s of ['INITIAL_FEATURE_SNAPSHOT_MISSING','NO_PRECOMMITTED_FORECAST','IMPLEMENTATION_VERSION_MISSING'])assert.ok(issues(q).includes(s));assert.equal(q.probability_pct,null);
});

const retained=JSON.parse(await readFile(new URL('../../handoffs/analytics/examples.json',import.meta.url),'utf8'));
function pair(){return {pair_id:'A_MAP_PAIR',contrast:'MAP',evidence_class:'ARTIFICIAL',baseline:{analysis:structuredClone(retained.without_map.analysis),input:structuredClone(retained.without_map.input),implementation_sha256:sha},enriched:{analysis:structuredClone(retained.with_map.analysis),input:structuredClone(retained.with_map.input),implementation_sha256:sha}};}
test('F19 retained map/no-map snapshots compare behavior on one wave without causal or numerical claims',()=>{
  const q=auditPairedAnalyses([pair()],{as_of_ts:T});assert.equal(q.qualified_pairs,1);assert.equal(q.declared_independent_waves,1);assert.equal(q.results[0].baseline_ready,true);assert.equal(q.results[0].enriched_ready,true);assert.equal(q.benefit_pct,null);assert.equal(q.causal_benefit_proven,false);
});
test('F20 adding a map obtained after the original report fails paired comparison',()=>{
  const p=pair();p.enriched.analysis.liquidations.zones_up[0].components[0].received_ts=T+1;const q=auditPairedAnalyses([p],{as_of_ts:T});assert.ok(q.results[0].issues.includes('MAP_AFTER_ORIGIN'));assert.equal(q.qualified_pairs,0);
});
test('F21 map comparisons cannot silently change mandatory facts, P0 or rules',()=>{
  const p=pair();p.enriched.input.facts.price.value+=1;p.enriched.analysis.reference_price+=1;p.enriched.analysis.rules_version='OTHER';const q=auditPairedAnalyses([p],{as_of_ts:T});assert.ok(q.results[0].issues.includes('UNRELATED_INPUTS_CHANGED'));assert.ok(q.results[0].issues.includes('PAIRED_ORIGIN_MISMATCH'));
});
test('F22 repeated map comparisons are not independent wins and conflicting pair IDs are censored',()=>{
  const p=pair(),q=auditPairedAnalyses([p,p],{as_of_ts:T});assert.equal(q.duplicate_pair_replays,1);assert.equal(q.pairs,1);assert.equal(q.declared_independent_waves,1);
  const u=structuredClone(p);u.enriched.analysis.card_text+='changed';const c=auditPairedAnalyses([p,u],{as_of_ts:T});assert.equal(c.qualified_pairs,0);assert.ok(c.results.every(r=>r.issues.includes('PAIR_ID_CONFLICT')));
});
test('F23 paired input without original raw clocks or exact implementation binding stays unqualified',()=>{
  const p=pair();delete p.enriched.input;p.enriched.implementation_sha256='b'.repeat(64);const q=auditPairedAnalyses([p],{as_of_ts:T});assert.ok(q.results[0].issues.includes('INITIAL_INPUT_NOT_BOUND'));assert.ok(q.results[0].issues.includes('PAIRED_IMPLEMENTATION_MISMATCH'));
});
test('F24 audits are pure and deterministic for shuffled independent rows',()=>{
  const rows=[record('A'),record('B',SPLIT+MINUTE)],before=structuredClone(rows),a=audit(rows),b=audit(rows.toReversed());assert.deepEqual(rows,before);assert.deepEqual(a.cohorts,b.cohorts);assert.deepEqual(a.partitions,b.partitions);
  const p=pair(),saved=structuredClone(p);auditPairedAnalyses([p],{as_of_ts:T});assert.deepEqual(p,saved);
});
test('F25 feature units/domains and declared map cohort cannot be silently changed',()=>{
  const r=record('W'),f=r.audit_meta.features[0];f.name='open_interest';f.value=-1;assert.ok(issues(audit([r])).includes('FEATURE_DOMAIN_INVALID'));
  f.value='100';assert.ok(issues(audit([r])).includes('FEATURE_DOMAIN_INVALID'));f.name='map_mode';f.value='MAP';assert.ok(issues(audit([r])).includes('FEATURE_COHORT_MISMATCH'));
});
test('F26 identical no-map snapshots cannot be labeled as a map-benefit experiment',()=>{
  const p=pair();p.enriched=structuredClone(p.baseline);const q=auditPairedAnalyses([p],{as_of_ts:T});assert.equal(q.qualified_pairs,0);assert.ok(q.results[0].issues.includes('CONTRAST_NOT_PRESENT'));
});
test('F27 unresolved publication and unbound training manifests prevent clean calibration partitions',()=>{
  const r=record('W');r.publication={state:'UNKNOWN'};delete r.audit_meta.forecast.training_manifest_sha256;const q=audit([r]);assert.ok(issues(q).includes('PUBLICATION_STATUS_UNRESOLVED'));assert.ok(issues(q).includes('TRAINING_MANIFEST_UNBOUND'));assert.equal(q.cohorts[0].clean_train_wave_keys.length,0);
});
test('F28 engineering floors are inherited from TZ/summary and cannot be met by pooling distinct map cohorts',()=>{
  const q=audit([record('NO_MAP'),record('MAP',SPLIT+MINUTE,{map_mode:'MAP'})]);assert.equal(q.cohorts.length,2);
  for(const c of q.cohorts){assert.deepEqual(c.proposed_floor_check.requirements,{resolved_mature_waves:300,assets:20,calendar_days:14,temporal_holdout_waves:100});assert.equal(c.proposed_floor_check.observed.resolved_mature_waves,1);assert.equal(c.proposed_floor_check.counts_met,false);assert.equal(c.proposed_floor_check.calibration_validated,false);}
});
test('F29 raw drafts cannot enter calibration without a frozen original or terminal UNSENT admission',()=>{
  const r=record('W');delete r.audit_meta.origin_anchor;assert.ok(issues(audit([r])).includes('ORIGINAL_ANCHOR_UNBOUND'));
  const u=record('U');u.publication={state:'UNSENT'};u.audit_meta.origin_anchor.selection.kind='FIRST_READY';assert.ok(issues(audit([u])).includes('UNSENT_TERMINAL_ADMISSION_UNBOUND'));
  u.audit_meta.unsent_terminal={state:'CANCELLED',event_ts:T+MINUTE,known_ts:T+MINUTE,evidence_ref:'ARTIFICIAL_TERMINAL'};assert.ok(!issues(audit([u])).includes('UNSENT_TERMINAL_ADMISSION_UNBOUND'));assert.equal(audit([u]).publication_allowed,false);
});
