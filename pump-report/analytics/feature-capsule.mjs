import {assertInput, finite, positive, validTime, TRADE_BASE_QUANTITY_UNIT, TRADE_QUOTE_NOTIONAL_UNIT} from '../contracts/index.mjs';
import {plusTenPrice} from './math.mjs';

export const FEATURE_CAPSULE_VERSION='pump-feature-capsule-v2-20261025';
export const OUTCOME_CAPSULE_VERSION='pump-outcome-capsule-v2-20261025';
export const CAPSULE_BOUNDS=Object.freeze({bytes:65536,features:48,facts:16,refs:256,journal_rows:64,strings:512});
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=CAPSULE_BOUNDS.strings;
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const stable=v=>v&&typeof v==='object'?Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
const categorical=new Set(['wave_state','impulse_baseline_status','map_mode']);
const featureNames=new Set(['wave_state','growth_5m_pct','growth_15m_pct','growth_60m_pct','growth_24h_pct','current_to_impulse_volume_ratio','impulse_to_baseline_volume_ratio','current_volume_counter','impulse_volume_counter','baseline_median_volume_counter','impulse_return_pct','impulse_baseline_windows','impulse_baseline_status','normal_range','position_limit_usdt','spread_pct','slippage_buy_pct','slippage_sell_pct','trade_buy_usdt','trade_sell_usdt','trade_netflow_usdt','trade_first_price','trade_last_price','trade_min_price','trade_max_price','trade_first_to_last_return_pct','trade_unique_executions','open_interest','funding_rate','funding_period_ms','map_mode','map_nearest_up_distance_pct','map_nearest_down_distance_pct','plan_minimum_potential_pct']);
const clone=v=>structuredClone(v);
const pick=(o,keys)=>Object.fromEntries(keys.map(k=>[k,o?.[k]??null]));
const list=(xs,max=64)=>{if(!Array.isArray(xs)||xs.length>max)throw Error('CAPSULE_ARRAY_BOUND_REQUIRED');return xs;};
const strings=(xs,max=64)=>[...new Set(list(xs??[],max).map(x=>{if(!text(x))throw Error('CAPSULE_REFERENCE_INVALID');return x;}))];
const bounded=value=>{if(new TextEncoder().encode(JSON.stringify(value)).byteLength>CAPSULE_BOUNDS.bytes)throw Error('CAPSULE_BYTE_BOUND_EXCEEDED');return value;};
export async function capsuleDigest(value){
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
const mapMode=a=>a.liquidations?.map_mode==='WITHOUT_MAP'?'NO_MAP':a.liquidations?.status==='PARTIAL'?'PARTIAL_MAP':'MAP';
const signalKey=a=>'pump:signal:'+a.instrument.instrument_id+':'+a.wave_id;
function provenance(fs,at){
  const valid=fs.length>0&&fs.every(f=>text(f?.fact_id)&&text(f.evidence_ref)&&validTime(f.event_ts)&&validTime(f.received_ts)&&f.event_ts<=f.received_ts&&f.received_ts<=at);
  return {bound:valid,source_fact_ids:fs.map(f=>f?.fact_id??null),source_event_ts:valid?Math.max(...fs.map(f=>f.event_ts)):null,
    received_ts:valid?Math.max(...fs.map(f=>f.received_ts)):null,known_ts:valid?at:null,evidence_refs:fs.map(f=>f?.evidence_ref??null)};
}
function feature(name,value,unit,fs,at,reason='FEATURE_NOT_AVAILABLE'){
  const p=provenance(fs,at),scalar=finite(value)||typeof value==='boolean'||text(value);
  const qualified=p.bound&&scalar;
  return {name,value:qualified?value:null,unit,absence_reason:qualified?null:!p.bound?'ORIGINAL_SOURCE_CLOCK_OR_EVIDENCE_UNBOUND':text(reason)?reason:'FEATURE_NOT_AVAILABLE',...p};
}
const factHeader=f=>({...pick(f,['fact_id','instrument_id','kind','unit','source','primary_provider','venue','origin','status','event_ts','received_ts','expires_ts','evidence_ref','reason']),
  coverage:pick(f?.coverage,['scope','time_qualified','time_basis','volume_qualified','relative_volume_qualified','comparison_kind','volume_comparison_key','native_quantity_unit','base_volume_qualified','quote_volume_qualified','turnover_quote_qualified','absolute_base_amount_qualified','absolute_USD_amount_qualified','base_quantity_qualified','quote_notional_qualified','notional_quote_unit','aggressor_side_qualified']),provenance_authenticated:false});
function planProjection(plan){
  if(!plan)return null;
  const area=z=>({...pick(z,['lower','upper','confirmation_level','confirmation_status']),basis_fact_ids:strings(z.basis_fact_ids,16),
    basis_level:pick(z.basis_level,['kind','price','event_ts','known_ts','fact_id'])});
  return {entry_zones:list(plan.entry_zones,3).map(area),exit_zone:area(plan.exit_zone),invalidation:pick(plan.invalidation,['kind','price']),
    position_limit_usdt:plan.position_limit_usdt??null,potential_pct:pick(plan.potential_pct,['minimum','maximum','basis']),automatic_orders:false};
}
function planProvenance(a,input){
  const base=[input.facts.candles,input.facts.orderbook],history=input.facts.price_structure,diagnostic=a.price_structure_diagnostic;
  const areas=[...list(a.plan?.entry_zones??[],3),...(a.plan?.exit_zone?[a.plan.exit_zone]:[])];
  const ids=[...new Set(areas.flatMap(area=>strings(area.basis_fact_ids??[],16)))];
  const history_used=diagnostic?.used_for_plan===true||text(history?.fact_id)&&ids.includes(history.fact_id);
  // Legacy originals retain exact bytes; new-context analyses resolve every
  // declared entry/exit basis, including an absent required source.
  if(!history_used&&!Object.hasOwn(a,'price_structure_diagnostic'))return {facts:base,history_used:false};
  if(history_used)for(const id of [diagnostic?.fact_id,history?.fact_id])if(text(id)&&!ids.includes(id))ids.push(id);
  const facts=[...base],seen=new Set(base.map(f=>f?.fact_id));
  for(const id of ids)if(!seen.has(id)){
    seen.add(id);const matches=Object.values(input.facts).filter(f=>f?.fact_id===id);
    facts.push(matches.length===1?matches[0]:undefined);
  }
  // Missing history/basis evidence leaves the scalar absent, never fake-bound.
  if(history_used&&(!history||!text(history.fact_id)))facts.push(undefined);
  return {facts,history_used};
}
function initialFeatures(a,input,planSources){
  const f=input.facts,at=a.analysis_ts,out=[],add=(name,value,unit,fs,reason)=>out.push(feature(name,value,unit,fs,at,reason));
  const core=[f.price,f.candles],book=[f.orderbook],trades=[f.trades],oi=[f.open_interest],funding=[f.funding];
  add('wave_state',a.wave_state,'STATE',core);
  for(const [minutes,ms]of [[5,300000],[15,900000],[60,3600000],[1440,86400000]]){
    const w=a.growth_windows?.find(w=>w.window_ms===ms),day=minutes===1440;
    const sources=w?.fact_ids?.length?w.fact_ids.map(id=>Object.values(f).find(f=>f?.fact_id===id)):[f.candles];
    add('growth_'+(day?'24h':minutes+'m')+'_pct',w?.return_pct,'PERCENT',sources,w?.reason??'EXACT_WINDOW_UNAVAILABLE');
  }
  add('current_to_impulse_volume_ratio',a.activity?.current_to_impulse_volume_ratio,'RATIO',[f.candles],a.activity?.current_to_impulse_volume_ratio_reason);
  add('impulse_to_baseline_volume_ratio',a.activity?.impulse?.ratio,'RATIO',[f.candles],a.activity?.impulse?.ratio_reason);
  const volumeUnit=a.activity?.volume_basis?.unit??'UNKNOWN';
  add('current_volume_counter',a.activity?.current_volume,volumeUnit,[f.candles]);
  add('impulse_volume_counter',a.activity?.impulse?.volume,volumeUnit,[f.candles]);
  add('baseline_median_volume_counter',a.activity?.impulse?.baseline_median,volumeUnit,[f.candles]);
  add('impulse_return_pct',a.activity?.impulse?.return_pct,'PERCENT',[f.candles]);
  add('impulse_baseline_windows',a.activity?.impulse?.baseline_windows,'COUNT',[f.candles]);
  add('impulse_baseline_status',a.activity?.impulse?.baseline_status,'STATE',[f.candles]);
  add('normal_range',a.activity?.impulse?.normal_range,'USDT_PER_BASE',[f.candles]);
  add('position_limit_usdt',a.liquidity?.position_limit_usdt,'USDT',book);
  add('spread_pct',a.liquidity?.spread_pct,'PERCENT',book);
  const size=a.liquidity?.sizes?.find(s=>s.usable&&s.notional_usdt===a.liquidity.position_limit_usdt);
  add('slippage_buy_pct',size?.entry_slippage_pct,'PERCENT',book);
  add('slippage_sell_pct',size?.exit_slippage_pct,'PERCENT',book);
  const c=a.trade_context,d=a.trade_diagnostic;
  for(const [name,key]of [['trade_buy_usdt','buy_usdt'],['trade_sell_usdt','sell_usdt'],['trade_netflow_usdt','netflow_usdt']])add(name,c?.[key],'USDT',trades,d?.reason);
  for(const key of ['first_price','last_price','min_price','max_price','first_to_last_return_pct'])add('trade_'+key,c?.price_response?.[key],key.endsWith('_pct')?'PERCENT':'USDT_PER_BASE',trades,c?.price_response_reason??d?.reason);
  add('trade_unique_executions',c?.unique_executions,'COUNT',trades,d?.reason);
  add('open_interest',a.optional_context?.open_interest?.value,a.optional_context?.open_interest?.unit??null,oi);
  add('funding_rate',a.optional_context?.funding?.value?.rate,'RATE_FRACTION',funding);
  add('funding_period_ms',a.optional_context?.funding?.value?.period_ms,'MILLISECOND',funding);
  const zones=[...list(a.liquidations?.zones_up??[],3),...list(a.liquidations?.zones_down??[],3)];
  const mapSources=zones.map(z=>({fact_id:z.zone_id,event_ts:z.event_ts,received_ts:z.received_ts,evidence_ref:z.evidence_ref}));
  // NO_MAP is a decision made from the original input; it is not an invented
  // zero-valued map measurement. Distance features remain explicitly absent.
  add('map_mode',mapMode(a),'STATE',core);
  const distance=(zs,side)=>zs?.length?Math.min(...zs.map(z=>100*(side==='up'?z.lower/a.reference_price-1:1-z.upper/a.reference_price))):null;
  add('map_nearest_up_distance_pct',distance(a.liquidations?.zones_up,'up'),'PERCENT',[f.price,...mapSources],'NO_QUALIFIED_UPPER_MAP_ZONE');
  add('map_nearest_down_distance_pct',distance(a.liquidations?.zones_down,'down'),'PERCENT',[f.price,...mapSources],'NO_QUALIFIED_LOWER_MAP_ZONE');
  add('plan_minimum_potential_pct',a.plan?.potential_pct?.minimum,'PERCENT',planSources.facts);
  return out;
}
function tradeProjection(a,f){
  if(!f)return {status:'ABSENT',reason:'TRADE_FACT_NOT_AVAILABLE',unit:null,amount_basis:null,base_quantity_qualified:false};
  const c=a.trade_context,d=a.trade_diagnostic,quote=f.unit===TRADE_QUOTE_NOTIONAL_UNIT,base=f.unit===TRADE_BASE_QUANTITY_UNIT;
  return {status:c?'QUALIFIED_SAMPLE':'UNAVAILABLE',reason:d?.reason??null,unit:f.unit,
    amount_basis:c?(quote?'OBSERVED_USDT_QUOTE_NOTIONAL':base?'OBSERVED_PRICE_TIMES_BASE_QUANTITY':null):null,
    base_quantity_qualified:Boolean(c&&base),quote_divided_by_price:false,
    sample:pick(c,['sample_start_ts','sample_end_ts','unique_executions','direction_coverage','price_response_reason']),
    coverage:pick(c?.coverage??d?.coverage,['scope','returned_rows','qualified_unique_rows','duplicate_rows','conflicting_ids','excluded_returned_rows']),
    exclusion_reasons:strings(c?.coverage?.exclusion_reasons??d?.coverage?.exclusion_reasons??[],32),
    full_market_coverage:false,absorption_proven:false,market_path_proven:false,causation_proven:false};
}
export async function prepareFeatureCapsule({analysis,input,analysis_key,implementation_sha256,recorded_ts,evidence_class='UNCLASSIFIED'}={}){
  assertInput(input);
  if(!analysis?.ready||!text(analysis.wave_id)||!positive(analysis.reference_price)||!validTime(analysis.analysis_ts)||!validTime(recorded_ts)||recorded_ts<analysis.analysis_ts||!digest(implementation_sha256))throw Error('CAPSULE_READY_ORIGINAL_AND_IMPLEMENTATION_REQUIRED');
  if(analysis.analysis_ts!==input.analysis_ts||analysis.run_id!==input.run_id||analysis.mode!==input.mode||stable(analysis.instrument)!==stable(input.instrument))throw Error('CAPSULE_ANALYSIS_INPUT_BINDING_MISMATCH');
  if(!['OBSERVED','ARTIFICIAL','NON_NATIVE','BACKFILLED','UNCLASSIFIED'].includes(evidence_class))throw Error('CAPSULE_EVIDENCE_CLASS_INVALID');
  const analysis_sha256=await capsuleDigest(analysis);
  if(analysis_key!=='pump:analysis:'+analysis_sha256)throw Error('CAPSULE_ANALYSIS_CONTENT_HASH_REQUIRED');
  const planSources=planProvenance(analysis,input);
  const facts=Object.entries(input.facts).filter(([kind])=>['price','candles','orderbook','ticker_24h','growth_24h','trades','open_interest','funding','price_structure'].includes(kind));
  list(facts,CAPSULE_BOUNDS.facts);
  const features=initialFeatures(analysis,input,planSources);list(features,CAPSULE_BOUNDS.features);
  if(!text(analysis.rules_version)||!text(analysis.profile_version)||!analysis.plan)throw Error('CAPSULE_ORIGINAL_RULES_AND_PLAN_REQUIRED');
  const origin={instrument_id:analysis.instrument.instrument_id,asset_id:analysis.instrument.asset_id,wave_id:analysis.wave_id,signal_id:signalKey(analysis),t0:analysis.analysis_ts,
    reference_price:analysis.reference_price,rules_version:analysis.rules_version,profile_version:analysis.profile_version,mode:analysis.mode,map_mode:mapMode(analysis),evidence_class,run_purpose:input.run_purpose??analysis.run_purpose??'UNCLASSIFIED',ready:true};
  const capsule=bounded({schema:FEATURE_CAPSULE_VERSION,analysis_key,analysis_sha256,input_sha256:await capsuleDigest(input),implementation_sha256,
    recorded_ts,origin,contract_version:analysis.contract_version,analysis_schema_version:analysis.schema_version,
    instrument:pick(analysis.instrument,['instrument_id','asset_id','native_symbol','venue','market_type','base','quote','settle','classification_status','identity_evidence_ref']),
    original_plan_sha256:await capsuleDigest(analysis.plan),plan:planProjection(analysis.plan),features,
    source_facts:facts.map(([,f])=>factHeader(f)),trade_sample:tradeProjection(analysis,input.facts.trades),
    candle_comparison:pick(analysis.activity?.volume_basis,['field','unit','comparison_kind','comparison_key','interval_ms']),
    map_sources:[...(analysis.liquidations?.zones_up??[]),...(analysis.liquidations?.zones_down??[])].map(z=>({...pick(z,['zone_id','source','primary_provider','venue','basis_type','model_id','model_version','lower','upper','magnitude_value','magnitude_unit','event_ts','received_ts','expires_ts','evidence_ref']),relative_scale:pick(z.relative_scale,['scale_id','model_version'])})),
    probability:{value_pct:null,reason:analysis.probability?.reason??'NOT_CALIBRATED'},
    audit_compatibility:'EXPLICIT_V2_READER_REQUIRED_NO_V1_PROMOTION',external_provenance_authenticated:false,
    retention:{automatic_delete:false,approved_delete_ttl_ms:null,originals_required:true,reference_closure_established:false}});
  return {key:'pump:feature-capsule:v2:'+analysis_sha256,sha256:await capsuleDigest(capsule),capsule};
}
export async function readFeatureCapsule({capsule,sha256}={}){
  if(capsule?.schema!==FEATURE_CAPSULE_VERSION||!digest(sha256)||await capsuleDigest(bounded(capsule))!==sha256)throw Error('FEATURE_CAPSULE_SCHEMA_OR_DIGEST_MISMATCH');
  list(capsule.features,CAPSULE_BOUNDS.features);
  if(!validTime(capsule.origin?.t0)||!positive(capsule.origin.reference_price)||!text(capsule.origin.wave_id)||!digest(capsule.analysis_sha256)||!digest(capsule.input_sha256)||!digest(capsule.implementation_sha256)||capsule.analysis_key!=='pump:analysis:'+capsule.analysis_sha256)throw Error('FEATURE_CAPSULE_ORIGIN_INVALID');
  const names=new Set();
  for(const f of capsule.features){
    if(!featureNames.has(f.name)||names.has(f.name)||!(f.value===null&&text(f.absence_reason)||categorical.has(f.name)&&text(f.value)||!categorical.has(f.name)&&finite(f.value)))throw Error('FEATURE_CAPSULE_SCALAR_INVALID');
    names.add(f.name);
    if(f.value!==null&&(f.bound!==true||!validTime(f.known_ts)||f.known_ts>capsule.origin.t0||!validTime(f.source_event_ts)||!validTime(f.received_ts)||f.source_event_ts>f.received_ts||f.received_ts>f.known_ts||!f.source_fact_ids?.length||f.source_fact_ids.some(x=>!text(x))||!f.evidence_refs?.length||f.evidence_refs.some(x=>!text(x))))throw Error('FEATURE_CAPSULE_FUTURE_OR_UNBOUND_VALUE');
  }
  return clone({schema:capsule.schema,origin:capsule.origin,features:capsule.features,implementation_sha256:capsule.implementation_sha256,
    analysis_sha256:capsule.analysis_sha256,plan:capsule.plan,trade_sample:capsule.trade_sample,probability:capsule.probability,external_provenance_authenticated:false});
}
export async function prepareOutcomeCapsule({feature_capsule,feature_sha256,outcome=null,publication=null,recorded_ts,summary_record_id=null}={}){
  const view=await readFeatureCapsule({capsule:feature_capsule,sha256:feature_sha256}),o=view.origin;
  if(!validTime(recorded_ts)||recorded_ts<o.t0)throw Error('OUTCOME_CAPSULE_RECORDED_TIME_REQUIRED');
  if(summary_record_id!==null&&!text(summary_record_id))throw Error('OUTCOME_CAPSULE_SUMMARY_REFERENCE_INVALID');
  if(outcome){
    const expected={signal_id:o.signal_id,wave_id:o.wave_id,t0:o.t0,reference_price:o.reference_price,rules_version:o.rules_version,mode:o.mode,map_mode:o.map_mode==='NO_MAP'?'WITHOUT_MAP':'WITH_MAP',target_price:plusTenPrice(o.reference_price),deadline_ts:o.t0+14400000};
    if(Object.entries(expected).some(([k,v])=>outcome[k]!==v)||!['HIT','MISS','UNKNOWN'].includes(outcome.status))throw Error('OUTCOME_CAPSULE_ORIGIN_MISMATCH');
    const exact=validTime(outcome.hit_ts)&&outcome.hit_ts>=o.t0&&outcome.hit_ts<=Math.min(recorded_ts,expected.deadline_ts),i=outcome.hit_interval;
    const interval=validTime(i?.start_ts)&&validTime(i?.end_ts)&&i.start_ts>=o.t0&&i.end_ts>i.start_ts&&i.end_ts<=Math.min(recorded_ts,expected.deadline_ts);
    if(outcome.status==='HIT'&&!exact&&!interval)throw Error('OUTCOME_CAPSULE_HIT_PROOF_UNBOUND');
    if(outcome.status==='MISS'&&(recorded_ts<expected.deadline_ts||outcome.coverage?.complete!==true&&!(outcome.coverage?.no_hit_period_covered===true&&outcome.coverage?.no_hit_basis==='ENCLOSING_CLOSED_MINUTE_BARS_ALL_HIGHS_BELOW_TARGET')))throw Error('OUTCOME_CAPSULE_MISS_COVERAGE_UNBOUND');
    for(const k of ['drawdown_before_hit_pct','drawdown_total_pct'])if(outcome[k]!==null&&(!finite(outcome[k])||outcome[k]<0||outcome[k]>100))throw Error('OUTCOME_CAPSULE_DRAWDOWN_INVALID');
  }
  const scenario=outcome?.scenario_outcome,excursion=scenario?.entry_area_excursion;
  const capsule=bounded({schema:OUTCOME_CAPSULE_VERSION,feature_schema:FEATURE_CAPSULE_VERSION,feature_sha256,feature_key:'pump:feature-capsule:v2:'+feature_capsule.analysis_sha256,
    analysis_key:feature_capsule.analysis_key,analysis_sha256:feature_capsule.analysis_sha256,original_plan_sha256:feature_capsule.original_plan_sha256,origin:clone(o),recorded_ts,
    outcome_key:'pump:outcome:'+o.signal_id,summary_record_id,original_outcome_sha256:outcome?await capsuleDigest(outcome):null,
    label:outcome?{...pick(outcome,['status','target_price','deadline_ts','hit_ts','drawdown_before_hit_pct','drawdown_total_pct','hit_after_invalidation']),hit_interval:outcome.hit_interval?pick(outcome.hit_interval,['start_ts','end_ts']):null,
      reasons:strings(outcome.reasons??[],32),coverage:pick(outcome.coverage,['complete','no_hit_period_covered','no_hit_basis','basis','covered_until_ts','observed_interval_complete','fully_contained_candles','boundary_candles_excluded','price_points','point_samples_prove_continuity'])}:
      {status:'UNKNOWN',reason:'OUTCOME_NOT_AVAILABLE',target_price:plusTenPrice(o.reference_price),deadline_ts:o.t0+14400000,drawdown_before_hit_pct:null,drawdown_total_pct:null},
    scenario:scenario?{...pick(scenario,['status','entry_touched','exit_touched','entry_then_exit_confirmed','intrabar_order_unknown']),entry_first_interval:scenario.entry_first_interval?pick(scenario.entry_first_interval,['start_ts','end_ts']):null,
      entry_area_excursion:excursion?pick(excursion,['area_floor_price','contact_confirmed_by_ts','post_confirmation_low_observed','below_area_pct_lower_bound','reason']):null,execution_proven:false,user_profit:null}:null,
    publication:publication?{...pick(publication,['state','event_id','event_ts','recorded_ts','possible_send','message_id','receipt_ref','card_id']),
      ...(publication.state==='SENT'&&(!/^[1-9][0-9]*$/.test(String(publication.message_id??''))||!text(publication.receipt_ref))?{state:'UNKNOWN',reason:'SENT_RECEIPT_NOT_BOUND'}:{})}:{state:'UNKNOWN',reason:'PUBLICATION_NOT_AVAILABLE'},
    original_publication_sha256:publication?await capsuleDigest(publication):null,
    aggregate_counters_do_not_replace_per_wave_labels:true,external_provenance_authenticated:false,
    retention:{automatic_delete:false,approved_delete_ttl_ms:null,originals_required:true,reference_closure_established:false}});
  const sha256=await capsuleDigest(capsule);return {key:'pump:outcome-capsule:v2:'+sha256,sha256,capsule};
}

// This is a bounded projection of supplied originals, never a global liveness
// scan or a deletion admission. Core/selected references remain strict; raw
// optional map overflow stays explicitly incomplete and requires originals.
// Time, HIT, terminal state and summary cursors cannot close an edge.
export async function projectProtectedReferences({analysis_key,analysis,input,card=null,journal=null,signal=null,summary_head=null,ordered_items=[],members=[],summary_records=[],external_audit_refs=[],owner_original_refs=[]}={}){
  if(!text(analysis_key)||!analysis||!input)throw Error('PROTECTED_ORIGINALS_REQUIRED');
  if(analysis_key!=='pump:analysis:'+await capsuleDigest(analysis))throw Error('PROTECTED_ANALYSIS_CONTENT_HASH_REQUIRED');
  const edges=[],reasons=new Set(['REFERENCE_CLOSURE_NOT_ESTABLISHED','EXTERNAL_REFERENCE_RESOLUTION_NOT_IMPLEMENTED','CURSOR_IS_NOT_GC_WATERMARK']),seen=new Set();
  const add=(from,to,kind)=>{if(!text(from)||!text(to))throw Error('PROTECTED_REFERENCE_INVALID');const k=JSON.stringify([from,to,kind]);if(!seen.has(k)){if(edges.length>=CAPSULE_BOUNDS.refs)throw Error('PROTECTED_REFERENCE_BOUND_EXCEEDED');seen.add(k);edges.push({from,to,kind,protected:true});}};
  const external=(from,to)=>{if(text(to))add(from,to,to.startsWith('pump:')?'STATE_OR_RECEIPT_REFERENCE':'UNRESOLVED_EXTERNAL_ORIGINAL');};
  const proofRef=(from,to)=>{if(to===null||to===undefined||typeof to==='string'&&!to.trim())return;if(!text(to))throw Error('CAPSULE_REFERENCE_INVALID');external(from,to);};
  const zoneProofs=z=>{for(const field of ['evidence_ref','identity_evidence_ref','model_evidence_ref','price_mapping_evidence_ref'])proofRef(analysis_key,z?.[field]);proofRef(analysis_key,z?.price_comparability?.evidence_ref);proofRef(analysis_key,z?.relative_scale?.evidence_ref);};
  add('SUPPLIED_ORIGINAL',analysis_key,'ORIGINAL_ANALYSIS_INPUT');
  proofRef(analysis_key,analysis.instrument?.identity_evidence_ref);
  proofRef(analysis_key,input.instrument?.identity_evidence_ref);
  if(input.run_purpose==='ACCEPTANCE_TEST'||analysis.run_purpose==='ACCEPTANCE_TEST')reasons.add('OWNER_PROTECTED_ACCEPTANCE_ORIGINAL');
  for(const [kind,f]of list(Object.entries(input.facts??{}),CAPSULE_BOUNDS.facts)){
    if(['market_context','relative_strength','benchmark'].includes(kind))continue;
    if(text(f?.fact_id))add(analysis_key,f.fact_id,'INTRA_ORIGINAL_FACT');
    external(analysis_key,f?.evidence_ref);
    if(!['price','ticker_24h','candles','orderbook','growth_24h','trades','open_interest','funding'].includes(kind))continue;
    proofRef(analysis_key,f?.identity_evidence_ref);
    if(['trades','open_interest','funding'].includes(kind))proofRef(analysis_key,f?.unit_evidence_ref);
    if(['candles','growth_24h'].includes(kind)){proofRef(analysis_key,f?.coverage?.time_evidence_ref);proofRef(analysis_key,f?.coverage?.owner_decision_ref);}
    if(kind==='growth_24h')proofRef(analysis_key,f?.derived_from?.time_evidence_ref);
    if(kind==='orderbook')proofRef(analysis_key,f?.coverage?.quantity_evidence_ref);
    if(kind==='trades')for(const field of ['response_bound_evidence_ref','id_mapping_evidence_ref','unit_and_maker_evidence_ref'])proofRef(analysis_key,f?.coverage?.[field]);
    if(kind==='funding')for(const field of ['evidence_ref','unit_evidence_ref','native_to_unified_evidence_ref','clock_evidence_ref','period_evidence_ref'])proofRef(analysis_key,f?.coverage?.[field]);
    if(kind==='candles')for(const row of list(f?.value??[],1440)){proofRef(analysis_key,row?.time_evidence_ref);proofRef(analysis_key,row?.volume_evidence_ref);}
  }
  for(const area of [...list(analysis.plan?.entry_zones??[],3),...(analysis.plan?.exit_zone?[analysis.plan.exit_zone]:[])])for(const id of strings(area.basis_fact_ids??[],16))add(analysis_key,id,'ORIGINAL_PLAN_BASIS_FACT');
  for(const z of [...list(analysis.liquidations?.zones_up??[],3),...list(analysis.liquidations?.zones_down??[],3)])zoneProofs(z);
  if(card){
    const ck='pump:card:'+card.card_id;add('SUPPLIED_CARD',ck,'DELIVERY_OR_AUDIT_ORIGINAL');external(ck,card.analysis?.source_input_key);
    if(card.receipt)external(ck,ck+'#receipt');
    if(['READY','SENDING','RETRYABLE','UNKNOWN'].includes(card.state))reasons.add('UNSETTLED_OR_POSSIBLE_SEND');
  }
  if(journal){
    const jk='pump:journal:'+analysis.instrument.instrument_id+':'+analysis.wave_id;
    for(const row of list(journal.analyses??[],CAPSULE_BOUNDS.journal_rows))external(jk,row.analysis_id);
    external(jk,journal.frozen_anchor?.analysis_id);
    for(const p of list(journal.publications??[],CAPSULE_BOUNDS.journal_rows)){
      if(text(p.card_id))add(jk,'pump:card:'+p.card_id,'PUBLICATION_ORIGINAL');external(jk,p.receipt_ref);
      if(p.state==='UNKNOWN'||p.possible_send===true)reasons.add('UNRESOLVED_POSSIBLE_SEND');
    }
    if(!journal.frozen_anchor)reasons.add('ORIGINAL_ANCHOR_NOT_FROZEN');
  }
  if(signal){
    add('SUPPLIED_SIGNAL',signal.signal_id,'ORIGINAL_SIGNAL');external(signal.signal_id,signal.analysis_key);
    add(signal.signal_id,'pump:outcome:'+signal.signal_id,'PER_WAVE_NUMERIC_LABELS');
  }
  if(summary_head?.pending?.id){external('pump:summary-ordered-head:v1',summary_head.pending.id);reasons.add('PENDING_SUMMARY_ALLOCATION');}
  for(const row of list(ordered_items,64))external('SUPPLIED_SUMMARY_ORDERED_ITEM',row.id);
  for(const row of list(members,64))external('SUPPLIED_SUMMARY_MEMBERSHIP',row.id);
  for(const row of list(summary_records,64)){
    external('SUPPLIED_SUMMARY_RECORD',row.record_id);external(row.record_id,row.origin?.signal_id);external(row.record_id,row.publication?.receipt_ref);
  }
  for(const ref of strings(external_audit_refs,64))external('EXTERNAL_AUDIT_OR_MODEL',ref);
  for(const ref of strings(owner_original_refs,64)){external('OWNER_PROTECTED_ORIGINAL',ref);reasons.add('OWNER_PROTECTED_ORIGINAL');}
  const projection={schema:'pump-protected-reference-projection-v2-20261025',scope:'SUPPLIED_ORIGINALS_ONLY_NOT_GLOBAL_REFERENCE_CLOSURE',edges,reasons:[...reasons],
    inventory_complete_for_global_cleanup:false,originals_required:true,delete_allowed:false,approved_delete_ttl_ms:null,archive_reader_verified:false};
  const suppliedZones=input.liquidations?.zones??[];
  if(Array.isArray(suppliedZones)&&suppliedZones.length===0)return bounded(projection);
  // Every strict core/card/journal/summary/audit/owner edge has priority. Reserve
  // the incomplete markers once; each optional unique edge costs only its own
  // UTF8 JSON bytes plus the array comma. Never serialize an expanding prefix.
  const incomplete=['SUPPLIED_INPUT_MAP_REFERENCE_INVENTORY_INCOMPLETE','ORIGINALS_REQUIRED_FOR_REFERENCE_OVERFLOW'];
  const encoder=new TextEncoder(),size=value=>encoder.encode(JSON.stringify(value)).byteLength;
  let bytes=size(projection);
  if(bytes>CAPSULE_BOUNDS.bytes)throw Error('CAPSULE_BYTE_BOUND_EXCEEDED');
  bytes+=size([...new Set([...reasons,...incomplete])])-size(projection.reasons);
  if(bytes>CAPSULE_BOUNDS.bytes){
    // The valid core may fit without space for extra reason strings. A shorter
    // scope marks the unscanned map without losing core edges or adding bytes.
    projection.scope='SUPPLIED_ORIGINALS_ONLY_MAP_REFS_INCOMPLETE';return bounded(projection);
  }
  const markIncomplete=()=>{for(const reason of incomplete)reasons.add(reason);};
  if(!Array.isArray(suppliedZones))markIncomplete();
  else{
    if(suppliedZones.length>CAPSULE_BOUNDS.refs)markIncomplete();
    optionalZones:for(let i=0;i<Math.min(suppliedZones.length,CAPSULE_BOUNDS.refs);i++){
      const z=suppliedZones[i];
      if(!z||typeof z!=='object'||Array.isArray(z)){markIncomplete();continue;}
      for(const ref of [z.evidence_ref,z.identity_evidence_ref,z.model_evidence_ref,z.price_mapping_evidence_ref,z.price_comparability?.evidence_ref,z.relative_scale?.evidence_ref]){
        if(ref===null||ref===undefined||typeof ref==='string'&&!ref.trim())continue;
        if(!text(ref)){markIncomplete();continue;}
        const kind=ref.startsWith('pump:')?'STATE_OR_RECEIPT_REFERENCE':'UNRESOLVED_EXTERNAL_ORIGINAL',key=JSON.stringify([analysis_key,ref,kind]);
        if(seen.has(key))continue;
        if(edges.length>=CAPSULE_BOUNDS.refs){markIncomplete();break optionalZones;}
        const edge={from:analysis_key,to:ref,kind,protected:true},extra=size(edge)+(edges.length?1:0);
        if(bytes+extra>CAPSULE_BOUNDS.bytes){markIncomplete();break optionalZones;}
        seen.add(key);edges.push(edge);bytes+=extra;
      }
    }
  }
  projection.reasons=[...reasons];return bounded(projection);
}
