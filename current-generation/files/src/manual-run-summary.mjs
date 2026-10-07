import {BLOCKS} from './evidence-v2.mjs';
import {consumeExecutionReportContext} from './execution-report-context.mjs';
const requiredBlockCount=Object.keys(BLOCKS).length;
import {nativeLiquidationLines,nativeLiquidationSources} from './native-liquidation-guard.mjs';
import {displayFutureLiquidations,displayCoinLobsterHint,liquidationPresentationPolicy} from './canonical-display.mjs';
export const MANUAL_RUN_SUMMARY_VERSION='manual-run-summary-ru-v4-owner-layout-15-blocks-20261004';
const finite=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const price=value=>{const n=finite(value);return n!==null&&n>0?String(Number(n.toPrecision(8))):null;};
const contract=value=>typeof value==='string'&&/^[^\s]{1,40}-USDT$/u.test(value)?value:null;
const actionable=new Set(['OBSERVE','WAIT_FOR_TRIGGER','ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED']);

function confirmedRunContext(candidates,runId){
 const lines=[];
 if(!runId||!Array.isArray(candidates))return lines;
 for(const row of candidates){
  const proof=row?.block_rendered_results,c=row?.canonical;
  const binding=contract(row?.contract)&&row.run_id===runId&&c?.run_id===runId&&proof?.run_id===runId&&
   proof.contract===row.contract&&row.snapshot_id&&row.snapshot_id===c.snapshot_id&&proof.snapshot_id===row.snapshot_id&&
   row.observed_ts===c.observed_ts&&proof.status==='RENDERED_OUTPUT_VERIFIED'&&typeof row.manual_text==='string';
  const savedFacts=binding?(Array.isArray(proof.context_receipts)?proof.context_receipts:[]).filter(f=>BLOCKS[f.block_id]&&f.consumer==='MANUAL_CONFIRMED_CONTEXT'&&f.score_contribution===0&&
   typeof f.label==='string'&&typeof f.value==='string'&&Number.isFinite(f.source_ts)&&Number.isFinite(f.observed_ts)&&f.source_ts<=f.observed_ts&&f.observed_ts<=row.observed_ts&&
   row.manual_text.includes(`- ${f.label}: ${f.value}`)):[];
  const executionFacts=consumeExecutionReportContext(row,runId).facts;
  const facts=[...savedFacts,...executionFacts.filter(f=>!savedFacts.some(s=>s.block_id===f.block_id&&Array.isArray(s.evidence_ids)&&f.evidence_ids.every(id=>s.evidence_ids.includes(id))&&s.label===f.label.replace(/LONG/g,'покупки').replace(/SHORT/g,'продажи')))];
  if(!facts.length)continue;
  if(!lines.length)lines.push('ДОПОЛНИТЕЛЬНЫЙ ПОДТВЕРЖДЁННЫЙ КОНТЕКСТ');
  lines.push(row.contract,...facts.slice(0,24).map(f=>`- ${f.label}: ${f.value}.`));
 }
 return lines;
}

function proven(row,generatedAt){
 const c=row?.canonical;
 if(c?.data_quality?.sufficient===false)return false;
 if(c?.status!=='CLOSED'||!actionable.has(c?.state)||c?.direction!==row?.direction||!contract(row?.contract)||
  !['LONG','SHORT'].includes(row?.direction)||!c?.entry||!c?.trigger||!c?.invalidation||!Array.isArray(c?.targets))return false;
 if(c.state==='OBSERVE'&&finite(c.scores?.coin_interest_0_100)<70)return false;
 if(!price(c.trigger.value)||!price(c.invalidation.price))return false;
 const deadline=finite(row.valid_until_ts??c.trigger.expires_ts);
 if(deadline!==null&&Number.isFinite(Date.parse(generatedAt))&&deadline<Date.parse(generatedAt))return false;
 if(c.state==='OBSERVE'&&!c.targets.length)return true;
 if(!c.targets.length)return false;
 const entry=finite(c.entry.min_price??c.entry.max_price),target=finite(c.targets[0]?.price);
 if(entry===null||entry<=0||target===null||target<=0)return false;
 return (c.direction==='LONG'?(target/entry-1)*100:(1-target/entry)*100)>0;
}

