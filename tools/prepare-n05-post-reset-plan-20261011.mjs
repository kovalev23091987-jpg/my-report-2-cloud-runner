import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Offline only. This is a deterministic allocation over retained, historical
// exact routes. It neither calls a provider nor qualifies a live window.
const sourcePath='checkpoints/N05_CURRENT104_SOURCE_COVERAGE_MAP_POST_LINK_PEPE_20261011.json';
const bytes=readFileSync(sourcePath);
const map=JSON.parse(bytes);
const rows=new Map(map.rows.map(row=>[row.symbol,row]));
const routeFile=JSON.parse(readFileSync('checkpoints/N05_104_EXACT_SOURCE_ROUTES_20261010.json'));
const routeRows=new Map(routeFile.rows.map(row=>[row.symbol,row]));
const assigned={
  POLONIEX:['币安人生','APR','BEAT','龙虾','ACE','ASTER','BOME','DOS','ETHFI','FARTCOIN','FLOKI','LIT','LSK'],
  BACKPACK:['PUMP','SKR','WLD','BONK','SHIB','WIF'],
  BITGET:['AVNT','BILL','OP','RIVER','ZKC','CT'],
  GATE:['MARSCOIN','OKB','MUBARAK','EUL','NIL','XAUT','牛来']
};
const max={POLONIEX:13,BACKPACK:7,BITGET:6,GATE:7};
if(rows.size!==104||map.rows.length!==104)throw Error('CURRENT104_MAP_REQUIRED');
const used=new Set();
for(const [venue,symbols] of Object.entries(assigned)){
  if(symbols.length>max[venue])throw Error(`${venue}_CAPACITY_EXCEEDED`);
  for(const symbol of symbols){
    const row=rows.get(symbol);
    if(!row)throw Error(`UNKNOWN_ASSET:${symbol}`);
    if(used.has(symbol))throw Error(`DUPLICATE_ASSIGNMENT:${symbol}`);
    if(row.actual_full_window_venue_count_ever!==0)throw Error(`ALREADY_FULL:${symbol}`);
    if(!row.structurally_candidate_venues_from_retained_catalogs.includes(venue))throw Error(`NO_EXACT_ROUTE:${venue}:${symbol}`);
    const route=routeRows.get(symbol);
    if(!route||route.identity_status!=='CLOSED'||route.prior_individual_full_window!==false||!route.identity)throw Error(`RETAINED_PRIMARY_IDENTITY_MISSING:${symbol}`);
    used.add(symbol);
  }
}
const full=map.rows.filter(row=>row.actual_full_window_venue_count_ever>0).map(row=>row.symbol);
const noRoute=map.rows.filter(row=>row.structural_candidate_venue_count===0).map(row=>row.symbol);
const routableUnfilled=map.rows.filter(row=>row.actual_full_window_venue_count_ever===0&&row.structural_candidate_venue_count>0).map(row=>row.symbol);
const unassigned=routableUnfilled.filter(symbol=>!used.has(symbol));
if(full.length!==39||noRoute.length!==28||routableUnfilled.length!==37||used.size!==32||unassigned.length!==5)throw Error('COVERAGE_BASELINE_CHANGED_REPLAN_REQUIRED');
const plan={
  schema:'N05_POST_LINK_PEPE_OFFLINE_RESET_READY_20261011_V1',
  phase:'N05_ONLY',status:'OFFLINE_PREPARATION;NO_NEW_PROVIDER_DATA',
  basis_main:'ac8f22d62cccd58270e5548785262f852c16e972',
  coverage_map:sourcePath,coverage_map_sha256:createHash('sha256').update(bytes).digest('hex'),
  approved_assets:104,
  baseline:{full_240m_ever:39,one_venue_ever:37,two_venues_ever:2,no_full_240m:65,exact_external_route:76,no_exact_external_route:28,routable_without_full:37,simultaneous_fresh_cross_venue_agreement_proven:false,live_same_run_report_or_telegram_new_data_proven:false},
  after_utc_reset:'2026-10-12T00:00:00Z',
  tentative_first_full_window_assignment:{
    ...assigned,
    assigned_unique_assets:used.size,
    unassigned_routable_assets:unassigned,
    optimistic_total_full_240m_ever_if_all_32_qualify:full.length+used.size,
    still_without_full_240m_even_if_all_32_qualify:104-full.length-used.size,
    note:'Historical exact route and source capacity are planning bounds, not current market availability, complete data, or report use.'
  },
  subsequent_day_if_five_remain_unqualified:{POLONIEX:unassigned,minimum_HTTP_with_shared_metadata:3+unassigned.length,conditional_on_fresh_primary_catalog_and_ledger:true},
  role_budget_assumptions:{
    POLONIEX:{daily_cap:16,shared_metadata_min:3,per_window_min:1,planned_windows:13,minimum_HTTP_if_all_qualify:16},
    BACKPACK:{daily_cap:16,shared_metadata_min:2,per_window_min:2,planned_windows:6,minimum_HTTP_if_one_trade_page_each:14,additional_trade_pages_may_reduce_capacity:true},
    BITGET:{daily_cap:16,shared_metadata_min:3,per_window_min:2,planned_windows:6,minimum_HTTP_if_one_trade_page_each:15,additional_trade_pages_may_reduce_capacity:true},
    GATE:{daily_cap:16,source_role_metadata_min:1,separate_asset_reference_min:1,per_window_min:2,planned_windows:7,minimum_total_HTTP_if_one_trade_page_each:16,separate_asset_reference_cap:8,additional_trade_pages_may_reduce_capacity:true},
    BITFINEX:{daily_cap:16,prior_day_last_verified_used:15,conditional_SHIB_window_HTTP:2,conditional_ALGO_XMR_same_window_HTTP:4},
    KRAKEN:{daily_cap:16,conditional_ALGO_XMR_same_window_HTTP_upper_bound:9}
  },
  next_independent_same_window_checks:[
    {assets:['ALGO','XMR'],venues:['KRAKEN','BITFINEX'],basis:'Both venues have distinct original full windows, but not the same current anchor; exact historical routes already retained.',conditional_planned_HTTP_if_one_trade_page_each:{KRAKEN:5,BITFINEX:4},Kraken_extra_trade_pages_may_require_up_to_4_more_HTTP:true},
    {assets:['SHIB'],venues:['BACKPACK','BITFINEX'],basis:'Backpack exact retained route; Bitfinex primary SHIB/ETH contract candidate from saved official identity, not yet actual 240m qualified.',conditional_minimum_HTTP:{BACKPACK:2,BITFINEX:2}}
  ],
  no_exact_route_assets:noRoute,
  excluded_as_not_yet_useful:{
    COINBASE:'Three exact original markets had candle/trade disagreement; do not retry unchanged pilot or count it.',
    GEMINI:'FIL had zero public trades in the tested window; HYPE network mismatch; do not count.',
    LIGHTER:'DASH trades/candles reconciled, but exact native cross-venue identity and production consumer remain unproven.',
    DYDX:'Retained BTC trade page covered less than 240 minutes; bounded complete pagination is unproven.',
    HYPERLIQUID:'Retained ten-trade page cannot establish full 240m directional flow.'
  },
  guarded_execution_after_reset:[
    'Re-read fresh main, phase, inactive fence and exact current N05 requirements; acquire and read back a new bounded own CAS lease.',
    'Read D1 source daily counters, in-flight reservations, rolling minute limits, caller five-request cap, whole-job 28 cap and 164HTTP/D1/manual reserve before any provider HTTP; recompute affordable batches from actual headroom. Do not reset or alias counters.',
    'Use one closed-minute anchor across sources when testing agreement. Split acquisitions into admitted jobs within 28 HTTP/job and preserve that anchor; do not silently combine different windows.',
    'Fetch each required current official identity/market catalog at most once per source role, compare exact asset identity and active market before requesting a window. Drop changed/unproven routes without spending their window budget.',
    'Acquire only planned missing windows, retain original body/hash/time and reconcile exactly 240 closed minutes with source-specific candle/trade volume and count semantics.',
    'Pass retained original facts through N05 consumer and canonical/manual/Telegram render checks in one collective verification. One venue may yield qualified informational context; disagreement remains separated; score and ENTRY unchanged.',
    'Update coverage map/status/phase/register/resume with exact run/head/artifact; release only owned lease. Do not claim N05 complete without actual requirement evidence or fresh natural SENT.'
  ],
  existing_caps_strategy_weights_format_unchanged:true,
  sourceHTTP_in_preparation:0,MAIN_in_preparation:0,Telegram_in_preparation:0,
  N05_complete:false,next_block_not_started:true
};
process.stdout.write(JSON.stringify(plan,null,2)+'\n');
