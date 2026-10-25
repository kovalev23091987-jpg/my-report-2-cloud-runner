import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {auditCohortSample,FEATURE_SCHEMA_VERSION} from '../../analytics/cohort-audit.mjs';
import {FEATURE_CAPSULE_VERSION,prepareFeatureCapsule,prepareOutcomeCapsule,capsuleDigest} from '../../analytics/feature-capsule.mjs';
import {analyzePump} from '../../analytics/index.mjs';
import {evaluateOutcome} from '../../analytics/outcome.mjs';
import {input,T,MINUTE} from './fixtures.mjs';

const H=3600000,SPLIT=T+6*H,NOW=T+15*H,out=new URL('../../handoffs/analytics/package-w/',import.meta.url);
const save=async(name,j)=>writeFile(new URL(name,out),JSON.stringify({evidence:'ARTIFICIAL_FIXTURES_WITH_SIMULATED_OBSERVED_CLAIMS_NOT_NATIVE',...j},null,2)+'\n');
const opts={feature_schema_version:FEATURE_CAPSULE_VERSION,as_of_ts:NOW,split_plan:{split_ts:SPLIT,declared_ts:T-H,plan_ref:'ARTIFICIAL_W_PREDECLARED_SPLIT'}};
const shift=(v,delta)=>{if(Array.isArray(v))return v.map(x=>shift(x,delta));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,k.endsWith('_ts')&&Number.isSafeInteger(x)?x+delta:shift(x,delta)]));return v;};
async function base(id='TRAIN',at=T){
  const x=shift(input(),at-T);x.run_id='ARTIFICIAL_W_'+id;x.run_purpose='PRODUCTION';
  x.instrument.instrument_id='ARTIFICIAL:BINGX:W-'+id+'-USDT';x.instrument.asset_id='ARTIFICIAL:W-'+id;
  for(const f of Object.values(x.facts))f.instrument_id=x.instrument.instrument_id;
  for(const r of x.facts.candles.value.slice(-5))r.volume_base=3000;
  const analysis=analyzePump(x);assert.equal(analysis.ready,true,JSON.stringify(analysis.reasons));
  const analysis_key='pump:analysis:'+await capsuleDigest(analysis),implementation_sha256=await capsuleDigest({evidence:'ARTIFICIAL',implementation:'W_TEST_ONLY'}),saved_ts=at+1000;
  const feature=await prepareFeatureCapsule({analysis,input:x,analysis_key,implementation_sha256,recorded_ts:saved_ts,evidence_class:'OBSERVED'});
  const signal={...feature.capsule.origin,map_mode:'WITHOUT_MAP',plan:analysis.plan};
  const saved_analysis={analysis,input:x,saved_ts,implementation_sha256,evidence_class:'OBSERVED'};
  const origin_anchor={analysis_id:analysis_key,analysis_sha256:feature.capsule.analysis_sha256,origin:feature.capsule.origin,immutable:true,selection:{kind:'FIRST_POSSIBLE_OR_CONFIRMED_SEND',selected_ts:at+2000,recorded_ts:at+2000,publication_event_id:'ARTIFICIAL_SEND_'+id}};
  return {feature,signal,saved_analysis,anchor_meta:{origin_anchor},publication:{state:'SENT',message_id:'777',receipt_ref:'pump:card:ARTIFICIAL_W_'+id+'#receipt'}};
}
function label(b,{complete=false,miss=false}={}){
  const t=b.signal.t0,p=b.signal.reference_price;
  return evaluateOutcome({signal:b.signal,as_of_ts:t+4*H,price_points:miss?[]:[{event_ts:t+MINUTE,price:p*1.11}],
    candles:complete?Array.from({length:240},(_,i)=>({open_ts:t+i*MINUTE,close_ts:t+(i+1)*MINUTE,closed:true,open:p,high:p*1.05,low:p*0.9,close:p,volume_base:1,turnover_quote:null})):[]});
}
async function revision(b,{outcome=label(b),recorded_ts=b.signal.t0+4*H+1000}={}){
  const row={record_id:null,recorded_ts,origin:structuredClone(b.feature.capsule.origin),publication:structuredClone(b.publication),outcome};
  row.record_id='pump:summary-record:'+await capsuleDigest({origin:row.origin,publication:row.publication,outcome:row.outcome});
  const outcomeCapsule=await prepareOutcomeCapsule({feature_capsule:b.feature.capsule,feature_sha256:b.feature.sha256,outcome,publication:row.publication,recorded_ts,summary_record_id:row.record_id});
  const link={schema:'pump-summary-capsule-link-v2-20261025',summary_record_id:row.record_id,analysis_key:b.feature.capsule.analysis_key,feature_key:b.feature.key,feature_sha256:b.feature.sha256,outcome_key:outcomeCapsule.key,outcome_sha256:outcomeCapsule.sha256,protected_refs:{key:'pump:protected-refs:ARTIFICIAL_W',sha256:'c'.repeat(64)},originals_required:true,global_reference_closure:false};
  const evidence={feature:structuredClone(b.feature),outcome:outcomeCapsule,link,saved_analysis:structuredClone(b.saved_analysis),anchor_meta:structuredClone(b.anchor_meta)};
  return {row,evidence};
}
async function run(pairs,extra={}){
  const registry=new Map(pairs.map(x=>[x.row.record_id,x.evidence]));let reads=0;
  const result=await auditCohortSample(pairs.map(x=>x.row),{...opts,resolve_evidence:async row=>{reads++;return structuredClone(registry.get(row.record_id));},...extra});
  return {result,reads};
}
const allIssues=r=>r.waves.flatMap(w=>w.issues);

