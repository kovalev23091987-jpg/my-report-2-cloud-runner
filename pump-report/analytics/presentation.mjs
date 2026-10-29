import {positive,validTime,finite,factUsable} from '../contracts/index.mjs';
import {pct,growthAtLeast} from './math.mjs';

const text=x=>typeof x==='string'&&x.trim().length>0;
const number=n=>Number(n.toPrecision(8)).toString();
const clock=(ts,compact=false)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',...(compact?{}:{second:'2-digit'}),hourCycle:'h23'}).format(ts).replace(',','');
export const FUTURE_EVENT_TEXT='Будущее событие для статистики — +10% за 4 часа: вероятность пока не оценена. Отсчёт от исходной цены отчёта.';
export const USER_NARRATIVE_VERSION='pump-user-narrative-v1-tz2-20261025';
export function fundingContextLine(result,profile){
  const f=result.optional_context?.funding,at=result.analysis_ts,ttl=profile?.freshness_ms?.funding;
  if(!f||f.kind!=='funding'||f.instrument_id!==result.instrument?.instrument_id||!factUsable(f,at)||
    f.event_ts>f.received_ts||!positive(ttl)||at-f.event_ts>ttl||f.unit!=='RATE_FRACTION_PER_ACTUAL_PERIOD'||
    f.source!=='BINGX_OFFICIAL_PUBLIC_API'||f.venue!=='BINGX'||f.origin!=='OBSERVED'||!text(f.evidence_ref)||
    !result.fact_ids?.includes(f.fact_id)||!result.findings?.some(x=>x.code==='FUNDING_SNAPSHOT'&&x.fact_ids?.includes(f.fact_id)))return null;
  const rate=f.value?.rate,period=f.value?.period_ms;
  if(!finite(rate)||!finite(rate*100)||!positive(period)||period>86400000)return null;
  const percent=rate*100;
  return 'Фандинг BingX: '+(percent<0?'−':'')+number(Math.abs(percent))+'% за '+number(period/3600000)+' ч.';
}
export function planExitLines(plan,{compact=false}={}){
  const exit=plan.exit_zone,price=value=>Number(value.toPrecision(10)).toString();
  const prefix='Фиксация всей позиции: '+price(exit.lower)+'–'+price(exit.upper);
  if(exit.target_assessment?.version==='JUSTIFIED_TARGETS_V1'){
    const levels=[...new Set((exit.intermediate_highs??[]).map(p=>p.price))].sort((a,b)=>a-b),shown=levels.slice(0,3);
    const context=levels.length?'Подтверждённые уровни внутри сценария: '+shown.map(price).join(', ')+(shown.length<levels.length?' и ещё '+(levels.length-shown.length):'')+'. Они не считаются автоматически пройденными после будущего входа; достижение цели не гарантировано.':'Достижение цели после будущего входа не гарантировано.';
    return [prefix+' — '+exit.explanation,context];
  }
  if(!Array.isArray(exit.intermediate_highs))return [prefix+' — ближайшая подтверждённая вершина выше цены.'];
  const levels=[...new Set(exit.intermediate_highs.map(p=>p.price))].sort((a,b)=>a-b),shown=compact?levels.slice(0,3):levels;
  const context=levels.length?'Промежуточные подтверждённые вершины для входов плана: '+shown.map(price).join(', ')+(shown.length<levels.length?' и ещё '+(levels.length-shown.length):'')+'. Прохождение этих уровней и достижение цели не гарантированы.':'Достижение цели после будущего входа не гарантировано.';
  return [prefix+' — предварительная цель возврата к прежней подтверждённой вершине после будущего отката.',context];
}
export function movementStateText(result){
  const level=result.next_wave?.reclaim_level,reference=positive(level)?' '+number(level):'';
  switch(result.wave_state){
    case 'ACTIVE_WAVE':return 'Цена не ниже наблюдаемой вершины волны.';
    case 'CALM_PULLBACK':return 'Цена ниже вершины; текущий сценарий — спокойный откат.';
    case 'SHARP_PULLBACK_UNCONFIRMED':return 'Сценарий резкого отката: возврат выше контрольного уровня пока не подтверждён.';
    case 'SHARP_PULLBACK_RECLAIMED':return positive(level)&&positive(result.reference_price)&&result.reference_price<level?'Закрытие было выше уровня'+reference+', но текущая цена снова ниже него.':'Закрытие выше контрольного уровня'+reference+' подтвердило возврат после снижения.';
    case 'RESUMING':return 'Последнее закрытое окно выросло; активность выше предыдущего наблюдения.';
    case 'WEAKENING':return finite(result.activity?.current_to_impulse_volume_ratio)&&result.activity.current_to_impulse_volume_ratio>=1?'Последнее закрытое окно не дало роста цены при активности не ниже импульсной.':'Продолжение роста по закрытому окну не подтверждено.';
    default:return null;
  }
}
export function currentActivityFinding(result,fact_ids=[]){
  const ratio=result.activity?.current_to_impulse_volume_ratio;
  if(!finite(ratio)||ratio<=0||ratio===1||result.activity?.ratio_unit!=='RATIO')return null;
  return {code:'ACTIVITY_RELATION',text:'Активность текущего окна '+(ratio<1?'ниже':'выше')+' исходного импульса.',fact_ids:[...fact_ids]};
}
export function movementDetailFindings(result,fact_ids=[]){
  const d=result.activity?.details;if(d?.status!=='OBSERVED_CLOSED_WINDOW_MEASUREMENTS')return [];
  const out=[],add=(code,text)=>out.push({code,text,fact_ids:[...fact_ids],observations_version:d.version,causation_proven:false});
  const effort=d.activity_windows.find(w=>w.window_ms===300000&&w.volume_at_least_previous_with_less_growth===true);
  if(effort)add('PRICE_ACTIVITY_DECELERATION',effort.price_return_pct<=0?'Последние 5 минут не дали роста при активности не ниже предыдущих 5 минут.':'Рост за последние 5 минут меньше предыдущих 5 минут при активности не ниже прежней.');
  const accelerated=d.activity_windows.find(w=>w.positive_growth_accelerated===true&&w.volume_counter!==null&&w.previous_volume_counter>0&&w.volume_counter>=w.previous_volume_counter);
  if(accelerated){const n=accelerated.window_ms/60000;add('CLOSED_WINDOW_ACCELERATION','Рост по закрытиям за последние '+n+' мин ускорился относительно предыдущих '+n+' мин при не меньшей активности.');}
  const failed=d.failed_high_tests;
  if(failed?.repeated&&!failed.last_close_above_level&&!failed.current_price_above_level)add('FAILED_PREKNOWN_HIGH_TESTS','В полученных свечах '+failed.failed_closed_bars+' выхода выше подтверждённой вершины '+number(failed.level.price)+' завершились закрытием не выше неё.');
  const r=d.pullback_return;
  if(result.wave_state==='SHARP_PULLBACK_RECLAIMED'&&r?.path_complete_in_supplied_rows&&r.closed_return_from_low_pct>0&&r.return_speed_bounds?.duration_max_ms>0)
    add('OBSERVED_CLOSED_RETURN','От минимума закрытых свечей цена вернулась на '+number(r.closed_return_from_low_pct)+'% за не более '+number(r.return_speed_bounds.duration_max_ms/60000)+' мин.');
  return out;
}
export function selectUserNarrative(result){
  const stage=result.findings.find(f=>f.code===result.wave_state),activity=result.findings.find(f=>f.code==='ACTIVITY_RELATION'),trade=result.findings.find(f=>f.code==='TRADE_PRICE_RESPONSE');
  const observed=result.findings.find(f=>f.code==='FAILED_PREKNOWN_HIGH_TESTS')??result.findings.find(f=>f.code==='PRICE_ACTIVITY_DECELERATION')??result.findings.find(f=>f.code==='OBSERVED_CLOSED_RETURN')??result.findings.find(f=>f.code==='CLOSED_WINDOW_ACCELERATION');
  const confluence=result.plan_context?.liquidation_confluence;let map=null;
  if(confluence?.entries?.length){const indices=confluence.entries.map(e=>e.entry_index+1);map={code:'MAP_PLAN_CONTEXT',text:(indices.length===1?'Область входа ':'Области входа ')+indices.join(', ')+(indices.length===1?' пересекается':' пересекаются')+' с пригодными нижними зонами карты.',fact_ids:[],zone_ids:confluence.entries.flatMap(e=>e.zone_ids)};}
  else if(confluence?.exit_zone_ids?.length)map={code:'MAP_PLAN_CONTEXT',text:'Область фиксации пересекается с пригодной верхней зоной карты.',fact_ids:[],zone_ids:confluence.exit_zone_ids};
  const reasons=[];for(const candidate of [stage,observed,activity,trade,map])if(candidate&&!reasons.some(r=>r.code===candidate.code)){reasons.push(structuredClone(candidate));if(reasons.length===2)break;}
  const warning=result.wave_state==='SHARP_PULLBACK_UNCONFIRMED'?'возврат пока не подтверждён, области входа предварительные':result.wave_state==='SHARP_PULLBACK_RECLAIMED'&&positive(result.next_wave?.reclaim_level)&&result.reference_price<result.next_wave.reclaim_level?'цена снова ниже уровня возврата':confluence?.intervening_upper_zone_ids?.length?'до фиксации показана верхняя зона карты':observed?.code==='FAILED_PREKNOWN_HIGH_TESTS'?'прежняя вершина пока не удержана закрытием':null;
  return {version:USER_NARRATIVE_VERSION,reasons,warning,limitation:result.findings.some(f=>f.code==='SHORT_HISTORY')?'История сравнения короче обычной; вывод ограничен доступными закрытыми окнами.':null};
}
export function presentationModeLines(result){
  const lines=[result.mode==='MANUAL'?'Ручная проверка':'Автоматический отчёт'];
  if(result.run_purpose==='ACCEPTANCE_TEST')lines.push('ТЕСТ — приёмочная проверка.');
  else if(result.run_purpose!=='PRODUCTION')lines.push('Назначение запуска не указано.');
  return lines;
}
export function selectGrowthProof(result,profile){
  const at=result.analysis_ts,allowed=[...profile.automatic_growth.short_windows_ms,86400000];
  function qualify(w){
    const threshold=w?.window_ms===86400000?profile.automatic_growth.day_pct:profile.automatic_growth.short_pct;
    return w?.passed===true&&allowed.includes(w.window_ms)&&validTime(w.start_ts)&&validTime(w.end_ts)&&w.end_ts-w.start_ts===w.window_ms&&w.end_ts<=at&&
      positive(w.start_price)&&positive(w.end_price)&&growthAtLeast(w.end_price,w.start_price,threshold)&&Array.isArray(w.fact_ids)&&w.fact_ids.some(text)&&Number.isFinite(pct(w.start_price,w.end_price));
  }
  const current=result.growth_windows?.find(qualify),retained=result.automatic_eligible?result.next_wave?.qualification?.find(qualify):null,w=current??retained;
  if(!w)return {status:'UNCONFIRMED',window:null,threshold_pct:null,fact_ids:[],evidence_ref:null};
  return {status:current?'CURRENT':'RETAINED',window:{window_ms:w.window_ms,start_ts:w.start_ts,end_ts:w.end_ts,start_price:w.start_price,end_price:w.end_price,return_pct:pct(w.start_price,w.end_price)},
    threshold_pct:w.window_ms===86400000?profile.automatic_growth.day_pct:profile.automatic_growth.short_pct,fact_ids:[...w.fact_ids],evidence_ref:text(w.evidence_ref)?w.evidence_ref:null,
    source:text(w.source)?w.source:null,source_event_ts:w.source_event_ts??null};
}
export function growthProofLine(proof,compact=false){
  if(!proof||proof.status==='UNCONFIRMED')return 'Автоматический порог роста не подтверждён.';
  const w=proof.window,duration=w.window_ms===86400000?'24 ч':w.window_ms/60000+' мин',prior=proof.status==='RETAINED';
  const prefix=prior?'Порог был пройден ранее: ':'Подтверждённый рост: ';
  const period=compact?'конец '+clock(w.end_ts,true):'окно '+clock(w.start_ts)+'–'+clock(w.end_ts);
  return prefix+'+'+number(w.return_pct)+'% за '+duration+' (порог +'+number(proof.threshold_pct)+'%); '+period+' МСК.'+(prior?' Сейчас повторное пересечение не подтверждено.':'');
}
