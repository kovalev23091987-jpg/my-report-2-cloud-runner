export const OUTPUT_SURFACE_CONTRACT_VERSION='output-surface-contract-v1-20260925';

const arr=v=>Array.isArray(v)?v:[];
const text=v=>v===null||v===undefined?'':String(v);
const INTERNAL_TERMS=/\b(?:LONG|SHORT|OI|Funding|Spot flow|Spread|Slippage|Data Quality|Source receipts|hard gates)\b|\b[A-Z]{2,}_[A-Z0-9_]{2,}\b/i;

function hasSourceUnavailableBlocker(canonical){
  const f=canonical?.free_sources?.entry_funnel;
  const codes=[
    ...arr(f?.blockers),
    ...arr(f?.blocker_details).map(x=>x?.code),
  ].filter(Boolean);
  return codes.includes('SOURCE_TOOL_UNAVAILABLE');
}
function earlyItems(canonical){
  return arr(canonical?.early_candidate?.items);
}
function scoreLabels(output){
  return ['Общая оценка:','Монета интересна:','Готовность ко входу:'].every(x=>text(output).includes(x));
}
function noInternalLeak(output){
  return !INTERNAL_TERMS.test(text(output));
}
export function buildOutputSurfaceContract({canonical,telegram,manual}={}){
  const tg=text(telegram?.message),mn=text(manual?.text);
  const early=earlyItems(canonical);
  const unavailable=hasSourceUnavailableBlocker(canonical);
  const state=text(canonical?.state);
  const serious=Boolean(canonical?.metadata?.serious_risk_or_conflict);
  const expectedLimit=state==='WAIT_FOR_TRIGGER'&&!serious?850:state.startsWith('ENTRY_NOW_')?1100:1600;
  const checks={
    canonical_closed:canonical?.status==='CLOSED',
    telegram_ok:telegram?.ok===true,
    manual_ok:manual?.ok===true,
    same_fingerprint:Boolean(canonical?.analytical_fingerprint)&&telegram?.analytical_fingerprint===canonical.analytical_fingerprint&&manual?.analytical_fingerprint===canonical.analytical_fingerprint,
    different_formatters:telegram?.formatter!==manual?.formatter&&tg!==mn,
    snapshot_time_in_telegram:Boolean(canonical?.snapshot_time_utc)&&tg.includes(canonical.snapshot_time_utc),
    snapshot_time_in_manual:Boolean(canonical?.snapshot_time_utc)&&mn.includes(canonical.snapshot_time_utc),
    score_labels_telegram:scoreLabels(tg),
    score_labels_manual:scoreLabels(mn),
    telegram_length_closed:telegram?.length===tg.length&&tg.length<=expectedLimit&&telegram?.max_length===expectedLimit,
    manual_early_section:mn.includes('РАННИЕ КАНДИДАТЫ ДО ДВИЖЕНИЯ'),
    manual_empty_early_summary:early.length>0||mn.includes('Подтверждённых ранних кандидатов нет.'),
    telegram_early_candidate:early.length===0||tg.includes('Ранний кандидат:'),
    manual_source_unavailable_phrase:!unavailable||mn.includes('ИСТОЧНИК НЕДОСТУПЕН В ЭТОМ ЗАПУСКЕ'),
    telegram_no_internal_terms:noInternalLeak(tg),
    manual_no_internal_terms:noInternalLeak(mn),
  };
  const failed=Object.entries(checks).filter(([,v])=>v!==true).map(([k])=>k);
  return{
    version:OUTPUT_SURFACE_CONTRACT_VERSION,
    status:failed.length?'NOT_CLOSED':'CLOSED',
    checks,
    failed,
    snapshot_id:canonical?.snapshot_id??null,
    run_id:canonical?.run_id??null,
    snapshot_time_utc:canonical?.snapshot_time_utc??null,
    analytical_fingerprint:canonical?.analytical_fingerprint??null,
    telegram_length:tg.length,
    telegram_max_length:expectedLimit,
    early_candidate_count:early.length,
    source_unavailable_required:unavailable,
    one_canonical_result_two_formatters:true,
    telegram_network_send:false,
    manual_and_telegram_are_distinct_surfaces:true,
  };
}
export default{OUTPUT_SURFACE_CONTRACT_VERSION,buildOutputSurfaceContract};
