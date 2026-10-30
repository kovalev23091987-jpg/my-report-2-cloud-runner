import {positive,validTime} from '../contracts/index.mjs';
import {pct,growthAtLeast} from './math.mjs';

const text=x=>typeof x==='string'&&x.trim().length>0;
const shortRef=(value,compact)=>{const clean=String(value??'').replace(/[\r\n\p{C}]/gu,' '),limit=compact?28:48;if(clean.length<=limit)return clean;let end='';for(const p of Array.from(clean).reverse()){if(end.length+p.length>limit-1)break;end=p+end;}return '…'+end;};
const number=n=>Number(n.toPrecision(8)).toString();
const clock=(ts,compact=false)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',...(compact?{}:{second:'2-digit'}),hourCycle:'h23'}).format(ts).replace(',','');
export const FUTURE_EVENT_TEXT='Будущее событие для статистики — +10% за 4 часа: вероятность пока не оценена. Отсчёт от исходной цены отчёта.';
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
  return prefix+'+'+number(w.return_pct)+'% за '+duration+' (порог +'+number(proof.threshold_pct)+'%); '+period+' МСК; '+(prior?'сохранённый факт ':'факт ')+shortRef(proof.fact_ids[0],compact)+'.'+(prior?' Сейчас повторное пересечение не подтверждено.':'');
}
