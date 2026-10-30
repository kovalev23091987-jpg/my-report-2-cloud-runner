import {finite,validTime} from '../contracts/index.mjs';
import {summarizeOutcomes,PROPOSED_SAMPLE_REQUIREMENTS} from './summary.mjs';
import {recordPurpose,productionRecord} from '../contracts/run-purpose.mjs';
import {FEATURE_CAPSULE_VERSION,OUTCOME_CAPSULE_VERSION,readFeatureCapsule,prepareFeatureCapsule,prepareOutcomeCapsule,capsuleDigest} from './feature-capsule.mjs';

export const COHORT_AUDIT_VERSION='pump-cohort-input-audit-v2-purpose-20261025';
export const FEATURE_SCHEMA_VERSION='pump-initial-features-v1';
export const AUDIT_BOUNDS=Object.freeze({records:2048,bytes:2000000,features_per_record:64,pairs:64});
const fields=new Set(['wave_state','growth_5m_pct','growth_15m_pct','growth_60m_pct','growth_24h_pct','current_to_impulse_volume_ratio','position_limit_usdt','spread_pct','slippage_buy_pct','slippage_sell_pct','trade_buy_usdt','trade_sell_usdt','open_interest','funding_rate','funding_period_ms','relative_return_btc_pct','relative_return_eth_pct','map_mode','map_nearest_up_distance_pct','map_nearest_down_distance_pct']);
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=512;
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const stable=v=>v&&typeof v==='object'?Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
const key=o=>JSON.stringify([o.instrument_id,o.wave_id]);
function bounded(rows,limit){
  if(!Array.isArray(rows)||rows.length>limit)throw Error('AUDIT_INPUT_BOUND_EXCEEDED');
  let encoded;try{encoded=JSON.stringify(rows);}catch{throw Error('AUDIT_JSON_INPUT_REQUIRED');}
  if(new TextEncoder().encode(encoded).byteLength>AUDIT_BOUNDS.bytes)throw Error('AUDIT_INPUT_BOUND_EXCEEDED');
}
function metadataIssues(row){
  const m=row.audit_meta,o=row.origin,issues=[];
  if(!digest(m?.analysis_sha256))issues.push('SAVED_ANALYSIS_DIGEST_MISSING');
  if(!digest(m?.implementation_sha256))issues.push('IMPLEMENTATION_VERSION_MISSING');
  const anchor=m?.origin_anchor;
  if(!anchor||anchor.immutable!==true||!text(anchor.analysis_id)||anchor.analysis_sha256!==m.analysis_sha256||stable(anchor.origin)!==stable(o)||
    !validTime(anchor.selection?.selected_ts)||!validTime(anchor.selection?.recorded_ts)||anchor.selection.selected_ts<o.t0||anchor.selection.recorded_ts<anchor.selection.selected_ts||anchor.selection.recorded_ts>row.recorded_ts)issues.push('ORIGINAL_ANCHOR_UNBOUND');
  if(row.publication?.state==='UNSENT'){
    const terminal=m?.unsent_terminal;
    if(anchor?.selection?.kind!=='FIRST_READY'||!terminal||!['CANCELLED','EXPIRED','COMPLETED'].includes(terminal.state)||!text(terminal.evidence_ref)||!validTime(terminal.event_ts)||!validTime(terminal.known_ts)||terminal.event_ts<o.t0||terminal.known_ts<terminal.event_ts||terminal.known_ts>row.recorded_ts)issues.push('UNSENT_TERMINAL_ADMISSION_UNBOUND');
  }else if(anchor?.selection?.kind!=='FIRST_POSSIBLE_OR_CONFIRMED_SEND')issues.push('PUBLISHED_ANCHOR_SELECTION_UNBOUND');
  if(row.publication?.state==='UNKNOWN'&&!text(m?.possible_send_ref))issues.push('POSSIBLE_SEND_EVIDENCE_UNBOUND');
  if(m?.feature_schema_version!==FEATURE_SCHEMA_VERSION)issues.push('FEATURE_SCHEMA_UNQUALIFIED');
  if(!Array.isArray(m?.features)||!m.features.length)issues.push('INITIAL_FEATURE_SNAPSHOT_MISSING');
  else{
    if(m.features.length>AUDIT_BOUNDS.features_per_record)issues.push('FEATURE_BOUND_EXCEEDED');
    const seen=new Set();
    for(const f of m.features.slice(0,AUDIT_BOUNDS.features_per_record)){
      if(!fields.has(f?.name))issues.push('NON_INITIAL_OR_UNKNOWN_FEATURE');
      if(seen.has(f?.name))issues.push('DUPLICATE_FEATURE_NAME');seen.add(f?.name);
      if(!(f?.value===null&&text(f.absence_reason)||finite(f?.value)||typeof f?.value==='boolean'||typeof f?.value==='string'&&f.value.length<=512))issues.push('FEATURE_VALUE_UNQUALIFIED');
      if(f?.value!==null&&fields.has(f?.name)){
        const categorical=['wave_state','map_mode'].includes(f.name);
        if(!categorical&&!finite(f.value))issues.push('FEATURE_DOMAIN_INVALID');
        if(['open_interest','trade_buy_usdt','trade_sell_usdt','position_limit_usdt','spread_pct','slippage_buy_pct','slippage_sell_pct','current_to_impulse_volume_ratio'].includes(f.name)&&f.value<0)issues.push('FEATURE_DOMAIN_INVALID');
        if(f.name==='funding_period_ms'&&f.value<=0||f.name.startsWith('growth_')&&f.value< -100)issues.push('FEATURE_DOMAIN_INVALID');
        if(f.name==='map_mode'&&f.value!==o.map_mode)issues.push('FEATURE_COHORT_MISMATCH');
        if(f.name==='wave_state'&&!['ACTIVE_WAVE','CALM_PULLBACK','SHARP_PULLBACK_UNCONFIRMED','SHARP_PULLBACK_RECLAIMED','RESUMING','WEAKENING','CANCELLED','EXPIRED'].includes(f.value))issues.push('FEATURE_DOMAIN_INVALID');
      }
      if(!validTime(f?.source_event_ts)||!validTime(f.received_ts)||!validTime(f.known_ts)||f.source_event_ts>f.received_ts||f.received_ts>f.known_ts||!text(f.evidence_ref))issues.push('FEATURE_PROVENANCE_UNQUALIFIED');
      else if(f.known_ts>o.t0)issues.push('FUTURE_FEATURE_LEAKAGE');
    }
  }
  const p=m?.forecast;
  if(!p)issues.push('NO_PRECOMMITTED_FORECAST');
  else{
    if(!finite(p.value_pct)||p.value_pct<0||p.value_pct>100||!text(p.model_version))issues.push('FORECAST_SHAPE_UNQUALIFIED');
    if(!digest(p.training_manifest_sha256))issues.push('TRAINING_MANIFEST_UNBOUND');
    if(!validTime(p.created_ts)||p.created_ts>o.t0)issues.push('FORECAST_AFTER_ORIGIN');
    if(!validTime(p.training_cutoff_ts)||!validTime(p.trained_through_label_ts)||p.trained_through_label_ts>p.training_cutoff_ts||p.training_cutoff_ts>=o.t0)issues.push('FORECAST_TRAINING_LEAKAGE');
    if(p.mode!==o.mode||p.map_mode!==o.map_mode||p.rules_version!==o.rules_version||p.profile_version!==o.profile_version||p.feature_schema_version!==m.feature_schema_version)issues.push('FORECAST_COHORT_MISMATCH');
  }
  return [...new Set(issues)];
}

