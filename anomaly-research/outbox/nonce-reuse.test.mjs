// New targeted controls only; the accepted fifteen protocol cases are reused.
import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../observer/observer.mjs';
import {fixture} from '../observer/fixtures.mjs';
import {newProtocolStore,simulateAtomicCommit,serializeProtocol,restoreProtocol} from './protocol.mjs';
const c=fixture().result.events[0],T=c.first_known_ts+3600000;
function session(options={}){
 let state=newProtocolStore(options),seq=0;
 const apply=(m,extra={})=>{const r=simulateAtomicCommit(state,{expected_revision:state.revision,operation_id:'TARGETED'+(++seq),mutation:m,...extra});state=r.durable_state;return r;};
 apply({kind:'EVENT_TRANSITION',logical_event_id:'CONTROLLED:E',card:c,snapshot_id:'S1',snapshot_raw_sha256:hash('source'),source_ts:T,now_ts:T+1,planned_outcome_keys:['LONG:90d'],transition_group:[{direction:'LONG',to:'CONFIRMED'}],notification:{text:'CONTROLLED',chat_binding:'CONTROLLED_CHAT'}});
 const key=Object.keys(state.outbox)[0];apply({kind:'READY',outbox_key:key,reviewed_form_hash:state.outbox[key].form_hash,now_ts:T+2});
 return {apply,key,get state(){return state;},restore(){state=restoreProtocol(serializeProtocol(state));}};
}
const claim=(x,nonce,now=T+3,owner='CONTROLLED:A')=>({kind:'CLAIM',outbox_key:x.key,owner,nonce,now_ts:now,lease_until:now+10000});
const start=(x,nonce,now=T+4,owner='CONTROLLED:A')=>({kind:'START_SEND',outbox_key:x.key,owner,nonce,now_ts:now});
const reject=(x,nonce,now=T+5,owner='CONTROLLED:A')=>({kind:'TRANSPORT_RESULT',outbox_key:x.key,owner,nonce,now_ts:now,result:'KNOWN_NOT_ACCEPTED',retry_after_ts:now+10,no_acceptance_proof_ref:'CONTROLLED:KNOWN_REJECT'});
const ack=(x,nonce)=>({evidence_class:'CONTROLLED_SIMULATED_ACK',logical_event_id:'CONTROLLED:E',outbox_key:x.key,attempt_nonce:nonce,chat_binding:'CONTROLLED_CHAT',message_id:'101',reply_sha256:hash('CONTROLLED:ACK:'+nonce)});
test('targeted regression: known-rejected attempt nonce cannot be reused; old ACK cannot close fresh attempt',()=>{
 const x=session();x.apply(claim(x,'N1'));x.apply(start(x,'N1'));const oldACK=ack(x,'N1');x.apply(reject(x,'N1'));
 const reuse=x.apply(claim(x,'N1',T+101));assert.equal(reuse.reply,'REJECTED');assert.equal(reuse.reason,'ATTEMPT_NONCE_ALREADY_USED');assert.equal(x.state.outbox[x.key].status,'FAILED_KNOWN_NO_SEND');
 assert.equal(x.apply(claim(x,'N2',T+102)).reply,'CLAIMED');x.apply(start(x,'N2',T+103));
 const late=x.apply({kind:'TRANSPORT_RESULT',outbox_key:x.key,owner:'CONTROLLED:A',nonce:'N2',now_ts:T+104,result:'SIMULATED_ACK',ack:oldACK});assert.equal(late.reply,'REJECTED');assert.equal(late.reason,'EXACT_BOUND_SIMULATED_ACK_REQUIRED');assert.equal(x.state.outbox[x.key].status,'SENDING');
 const right=x.apply({kind:'TRANSPORT_RESULT',outbox_key:x.key,owner:'CONTROLLED:A',nonce:'N2',now_ts:T+105,result:'SIMULATED_ACK',ack:ack(x,'N2')});assert.equal(right.reply,'SENT');assert.equal(x.state.outbox[x.key].actual_send,false);
});
test('historical nonce remains consumed across multiple attempts, owner change and restart',()=>{
 const x=session();x.apply(claim(x,'N1'));x.apply(start(x,'N1'));x.apply(reject(x,'N1'));x.apply(claim(x,'N2',T+101,'CONTROLLED:B'));x.apply(start(x,'N2',T+102,'CONTROLLED:B'));x.apply(reject(x,'N2',T+103,'CONTROLLED:B'));x.restore();
 assert.equal(Object.keys(x.state.attempt_nonce_journal).length,2);assert.equal(x.apply(claim(x,'N1',T+201,'CONTROLLED:C')).reason,'ATTEMPT_NONCE_ALREADY_USED');assert.equal(x.apply(claim(x,'N3',T+202,'CONTROLLED:C')).reply,'CLAIMED');
});
test('expired unstarted claim consumes nonce; recovery cannot authorize its reuse',()=>{
 const x=session();x.apply(claim(x,'N1'));x.apply({kind:'RECOVER',now_ts:T+20000});assert.equal(x.state.outbox[x.key].status,'READY');assert.equal(x.apply(claim(x,'N1',T+20001)).reason,'ATTEMPT_NONCE_ALREADY_USED');assert.equal(x.apply(claim(x,'N2',T+20002)).reply,'CLAIMED');
});
test('bounded nonce journal defers fresh attempts and preserves pending event/outbox/history',()=>{
 const x=session({max_attempt_nonces:1});x.apply(claim(x,'N1'));x.apply(start(x,'N1'));x.apply(reject(x,'N1'));const before=serializeProtocol(x.state),r=x.apply(claim(x,'N2',T+101));assert.equal(r.reply,'DEFERRED_ATTEMPT_NONCE_CAPACITY');assert.equal(serializeProtocol(x.state),before);assert.equal(x.state.events['CONTROLLED:E'].planned_outcome_keys[0],'LONG:90d');assert.equal(Object.keys(x.state.attempt_nonce_journal).length,1);
});
test('nonce consumption shares CAS boundary: before-commit crash does not consume, lost ACK retry does not duplicate',()=>{
 const x=session(),m=claim(x,'N1'),revision=x.state.revision;
 const before=simulateAtomicCommit(x.state,{expected_revision:revision,operation_id:'CLAIM_EXACT',mutation:m,fault:'BEFORE_COMMIT'});assert.equal(Object.keys(before.durable_state.attempt_nonce_journal).length,0);
 const after=simulateAtomicCommit(before.durable_state,{expected_revision:revision,operation_id:'CLAIM_EXACT',mutation:m,fault:'AFTER_COMMIT_BEFORE_REPLY'});assert.equal(after.reply,'UNKNOWN_COMMIT_ACK');const back=restoreProtocol(serializeProtocol(after.durable_state));assert.equal(Object.keys(back.attempt_nonce_journal).length,1);
 const retry=simulateAtomicCommit(back,{expected_revision:revision,operation_id:'CLAIM_EXACT',mutation:m});assert.equal(retry.reply,'ALREADY_APPLIED');assert.equal(Object.keys(retry.durable_state.attempt_nonce_journal).length,1);
});
test('restored legacy model without nonce history fails closed on CLAIM instead of inventing empty history',()=>{
 const x=session(),legacy=structuredClone(x.state);delete legacy.attempt_nonce_journal;delete legacy.limits.max_attempt_nonces;
 // restoreProtocol checks a trusted snapshot checksum, not full schema or
 // native integrity. The claim path still refuses missing nonce history.
 const restored=restoreProtocol(serializeProtocol(legacy));const r=simulateAtomicCommit(restored,{expected_revision:restored.revision,operation_id:'LEGACY',mutation:claim(x,'N1')});assert.equal(r.reply,'REJECTED');assert.equal(r.reason,'ATTEMPT_NONCE_HISTORY_REQUIRED');
});
