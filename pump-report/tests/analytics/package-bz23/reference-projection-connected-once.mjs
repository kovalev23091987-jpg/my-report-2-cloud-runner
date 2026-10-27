import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const root=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
assert.equal(a.status,'ADMITTED_ONE_BZ23_REFERENCE_PROJECTION_CASE');
assert.equal(a.root_owner,root.owner);assert(Date.now()<a.expires_ts&&a.expires_ts<=root.expires_ts&&!root.released);
assert.equal(a.case_count,1);assert.equal(a.real_HTTP,0);assert.equal(a.native_SQL,0);assert.equal(a.Telegram,0);
for(const [p,h]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
const fixture=JSON.parse(fs.readFileSync(a.fixture_path,'utf8'));assert.equal(fixture.status,'READY_FIXED_SUPPLIED_PATHS');
const cachedBytes=fs.readFileSync(a.cached_baseline);assert.equal(sha(cachedBytes),a.cached_baseline_sha256);
const cached=JSON.parse(cachedBytes).cases.find(c=>c.case_id==='AIN_AUTO_20261026_READY_STALE');assert(cached?.baseline_analysis.ready);
fs.writeFileSync(a.proof_path+'.attempt',JSON.stringify({started_ts:Date.now(),case_count:1,real_IO:0}),{flag:'wx',mode:0o600});
globalThis.fetch=()=>{throw Error('REAL_NETWORK_FORBIDDEN');};
const live=await import('../../../analytics/feature-capsule.mjs');
const {MemoryStore}=await import('../../../runtime/store.mjs');
const {createRetainedCapsuleWriter}=await import('../../../runtime/retained-capsules.mjs');
let oldText=fs.readFileSync(a.baseline_module,'utf8');
oldText=oldText.replace("'../contracts/index.mjs'",JSON.stringify(new URL('../../../contracts/index.mjs',import.meta.url).href))
 .replace("'./math.mjs'",JSON.stringify(new URL('../../../analytics/math.mjs',import.meta.url).href));
const before=await import('data:text/javascript;base64,'+Buffer.from(oldText).toString('base64'));
const analysis=structuredClone(cached.baseline_analysis),input=structuredClone(cached.input);
analysis.run_id=input.run_id='ARTIFICIAL_BZ23_REFERENCE_PROJECTION';
analysis.instrument.identity_evidence_ref=input.instrument.identity_evidence_ref='ARTIFICIAL_BZ23_IDENTITY_PROOF';
const wanted=new Set(['ARTIFICIAL_BZ23_IDENTITY_PROOF']);
for(const [i,row]of fixture.fact_paths.entries()){
 const f=input.facts[row.kind]??={...structuredClone(input.facts.price),kind:row.kind,fact_id:'ARTIFICIAL_BZ23_'+row.kind,status:'ABSENT',value:null};
 const keys=row.path;assert(keys.length>0&&keys.length<=6);let target=f;
 for(const k of keys.slice(0,-1))target=target[k]??={};
 const ref='ARTIFICIAL_BZ23_PROOF_'+i;target[keys.at(-1)]=ref;wanted.add(ref);
}
for(const [i,field]of fixture.candle_row_fields.entries()){const ref='ARTIFICIAL_BZ23_ROW_'+i;input.facts.candles.value[0][field]=ref;wanted.add(ref);}
const artificialZone={lower:1,upper:2};
for(const field of fixture.LIQ_fields){const ref='ARTIFICIAL_BZ23_ZONE_'+field;artificialZone[field]=ref;wanted.add(ref);}
for(const field of fixture.LIQ_nested_fields){const ref='ARTIFICIAL_BZ23_ZONE_'+field;artificialZone[field]={evidence_ref:ref};wanted.add(ref);}
input.liquidations={...(input.liquidations??{}),zones:[artificialZone]};
const analysis_key='pump:analysis:'+await live.capsuleDigest(analysis),args={analysis_key,analysis,input};
const snapshot=JSON.stringify(args);
const oldProjection=await before.projectProtectedReferences(args),projected=await live.projectProtectedReferences(args);
assert.equal(JSON.stringify(args),snapshot,'projection never enriches/mutates supplied original');
const targets=new Set(projected.edges.map(e=>e.to));for(const ref of wanted)assert(targets.has(ref),ref);
assert(!oldProjection.edges.some(e=>e.to==='ARTIFICIAL_BZ23_IDENTITY_PROOF'));
for(const edge of oldProjection.edges)assert(projected.edges.some(e=>JSON.stringify(e)===JSON.stringify(edge)));
assert.equal(projected.edges.filter(e=>e.to==='ARTIFICIAL_BZ23_IDENTITY_PROOF').length,1,'shared instrument refs deduplicate');
for(const p of [oldProjection,projected]){assert.equal(p.delete_allowed,false);assert.equal(p.approved_delete_ttl_ms,null);assert.equal(p.inventory_complete_for_global_cleanup,false);assert.equal(p.archive_reader_verified,false);}
const options={...args,implementation_sha256:a.fixture_implementation_sha256,recorded_ts:analysis.analysis_ts,evidence_class:'ARTIFICIAL'};
const oldFeature=await before.prepareFeatureCapsule(options),feature=await live.prepareFeatureCapsule(options);assert.deepEqual(feature,oldFeature,'feature bytes/digests and schema unchanged');
const outcomeArgs={feature_capsule:feature.capsule,feature_sha256:feature.sha256,outcome:null,publication:{state:'UNKNOWN'},recorded_ts:analysis.analysis_ts};
assert.deepEqual(await live.prepareOutcomeCapsule(outcomeArgs),await before.prepareOutcomeCapsule(outcomeArgs),'outcome capsule unchanged');
const store=new MemoryStore();await store.set(analysis_key,{analysis,input,saved_ts:analysis.analysis_ts,implementation_sha256:a.fixture_implementation_sha256,evidence_class:'ARTIFICIAL'});
const stored=JSON.stringify(await store.get(analysis_key)),writer=createRetainedCapsuleWriter({store,implementation_sha256:a.fixture_implementation_sha256,evidence_class:'ARTIFICIAL'});
const remembered=await writer.remember(analysis_key);assert.equal(remembered.status,'SAVED');
assert.equal(JSON.stringify(await store.get(analysis_key)),stored,'writer retains exact original');
const savedRefs=await store.get(remembered.protected_refs.key);
for(const ref of wanted)assert(savedRefs.projection.edges.some(e=>e.to===ref));
assert.equal(savedRefs.projection.delete_allowed,false);assert.equal(savedRefs.projection.approved_delete_ttl_ms,null);
// One connected case: new links use expanded refs; old immutable links replay
// with their exact original pointer. A pointer is structural, not archive proof.
const origin=feature.capsule.origin,publication={state:'UNKNOWN',message_id:null,receipt_ref:null},recorded_ts=analysis.analysis_ts;
const record={origin,publication,outcome:null,recorded_ts};
record.record_id='pump:summary-record:'+await live.capsuleDigest({origin,publication,outcome:null});
const signal={...origin,origin,analysis_key,instrument:analysis.instrument,plan:analysis.plan};
const linkKey='pump:summary-capsule-link:v2:'+record.record_id.slice(-64);
const written=await writer.record(signal,record);assert.equal(written.status,'SAVED');
const newLink=await store.get(linkKey),newRecordRefs=await store.get(newLink.protected_refs.key);
for(const ref of wanted)assert(newRecordRefs.projection.edges.some(e=>e.to===ref),'new record link '+ref);
const oldRecordProjection=await before.projectProtectedReferences({...args,signal,summary_records:[record]});
const oldRecordHash=await before.capsuleDigest(oldRecordProjection),oldRecordKey='pump:protected-refs:v2:'+oldRecordHash;
const oldOutcome=await before.prepareOutcomeCapsule({...outcomeArgs,publication,recorded_ts,summary_record_id:record.record_id});
const oldLink={...newLink,protected_refs:{key:oldRecordKey,sha256:oldRecordHash}};
const oldStore=new MemoryStore();
await oldStore.set(analysis_key,{analysis,input,saved_ts:recorded_ts,implementation_sha256:a.fixture_implementation_sha256,evidence_class:'ARTIFICIAL'});
await oldStore.set(oldFeature.key,oldFeature);await oldStore.set(oldOutcome.key,oldOutcome);
await oldStore.set(oldRecordKey,{key:oldRecordKey,sha256:oldRecordHash,projection:oldRecordProjection});await oldStore.set(linkKey,oldLink);
const oldBytes=JSON.stringify(await oldStore.get(linkKey)),oldFeatureBytes=JSON.stringify(await oldStore.get(oldFeature.key)),oldOutcomeBytes=JSON.stringify(await oldStore.get(oldOutcome.key));
const oldWriter=createRetainedCapsuleWriter({store:oldStore,implementation_sha256:a.fixture_implementation_sha256,evidence_class:'ARTIFICIAL'});
const replayed=await oldWriter.record(signal,record);assert.equal(replayed.status,'SAVED');
assert.equal(JSON.stringify(await oldStore.get(linkKey)),oldBytes,'old immutable summary link bytes retained');
assert.deepEqual(replayed.protected_refs,oldLink.protected_refs,'returned pointer is the retained one');
assert.equal(JSON.stringify(await oldStore.get(oldFeature.key)),oldFeatureBytes);assert.equal(JSON.stringify(await oldStore.get(oldOutcome.key)),oldOutcomeBytes);
assert.deepEqual((await oldStore.get(newLink.protected_refs.key)).projection,newRecordRefs.projection,'expanded refs may exist separately without migration');
const conflict={...oldLink,feature_sha256:'f'.repeat(64)};await oldStore.set(linkKey,conflict);
const conflictBytes=JSON.stringify(await oldStore.get(linkKey));
await assert.rejects(oldWriter.record(signal,record),/IMMUTABLE_RETAINED_CAPSULE_CONFLICT/);
assert.equal(JSON.stringify(await oldStore.get(linkKey)),conflictBytes,'core conflict not rewritten');
// A large supplied input map is not a strategy limit. Scan a bounded prefix,
// mark incomplete, require originals and retain the unchanged READY plan.
const overflow=structuredClone(args);overflow.analysis.run_id=overflow.input.run_id='ARTIFICIAL_BZ23_MAP_OVERFLOW';
overflow.analysis_key='pump:analysis:'+await live.capsuleDigest(overflow.analysis);
overflow.input.liquidations.zones=Array.from({length:257},()=>structuredClone(artificialZone));
const overflowSnapshot=JSON.stringify(overflow),overflowView=await live.projectProtectedReferences(overflow);
assert(overflowView.reasons.includes('SUPPLIED_INPUT_MAP_REFERENCE_INVENTORY_INCOMPLETE'));assert.equal(overflowView.originals_required,true);
assert.equal(overflowView.delete_allowed,false);assert.equal(overflowView.inventory_complete_for_global_cleanup,false);
assert.equal(JSON.stringify(overflow),overflowSnapshot);assert.equal(overflow.analysis.ready,analysis.ready);assert.deepEqual(overflow.analysis.plan,analysis.plan);
const overflowStore=new MemoryStore();await overflowStore.set(overflow.analysis_key,{analysis:overflow.analysis,input:overflow.input,saved_ts:recorded_ts,implementation_sha256:a.fixture_implementation_sha256,evidence_class:'ARTIFICIAL'});
const overflowWriter=createRetainedCapsuleWriter({store:overflowStore,implementation_sha256:a.fixture_implementation_sha256,evidence_class:'ARTIFICIAL'});
assert.equal((await overflowWriter.remember(overflow.analysis_key)).status,'SAVED','257 duplicate-provenance zones do not create a new rejection');
const nested=structuredClone(args);nested.input.facts.price.unlisted={deep:{evidence_ref:'ARTIFICIAL_UNLISTED_NOT_SCANNED'}};
assert(!(await live.projectProtectedReferences(nested)).edges.some(e=>e.to==='ARTIFICIAL_UNLISTED_NOT_SCANNED'));
const bad=structuredClone(args);bad.analysis.instrument.identity_evidence_ref='x'.repeat(513);bad.analysis_key='pump:analysis:'+await live.capsuleDigest(bad.analysis);
await assert.rejects(live.projectProtectedReferences(bad),/CAPSULE_REFERENCE_INVALID/);
const many=structuredClone(args);many.input.facts=Object.fromEntries(Array.from({length:17},(_,i)=>['extra'+i,null]));
await assert.rejects(live.projectProtectedReferences(many),/CAPSULE_ARRAY_BOUND_REQUIRED/);
const padding=structuredClone(args),count=256-oldProjection.edges.length;
assert(count>0&&count<=256);let remaining=count;
for(const [name,prefix]of [['external_audit_refs','audit'],['owner_original_refs','owner'],['ordered_items','ordered'],['members','member']]){
 const take=Math.min(64,remaining);remaining-=take;
 padding[name]=Array.from({length:take},(_,i)=>name.endsWith('_refs')?'ARTIFICIAL_PAD_'+prefix+i:{id:'ARTIFICIAL_PAD_'+prefix+i});
}
assert.equal(remaining,0);assert.equal((await before.projectProtectedReferences(padding)).edges.length,256);
await assert.rejects(live.projectProtectedReferences(padding),/PROTECTED_REFERENCE_BOUND_EXCEEDED/);
assert.equal(sha(fs.readFileSync(a.cached_baseline)),a.cached_baseline_sha256,'retained historical source bytes unchanged');
const proof={schema:'BZ23_ONE_CONNECTED_REFERENCE_PROJECTION_CASE_V2',status:'PASS',case_count:1,fixture_class:'ARTIFICIAL_SUPPLIED_REFERENCE_METADATA_WITH_CACHED_GENUINE_MARKET_VALUES',expected_proof_refs:wanted.size,
 actual_writer_projection_connected:true,old_edges_preserved:true,feature_and_outcome_capsule_bytes_unchanged:true,old_original_file_and_supplied_objects_unchanged:true,
 new_record_uses_expanded_refs:true,old_link_replay_bytes_preserved:true,core_conflict_rejected:true,map_input_overflow_incomplete_not_signal_gate:true,
 dedup_and_global_bounds_preserved:true,no_recursive_scan:true,delete_allowed:false,approved_delete_ttl_ms:null,global_reference_closure:false,
 engine_calls:0,real_HTTP:0,native_SQL:0,Telegram:0,production_deployed:false};
fs.writeFileSync(a.proof_path,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));