function idea(row){
 const c=row.canonical,entry=price(c.entry.min_price??c.entry.max_price),target=c.targets.length?price(c.targets[0].price):null;
 const trigger=price(c.trigger.value),cancel=price(c.invalidation.price),score=finite(c.scores?.coin_interest_0_100);
 const state=c.state==='OBSERVE'?'Наблюдение':c.state==='WAIT_FOR_TRIGGER'?'Ждём условие':'Вход подтверждён';
 const lines=[`${row.contract} — ${state}${score!==null?`; оценка ${Math.round(score)} из 100`:''}.`];
 if(trigger)lines.push(`Условие: цена ${c.direction==='LONG'?'выше':'ниже'} ${trigger} USDT.`);
 lines.push(`Уровень входа: ${entry} USDT.`);
 if(cancel)lines.push(`Отмена идеи: цена ${c.direction==='LONG'?'ниже':'выше'} ${cancel} USDT.`);
 lines.push(target?`Первая цель: ${target} USDT.`:'Первая цель: пока не подтверждена.');
 return lines;
}

export function auditCanonicalCandidateSet({expected_contracts=[],rows=[],run_id}={}){
 const expected=[...new Set(expected_contracts)].filter(value=>contract(value));
 const present=[...new Set(rows.filter(row=>row?.run_id===run_id&&expected.includes(row?.contract_code)).map(row=>row.contract_code))];
 const missing=expected.filter(value=>!present.includes(value));
 return {schema:'CANONICAL_CANDIDATE_SET_AUDIT_V1',status:missing.length?'PARTIAL':'CLOSED',run_id,
  expected_contracts:expected,present_contracts:present,missing_contracts:missing,
  expected_candidate_count:expected.length,present_candidate_count:present.length,
  missing_is_technical_not_no_market_idea:missing.length>0};
}
export function classifyCanonicalRunCompletion({candidate_count=0,expected_candidate_count=0,cron}={}){
 if(cron?.v3_pipeline_health_status==='DEGRADED_PIPELINE')return {status:'PARTIAL_DATA_UNAVAILABLE',reason:cron.v3_pipeline_health_reason||'PIPELINE_NOT_CLOSED'};
 if(candidate_count===0&&Number(cron?.v3_live_deep_check_count)>0)return {status:'PARTIAL_DATA_UNAVAILABLE',reason:'CANONICAL_CANDIDATE_NOT_PERSISTED'};
 if(candidate_count<Math.max(Number(expected_candidate_count)||0,Number(cron?.v3_live_deep_check_count)||0))return {status:'PARTIAL_DATA_UNAVAILABLE',reason:'CANONICAL_CANDIDATE_SET_INCOMPLETE'};
 return {status:candidate_count>0?'CLOSED':'CLOSED_NO_CANONICAL_CANDIDATE',reason:null};
}
export function enforceManualBlockCoverage(output={}){
 if(!['manual','manual_recovery','workflow_dispatch'].includes(output?.source)||!Array.isArray(output?.candidates))return output;
 if(!output.candidates.length)return {...output,status:'PARTIAL_DATA_UNAVAILABLE',reason:'REQUIRED_BLOCKS_NOT_CONFIRMED',block_audit:{required_block_count:requiredBlockCount,candidate_count:0,fully_checked_candidate_count:0,minimum_checked_block_count:0,all_candidates_fully_checked:false}};
 const audits=output.candidates.map(row=>row?.block_coverage||null);
 const fullyChecked=audits.filter(audit=>audit?.coverage_count===requiredBlockCount&&audit?.checked_block_count===requiredBlockCount&&audit?.all_blocks_checked===true).length;
 const checkedCounts=audits.map(audit=>Number(audit?.checked_block_count)).filter(Number.isFinite);
 const usefulCounts=audits.map(audit=>Number(audit?.usable_block_count)).filter(Number.isFinite);
 const auditStatusCounts=audits.map(audit=>Object.values(audit?.blocks||{}).reduce((acc,row)=>{acc[String(row?.status||'NOT_CHECKED')]=(acc[String(row?.status||'NOT_CHECKED')]||0)+1;return acc;},{}));
 const minimumStatusCount=status=>auditStatusCounts.length?Math.min(...auditStatusCounts.map(counts=>Number(counts[status]||0))):0;
 const sufficientCandidates=output.candidates.filter(row=>row?.canonical?.data_quality?.sufficient!==false).length;
 const block_audit={required_block_count:requiredBlockCount,candidate_count:audits.length,fully_checked_candidate_count:fullyChecked,
  minimum_checked_block_count:checkedCounts.length?Math.min(...checkedCounts):0,minimum_usable_block_count:usefulCounts.length?Math.min(...usefulCounts):0,
  minimum_admissible_fact_block_count:minimumStatusCount('ADMISSIBLE_FACTUAL_CONTEXT'),
  minimum_filtered_fact_block_count:minimumStatusCount('FACTS_PRESENT_NOT_DECISION_ADMISSIBLE'),
  minimum_checked_no_event_block_count:minimumStatusCount('CHECKED_NO_USABLE_FACTS'),
  maximum_not_checked_block_count:auditStatusCounts.length?Math.max(...auditStatusCounts.map(counts=>Number(counts.NOT_CHECKED||0))):requiredBlockCount,
  data_sufficient_candidate_count:sufficientCandidates,all_candidates_data_sufficient:sufficientCandidates===output.candidates.length,
  all_candidates_fully_checked:fullyChecked===audits.length};
 const accounted=audits.every(a=>a?.coverage_count===requiredBlockCount&&Object.keys(BLOCKS).every(id=>a.blocks?.[id]&&typeof a.blocks[id].status==='string'&&a.blocks[id].source_statuses&&a.blocks[id].source_checks));
 block_audit.all_block_outcomes_accounted=accounted;
 block_audit.full_15_per_candidate_required=false;
 if(block_audit.all_candidates_fully_checked||accounted)return {...output,block_audit};
 return {...output,status:'PARTIAL_DATA_UNAVAILABLE',reason:'BLOCK_OUTCOME_AUDIT_MISSING',block_audit};
}
export function formatManualRunSummary({status,candidates=[],generated_at,source,run_id,block_audit,liquidation_policy}={}){
 const contextLines=confirmedRunContext(candidates,run_id);
 if(status==='PARTIAL_DATA_UNAVAILABLE'){
  const checked=Number(block_audit?.minimum_checked_block_count);
  const progress=Number.isFinite(checked)?` Фактически подтверждено блоков: ${checked} из ${requiredBlockCount}.`:'';
  return `МОЙ ОТЧЁТ 2\n\nПроверка не завершена: часть необходимых данных не подтверждена.${progress}\n\nЛОНГ\nПолный вывод пока недоступен.\n\nШОРТ\nПолный вывод пока недоступен.${contextLines.length?'\n\n'+contextLines.join('\n'):''}\n\nДействие сейчас: не входить, дождаться следующей проверки.`;
 }
 if(!['CLOSED','CLOSED_NO_CANONICAL_CANDIDATE'].includes(status)||!Array.isArray(candidates))return null;
 const stamp=Number.isFinite(Date.parse(generated_at))?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(generated_at)):null;
 const auditLines=['manual','manual_recovery','workflow_dispatch'].includes(source)?[
  `Проверка дополнительных блоков: ${Number(block_audit?.minimum_checked_block_count||0)} из ${requiredBlockCount}; неподтверждённых: ${Number(block_audit?.maximum_not_checked_block_count||0)}.`,
  `Новые допущенные факты: ${Number(block_audit?.minimum_admissible_fact_block_count||0)} блока; сведения без допуска в решение: ${Number(block_audit?.minimum_filtered_fact_block_count||0)}; событий не обнаружено: ${Number(block_audit?.minimum_checked_no_event_block_count||0)}.`,
 ]:[];
 const lines=['МОЙ ОТЧЁТ 2',...(stamp?[`${stamp} МСК`]:[]),...auditLines,''];
 let found=0;
 for(const direction of ['LONG','SHORT']){
  lines.push(direction==='LONG'?'ЛОНГ':'ШОРТ');
  const ideas=candidates.filter(row=>row?.direction===direction&&proven(row,generated_at));
  if(!ideas.length)lines.push('Подтверждённых идей сейчас нет.');
  else for(const row of ideas){lines.push(...idea(row));found++;}
  lines.push('');
 }
 if(contextLines.length)lines.push(...contextLines,'');
 if(!found){
  const rejected=candidates.filter(row=>row?.canonical_state==='REJECTED'&&contract(row?.contract));
  if(rejected.length){
   const row=rejected[0],score=finite(row.canonical?.scores?.coin_interest_0_100);
   lines.push(`${row.contract} ${row.direction==='LONG'?'на покупку':row.direction==='SHORT'?'на продажу':''}${score!==null?` получила раннюю оценку интереса ${Math.round(score)} из 100,`:''} но подтверждающая проверка не сформировала полный план входа. Идея отклонена.`);
  }
  lines.push('Действие сейчас: не входить.');
 }
 if(['manual','manual_recovery','workflow_dispatch'].includes(source)&&typeof run_id==='string'&&run_id){
  const context=candidates.filter(row=>contract(row?.contract)&&!['BTC-USDT','ETH-USDT'].includes(row.contract)&&
   row.run_id===run_id&&row.canonical?.run_id===run_id&&row.canonical?.status==='CLOSED'&&
   row.canonical.liquidations?.future_only===true).slice(0,6);
  if(context.length){
   lines.push('','ЛИКВИДАЦИОННЫЙ БЛОК','');
   for(const row of context){
    const liq=row.canonical.liquidations,px=price(liq.current_price);
    lines.push(`Углублённая проверка: ${row.contract}.`);
    if(px)lines.push(`Цена HTX в снимке: ${px} USDT.`);
    lines.push(...displayFutureLiquidations(liq,{policy:liquidation_policy??liquidationPresentationPolicy(row.canonical.observed_ts)}),...displayCoinLobsterHint(liq.future_hint));
    if(liq.future_levels_status==='NOT_AVAILABLE')lines.push('Будущие уровни и объёмы не получены; это отсутствие данных, а не нулевые ликвидации.');
    if(liq.future_source_status?.tracked_hl?.status==='NO_EXACT_TRACKED_MARKET_REFERENCE')
     lines.push('Hyperliquid: опорная цена и отслеживаемые позиции для этой монеты не получены.');
   }
   lines.push('Уровни других площадок не являются подтверждёнными целями на ХТХ. Это наблюдение, не подтверждённый вход.');
  }
 }
 return lines.join('\n').trim();
}