test('W01 existing auditCohortSample resolves actual V wrappers/link/originals and reports clean TRAIN data without inventing calibration',async()=>{
  const b=await base(),r=await revision(b),before=structuredClone(r),{result,reads}=await run([r]);
  assert.equal(reads,1);assert.equal(result.feature_schema_version,FEATURE_CAPSULE_VERSION);assert.equal(result.partitions.TRAIN,1);assert.equal(result.invalid_records,0,JSON.stringify(result));
  assert.equal(result.waves[0].structurally_usable,true,JSON.stringify(result.waves));assert.equal(result.cohorts[0].clean_train_wave_keys.length,1);
  assert.equal(result.status,'NOT_CALIBRATED');assert.ok(result.waves[0].calibration_blockers.includes('NO_PRECOMMITTED_FORECAST'));
  for(const k of ['empirical_success_rate_pct','probability_pct','feature_benefit_pct'])assert.equal(result[k],null);
  assert.equal(result.publication_allowed,false);assert.equal(result.feature_usefulness_proven,false);assert.equal(result.external_provenance_authenticated,false);
  assert.equal(result.retention.delete_allowed,false);assert.equal(result.retention.approved_delete_ttl_ms,null);assert.deepEqual(r,before);
  assert.ok(result.waves[0].protected_original_refs.includes(r.evidence.feature.capsule.analysis_key));await save('connected-existing-consumer.json',{result,resolver_calls:reads});
});

test('W02 predeclared chronological split purges crossing/late labels and keeps mature holdout pending and UNKNOWN distinct',async()=>{
  const train=await revision(await base('TRAIN')),holdout=await revision(await base('HOLD',T+7*H));
  const pending=await revision(await base('PEND',T+14*H),{outcome:null,recorded_ts:T+14*H+3000});
  const unknown=await revision(await base('UNKNOWN',T+H),{outcome:null,recorded_ts:T+H+3000});
  const cross=await revision(await base('CROSS',T+4*H)),late=await revision(await base('LATE',T+H/2),{recorded_ts:SPLIT+1000});
  const {result}=await run([late,unknown,holdout,pending,cross,train]);
  for(const [k,n]of Object.entries({TRAIN:1,HOLDOUT:1,PENDING:1,UNKNOWN:1,PURGED_HORIZON_CROSSES_SPLIT:1,PURGED_LABEL_NOT_KNOWN_AT_SPLIT:1}))assert.equal(result.partitions[k],n,k);
  assert.equal(result.invalid_records,0);assert.equal(result.inspected_waves,6);assert.equal(result.probability_pct,null);
  const bad=(await run([train],{split_plan:{...opts.split_plan,declared_ts:SPLIT+1}})).result;assert.equal(bad.split_predeclared,false);assert.ok(allIssues(bad).includes('SPLIT_NOT_PREDECLARED'));assert.equal(bad.cohorts[0].clean_train_wave_keys.length,0);
  await save('chronological-partitions.json',{result,uncommitted_split:bad});
});

