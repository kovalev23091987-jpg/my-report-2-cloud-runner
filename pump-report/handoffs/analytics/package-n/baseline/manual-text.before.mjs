import {finite,positive} from '../contracts/index.mjs';
import {presentationModeLines,growthProofLine} from './presentation.mjs';

const reasons={ANALYTICS_PROFILE_REQUIRED:'Не хватает пригодных настроек анализа.',
  MANDATORY_PRICE_NOT_USABLE:'Нет свежей проверенной цены.',POSITIVE_LAST_PRICE_REQUIRED:'Нет пригодного положительного значения цены.',PRICE_UNIT_UNQUALIFIED:'Единица цены не подтверждена.',
  MANDATORY_CANDLES_NOT_USABLE:'Свечи не прошли проверку свежести или происхождения.',CLOSED_CANDLES_STALE_OR_MISSING:'Нет свежих закрытых свечей.',INVALID_CANDLE:'В свечах есть некорректные значения.',
  NATIVE_CANDLE_VOLUME_SCOPE_INVALID:'Количество в свечах нельзя сопоставить в одной подтверждённой области.',CANDLE_TIME_PROVENANCE_INVALID:'Время свечей не подтверждено.',
  CURRENT_VOLUME_REQUIRED:'Не подтверждена текущая торговая активность.',VOLUME_BASELINE_UNAVAILABLE:'Недостаточно пригодной истории для сравнения активности.',CURRENT_ACTIVITY_NOT_CONFIRMED:'Активный рост с усилением торговой активности не подтверждён.',
  VOLUME_BASELINE_ZERO_OR_UNKNOWN:'Фоновая активность равна нулю или неизвестна; отношение рассчитать нельзя.',IMPULSE_VOLUME_ZERO_OR_UNKNOWN:'Активность исходного импульса неизвестна; сравнение невозможно.',VOLUME_RATIO_NOT_FINITE:'Отношение активности нельзя надёжно рассчитать.',
  WAVE_VOLUME_COMPARISON_BASIS_CHANGED:'Единица сравнения активности изменилась; сохранённую волну нельзя пересчитать в другой единице.',WAVE_PATH_INCOMPLETE:'В наблюдении волны есть пропуск.',
  MANDATORY_ORDERBOOK_NOT_USABLE:'Нет свежего проверенного стакана.',ORDERBOOK_UNIT_UNQUALIFIED:'Единицы цены и количества в стакане не подтверждены.',
  NO_SUPPORTED_POSITION_SIZE:'Стакан не подтверждает ни один из заданных размеров позиции.',INVALID_OR_CROSSED_ORDERBOOK:'Стакан некорректен или содержит пересечение цен.',LIQUIDITY_PROFILE_REQUIRED:'Нет пригодных ограничений проверки ликвидности.',
  INDEPENDENT_PULLBACK_PLAN_NOT_JUSTIFIED:'Не удалось обосновать самостоятельный план покупки на откате с входом, выходом и границей отмены.',PLAN_POTENTIAL_BELOW_OWNER_MINIMUM:'Потенциал самостоятельного плана ниже обязательных 10%; готовая идея не сформирована.',PLAN_POTENTIAL_UNQUALIFIED:'Потенциал самостоятельного плана не подтверждён; готовая идея не сформирована.',OWNER_ASSET_DELIVERY_EXCLUDED:'Этот инструмент исключён владельцем из уведомлений.',WAVE_LIFETIME_EXPIRED:'Срок наблюдения сохранённой волны истёк.',PLAN_INVALIDATED:'Цена нарушила сохранённую границу отмены плана.'};
const number=value=>Number(value.toPrecision(8)).toString();
export function explainManualAnalysis(result,{day=null,liquidity=result.liquidity}={}){
  if(result.ready)return result.card_text;
  const lines=[...presentationModeLines(result),'Готовой идеи пока нет.',growthProofLine(result.growth_proof)];
  if(positive(result.reference_price))lines.push('Проверенная цена: '+number(result.reference_price)+' USDT.');
  else lines.push('Проверенная текущая цена недоступна.');
  const windows=result.growth_windows??(day?.usable?[day.window]:[]),available=windows.filter(w=>finite(w.return_pct));
  if(available.length)lines.push('Наблюдаемый рост по точным границам: '+available.map(w=>(w.window_ms===86400000?'24 ч':w.window_ms/60000+' мин')+' '+(w.return_pct>=0?'+':'')+number(w.return_pct)+'%').join('; ')+'.');
  else lines.push('Рост по точным границам окон не подтверждён.');
  const a=result.activity,ratio=a?.volume_diagnostics?.ratio??a?.impulse?.ratio;
  if(finite(ratio))lines.push('Активность '+(a?.impulse?'исходного импульса':'текущего окна')+' к фону: '+number(ratio)+' раза.');
  else lines.push('Отношение торговой активности к фону не определено.');
  if(finite(a?.current_to_impulse_volume_ratio))lines.push('Активность текущего окна к исходному импульсу: '+number(a.current_to_impulse_volume_ratio)+' раза.');
  if(positive(liquidity?.position_limit_usdt))lines.push('Текущая двусторонняя ликвидность проверена.');
  else if(liquidity?.status==='INSUFFICIENT')lines.push('Ни один заданный размер позиции не прошёл проверку текущего двустороннего стакана.');
  else lines.push('Ликвидность для заданных размеров позиции не подтверждена.');
  const why=[...new Set(result.reasons.map(code=>reasons[code]??'Обязательная проверка анализа не пройдена.'))];
  lines.push('Причина: '+(why.join(' ')||'Обязательное сочетание движения, активности, ликвидности и плана пока не подтверждено.'));
  return lines.join('\n');
}
