import {positive,finite,validTime} from '../contracts/index.mjs';
import {plusTenPrice} from './math.mjs';

export const SAVED_OUTCOME_PRESENTATION_VERSION='pump-saved-outcome-presentation-v1-20261027';
const unavailable='Сохранённый исход недоступен: данные не согласованы.';
const key=x=>typeof x==='string'&&/^pump:analysis:[a-f0-9]{64}$/.test(x);
const price=n=>Number(n.toPrecision(10)).toString();
const percent=n=>Number(n.toPrecision(6)).toString();
const drawdown=n=>finite(n)&&n>=0&&n<=100;
const printableTime=t=>validTime(t)&&Number.isFinite(new Date(t).getTime());
const time=t=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(t);

// ROOT supplies a read-only view bound to an existing immutable original.
// This presentation function never evaluates prices, repairs state or proves IO.
export function formatSavedOutcomeView(view){
  if(view?.schema!=='PUMP_SAVED_OUTCOME_VIEW_V1')return unavailable;
  const notices={NOT_FOUND:'Сохранённый анализ не найден.',NOT_READY:'В этом анализе готовая идея не была подтверждена; исход сигнала не показан.',
    ANCHOR_PENDING:'Сохранённый исход этой готовой идеи пока не сформирован.',OTHER_ANCHOR:'Эта волна учитывается по другому исходному отчёту. Его результат не приписан выбранному анализу.',
    QUARANTINED:'Сохранённые данные результата не согласованы; вывод о достижении цели не сформирован.'};
  if(Object.hasOwn(notices,view.status))return notices[view.status];
  if(!['PENDING','NOT_CHECKED','RESULT'].includes(view.status))return unavailable;
  const o=view.origin,deadline=validTime(o?.t0)?o.t0+14400000:null,target=positive(o?.reference_price)?plusTenPrice(o.reference_price):null;
  if(!key(view.analysis_key)||view.anchor_analysis_key!==view.analysis_key||!printableTime(o?.t0)||!printableTime(deadline)||!positive(target))return unavailable;
  const lines=[];
  if(view.status==='PENDING')lines.push('Четырёхчасовой период наблюдения ещё не завершён.');
  else if(view.status==='NOT_CHECKED')lines.push('Срок наблюдения завершён, но сохранённый исход ещё не проверен.');
  else{
    const r=view.outcome;
    if(!r||!['HIT','MISS','UNKNOWN'].includes(r.status)||r.t0!==o.t0||r.reference_price!==o.reference_price||r.deadline_ts!==deadline||r.target_price!==target||
      ['signal_id','wave_id','mode','rules_version'].some(k=>typeof o[k]!=='string'||!o[k]||r[k]!==o[k]))return unavailable;
    lines.push(r.status==='HIT'?'Цель +10% от исходной цены отчёта достигнута в пределах четырёх часов.':r.status==='MISS'?'Цель +10% от исходной цены отчёта не достигнута за четыре часа по пригодным данным.':'Исход неизвестен: данных недостаточно для честного вывода.');
    lines.push('Максимальное снижение от исходной цены за всё окно: '+(r.coverage?.complete===true&&drawdown(r.drawdown_total_pct)?percent(r.drawdown_total_pct)+'%':'неизвестно')+'.');
    if(r.status==='HIT')lines.push('Снижение до достижения цели: '+(validTime(r.hit_ts)&&!(r.reasons??[]).some(x=>['PRE_HIT_COVERAGE_INCOMPLETE','INTRABAR_FIRST_HIT_TIME_AND_ORDER_UNKNOWN'].includes(x))&&drawdown(r.drawdown_before_hit_pct)?percent(r.drawdown_before_hit_pct)+'%':'неизвестно')+'.');
    const s=r.scenario_outcome;
    if(s?.status==='PRICE_SCENARIO_ONLY'){
      const contact=s.entry_touched===true?'касание отмечено':s.entry_touched===false?'касание не отмечено':'касание не определено';
      const exit=s.entry_then_exit_confirmed===true?'область выхода после входной области достигнута':s.entry_then_exit_confirmed===false?'последующее достижение выхода не подтверждено':'порядок достижения выхода неизвестен';
      lines.push('Ценовой сценарий: '+contact+'; '+exit+'.');
      const e=s.entry_area_excursion;
      if(e?.reason==='OBSERVED_LOWER_BOUND_AFTER_CONFIRMED_CONTACT'&&drawdown(e.below_area_pct_lower_bound))lines.push('Наблюдаемая нижняя оценка ухода ниже достигнутой области: '+percent(e.below_area_pct_lower_bound)+'%; точный максимум неизвестен.');
    }
  }
  lines.push('Исходная цена отчёта: '+price(o.reference_price)+' USDT; цель: '+price(target)+' USDT.');
  lines.push('Исходное окно: '+time(o.t0)+' — '+time(deadline)+' МСК.');
  lines.push('Это проверка движения цены и сценария; исполнение заявок и прибыль пользователя не подтверждены.');
  return lines.join('\n');
}
