export function formatSavedStatisticsInterpretation(body){
  const result=body?.result??body,a=result?.audit??null;
  return {schema:'pump-saved-statistics-interpretation-v1',status:a?'SUPPLIED_SAVED_PRICE_EVENT_AUDIT':'AUDIT_NOT_AVAILABLE',
    capsule_reader_set:result?.capsule_reader_set??a?.feature_schema_version??null,
    feature_schema_versions:a?.feature_schema_versions??[],labels:(a?.waves??[]).map(w=>({wave_key:w.wave_key,label:w.first_resolved_label?.status??'UNKNOWN'})),
    event:'PRICE_PLUS_10_PERCENT_WITHIN_FOUR_HOURS_FROM_ORIGINAL_T0_P0',hit_is_price_event_only:true,
    orders_or_executions_proven:false,user_profit:null,realized_pnl:null,strategy_profitability:null,probability_pct:null,publication_allowed:false};
}
