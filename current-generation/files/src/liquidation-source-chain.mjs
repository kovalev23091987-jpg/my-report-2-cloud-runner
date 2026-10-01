export const LIQUIDATION_FUTURE_CONNECTIONS=Object.freeze([
 'HTX_SOURCE_BACKED_MODEL',
 'HYPERLIQUID_NATIVE',
 'BYK_TRACKED_HL_BANDS',
 'LIGHTER_NATIVE',
 'GMX_NATIVE',
 'GTRADE_NATIVE',
 'BYKARANTELI_FUTURE_MAP',
 'COINLOBSTER_FUTURE_MODEL',
 'OXARCHIVE_HL_BUCKETS',
]);

export function buildLiquidationSourceChain({contract,risk={},native={},coverage={},coinlobster=null,byk_future=null,tracked_hl=null,future_models=null,htx_model=null,venue_registry=null,external_readiness={}}={}){
 const history=(risk.chain_attempts??[]).map(row=>({...row,role:'REALIZED_HISTORY',data_available:row.status==='CLOSED'||row.status==='PARTIAL'&&Boolean(risk.sources?.[row.source]?.partial_observation?.datapoints)}));
 const nativeRows=(native.routed??[]).filter(row=>row.contract===contract).map(row=>({source:row.lane,status:row.status,role:row.lane==='OXARCHIVE_HL_BUCKETS'?'PROJECTED_HYPERLIQUID_CONTEXT':'NATIVE_POSITION_CONTEXT',data_available:row.usable===true,network_calls:row.source_outcome?.attempted_http_count??null,reason:row.source_outcome?.failure_origin??null}));
 for(const [source,key] of [['LIGHTER_NATIVE','lighter_market_id'],['GMX_NATIVE','gmx_market_address']])if(!nativeRows.some(row=>row.source===source)){const receipt=venue_registry?.receipts?.find(row=>row.source===source.split('_')[0]);nativeRows.push({source,status:'NOT_ROUTED',role:'NATIVE_POSITION_CONTEXT',data_available:false,network_calls:0,reason:receipt?.status==='SOURCE_NOT_CLOSED'?'VENUE_CATALOG_NOT_CLOSED':`NO_EXACT_${key.toUpperCase()}`});}
 for(const source of ['GTRADE_NATIVE','HYPERLIQUID_NATIVE','OXARCHIVE_HL_BUCKETS'])if(!nativeRows.some(row=>row.source===source))nativeRows.push({source,status:source==='OXARCHIVE_HL_BUCKETS'&&native.oxarchive?.enabled===false?'DISABLED_CONFIGURATION':'NOT_RUN_HTTP_ENVELOPE',role:source==='OXARCHIVE_HL_BUCKETS'?'PROJECTED_HYPERLIQUID_CONTEXT':'NATIVE_POSITION_CONTEXT',network_calls:0,data_available:false});
 const cex=(coverage.receipts??[]).map(row=>({...row,role:'EXACT_MARKET_DISCOVERY',data_available:false}));
 const lobster={source:'COINLOBSTER',status:coinlobster?.status??'NOT_CLOSED',role:'REALIZED_VALIDATION',observed_event_count:coinlobster?.realized_liquidations?.length??0,data_available:coinlobster?.status==='CLOSED'&&Boolean(coinlobster?.realized_liquidations?.length),reason:coinlobster?.status==='CLOSED'&&!coinlobster?.realized_liquidations?.length?'NO_EXACT_MATCHING_EVENTS':null};
 const byk={source:'BYKARANTELI_FUTURE_MAP',role:'PROJECTED_PROVIDER_MODEL',status:byk_future?.projected_map_status??'NOT_RUN',data_available:byk_future?.projected_map_status==='CLOSED_SHADOW'&&Boolean(byk_future?.projected_clusters?.length),network_calls:byk_future?.source_health?.external_fetches??0,reason:byk_future?.errors?.join('; ')||null};
 const forward={source:'COINLOBSTER_FUTURE_MODEL',role:'PROJECTED_PROVIDER_MODEL',status:future_models?.status??'NOT_RUN',data_available:future_models?.status==='CLOSED'&&Boolean(future_models?.levels?.length),partial_future_hint_available:future_models?.status==='PARTIAL_FUTURE_HEADLINE_ONLY',network_calls:future_models?.network_calls??0,reason:future_models?.reason??null};
 const tracked={source:'BYK_TRACKED_HL_BANDS',role:'NATIVE_POSITION_CONTEXT',status:tracked_hl?.status??'NOT_RUN',data_available:tracked_hl?.data_available===true,network_calls:tracked_hl?.network_calls??0,upstream_family:'HYPERLIQUID',independent_of_other_hl_sources:false,entry_eligible:false,reason:tracked_hl?.source_error?.message??null};
 const own={source:'HTX_SOURCE_BACKED_MODEL',role:'CALCULATED_HTX_FALLBACK',status:htx_model?.status??'NOT_RUN',data_available:htx_model?.status==='CLOSED',network_calls:0,reason:htx_model?.reason??null,coverage:htx_model?.coverage??null};
 const evaluatedNotEnabled=[
  {source:'COINGLASS_LIQUIDATION_MAP',role:'PROJECTED_PROVIDER_MODEL',status:external_readiness?.coinglass??'NOT_CONFIGURED_API_KEY_AND_PROFESSIONAL_PLAN',data_available:false,network_calls:0,reason:'SUPPORTED_HTX_PAIR_CATALOG_MUST_BE_VERIFIED_BEFORE_ENABLEMENT'},
  {source:'HYBLOCK_LIQUIDATION_LEVELS',role:'PROJECTED_PROVIDER_MODEL',status:external_readiness?.hyblock??'HTX_COVERAGE_NOT_VERIFIED',data_available:false,network_calls:0,reason:'NO_PROVEN_EXACT_HTX_PAIR_CATALOG'},
  {source:'COINANK_LIQUIDATION_MAP',role:'PROJECTED_PROVIDER_MODEL',status:external_readiness?.coinank??'PROGRAMMATIC_API_NOT_VERIFIED',data_available:false,network_calls:0,reason:'TRIAL_AND_EXACT_PAIR_CATALOG_REQUIRED'},
 ];
 const bySource=new Map([...nativeRows,byk,tracked,forward,own].map(row=>[row.source,row]));
 const futureStages=LIQUIDATION_FUTURE_CONNECTIONS.map((source,index)=>({...bySource.get(source),source,fallback_rank:index+1,priority_class:'FUTURE_LEVEL'}));
 const secondaryHistoryStages=[...history,lobster,...cex].map(row=>({...row,priority_class:'SECONDARY_HISTORY_OR_COVERAGE'}));
 const order=[...futureStages,...secondaryHistoryStages],available=futureStages.filter(row=>row.data_available);
 return{schema:'report2-liquidation-source-chain-v3',contract,policy:'HTX_SOURCE_MODEL_BASELINE_THEN_EXACT_NATIVE_AND_PROVIDER_CROSSCHECKS;ADAPTIVE_FAILOVER_WITHOUT_SUMMING_OVERLAP',all_attempts_retained:true,unsupported_is_not_zero_liquidations:true,provider_count_is_not_data_count:true,configured_future_connection_count:LIQUIDATION_FUTURE_CONNECTIONS.length,configured_future_connections:[...LIQUIDATION_FUTURE_CONNECTIONS],stages:order,future_level_stages:futureStages,secondary_history_stages:secondaryHistoryStages,evaluated_not_enabled:evaluatedNotEnabled,useful_future_source_count:available.length,useful_history_source_count:secondaryHistoryStages.filter(row=>row.data_available&&/REALIZED/.test(row.role)).length,useful_source_count:order.filter(row=>row.data_available).length,htx_calculated_coverage:own.data_available,cross_source_comparison_available:available.length>=2,fallback_closed:available.length>0,history_cannot_close_future_map:true,unused_candidates_make_network_calls:false};
}
export function formatLiquidationChainSummary(chain){return chain?.stages?.length?[`Источники: числовая будущая карта — ${chain.useful_future_source_count??0}; данные истории — ${chain.useful_history_source_count??0}; причины отказов и пропусков сохранены по каждому этапу.`]:[];}
