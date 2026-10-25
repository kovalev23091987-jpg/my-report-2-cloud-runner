import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const target=new URL('FULL_TZ_TRACEABILITY.json',import.meta.url),canonical=JSON.parse(fs.readFileSync(target,'utf8'));
const source=read('pump-report/handoffs/sources/FULL_TZ_SOURCE_ATOMIC_LEDGER_V1.json');
const analytics=read('pump-report/handoffs/analytics/package-m/analytics-traceability.json');
const delta=read('pump-report/handoffs/analytics/package-n/audit-repair-delta.json');
const implementationDelta=read('checkpoints/pump-report-20261025/FULL_TZ_IMPLEMENTATION_DELTA.json');
const ownerNoComparison=read('checkpoints/pump-report-20261025/OWNER_NO_MARKET_COMPARISON.json');
const tz=fs.readFileSync(new URL('../PUMP_REPORT_DESIGN_HANDOFF_20261025/PUMP_REPORT_TZ_FOR_TRANSFER_RU.md',root));
const sha=createHash('sha256').update(tz).digest('hex'),lines=tz.toString('utf8').split(/\r?\n/);
if(sha!==canonical.tz_sha256||canonical.rows.length!==719||source.rows.length!==719)throw Error('EXACT_FULL_TZ_REQUIRED');
const sm=new Map(source.rows.map(r=>[r.id,r])),am=new Map(analytics.rows.map(r=>[r.id,r]));
const rootProof=['checkpoints/pump-report-20261025/OWNER_PUBLICATION_AFFECTED_ACCEPTANCE.json','checkpoints/pump-report-20261025/OWNER_L_AND_FULL_REVIEW_INTEGRATION.json','checkpoints/pump-report-20261025/METADATA_NATIVE_ACTUAL_ONE.json'];
const rootFiles={4:['pump-report/runtime/runner.mjs','pump-report/runtime/budget.mjs'],5:['pump-report/contracts/index.mjs','pump-report/contracts/run-purpose.mjs'],13:['pump-report/runtime/budget.mjs','pump-report/runtime/native-budget.mjs','pump-report/runtime/store.mjs'],14:['pump-report/runtime/worker.mjs','pump-report/runtime/manual-input.mjs','pump-report/runtime/runner.mjs'],17:['pump-report/runtime/outcome-journal.mjs','pump-report/runtime/store.mjs'],19:['pump-report/runtime/delivery.mjs','pump-report/runtime/worker.mjs'],20:['pump-report/worker-entry.mjs','pump-report/AGENTS.md'],21:['pump-report/AGENTS.md','pump-report/CONTRACT_RU.md'],22:['checkpoints/pump-report-20261025/ACCEPTANCE_MATRIX_RU.md'],23:['checkpoints/pump-report-20261025/ROOT_FINAL_E_ACCEPTANCE.json'],24:['pump-report/AGENTS.md']};
const sectionRemaining={4:'Общее ядро и брокер связаны; текущая полная рабочая цепочка и весь рынок не приняты.',5:'Формат проверен в коде; смысл и доступность полей по каждому реальному контракту требуют положительных SOURCE-доказательств.',13:'Полный дневной расход/частота/шесть холодных проверок и внешние квоты ещё не измерены; отрицательный кэш и растущий backoff, признаки очереди и плановый запас требуют завершения.',14:'Парсер/окна/защита очереди в коде; полноценный разрешённый ручной режим и новое расписание ещё не приняты.',17:'Исходники/квитанции защищены; consumer→window→retention→delete матрица, ротация ненужных записей и постраничные долгие индексы не завершены.',19:'Протокол и transport239/acceptance240 проверены; разрешённый текущий production-сигнал и его исход ещё не приняты.',20:'Пригодные компоненты переиспользованы; старые gates не должны вернуться при завершении новых подключений.',21:'Три существующих чата и владельцы файлов подтверждены; общий проект остаётся незавершённым.',22:'Первый допустимый рабочий сигнал/полный рынок/расписание остаются открыты; накопление модели относится к этапу после запуска.',23:'Кодовые случаи имеют замороженные квитанции; новый полный фактический путь на разрешённом инструменте отсутствует.',24:'Авторизация новой реализации есть; старые паузы и обе OWNERdeferrals сохраняются; обещания охвата/прибыли/процентов не выдаются.'};
for(const row of canonical.rows){
  if(lines[row.line-1]!==row.text)throw Error('LITERAL_LINE_DRIFT:'+row.id);
  const s=sm.get(row.id),a=am.get(row.id);if(!s||s.literal!==row.text||!s.source_lines.includes(row.line))throw Error('SOURCE_LITERAL_DRIFT:'+row.id);
  if(a&&(a.text!==row.text||a.line!==row.line))throw Error('ANALYTICS_LITERAL_DRIFT:'+row.id);
  row.reviewed=true;row.review_assessments={SOURCE:{status:s.status,scope:s.review_scope,refs:s.proof_refs,code_refs:s.code_refs,remaining:s.remaining,verification:s.verification}};
  if(a)row.review_assessments.ANALYTICS={status:a.status,checked_code:a.checked_code,code_refs:a.code_refs,accepted_proof_refs:a.accepted_proof_refs,remaining:a.remaining,native_verified:false};
  let picked=row.lead==='SOURCES'?s:a;
  if(row.lead==='ROOT'){
    const status=row.section===5||row.section===21||row.section===19?'VERIFIED_CODE':'PARTIAL';
    row.review_assessments.ROOT={status,code_refs:rootFiles[row.section]??[],accepted_proof_refs:rootProof,remaining:sectionRemaining[row.section]??'Сверены общие условия передачи; новое рабочее выполнение и полная приёмка не завершены.'};picked=row.review_assessments.ROOT;
  }
  row.status=row.kind==='HEADING'||['DIAGRAM','FENCE','TABLE_SEPARATOR','SEPARATOR','FORMULA'].includes(row.kind)?'CONTEXT':picked?.status??'PARTIAL';
  row.code_verified=row.status==='VERIFIED_CODE';row.native_verified=false;row.requirement_closed=false;
  row.remaining=picked?.remaining??'Открытая общая приёмка; см. все три оценки.';
  row.assessment_refs=['pump-report/handoffs/sources/FULL_TZ_SOURCE_ATOMIC_LEDGER_V1.json',...(a?['pump-report/handoffs/analytics/package-m/analytics-traceability.json']:[]),...(row.lead==='ROOT'?['checkpoints/pump-report-20261025/ROOT_FULL_TZ_REVIEW_RU.md']:[])];
  if(delta.related_TZ_atoms.some(x=>x.id===row.id))row.latest_repair={ref:'pump-report/handoffs/analytics/package-n/audit-repair-delta.json',code_gaps_closed:['M-G01','M-G07'],native_verified:false,broader_requirement_not_automatically_closed:true};
  const current=implementationDelta.changes.find(x=>x.id===row.id);
  if(current){row.status=current.status;row.code_verified=current.status==='VERIFIED_CODE';row.code_refs=current.code_refs;row.remaining=current.remaining;row.latest_implementation={...current,ref:implementationDelta.proof,native_verified:false,broader_requirement_not_automatically_closed:true};row.review_assessments.ROOT_CURRENT=row.latest_implementation;row.assessment_refs.push(implementationDelta.proof);}
  const note=implementationDelta.annotations.find(x=>x.ids.includes(row.id));if(note){row.latest_implementation_note=note;row.assessment_refs.push(note.ref);}
  if(ownerNoComparison.supersedes.source_TZ_lines.includes(row.line)){
    row.owner_scope_override={ref:'checkpoints/pump-report-20261025/OWNER_NO_MARKET_COMPARISON.json',excluded:'Сравнение движения монеты с BTC/ETH отменено прямой командой владельца.',remaining_scope:'Прочий полезный дополнительный контекст других площадок требует собственной квалификации.'};
    row.remaining=row.owner_scope_override.excluded+' '+row.owner_scope_override.remaining_scope;
    row.assessment_refs.push(row.owner_scope_override.ref);
  }
}
canonical.review_status='ALL_THREE_FULL_LITERAL_REVIEW_RECONCILED_WITH_OPEN_ITEMS';canonical.all24sections_reviewed=true;canonical.all_nonempty_lines_reviewed=true;canonical.overall_completion_pct=null;
canonical.current_native_scope={eligible_crypto_N:null,active_USDT_catalog_count:934,positively_verified_crypto:13,owner_delivery_excluded:2,delivery_verified:11,unclassified_active_USDT:919,production_signals:0,qualified_maps:0};
canonical.current_native_scope.latest_bounded_acceptance=implementationDelta.native_scope;
canonical.owner_amendments_literal_ref='checkpoints/pump-report-20261025/OWNER_AMENDMENTS_LITERAL_RU.md';
canonical.owner_no_market_comparison_ref='checkpoints/pump-report-20261025/OWNER_NO_MARKET_COMPARISON.json';
canonical.latest_repairs={analyticsN:{code_gaps_closed:['M-G01','M-G07'],pass:4,server_deployed:true},analyticsO:{ref:'pump-report/handoffs/analytics/package-o/qualification.json',new_unique_pass:2,scenario_observed_lower_bound_only:true},reliability_and_queue:{ref:implementationDelta.proof,new_pass:7,affected_pass:9,server_deployed:true},manual_reserves:{pass:4,costs_not_refunded:true,server_deployed:true},unicode:{pass:4,server_deployed:true}};
canonical.counts={};for(const r of canonical.rows)canonical.counts[r.status]=(canonical.counts[r.status]??0)+1;
canonical.review_counts_are_not_project_completion_percentage=true;canonical.updated_at=new Date().toISOString();
fs.writeFileSync(target,JSON.stringify(canonical,null,2)+'\n');
const out=['# Полный контрольный список Памп-отчёта','',`ТЗ v2, SHA256 \`${sha}\`. Все1054 строки прочитаны каждым изтрёхчатов; все719 непустых строк сохранены дословно и сверены с исходником.`,'','Отметки разделены: просмотрено; реализация проверена в коде; фактическая приёмка. Галочка кода не объявляет подключение/весь рынок/production готовыми. Общий процент готовности не установлен. Последние прямые указания владельца — OWNER_AMENDMENTS_LITERAL_RU.md, OWNER_PUBLICATION_AMENDMENTS.json и OWNER_NO_MARKET_COMPARISON.json. Сравнение с BTC/ETH исключено; исходный текст ТЗ сохранён дословно.',''];
let section=null;for(const r of canonical.rows){if(section!==r.section){section=r.section;out.push(`## Раздел ${section}`,'');}out.push(`### ${r.id} · исходная строка ${r.line}`,'',...r.text.split('\n').map(t=>'> '+t),'');if(r.status==='CONTEXT'){out.push('Контекст; рассмотрен, не является отдельной отметкой завершения.','');continue;}out.push('- [x] Пункт рассмотрен при полной сверке.',`- [${r.code_verified?'x':' '}] Реализация проверена в коде. Статус: ${r.status}.`,'- [ ] Текущая фактическая рабочая приёмка завершена.',`Ответственный: ${r.lead}. Остаток: ${r.remaining}`,'',`Доказательства: ${r.assessment_refs.join('; ')}.`,...(r.latest_repair?['Исправление N закрывает только два указанных кодовых дефекта; остальные условия пункта сохраняются.']:[]),'');}
fs.writeFileSync(new URL('FULL_TZ_CHECKLIST_RU.md',import.meta.url),out.join('\n')+'\n');
console.log(JSON.stringify({reviewed:canonical.rows.length,literal_matches:true,counts:canonical.counts,all24sections:true,overall_completion_pct:null,production_complete:false}));
