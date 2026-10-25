import {assertInput, ANALYSIS_SCHEMA, CONTRACT_VERSION, factUsable, finite, positive} from '../contracts/index.mjs';
import {START_PROFILE} from '../profile/start-v1.mjs';
import {closedCandles, unique} from './math.mjs';
import {analyzeMovement, constructPlan} from './movement.mjs';
import {measureLiquidity} from './liquidity.mjs';
import {selectZones} from './zones.mjs';
import {explainOptionalFacts, explainMapPlan} from './context.mjs';
export {evaluateOutcome} from './outcome.mjs';

export const RULES_VERSION='pump-analytics-v1-tz2-20261025';
const label=value=>String(value??'').replace(/[\r\n\p{C}]/gu,' ').slice(0,128);
const shortLabel=(value,n=32)=>{const s=label(value);return s.length>n?s.slice(0,n-1)+'…':s;};
const px=value=>Number(value.toPrecision(10)).toString();
const contextCodes=['TRADE_SAMPLE','OI_SNAPSHOT','FUNDING_SNAPSHOT','RELATIVE_RETURN','MAP_PLAN_CONTEXT'];
const descriptions={ACTIVE_WAVE:'Активная волна: рост сопровождается торговой активностью.',CALM_PULLBACK:'После активного роста идёт спокойный откат; торговая активность стала меньше.',
  SHARP_PULLBACK_UNCONFIRMED:'Откат резкий; возврат выше заранее известного уровня пока не подтверждён.',SHARP_PULLBACK_RECLAIMED:'После резкого снижения цена закрылась выше заранее известного уровня.',
  RESUMING:'После отката движение вверх возобновилось с усилением торговой активности.',WEAKENING:'Торговая активность остаётся высокой, но движение вверх ослабевает.'};
