import {finite,validTime} from '../contracts/index.mjs';
import {summarizeOutcomes,PROPOSED_SAMPLE_REQUIREMENTS} from './summary.mjs';
import {recordPurpose,productionRecord} from '../contracts/run-purpose.mjs';

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
export function auditCohortSample(records,{as_of_ts,split_plan}={}){
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