// This audits inputs and a declared temporal split. It does not fit a model,
// estimate probability, authenticate native provenance, or prove feature value.
export function auditCohortSample(records,options={}){
  if(options.feature_schema_version===FEATURE_CAPSULE_VERSION)return auditCapsuleCohort(records,options);
  if(options.feature_schema_version!==undefined&&options.feature_schema_version!==FEATURE_SCHEMA_VERSION)throw Error('AUDIT_FEATURE_SCHEMA_UNSUPPORTED');
  return auditHistoricalCohort(records,options);
}
function auditHistoricalCohort(records,{as_of_ts,split_plan}={}){
  bounded(records,AUDIT_BOUNDS.records);
  if(!validTime(as_of_ts)||!validTime(split_plan?.split_ts))throw Error('AUDIT_TIME_AND_SPLIT_REQUIRED');
  // Purpose is additive metadata; the immutable historical origin stays raw.
  // A conflicting update cannot promote a known nonproduction wave into train.
  const blocked=new Set(records.filter(r=>validTime(r?.recorded_ts)&&r.recorded_ts<=as_of_ts&&text(r.origin?.instrument_id)&&text(r.origin?.wave_id)&&!productionRecord(r)).map(r=>key(r.origin)));
  const eligible=records.filter(r=>productionRecord(r)&&!blocked.has(key(r.origin??{})));
  const purpose_exclusions={acceptance_test:records.filter(r=>recordPurpose(r)==='ACCEPTANCE_TEST').length,unclassified:records.filter(r=>recordPurpose(r)==='UNCLASSIFIED').length,
    non_observed_production:records.filter(r=>recordPurpose(r)==='PRODUCTION'&&!productionRecord(r)).length,
    production_wave_conflict:records.filter(r=>productionRecord(r)&&blocked.has(key(r.origin??{}))).length};
  const summary=summarizeOutcomes(eligible,{as_of_ts}),split=split_plan.split_ts;
  const planValid=validTime(split_plan.declared_ts)&&split_plan.declared_ts<=split&&text(split_plan.plan_ref);
  const badIds=new Set(summary.invalid_record_details.map(r=>r.record_id)),groups=new Map(),assets=new Map(),reasons={};
  for(const r of eligible){
    if(!r?.origin?.ready||!validTime(r.recorded_ts)||r.recorded_ts>as_of_ts||badIds.has(r.record_id))continue;
    const k=key(r.origin),xs=groups.get(k)??[];if(!xs.some(x=>stable(x)===stable(r)))xs.push(r);groups.set(k,xs);
    const set=assets.get(r.origin.instrument_id)??new Set();set.add(r.origin.asset_id);assets.set(r.origin.instrument_id,set);
  }
  const publication=new Map();for(const c of summary.cohorts)for(const k of c.wave_keys)publication.set(k,c.publication);
  const cohorts=new Map(),waves=[];
  for(const [wave_key,xs] of groups){
    xs.sort((a,b)=>a.recorded_ts-b.recorded_ts||a.record_id.localeCompare(b.record_id,'en'));const first=xs[0],o=first.origin,issues=xs.flatMap(metadataIssues);
    if(xs.some(r=>stable(r.origin)!==stable(o)))issues.push('IMMUTABLE_ORIGIN_CHANGED');
    if(xs.some(r=>stable(r.audit_meta)!==stable(first.audit_meta)))issues.push('IMMUTABLE_FEATURE_OR_FORECAST_CHANGED');
    if(assets.get(o.instrument_id).size>1)issues.push('INSTRUMENT_ASSET_CONFLICT');
    const statuses=new Set(xs.map(r=>r.outcome?.status).filter(s=>['HIT','MISS'].includes(s)));
    if(statuses.size>1)issues.push('CONTRADICTORY_OUTCOMES');
    const resolved=xs.find(r=>['HIT','MISS'].includes(r.outcome?.status)),deadline=o.t0+14400000;
    let partition;
    if(deadline>as_of_ts)partition='PENDING';
    else if(!resolved)partition='UNKNOWN';
    else if(o.t0>=split)partition='HOLDOUT';
    else if(deadline>split)partition='PURGED_HORIZON_CROSSES_SPLIT';
    else if(resolved.recorded_ts>split)partition='PURGED_LABEL_NOT_KNOWN_AT_SPLIT';
    else partition='TRAIN';
    if(!planValid)issues.push('SPLIT_NOT_PREDECLARED');
    const unique=[...new Set(issues)],m=first.audit_meta;
    if(publication.get(wave_key)==='UNKNOWN')unique.push('PUBLICATION_STATUS_UNRESOLVED');
    if(o.t0>=split&&m?.forecast?.training_cutoff_ts>split)unique.push('HOLDOUT_TRAINING_PAST_SPLIT');
    const cohort_key=JSON.stringify([o.mode,publication.get(wave_key)??'UNKNOWN',o.map_mode,o.rules_version,o.profile_version,o.evidence_class,m?.implementation_sha256??null,m?.feature_schema_version??null,m?.forecast?.model_version??null]);
    const w={wave_key,cohort_key,asset_id:o.asset_id,origin_t0:o.t0,deadline_ts:deadline,first_resolved_recorded_ts:resolved?.recorded_ts??null,partition,issues:unique,
      structurally_usable:unique.length===0,native_evidence_claim:o.evidence_class==='OBSERVED',external_provenance_authenticated:false};
    waves.push(w);const list=cohorts.get(cohort_key)??[];list.push(w);cohorts.set(cohort_key,list);for(const reason of unique)reasons[reason]=(reasons[reason]??0)+1;
  }
  const counts=xs=>Object.fromEntries(['TRAIN','HOLDOUT','PENDING','UNKNOWN','PURGED_HORIZON_CROSSES_SPLIT','PURGED_LABEL_NOT_KNOWN_AT_SPLIT'].map(p=>[p,xs.filter(x=>x.partition===p).length]));
  const floors=ws=>{
    const clean=ws.filter(w=>w.structurally_usable&&['TRAIN','HOLDOUT'].includes(w.partition)),holdout=clean.filter(w=>w.partition==='HOLDOUT');
    const observed={resolved_mature_waves:clean.length,assets:new Set(clean.map(w=>w.asset_id)).size,calendar_days:new Set(clean.map(w=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(w.origin_t0))).size,temporal_holdout_waves:holdout.length};
    return {requirements:{...PROPOSED_SAMPLE_REQUIREMENTS},observed,counts_met:Object.entries(PROPOSED_SAMPLE_REQUIREMENTS).every(([k,n])=>observed[k]>=n),
      status:'PROPOSED_ENGINEERING_FLOORS_NOT_QUALITY_OR_PROVENANCE_PROOF',calibration_validated:false};
  };
  return {version:COHORT_AUDIT_VERSION,as_of_ts,split_plan:structuredClone(split_plan),split_predeclared:planValid,input_records:records.length,purpose_eligible_records:eligible.length,excluded_by_purpose:records.length-eligible.length,purpose_exclusions,declared_independent_waves:summary.independent_waves,
    inspected_waves:waves.length,invalid_records:summary.invalid_records,excluded_future_records:summary.excluded_future_records,duplicate_record_replays:summary.duplicate_record_replays,
    assets:new Set([...groups.values()].map(xs=>xs[0].origin.asset_id)).size,distinct_origin_times:new Set(waves.map(w=>w.origin_t0)).size,
    partitions:counts(waves),quality_reason_wave_counts:reasons,waves,
    cohorts:[...cohorts].sort(([a],[b])=>a.localeCompare(b,'en')).map(([cohort_key,ws])=>({cohort_key,waves:ws.length,partitions:counts(ws),proposed_floor_check:floors(ws),
      clean_train_wave_keys:ws.filter(w=>w.partition==='TRAIN'&&w.structurally_usable).map(w=>w.wave_key).sort(),clean_holdout_wave_keys:ws.filter(w=>w.partition==='HOLDOUT'&&w.structurally_usable).map(w=>w.wave_key).sort()})),
    empirical_success_rate_pct:null,probability_pct:null,calibration_validated:false,publication_allowed:false,external_provenance_authenticated:false,
    limitations:['Counts audit the supplied records only','OBSERVED flag and claimed digests do not authenticate native evidence','All updates of one instrument+wave remain in one partition','Training labels must mature and be known before split','No model fitted; no percentage or causal map benefit estimated']};
}

