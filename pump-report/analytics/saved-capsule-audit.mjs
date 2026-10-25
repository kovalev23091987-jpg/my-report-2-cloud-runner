import {validTime} from '../contracts/index.mjs';
import {auditCohortSample} from './cohort-audit.mjs';
import {FEATURE_CAPSULE_VERSION,capsuleDigest} from './feature-capsule.mjs';
import {selectOutcomeAnchor} from './anchors.mjs';

export const SAVED_CAPSULE_AUDIT_VERSION='pump-saved-capsule-audit-v1-20261025';
export const SAVED_CAPSULE_AUDIT_BOUNDS=Object.freeze({records:10,records_bytes:262144,read_calls:90,read_value_bytes:524288,read_bytes:2000000,evidence_bytes:2000000,journal_analyses:64,journal_publications:64,key_chars:512});
const text=v=>typeof v==='string'&&v.length>0&&v.length<=512&&!/[\u0000-\u001f]/u.test(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const stable=v=>v&&typeof v==='object'?Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
const same=(a,b)=>stable(a)===stable(b);
const error=code=>Object.assign(new Error(code),{code});
const need=(ok,code)=>{if(!ok)throw error(code);};
const keyIs=(key,prefix)=>typeof key==='string'&&key.startsWith(prefix)&&digest(key.slice(prefix.length));
async function textDigest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}

