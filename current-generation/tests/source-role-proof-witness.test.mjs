// Production metadata-only change; the exact previous projection is a hash-bound fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=process.env.REPORT2_TEST_RUNTIME?pathToFileURL(process.env.REPORT2_TEST_RUNTIME+'/'):new URL('../files/',import.meta.url);
const consumerURL=new URL('src/source-role-consumer.mjs',root);
const {buildRoleEvidenceView}=await import(consumerURL);
const proposed=await import(new URL('src/observation-source-role-audit.mjs',root));
const baseline=readFileSync(new URL('../../checkpoints/source-role-proof-witness-20261018/original-audit.fixture.mjs',import.meta.url),'utf8');
assert.equal(createHash('sha256').update(baseline).digest('hex'),'e197a38c8866b3f8c3b59b688797cd9477240452c37353467f4cfbeeea529e29');
const original=await import('data:text/javascript;base64,'+Buffer.from(baseline.replace("'./source-role-consumer.mjs'",JSON.stringify(consumerURL.href))).toString('base64'));
const now=1792353804311,contract='BTW-USDT',cases=[];
const htx={source:'HTX_OFFICIAL',provider:'HTX_OFFICIAL',venue:'HTX',metric:'EXECUTION_GATE_STATUS',status:'CLOSED',decision_usable:true,fact_contract_status:'CLOSED',identity_status:'CLOSED',identity:{status:'CLOSED',contract_code:contract,venue:'HTX',quote_asset:'USDT',market_type:'PERP'},contract_code:contract,source_compatible:true,quality_status:'GREEN',coverage_pct:100,normalized_value:1,unit:'BOOLEAN',event_ts:now-1000,received_ts:now-500,max_age_sec:15,freshness_status:'CURRENT_AT_OBSERVATION',normalization_status:'EXPLICIT_NORMALIZED_VALUE'};
const gate={...structuredClone(htx),source:'GATE_OFFICIAL',provider:'GATE_OFFICIAL',venue:'GATE',identity:{...htx.identity,venue:'GATE'},metric:'FUNDING_RATE',unit:'RATE_PER_SETTLEMENT',normalized_value:.0001,max_age_sec:7200,settlement_period:'4H'};
const canonical=rows=>({metadata:{contract,source_role_view:buildRoleEvidenceView(rows,{contract,observed_ts:now})},run_id:'CONTROLLED_NOT_NATIVE',snapshot_id:`CONTROLLED:${contract}:${now}`,observed_ts:now});
function runCase(name,rows,verify){test(name,()=>{
 const input=canonical(rows),before=structuredClone(input);
 const base=original.auditObservationSourceRoles(input),next=proposed.auditObservationSourceRoles(input);
 assert.deepEqual(input,before,'input mutation');
 const withoutProof=structuredClone(next);for(const r of withoutProof.receipts)delete r.retained_fact_proof;
 assert.deepEqual(withoutProof,base,'existing gate/origin/clock/value/reason or count changed');
 assert.equal(next.sourceHTTP,0);assert.equal(next.D1,0);assert.equal(next.decisions_changed,false);
 assert.ok(next.receipts.length<=64);
 verify(next);cases.push({name,status:'PASS',old_audit_byte_semantics_unchanged:true});
});}
runCase('CONTROLLED valid two-origin facts keep original closed result',[htx,gate],a=>{
 assert.equal(a.observation_source_gate_closed,true);
 assert.deepEqual(a.receipts[1].retained_fact_proof,{decision_usable:true,fact_contract_status:'CLOSED',identity_status:'CLOSED',identity_object_status:'CLOSED',source_compatible:true,freshness_status:'CURRENT_AT_OBSERVATION',normalization_status:'EXPLICIT_NORMALIZED_VALUE'});
});
for(const field of ['decision_usable','fact_contract_status','identity_status','identity_object_status']){
 const r=structuredClone(gate);if(field==='identity_object_status')r.identity.status='NOT_CLOSED';else r[field]=field==='decision_usable'?false:'NOT_CLOSED';
 runCase('CONTROLLED different failed original proof '+field,[htx,r],a=>{
  assert.equal(a.observation_source_gate_closed,false);
  assert.equal(a.receipts[1].exclusion_reason,'FACT_OR_IDENTITY_NOT_VERIFIED');
  assert.equal(a.receipts[1].retained_fact_proof[field],field==='decision_usable'?false:'NOT_CLOSED');
  assert.equal(a.receipts[1].normalized_value,null);
 });
}
for(const field of ['decision_usable','fact_contract_status','identity_status','identity_object_status']){
 const r=structuredClone(gate);if(field==='identity_object_status')delete r.identity.status;else delete r[field];
 runCase('CONTROLLED missing proof remains null '+field,[htx,r],a=>{
  assert.equal(a.observation_source_gate_closed,false);
  assert.equal(a.receipts[1].retained_fact_proof[field],null);
 });
}
runCase('CONTROLLED malformed/secret values are neither coerced nor echoed',[htx,{...gate,decision_usable:'true',fact_contract_status:'SECRET_DO_NOT_EXPORT',identity_status:{status:'CLOSED'},identity:{...gate.identity,status:1},source_compatible:'true',freshness_status:'SECRET_DO_NOT_EXPORT',normalization_status:'SECRET_DO_NOT_EXPORT',raw_value:'SECRET_DO_NOT_EXPORT'}],a=>{
 assert.deepEqual(Object.values(a.receipts[1].retained_fact_proof),[null,null,null,null,null,null,null]);
 assert.equal(JSON.stringify(a).includes('SECRET_DO_NOT_EXPORT'),false);
 assert.equal(a.observation_source_gate_closed,false);
});
runCase('CONTROLLED false usability plus STALE remains the same first exclusion',[htx,{...gate,decision_usable:false,freshness_status:'STALE'}],a=>{
 assert.equal(a.receipts[1].exclusion_reason,'FACT_OR_IDENTITY_NOT_VERIFIED');
 assert.equal(a.receipts[1].retained_fact_proof.decision_usable,false);
 assert.equal(a.receipts[1].retained_fact_proof.freshness_status,'STALE');
});
runCase('CONTROLLED source incompatibility keeps its original reason',[htx,{...gate,source_compatible:false}],a=>{
 assert.equal(a.receipts[1].exclusion_reason,'SOURCE_INCOMPATIBLE');
 assert.equal(a.receipts[1].retained_fact_proof.source_compatible,false);
});
runCase('CONTROLLED source-not-closed does not imply later proof checks executed',[htx,{...gate,status:'NOT_APPLICABLE'}],a=>{
 assert.equal(a.receipts[1].exclusion_reason,'SOURCE_NOT_CLOSED');
 assert.equal(a.receipts[1].retained_fact_proof.fact_contract_status,'CLOSED');
});
runCase('CONTROLLED 70 receipts preserve existing 64-detail bound',[htx,...Array.from({length:69},()=>gate)],a=>{
 assert.equal(a.receipts.length,64);assert.equal(a.omitted_receipt_details,6);
 assert.equal(a.classified_receipt_count,70);
});
