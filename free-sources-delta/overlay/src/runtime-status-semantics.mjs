export const RUNTIME_STATUS_SEMANTICS_VERSION='runtime-status-semantics-v1-20260925';
export const DATA_STATUSES=Object.freeze(['CLOSED','NOT_APPLICABLE','NOT_CONFIGURED','BUDGET_EXHAUSTED','SOURCE_EXHAUSTED','CROSS_VENUE_DIVERGENCE','UNSUPPORTED','STALE','RATE_LIMITED','TIMEOUT','UNKNOWN']);
export function semanticMissing(status){
  const s=String(status??'UNKNOWN').toUpperCase();
  return {status:s,value:null,is_zero:false,is_current:s==='CLOSED',check_complete:['CLOSED','NOT_APPLICABLE','SOURCE_EXHAUSTED','UNSUPPORTED'].includes(s),safe_to_treat_as_absent:s==='SOURCE_EXHAUSTED'||s==='NOT_APPLICABLE',message:s==='BUDGET_EXHAUSTED'?'ПРОВЕРКА НЕ ЗАВЕРШЕНА: ИСЧЕРПАН БЮДЖЕТ':s==='NOT_CONFIGURED'?'ИСТОЧНИК НЕ НАСТРОЕН В ЭТОМ ЗАПУСКЕ':s==='CROSS_VENUE_DIVERGENCE'?'ДАННЫЕ БИРЖ РАСХОДЯТСЯ':null};
}
