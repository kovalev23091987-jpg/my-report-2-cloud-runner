import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../observer/fixtures.mjs';
import {detectClosed,hash} from '../observer/observer.mjs';
import {newRegistry,registerRevision,retentionDecision,logicalCohortKey} from './identity-retention-grid.mjs';
const native=c=>({venue:c.instrument.venue,market:c.instrument.market,native_instrument_id:'CONTROLLED_NATIVE_1',instrument_epoch:'CONTROLLED_LISTING_2026',contract_code:c.instrument.contract,qualification_ref:'CONTROLLED:QUALIFICATION:1',qualified:true});
function pair(){const f=fixture(),a=f.result.events[0],b=detectClosed({...f,known_ts:f.known_ts+1000,provenance:{...f.provenance,raw_ref:'CONTROLLED:SECOND_PROOF_LOCATOR'}}).events[0];return{a,b};}
const record=r=>r.state.events[r.logical_event_id];
const restart=state=>JSON.parse(JSON.stringify(state));
function legacy(r,c){const old=restart(r.state),row=old.events[r.logical_event_id].revisions[0];row.revision_key=hash({binding_ref:c.instrument.binding_ref,asset_id:c.instrument.asset_id,rules_hash:c.rules_hash,raw_sha256:c.provenance.raw_sha256,facts:row.fact_hash});delete row.revision_key_version;return old;}

test('same raw body at another locator retains both protected refs within one canonical event',()=>{
 const {a,b}=pair(),one=registerRevision(newRegistry(),a,native(a)),before=JSON.stringify(one.state),two=registerRevision(one.state,b,native(b)),event=record(two);
 assert.equal(a.provenance.raw_sha256,b.provenance.raw_sha256);assert.equal(two.status,'PROVENANCE_REVISION');assert.equal(two.independent_new_event,false);assert.equal(two.logical_event_id,one.logical_event_id);assert.equal(Object.keys(two.state.events).length,1);assert.equal(event.revisions.length,2);assert.notEqual(event.revisions[0].revision_key,event.revisions[1].revision_key);assert.equal(event.first_known_ts,a.first_known_ts);assert.deepEqual(event.canonical_card,a);assert.equal(event.conflicting_native_facts,false);assert.equal(JSON.stringify(one.state),before);
 const protectedRefs=retentionDecision({logical_event:event,active:true}).protected_proof_refs;assert.deepEqual(new Set(protectedRefs.map(p=>p.raw_ref)),new Set([a.provenance.raw_ref,b.provenance.raw_ref]));assert.equal(logicalCohortKey(one.logical_event_id,'90d','LONG'),logicalCohortKey(two.logical_event_id,'90d','LONG'));
});
test('a new native qualification receipt is retained without changing canonical firstknown or market fact',()=>{
 const {a}=pair(),one=registerRevision(newRegistry(),a,native(a)),two=registerRevision(one.state,a,{...native(a),qualification_ref:'CONTROLLED:QUALIFICATION:2'}),event=record(two);
 assert.equal(two.status,'PROVENANCE_REVISION');assert.equal(two.independent_new_event,false);assert.equal(event.revisions.length,2);assert.deepEqual(event.revisions.map(r=>r.qualification_ref),['CONTROLLED:QUALIFICATION:1','CONTROLLED:QUALIFICATION:2']);assert.equal(event.conflicting_native_facts,false);assert.deepEqual(event.canonical_card,a);assert.equal(event.first_known_ts,a.first_known_ts);
});
test('JSON restart replays the full proof revision idempotently while preserving original canonical time',()=>{
 const {a,b}=pair(),one=registerRevision(newRegistry(),a,native(a)),two=registerRevision(one.state,b,{...native(b),qualification_ref:'CONTROLLED:QUALIFICATION:2'}),saved=restart(two.state),before=JSON.stringify(saved),again=registerRevision(saved,b,{...native(b),qualification_ref:'CONTROLLED:QUALIFICATION:2'});
 assert.equal(again.status,'DUPLICATE_REVISION');assert.equal(again.state,saved);assert.equal(JSON.stringify(saved),before);assert.equal(record(again).revisions.length,2);assert.equal(record(again).first_known_ts,a.first_known_ts);assert.deepEqual(record(again).canonical_card,a);
});
test('legacy exact proof replay consumes no revision slot, but its new locator is not falsely deduplicated',()=>{
 const {a,b}=pair(),one=registerRevision(newRegistry(),a,native(a)),old=legacy(one,a),before=JSON.stringify(old),same=registerRevision(old,a,native(a));
 assert.equal(same.status,'DUPLICATE_REVISION');assert.equal(same.state,old);assert.equal(JSON.stringify(old),before);
 const two=registerRevision(old,b,native(b));assert.equal(two.status,'PROVENANCE_REVISION');assert.equal(record(two).revisions.length,2);assert.deepEqual(record(two).revisions[0],old.events[one.logical_event_id].revisions[0]);assert.equal(record(two).revisions[1].revision_key_version,'PROOF_REFERENCE_V2');assert.equal(registerRevision(restart(two.state),b,native(b)).status,'DUPLICATE_REVISION');
});
test('legacy qualification changes remain a new proof revision under unchanged bounds',()=>{
 const {a}=pair(),one=registerRevision(newRegistry(),a,native(a)),old=legacy(one,a),two=registerRevision(old,a,{...native(a),qualification_ref:'CONTROLLED:QUALIFICATION:2'});
 assert.equal(two.status,'PROVENANCE_REVISION');assert.equal(record(two).revisions.length,2);assert.equal(record(two).revisions[1].qualification_ref,'CONTROLLED:QUALIFICATION:2');assert.deepEqual(two.state.limits,old.limits);assert.deepEqual(record(two).canonical_card,a);
});
test('a new proof at the revision cap defers explicitly without claiming a duplicate or evicting old proof',()=>{
 const {a,b}=pair(),one=registerRevision(newRegistry({max_events:1,max_revisions:1}),a,native(a)),before=JSON.stringify(one.state);
 for(const [c,n] of [[b,native(b)],[a,{...native(a),qualification_ref:'CONTROLLED:QUALIFICATION:2'}]]){const r=registerRevision(one.state,c,n);assert.equal(r.status,'DEFERRED_REGISTRY_CAPACITY');assert.equal(r.state,one.state);assert.equal(JSON.stringify(r.state),before);assert.deepEqual(r.state.limits,{max_events:1,max_revisions:1});assert.deepEqual(record(r).canonical_card,a);}
 assert.equal(registerRevision(one.state,a,native(a)).status,'DUPLICATE_REVISION');
});
