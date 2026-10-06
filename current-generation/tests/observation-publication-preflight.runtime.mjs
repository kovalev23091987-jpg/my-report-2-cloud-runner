import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
const runtime=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const imp=p=>import(pathToFileURL(path.join(runtime,'src',p)).href);
const {canonicalLifecycleAuthority}=await imp('canonical-lifecycle-authority.mjs');
const {runV3TelegramLifecycleSidecar}=await imp('v3-telegram-lifecycle-sidecar.mjs');
const {earlySourceRolesClosed}=await imp('observation-source-role-gate.mjs');
const {buildRoleEvidenceView}=await imp('source-role-consumer.mjs');
const {assessActionability,canonicalFingerprint,renderCanonicalTelegram,renderCanonicalManual}=await imp('canonical-publication.mjs');
const exact=JSON.parse(gunzipSync(fs.readFileSync('original-source/exact-current-data.json.gz')));
assert.equal(exact.source_cloud_run,37436004948);
assert.equal(exact.source_head,'a29d03a8b5050ed227160a1f4450c14823001704');
assert.equal(exact.sourceHTTP,0);
const retained=exact.rows.find(r=>r.contract_code==='BR-USDT'),c=retained.canonical;
assert.equal(c.analytical_fingerprint,canonicalFingerprint(c));
assert.equal(c.snapshot_id,'S392:BR-USDT:1791275201070');
assert.equal(exact.dispatch.results[0].last_error,'OBSERVE_SOURCE_ROLES_NOT_CLOSED');
const clone=x=>structuredClone(x);
function input(canonical=c){
 const ts=canonical.observed_ts,wave='EDW:BR-USDT:1791238979688:G5';
 // Timing envelope is a controlled wrapper around the unchanged actual
 // canonical row, not a claim to replay original full producer inputs.
 const row={publication_id:retained.publication_id,contract_code:'BR-USDT',run_id:c.run_id,snapshot_id:c.snapshot_id,wave_id:wave,direction:canonical.direction,canonical_state:canonical.state,observed_ts:ts,created_ts:ts+10,analytical_fingerprint:canonical.analytical_fingerprint,canonical_json:JSON.stringify(canonical)};
 const handoff={contract_code:'BR-USDT',source_run_id:c.run_id,wave_id:wave,scan_ts:ts-1000,deep_started_ts:ts-500,deep_completed_ts:ts+100,state:'COMPLETED',execution_status:'COMPLETED',data_sufficiency:'PARTIAL',handoff_direction:'LONG'};
 const early={contract_code:'BR-USDT',wave_id:wave,last_seen_ts:ts,first_seen_ts:ts-10000,lifecycle_stage:'DISCOVERY',direction_hint:'LONG',early_detection_quality_0_100:100};
 return{row,handoff,early,now_ts:ts+1000};
}
function controlledQualified(){
 const out=clone(c),gate=out.source_receipts.find(r=>r.provider==='Gate Public Futures'&&r.metric==='price_change_4h');
 gate.identity_status='CLOSED';gate.identity.status='CLOSED';gate.fact_contract_status='CLOSED';gate.decision_usable=true;
 gate.identity.asset_identity_verified=true;gate.identity.asset_identity_verification_method='CONTROLLED_TEST_ONLY_NOT_SOURCE_PROOF';
 out.metadata.source_role_view=buildRoleEvidenceView(out.source_receipts,{contract:'BR-USDT',observed_ts:out.observed_ts});
 out.analytical_fingerprint=canonicalFingerprint(out);return out;
}
test('actual blocked BR publication cannot occupy an OBSERVE lifecycle before source roles close',()=>{
 const before=JSON.stringify(c);
 assert.equal(assessActionability({canonical:c,lifecycle_event:'OBSERVE'}).reason,'OBSERVE_SOURCE_ROLES_NOT_CLOSED');
 assert.equal(earlySourceRolesClosed(c),false);
 assert.equal(canonicalLifecycleAuthority(input()).status,'OBSERVE_SOURCE_ROLES_NOT_CLOSED');
 assert.equal(JSON.stringify(c),before);
});
test('shared lifecycle skips all writes for the same original blocked canonical, keeping a later fresh transition possible',async()=>{
 const x=input();let writes=0,batches=0;
 const shadow={contract_code:'BR-USDT',observed_ts:c.observed_ts,created_ts:c.observed_ts,direction_hint:'LONG',stage:'SHADOW_OBSERVE_LONG_BIAS',dq_status:'PARTIAL',eq_status:'SHADOW_MEASURABLE',data_sufficiency:'PARTIAL'};
 const db={prepare(sql){if(/INSERT|UPDATE|DELETE|CREATE/i.test(sql))writes++;return{bind(){return this;},run(){throw Error('UNEXPECTED_MUTATION');},first(){throw Error('UNEXPECTED_PERSISTENCE_READ');}};},async batch(){batches++;return[[x.early],[shadow],[],[],[x.row]].map(results=>({success:true,results}));}};
 const result=await runV3TelegramLifecycleSidecar(db,{source_run_id:c.run_id,now_ts:x.now_ts,dispatch_enabled:true,canonical_required:true,completed_handoffs:{status:'CLOSED',source_run_id:c.run_id,handoffs:[x.handoff]}});
 assert.equal(result.transitions[0].status,'OBSERVE_SOURCE_ROLES_NOT_CLOSED');assert.equal(result.transitions[0].dispatch,null);
 assert.equal(writes,0);assert.equal(batches,1);
});
test('controlled valid same-wave independent receipts keep the existing eligible OBSERVE gate, score and approved form',()=>{
 const after=controlledQualified();
 assert.equal(earlySourceRolesClosed(after),true);
 assert.equal(canonicalLifecycleAuthority(input(after)).status,'CLOSED');
 assert.equal(assessActionability({canonical:after,lifecycle_event:'OBSERVE'}).deliver,true);
 for(const key of ['scores','trigger','entry','invalidation','targets'])assert.deepEqual(after[key],c[key]);
 for(const render of [renderCanonicalTelegram,renderCanonicalManual])assert.equal(render({canonical:after,lifecycle_event:'OBSERVE'}).text,render({canonical:c,lifecycle_event:'OBSERVE'}).text);
 const low=clone(after);low.scores.coin_interest_0_100=69.999;low.analytical_fingerprint=canonicalFingerprint(low);assert.equal(canonicalLifecycleAuthority(input(low)).status,'CANONICAL_OBSERVE_THRESHOLD_NOT_CLOSED');
});
test('duplicate HTX origins and unverified Gate identity cannot masquerade as an independent confirmation',()=>{
 const after=controlledQualified(),htx=after.metadata.source_role_view.classified.find(r=>r.source_key==='HTX_OFFICIAL');
 after.metadata.source_role_view.classified=[htx,clone(htx)];assert.equal(earlySourceRolesClosed(after),false);
 const capability=clone(c);capability.metadata.source_role_view.classified.forEach(r=>{r.assigned_roles=['EXECUTION_TRUTH','PRICE_CROSS_VENUE'];r.role_evidence_usable=true;r.independence_group='PRETEND';});
 assert.equal(earlySourceRolesClosed(capability),false);
});
fs.mkdirSync('audit-output',{recursive:true});
fs.writeFileSync('audit-output/actual-observation-preflight-replay.json',JSON.stringify({source_cloud_run:37436004948,source_run_id:c.run_id,snapshot_id:c.snapshot_id,unchanged_original_fingerprint:c.analytical_fingerprint,actual_original_source_role_status:'OBSERVE_SOURCE_ROLES_NOT_CLOSED',actual_original_dispatch_state:exact.dispatch.results[0].state,timing_envelope_controlled:true,positive_qualification_branch_controlled_not_live_source_proof:true,sourceHTTP:0,MAIN:0,Telegram:0,D1:0,fresh_Sent_proven:false},null,2)+'\n');
