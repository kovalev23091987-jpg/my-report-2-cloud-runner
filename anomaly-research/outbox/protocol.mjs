// CONTROLLED pure state-machine model. No database schema, sender or network.
import {hash} from '../observer/observer.mjs';
import {commitOutcomePlan} from '../statistics/outcomes.mjs';
const need=(x,m)=>{if(!x)throw Error(m);},str=x=>typeof x==='string'&&x.length>0;
const ts=x=>Number.isSafeInteger(x)&&x>=1e12,hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function newProtocolStore({max_operations=4096,max_outbox=1024,max_attempt_nonces=4096}={}){
 need(Number.isInteger(max_operations)&&max_operations>0&&Number.isInteger(max_outbox)&&max_outbox>0&&Number.isInteger(max_attempt_nonces)&&max_attempt_nonces>0,'BOUNDS_INVALID');
 return {schema:'CONTROLLED_ATOMIC_OUTBOX_MODEL_V1',revision:0,events:{},outbox:{},operations:{},attempt_nonce_journal:{},limits:{max_operations,max_outbox,max_attempt_nonces},network_enabled:false,native_persistence_qualified:false};
}
function row(state,key){need(state.outbox[key],'OUTBOX_MISSING');return state.outbox[key];}
function sameClaim(o,m){need(o.claim_owner===m.owner&&o.attempt_nonce===m.nonce,'FOREIGN_OR_STALE_CLAIM');}
function boundOutcomePlan(card,plan,logical_event_id,keys){
 if(plan===undefined)return null;
 need(plan&&typeof plan==='object'&&!Array.isArray(plan),'EXACT_FROZEN_OUTCOME_PLAN_REQUIRED');
 const rebuilt=commitOutcomePlan(card,{anchor:plan.anchor,committed_ts:plan.committed_ts,success_pct:plan.success_pct,opposite_pct:plan.opposite_pct,max_gap_ms:plan.max_gap_ms,endpoint_tolerance_ms:plan.endpoint_tolerance_ms,horizons:plan.horizons});
 need(hash(rebuilt)===hash(plan),'EXACT_FROZEN_OUTCOME_PLAN_REQUIRED');
 const expected=plan.horizons.flatMap(horizon=>plan.directions.map(direction=>hash({logical_event_id,horizon,direction})));
 need(hash([...keys].sort())===hash(expected.sort()),'EXACT_PLANNED_OUTCOME_CELLS_REQUIRED');
 return plan.plan_hash;
}
function exactAck(o,a){
 need(a?.evidence_class==='CONTROLLED_SIMULATED_ACK'&&a.logical_event_id===o.logical_event_id&&a.outbox_key===o.outbox_key&&a.attempt_nonce===o.attempt_nonce&&a.chat_binding===o.chat_binding&&typeof a.message_id==='string'&&/^[1-9][0-9]*$/.test(a.message_id)&&hex(a.reply_sha256),'EXACT_BOUND_SIMULATED_ACK_REQUIRED');
 if(o.outcome_plan_hash)need(a.outcome_plan_hash===o.outcome_plan_hash,'EXACT_BOUND_OUTCOME_PLAN_ACK_REQUIRED');
}
function mutate(s,m){
 need(ts(m?.now_ts),'NOW_REQUIRED');
 if(m.kind==='EVENT_TRANSITION'){
  const c=m.card,{card_hash,...body}=c||{};
  need(card_hash===hash(body)&&str(m.logical_event_id)&&str(m.snapshot_id)&&hex(m.snapshot_raw_sha256)&&ts(m.source_ts)&&m.source_ts>=c.first_known_ts&&m.source_ts<=m.now_ts&&m.now_ts-m.source_ts<=300000&&Array.isArray(m.planned_outcome_keys)&&m.planned_outcome_keys.length>0&&new Set(m.planned_outcome_keys).size===m.planned_outcome_keys.length&&Array.isArray(m.transition_group)&&m.transition_group.length>0&&str(m.notification?.text)&&str(m.notification?.chat_binding),'TRANSITION_ARGUMENTS');
  const planHash=boundOutcomePlan(c,m.outcome_plan,m.logical_event_id,m.planned_outcome_keys);
  const old=s.events[m.logical_event_id],fingerprint=hash({snapshot_id:m.snapshot_id,snapshot_raw_sha256:m.snapshot_raw_sha256,source_ts:m.source_ts,transition_group:m.transition_group,notification:m.notification,...(planHash?{outcome_plan_hash:planHash}:{})});
  if(old){
   need(old.card.card_hash===card_hash&&hash(old.planned_outcome_keys)===hash(m.planned_outcome_keys),'IMMUTABLE_CARD_OR_PLAN_CONFLICT');
   if(old.outcome_plan_hash)need(planHash===old.outcome_plan_hash,'IMMUTABLE_OUTCOME_PLAN_CONFLICT');
   else need(planHash===null,'LEGACY_EVENT_PLAN_BINDING_UNRESOLVED');
   if(old.last_snapshot_id===m.snapshot_id){need(old.last_source_fingerprint===fingerprint,'CONFLICTING_SNAPSHOT');return 'DUPLICATE_SOURCE';}
   need(m.source_ts>old.last_source_ts,'SOURCE_TIME_NOT_MONOTONIC');
  }
  const states={LONG:'WAITING',SHORT:'WAITING',...old?.hypothesis_states},seen=new Set();let changed=0;
  for(const t of m.transition_group){need(['LONG','SHORT'].includes(t?.direction)&&['CONFIRMED','REFUTED'].includes(t.to)&&!seen.has(t.direction),'TRANSITION_GROUP_INVALID');seen.add(t.direction);const from=states[t.direction];if(from===t.to)continue;need(from!=='REFUTED','REFUTED_HYPOTHESIS_CANNOT_REOPEN');states[t.direction]=t.to;changed++;}
  if(!changed)return 'NO_CHANGE';
  need(Object.keys(s.outbox).length<s.limits.max_outbox,'OUTBOX_CAPACITY');
  const seq=(old?.transition_sequence??0)+1,key=hash({logical_event_id:m.logical_event_id,transition_sequence:seq});
  s.events[m.logical_event_id]={card:structuredClone(c),first_known_ts:old?.first_known_ts??c.first_known_ts,planned_outcome_keys:[...m.planned_outcome_keys],transition_sequence:seq,last_snapshot_id:m.snapshot_id,last_source_ts:m.source_ts,last_source_fingerprint:fingerprint,hypothesis_states:states,transition_group:structuredClone(m.transition_group),...(planHash?{outcome_plan_hash:planHash,plan_binding:'FROZEN_MODEL_PLAN_V1'}:{})};
  s.outbox[key]={outbox_key:key,logical_event_id:m.logical_event_id,transition_sequence:seq,chat_binding:m.notification.chat_binding,text:m.notification.text,form_hash:hash(m.notification.text),status:'DRAFT',claim_owner:null,attempt_nonce:null,lease_until:null,message_id:null,network_enabled:false,actual_send:false,...(planHash?{outcome_plan_hash:planHash,plan_binding:'FROZEN_MODEL_PLAN_V1'}:{})};
  return 'EVENT_AND_OUTBOX_ATOMICALLY_STAGED';
 }
 const o=m.outbox_key?row(s,m.outbox_key):null;
 if(m.kind==='READY'){
  need(o.status==='DRAFT'&&m.reviewed_form_hash===o.form_hash,'REVIEWED_EXACT_DRAFT_REQUIRED');o.status='READY';return 'CONTROLLED_READY_NO_SEND';
 }
 if(m.kind==='CLAIM'){
  need(['READY','FAILED_KNOWN_NO_SEND'].includes(o.status)&&(!o.retry_after_ts||o.retry_after_ts<=m.now_ts)&&str(m.owner)&&str(m.nonce)&&m.nonce.length<=128&&ts(m.lease_until)&&m.lease_until>m.now_ts&&m.lease_until-m.now_ts<=600000,'CLAIM_NOT_ALLOWED');
  // An old model snapshot without attempt history cannot safely start a new
  // attempt. Never silently migrate it by inventing an empty nonce journal.
  need(s.attempt_nonce_journal&&typeof s.attempt_nonce_journal==='object'&&!Array.isArray(s.attempt_nonce_journal)&&Number.isInteger(s.limits.max_attempt_nonces)&&s.limits.max_attempt_nonces>0,'ATTEMPT_NONCE_HISTORY_REQUIRED');
  const nonceKey=hash({attempt_nonce:m.nonce});
  need(!Object.hasOwn(s.attempt_nonce_journal,nonceKey),'ATTEMPT_NONCE_ALREADY_USED');
  if(Object.keys(s.attempt_nonce_journal).length>=s.limits.max_attempt_nonces)return 'DEFERRED_ATTEMPT_NONCE_CAPACITY';
  // This journal and the claim are part of the same simulated CAS commit.
  // Recovery, known rejection and SENT never erase consumed nonce identities.
  s.attempt_nonce_journal[nonceKey]={attempt_nonce:m.nonce,outbox_key:o.outbox_key,claim_owner:m.owner,claimed_ts:m.now_ts};
  o.status='CLAIMED';o.claim_owner=m.owner;o.attempt_nonce=m.nonce;o.lease_until=m.lease_until;return 'CLAIMED';
 }
 if(m.kind==='START_SEND'){
  sameClaim(o,m);need(o.status==='CLAIMED'&&m.now_ts<o.lease_until,'CLAIM_EXPIRED_OR_NOT_READY');
  o.status='SENDING';o.started_ts=m.now_ts;return 'SEND_INTENT_STAGED_NO_TRANSPORT';
 }
 if(m.kind==='TRANSPORT_RESULT'){
  sameClaim(o,m);need(o.status==='SENDING','NO_ACTIVE_ATTEMPT');
  if(m.result==='SIMULATED_ACK'){exactAck(o,m.ack);o.status='SENT';o.message_id=m.ack.message_id;o.ack_sha256=m.ack.reply_sha256;o.delivery_proof_class='CONTROLLED_SIMULATED_ACK';}
  else if(m.result==='KNOWN_NOT_ACCEPTED'){need(ts(m.retry_after_ts)&&m.retry_after_ts>m.now_ts&&str(m.no_acceptance_proof_ref),'EXPLICIT_NO_ACCEPTANCE_REQUIRED');o.status='FAILED_KNOWN_NO_SEND';o.retry_after_ts=m.retry_after_ts;o.no_acceptance_proof_ref=m.no_acceptance_proof_ref;}
  else if(m.result==='TIMEOUT'||m.result==='UNCERTAIN_ERROR')o.status='UNKNOWN_SEND';
  else throw Error('TRANSPORT_RESULT_UNKNOWN');
  return o.status;
 }
 if(m.kind==='RECONCILE_UNKNOWN'){
  need(o.status==='UNKNOWN_SEND','NOT_UNKNOWN');
  if(!m.ack)return 'UNRESOLVED_NO_RETRY';
  exactAck(o,m.ack);o.status='SENT';o.message_id=m.ack.message_id;o.ack_sha256=m.ack.reply_sha256;o.delivery_proof_class='CONTROLLED_SIMULATED_ACK';return 'BOUND_ACK_RECONCILED';
 }
 if(m.kind==='RECOVER'){
  let changed=0;for(const x of Object.values(s.outbox)){
   if(x.lease_until===null||x.lease_until>m.now_ts)continue;
   if(x.status==='CLAIMED'){x.status='READY';x.claim_owner=null;x.attempt_nonce=null;x.lease_until=null;changed++;}
   else if(x.status==='SENDING'){x.status='UNKNOWN_SEND';changed++;}
  }
  return changed?'CLAIMS_RECOVERED':'NO_CHANGE';
 }
 throw Error('MUTATION_UNKNOWN');
}
export function simulateAtomicCommit(state,{expected_revision,operation_id,mutation,fault='NONE'}={}){
 need(state?.schema==='CONTROLLED_ATOMIC_OUTBOX_MODEL_V1'&&state.network_enabled===false&&str(operation_id)&&['NONE','BEFORE_COMMIT','AFTER_COMMIT_BEFORE_REPLY'].includes(fault),'MODEL_ARGUMENTS');
 const digest=hash(mutation),prior=state.operations[operation_id];
 if(prior)return {durable_state:state,reply:prior.digest===digest?'ALREADY_APPLIED':'CONFLICTING_OPERATION_ID',network_calls:0,native_writes:0};
 if(expected_revision!==state.revision)return {durable_state:state,reply:'CAS_CONFLICT',network_calls:0,native_writes:0};
 if(Object.keys(state.operations).length>=state.limits.max_operations)return {durable_state:state,reply:'DEFERRED_JOURNAL_CAPACITY',network_calls:0,native_writes:0};
 const next=structuredClone(state);let result;
 try{result=mutate(next,mutation);}catch(e){return {durable_state:state,reply:'REJECTED',reason:e.message,network_calls:0,native_writes:0};}
 if(['NO_CHANGE','DUPLICATE_SOURCE','UNRESOLVED_NO_RETRY','DEFERRED_ATTEMPT_NONCE_CAPACITY'].includes(result))return {durable_state:state,reply:result,network_calls:0,native_writes:0};
 if(fault==='BEFORE_COMMIT')return {durable_state:state,reply:'SIMULATED_CRASH_BEFORE_COMMIT',network_calls:0,native_writes:0};
 next.revision++;next.operations[operation_id]={digest,result,revision:next.revision};
 return {durable_state:next,reply:fault==='AFTER_COMMIT_BEFORE_REPLY'?'UNKNOWN_COMMIT_ACK':result,network_calls:0,native_writes:0};
}
// Trusted-model snapshot only: checksum detects accidental byte changes. This
// is not full schema validation, authentication, native durability or a proof
// that a caller has retained the complete historical nonce journal.
export function restoreProtocol(serialized){const x=JSON.parse(serialized);need(x?.state?.schema==='CONTROLLED_ATOMIC_OUTBOX_MODEL_V1'&&x.sha256===hash(x.state)&&x.state.network_enabled===false,'MODEL_CHECKSUM');return structuredClone(x.state);}
export function serializeProtocol(state){return JSON.stringify({state,sha256:hash(state)});}
