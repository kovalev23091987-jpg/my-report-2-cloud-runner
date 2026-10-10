// Original retained evidence census. Five-minute snapshots and Binance cold
// prices must never be relabelled as HTX native 1m or an actual ENTRY.
const DAY=86400000,sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const fail=reason=>({status:'NOT_CLOSED',reason,project_complete:false,all102_30_90day_history:false,actual_ENTRY:false});
export function auditRetainedHtxHistoryCoverage({universe,sampled,native,binance}={}) {
 if(universe?.status!=='CLOSED'||universe.assets?.length!==102||universe.contracts?.length!==119||universe.catalog_families?.length!==3||!Number.isSafeInteger(universe.observed_ts))return fail('APPROVED_UNIVERSE_REQUIRED');
 const assets=universe.assets.map(x=>x.asset_analysis_contract);
 if(assets.some(x=>typeof x!=='string'||!x.endsWith('-USDT'))||new Set(assets).size!==102)return fail('UNIQUE_ANALYSIS_CONTRACTS_REQUIRED');
 if(sampled?.status!=='ALL102_APPROVED_ANALYSIS_CONTRACTS_ORIGINAL24H_READER_CLOSED'||sampled.contracts!==102||sampled.total_points!==29376||sampled.original_rows!==1734||sampled.source_cloud_run!==37865298193||sampled.original_end_ts-sampled.original_start_ts!==DAY||sampled.approved_universe?.original_observed_ts!==universe.observed_ts||sampled.results?.length!==102)return fail('EXACT_102_ORIGINAL_REPLAY_REQUIRED');
 const byContract=new Map();
 for(const row of sampled.results){
  if(!assets.includes(row.contract)||byContract.has(row.contract)||row.status!=='CLOSED'||row.points!==288||!sha(row.points_sha256)||!Number.isSafeInteger(row.first_ts)||!Number.isSafeInteger(row.last_ts)||row.first_ts<sampled.original_start_ts||row.last_ts>=sampled.original_end_ts||row.last_ts<=row.first_ts)return fail('ORIGINAL_102_SAMPLE_RECEIPT_REQUIRED');
  byContract.set(row.contract,row);
 }
 const n=native?.prices;
 if(native?.status!=='EXACT_ORIGINAL_NATIVE_MINUTE_PRICE_AND_CURRENT_HORIZON_CONSUMERS_VERIFIED'||n?.contract!=='NEAR-USDT'||!assets.includes(n.contract)||n.all1440_unique_minutes_exact_OHLC_native_API_match!==true||n.event_interval?.length!==2||n.event_interval[1]-n.event_interval[0]!==DAY||!sha(n.archive_sha256)||!Number.isSafeInteger(n.source_ts)||!Number.isSafeInteger(n.qualified_at)||n.source_ts>n.qualified_at)return fail('EXACT_ONE_DAY_NATIVE_HTX_PRICE_REQUIRED');
 if(binance?.status!=='EXACT_ORIGINAL_TWO_VENUE_92DAY_PRICES_AND_CURRENT_CONSUMERS_VERIFIED'||binance.actual_symbol!=='BTCUSDT'||binance.all102_30_90day_event_trade_history_complete!==false)return fail('SEPARATE_CROSS_VENUE_HISTORY_REQUIRED');
 const rows=assets.sort().map(contract=>{
  const s=byContract.get(contract),near=contract===n.contract;
  return {contract,sampled_price_24h:{status:'CLOSED_5MIN_SAMPLED_PRICE_ONLY',points:288,points_sha256:s.points_sha256,first_ts:s.first_ts,last_ts:s.last_ts,source_run:sampled.source_cloud_run},native_htx_1m:{qualified_minutes_in_retained_proofs:near?1440:0,qualified_day:near?n.event_interval:null,archive_sha256:near?n.archive_sha256:null,zero_means_not_proven_not_provider_absence:true},complete_30d_native:false,complete_90d_native:false};
 });
 return {schema:'HTX_RETAINED_102_FACTUAL_HISTORY_GAP_CENSUS_V1',status:'PARTIAL_VERIFIED_RETAINED_EVIDENCE_ONLY',universe:{observed_ts:universe.observed_ts,contracts:119,assets:102,families:3},sampled_24h:{source_run:sampled.source_cloud_run,start_ts:sampled.original_start_ts,end_ts:sampled.original_end_ts,assets_with_288_samples:102,points:29376,role:'FIVE_MINUTE_SAMPLED_PRICE_ONLY'},native_htx_1m:{asset:n.contract,verified_archive_days:1,qualified_minutes:1440,event_interval:n.event_interval,source_ts:n.source_ts,qualified_at:n.qualified_at},separate_binance:{symbol:binance.actual_symbol,venue:'BINANCE',counted_as_htx_native_minutes:0},verified_30d_complete_assets:0,verified_90d_complete_assets:0,coverage_basis:'ORIGINAL_RETAINED_PROOFS_ONLY_NOT_PROVIDER_GLOBAL_ABSENCE',rows,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,actual_ENTRY:false,all102_30_90day_history:false,project_complete:false};
}