// This reader has no write, scan, provider, current/latest or fallback path.
// Native admission/cost accounting stays with ROOT's exact read callback.
export async function auditSavedCapsules({records,read,as_of_ts,split_plan}={}){
  const limits=SAVED_CAPSULE_AUDIT_BOUNDS;
  need(Array.isArray(records)&&records.length<=limits.records,'SAVED_CAPSULE_RECORD_BOUND_EXCEEDED');
  need(typeof read==='function','SAVED_CAPSULE_EXACT_READ_REQUIRED');
  need(validTime(as_of_ts)&&validTime(split_plan?.split_ts),'SAVED_CAPSULE_AUDIT_TIME_REQUIRED');
  let encoded;
  try{encoded=JSON.stringify(records);}catch{throw error('SAVED_CAPSULE_JSON_RECORDS_REQUIRED');}
  need(new TextEncoder().encode(encoded).byteLength<=limits.records_bytes,'SAVED_CAPSULE_RECORD_BYTES_EXCEEDED');
  const rows=JSON.parse(encoded);
  need(rows.every(r=>keyIs(r?.record_id,'pump:summary-record:')),'SAVED_CAPSULE_SUMMARY_KEY_REQUIRED');
  const cache=new Map(),usage={read_calls:0,read_bytes:0,cache_hits:0,evidence_bytes:0,records_resolved:0},failures=[];let fatal=null;
  const abort=code=>{fatal=error(code);throw error('AUDIT_EVIDENCE_BOUND_EXCEEDED');};
  async function load(key){
    need(text(key),'SAVED_CAPSULE_STATE_KEY_UNBOUND');
    if(cache.has(key)){usage.cache_hits++;const value=cache.get(key);need(value!==null,'SAVED_CAPSULE_REFERENCE_MISSING');return value;}
    if(usage.read_calls>=limits.read_calls)abort('SAVED_CAPSULE_READ_CALL_BOUND_EXCEEDED');
    usage.read_calls++;let value;
    try{value=await read(key);}catch{abort('SAVED_CAPSULE_STORE_READ_FAILED');}
    let raw;try{raw=JSON.stringify(value??null);}catch{abort('SAVED_CAPSULE_NON_JSON_READBACK');}
    const bytes=new TextEncoder().encode(raw).byteLength;
    if(bytes>limits.read_value_bytes)abort('SAVED_CAPSULE_READ_VALUE_BYTES_EXCEEDED');
    usage.read_bytes+=bytes;if(usage.read_bytes>limits.read_bytes)abort('SAVED_CAPSULE_TOTAL_READ_BYTES_EXCEEDED');
    const copy=JSON.parse(raw);cache.set(key,copy);need(copy!==null,'SAVED_CAPSULE_REFERENCE_MISSING');return copy;
  }
  async function cardAt(card_id,analysis_key,saved){
    need(typeof card_id==='string'&&/^PUMP:[a-f0-9]{64}$/.test(card_id),'SAVED_CAPSULE_CARD_KEY_UNBOUND');
    const key='pump:card:'+card_id,card=await load(key);
    need(card.card_id===card_id&&card.delivery_schema==='PUMP_DELIVERY_V2'&&card.analysis?.source_input_key===analysis_key,'SAVED_CAPSULE_CARD_ANALYSIS_MISMATCH');
    const {source_input_key,...original}=card.analysis;
    need(same(original,saved.analysis)&&typeof card.text==='string'&&card.text===saved.analysis.card_text,'SAVED_CAPSULE_CARD_ORIGINAL_BYTES_MISMATCH');
    need(card.text_hash===await textDigest(card.text),'SAVED_CAPSULE_CARD_TEXT_HASH_MISMATCH');
    const expected='PUMP:'+await textDigest(saved.analysis.instrument.instrument_id+'|'+saved.analysis.wave_id+'|'+card.text_hash);
    need(expected===card_id,'SAVED_CAPSULE_CARD_ID_MISMATCH');return {key,card};
  }
  async function resolve(row){
    const link=await load('pump:summary-capsule-link:v2:'+row.record_id.slice(-64));
    need(link.schema==='pump-summary-capsule-link-v2-20261025'&&link.summary_record_id===row.record_id&&link.originals_required===true&&link.global_reference_closure===false,'SAVED_CAPSULE_LINK_UNBOUND');
    need(keyIs(link.feature_key,'pump:feature-capsule:v2:')&&keyIs(link.outcome_key,'pump:outcome-capsule:v2:')&&keyIs(link.analysis_key,'pump:analysis:')&&keyIs(link.protected_refs?.key,'pump:protected-refs:v2:'),'SAVED_CAPSULE_LINK_KEY_UNBOUND');
    const feature=await load(link.feature_key),outcome=await load(link.outcome_key),saved_analysis=await load(link.analysis_key),protectedRefs=await load(link.protected_refs.key);
    need(protectedRefs.key===link.protected_refs.key&&protectedRefs.sha256===link.protected_refs.sha256&&await capsuleDigest(protectedRefs.projection)===protectedRefs.sha256,'SAVED_CAPSULE_PROTECTED_REFS_DIGEST_MISMATCH');
    need(protectedRefs.projection?.delete_allowed===false&&protectedRefs.projection.approved_delete_ttl_ms===null&&protectedRefs.projection.inventory_complete_for_global_cleanup===false,'SAVED_CAPSULE_PROTECTED_REFS_NOT_CLOSED');
    need(saved_analysis?.analysis&&saved_analysis.input&&text(row.origin?.instrument_id)&&text(row.origin?.wave_id)&&text(row.origin?.signal_id),'SAVED_CAPSULE_ORIGINAL_REQUIRED');
    const journalKey='pump:journal:'+row.origin.instrument_id+':'+row.origin.wave_id,signalKey='pump:signal:'+row.origin.instrument_id+':'+row.origin.wave_id;
    need(row.origin.signal_id===signalKey,'SAVED_CAPSULE_SIGNAL_KEY_UNBOUND');const journal=await load(journalKey);
    need(journal.schema==='PUMP_OUTCOME_JOURNAL_V1'&&Array.isArray(journal.analyses)&&Array.isArray(journal.publications),'SAVED_CAPSULE_JOURNAL_REQUIRED');
    if(journal.analyses.length>limits.journal_analyses||journal.publications.length>limits.journal_publications)abort('SAVED_CAPSULE_JOURNAL_ROW_BOUND_EXCEEDED');
    const signal=await load(signalKey);
    need(same(signal.origin,row.origin)&&signal.signal_id===row.origin.signal_id&&signal.analysis_key===link.analysis_key&&signal.deadline_ts===row.origin.t0+14400000&&await capsuleDigest(signal.plan)===await capsuleDigest(saved_analysis.analysis.plan),'SAVED_CAPSULE_SIGNAL_ORIGIN_MISMATCH');
    const anchor=journal.frozen_anchor;
    need(anchor?.immutable===true&&anchor.analysis_id===link.analysis_key&&anchor.analysis_sha256===feature.capsule?.analysis_sha256,'SAVED_CAPSULE_FROZEN_ANCHOR_REQUIRED');
    const analyses=journal.analyses.filter(a=>a.analysis_id===link.analysis_key);
    need(analyses.length===1&&analyses[0].analysis_sha256===anchor.analysis_sha256&&same(analyses[0].origin,row.origin),'SAVED_CAPSULE_JOURNAL_ANALYSIS_MISMATCH');
    const selected=selectOutcomeAnchor({...journal,as_of_ts:row.recorded_ts});
    need(selected.eligible&&same(selected.anchor,anchor)&&same(selected.publication,row.publication),'SAVED_CAPSULE_ANCHOR_NOT_BOUND_AT_RECORD_TIME');
    const anchor_meta={origin_anchor:structuredClone(anchor)};
    if(row.publication?.state==='UNSENT'){
      const t=journal.terminal,known=t?.known_ts??t?.recorded_ts;
      need(t&&['CANCELLED','EXPIRED','COMPLETED'].includes(t.state)&&validTime(t.event_ts)&&validTime(known)&&t.event_ts>=row.origin.t0&&known>=t.event_ts&&known<=row.recorded_ts,'SAVED_CAPSULE_UNSENT_TERMINAL_RECORD_REQUIRED');
      anchor_meta.unsent_terminal={state:t.state,event_ts:t.event_ts,known_ts:known,evidence_ref:journalKey+'#terminal'};
      need((signal.original_publication_event_id??null)===null&&(signal.original_card_id??null)===null,'SAVED_CAPSULE_UNSENT_PUBLICATION_CONFLICT');
    }else{
      const eventId=anchor.selection?.publication_event_id,events=journal.publications.filter(e=>e.event_id===eventId);
      need(events.length===1,'SAVED_CAPSULE_SELECTED_PUBLICATION_REQUIRED');const event=events[0];
      need(event.analysis_id===link.analysis_key&&validTime(event.event_ts)&&validTime(event.recorded_ts)&&event.event_ts<=event.recorded_ts&&event.recorded_ts<=row.recorded_ts&&signal.original_publication_event_id===eventId&&signal.original_card_id===event.card_id,'SAVED_CAPSULE_SELECTED_PUBLICATION_MISMATCH');
      const original=await cardAt(event.card_id,link.analysis_key,saved_analysis),card=original.card;
      need(validTime(card.created_ts)&&validTime(card.send_started_ts)&&card.created_ts<=card.send_started_ts&&card.send_started_ts<=event.event_ts,'SAVED_CAPSULE_POSSIBLE_SEND_CLOCK_UNBOUND');
      if(row.publication.state==='UNKNOWN'){
        need(event.state==='SENT'||event.state==='UNKNOWN'&&event.possible_send===true,'SAVED_CAPSULE_POSSIBLE_SEND_EVENT_UNBOUND');
        anchor_meta.possible_send_ref=original.key+'#send_started_ts';
      }else{
        need(row.publication.state==='SENT'&&typeof row.publication.receipt_ref==='string'&&/^pump:card:PUMP:[a-f0-9]{64}#receipt$/.test(row.publication.receipt_ref),'SAVED_CAPSULE_SENT_RECEIPT_KEY_UNBOUND');
        const receiptKey=row.publication.receipt_ref.slice(0,-8),acknowledged=await cardAt(receiptKey.slice('pump:card:'.length),link.analysis_key,saved_analysis),c=acknowledged.card,r=c.receipt;
        need(c.state==='SENT'&&/^[1-9][0-9]*$/.test(String(row.publication.message_id??''))&&String(c.message_id)===String(row.publication.message_id)&&r?.card_id===c.card_id&&r.text_hash===c.text_hash&&r.recipient===c.recipient&&String(r.message_id)===String(row.publication.message_id)&&validTime(r.confirmed_ts)&&r.confirmed_ts>=c.send_started_ts&&r.confirmed_ts<=row.recorded_ts,'SAVED_CAPSULE_SENT_RECEIPT_UNBOUND');
        need(journal.publications.some(e=>e.state==='SENT'&&e.analysis_id===link.analysis_key&&e.card_id===c.card_id&&e.receipt_ref===row.publication.receipt_ref&&String(e.message_id)===String(row.publication.message_id)&&e.event_ts===r.confirmed_ts&&validTime(e.recorded_ts)&&e.recorded_ts<=row.recorded_ts),'SAVED_CAPSULE_SENT_JOURNAL_EVENT_UNBOUND');
      }
    }
    const evidence={link,feature,outcome,saved_analysis,anchor_meta};
    usage.evidence_bytes+=new TextEncoder().encode(JSON.stringify(evidence)).byteLength;
    if(usage.evidence_bytes>limits.evidence_bytes)abort('SAVED_CAPSULE_EVIDENCE_BYTES_EXCEEDED');usage.records_resolved++;return evidence;
  }
  let audit;
  try{
    audit=await auditCohortSample(rows,{feature_schema_version:FEATURE_CAPSULE_VERSION,as_of_ts,split_plan,resolve_evidence:async row=>{
      try{return await resolve(row);}catch(e){if(fatal)throw error('AUDIT_EVIDENCE_BOUND_EXCEEDED');const code=typeof e?.code==='string'&&e.code.startsWith('SAVED_CAPSULE_')?e.code:'SAVED_CAPSULE_EVIDENCE_UNQUALIFIED';failures.push({record_id:row.record_id,code});throw error(code);}
    }});
  }catch(e){if(fatal)throw fatal;if(e?.message==='AUDIT_EVIDENCE_BOUND_EXCEEDED')throw error('SAVED_CAPSULE_EVIDENCE_BYTES_EXCEEDED');throw error('SAVED_CAPSULE_AUDIT_REJECTED');}
  if(fatal)throw fatal;
  return {...audit,saved_capsule_reader:{version:SAVED_CAPSULE_AUDIT_VERSION,limits:{...limits},...usage,distinct_keys_read:cache.size,required_references_resolved:failures.length===0,reference_failures:failures,
    scope:'SUPPLIED_AT_MOST_TEN_SAVED_RECORDS_ONLY',readback_completion_not_qualification:true,source_history_complete:false,global_reference_closure:false,raw_private_output:false,native_admission_proven:false},
    retention:{...audit.retention,delete_allowed:false,approved_delete_ttl_ms:null,originals_required:true,global_reference_closure:false}};
}
