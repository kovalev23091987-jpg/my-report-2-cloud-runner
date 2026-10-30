import {assertInput, ANALYSIS_SCHEMA, CONTRACT_VERSION, factUsable, finite, positive, CANDLE_NATIVE_RELATIVE_UNIT, CANDLE_NATIVE_RELATIVE_KIND, CANDLE_CCXT_TIME_BASIS, candleNativeComparisonKey,OWNER_MIN_PLAN_POTENTIAL_PCT,ownerPublicationRefusal} from '../contracts/index.mjs';
import {START_PROFILE} from '../profile/start-v1.mjs';
import {closedCandles, unique} from './math.mjs';
import {analyzeMovement, constructPlan} from './movement.mjs';
import {measureLiquidity} from './liquidity.mjs';
import {selectZones} from './zones.mjs';
import {explainOptionalFacts, explainMapPlan} from './context.mjs';
import {consumeObservedDayGrowth} from './day-growth.mjs';
import {explainManualAnalysis} from './manual-text.mjs';
import {presentationModeLines,selectGrowthProof,growthProofLine,FUTURE_EVENT_TEXT,movementStateText,currentActivityFinding,selectUserNarrative} from './presentation.mjs';
export {evaluateOutcome} from './outcome.mjs';

export const RULES_VERSION='pump-analytics-v4-first-qualification-20261025';
const clip=(s,n)=>{let out='';for(const point of s){if(out.length+point.length>n)break;out+=point;}return out;};
const wellFormed=s=>s.replace(/\p{Cs}/gu,'�');
const label=value=>clip(String(value??'').replace(/[\r\n\p{C}]/gu,' '),128);
const shortLabel=(value,n=32)=>{const s=label(value);return s.length>n?clip(s,n-1)+'…':s;};
const px=value=>Number(value.toPrecision(10)).toString();
function profileReady(p){
  return typeof p?.version==='string'&&['wave_max_age_ms','wave_search_ms','impulse_window_ms','volume_baseline_ms','candle_interval_ms','sharp_speed_multiple','reclaim_closed_bars',
    'pivot_radius_bars','entry_zone_normal_range_fraction','liquidation_merge_gap_normal_range','liquidation_merge_max_width_normal_range','maximum_entry_zones','maximum_liquidation_zones_per_side'].every(k=>positive(p[k]))&&
    p.candle_interval_ms===60000&&Number.isInteger(p.pivot_radius_bars)&&Number.isInteger(p.reclaim_closed_bars)&&p.maximum_entry_zones<=3&&p.maximum_liquidation_zones_per_side<=3;
}
function currentFact(f,at,ttl){return factUsable(f,at)&&f.event_ts<=f.received_ts&&at-f.event_ts<=ttl;}
function coreFact(f,kind,at,p,instrument){
  if(!f||f.kind!==kind||f.venue!=='BINGX'||f.origin!=='OBSERVED')return false;
  if(kind==='candles'&&f.unit===CANDLE_NATIVE_RELATIVE_UNIT){
    const c=f.coverage;
    return ['USABLE','INCOMPLETE'].includes(f.status)&&c?.time_qualified===true&&c.relative_volume_qualified===true&&c.volume_qualified===false&&c.time_basis===CANDLE_CCXT_TIME_BASIS&&
      c.comparison_kind===CANDLE_NATIVE_RELATIVE_KIND&&c.volume_comparison_key===candleNativeComparisonKey(instrument,p.candle_interval_ms)&&c.native_quantity_unit==='UNKNOWN'&&
      ![c.base_volume_qualified,c.quote_volume_qualified,c.turnover_quote_qualified,c.absolute_base_amount_qualified,c.absolute_USD_amount_qualified,c.independent_vendor_guarantee_claimed].includes(true)&&
      typeof f.evidence_ref==='string'&&f.evidence_ref.length>0&&currentFact({...f,status:'USABLE'},at,p.freshness_ms.candles);
  }
  if(kind==='candles'&&f.status==='INCOMPLETE'&&f.coverage?.time_qualified===true&&f.coverage?.volume_qualified===true){
    return currentFact({...f,status:'USABLE'},at,p.freshness_ms.candles);
  }
  return currentFact(f,at,p.freshness_ms[kind]);
}
function mapLine(z,at,compact=false){
  let magnitude='величина не определена';
  if(finite(z.magnitude_value)&&z.magnitude_unit){
    magnitude=px(z.magnitude_value)+' '+(compact?shortLabel(z.magnitude_unit,24):label(z.magnitude_unit));
    if(z.magnitude_unit==='RELATIVE_INTENSITY')magnitude+=(compact?' (шкала ':' (относительная шкала ')+shortLabel(z.relative_scale?.scale_id,compact?12:24)+')';
    if(z.components.length>1)magnitude+=compact?'; максимум, не сумма':'; максимум одной компоненты, не сумма';
  }
  const version=z.model_version??z.relative_scale?.model_version;
  const model=z.basis_type==='EXTERNAL_MODEL'?', расчётная, модель '+shortLabel(z.model_id??'не указана',compact?14:24)+(version?' / '+shortLabel(version,compact?10:16):' (версия не указана)'):', наблюдаемые позиции';
  const time=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(z.event_ts);
  const age=Math.floor((at-z.event_ts)/1000);
  const knownLimits={PARTIAL_SOURCE_COVERAGE:'охват источника ограничен',OBSERVED_ACCOUNTS_ONLY:'только наблюдаемые аккаунты',RETURNED_BINS_ONLY:'только опубликованный диапазон',
    OVERLAPPING_COVERAGE_NOT_SUMMED:'перекрывающееся покрытие не суммировалось',MERGED_MAGNITUDE_MAX_SINGLE_COMPONENT_NOT_SUMMED:'величина объединения не является суммой'};
  const limits=z.limitations?.length?(compact?'; ограничения: ':'; ограничения источника: ')+unique(z.limitations.map(k=>knownLimits[k]??'дополнительные ограничения источника')).slice(0,2).map(t=>compact?shortLabel(t,26):t).join(', ')+(compact&&z.limitations.length>2?'; др.':''):'';
  return px(z.lower)+'–'+px(z.upper)+' — '+magnitude+', '+shortLabel(z.source,compact?18:32)+(z.venue?' / '+shortLabel(z.venue,compact?14:24):'')+model+'; данные '+time+' МСК ('+age+' с назад)'+limits;
}
function render(result){
  const p=result.plan,narrative=result.user_narrative,selected=narrative.reasons.map(f=>wellFormed(f.text));
  function make(compact){
  const mode=presentationModeLines(result),lines=[label(result.instrument.native_symbol)+' · '+mode[0],...mode.slice(1),growthProofLine(result.growth_proof,compact),FUTURE_EVENT_TEXT,...(selected.length?[selected.join(' ')]:[]),
    'Покупка на откате: '+p.entry_zones.map(z=>px(z.lower)+'–'+px(z.upper)+' ('+(z.basis_level.kind==='HIGH'?'прежняя вершина':'прежний минимум')+' '+px(z.basis_level.price)+'; '+(z.confirmation_status==='CONFIRMED_RECLAIM'?'возврат подтверждён':'предварительная область')+')').join('; ')+'.',
    'Фиксация всей позиции: '+px(p.exit_zone.lower)+'–'+px(p.exit_zone.upper)+' — ближайшая подтверждённая вершина выше цены.'];
  if(narrative.limitation)lines.push(narrative.limitation);
  const map=result.liquidations;
  if(map.map_mode==='WITHOUT_MAP')lines.push('Карта ликвидаций недоступна. Области входа и выхода определены по движению цены и объёму; текущая ликвидность проверена.');
  else{lines.push('Ликвидации сверху: '+(map.zones_up.map(z=>mapLine(z,result.analysis_ts,compact)).join('; ')||'пригодных зон нет')+'.');lines.push('Ликвидации снизу: '+(map.zones_down.map(z=>mapLine(z,result.analysis_ts,compact)).join('; ')||'пригодных зон нет')+'.');if(map.status==='PARTIAL')lines.push('Карта неполная.');lines.push('Охват карты: только полученные данные источников.');}
  lines.push('Важно: '+(narrative.warning?narrative.warning+'; ':'')+'пересмотреть план при цене ниже '+px(p.invalidation.price)+'.');
  return wellFormed(lines.join('\n'));
  }
  const full=make(false);if(full.length<=4096)return full;
  // Compact the unchanged map format, retaining every selected main reason
  // and every mandatory plan, mode, growth, provenance and warning field.
  const notice='Краткая версия; полные сведения — в анализе.',card=make(true)+'\n'+notice;
  if(card.length>4096)throw Error('CARD_LENGTH_INVARIANT');
  return card;
}
function analyzeCore(input, profile){
  assertInput(input);
  const {facts,analysis_ts:at,instrument}=input;
  const result={schema_version:ANALYSIS_SCHEMA,contract_version:CONTRACT_VERSION,rules_version:RULES_VERSION,profile_version:profile?.version??null,run_id:input.run_id,mode:input.mode,run_purpose:typeof input.run_purpose==='string'?input.run_purpose:null,
    instrument:{...instrument},analysis_ts:at,reference_price:null,wave_id:null,wave_state:null,previous_wave:input.previous_wave??null,next_wave:null,current_threshold_passed:false,
    automatic_eligible:false,ready:false,status:'WAITING',reasons:[],findings:[],plan:null,liquidity:null,liquidations:null,
    probability:{value_pct:null,event:'PRICE_PLUS_10_PERCENT_WITHIN_4_HOURS',reason:'NOT_CALIBRATED'},notification_eligibility:{eligible:false,reason:'ANALYSIS_NOT_READY',required_potential_pct:OWNER_MIN_PLAN_POTENTIAL_PCT,minimum_potential_pct:null,comparison:null},fact_ids:[],card_text:null};
  if(!profileReady(profile))return {...result,reasons:['ANALYTICS_PROFILE_REQUIRED']};
  const usable={};
  for(const kind of ['price','candles','orderbook']){
    usable[kind]=coreFact(facts[kind],kind,at,profile,instrument);
    if(!usable[kind])result.reasons.push('MANDATORY_'+kind.toUpperCase()+'_NOT_USABLE');
  }
  if(!usable.price||!positive(facts.price.value))return {...result,reasons:unique([...result.reasons,...(!positive(facts.price?.value)?['POSITIVE_LAST_PRICE_REQUIRED']:[])])};
  if(facts.price.unit!=='USDT_PER_BASE')return {...result,reasons:unique([...result.reasons,'PRICE_UNIT_UNQUALIFIED'])};
  result.reference_price=facts.price.value;
  if(!usable.candles)return result;
  const native=facts.candles.unit===CANDLE_NATIVE_RELATIVE_UNIT;
  const normalized=closedCandles(facts.candles.value,at,profile.candle_interval_ms,native?{native_comparison_key:candleNativeComparisonKey(instrument,profile.candle_interval_ms)}:{}),rows=normalized.rows;
  if(normalized.reason||!rows.length||at-rows.at(-1).close_ts>profile.freshness_ms.candles)return {...result,reasons:unique([...result.reasons,normalized.reason??'CLOSED_CANDLES_STALE_OR_MISSING'])};
  const ticker=currentFact(facts.ticker_24h,at,profile.freshness_ms.price)&&facts.ticker_24h.unit==='USDT_ROLLING_24H'?facts.ticker_24h:null;
  const day=consumeObservedDayGrowth(facts.growth_24h,{instrument,as_of_ts:at,profile,rows});
  result.day_growth_diagnostic={usable:day.usable,reason:day.reason,fact_id:day.fact_id};
  const movement=analyzeMovement(input,rows,result.reference_price,ticker,profile,day);
  Object.assign(result,{wave_id:movement.wave_id,wave_state:movement.state,next_wave:movement.next_wave,current_threshold_passed:movement.current_threshold_passed,
    automatic_eligible:movement.automatic_eligible,growth_windows:movement.windows,activity:{impulse:movement.impulse,current_volume:movement.current_volume??null,current_to_impulse_volume_ratio:movement.current_to_impulse_volume_ratio??null,
      ratio_unit:'RATIO',current_to_impulse_volume_ratio_reason:movement.current_to_impulse_volume_ratio_reason??null,volume_basis:movement.volume_basis??null,volume_diagnostics:movement.volume_diagnostics??null,
      candle_time_basis:facts.candles.coverage?.time_basis??null,candle_evidence_ref:facts.candles.evidence_ref??null,
      candle_provenance:{coverage:structuredClone(facts.candles.coverage??null),event_ts:facts.candles.event_ts,received_ts:facts.candles.received_ts,source:facts.candles.source,venue:facts.candles.venue}},
    reasons:unique([...result.reasons,...movement.reasons]),fact_ids:[facts.price.fact_id,facts.candles.fact_id,...(ticker?[ticker.fact_id]:[]),...(day.usable?[day.fact_id]:[])]});
  result.growth_proof=selectGrowthProof(result,profile);
  result.liquidations=selectZones(input.liquidations,instrument,result.reference_price,movement.normal_range,at,profile);
  if(!movement.active){result.status=movement.reasons.some(r=>['CURRENT_VOLUME_REQUIRED','VOLUME_BASELINE_UNAVAILABLE','WAVE_PATH_INCOMPLETE','WAVE_VOLUME_COMPARISON_BASIS_CHANGED','VOLUME_BASELINE_ZERO_OR_UNKNOWN','IMPULSE_VOLUME_ZERO_OR_UNKNOWN','VOLUME_RATIO_NOT_FINITE'].includes(r))?'WAITING':'REJECTED';return result;}
  const stateText=movementStateText(result);if(stateText)result.findings.push({code:movement.state,text:stateText,fact_ids:[facts.candles.fact_id]});
  const activityFinding=currentActivityFinding(result,[facts.candles.fact_id]);if(activityFinding)result.findings.push(activityFinding);
  if(movement.impulse.baseline_status==='SHORT_HISTORY')result.findings.push({code:'SHORT_HISTORY',text:'История сравнения короче обычной; вывод основан только на доступных закрытых окнах.',fact_ids:[facts.candles.fact_id]});
  if(!usable.orderbook)return result;
  if(facts.orderbook.unit!=='USDT_PRICE_BASE_QUANTITY')return {...result,reasons:unique([...result.reasons,'ORDERBOOK_UNIT_UNQUALIFIED'])};
  result.liquidity={...measureLiquidity(facts.orderbook.value,instrument,profile),fact_id:facts.orderbook.fact_id,source_ts:facts.orderbook.event_ts};
  result.fact_ids.push(facts.orderbook.fact_id);
  if(result.liquidity.status!=='USABLE')return {...result,status:result.liquidity.status==='INSUFFICIENT'?'REJECTED':'WAITING',reasons:unique([...result.reasons,result.liquidity.reason])};
  result.plan=constructPlan(movement,result.reference_price,result.liquidity,facts.candles.fact_id,instrument.price_tick,profile);
  if(!result.plan)return {...result,status:'REJECTED',reasons:unique([...result.reasons,'INDEPENDENT_PULLBACK_PLAN_NOT_JUSTIFIED'])};
  const potentialReason=ownerPublicationRefusal(result),minimum=result.plan.potential_pct?.minimum;
  result.notification_eligibility={eligible:potentialReason===null,reason:potentialReason,required_potential_pct:OWNER_MIN_PLAN_POTENTIAL_PCT,minimum_potential_pct:finite(minimum)?minimum:null,
    comparison:{entry_upper:Math.max(...result.plan.entry_zones.map(z=>z.upper)),exit_lower:result.plan.exit_zone.lower,basis:'GROSS_ENTRY_TO_EXIT_NOT_EXECUTED_PROFIT',execution_proven:false}};
  if(potentialReason)return {...result,status:'REJECTED',reasons:unique([...result.reasons,potentialReason])};
  const context=explainOptionalFacts(facts,at,profile,instrument);
  if(context.trade_context)result.trade_context=context.trade_context;
  if(context.trade_diagnostic)result.trade_diagnostic=context.trade_diagnostic;
  if(context.relative_context_diagnostic)result.relative_context_diagnostic=context.relative_context_diagnostic;
  if(Object.keys(context.optional_context).length)result.optional_context=context.optional_context;
  result.findings.push(...context.findings);result.fact_ids.push(...context.fact_ids);
  const mapContext=explainMapPlan(result.plan,result.liquidations);
  if(mapContext){result.plan_context={liquidation_confluence:mapContext.liquidation_confluence};result.findings.push(mapContext.finding);}
  result.findings.push({code:'STRUCTURAL_PLAN',text:'Вход и выход обоснованы подтверждённой структурой цены; текущая двусторонняя ликвидность проверена.',fact_ids:[facts.candles.fact_id,facts.orderbook.fact_id]});
  result.ready=true;result.status='READY';result.reasons=[];result.fact_ids=unique([...result.fact_ids,...result.plan.entry_zones.flatMap(z=>z.basis_fact_ids),...result.plan.exit_zone.basis_fact_ids]);result.user_narrative=selectUserNarrative(result);result.card_text=render(result);
  return result;
}

export function analyzePump(input,profile=START_PROFILE){
  const result=analyzeCore(input,profile);
  const day=profileReady(profile)?consumeObservedDayGrowth(input.facts.growth_24h,{instrument:input.instrument,as_of_ts:input.analysis_ts,profile}):null;
  let liquidity=result.liquidity;
  // A refusal can still explain a separately verified current book. This does
  // not make the analysis READY or bypass movement, volume or plan gates.
  if(!result.ready&&!liquidity&&profileReady(profile)&&coreFact(input.facts.orderbook,'orderbook',input.analysis_ts,profile,input.instrument)&&input.facts.orderbook.unit==='USDT_PRICE_BASE_QUANTITY'){
    liquidity=measureLiquidity(input.facts.orderbook.value,input.instrument,profile);
  }
  return {...result,manual_text:explainManualAnalysis(result,{day,liquidity})};
}
