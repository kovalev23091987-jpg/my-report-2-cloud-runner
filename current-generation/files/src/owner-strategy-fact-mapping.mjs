import {assessStrategyFitShadow,STRATEGY_FIT_GROUP_WEIGHTS} from './owner-strategy-fit-shadow.mjs';
import {validateEvidenceV2,evidenceDedupKey} from './evidence-v2.mjs';

export const STRATEGY_FACT_MAPPING_VERSION='EXACT_CANONICAL_STRATEGY_FACT_MAPPING_V1_20261010';
// A declared, inspectable shadow rubric. Facts qualify only their stated role;
// availability of a price/book is never a directional vote or ENTRY authority.
export function mapOriginalStrategyFacts(canonical){
 const c=canonical,now=c?.observed_ts,contract=c?.metadata?.contract,sign=c?.direction==='LONG'?1:-1;
 const identity={contract,direction:c?.direction,run_id:c?.run_id,snapshot_id:c?.snapshot_id,analytical_fingerprint:c?.analytical_fingerprint};
 const groups=Object.fromEntries(Object.keys(STRATEGY_FIT_GROUP_WEIGHTS).map(k=>[k,[]])),roots=new Set();
 const add=(group,id,name,role,fact,condition,maxAge)=>{
  const sourceTs=fact?.source_ts,observed=fact?.observed_ts,root=fact?.physical_root;
  let reason=!fact?'SOURCE_FACT_ABSENT':!fact.usable?'SOURCE_IDENTITY_SCHEMA_OR_CLOCK_NOT_CLOSED':
   !Number.isSafeInteger(sourceTs)||!Number.isSafeInteger(observed)||sourceTs>observed||observed>now||now-sourceTs>maxAge?'SOURCE_CLOCK_OR_FRESHNESS_NOT_CLOSED':
   !root||roots.has(root)?'DUPLICATE_OR_UNKNOWN_PHYSICAL_ROOT':condition!==true?'FACT_DOES_NOT_CONFIRM_DECLARED_CRITERION':'VERIFIED';
  const verified=reason==='VERIFIED';if(verified)roots.add(root);
  groups[group].push({...identity,id,name,role,status:verified?'VERIFIED':reason==='FACT_DOES_NOT_CONFIRM_DECLARED_CRITERION'?'CONTRADICTED':'MISSING',
   source:fact?.source??null,source_fact_id:fact?.id??null,source_ts:verified?sourceTs:null,observed_ts:verified?observed:null,
   physical_root:verified?root:null,max_age_ms:maxAge,reason,
   diagnostic_fact:fact?{source_ts:sourceTs,observed_ts:observed,physical_root:root,value:fact.value??null}:null});
 };
 const legacy=(venue,metric)=>{
  const rows=(c?.source_receipts||[]).filter(r=>r.venue===venue&&r.metric===metric);
  if(rows.length!==1)return null;const r=rows[0];
  return {id:metric+':'+venue,source:r.source||r.provider,source_ts:r.event_ts,observed_ts:r.received_ts,value:r.normalized_value,
   physical_root:[venue,r.symbol,'RETAINED_PROVIDER_RESPONSE',r.received_ts].join('|'),
   usable:r.status==='CLOSED'&&r.contract_code===contract&&r.identity?.contract_code===contract&&r.identity?.asset_identity_verified===true&&r.decision_usable===true};
 };
 const evidence=(family)=>{
  const rows=(c?.metadata?.internal_market_context?.evidence_v2?.evidence||[]).filter(r=>r.metric_family===family&&r.htx_contract===contract);
  if(rows.length!==1)return null;const r=rows[0];
  return {id:r.evidence_id,source:r.upstream_id,source_ts:r.source_ts,observed_ts:r.observed_ts,value:r.value,physical_root:r.physical_root_key||(r.book_physical_roots?.length===1?r.book_physical_roots[0]:null)||r.dependency_group||evidenceDedupKey(r),usable:validateEvidenceV2(r,{decision_ts:now}).usable,raw:r};
 };
 for(const venue of ['OKX','GATE']){const f=legacy(venue,'price_change_4h');add('direction_and_independent_evidence',venue.toLowerCase()+'_momentum_4h',`Изменение цены за четыре часа на ${venue}`,'DIRECTIONAL_MARKET_CONFIRMATION',f,typeof f?.value==='number'&&sign*f.value>0,14400000);}
 const oi=legacy('GATE','oi_change_1h'),gate=legacy('GATE','price_change_4h');
 add('direction_and_independent_evidence','gate_oi_building_1h','Рост открытого интереса при движении в направлении идеи','OI_WITH_DIRECTIONAL_PRICE_NOT_FUNDING_ALONE',oi,typeof oi?.value==='number'&&oi.value>0&&typeof gate?.value==='number'&&sign*gate.value>0,3600000);
 const flow=evidence('EXACT_FUTURES_TAKER_FLOW_4H');
 add('native_market_confirmation','htx_exact_taker_flow_4h','Полный поток сделок HTX за четыре часа','NATIVE_SIGNED_FLOW_DIRECTION',flow,
  flow?.raw?.coverage_status==='EXACT_FOUR_HOURS'&&flow.raw.verified_minutes===240&&flow.raw.window_end_ts-flow.raw.window_start_ts===14400000&&flow.raw.not_candle_signed_estimate===true&&typeof flow.value==='number'&&sign*flow.value>0,300000);
 const p=c?.metadata?.internal_market_context?.htx_reference_price;
 const primary=p?{id:'HTX_PRIMARY_REFERENCE',source:'HTX_OFFICIAL_PRIMARY_BOOK',source_ts:p.source_ts,observed_ts:p.received_ts,value:p.value,physical_root:`market.${contract}.depth.step0:${p.source_ts}`,usable:p.status==='CLOSED'&&p.contract===contract&&p.venue==='HTX'&&p.type==='MID_OBSERVATION'}:null;
 add('native_market_confirmation','htx_fresh_primary_price','Свежая фактическая цена HTX','PRIMARY_PRICE_AVAILABILITY_NOT_DIRECTION',primary,typeof p?.value==='number'&&p.value>0,180000);
 const range=evidence('CLOSED_CANDLE_RANGE_CONTEXT'),plan=c?.metadata?.scenario_plan_transfer?.fallback_receipt?.technical_range_receipt;
 add('entry_scenario_and_settlement','original_closed_candle_plan','Исходный план из проверенных закрытых свечей','SOURCE_BOUND_TRIGGER_AND_INVALIDATION',range,
  range?.raw?.all_candles_closed===true&&range.raw.candle_count===20&&plan?.evidence_id===range.id&&plan.level===c?.trigger?.value&&plan.cancel>0&&c.trigger?.expires_ts>now,180000);
 const settled=c?.metadata?.original_idea_recheck,bar=settled?.candle;
 const settlement=bar?{id:settled.task_id,source:bar.source,source_ts:bar.source_ts,observed_ts:bar.observed_ts,value:bar.close,physical_root:`HTX_SETTLEMENT:${contract}:${bar.interval_ms}:${bar.window_end}`,usable:settled.contract===contract&&settled.direction===c.direction&&settled.original_expires_ts>now&&settled.checked_ts<=now&&bar.all_candles_closed===true}:null;
 add('entry_scenario_and_settlement','original_trigger_settlement','Закрепление исходного триггера закрытой свечой','ORIGINAL_TRIGGER_SETTLEMENT_NOT_ENTRY_AUTHORITY',settlement,settled?.status==='ORIGINAL_TRIGGER_SETTLED'&&settled.settlement_confirmed===true,180000);
 const book=evidence('VERIFIED_EXECUTION_COST_CONTEXT');
 add('invalidation_risk_and_target','htx_execution_cost_assessed','Издержки оценены по исходному стакану HTX','EXECUTION_COST_ASSESSMENT_AVAILABILITY_NOT_FAVORABLE_RETURN',book,book?.raw?.coverage_status==='EXACT_IMMUTABLE_BOOK_ASSESSMENT'&&book.raw.immutable_evidence_ids?.length>0,15000);
 // A target copied from the same range does not earn an independent second
 // confirmation. No missing target is replaced by a liquidation estimate.
 const target=(c?.targets||[]).find(t=>typeof t.price==='number'&&t.price>0);
 add('invalidation_risk_and_target','independent_measured_target','Независимо подтверждённая измеренная цель','MEASURED_TARGET_AND_INVALIDATION',target?range:null,Boolean(target&&p?.value&&sign*(target.price-p.value)>0),180000);
 return {version:STRATEGY_FACT_MAPPING_VERSION,criteria:groups,sourceHTTP:0,D1:0,Telegram:0,production_filter_unchanged:true};
}
export function assessOriginalStrategyFacts(canonical,{weight_model='PRIMARY_35_30_20_15'}={}){
 const mapped=mapOriginalStrategyFacts(canonical);
 return {...assessStrategyFitShadow({canonical,criteria:mapped.criteria,decision_ts:canonical?.observed_ts,weight_model}),fact_mapping_version:mapped.version};
}
