import { reasonDefinition, safeUserReason, sourceLabelRu } from './reason-registry.mjs';
export const MANUAL_REPORT_FORMATTER_VERSION='manual-report-formatter-v4-existing-source-consumer-20260925';
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
 const lines=['МОЙ ОТЧЁТ 2',`Снимок рынка: ${result.snapshot_time_utc}`,`Запуск: ${result.run_id}`,''];
 lines.push('КАНОНИЧЕСКОЕ СОСТОЯНИЕ',`Состояние: ${unknown?'вывод не готов — есть непереведённая внутренняя причина':(STATE_RU[result.state]||'не закрыто')}`,`Направление: ${result.direction==='LONG'?'покупка':result.direction==='SHORT'?'продажа':'не закрыто'}`,
   `Общая оценка: ${result.scores?.overall_0_100??'не проверено'} из 100`,`Монета интересна: ${result.scores?.coin_interest_0_100??'не проверено'} из 100`,`Готовность ко входу: ${result.scores?.entry_readiness_0_100??'не проверено'} из 100`,'');
 lines.push('ПРИЧИНЫ');const reasons=(Array.isArray(result.reasons)?result.reasons:[]).map(reasonLine).filter(Boolean);if(reasons.length)lines.push(...reasons);else lines.push('- подтверждённых причин нет');
 lines.push('','РАННИЕ КАНДИДАТЫ ДО ДВИЖЕНИЯ');const early=Array.isArray(result.early_candidate?.items)?result.early_candidate.items:(result.early_candidate?[result.early_candidate]:[]);if(!early.length)lines.push('Подтверждённых ранних кандидатов нет.');else for(const e of early)lines.push(`- ${text(e.contract||e.ticker)}: приоритет ${e.operational_priority_0_100??e.early_candidate_operational_priority_0_100??'не проверено'}/100; ${safeUserReason(e.reason||e.bridge_reason)||'причина не проверена'}`);lines.push(`Всего ранних кандидатов: ${early.length}.`);
 const sources=activeSources(result);lines.push('','ИСТОЧНИКИ И ЖЁСТКИЕ ПРОВЕРКИ',`Свежие подтверждённые источники: ${sources.length?sources.join(', '):'нет подтверждённых источников для этого снимка'}.`,`Жёсткие проверки: ${result.hard_gates?.length??0}.`);
 if(blockers.length){lines.push('','ПОЧЕМУ ВЫВОД НЕ ЗАКРЫТ');for(const b of blockers)lines.push(`- ${b.full_ru||reasonDefinition(b.code).full_ru}`);}
 if(!unknown&&result.entry)lines.push(`Вход: ${result.entry.area??`${fmt(result.entry.min_price)}–${fmt(result.entry.max_price)}`}`);
 if(!unknown&&result.trigger)lines.push(`Условие входа: ${safeUserReason(result.trigger?.cancel_condition)||'требуется подтверждение указанного условия'}.`);
 if(result.invalidation)lines.push(`Отмена идеи: ${typeof result.invalidation==='string'?safeUserReason(result.invalidation):'условие отмены сохранено в аналитическом результате'}`);
 if(!unknown&&result.targets?.length)lines.push(`Цели: ${result.targets.map(x=>fmt(x?.price??x)).join(', ')}`);
 if(result.liquidations?.pump?.is_pump===true)lines.push('','ПАМП И ЛИКВИДАЦИИ',`Выше: ${result.liquidations.above?.length||0} подтверждённых зон.`,`Ниже: ${result.liquidations.below?.length||0} подтверждённых зон.`);
 if(result.free_sources)lines.push('','КАЧЕСТВО ДОПОЛНИТЕЛЬНЫХ ИСТОЧНИКОВ',`Статус непрерывного сбора: ${result.free_sources.continuous_collector_status==='PARTIAL_REALTIME_COVERAGE'?'частичное покрытие в реальном времени':'проверяется'}.`,`Новые внешние запросы горячего цикла: ${result.free_sources.hot_cycle_external_request_delta??0}.`);
 const sf=supportingFacts(result);if(sf.length){lines.push('','ДОПОЛНИТЕЛЬНЫЙ ПОДТВЕРЖДЁННЫЙ КОНТЕКСТ');for(const f of sf.slice(0,6)){const src=sourceLabelRu(f.source)||f.source;const v=f.value===null||f.value===undefined?'подтверждено':`${f.value}${f.unit?` ${f.unit}`:''}`;lines.push(`- ${f.label}: ${v}${src?` — ${src}`:''}.`);}}
 if(result.changes_from_previous?.length)lines.push('','ИЗМЕНЕНИЯ С ПРЕДЫДУЩЕГО ЗАПУСКА',...result.changes_from_previous.map(x=>`- ${safeUserReason(x)||'изменение зафиксировано'}`));
 const out=lines.filter(Boolean).join('\n');return{ok:true,status:unknown?'SAFE_FAIL_CLOSED_UNKNOWN_REASON':'READY',text:out,formatter:MANUAL_REPORT_FORMATTER_VERSION,analytical_fingerprint:result.analytical_fingerprint};
}
export default{MANUAL_REPORT_FORMATTER_VERSION,formatManualReport};
