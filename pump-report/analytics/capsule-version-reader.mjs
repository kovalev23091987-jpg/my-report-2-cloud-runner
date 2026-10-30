import {FEATURE_CAPSULE_VERSION,OUTCOME_CAPSULE_VERSION,FEATURE_PROJECTION_REVISION,featureCapsuleKey,readFeatureCapsule,prepareFeatureCapsule} from './feature-capsule.mjs';
import * as legacyV2 from './feature-capsule-v2.mjs';
export const CAPSULE_READER_SET='CAPSULE_V2_V3_SEED_R1';
export const LEGACY_FEATURE_SCHEMA=legacyV2.FEATURE_CAPSULE_VERSION;
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const need=(ok,code)=>{if(!ok)throw Error(code);};
export function capsuleDialect(c){
  if(c?.schema===legacyV2.FEATURE_CAPSULE_VERSION)return {feature_schema:c.schema,outcome_schema:legacyV2.OUTCOME_CAPSULE_VERSION,link_schema:'pump-summary-capsule-link-v2-20261025',feature_prefix:'pump:feature-capsule:v2:',outcome_prefix:'pump:outcome-capsule:v2:',link_prefix:'pump:summary-capsule-link:v2:',revision:null};
  need(c?.schema===FEATURE_CAPSULE_VERSION&&c.projection_revision===FEATURE_PROJECTION_REVISION,'CAPSULE_SCHEMA_OR_SEMANTIC_REVISION_UNSUPPORTED');
  return {feature_schema:c.schema,outcome_schema:OUTCOME_CAPSULE_VERSION,link_schema:'pump-summary-capsule-link-v3-seed-window-20261030',
    feature_prefix:'pump:feature-capsule:v3:'+FEATURE_PROJECTION_REVISION+':',outcome_prefix:'pump:outcome-capsule:v3:'+FEATURE_PROJECTION_REVISION+':',
    link_prefix:'pump:summary-capsule-link:v3:'+FEATURE_PROJECTION_REVISION+':',revision:FEATURE_PROJECTION_REVISION};
}
export const v3SummaryLinkKey=id=>'pump:summary-capsule-link:v3:'+FEATURE_PROJECTION_REVISION+':'+id.slice(-64);
export const v2SummaryLinkKey=id=>'pump:summary-capsule-link:v2:'+id.slice(-64);
export function projectionPointerKey(c){const d=capsuleDialect(c);return d.revision?'pump:feature-capsule-pointer:v3:'+d.revision+':'+c.analysis_sha256:null;}
export async function readFeatureForAudit(feature,projection_pointer=null){
  const c=feature?.capsule,d=capsuleDialect(c),view=await readFeatureCapsule(feature);
  need(digest(c.analysis_sha256)&&feature.key===d.feature_prefix+c.analysis_sha256,'CAPSULE_VERSIONED_FEATURE_KEY_MISMATCH');
  if(d.revision){
    const p=projection_pointer?.pointer;
    need(projection_pointer?.key===projectionPointerKey(c)&&p?.schema==='pump-feature-pointer-v3-seed-window-20261030'&&p.projection_revision===d.revision&&
      p.analysis_key===c.analysis_key&&p.feature_key===feature.key&&p.feature_sha256===feature.sha256,'CAPSULE_PROJECTION_POINTER_UNBOUND');
  }
  return view;
}
export function rebuildFeatureForAudit(saved,c){
  const d=capsuleDialect(c),args={analysis:saved.analysis,input:saved.input,analysis_key:c.analysis_key,
    implementation_sha256:c.implementation_sha256,recorded_ts:saved.saved_ts,evidence_class:c.origin.evidence_class};
  return d.revision?prepareFeatureCapsule({...args,projection_writer_implementation_sha256:c.projection_writer_implementation_sha256}):legacyV2.prepareFeatureCapsule(args);
}
export function versionedSummaryLink(feature,outcome,record,protected_refs){
  const c=feature.capsule,d=capsuleDialect(c);
  return {schema:d.link_schema,...(d.revision?{projection_revision:d.revision}:{}),summary_record_id:record.record_id,analysis_key:c.analysis_key,
    feature_key:feature.key,feature_sha256:feature.sha256,outcome_key:outcome.key,outcome_sha256:outcome.sha256,protected_refs:structuredClone(protected_refs),originals_required:true,global_reference_closure:false};
}