export const CAPSULE_COHORT_AUDIT_VERSION='pump-cohort-capsule-audit-v2-20261025';
function capsuleAnchorIssues(meta,feature,row){
  const a=meta?.origin_anchor,o=feature.origin,issues=[];
  if(a?.immutable!==true||a.analysis_id!==feature.analysis_key||a.analysis_sha256!==feature.analysis_sha256||stable(a.origin)!==stable(o)||
    !validTime(a.selection?.selected_ts)||!validTime(a.selection?.recorded_ts)||a.selection.selected_ts<feature.recorded_ts||a.selection.recorded_ts<a.selection.selected_ts||a.selection.recorded_ts>row.recorded_ts)issues.push('ORIGINAL_ANCHOR_UNBOUND');
  if(row.publication?.state==='UNSENT'){
    const t=meta?.unsent_terminal;
    const known=t?.known_ts??t?.recorded_ts;
    if(a?.selection?.kind!=='FIRST_READY'||!['CANCELLED','EXPIRED','COMPLETED'].includes(t?.state)||!text(t.evidence_ref)||!validTime(t.event_ts)||!validTime(known)||t.event_ts<o.t0||known<t.event_ts||known>row.recorded_ts)issues.push('UNSENT_TERMINAL_ADMISSION_UNBOUND');
  }else if(a?.selection?.kind!=='FIRST_POSSIBLE_OR_CONFIRMED_SEND')issues.push('PUBLISHED_ANCHOR_SELECTION_UNBOUND');
  if(row.publication?.state==='UNKNOWN'&&!text(meta?.possible_send_ref))issues.push('POSSIBLE_SEND_EVIDENCE_UNBOUND');
  return issues;
}
async function inspectCapsuleRecord(row,evidence){
  const issues=[],f=evidence?.feature,o=evidence?.outcome,link=evidence?.link,saved=evidence?.saved_analysis;
  if(!f?.capsule||!o?.capsule||!link||!saved?.analysis||!saved?.input)return {issues:['CAPSULE_LINK_OR_ORIGINAL_READBACK_REQUIRED']};
  try{
    const view=await readFeatureCapsule(f),fc=f.capsule,oc=o.capsule;
    if(f.key!=='pump:feature-capsule:v2:'+fc.analysis_sha256||o.key!=='pump:outcome-capsule:v2:'+o.sha256||!digest(o.sha256)||await capsuleDigest(oc)!==o.sha256||oc.schema!==OUTCOME_CAPSULE_VERSION)issues.push('CAPSULE_ENVELOPE_OR_SCHEMA_MISMATCH');
    if(link.schema!=='pump-summary-capsule-link-v2-20261025'||link.summary_record_id!==row.record_id||link.analysis_key!==fc.analysis_key||link.feature_key!==f.key||link.feature_sha256!==f.sha256||link.outcome_key!==o.key||link.outcome_sha256!==o.sha256||link.originals_required!==true||link.global_reference_closure!==false||!text(link.protected_refs?.key)||!digest(link.protected_refs?.sha256))issues.push('SUMMARY_CAPSULE_LINK_MISMATCH');
    if(stable(fc.origin)!==stable(row.origin)||stable(oc.origin)!==stable(fc.origin)||oc.feature_key!==f.key||oc.feature_sha256!==f.sha256||oc.analysis_key!==fc.analysis_key||oc.analysis_sha256!==fc.analysis_sha256||oc.original_plan_sha256!==fc.original_plan_sha256||oc.summary_record_id!==row.record_id)issues.push('IMMUTABLE_CAPSULE_ORIGIN_MISMATCH');
    if(!validTime(saved.saved_ts)||saved.saved_ts!==fc.recorded_ts||saved.saved_ts>row.recorded_ts||oc.recorded_ts!==row.recorded_ts)issues.push('CAPSULE_PERSISTED_CLOCK_MISMATCH');
    if(!digest(saved.implementation_sha256)||saved.implementation_sha256!==fc.implementation_sha256||saved.evidence_class!==fc.origin.evidence_class)issues.push('ORIGINAL_IMPLEMENTATION_OR_EVIDENCE_PIN_MISMATCH');
    if(await capsuleDigest(saved.analysis)!==fc.analysis_sha256||await capsuleDigest(saved.input)!==fc.input_sha256||await capsuleDigest(saved.analysis.plan)!==fc.original_plan_sha256)issues.push('ORIGINAL_ANALYSIS_INPUT_PLAN_DIGEST_MISMATCH');
    const rebuilt=await prepareFeatureCapsule({analysis:saved.analysis,input:saved.input,analysis_key:fc.analysis_key,implementation_sha256:fc.implementation_sha256,recorded_ts:saved.saved_ts,evidence_class:fc.origin.evidence_class});
    if(rebuilt.sha256!==f.sha256||stable(rebuilt.capsule)!==stable(fc))issues.push('FEATURE_PROJECTION_READBACK_MISMATCH');
    if(row.record_id!=='pump:summary-record:'+await capsuleDigest({origin:row.origin,publication:row.publication,outcome:row.outcome??null}))issues.push('ORIGINAL_SUMMARY_CONTENT_HASH_MISMATCH');
    if(oc.original_outcome_sha256!==(row.outcome?await capsuleDigest(row.outcome):null)||oc.original_publication_sha256!==(row.publication?await capsuleDigest(row.publication):null))issues.push('ORIGINAL_OUTCOME_PUBLICATION_DIGEST_MISMATCH');
    const label=await prepareOutcomeCapsule({feature_capsule:fc,feature_sha256:f.sha256,outcome:row.outcome??null,publication:row.publication??null,recorded_ts:row.recorded_ts,summary_record_id:row.record_id});
    if(label.sha256!==o.sha256||stable(label.capsule)!==stable(oc))issues.push('OUTCOME_PROJECTION_READBACK_MISMATCH');
    issues.push(...capsuleAnchorIssues(evidence.anchor_meta,fc,row));
    const valueFeatures=view.features.filter(x=>x.value!==null);
    if(valueFeatures.some(x=>x.known_ts>row.origin.t0))issues.push('FUTURE_FEATURE_LEAKAGE');
    return {issues:[...new Set(issues)],feature:fc,feature_sha256:f.sha256,label:oc.label,scenario:oc.scenario,publication:oc.publication,
      label_sha256:oc.original_outcome_sha256,outcome_capsule_sha256:o.sha256,meta:evidence.anchor_meta??{},forecast:evidence.forecast??null,
      forecast_readback:evidence.forecast_readback??null,training_manifest:evidence.training_manifest??null,
      protected_refs:[fc.analysis_key,f.key,o.key,link.protected_refs.key,oc.outcome_key,row.record_id]};
  }catch(error){return {issues:[...new Set([...issues,'V2_READBACK_REJECTED:'+String(error.message??error).slice(0,128)])]};}
}
async function calibrationBlockers(inspected,origin,split){
  const p=inspected.forecast,issues=[];
  if(!p)return ['NO_PRECOMMITTED_FORECAST','NOT_CALIBRATED'];
  if(!finite(p.value_pct)||p.value_pct<0||p.value_pct>100||!text(p.model_version))issues.push('FORECAST_SHAPE_UNQUALIFIED');
  if(!inspected.forecast_readback||stable(inspected.forecast_readback)!==stable(p))issues.push('FORECAST_ORIGINAL_READBACK_REQUIRED');
  if(!digest(p.training_manifest_sha256)||!inspected.training_manifest||await capsuleDigest(inspected.training_manifest)!==p.training_manifest_sha256)issues.push('TRAINING_MANIFEST_UNBOUND');
  if(!validTime(p.created_ts)||p.created_ts>origin.t0)issues.push('FORECAST_AFTER_ORIGIN');
  if(!validTime(p.training_cutoff_ts)||!validTime(p.trained_through_label_ts)||p.trained_through_label_ts>p.training_cutoff_ts||p.training_cutoff_ts>=origin.t0)issues.push('FORECAST_TRAINING_LEAKAGE');
  if(p.mode!==origin.mode||p.map_mode!==origin.map_mode||p.rules_version!==origin.rules_version||p.profile_version!==origin.profile_version||p.feature_schema_version!==FEATURE_CAPSULE_VERSION)issues.push('FORECAST_COHORT_MISMATCH');
  if(origin.t0>=split&&p.training_cutoff_ts>split)issues.push('HOLDOUT_TRAINING_PAST_SPLIT');
  return [...new Set([...issues,'CALIBRATION_NOT_PERFORMED'])];
}
async function auditCapsuleCohort(records,{as_of_ts,split_plan,resolve_evidence}={}){
  bounded(records,AUDIT_BOUNDS.records);
  if(!validTime(as_of_ts)||!validTime(split_plan?.split_ts))throw Error('AUDIT_TIME_AND_SPLIT_REQUIRED');
  if(resolve_evidence!==undefined&&typeof resolve_evidence!=='function')throw Error('AUDIT_EVIDENCE_RESOLVER_INVALID');
  const split=split_plan.split_ts,planValid=validTime(split_plan.declared_ts)&&split_plan.declared_ts<=split&&split<=as_of_ts&&text(split_plan.plan_ref);
  const known=records.filter(r=>validTime(r?.recorded_ts)&&r.recorded_ts<=as_of_ts),future=records.filter(r=>validTime(r?.recorded_ts)&&r.recorded_ts>as_of_ts);
  const blocked=new Set(known.filter(r=>text(r.origin?.instrument_id)&&text(r.origin?.wave_id)&&!productionRecord(r)).map(r=>key(r.origin)));
  const eligible=known.filter(r=>productionRecord(r)&&!blocked.has(key(r.origin))),groups=new Map(),ids=new Map(),invalid=records.filter(r=>!validTime(r?.recorded_ts)).map(r=>({record_id:r?.record_id??null,issues:['SUMMARY_RECORDED_TIME_INVALID']})),assets=new Map();let replays=0,evidenceBytes=0;
  for(const row of eligible){
    if(!text(row.record_id)||!text(row.origin?.instrument_id)||!text(row.origin?.wave_id)){invalid.push({record_id:row.record_id??null,issues:['SUMMARY_RECORD_INVALID']});continue;}
    const raw=stable(row),old=ids.get(row.record_id);
    if(old?.has(raw)){replays++;continue;}const signatures=old??new Set();signatures.add(raw);ids.set(row.record_id,signatures);
    let evidence,inspected;
    try{
      evidence=resolve_evidence?await resolve_evidence(structuredClone(row)):row.capsule_evidence;
      if(resolve_evidence){evidenceBytes+=new TextEncoder().encode(JSON.stringify(evidence)).byteLength;if(evidenceBytes>AUDIT_BOUNDS.bytes)throw Error('AUDIT_EVIDENCE_BOUND_EXCEEDED');}
      inspected=await inspectCapsuleRecord(row,evidence);
    }catch(error){if(error.message==='AUDIT_EVIDENCE_BOUND_EXCEEDED')throw error;inspected={issues:['CAPSULE_EVIDENCE_READBACK_FAILED:'+String(error.message??error).slice(0,128)]};}
    if(inspected.issues.length)invalid.push({record_id:row.record_id,issues:inspected.issues});
    const k=key(row.origin),xs=groups.get(k)??[];xs.push({row,inspected});groups.set(k,xs);
    const set=assets.get(row.origin.instrument_id)??new Set();set.add(row.origin.asset_id);assets.set(row.origin.instrument_id,set);
  }
  const waves=[],cohorts=new Map(),reasonCounts={};
  for(const [wave_key,xs]of groups){
    xs.sort((a,b)=>a.row.recorded_ts-b.row.recorded_ts||a.row.record_id.localeCompare(b.row.record_id,'en'));
    const first=xs[0],origin=first.row.origin,issues=xs.flatMap(x=>x.inspected.issues),valid=xs.filter(x=>!x.inspected.issues.length),feature=valid[0]?.inspected.feature;
    if(xs.some(x=>stable(x.row.origin)!==stable(origin)))issues.push('IMMUTABLE_ORIGIN_CHANGED');
    if(xs.some(x=>ids.get(x.row.record_id).size>1))issues.push('IMMUTABLE_RECORD_ID_CONFLICT');
    if(valid.some(x=>x.inspected.feature_sha256!==valid[0].inspected.feature_sha256))issues.push('IMMUTABLE_FEATURE_CHANGED');
    if(assets.get(origin.instrument_id).size>1)issues.push('INSTRUMENT_ASSET_CONFLICT');
    const resolved=valid.filter(x=>['HIT','MISS'].includes(x.inspected.label?.status)),statuses=new Set(resolved.map(x=>x.inspected.label.status));
    if(statuses.size>1)issues.push('CONTRADICTORY_OUTCOMES');
    // A later complete DD/coverage revision must never rewrite the first
    // persisted resolved label used by the declared chronological split.
    const firstLabel=resolved[0],deadline=origin.t0+14400000,labelKnown=firstLabel?.row.recorded_ts??null;
    const partition=deadline>as_of_ts?'PENDING':!firstLabel?'UNKNOWN':origin.t0>=split?'HOLDOUT':deadline>split?'PURGED_HORIZON_CROSSES_SPLIT':labelKnown>split?'PURGED_LABEL_NOT_KNOWN_AT_SPLIT':'TRAIN';
    if(!planValid)issues.push('SPLIT_NOT_PREDECLARED');
    const pub=valid.find(x=>x.inspected.publication?.state==='SENT')?.inspected.publication?.state??valid.at(-1)?.inspected.publication?.state??'UNKNOWN';
    if(pub==='UNKNOWN')issues.push('PUBLICATION_STATUS_UNRESOLVED');
    const forecast=valid[0]?.inspected.forecast;
    if(valid.some(x=>stable(x.inspected.forecast)!==stable(forecast)))issues.push('IMMUTABLE_FORECAST_CHANGED');
    const blockers=await calibrationBlockers(valid[0]?.inspected??{},origin,split),unique=[...new Set(issues)];
    const cohort_key=JSON.stringify([origin.mode,pub,origin.map_mode,origin.rules_version,origin.profile_version,origin.evidence_class,feature?.implementation_sha256??null,FEATURE_CAPSULE_VERSION,forecast?.model_version??null]);
    const w={wave_key,cohort_key,asset_id:origin.asset_id,origin_t0:origin.t0,reference_price:origin.reference_price,deadline_ts:deadline,partition,
      first_resolved_recorded_ts:labelKnown,first_resolved_record_id:firstLabel?.row.record_id??null,first_resolved_label_sha256:firstLabel?.inspected.label_sha256??null,
      first_resolved_label:firstLabel?structuredClone(firstLabel.inspected.label):null,first_resolved_scenario:firstLabel?structuredClone(firstLabel.inspected.scenario):null,
      feature_sha256:valid[0]?.inspected.feature_sha256??null,implementation_sha256:feature?.implementation_sha256??null,
      issues:unique,structurally_usable:unique.length===0,calibration_status:'NOT_CALIBRATED',calibration_blockers:blockers,
      protected_original_refs:[...new Set(valid.flatMap(x=>x.inspected.protected_refs))],delete_allowed:false,external_provenance_authenticated:false};
    waves.push(w);const list=cohorts.get(cohort_key)??[];list.push(w);cohorts.set(cohort_key,list);for(const reason of unique)reasonCounts[reason]=(reasonCounts[reason]??0)+1;
  }
  const counts=ws=>Object.fromEntries(['TRAIN','HOLDOUT','PENDING','UNKNOWN','PURGED_HORIZON_CROSSES_SPLIT','PURGED_LABEL_NOT_KNOWN_AT_SPLIT'].map(p=>[p,ws.filter(w=>w.partition===p).length]));
  return {version:CAPSULE_COHORT_AUDIT_VERSION,feature_schema_version:FEATURE_CAPSULE_VERSION,as_of_ts,split_plan:structuredClone(split_plan),split_predeclared:planValid,
    input_records:records.length,purpose_eligible_records:eligible.length,excluded_future_records:future.length,excluded_by_purpose:known.length-eligible.length,
    purpose_exclusions:{acceptance_test:known.filter(r=>recordPurpose(r)==='ACCEPTANCE_TEST').length,unclassified:known.filter(r=>recordPurpose(r)==='UNCLASSIFIED').length,non_observed_production:known.filter(r=>recordPurpose(r)==='PRODUCTION'&&!productionRecord(r)).length,production_wave_conflict:known.filter(r=>productionRecord(r)&&blocked.has(key(r.origin))).length},
    duplicate_record_replays:replays,hydrated_evidence_bytes:evidenceBytes,invalid_records:invalid.length,invalid_record_details:invalid,declared_independent_waves:groups.size,inspected_waves:waves.length,partitions:counts(waves),quality_reason_wave_counts:reasonCounts,waves,
    cohorts:[...cohorts].sort(([a],[b])=>a.localeCompare(b,'en')).map(([cohort_key,ws])=>({cohort_key,waves:ws.length,partitions:counts(ws),clean_train_wave_keys:ws.filter(w=>w.partition==='TRAIN'&&w.structurally_usable).map(w=>w.wave_key).sort(),clean_holdout_wave_keys:ws.filter(w=>w.partition==='HOLDOUT'&&w.structurally_usable).map(w=>w.wave_key).sort(),calibration_status:'NOT_CALIBRATED'})),
    status:'NOT_CALIBRATED',empirical_success_rate_pct:null,probability_pct:null,feature_benefit_pct:null,feature_usefulness_proven:false,calibration_validated:false,publication_allowed:false,
    external_provenance_authenticated:false,retention:{delete_allowed:false,approved_delete_ttl_ms:null,originals_required:true,global_reference_closure:false},
    limitations:['Explicit v2 consumer; historical v1 metadata is not promoted','Original readback and claimed hashes do not authenticate external native provenance','First persisted resolved label is immutable across later coverage/DD revisions','Feature availability does not prove predictive or causal benefit','No model fit or calibration performed; no probability or percentage published']};
}

