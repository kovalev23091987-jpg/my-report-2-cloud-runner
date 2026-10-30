import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../observer/observer.mjs';
import {fixture} from '../observer/fixtures.mjs';
import {newProtocolStore,simulateAtomicCommit,serializeProtocol,restoreProtocol} from './protocol.mjs';
const c=fixture().result.events[0],T=c.first_known_ts+3600000;
const event=(extra={})=>({kind:'EVENT_TRANSITION',logical_event_id:'CONTROLLED:LOGICAL1',card:c,snapshot_id:'S1',snapshot_raw_sha256:hash('CONTROLLED:SOURCE'),source_ts:T,now_ts:T+1,planned_outcome_keys:['LONG:30d','LONG:90d'],transition_group:[{direction:'LONG',to:'CONFIRMED'},{direction:'SHORT',to:'REFUTED'}],notification:{text:'CONTROLLED Блок аномалий',chat_binding:'CONTROLLED_CHAT'},...extra});
function commit(s,m,id='OP'+(s.revision+1),extra={}){return simulateAtomicCommit(s,{expected_revision:s.revision,operation_id:id,mutation:m,...extra});}
function setup(){const r=commit(newProtocolStore(),event());return {state:r.durable_state,key:Object.keys(r.durable_state.outbox)[0]};}
function ready(){const {state,key}=setup();return {state:commit(state,{kind:'READY',now_ts:T+2,outbox_key:key,reviewed_form_hash:hash(event().notification.text)}).durable_state,key};}
function claimed(){const {state,key}=ready();return {state:commit(state,{kind:'CLAIM',now_ts:T+3,outbox_key:key,owner:'CONTROLLED:A',nonce:'N1',lease_until:T+10000}).durable_state,key};}
function sending(){const {state,key}=claimed();return {state:commit(state,{kind:'START_SEND',now_ts:T+4,outbox_key:key,owner:'CONTROLLED:A',nonce:'N1'}).durable_state,key};}
const ack=(s,key)=>({evidence_class:'CONTROLLED_SIMULATED_ACK',logical_event_id:s.outbox[key].logical_event_id,outbox_key:key,attempt_nonce:s.outbox[key].attempt_nonce,chat_binding:s.outbox[key].chat_binding,message_id:'101',reply_sha256:hash('CONTROLLED:ACK')});
test('one transition group atomically keeps card/watch/outcome refs and one DRAFT for both directions',()=>{const {state,key}=setup();assert.equal(Object.keys(state.events).length,1);assert.equal(Object.keys(state.outbox).length,1);assert.equal(state.outbox[key].status,'DRAFT');assert.equal(state.events['CONTROLLED:LOGICAL1'].planned_outcome_keys.length,2);assert.equal(state.network_enabled,false);});
test('crash before commit leaves neither orphan watch nor outbox; retry applies once',()=>{
 const s=newProtocolStore(),m=event(),a=commit(s,m,'ONE',{fault:'BEFORE_COMMIT'});assert.deepEqual(a.durable_state,s);assert.equal(a.reply,'SIMULATED_CRASH_BEFORE_COMMIT');assert.equal(Object.keys(commit(a.durable_state,m,'ONE').durable_state.outbox).length,1);
});
test('lost commit ACK restores both rows and original operation retry is idempotent despite stale revision',()=>{
 const s=newProtocolStore(),m=event(),a=commit(s,m,'ONE',{fault:'AFTER_COMMIT_BEFORE_REPLY'});assert.equal(a.reply,'UNKNOWN_COMMIT_ACK');const back=restoreProtocol(serializeProtocol(a.durable_state)),b=simulateAtomicCommit(back,{expected_revision:0,operation_id:'ONE',mutation:m});assert.equal(b.reply,'ALREADY_APPLIED');assert.equal(Object.keys(b.durable_state.outbox).length,1);
});
test('concurrent stale CAS and conflicting operation id cannot partially mutate',()=>{
 const a=commit(newProtocolStore(),event(),'ONE'),different=event({logical_event_id:'OTHER'});assert.equal(simulateAtomicCommit(a.durable_state,{expected_revision:0,operation_id:'TWO',mutation:different}).reply,'CAS_CONFLICT');assert.equal(commit(a.durable_state,different,'ONE').reply,'CONFLICTING_OPERATION_ID');assert.equal(Object.keys(a.durable_state.events).length,1);
});
test('same snapshot or unchanged transition cannot enqueue duplicate; old source cannot rewind event',()=>{
 const {state}=setup();assert.equal(commit(state,event(),'NEWOP').reply,'DUPLICATE_SOURCE');assert.equal(commit(state,event({snapshot_id:'S2',source_ts:T+100,now_ts:T+101})).reply,'NO_CHANGE');assert.equal(commit(state,event({snapshot_id:'OLD',source_ts:T-100,now_ts:T+1})).reason,'SOURCE_TIME_NOT_MONOTONIC');assert.equal(Object.keys(state.outbox).length,1);
});
test('new binding/outcome plan cannot overwrite canonical card or pending90d refs',()=>{
 const {state}=setup();const r=commit(state,event({snapshot_id:'S2',source_ts:T+100,now_ts:T+101,planned_outcome_keys:['LONG:30d']}));assert.equal(r.reply,'REJECTED');assert.equal(r.reason,'IMMUTABLE_CARD_OR_PLAN_CONFLICT');assert.equal(state.events['CONTROLLED:LOGICAL1'].planned_outcome_keys.length,2);
});
test('foreign claim and expired claim cannot start a send',()=>{
 const {state,key}=claimed();assert.equal(commit(state,{kind:'START_SEND',outbox_key:key,now_ts:T+4,owner:'OTHER',nonce:'N1'}).reason,'FOREIGN_OR_STALE_CLAIM');assert.equal(commit(state,{kind:'START_SEND',outbox_key:key,now_ts:T+10001,owner:'CONTROLLED:A',nonce:'N1'}).reason,'CLAIM_EXPIRED_OR_NOT_READY');
});
test('expired unstarted claim safely recovers, old nonce cannot start new claim',()=>{
 const {state,key}=claimed(),r=commit(state,{kind:'RECOVER',now_ts:T+10001}).durable_state;assert.equal(r.outbox[key].status,'READY');const a=commit(r,{kind:'CLAIM',now_ts:T+10002,outbox_key:key,owner:'CONTROLLED:B',nonce:'N2',lease_until:T+20000}).durable_state;assert.equal(commit(a,{kind:'START_SEND',now_ts:T+10003,outbox_key:key,owner:'CONTROLLED:A',nonce:'N1'}).reason,'FOREIGN_OR_STALE_CLAIM');
});
test('crash after durable send intent becomes UNKNOWN_SEND, not automatic retry',()=>{
 const {state,key}=sending(),r=commit(state,{kind:'RECOVER',now_ts:T+10001}).durable_state;assert.equal(r.outbox[key].status,'UNKNOWN_SEND');assert.equal(commit(r,{kind:'CLAIM',now_ts:T+10002,outbox_key:key,owner:'B',nonce:'N2',lease_until:T+20000}).reason,'CLAIM_NOT_ALLOWED');assert.equal(r.outbox[key].actual_send,false);
});
test('timeout keeps unknown across restart; no conclusive ACK cannot become retry permission',()=>{
 const {state,key}=sending(),a=commit(state,{kind:'TRANSPORT_RESULT',now_ts:T+5,outbox_key:key,owner:'CONTROLLED:A',nonce:'N1',result:'TIMEOUT'}).durable_state,back=restoreProtocol(serializeProtocol(a));assert.equal(back.outbox[key].status,'UNKNOWN_SEND');assert.equal(commit(back,{kind:'RECONCILE_UNKNOWN',now_ts:T+6,outbox_key:key}).reply,'UNRESOLVED_NO_RETRY');
});
test('ACK requires exact episode/outbox/chat/attempt/message id, not a success flag',()=>{
 const {state,key}=sending(),base={kind:'TRANSPORT_RESULT',now_ts:T+5,outbox_key:key,owner:'CONTROLLED:A',nonce:'N1',result:'SIMULATED_ACK'};
 for(const wrong of [{api_ok:true},{...ack(state,key),chat_binding:'OTHER'},{...ack(state,key),attempt_nonce:'N2'},{...ack(state,key),message_id:''}])assert.equal(commit(state,{...base,ack:wrong}).reply,'REJECTED');
 const a=commit(state,{...base,ack:ack(state,key)}).durable_state;assert.equal(a.outbox[key].status,'SENT');assert.equal(a.outbox[key].delivery_proof_class,'CONTROLLED_SIMULATED_ACK');assert.equal(a.outbox[key].actual_send,false);
});
test('bound simulated ACK can resolve unknown once; real delivery remains unqualified',()=>{
 const {state,key}=sending(),a=commit(state,{kind:'TRANSPORT_RESULT',now_ts:T+5,outbox_key:key,owner:'CONTROLLED:A',nonce:'N1',result:'UNCERTAIN_ERROR'}).durable_state,b=commit(a,{kind:'RECONCILE_UNKNOWN',now_ts:T+6,outbox_key:key,ack:ack(a,key)}).durable_state;assert.equal(b.outbox[key].status,'SENT');assert.equal(b.native_persistence_qualified,false);assert.equal(b.network_enabled,false);
});
test('only explicit no-acceptance proof permits retry after its scheduled delay',()=>{
 const {state,key}=sending(),a=commit(state,{kind:'TRANSPORT_RESULT',now_ts:T+5,outbox_key:key,owner:'CONTROLLED:A',nonce:'N1',result:'KNOWN_NOT_ACCEPTED',retry_after_ts:T+100,no_acceptance_proof_ref:'CONTROLLED:KNOWN_REJECT'}).durable_state;assert.equal(a.outbox[key].status,'FAILED_KNOWN_NO_SEND');assert.equal(commit(a,{kind:'CLAIM',now_ts:T+6,outbox_key:key,owner:'B',nonce:'N2',lease_until:T+1000}).reply,'REJECTED');assert.equal(commit(a,{kind:'CLAIM',now_ts:T+101,outbox_key:key,owner:'B',nonce:'N2',lease_until:T+1000}).reply,'CLAIMED');
});
test('bounded outbox and operation journal defer without orphan rows or dedup eviction',()=>{
 const a=commit(newProtocolStore({max_outbox:1}),event()).durable_state,r=commit(a,event({logical_event_id:'NEW'}));assert.equal(r.reason,'OUTBOX_CAPACITY');assert.deepEqual(r.durable_state,a);
 const b=commit(newProtocolStore({max_operations:1}),event()).durable_state;assert.equal(commit(b,{kind:'RECOVER',now_ts:T+20000}).reply,'DEFERRED_JOURNAL_CAPACITY');assert.equal(Object.keys(b.operations).length,1);
});
test('corrupt restart and unsupported transition reopening fail without writes',()=>{
 const {state}=setup(),x=JSON.parse(serializeProtocol(state));x.state.revision++;assert.throws(()=>restoreProtocol(JSON.stringify(x)),/CHECKSUM/);
 const r=commit(state,event({snapshot_id:'S2',source_ts:T+10,now_ts:T+11,transition_group:[{direction:'SHORT',to:'CONFIRMED'}]}));assert.equal(r.reason,'REFUTED_HYPOTHESIS_CANNOT_REOPEN');assert.deepEqual(r.durable_state,state);
});
