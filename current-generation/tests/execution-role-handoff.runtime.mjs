import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const runtime=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const imp=p=>import(pathToFileURL(path.join(runtime,'src',p)).href);
const {buildCanonicalExecutionRoleReceipts}=await imp('execution-report-context.mjs');
const {buildRoleEvidenceView}=await imp('source-role-consumer.mjs');
const {assessActionability,canonicalFingerprint,renderCanonicalTelegram,renderCanonicalManual}=await imp('canonical-publication.mjs');
const {buildRuntimeCanonicalBundle}=await imp('canonical-runtime-adapter.mjs');
const bytes=gunzipSync(fs.readFileSync(new URL('./fixtures/actual-ZEC-role-handoff-0931.json.gz',import.meta.url)));
assert.equal(createHash('sha256').update(bytes).digest('hex'),'0adaaf3cdf058e07508ec6069b95434b94a388073f4c487a9c9eb09e8b151708');
const fixture=JSON.parse(bytes),c=fixture.canonical;
assert.equal(fixture.full_original_producer_replay,false);
assert.equal(c.analytical_fingerprint,canonicalFingerprint(c));
const identity={contract:'ZEC-USDT',run_id:c.run_id,snapshot_id:c.snapshot_id,observed_ts:c.observed_ts,execution_context_source:c.metadata.execution_context_source};
const roles=(receipts)=>buildRoleEvidenceView(receipts,{contract:identity.contract,observed_ts:identity.observed_ts});
const clone=x=>structuredClone(x);
function bind(receipts){const out=clone(c);out.source_receipts=[...out.source_receipts,...receipts];out.metadata.source_role_view=roles(out.source_receipts);out.analytical_fingerprint=canonicalFingerprint(out);return out;}
test('same-run actual ZEC source proof supplies missing HTX execution role at original clock',()=>{
 assert.equal(c.state,'OBSERVE');assert.equal(c.scores.coin_interest_0_100,82);
 assert.equal(assessActionability({canonical:c,lifecycle_event:'OBSERVE'}).reason,'OBSERVE_SOURCE_ROLES_NOT_CLOSED');
 const added=buildCanonicalExecutionRoleReceipts(identity);assert.equal(added.length,1);
 const f=identity.execution_context_source.bundle.execution_gate.factual_basis.facts;
 assert.equal(added[0].event_ts,f.book_source_ts);assert.equal(added[0].received_ts,f.received_ts);assert.equal(added[0].max_age_sec,15);
 assert.equal(added[0].entry_authorized,false);assert.equal(added[0].score_contribution,0);
 const v=roles(added);assert.deepEqual(v.classified[0].assigned_roles,['EXECUTION_TRUTH']);assert.equal(v.classified[0].independence_group,'HTX_OFFICIAL');
 const after=bind(added);assert.equal(assessActionability({canonical:after,lifecycle_event:'OBSERVE'}).deliver,true);
 assert.deepEqual(after.scores,c.scores);assert.deepEqual(after.trigger,c.trigger);assert.deepEqual(after.invalidation,c.invalidation);assert.deepEqual(after.targets,c.targets);
 for(const render of [renderCanonicalTelegram,renderCanonicalManual])assert.equal(render({canonical:after,lifecycle_event:'OBSERVE'}).text,render({canonical:c,lifecycle_event:'OBSERVE'}).text);
 assert.equal(assessActionability({canonical:after,lifecycle_event:'ENTRY'}).deliver,false);
});
test('runtime assembly assigns the actual source receipt without extra market requests',()=>{
 const bundle=buildRuntimeCanonicalBundle(identity);
 const htx=bundle.canonical.metadata.source_role_view.classified.filter(x=>x.assigned_roles.includes('EXECUTION_TRUTH'));
 assert.equal(htx.length,1);assert.equal(htx[0].event_ts,identity.execution_context_source.bundle.execution_gate.factual_basis.facts.book_source_ts);
 assert.equal(bundle.canonical.direction,null);assert.equal(bundle.canonical.state,'REJECTED');
});
test('missing foreign stale future or changed immutable execution facts never fill the role',()=>{
 assert.deepEqual(buildCanonicalExecutionRoleReceipts({...identity,execution_context_source:null}),[]);
 assert.deepEqual(buildCanonicalExecutionRoleReceipts({...identity,contract:'FIL-USDT'}),[]);
 assert.deepEqual(buildCanonicalExecutionRoleReceipts({...identity,snapshot_id:'foreign'}),[]);
 const stale=clone(identity);stale.execution_context_source.bundle.execution_gate.factual_basis.facts.book_source_ts-=60000;assert.deepEqual(buildCanonicalExecutionRoleReceipts(stale),[]);
 const future=clone(identity);future.execution_context_source.bundle.execution_gate.factual_basis.facts.received_ts=c.observed_ts+1;assert.deepEqual(buildCanonicalExecutionRoleReceipts(future),[]);
 const changed=clone(identity);changed.execution_context_source.bundle.execution_gate.factual_basis.facts.bids[0][1]++;assert.deepEqual(buildCanonicalExecutionRoleReceipts(changed),[]);
 const blocked=clone(identity);blocked.execution_context_source.bundle.execution_gate.execution_blocked=true;assert.deepEqual(buildCanonicalExecutionRoleReceipts(blocked),[]);
});
test('same HTX origin alone, low score or missing trigger still cannot publish',()=>{
 const added=buildCanonicalExecutionRoleReceipts(identity),out=bind(added);
 out.metadata.source_role_view=roles(added);assert.equal(assessActionability({canonical:out,lifecycle_event:'OBSERVE'}).reason,'OBSERVE_SOURCE_ROLES_NOT_CLOSED');
 const low=bind(added);low.scores.coin_interest_0_100=69;assert.equal(assessActionability({canonical:low,lifecycle_event:'OBSERVE'}).reason,'CANONICAL_INTEREST_BELOW_USER_THRESHOLD');
 const missing=bind(added);missing.trigger=null;assert.equal(assessActionability({canonical:missing,lifecycle_event:'OBSERVE'}).reason,'OBSERVE_TRIGGER_NOT_CLOSED');
 const generic=clone(identity);generic.execution_context_source={status:'CLOSED',source:'HTX'};assert.deepEqual(buildCanonicalExecutionRoleReceipts(generic),[]);
});
