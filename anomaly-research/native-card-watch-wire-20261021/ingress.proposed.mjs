// TEXT PROPOSAL. Installed only by the coordinator after the affected common.
// No acquisition, SQL, admission grant, sender or independent scheduler here.
import {capturedHtxAnomalyBasis} from './htx-signed-tape.mjs';
import {capturedClosedWindow,lockedOutcomePlan,opaqueLogicalEventKey,prepareAnomalyCommit,nativeRecordCompatibility,DOMAIN_BOUNDS,canonical,digest} from './anomaly-native-domain.mjs';
import {opaqueRecordInstrument,detectClosed,newMemory,capture,hash} from './anomaly-record-observer.mjs';

const need=(ok,reason)=>{if(!ok)throw Error(reason);};
const clone=structuredClone;
const falseQualifications=Object.freeze({native_epoch_qualified:false,event_first_knowledge_qualified:false,native_admission_qualified:false,SENT_claimed:false});
function resolveFromRetainedOrigin(draft,observation,origin){
  if(origin===null)return prepareAnomalyCommit(draft);
  need(origin?.schema==='VERIFIED_RETAINED_ANOMALY_ORIGIN_V1'&&origin.logical_event_id===draft.logical_event_id,'VERIFIED_RETAINED_ORIGIN_REQUIRED');
  for(const name of ['card','descriptor','plan','state']){
    const text=origin[name+'_json'];
    need(typeof text==='string'&&Buffer.byteLength(text)<=DOMAIN_BOUNDS[name],'ORIGIN_TEXT_BOUND_REQUIRED');
    need(digest(text)===origin[name+'_sha256']&&canonical(origin[name])===text,'ORIGIN_PART_CONFLICT');
  }
  const current=prepareAnomalyCommit({logical_event_id:origin.logical_event_id,operation_id:origin.operation_id,expected_revision:origin.revision-1,card:origin.card,descriptor:origin.descriptor,plan:origin.plan,state:origin.state});
  need(current.request.request_sha256===origin.request_sha256&&origin.first_known_ts===origin.card.first_known_ts,'ORIGIN_CURRENT_REQUEST_CONFLICT');
  need(canonical(origin.card.instrument)===canonical(opaqueRecordInstrument(origin.descriptor))&&canonical(origin.plan)===canonical(lockedOutcomePlan(origin.card)),'ORIGIN_RECORD_OR_FULL_PLAN_CONFLICT');
  const compatibility=nativeRecordCompatibility(origin.descriptor,draft.descriptor);
  need(compatibility==='SAME_OPAQUE_RECORD_NOT_QUALIFIED_EPOCH',compatibility);
  if(origin.state.revisions.some(item=>item.observation_kind==='CAPTURED_CLOSED_WINDOW_FACTS_V1'&&item.observation_fingerprint===observation.observation_fingerprint))return{status:'STORED_DUPLICATE',logical_event_id:origin.logical_event_id,observation_fingerprint:observation.observation_fingerprint,card_sha256:origin.card_sha256,descriptor_sha256:origin.descriptor_sha256,plan_sha256:origin.plan_sha256,first_known_ts:origin.first_known_ts,expected_revision:origin.revision,write_required:false,durable_new_observation:false,...falseQualifications};
  need(draft.state.evaluated_ts>=origin.state.evaluated_ts,'OBSERVATION_BEFORE_RETAINED_STATE');
  const deferred=reason=>({status:'DEFERRED_CAPACITY',reason,logical_event_id:origin.logical_event_id,observation_fingerprint:observation.observation_fingerprint,card_sha256:origin.card_sha256,descriptor_sha256:origin.descriptor_sha256,plan_sha256:origin.plan_sha256,first_known_ts:origin.first_known_ts,expected_revision:origin.revision,write_required:false,durable_new_observation:false,...falseQualifications});
  if(origin.state.revisions.length>=DOMAIN_BOUNDS.revisions||Object.keys(origin.state.outbox).length>=DOMAIN_BOUNDS.outbox)return deferred('REVISIONS_OR_OUTBOX_CAPACITY_NO_DROP');
  const state=clone(origin.state);
  state.evaluated_ts=draft.state.evaluated_ts;
  state.revisions.push(clone(observation));
  if(Buffer.byteLength(canonical(state))>DOMAIN_BOUNDS.state)return deferred('STATE_BYTES_CAPACITY_NO_DROP');
  const operation_id='ANOMALY_OBS:'+digest({logical_event_id:origin.logical_event_id,expected_revision:origin.revision,observation_fingerprint:observation.observation_fingerprint});
  return prepareAnomalyCommit({operation_id,expected_revision:origin.revision,logical_event_id:origin.logical_event_id,card:clone(origin.card),descriptor:clone(origin.descriptor),plan:clone(origin.plan),state});
}
function lazyCandidate(draft,observation){
  // Keep only bounded card/state/descriptor/plan, not the source body or basis.
  const retainedDraft=clone(draft),retainedObservation=clone(observation);
  return{status:'ANOMALY_DRAFT_CANDIDATE',logical_event_id:draft.logical_event_id,prepare_from_origin:origin=>resolveFromRetainedOrigin(retainedDraft,retainedObservation,origin),observation_fingerprint:observation.observation_fingerprint,scope:'ONE_INITIAL_15M_EVENT_FROM_SELECTED_DEEP_NOT_INDEPENDENT105',first_known_ts:draft.card.first_known_ts,first_durable_recorded_ts:null,empirical_accuracy:null,...falseQualifications,provider_HTTP:0,SQL:0};
}
export function prepareCapturedAnomalyCardWatch({contract,known_ts}={}) {
  try {
    const basis=capturedHtxAnomalyBasis({contract,now:known_ts});
    if(!basis)return {status:'NO_SAME_COMPLETED_CAPTURE',provider_HTTP:0,SQL:0};
    const window=capturedClosedWindow({basis,timeframe:'15m',alignment_offset_ms:0,known_ts,source_ref:'SAME_HTX_DEEP_CAPTURE_METADATA_RECORD'});
    if(window.status!=='CLOSED_WINDOW_RECORD_BOUND_NOT_NATIVE_QUALIFIED')return {status:window.status,provider_HTTP:0,SQL:0};
    const raw_ref='HTX_CAPTURE_TEXT_SHA256:'+window.body_text_sha256;
    const provenance={raw_sha256:window.body_text_sha256,raw_ref,source_as_of_ts:window.source_as_of_ts,received_ts:window.received_ts,evidence_class:'RETAINED',retention_scope:'SAME_PROCESS_CAPTURE_NOT_DURABLE_NATIVE_ACK',body_completed_ts:window.body_completed_ts,hash_scope:window.hash_scope,metadata_row_sha256:window.descriptor.parsed_metadata_row_sha256};
    const detected=detectClosed({instrument:opaqueRecordInstrument(window.descriptor),timeframe:window.timeframe,alignment_offset_ms:window.alignment_offset_ms,bars:window.bars,provenance,known_ts,mode:'REPLAY'});
    if(detected.events.length===0)return {status:'NO_EVENT_IN_THIS_CLOSED_WINDOW',empirical_accuracy:null,provider_HTTP:0,SQL:0};
    if(detected.events.length!==1)throw Error('BOUNDED_SINGLE_INITIAL_EVENT_REQUIRED');
    const {card_hash:ignored,...original}=detected.events[0];
    const card={...original,knowledge_limits:{first_known_scope:'THIS_WORKER_CAPTURE_RECORD_NOT_GLOBAL_EVENT_FIRST_KNOWLEDGE',candidate_recorded_ts:known_ts,first_durable_recorded_ts:null,source_reference_scope:'IN_PROCESS_CAPTURE_BODY_HASH_NOT_NATIVE_STORAGE_ACK'},native_epoch_qualified:false,event_first_knowledge_qualified:false,native_admission_qualified:false};
    card.card_hash=hash(card);
    const logical_event_id=opaqueLogicalEventKey(card,window.descriptor);
    const operation_id='ANOMALY_INIT:'+digest(logical_event_id);
    const plan=lockedOutcomePlan(card);
    const model=capture(newMemory({max_active:1,max_cards:2}),card,{watch_mode:'HISTORICAL_REVIEW'});
    if(model.status!=='CAPTURED'||!model.state.watch[card.event_id]?.active)throw Error('EXISTING_WATCH_NOT_ADMITTED');
    const source_snapshot_id='HTX_CAPTURE:'+digest({contract,body:window.body_text_sha256,source_as_of_ts:window.source_as_of_ts,received_ts:window.received_ts});
    const observation_fingerprint=digest({schema:'CAPTURED_CLOSED_WINDOW_FACTS_V1',logical_event_id,timeframe:card.timeframe,alignment_offset_ms:card.alignment_offset_ms,candle:card.candle,background:card.background,source_as_of_ts:window.source_as_of_ts,native_record:card.instrument.native_record});
    const observation={observation_kind:'CAPTURED_CLOSED_WINDOW_FACTS_V1',observation_fingerprint,source_snapshot_id,raw_ref,raw_sha256:window.body_text_sha256,source_as_of_ts:window.source_as_of_ts,received_ts:window.received_ts,body_completed_ts:window.body_completed_ts,hash_scope:window.hash_scope,recorded_by_worker_ts:known_ts,observation_scope:'INGRESS_FACTS_ONLY_NOT_WATCH_PRICE_OR_OUTCOME_EVALUATION'};
    const state={
      evaluated_ts:known_ts,watch:model.state.watch[card.event_id],
      last_snapshot:{ts:window.source_as_of_ts,id:source_snapshot_id,sha256:window.body_text_sha256},
      revisions:[observation],
      outcomes:Object.fromEntries(plan.cells.map(cell=>[cell.key,{target_ts:cell.target_ts,status:'PENDING'}])),
      outbox:{capture0:{status:'DRAFT',form_status:'NOT_APPROVED',actual_send:false,source_snapshot_id,message_ru:`Блок аномалий · ${contract} · 15m. Закрытое окно ${new Date(card.event_end_ts).toISOString()}: объём ${card.features.volume_ratio.toFixed(2)}× прошлого фона. Направление не определено. Запись по native-контракту HTX; epoch и первое знание события не квалифицированы. Спотовое окно отсутствует. Наблюдение без разрешения входа.`}},
      native_epoch_qualified:false,event_first_knowledge_qualified:false,native_admission_qualified:false,
    };
    return lazyCandidate({operation_id,expected_revision:0,logical_event_id,card,descriptor:window.descriptor,plan,state},observation);
  } catch(error) {
    return {status:'ANOMALY_PREPARATION_NOT_CLOSED',reason:String(error?.message||error).slice(0,240),provider_HTTP:0,SQL:0};
  }
}
