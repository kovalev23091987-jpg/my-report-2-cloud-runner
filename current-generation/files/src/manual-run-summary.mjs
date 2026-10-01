import {nativeLiquidationLines,nativeLiquidationSources} from './native-liquidation-guard.mjs';
import {displayFutureLiquidations,displayCoinLobsterHint} from './canonical-display.mjs';
export const MANUAL_RUN_SUMMARY_VERSION='manual-run-summary-ru-v2-approved-layout-20261001';
const finite=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const price=value=>{const n=finite(value);return n!==null&&n>0?String(Number(n.toPrecision(8))):null;};
const contract=value=>typeof value==='string'&&/^[^\s]{1,40}-USDT$/u.test(value)?value:null;
const actionable=new Set(['OBSERVE','WAIT_FOR_TRIGGER','ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED']);

function proven(row,generatedAt){
 const c=row?.canonical;
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

export function classifyCanonicalRunCompletion({candidate_count=0,cron}={}){
 if(cron?.v3_pipeline_health_status==='DEGRADED_PIPELINE')return {status:'PARTIAL_DATA_UNAVAILABLE',reason:cron.v3_pipeline_health_reason||'PIPELINE_NOT_CLOSED'};
 if(candidate_count===0&&Number(cron?.v3_live_deep_check_count)>0)return {status:'PARTIAL_DATA_UNAVAILABLE',reason:'CANONICAL_CANDIDATE_NOT_PERSISTED'};
 return {status:candidate_count>0?'CLOSED':'CLOSED_NO_CANONICAL_CANDIDATE',reason:null};
}
export function enforceManualBlockCoverage(output={}){
 if(!['manual','manual_recovery'].includes(output?.source)||!Array.isArray(output?.candidates)||!output.candidates.length)return output;
 const audits=output.candidates.map(row=>row?.block_coverage||null);
 const fullyChecked=audits.filter(audit=>audit?.coverage_count===17&&audit?.checked_block_count===17&&audit?.all_blocks_checked===true).length;
 const checkedCounts=audits.map(audit=>Number(audit?.checked_block_count)).filter(Number.isFinite);
 const block_audit={required_block_count:17,candidate_count:audits.length,fully_checked_candidate_count:fullyChecked,minimum_checked_block_count:checkedCounts.length?Math.min(...checkedCounts):0,all_candidates_fully_checked:fullyChecked===audits.length};
 if(block_audit.all_candidates_fully_checked)return {...output,block_audit};
 return {...output,status:'PARTIAL_DATA_UNAVAILABLE',reason:'ALL_17_BLOCKS_NOT_CONFIRMED',block_audit};
}
export function formatManualRunSummary({status,candidates=[],generated_at,source,run_id,block_audit}={}){
 if(status==='PARTIAL_DATA_UNAVAILABLE'){
  const checked=Number(block_audit?.minimum_checked_block_count);
  const progress=Number.isFinite(checked)?` Фактически подтверждено блоков: ${checked} из 17.`:'';
  return `МОЙ ОТЧЁТ 2\n\nПроверка не завершена: часть необходимых данных не подтверждена.${progress} Сделать полный вывод о наличии идей сейчас нельзя.\n\nДействие сейчас: не входить, дождаться следующей проверки.`;
 }
 if(!['CLOSED','CLOSED_NO_CANONICAL_CANDIDATE'].includes(status)||!Array.isArray(candidates))return null;
 if(['manual','manual_recovery'].includes(source)){
  const approved=candidates.map(row=>typeof row?.manual_text==='string'?row.manual_text.trim():'').filter(Boolean);
  if(approved.length)return approved.join('\n\n');
 }
 const stamp=Number.isFinite(Date.parse(generated_at))?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(generated_at)):null;
 const lines=['МОЙ ОТЧЁТ 2',...(stamp?[`${stamp} МСК`]:[]),''];
 let found=0;
 for(const direction of ['LONG','SHORT']){
  lines.push(direction==='LONG'?'ЛОНГ':'ШОРТ');
  const ideas=candidates.filter(row=>row?.direction===direction&&proven(row,generated_at));
  if(!ideas.length)lines.push('Подтверждённых идей сейчас нет.');
  else for(const row of ideas){lines.push(...idea(row));found++;}
  lines.push('');
 }
 if(!found){
  const rejected=candidates.filter(row=>row?.canonical_state==='REJECTED'&&contract(row?.contract));
  if(rejected.length){
   const row=rejected[0],score=finite(row.canonical?.scores?.coin_interest_0_100);
   lines.push(`${row.contract} ${row.direction==='LONG'?'на покупку':row.direction==='SHORT'?'на продажу':''}${score!==null?` получила раннюю оценку интереса ${Math.round(score)} из 100,`:''} но подтверждающая проверка не сформировала полный план входа. Идея отклонена.`);
  }
  lines.push('Действие сейчас: не входить.');
 }
 if(['manual','manual_recovery'].includes(source)&&typeof run_id==='string'&&run_id){
  const context=candidates.filter(row=>contract(row?.contract)&&!['BTC-USDT','ETH-USDT'].includes(row.contract)&&
   row.run_id===run_id&&row.canonical?.run_id===run_id&&row.canonical?.status==='CLOSED'&&
   row.canonical.liquidations?.future_only===true).slice(0,6);
  if(context.length){
   lines.push('','ЛИКВИДАЦИОННЫЙ БЛОК','');
   for(const row of context){
    const liq=row.canonical.liquidations,px=price(liq.current_price);
    lines.push(`Углублённая проверка: ${row.contract}.`);
    if(px)lines.push(`Цена HTX в снимке: ${px} USDT.`);
    lines.push(...displayFutureLiquidations(liq),...displayCoinLobsterHint(liq.future_hint));
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
export function formatStandaloneLiquidationSourceLines(liq){
 const info=nativeLiquidationSources(liq);
 if(!info.present)return [];
 if(info.kind!=='NESTED')return nativeLiquidationLines(liq,{manual:true})||[];
 const lines=[];
 for(const context of info.contexts){
  const scoped=context.schema==='NATIVE_LIQUIDATION_CONTEXT_V1'?{native_extension:context}:{independent_extensions:[context]};
  const segment=nativeLiquidationLines(scoped,{manual:true})||[];
  for(const line of segment.filter(value=>!value.startsWith('Это уровни указанных площадок'))){
   if(context.provider!=='0xArchive'){lines.push(line);continue;}
   lines.push(line.replace(/^Hyperliquid ([A-Z0-9]+)(?=[, —])/, '0xArchive $1 (оценочные зоны Hyperliquid)')
    .replace(/; ([\d,.]+) (USD|USDT|USDC)(?=\.|,)/g,'; оценочный объём $1 $2'));
  }
 }
 if(lines.length)lines.push('Это уровни указанных площадок из ограниченной выборки; как цели на HTX отдельно не подтверждены.');
 return lines;
}
export default {MANUAL_RUN_SUMMARY_VERSION,classifyCanonicalRunCompletion,enforceManualBlockCoverage,formatManualRunSummary,formatLiquidationRunSummary};
