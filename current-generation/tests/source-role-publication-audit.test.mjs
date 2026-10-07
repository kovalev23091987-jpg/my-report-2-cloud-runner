import test from 'node:test';import assert from 'node:assert/strict';
import {ROLE_T as T,roleFact} from './source-role-fixtures.mjs';import {buildRoleEvidenceView} from '../files/src/source-role-consumer.mjs';import {earlySourceRolesClosed,auditObservationSourceRoles} from '../files/src/observation-source-role-gate.mjs';
const htx=()=>roleFact({venue:'HTX',metric:'execution_gate_status'}),c=rows=>({run_id:'R',snapshot_id:'S',observed_ts:T,metadata:{contract:'SOL-USDT',source_role_view:buildRoleEvidenceView(rows,{contract:'SOL-USDT',observed_ts:T})}});
test('audit distinguishes missing exact HTX execution, insufficient distinct origins and a closed measured role view without changing the decision',()=>{
 for(const rows of [[],[htx()],[roleFact()],[htx(),roleFact()],[htx(),roleFact({venue:'HTX',source:'BYKARANTELI'})]]){const canonical=c(rows),before=JSON.stringify(canonical),a=auditObservationSourceRoles(canonical);assert.equal(a.observation_source_gate_closed,earlySourceRolesClosed(canonical));assert.equal(JSON.stringify(canonical),before);assert.equal(a.sourceHTTP,0);assert.equal(a.D1,0);}
 assert.deepEqual(auditObservationSourceRoles(c([htx()])).reasons,['FEWER_THAN_TWO_VERIFIED_DISTINCT_ORIGINS']);assert.equal(auditObservationSourceRoles(c([roleFact()])).verified_HTX_execution,false);
});
test('freshness, identity and known-origin exclusions survive into the artifact instead of a capability label or false source success',()=>{
 const a=auditObservationSourceRoles(c([htx(),{...roleFact(),event_ts:T-3600000},roleFact({contract:'BTC-USDT'}),{source:'BYBIT'}]));assert.equal(a.observation_source_gate_closed,false);assert.equal(a.exclusion_reason_counts.STALE_OR_UNVERIFIED_FRESHNESS,1);assert.equal(a.receipts[2].exclusion_reason,'FOREIGN_CONTRACT');assert.equal(a.receipts[3].usable,false);assert.equal(a.usable_role_receipt_count,1);assert.equal(a.receipts[0].event_ts,T-1000);
});
test('diagnostic field bounds never truncate eligibility, duplicate same origins remain one and unknown metadata stays unclosed',()=>{
 const canonical=c([htx(),...Array(80).fill(roleFact())]),a=auditObservationSourceRoles(canonical);assert.equal(a.receipts.length,64);assert.equal(a.omitted_receipt_details,17);assert.equal(a.classified_receipt_count,81);assert.equal(a.distinct_verified_origins.length,2);assert.equal(a.observation_source_gate_closed,true);
 canonical.metadata.source_role_view.status='UNKNOWN';assert.equal(auditObservationSourceRoles(canonical).observation_source_gate_closed,false);assert.equal(auditObservationSourceRoles(null).status,'NOT_CLOSED');
});
