export const MANUAL_REPORT_FORMATTER_VERSION='manual-report-formatter-v2-free-sources-20260925';
const text=v=>v===null||v===undefined?'':String(v).trim();
const fmt=v=>Number.isFinite(Number(v))?String(Number(Number(v).toPrecision(8))):'не проверено';
export function formatManualReport(result){
 if(result?.status!=='CLOSED')return{ok:false,status:'CANONICAL_NOT_CLOSED',text:null};
 const lines=['МОЙ ОТЧЁТ 2',`Снимок рынка: ${result.snapshot_time_utc}`,`Run: ${result.run_id}`,''];
 lines.push('КАНОНИЧЕСКОЕ СОСТОЯНИЕ',`Состояние: ${result.state}`,`Направление: ${result.direction==='LONG'?'покупка':result.direction==='SHORT'?'продажа':'не закрыто'}`,
   `Общая оценка: ${result.scores?.overall_0_100??'не проверено'} из 100`,`Монета интересна: ${result.scores?.coin_interest_0_100??'не проверено'} из 100`,`Готовность ко входу: ${result.scores?.entry_readiness_0_100??'не проверено'} из 100`,'');
 lines.push('ПРИЧИНЫ');if(result.reasons?.length)for(const r of result.reasons)lines.push(`- ${typeof r==='string'?r:(r?.label?`${r.label}: ${r.value??r.event??'не проверено'}`:JSON.stringify(r))}`);else lines.push('- подтверждённых причин нет');
 lines.push('','РАННИЕ КАНДИДАТЫ ДО ДВИЖЕНИЯ');
 const early=Array.isArray(result.early_candidate?.items)?result.early_candidate.items:(result.early_candidate?[result.early_candidate]:[]);
 if(!early.length)lines.push('Подтверждённых ранних кандидатов нет.');else for(const e of early)lines.push(`- ${text(e.contract||e.ticker)}: приоритет ${e.operational_priority_0_100??e.early_candidate_operational_priority_0_100??'не проверено'}/100; ${text(e.reason||e.bridge_reason)||'причина не проверена'}`);
 lines.push(`Всего ранних кандидатов: ${early.length}.`);
 lines.push('','ИСТОЧНИКИ И ЖЁСТКИЕ ПРОВЕРКИ');
 lines.push(`Source receipts: ${result.source_receipts?.length??0}; hard gates: ${result.hard_gates?.length??0}.`);
 if(result.entry)lines.push(`Вход: ${result.entry.area??`${fmt(result.entry.min_price)}–${fmt(result.entry.max_price)}`}`);
 if(result.trigger)lines.push(`Триггер: ${JSON.stringify(result.trigger)}`);
 if(result.invalidation)lines.push(`Отмена идеи: ${typeof result.invalidation==='string'?result.invalidation:JSON.stringify(result.invalidation)}`);
 if(result.targets?.length)lines.push(`Цели: ${result.targets.map(x=>fmt(x?.price??x)).join(', ')}`);
 if(result.liquidations?.pump?.is_pump===true)lines.push('','ПАМП И ЛИКВИДАЦИИ',`Выше: ${result.liquidations.above?.length||0} подтверждённых зон.`,`Ниже: ${result.liquidations.below?.length||0} подтверждённых зон.`);
 if(result.free_sources?.status==='CLOSED'){
   const entries=Array.isArray(result.free_sources?.registry?.entries)?result.free_sources.registry.entries:[];
   const active=entries.filter(x=>x.runtime_current===true).map(x=>x.id);
   const blocked=result.free_sources?.entry_funnel?.blockers||[];
   lines.push('','БЕСПЛАТНЫЕ ИСТОЧНИКИ И КАЧЕСТВО ДАННЫХ',`Текущие подтверждённые receipts: ${active.length?active.join(', '):'нет новых подтверждённых receipts'}.`,`Статус непрерывного сбора: ${result.free_sources.continuous_collector_status||'PARTIAL_REALTIME_COVERAGE'}.`,`Новые внешние запросы горячего цикла: ${result.free_sources.hot_cycle_external_request_delta??0}.`);
   if(blocked.length)lines.push(`Почему вход не закрыт: ${blocked.join(', ')}.`);
 }
 if(result.changes_from_previous?.length)lines.push('','ИЗМЕНЕНИЯ С ПРЕДЫДУЩЕГО ЗАПУСКА',...result.changes_from_previous.map(x=>`- ${x}`));
 const out=lines.join('\n');return{ok:true,status:'READY',text:out,formatter:MANUAL_REPORT_FORMATTER_VERSION,analytical_fingerprint:result.analytical_fingerprint};
}
export default{MANUAL_REPORT_FORMATTER_VERSION,formatManualReport};
