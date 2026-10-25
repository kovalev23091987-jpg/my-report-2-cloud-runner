import {positive,validTime,finite} from '../contracts/index.mjs';
import {pct,growthAtLeast} from './math.mjs';

const text=x=>typeof x==='string'&&x.trim().length>0;
const number=n=>Number(n.toPrecision(8)).toString();
const clock=(ts,compact=false)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',...(compact?{}:{second:'2-digit'}),hourCycle:'h23'}).format(ts).replace(',','');
export const FUTURE_EVENT_TEXT='Будущее событие для статистики — +10% за 4 часа: вероятность пока не оценена. Отсчёт от исходной цены отчёта.';
export const USER_NARRATIVE_VERSION='pump-user-narrative-v1-tz2-20261025';
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
export function selectUserNarrative(result){
  const stage=result.findings.find(f=>f.code===result.wave_state),activity=result.findings.find(f=>f.code==='ACTIVITY_RELATION'),trade=result.findings.find(f=>f.code==='TRADE_PRICE_RESPONSE'),relative=result.findings.find(f=>f.code==='RELATIVE_RETURN');
  const confluence=result.plan_context?.liquidation_confluence;let map=null;
  if(confluence?.entries?.length){const indices=confluence.entries.map(e=>e.entry_index+1);map={code:'MAP_PLAN_CONTEXT',text:(indices.length===1?'Область входа ':'Области входа ')+indices.join(', ')+(indices.length===1?' пересекается':' пересекаются')+' с пригодными нижними зонами карты.',fact_ids:[],zone_ids:confluence.entries.flatMap(e=>e.zone_ids)};}
  else if(confluence?.exit_zone_ids?.length)map={code:'MAP_PLAN_CONTEXT',text:'Область фиксации пересекается с пригодной верхней зоной карты.',fact_ids:[],zone_ids:confluence.exit_zone_ids};
  const reasons=[];for(const candidate of [stage,activity,trade,map,relative])if(candidate&&!reasons.some(r=>r.code===candidate.code)){reasons.push(structuredClone(candidate));if(reasons.length===2)break;}
  const warning=result.wave_state==='SHARP_PULLBACK_UNCONFIRMED'?'возврат пока не подтверждён, области входа предварительные':result.wave_state==='SHARP_PULLBACK_RECLAIMED'&&positive(result.next_wave?.reclaim_level)&&result.reference_price<result.next_wave.reclaim_level?'цена снова ниже уровня возврата':confluence?.intervening_upper_zone_ids?.length?'до фиксации показана верхняя зона карты':null;
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