test('W03 independently changed original analysis/input/plan/outcome/code/link/clock cannot pass the existing consumer',async()=>{
  const initial=await revision(await base()),variants=[];
  const mutations=[['analysis',r=>r.evidence.saved_analysis.analysis.reference_price++],['input',r=>r.evidence.saved_analysis.input.facts.price.value++],['plan',r=>r.evidence.saved_analysis.analysis.plan.entry_zones[0].lower++],['outcome',r=>r.row.outcome.drawdown_total_pct=1],['code',r=>r.evidence.saved_analysis.implementation_sha256='d'.repeat(64)],['link',r=>r.evidence.link.feature_sha256='e'.repeat(64)],['clock',r=>r.evidence.saved_analysis.saved_ts++],['P0',r=>r.row.origin.reference_price++],['t0',r=>r.row.origin.t0++]];
  for(const [name,mutate]of mutations){const r=structuredClone(initial);mutate(r);const q=(await run([r])).result;assert.equal(q.waves[0].structurally_usable,false,name);assert.ok(q.invalid_records>0,name);assert.equal(q.probability_pct,null);variants.push({name,issues:q.waves[0].issues});}
  const tampered=structuredClone(initial);tampered.evidence.feature.capsule.features[0].value='RESUMING';tampered.evidence.feature.sha256=await capsuleDigest(tampered.evidence.feature.capsule);tampered.evidence.link.feature_sha256=tampered.evidence.feature.sha256;
  const q=(await run([tampered])).result;assert.equal(q.waves[0].structurally_usable,false);assert.ok(allIssues(q).includes('FEATURE_PROJECTION_READBACK_MISMATCH'));variants.push({name:'rehashed_modified_feature',issues:q.waves[0].issues});
  await save('readback-rejection-variants.json',{variants});
});

test('W04 first persisted resolved label and numeric DD remain frozen across later coverage while HIT/MISS or feature conflicts quarantine a wave',async()=>{
  const b=await base(),first=await revision(b),later=await revision(b,{outcome:label(b,{complete:true}),recorded_ts:SPLIT+1000});
  assert.equal(first.row.outcome.drawdown_total_pct,null);assert.equal(typeof later.row.outcome.drawdown_total_pct,'number');
  const q=(await run([later,first,first])).result,w=q.waves[0];assert.equal(q.inspected_waves,1);assert.equal(q.duplicate_record_replays,1);assert.equal(w.partition,'TRAIN');assert.equal(w.first_resolved_recorded_ts,first.row.recorded_ts);assert.equal(w.first_resolved_label_sha256,first.evidence.outcome.capsule.original_outcome_sha256);assert.equal(w.first_resolved_label.drawdown_total_pct,null);assert.equal(w.structurally_usable,true,JSON.stringify(w));
  const miss=await revision(b,{outcome:label(b,{complete:true,miss:true}),recorded_ts:SPLIT+2000});const conflict=(await run([first,miss])).result;assert.ok(allIssues(conflict).includes('CONTRADICTORY_OUTCOMES'));assert.equal(conflict.waves[0].structurally_usable,false);
  const changed=structuredClone(b);changed.saved_analysis.implementation_sha256='b'.repeat(64);changed.feature=await prepareFeatureCapsule({analysis:changed.saved_analysis.analysis,input:changed.saved_analysis.input,analysis_key:changed.feature.capsule.analysis_key,implementation_sha256:changed.saved_analysis.implementation_sha256,recorded_ts:changed.saved_analysis.saved_ts,evidence_class:'OBSERVED'});
  const switched=await revision(changed,{outcome:label(b,{complete:true}),recorded_ts:SPLIT+2000}),features=(await run([first,switched])).result;assert.ok(allIssues(features).includes('IMMUTABLE_FEATURE_CHANGED'));
  await save('first-known-label-and-conflicts.json',{first_known:q,conflicting_outcomes:conflict,conflicting_features:features});
});

test('W05 purpose exclusions cannot promote acceptance or nonobserved waves and legacy metadata cannot masquerade as v2 capsules',async()=>{
  const r=await revision(await base()),a=structuredClone(r);a.row.origin.run_purpose='ACCEPTANCE_TEST';
  const q=(await run([a,r])).result;assert.equal(q.inspected_waves,0);assert.equal(q.purpose_exclusions.acceptance_test,1);assert.equal(q.purpose_exclusions.production_wave_conflict,1);
  const legacy=structuredClone(r);legacy.evidence=null;legacy.row.audit_meta={feature_schema_version:FEATURE_SCHEMA_VERSION,features:[{name:'relative_return_btc_pct',value:99}]};const denied=(await run([legacy])).result;assert.ok(allIssues(denied).includes('CAPSULE_LINK_OR_ORIGINAL_READBACK_REQUIRED'));assert.equal(denied.waves[0].structurally_usable,false);
  assert.throws(()=>auditCohortSample([],{...opts,feature_schema_version:'GUESS'}),/UNSUPPORTED/);await save('purpose-and-schema-boundary.json',{purpose:q,no_v1_promotion:denied});
});