function featureClockIssues(side){
  const a=side.analysis,input=side.input,at=a?.analysis_ts,issues=[];
  if(!input||input.analysis_ts!==at||input.instrument?.instrument_id!==a?.instrument?.instrument_id)return ['INITIAL_INPUT_NOT_BOUND'];
  if(!Array.isArray(a.fact_ids)||!a.fact_ids.length||['price','candles','orderbook'].some(k=>!input.facts?.[k]||!a.fact_ids.includes(input.facts[k].fact_id)))issues.push('MANDATORY_FACT_BINDING_MISSING');
  const facts=Object.values(input.facts??{});
  for(const id of a.fact_ids??[]){const f=facts.find(f=>f?.fact_id===id);if(!f||!validTime(f.event_ts)||!validTime(f.received_ts)||f.event_ts>f.received_ts||f.received_ts>at)issues.push('INITIAL_FACT_CLOCK_UNQUALIFIED');}
  for(const z of [...(a.liquidations?.zones_up??[]),...(a.liquidations?.zones_down??[])])for(const c of z.components??[z]){
    if(!validTime(c.event_ts)||!validTime(c.received_ts)||c.event_ts>c.received_ts||c.received_ts>at)issues.push('MAP_AFTER_ORIGIN');}
  if((input.previous_wave?.confirmed_pivots??[]).some(p=>!validTime(p.known_ts)||p.known_ts>at))issues.push('PIVOT_AFTER_ORIGIN');
  return issues;
}
function comparableInput(side,contrast){
  if(!side.input)return null;const i=side.input,omit={MAP:[],TRADES:['trades'],FUTURES:['open_interest','funding'],RELATIVE_CONTEXT:['market_context']}[contrast];
  return {instrument:i.instrument,analysis_ts:i.analysis_ts,mode:i.mode,previous_wave:i.previous_wave,facts:Object.fromEntries(Object.entries(i.facts??{}).filter(([k])=>!omit.includes(k))),...(contrast==='MAP'?{}:{liquidations:i.liquidations})};
}
export function auditPairedAnalyses(pairs,{as_of_ts}={}){
  bounded(pairs,AUDIT_BOUNDS.pairs);if(!validTime(as_of_ts))throw Error('AUDIT_AS_OF_REQUIRED');
  const seenIds=new Map(),waves=new Set(),results=[];let replays=0;
  for(const p of pairs){
    const a=p?.baseline?.analysis,b=p?.enriched?.analysis,issues=[],contrast=p?.contrast??'MAP';
    if(!text(p?.pair_id)||!a||!b||!['MAP','TRADES','FUTURES','RELATIVE_CONTEXT'].includes(contrast)){results.push({pair_id:p?.pair_id??null,issues:['PAIR_SHAPE_UNQUALIFIED'],qualified:false});continue;}
    const production=x=>productionRecord({origin:{instrument_id:x.instrument?.instrument_id,wave_id:x.wave_id,t0:x.analysis_ts,run_purpose:x.run_purpose,evidence_class:p.evidence_class??'UNCLASSIFIED'}});
    if(!production(a)||!production(b))issues.push('PAIR_NOT_OBSERVED_PRODUCTION');
    if(seenIds.has(p.pair_id)&&seenIds.get(p.pair_id)===stable(p)){replays++;continue;}
    if(seenIds.has(p.pair_id)){issues.push('PAIR_ID_CONFLICT');for(const prior of results.filter(r=>r.pair_id===p.pair_id)){prior.issues=[...new Set([...prior.issues,'PAIR_ID_CONFLICT'])];prior.qualified=false;}}
    seenIds.set(p.pair_id,stable(p));
    const origin=x=>({instrument_id:x.instrument?.instrument_id,asset_id:x.instrument?.asset_id,wave_id:x.wave_id,t0:x.analysis_ts,P0:x.reference_price,mode:x.mode,rules:x.rules_version,profile:x.profile_version});
    for(const side of [a,b])if(![side.instrument?.instrument_id,side.instrument?.asset_id,side.wave_id,side.rules_version,side.profile_version].every(text)||!finite(side.reference_price)||side.reference_price<=0||!['AUTO','MANUAL'].includes(side.mode))issues.push('PAIR_ORIGIN_UNQUALIFIED');
    if(stable(origin(a))!==stable(origin(b)))issues.push('PAIRED_ORIGIN_MISMATCH');
    const context=(x,kind)=>Boolean(x.optional_context?.[kind]);
    const contrastPresent=contrast==='MAP'?a.liquidations?.map_mode==='WITHOUT_MAP'&&b.liquidations?.map_mode==='WITH_MAP':contrast==='TRADES'?!a.trade_context&&Boolean(b.trade_context):contrast==='FUTURES'?!context(a,'open_interest')&&!context(a,'funding')&&(context(b,'open_interest')||context(b,'funding')):
      !a.findings?.some(f=>f.code==='RELATIVE_RETURN')&&b.findings?.some(f=>f.code==='RELATIVE_RETURN');
    if(!contrastPresent)issues.push('CONTRAST_NOT_PRESENT');
    if(!validTime(a.analysis_ts)||a.analysis_ts>as_of_ts)issues.push('PAIR_FROM_FUTURE');
    if(!digest(p.baseline.implementation_sha256)||p.baseline.implementation_sha256!==p.enriched.implementation_sha256)issues.push('PAIRED_IMPLEMENTATION_MISMATCH');
    issues.push(...featureClockIssues(p.baseline),...featureClockIssues(p.enriched));
    if(stable(comparableInput(p.baseline,contrast))!==stable(comparableInput(p.enriched,contrast)))issues.push('UNRELATED_INPUTS_CHANGED');
    const independent_key=JSON.stringify([a.instrument?.instrument_id,a.wave_id]);waves.add(independent_key);
    results.push({pair_id:p.pair_id,contrast,independent_key,issues:[...new Set(issues)],qualified:issues.length===0,evidence_class:p.evidence_class??'UNCLASSIFIED',
      baseline_ready:a.ready===true,enriched_ready:b.ready===true,plan_changed:stable(a.plan)!==stable(b.plan),text_changed:a.card_text!==b.card_text,
      benefit_pct:null,causal_benefit_proven:false});
  }
  return {version:COHORT_AUDIT_VERSION,input_pairs:pairs.length,pairs:results.length,duplicate_pair_replays:replays,declared_independent_waves:waves.size,results,
    qualified_pairs:results.filter(r=>r.qualified).length,benefit_pct:null,causal_benefit_proven:false,publication_allowed:false,external_provenance_authenticated:false,
    limitations:['Paired snapshots compare explanation/plan behavior only','A wave reused by several packages is not several independent successes','Neither raw map/no-map hit-rate differences nor synthetic pairs prove causal benefit']};
}
