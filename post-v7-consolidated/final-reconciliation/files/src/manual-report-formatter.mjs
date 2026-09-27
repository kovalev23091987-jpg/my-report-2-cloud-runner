import {displayScore,displayNumber,displayTime,displayTrigger,displayCondition,displayInvalidation,displayReadiness,hasInternalTerminology,displayMarketFacts,displayLegacyLiquidations} from './canonical-display.mjs';
import {nativeLiquidationLines,validateNativeLiquidationContext} from './native-liquidation-guard.mjs';
import { reasonDefinition, safeUserReason, sourceLabelRu } from './reason-registry.mjs';
export const MANUAL_REPORT_FORMATTER_VERSION='manual-report-approved-layout-v1-20260927';
const text=v=>v===null||v===undefined?'':String(v).trim();
const fmt=v=>Number.isFinite(Number(v))?String(Number(Number(v).toPrecision(8))):'не проверено';
const STATE_RU=Object.freeze({ENTRY_NOW_ANALYTICAL:'вход подтверждён аналитически',ENTRY_NOW_VALIDATED:'вход подтверждён после валидации',WAIT_FOR_TRIGGER:'ждём условие входа',OBSERVE:'наблюдение',REJECTED:'идея отклонена'});
function reasonLine(r){const s=safeUserReason(r);return s?`- ${s}`:null;}
function blockerDetails(result){const f=result?.free_sources?.entry_funnel;const ds=Array.isArray(f?.blocker_details)?f.blocker_details:[];if(ds.length)return ds;return (Array.isArray(f?.blockers)?f.blockers:[]).map(code=>({code,...reasonDefinition(code),known:code!=='UNKNOWN_INTERNAL_REASON'}));}
function activeSources(result){const entries=Array.isArray(result?.free_sources?.registry?.entries)?result.free_sources.registry.entries:[];return entries.filter(x=>x.decision_usable===true||x.runtime_current===true).map(x=>sourceLabelRu(x.id)||x.id).filter(Boolean);}
function supportingFacts(result){return Array.isArray(result?.metadata?.supporting_context?.facts)?result.metadata.supporting_context.facts:[];}
export function formatManualReport(result){
 if(result?.status!=='CLOSED')return{ok:false,status:'CANONICAL_NOT_CLOSED',text:null};
 const blockers=blockerDetails(result),unknown=blockers.some(x=>x.known===false||x.code==='UNKNOWN_INTERNAL_REASON');
 const lines=['МОЙ ОТЧЁТ 2',`Снимок рынка: ${result.snapshot_time_utc}`,''];
 lines.push('КАНОНИЧЕСКОЕ СОСТОЯНИЕ',`Состояние: ${unknown?'вывод не готов — есть непереведённая внутренняя причина':(STATE_RU[result.state]||'не закрыто')}`,`Направление: ${result.direction==='LONG'?'покупка':result.direction==='SHORT'?'продажа':'не закрыто'}`,
   `Общая оценка: ${displayScore(result.scores?.overall_0_100)}`,`Монета интересна: ${displayScore(result.scores?.coin_interest_0_100)}`,`Готовность ко входу: ${displayReadiness(result.state)}`,'');
 lines.push('ПРИЧИНЫ');const reasons=(Array.isArray(result.reasons)?result.reasons:[]).map(reasonLine).filter(Boolean);if(reasons.length)lines.push(...reasons);else lines.push('- подтверждённых причин нет');for(const fact of displayMarketFacts(result))lines.push(`- ${fact}`);
 lines.push('','РАННИЕ КАНДИДАТЫ ДО ДВИЖЕНИЯ');const early=Array.isArray(result.early_candidate?.items)?result.early_candidate.items:(result.early_candidate?[result.early_candidate]:[]);if(!early.length)lines.push('Подтверждённых ранних кандидатов нет.');else for(const e of early)lines.push(`- ${text(e.contract||e.ticker)}: приоритет ${e.operational_priority_0_100??e.early_candidate_operational_priority_0_100??'не проверено'}/100; ${safeUserReason(e.reason||e.bridge_reason)||'причина не проверена'}`);lines.push(`Всего ранних кандидатов: ${early.length}.`);
 const sources=activeSources(result);lines.push('','ИСТОЧНИКИ И ЖЁСТКИЕ ПРОВЕРКИ',`Свежие подтверждённые источники: ${sources.length?sources.join(', '):'нет подтверждённых источников для этого снимка'}.`,`Жёсткие проверки: ${result.hard_gates?.length??0}.`);if(blockers.some(x=>x.code==='SOURCE_TOOL_UNAVAILABLE'))lines.push('ИСТОЧНИК НЕДОСТУПЕН В ЭТОМ ЗАПУСКЕ');
 if(blockers.length){lines.push('','ПОЧЕМУ ВЫВОД НЕ ЗАКРЫТ');for(const b of blockers)lines.push(`- ${b.full_ru||reasonDefinition(b.code).full_ru}`);}
 if(!unknown&&result.entry)lines.push(`Вход: ${result.entry.area??`${fmt(result.entry.min_price)}–${fmt(result.entry.max_price)}`}`);
 if(!unknown&&result.trigger){
  const trigger=displayTrigger(result.trigger);if(!trigger)return {ok:false,status:'TRIGGER_PRESENTATION_NOT_CLOSED',text:null};
  lines.push(`Условие входа: ${trigger}.`,`Отмена ожидания: ${displayCondition(result.trigger.cancel_condition)}.`,`Условие действительно до: ${displayTime(result.trigger.expires_ts)} МСК.`,`Следующая автоматическая проверка: ${displayTime(result.trigger.next_recheck_ts)} МСК.`);
 }
 if(result.invalidation){const invalidation=displayInvalidation(result.invalidation);if(!invalidation)return {ok:false,status:'INVALIDATION_PRESENTATION_NOT_CLOSED',text:null};lines.push(`Отмена идеи: ${invalidation}`);}
 if(!unknown&&result.targets?.length){const prices=result.targets.map(x=>displayNumber(x?.price??x)).filter(Boolean);if(prices.length)lines.push(`Начинать закрывать позицию: ${prices[0]} USDT.`,`Дальнейшие цели: ${prices.join(', ')} USDT.`);}
 const basis=String(result?.metadata?.idea_basis||'');
 if(basis==='LIQUIDATION_PUMP')lines.push('Основа идеи: ликвидационные зоны и ускорение движения.');
 else if(basis==='CANDLE_ANOMALY')lines.push('Основа идеи: более ранняя свечная аномалия, которая сейчас получает подтверждение.');
 else lines.push('Основа идеи: совокупность рыночных подтверждений.');
 const nativeLines=nativeLiquidationLines(result.liquidations,{manual:true});
 lines.push('',result.liquidations?.pump?.is_pump===true?'ПАМП И ЛИКВИДАЦИИ':'ЛИКВИДАЦИИ',...displayLegacyLiquidations(result.liquidations));
 if(nativeLines!==null){const valid=validateNativeLiquidationContext(result);if(!valid.ok)return{ok:false,status:valid.status,text:null};lines.push('Дополнительная фактическая выборка площадок:',...nativeLines);}
 if(result.free_sources)lines.push('','КАЧЕСТВО ДОПОЛНИТЕЛЬНЫХ ИСТОЧНИКОВ',`Статус непрерывного сбора: ${result.free_sources.continuous_collector_status==='PARTIAL_REALTIME_COVERAGE'?'частичное покрытие в реальном времени':'проверяется'}.`,`Новые внешние запросы горячего цикла: ${result.free_sources.hot_cycle_external_request_delta??0}.`);
 const sf=supportingFacts(result);if(sf.length){lines.push('','ДОПОЛНИТЕЛЬНЫЙ ПОДТВЕРЖДЁННЫЙ КОНТЕКСТ');for(const f of sf.slice(0,6)){const src=sourceLabelRu(f.source)||f.source;const v=f.value===null||f.value===undefined?'подтверждено':`${f.value}${f.unit?` ${f.unit}`:''}`;lines.push(`- ${f.label}: ${v}${src?` — ${src}`:''}.`);}}
 if(result.changes_from_previous?.length)lines.push('','ИЗМЕНЕНИЯ С ПРЕДЫДУЩЕГО ЗАПУСКА',...result.changes_from_previous.map(x=>`- ${safeUserReason(x)||'изменение зафиксировано'}`));
 const out=lines.filter(Boolean).join('\n');const forbidden=/\b(?:LONG|SHORT|OI|Funding|Spot flow|Spread|Slippage|Data Quality|Source receipts|hard gates)\b|\b[A-Z]{2,}_[A-Z0-9_]{2,}\b/i;if(forbidden.test(out)||hasInternalTerminology(out))return{ok:false,status:'FORBIDDEN_USER_TERMINOLOGY',text:null};return{ok:true,status:unknown?'SAFE_FAIL_CLOSED_UNKNOWN_REASON':'READY',text:out,formatter:MANUAL_REPORT_FORMATTER_VERSION,analytical_fingerprint:result.analytical_fingerprint};
}
export default{MANUAL_REPORT_FORMATTER_VERSION,formatManualReport};