test('W06 future labels and evidence resolver failures stay outside past knowledge and bounds reject incomplete inventories',async()=>{
  const b=await base(),unknown=await revision(b,{outcome:null,recorded_ts:T+3000}),future=await revision(b,{recorded_ts:NOW+1});
  const {result,reads}=await run([unknown,future]);assert.equal(result.excluded_future_records,1);assert.equal(reads,1);assert.equal(result.waves[0].partition,'UNKNOWN');assert.equal(result.waves[0].first_resolved_label,null);
  const fail=(await run([unknown],{resolve_evidence:async()=>{throw Error('ARTIFICIAL_MISSING_ORIGINAL');}})).result;assert.equal(fail.waves[0].structurally_usable,false);assert.match(allIssues(fail).join(' '),/READBACK_FAILED/);
  await assert.rejects(auditCohortSample(Array(2049).fill(unknown.row),opts),/BOUND/);await assert.rejects(auditCohortSample([],{...opts,resolve_evidence:true}),/RESOLVER_INVALID/);
  await save('future-and-resolver-boundary.json',{future_excluded:result,failed_readback:fail});
});

test('W07 missing or late forecasts remain NOT_CALIBRATED even when every feature is available or declared forecast metadata exists',async()=>{
  const r=await revision(await base()),origin=r.row.origin;
  r.evidence.forecast={value_pct:50,model_version:'ARTIFICIAL_NOT_A_FITTED_MODEL',created_ts:T+1,training_cutoff_ts:T+1,trained_through_label_ts:T+1,mode:origin.mode,map_mode:origin.map_mode,rules_version:origin.rules_version,profile_version:origin.profile_version,feature_schema_version:FEATURE_CAPSULE_VERSION};
  const q=(await run([r])).result;for(const reason of ['FORECAST_AFTER_ORIGIN','TRAINING_MANIFEST_UNBOUND','FORECAST_ORIGINAL_READBACK_REQUIRED','FORECAST_TRAINING_LEAKAGE'])assert.ok(q.waves[0].calibration_blockers.includes(reason),reason);assert.equal(q.probability_pct,null);
  r.evidence.training_manifest={evidence:'ARTIFICIAL_ONLY',trained_before:T-H};r.evidence.forecast={...r.evidence.forecast,created_ts:T-1000,training_cutoff_ts:T-2000,trained_through_label_ts:T-3000,training_manifest_sha256:await capsuleDigest(r.evidence.training_manifest)};r.evidence.forecast_readback=structuredClone(r.evidence.forecast);
  const unfit=(await run([r])).result;assert.deepEqual(unfit.waves[0].calibration_blockers,['CALIBRATION_NOT_PERFORMED']);assert.equal(unfit.status,'NOT_CALIBRATED');assert.equal(unfit.feature_usefulness_proven,false);assert.equal(unfit.publication_allowed,false);await save('forecast-boundary.json',{uncommitted:q,declared_but_unfitted:unfit});
});

test('W08 historical v1 synchronous entry remains byte-compatible on one new sentinel and frozen V/T/S bytes stay intact',async()=>{
  const source=(await readFile(new URL('cohort-audit.before.mjs.txt',out),'utf8')).replace(/from\s*'([^']+)'/g,(all,p)=>p.startsWith('.')?"from '"+pathToFileURL(resolve('pump-report/analytics',p)).href+"'":all);
  const before=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const o={as_of_ts:NOW,split_plan:opts.split_plan},a=auditCohortSample([],o),b=before.auditCohortSample([],o);assert.equal(typeof a.then,'undefined');assert.deepEqual(a,b);assert.deepEqual(auditCohortSample([],{...o,feature_schema_version:FEATURE_SCHEMA_VERSION}),b);
  const proofs=JSON.parse(await readFile(new URL('before-proofs.json',out),'utf8')),files=[];
  for(const [path,sha256]of Object.entries(proofs)){const bytes=await readFile(path),actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');assert.equal(actual,sha256,path);files.push({path,sha256});}
  await save('frozen-prior-integrity.json',{result:'PASS',historical_v1_single_sentinel_equal:true,files,V8_T4_old_batteries_replayed:false});
});

test('W09 bounded resolver refuses oversized hydrated originals instead of returning a partial audit',async()=>{
  const r=await revision(await base());
  await assert.rejects(auditCohortSample([r.row],{...opts,resolve_evidence:async()=>({...r.evidence,oversized_original:'X'.repeat(2000001)})}),/AUDIT_EVIDENCE_BOUND_EXCEEDED/);
  const normal=(await run([r])).result;assert.ok(normal.hydrated_evidence_bytes>0&&normal.hydrated_evidence_bytes<=2000000);assert.equal(normal.invalid_records,0);assert.equal(normal.waves[0].structurally_usable,true);
  await save('hydrated-evidence-bound.json',{result:'PASS_ONLY_NEW_W09',normal_hydrated_bytes:normal.hydrated_evidence_bytes,hard_limit_bytes:2000000,oversized_audit_returned:false,delete_allowed:false});
});
