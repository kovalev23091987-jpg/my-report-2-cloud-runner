import {prepareFeatureCapsule,prepareOutcomeCapsule,readFeatureCapsule,projectProtectedReferences,capsuleDigest} from '../analytics/feature-capsule.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const sameLinkCore=(current,next)=>current?.schema==='pump-summary-capsule-link-v2-20261025'
  &&same({...current,protected_refs:null},{...next,protected_refs:null})
  &&digest(current.protected_refs?.sha256)
  &&current.protected_refs.key==='pump:protected-refs:v2:'+current.protected_refs.sha256
  &&Object.keys(current.protected_refs).length===2;
export function createRetainedCapsuleWriter({store,implementation_sha256,evidence_class}){
  if(!store?.atomic||!digest(implementation_sha256)||typeof evidence_class!=='string')throw Error('PINNED_RETAINED_CAPSULE_CONTEXT_REQUIRED');
  async function immutable(key,value,{preserve_link_refs=false}={}){
    const retained=await store.atomic(key,current=>{
      // A later, more complete reference projection cannot rewrite an already
      // immutable summary link. Only its structurally bound reference pointer
      // may differ; every original/feature/outcome/core field must stay exact.
      if(current&&!same(current,value)&&!(preserve_link_refs&&sameLinkCore(current,value)))throw Error('IMMUTABLE_RETAINED_CAPSULE_CONFLICT');
      return {state:current??value,result:current??value};
    });
    const readback=await store.get(key);if(!same(readback,retained))throw Error('RETAINED_CAPSULE_READBACK_FAILED');return readback;
  }
  async function original(analysis_key){
    const saved=await store.get(analysis_key);if(!saved?.analysis||!saved.input)throw Error('RETAINED_ORIGINAL_ANALYSIS_REQUIRED');
    if(analysis_key!=='pump:analysis:'+await capsuleDigest(saved.analysis))throw Error('RETAINED_ORIGINAL_ANALYSIS_HASH_MISMATCH');
    // An old original cannot acquire the current implementation retrospectively.
    if(!digest(saved.implementation_sha256))return {status:'ORIGINAL_IMPLEMENTATION_PIN_UNBOUND',saved};
    if(typeof saved.evidence_class!=='string')return {status:'ORIGINAL_EVIDENCE_CLASS_UNBOUND',saved};
    const prepared=await prepareFeatureCapsule({analysis:saved.analysis,input:saved.input,analysis_key,implementation_sha256:saved.implementation_sha256,recorded_ts:saved.saved_ts,evidence_class:saved.evidence_class});
    await immutable(prepared.key,prepared);await readFeatureCapsule({capsule:prepared.capsule,sha256:prepared.sha256});
    return {status:'SAVED',saved,prepared};
  }
  async function projection({saved,analysis_key,signal=null,record=null,card=null}){
    const value=await projectProtectedReferences({analysis_key,analysis:saved.analysis,input:saved.input,signal,card,summary_records:record?[record]:[]});
    const sha256=await capsuleDigest(value),key='pump:protected-refs:v2:'+sha256;
    await immutable(key,{key,sha256,projection:value});return {key,sha256};
  }
  async function remember(analysis_key){
    const result=await original(analysis_key);if(result.status!=='SAVED')return {status:result.status,analysis_key};
    const refs=await projection({saved:result.saved,analysis_key});
    return {status:'SAVED',feature_key:result.prepared.key,feature_sha256:result.prepared.sha256,protected_refs:refs};
  }
  async function record(signal,summary_record){
    if(!signal?.analysis_key||summary_record?.origin?.signal_id!==signal.signal_id||!same(summary_record.origin,signal.origin))throw Error('RETAINED_OUTCOME_SIGNAL_BINDING_REQUIRED');
    const row=await original(signal.analysis_key);
    if(row.status!=='SAVED')return {status:row.status,analysis_key:signal.analysis_key};
    if(!same(row.prepared.capsule.origin,signal.origin))throw Error('RETAINED_OUTCOME_FEATURE_ORIGIN_CONFLICT');
    const prepared=await prepareOutcomeCapsule({feature_capsule:row.prepared.capsule,feature_sha256:row.prepared.sha256,outcome:summary_record.outcome,publication:summary_record.publication,recorded_ts:summary_record.recorded_ts,summary_record_id:summary_record.record_id});
    await immutable(prepared.key,prepared);
    const receipt=summary_record.publication?.receipt_ref;
    const cardKey=typeof signal.original_card_id==='string'?'pump:card:'+signal.original_card_id:typeof receipt==='string'&&receipt.startsWith('pump:card:')&&receipt.endsWith('#receipt')?receipt.slice(0,-8):null;
    const card=cardKey?await store.get(cardKey):null;
    const refs=await projection({saved:row.saved,analysis_key:signal.analysis_key,signal,record:summary_record,card});
    const link={schema:'pump-summary-capsule-link-v2-20261025',summary_record_id:summary_record.record_id,analysis_key:signal.analysis_key,feature_key:row.prepared.key,feature_sha256:row.prepared.sha256,outcome_key:prepared.key,outcome_sha256:prepared.sha256,protected_refs:refs,originals_required:true,global_reference_closure:false};
    const retained=await immutable('pump:summary-capsule-link:v2:'+summary_record.record_id.slice(-64),link,{preserve_link_refs:true});return {status:'SAVED',...retained};
  }
  return {remember,record,implementation_sha256,evidence_class};
}