export function formatLiquidationRunSummary({status,scan,preliminary_candidates=[],verified_candidate,liquidation_lines=[]}={}){
 if(status!=='CLOSED'||!Number.isSafeInteger(scan?.universe_total)||scan.universe_total<1||
  scan.scanned!==scan.universe_total||scan.errors!==0||scan.stale!==0)return null;
 const names=(Array.isArray(preliminary_candidates)?preliminary_candidates:[])
  .map(row=>contract(row?.contract)).filter(Boolean).slice(0,5);
 const selected=contract(verified_candidate);
 if(verified_candidate&&!selected)return null;
 const lines=['ЛИКВИДАЦИОННЫЙ БЛОК',''];
 if(names.length)lines.push(`Монеты для наблюдения: ${names.join(', ')}.`);
 if(!selected){lines.push('Монет для углублённой проверки сейчас нет.');return lines.join('\n').trim();}
 lines.push(`Углублённая проверка: ${selected}.`);
 if(Array.isArray(liquidation_lines)&&liquidation_lines.length)
  lines.push(...liquidation_lines.filter(row=>typeof row==='string'&&row.trim()).slice(0,24));
 else lines.push('Сильные зоны ликвидаций сейчас не подтверждены.');
 lines.push('Уровни других площадок не являются подтверждёнными целями на ХТХ. Это наблюдение, не подтверждённый вход.');
 return lines.join('\n').trim();
}
export function formatStandaloneLiquidationSourceLines(liq,{policy='ORIGINAL'}={}){
 return nativeLiquidationLines(liq,{manual:true,policy})||[];
}
export default {MANUAL_RUN_SUMMARY_VERSION,classifyCanonicalRunCompletion,enforceManualBlockCoverage,formatManualRunSummary,formatLiquidationRunSummary};
