// F651 operator-only preparation. Not imported by sources/index or Worker.
// No provider, native store, filesystem, engine or registry activation here.
import {prepareCatalogSnapshotReview} from './catalog-snapshot-review.mjs';
import {stableCapturedJSON} from './captured-bulk-price-coverage.mjs';
import {ownerInstrumentExcluded, assertInstrument} from '../contracts/index.mjs';
import {createSourceEvidenceAdmission} from '../runtime/source-evidence-admission.mjs';

export const SAVED_CATALOG_COMPARE_BOUNDS=Object.freeze({
  verified_entries:2000,negative_decisions:2000,registry_json_bytes:4194304,output_json_bytes:1900000
});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=512;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const id=value=>Number.isSafeInteger(value)&&value>=0?String(value):
  typeof value==='string'&&/^\d{1,80}$/.test(value)?value:null;
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const require=(ok,reason)=>{if(!ok)throw Error(reason);};
const identity=t=>JSON.stringify([t.native_contract_id,t.symbol,t.asset,t.currency]);
const count=(rows,predicate)=>rows.filter(predicate).length;

// selected_scope/negative_decisions/expected keep the existing F616 pinned
// input contract. Its550 is the historical saved scope, never a current N.
// verified_entries adds the full frozen positive registry, including owner-
// excluded identities and their existing unit-evidence qualifications.
export function compareSavedCatalogScope({
  observer,expected,selected_scope,negative_decisions,verified_entries,sha256,
  evidence_mode='OBSERVED'
}={}){
  require(typeof sha256==='function'&&object(expected),'F651_PINNED_CONTEXT_REQUIRED');
  require(Array.isArray(verified_entries)&&verified_entries.length>0&&
    verified_entries.length<=SAVED_CATALOG_COMPARE_BOUNDS.verified_entries&&
    bytes(verified_entries)<=SAVED_CATALOG_COMPARE_BOUNDS.registry_json_bytes,
  'F651_VERIFIED_REGISTRY_BOUND');
  require(Array.isArray(negative_decisions)&&negative_decisions.length<=SAVED_CATALOG_COMPARE_BOUNDS.negative_decisions&&
    bytes(negative_decisions)<=SAVED_CATALOG_COMPARE_BOUNDS.registry_json_bytes,'F651_NEGATIVE_REGISTRY_BOUND');
  const registryHash=sha256(stableCapturedJSON(verified_entries));
  require(hash(registryHash)&&hash(expected.verified_entries_canonical_sha256)&&
    registryHash===expected.verified_entries_canonical_sha256,'F651_VERIFIED_REGISTRY_HASH_MISMATCH');
  const review=prepareCatalogSnapshotReview({observer,expected,selected_scope,negative_decisions,sha256,evidence_mode});
  const snapshot=observer.catalog_snapshot.private_evidence.snapshot,raw=snapshot.body.data;
  const byId=new Map(),byIdentity=new Map(),bySymbol=new Map(),byNativeId=new Map();
  for(const entry of verified_entries){
    require(object(entry)&&object(entry.instrument),'F651_VERIFIED_ENTRY_REQUIRED');
    const i=entry.instrument;assertInstrument(i);
    const nativeId=id(entry.native_contract_id??i.native_contract_id);
    require(nativeId!==null&&i.classification_status==='VERIFIED_CRYPTO'&&text(i.identity_evidence_ref)&&
      i.venue==='BINGX'&&i.market_type==='PERPETUAL'&&i.quote==='USDT'&&i.settle==='USDT'&&
      (i.margin===undefined||i.margin==='USDT')&&(entry.family===undefined||entry.family==='USDT_M')&&
      !['PAXG','XAUT'].includes(i.base),'F651_VERIFIED_TUPLE_UNBOUND');
    const tuple={native_contract_id:nativeId,symbol:i.native_symbol,asset:entry.native_base??i.base,currency:i.quote};
    require(tuple.asset===i.base&&!byId.has(i.instrument_id)&&!byIdentity.has(identity(tuple))&&
      !bySymbol.has(tuple.symbol)&&!byNativeId.has(nativeId),'F651_DUPLICATE_OR_CONFLICTING_VERIFIED_IDENTITY');
    const record={entry,tuple};byId.set(i.instrument_id,record);byIdentity.set(identity(tuple),record);
    bySymbol.set(tuple.symbol,record);byNativeId.set(nativeId,record);
  }
  const selectedIds=new Set();
  for(const selected of selected_scope){
    const i=selected.tuple,record=byId.get(i.instrument_id);
    require(record&&!ownerInstrumentExcluded(record.entry.instrument)&&!selectedIds.has(i.instrument_id)&&
      identity(record.tuple)===identity({native_contract_id:id(selected.native_contract_id),symbol:i.native_symbol,asset:i.base,currency:i.quote}),'F651_SELECTED_SCOPE_PROOF_CONFLICT');
    selectedIds.add(i.instrument_id);
  }
  require([...byId.values()].every(r=>ownerInstrumentExcluded(r.entry.instrument)||selectedIds.has(r.entry.instrument.instrument_id)),
    'F651_SELECTED_SCOPE_DOES_NOT_COVER_FROZEN_DELIVERABLES');
  const assess=createSourceEvidenceAdmission({resolve:query=>byId.get(query.instrument_id)?.entry??null});
  const negativeByRef=new Map(negative_decisions.map(d=>[d.decision_id,d]));
  const rows=review.rows.map(row=>{
    const tuple=row.native_tuple,record=tuple?byIdentity.get(identity(tuple)):null;
    const instrument=record?.entry.instrument,disposition=row.disposition;
    const knownCrypto=Boolean(record);
    const activeScope=['SAVED_SELECTED_SCOPE_EXACT_TUPLE','OWNER_EXCLUDED_BTC_ETH'].includes(disposition);
    require(disposition!=='SAVED_SELECTED_SCOPE_EXACT_TUPLE'||knownCrypto,'F651_SELECTED_ROW_WITHOUT_VERIFIED_PROOF');
    require(disposition!=='KNOWN_EXACT_SAVED_NON_TARGET_TUPLE'||!knownCrypto,'F651_POSITIVE_NEGATIVE_PROOF_CONFLICT');
    const activeKnownCrypto=knownCrypto&&activeScope,ownerExcluded=knownCrypto&&ownerInstrumentExcluded(instrument);
    const delivery=activeKnownCrypto&&!ownerExcluded;
    const admission=delivery?assess(instrument):null,deep=delivery&&admission.eligible;
    const negative=negativeByRef.get(row.saved_decision_ref);
    return {row_index:row.row_index,
      // Preserve the original Unicode symbol even for an invalid tuple. No
      // uppercase, ASCII gate, ticker inference or silent string truncation.
      native_symbol:typeof raw[row.row_index]?.symbol==='string'?raw[row.row_index].symbol:null,
      native_tuple:tuple,native_tuple_sha256:row.native_tuple_sha256,disposition,
      known_crypto_identity:knownCrypto,active_known_crypto:activeKnownCrypto,
      owner_delivery_excluded:ownerExcluded,delivery_eligible:delivery,deep_eligible:deep,
      unit_evidence_pending:delivery&&!deep&&admission.reason==='NATIVE_CORE_UNIT_EVIDENCE_REQUIRED',
      source_evidence_reason:admission?.reason??null,market_data_checked:false,current_CORE_proven:false,
      instrument_id:instrument?.instrument_id??null,identity_evidence_ref:instrument?.identity_evidence_ref??null,
      economic_classification:knownCrypto?'SAVED_VERIFIED_CRYPTO_EXACT_IDENTITY':
        negative?'KNOWN_NON_TARGET_EXACT_SAVED_TUPLE':'NOT_CHECKED',
      negative_decision_ref:negative?.decision_id??null,negative_scope_reason:negative?.scope_reason??null,
      native_row_evidence:{body_sha256:snapshot.body_sha256,row_index:row.row_index}};
  });
  const missingOrChanged=[];
  for(const [instrumentId,record]of byId){
    const matches=rows.filter(row=>row.native_tuple&&identity(row.native_tuple)===identity(record.tuple));
    const sameNative=rows.filter(row=>id(raw[row.row_index]?.contractId)===record.tuple.native_contract_id||
      raw[row.row_index]?.symbol===record.tuple.symbol);
    if(matches.length===1&&matches[0].active_known_crypto)continue;
    const disposition=matches.length>1?'PRESENT_DUPLICATE_IDENTITY':matches.length===1?matches[0].disposition:
      sameNative.length?'PRESENT_CHANGED_NATIVE_IDENTITY':'NOT_PRESENT_IN_CAPTURE';
    missingOrChanged.push({instrument_id:instrumentId,native_symbol:record.tuple.symbol,
      owner_delivery_excluded:ownerInstrumentExcluded(record.entry.instrument),disposition,
      row_indices:(matches.length?matches:sameNative).map(row=>row.row_index),
      identity_evidence_ref:record.entry.instrument.identity_evidence_ref,not_unsupported:true});
  }
  const summary={
    raw_catalog_rows:rows.length,frozen_verified_identities:byId.size,frozen_delivery_scope:selectedIds.size,
    active_known_crypto:count(rows,r=>r.active_known_crypto),delivery_eligible:count(rows,r=>r.delivery_eligible),
    deep_eligible:count(rows,r=>r.deep_eligible),unit_evidence_pending:count(rows,r=>r.unit_evidence_pending),
    known_non_target:count(rows,r=>r.disposition==='KNOWN_EXACT_SAVED_NON_TARGET_TUPLE'),
    unclassified_active_USDT:count(rows,r=>r.disposition==='ACTIVE_USDT_IDENTITY_PROPOSAL_NOT_CHECKED'),
    invalid_or_duplicate:count(rows,r=>['INVALID_NATIVE_ROW','DUPLICATE_NATIVE_IDENTITY_REVIEW_BLOCKED'].includes(r.disposition)),
    missing_or_changed_delivery_identities:count(missingOrChanged,r=>!r.owner_delivery_excluded)
  };
  const output={schema:'F651_BOUND_SAVED_CATALOG_SCOPE_COMPARISON_V1',
    status:'DERIVED_FROM_PINNED_SAVED_CAPTURE_NOT_NEW_QUALIFICATION',evidence_class:review.evidence_class,
    provenance:{producer_pin:review.producer_pin,producer_received_ts:review.producer_received_ts,
      producer_receipt_id:review.producer_receipt_id,saved_ts:review.saved_ts,observed_ts:review.observed_ts,
      as_of_ts:review.as_of_ts,source_event_ts:null,body_sha256:review.body_sha256,
      snapshot_json_sha256:review.snapshot_json_sha256,selected_scope_canonical_sha256:review.saved_scope_canonical_sha256,
      negative_decisions_canonical_sha256:review.negative_decisions_canonical_sha256,
      verified_entries_canonical_sha256:registryHash},
    summary,disposition_counts:review.counts,rows,missing_or_changed_identity:missingOrChanged,
    axes_overlap:true,axes_note:'Known/active/delivery/deep/unit-pending are nested or overlapping axes, not exclusive buckets.',
    current_global_crypto_N:null,current_global_N_proven:false,all_languages_in_scope:true,
    Unicode_preserved:true,new_registry_decisions:0,unknown_is_not_unsupported:true,
    automatic_delete_allowed:false,IO_admission_created:false,
    actual_provider_HTTP:0,actual_native_SQL:0,engine_calls:0,Telegram:0};
  require(bytes(output)<=SAVED_CATALOG_COMPARE_BOUNDS.output_json_bytes,'F651_OUTPUT_BYTE_BOUND_NO_PARTIAL_RESULT');
  return output;
}