function profileReady(p){
  return typeof p?.version==='string'&&['wave_max_age_ms','wave_search_ms','impulse_window_ms','volume_baseline_ms','candle_interval_ms','sharp_speed_multiple','reclaim_closed_bars',
    'pivot_radius_bars','entry_zone_normal_range_fraction','liquidation_merge_gap_normal_range','liquidation_merge_max_width_normal_range','maximum_entry_zones','maximum_liquidation_zones_per_side'].every(k=>positive(p[k]))&&
    p.candle_interval_ms===60000&&Number.isInteger(p.pivot_radius_bars)&&Number.isInteger(p.reclaim_closed_bars)&&p.maximum_entry_zones<=3&&p.maximum_liquidation_zones_per_side<=3;
}
function currentFact(f,at,ttl){return factUsable(f,at)&&f.event_ts<=f.received_ts&&at-f.event_ts<=ttl;}
function coreFact(f,kind,at,p){
  if(!f||f.kind!==kind||f.venue!=='BINGX'||f.origin!=='OBSERVED')return false;
  if(kind==='candles'&&f.status==='INCOMPLETE'&&f.coverage?.time_qualified===true&&f.coverage?.volume_qualified===true){
    return currentFact({...f,status:'USABLE'},at,p.freshness_ms.candles);
  }
  return currentFact(f,at,p.freshness_ms[kind]);
}
function mapLine(z,at){
  let magnitude='величина не определена';
  if(finite(z.magnitude_value)&&z.magnitude_unit){
    magnitude=px(z.magnitude_value)+' '+label(z.magnitude_unit);
    if(z.magnitude_unit==='RELATIVE_INTENSITY')magnitude+=' (относительная шкала '+shortLabel(z.relative_scale?.scale_id,24)+')';
    if(z.components.length>1)magnitude+='; максимум одной компоненты, не сумма';
  }
  const version=z.model_version??z.relative_scale?.model_version;
  const model=z.basis_type==='EXTERNAL_MODEL'?', расчётная, модель '+shortLabel(z.model_id??'не указана',24)+(version?' / '+shortLabel(version,16):' (версия не указана)'):', наблюдаемые позиции';
  const time=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(z.event_ts);
  const age=Math.floor((at-z.event_ts)/1000);
  const knownLimits={PARTIAL_SOURCE_COVERAGE:'охват источника ограничен',OBSERVED_ACCOUNTS_ONLY:'только наблюдаемые аккаунты',RETURNED_BINS_ONLY:'только опубликованный диапазон',
    OVERLAPPING_COVERAGE_NOT_SUMMED:'перекрывающееся покрытие не суммировалось',MERGED_MAGNITUDE_MAX_SINGLE_COMPONENT_NOT_SUMMED:'величина объединения не является суммой'};
  const limits=z.limitations?.length?'; ограничения источника: '+unique(z.limitations.map(k=>knownLimits[k]??'дополнительные ограничения источника')).slice(0,2).join(', '):'';
  return px(z.lower)+'–'+px(z.upper)+' — '+magnitude+', '+shortLabel(z.source)+(z.venue?' / '+shortLabel(z.venue,24):'')+model+'; данные '+time+' МСК ('+age+' с назад)'+limits;
}
function render(result){
  const p=result.plan,lines=[label(result.instrument.native_symbol)+' · +10% за 4 часа: вероятность пока не оценена',result.findings.filter(f=>!contextCodes.includes(f.code)).slice(0,2).map(f=>f.text).join(' '),
    'Покупка на откате: '+p.entry_zones.map(z=>px(z.lower)+'–'+px(z.upper)+' ('+(z.basis_level.kind==='HIGH'?'прежняя вершина':'прежний минимум')+' '+px(z.basis_level.price)+'; '+(z.confirmation_status==='CONFIRMED_RECLAIM'?'возврат подтверждён':'предварительная область')+')').join('; ')+'.',
    'Фиксация всей позиции: '+px(p.exit_zone.lower)+'–'+px(p.exit_zone.upper)+' — ближайшая подтверждённая вершина выше цены.'];
  const context=result.findings.filter(f=>contextCodes.includes(f.code));
  if(context.length)lines.push(context.map(f=>f.text).join(' '));
  const map=result.liquidations;
  if(map.map_mode==='WITHOUT_MAP')lines.push('Карта ликвидаций недоступна. Области входа и выхода определены по движению цены и объёму; текущая ликвидность проверена.');
  else{lines.push('Ликвидации сверху: '+(map.zones_up.map(z=>mapLine(z,result.analysis_ts)).join('; ')||'пригодных зон нет')+'.');lines.push('Ликвидации снизу: '+(map.zones_down.map(z=>mapLine(z,result.analysis_ts)).join('; ')||'пригодных зон нет')+'.');if(map.status==='PARTIAL')lines.push('Карта неполная.');lines.push('Охват карты: только полученные данные источников.');}
  lines.push('Размер: до '+p.position_limit_usdt+' USDT по текущему стакану; будущая цена исполнения не гарантирована.');
  lines.push('Важно: пересмотреть план при цене ниже '+px(p.invalidation.price)+'.');
  if(result.wave_state==='SHARP_PULLBACK_UNCONFIRMED')lines.push('Возврат не подтверждён; предварительная область не является доказанным выкупом.');
  if(p.desired_potential_status==='BELOW_DESIRED')lines.push('Обоснованный потенциал ниже желаемых '+p.desired_plan_potential_pct+'%.');
  return lines.join('\n');
}
export function analyzePump(input, profile=START_PROFILE){
  assertInput(input);
  const {facts,analysis_ts:at,instrument}=input;
  const result={schema_version:ANALYSIS_SCHEMA,contract_version:CONTRACT_VERSION,rules_version:RULES_VERSION,profile_version:profile?.version??null,run_id:input.run_id,mode:input.mode,
    instrument:{...instrument},analysis_ts:at,reference_price:null,wave_id:null,wave_state:null,previous_wave:input.previous_wave??null,next_wave:null,current_threshold_passed:false,
    automatic_eligible:false,ready:false,status:'WAITING',reasons:[],findings:[],plan:null,liquidity:null,liquidations:null,
    probability:{value_pct:null,event:'PRICE_PLUS_10_PERCENT_WITHIN_4_HOURS',reason:'NOT_CALIBRATED'},fact_ids:[],card_text:null};
  if(!profileReady(profile))return {...result,reasons:['ANALYTICS_PROFILE_REQUIRED']};
  const usable={};
  for(const kind of ['price','candles','orderbook']){
    usable[kind]=coreFact(facts[kind],kind,at,profile);
    if(!usable[kind])result.reasons.push('MANDATORY_'+kind.toUpperCase()+'_NOT_USABLE');
  }
  if(!usable.price||!positive(facts.price.value))return {...result,reasons:unique([...result.reasons,...(!positive(facts.price?.value)?['POSITIVE_LAST_PRICE_REQUIRED']:[])])};
  if(facts.price.unit!=='USDT_PER_BASE')return {...result,reasons:unique([...result.reasons,'PRICE_UNIT_UNQUALIFIED'])};
  result.reference_price=facts.price.value;
  if(!usable.candles)return result;
  const normalized=closedCandles(facts.candles.value,at,profile.candle_interval_ms),rows=normalized.rows;
  if(normalized.reason||!rows.length||at-rows.at(-1).close_ts>profile.freshness_ms.candles)return {...result,reasons:unique([...result.reasons,normalized.reason??'CLOSED_CANDLES_STALE_OR_MISSING'])};
  const ticker=currentFact(facts.ticker_24h,at,profile.freshness_ms.price)&&facts.ticker_24h.unit==='USDT_ROLLING_24H'?facts.ticker_24h:null;
  const movement=analyzeMovement(input,rows,result.reference_price,ticker,profile);
  Object.assign(result,{wave_id:movement.wave_id,wave_state:movement.state,next_wave:movement.next_wave,current_threshold_passed:movement.current_threshold_passed,
    automatic_eligible:movement.automatic_eligible,growth_windows:movement.windows,activity:{impulse:movement.impulse,current_volume:movement.current_volume??null,current_to_impulse_volume_ratio:movement.current_to_impulse_volume_ratio??null},
    reasons:unique([...result.reasons,...movement.reasons]),fact_ids:[facts.price.fact_id,facts.candles.fact_id,...(ticker?[ticker.fact_id]:[])]});
  result.liquidations=selectZones(input.liquidations,instrument,result.reference_price,movement.normal_range,at,profile);
  if(!movement.active){result.status=movement.reasons.some(r=>['CURRENT_VOLUME_REQUIRED','VOLUME_BASELINE_UNAVAILABLE','WAVE_PATH_INCOMPLETE'].includes(r))?'WAITING':'REJECTED';return result;}
  if(descriptions[movement.state])result.findings.push({code:movement.state,text:descriptions[movement.state],fact_ids:[facts.candles.fact_id]});
  if(movement.impulse.baseline_status==='SHORT_HISTORY')result.findings.push({code:'SHORT_HISTORY',text:'История сравнения короче обычной; вывод основан только на доступных закрытых окнах.',fact_ids:[facts.candles.fact_id]});
  if(!usable.orderbook)return result;
  if(facts.orderbook.unit!=='USDT_PRICE_BASE_QUANTITY')return {...result,reasons:unique([...result.reasons,'ORDERBOOK_UNIT_UNQUALIFIED'])};
  result.liquidity={...measureLiquidity(facts.orderbook.value,instrument,profile),fact_id:facts.orderbook.fact_id,source_ts:facts.orderbook.event_ts};
  result.fact_ids.push(facts.orderbook.fact_id);
  if(result.liquidity.status!=='USABLE')return {...result,status:result.liquidity.status==='INSUFFICIENT'?'REJECTED':'WAITING',reasons:unique([...result.reasons,result.liquidity.reason])};
  result.plan=constructPlan(movement,result.reference_price,result.liquidity,facts.candles.fact_id,instrument.price_tick,profile);
  if(!result.plan)return {...result,status:'REJECTED',reasons:unique([...result.reasons,'INDEPENDENT_PULLBACK_PLAN_NOT_JUSTIFIED'])};
  const context=explainOptionalFacts(facts,at,profile);
  if(context.trade_context)result.trade_context=context.trade_context;
  if(Object.keys(context.optional_context).length)result.optional_context=context.optional_context;
  result.findings.push(...context.findings);result.fact_ids.push(...context.fact_ids);
  const mapContext=explainMapPlan(result.plan,result.liquidations);
  if(mapContext){result.plan_context={liquidation_confluence:mapContext.liquidation_confluence};result.findings.push(mapContext.finding);}
  result.findings.push({code:'STRUCTURAL_PLAN',text:'Вход и выход обоснованы подтверждённой структурой цены; размер ограничен текущей двусторонней ликвидностью.',fact_ids:[facts.candles.fact_id,facts.orderbook.fact_id]});
  result.ready=true;result.status='READY';result.reasons=[];result.fact_ids=unique([...result.fact_ids,...result.plan.entry_zones.flatMap(z=>z.basis_fact_ids),...result.plan.exit_zone.basis_fact_ids]);result.card_text=render(result);
  return result;
}
