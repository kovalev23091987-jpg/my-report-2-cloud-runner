export const SUPPLEMENTAL_SOURCE_POLICY_VERSION = 'supplemental-source-policy-v1-20260927';

export const SCHEDULED_RUNS_PER_DAY = 72;
export const MANUAL_REPORT_RUNS_PER_DAY = 3;
export const MANUAL_COIN_ANALYSIS_RUNS_PER_DAY = 5;
export const MANUAL_RUNS_PER_DAY = MANUAL_REPORT_RUNS_PER_DAY + MANUAL_COIN_ANALYSIS_RUNS_PER_DAY;
export const MAX_DAYS_PER_MONTH = 31;
export const MAX_MONTHLY_DEEP_CHECKS =
  (SCHEDULED_RUNS_PER_DAY + MANUAL_RUNS_PER_DAY) * MAX_DAYS_PER_MONTH;

// The existing hot path uses 44 of its 50 external-request envelope.  All
// projected and cross-exchange additions share one five-request rotating lane.
// The sixth request remains an error/retry reserve, not usable capacity.
export const EXISTING_HOT_REQUESTS = 44;
export const HOT_REQUEST_LIMIT = 50;
export const SUPPLEMENTAL_LANE_MAX_REQUESTS = 5;

// New caches add only bounded row operations. DDL is idempotent and does not
// modify rows after the tables exist. The values below deliberately include
// the optional one-time 0xArchive authentication check in a manual run.
export const SUPPLEMENTAL_D1_WORST_PER_RUN = Object.freeze({
  rows_read: 20,
  rows_written: 20,
});
export const D1_BURST_RESERVATION = Object.freeze({
  rows_read: 34_000,
  rows_written: 560,
});

const source = (id, config) => Object.freeze({ id, ...config });

export const SUPPLEMENTAL_SOURCES = Object.freeze({
  LIGHTER: source('LIGHTER', {
    disposition: 'ROTATING_DEEP_CHECK',
    unique_value: 'NATIVE_LIQUIDATION_PRICES_AND_ACTIVE_ACCOUNT_DISCOVERY',
    calls_per_assigned_run: 4,
    catalog_calls_per_day: 1,
    rotation_share: 0.25,
    provider_rate_per_minute: 60,
    provider_monthly_quota: null,
    requires_secret: false,
    decision_role: 'PROJECTED_LIQUIDATION_VALIDATION',
  }),
  GMX: source('GMX', {
    disposition: 'ROTATING_DEEP_CHECK',
    unique_value: 'ONCHAIN_FEE_AWARE_LIQUIDATION_PRICE_SAMPLE',
    calls_per_assigned_run: 4,
    catalog_calls_per_day: 1,
    rotation_share: 0.25,
    provider_rate_per_minute: 4,
    provider_monthly_quota: null,
    requires_secret: false,
    decision_role: 'PROJECTED_LIQUIDATION_VALIDATION',
  }),
  GTRADE: source('GTRADE', {
    disposition: 'ROTATING_DEEP_CHECK',
    unique_value: 'BATCH_OPEN_POSITIONS_WITH_DYNAMIC_FEES',
    calls_per_assigned_run: 3,
    rotation_share: 0.25,
    provider_rate_per_minute: 6,
    provider_monthly_quota: null,
    requires_secret: false,
    decision_role: 'PROJECTED_LIQUIDATION_VALIDATION',
  }),
  LIQFLOW_HL_NATIVE: source('LIQFLOW_HL_NATIVE', {
    disposition: 'ROTATING_DEEP_CHECK_PUBLIC_PILOT_THEN_SECRET',
    unique_value: 'ACCOUNT_DISCOVERY_THEN_NATIVE_HYPERLIQUID_RECHECK',
    calls_per_assigned_run: 5,
    rotation_share: 0.25,
    provider_rate_per_minute: 6,
    provider_monthly_quota: 50_000,
    requires_secret_after_utc: '2026-10-27T00:00:00Z',
    decision_role: 'PROJECTED_LIQUIDATION_VALIDATION',
  }),
  OXARCHIVE: source('OXARCHIVE', {
    disposition: 'AUTHENTICATED_BOUNDED_ROTATING_LIQUIDATION_SOURCE',
    unique_value: 'ALTERNATIVE_HYPERLIQUID_BUCKET_HISTORY',
    calls_per_probe: 1,
    calls_per_assigned_run: 1,
    credits_per_assigned_run: 1,
    module_monthly_credit_cap: 5000,
    rotation_share_when_configured: 0.25,
    provider_rate_per_second: 15,
    provider_monthly_quota: 50_000,
    requires_secret: true,
    blocker: 'API_KEY_REQUIRED',
    decision_role: 'PROJECTED_LIQUIDATION_CROSSCHECK',
  }),
  DEX_PAIR: source('DEX_PAIR', {
    disposition: 'CACHED_EXACT_IDENTITY_ONLY',
    unique_value: 'DEX_VOLUME_LIQUIDITY_AND_BUY_SELL_ACTIVITY',
    calls_per_refresh: 2,
    ttl_hours: 1,
    max_refreshes_per_day: 24,
    provider_rate_per_minute: 30,
    provider_monthly_quota: null,
    requires_secret: false,
    requires_exact_contract_identity: true,
    providers: ['DEX Screener', 'GeckoTerminal'],
    decision_role: 'EARLY_ACTIVITY_CONTEXT',
  }),
  DEFILLAMA: source('DEFILLAMA', {
    disposition: 'CACHED_PROTOCOL_CONTEXT',
    unique_value: 'PROTOCOL_TVL_FEES_AND_VOLUME_CONTEXT',
    calls_per_refresh: 1,
    ttl_hours: 6,
    max_refreshes_per_day: 4,
    provider_rate_per_minute: null,
    provider_monthly_quota: null,
    requires_secret: false,
    requires_exact_protocol_identity: true,
    decision_role: 'SUPPORTING_CONTEXT',
  }),
  GOPLUS: source('GOPLUS', {
    disposition: 'CACHED_EXACT_IDENTITY_ONLY',
    unique_value: 'TOKEN_CONTRACT_SECURITY_RISKS',
    calls_per_refresh: 1,
    ttl_hours: 24,
    max_refreshes_per_day: 1,
    provider_rate_per_minute: 30,
    provider_monthly_quota: null,
    requires_secret: false,
    requires_exact_contract_identity: true,
    decision_role: 'SUPPORTING_RISK',
  }),
  SOLANA_RPC: source('SOLANA_RPC', {
    disposition: 'CACHED_VERIFIED_MINT_ONLY',
    unique_value: 'RECENT_ONCHAIN_TRANSFERS_AND_SUPPORTED_DEX_ACTIONS',
    calls_per_refresh: 3,
    ttl_hours: 1,
    max_refreshes_per_day: 8,
    provider_rate_per_ten_seconds: 40,
    provider_monthly_quota: null,
    requires_secret: false,
    requires_exact_contract_identity: true,
    decision_role: 'ONCHAIN_CONTEXT',
  }),
  BITGET: source('BITGET', {
    disposition: 'CONDITIONAL_CROSS_VENUE_FALLBACK',
    unique_value: 'INDEPENDENT_FUTURES_VENUE_WHEN_EXISTING_VENUES_HAVE_GAPS',
    calls_per_assigned_run: 3,
    rotation_share: 0,
    provider_rate_per_second: 5,
    provider_monthly_quota: null,
    requires_secret: false,
    condition: 'FEWER_THAN_TWO_CURRENT_DERIVATIVES_VENUES_OR_CRITICAL_CONFLICT',
    decision_role: 'DERIVATIVES_FALLBACK',
  }),
  COINBASE: source('COINBASE', {
    disposition: 'CONDITIONAL_SUPPORTED_SPOT_ONLY',
    unique_value: 'INDEPENDENT_REGULATED_SPOT_PRICE_VOLUME_AND_BOOK',
    calls_per_assigned_run: 2,
    observed_htx_overlap: 0.1671,
    provider_monthly_quota: null,
    requires_secret: false,
    decision_role: 'SPOT_VALIDATION',
  }),
  DERIBIT: source('DERIBIT', {
    disposition: 'GLOBAL_HOURLY_CACHE',
    unique_value: 'BTC_ETH_DVOL_OPTIONS_SKEW_AND_MARKET_RISK_BACKGROUND',
    calls_per_refresh: 4,
    ttl_hours: 1,
    max_refreshes_per_day: 24,
    provider_rate_per_second: 1,
    provider_monthly_quota: null,
    requires_secret: false,
    decision_role: 'MARKET_RISK_BACKGROUND',
    directional_vote: false,
  }),
  COINLOBSTER: source('COINLOBSTER', {
    disposition: 'KEYLESS_GLOBAL_30_MINUTE_CACHE',
    unique_value: 'CROSS_EXCHANGE_WHALE_FLOW_AND_REALIZED_LIQUIDATION_VALIDATION',
    calls_per_refresh: 2,
    ttl_hours: 0.5,
    max_refreshes_per_day: 48,
    provider_monthly_quota: null,
    provider_rate_limit: 'PUBLIC_IP_LIMIT_NOT_NUMERICALLY_PUBLISHED',
    requires_secret: false,
    paid_calls_require_secret: true,
    paid_credit_cost_per_call: { min: 10, max: 50 },
    free_key_monthly_credits: 250,
    decision_role: 'WHALE_FLOW_AND_REALIZED_LIQUIDATION_CROSSCHECK',
    directional_vote: false,
  }),
  CROSS_EXCHANGE_DEPTH: source('CROSS_EXCHANGE_DEPTH', {
    disposition: 'SHARED_ROTATING_DEEP_CHECK',
    unique_value: 'INDEPENDENT_1_2_5_PERCENT_BOOK_DEPTH_AND_25000_USD_SLIPPAGE',
    calls_per_assigned_run: 3,
    rotation_share: 1/9,
    provider_monthly_quota: null,
    requires_secret: false,
    decision_role: 'CROSS_EXCHANGE_LIQUIDITY_VALIDATION',
  }),
  CROSS_EXCHANGE_REALIZED: source('CROSS_EXCHANGE_REALIZED', {
    disposition: 'SHARED_ROTATING_DEEP_CHECK',
    unique_value: 'PUBLIC_LIVE_FORCED_LIQUIDATION_EVENTS',
    calls_per_assigned_run: 3,
    rotation_share: 1/9,
    provider_monthly_quota: null,
    requires_secret: false,
    decision_role: 'REALIZED_LIQUIDATION_VALIDATION',
  }),
  COINALYZE: source('COINALYZE', {
    disposition: 'SHARED_ROTATING_CACHED_HISTORY',
    unique_value: 'RECENT_LIQUIDATIONS_VERSUS_TWO_HOUR_CROSS_VENUE_BASELINE',
    calls_per_assigned_run: 1,
    provider_units_per_assigned_run: 4,
    provider_rate_per_minute: 40,
    rotation_share: 1/9,
    provider_monthly_quota: null,
    requires_secret: true,
    blocker: 'API_KEY_REQUIRED',
    decision_role: 'HISTORICAL_LIQUIDATION_BASELINE',
  }),
});

// One primary responsibility per source. Secondary fields may corroborate a
// fact, but cannot create another score contribution from the same data family.
export const SOURCE_RESPONSIBILITY_GROUPS=Object.freeze({
  PROJECTED_LIQUIDATIONS:Object.freeze({
    sources:['LIGHTER','GMX','GTRADE','LIQFLOW_HL_NATIVE','OXARCHIVE'],
    primary_output:'VERIFIED_LIQUIDATION_ZONES',
    merge_rule:'KEEP_PROVIDER_PROVENANCE_NEVER_SUM_ACROSS_MODELS',
  }),
  DEX_ACTIVITY:Object.freeze({
    sources:['DEX_SCREENER','GECKOTERMINAL','SOLANA_RPC'],
    primary_output:'ONCHAIN_ACTIVITY_AND_LIQUIDITY',
    merge_rule:'EXACT_CONTRACT_IDENTITY_AND_SAME_POOL_DEDUPLICATION',
  }),
  PROTOCOL_AND_TOKEN_RISK:Object.freeze({
    sources:['DEFILLAMA','GOPLUS'],
    primary_output:'PROTOCOL_HEALTH_AND_CONTRACT_RISK',
    merge_rule:'RISK_CONTEXT_ONLY_NO_DIRECTIONAL_VOTE',
  }),
  INDEPENDENT_MARKET_VALIDATION:Object.freeze({
    sources:['BITGET','COINBASE'],
    primary_output:'FUTURES_OR_SPOT_CONFLICT_CHECK',
    merge_rule:'CONDITIONAL_ONLY_WHEN_PRIMARY_VENUES_ARE_MISSING_OR_CONFLICT',
  }),
  GLOBAL_MARKET_REGIME:Object.freeze({
    sources:['DERIBIT'],
    primary_output:'BTC_ETH_VOLATILITY_AND_OPTIONS_REGIME',
    merge_rule:'GLOBAL_BACKGROUND_NEVER_AN_ALTCOIN_DIRECTIONAL_VOTE',
  }),
  CROSS_EXCHANGE_WHALE_FLOW:Object.freeze({
    sources:['COINLOBSTER'],
    primary_output:'WHALE_ANOMALY_AND_REALIZED_LIQUIDATION_CROSSCHECK',
    merge_rule:'AGGREGATOR_IS_ONE_FAMILY_NOT_ONE_VOTE_PER_UNDERLYING_EXCHANGE',
  }),
  CROSS_EXCHANGE_LIQUIDITY:Object.freeze({
    sources:['CROSS_EXCHANGE_DEPTH'],
    primary_output:'ORDER_BOOK_DEPTH_AND_SLIPPAGE',
    merge_rule:'VENUE_NOTIONALS_STAY_SEPARATE_ONLY_NORMALIZED_IMBALANCE_IS_AVERAGED',
  }),
  REALIZED_LIQUIDATION_LIVE:Object.freeze({
    sources:['CROSS_EXCHANGE_REALIZED'],
    primary_output:'LIVE_FORCED_LIQUIDATION_IMBALANCE',
    merge_rule:'EXACT_FUTURES_SYMBOLS_ONE_COMBINED_FAMILY',
  }),
  HISTORICAL_LIQUIDATION_BASELINE:Object.freeze({
    sources:['COINALYZE'],
    primary_output:'RECENT_VERSUS_PRIOR_LIQUIDATION_INTENSITY',
    merge_rule:'AGGREGATED_HISTORY_IS_ONE_FAMILY_NOT_EXTRA_VOTES_PER_EXCHANGE',
  }),
});

export function responsibilityForSource(sourceId){
  if(sourceId==='DEX_PAIR')sourceId='DEX_SCREENER';
  for(const [group,config] of Object.entries(SOURCE_RESPONSIBILITY_GROUPS))if(config.sources.includes(sourceId))return {group,...config};
  return null;
}

export function policyForSource(sourceId){
  if(sourceId==='DEX_SCREENER'||sourceId==='GECKOTERMINAL')return SUPPLEMENTAL_SOURCES.DEX_PAIR;
  return SUPPLEMENTAL_SOURCES[sourceId]??null;
}

export function dedupeSupplementalFacts(rows=[]){
  const out=[],seen=new Set();
  for(const row of Array.isArray(rows)?rows:[]){
    const sourceId=String(row?.source_id||row?.source||'').toUpperCase();
    const responsibility=responsibilityForSource(sourceId);if(!responsibility)continue;
    const identity=String(row?.asset_identity||row?.contract||row?.symbol||'GLOBAL').toUpperCase();
    const metric=String(row?.metric_family||row?.metric||responsibility.primary_output).toUpperCase();
    const providerObject=String(row?.provider_object_id||row?.pool_key||row?.position_key||'SUMMARY');
    const key=`${responsibility.group}|${identity}|${metric}|${providerObject}`;
    if(seen.has(key))continue;seen.add(key);out.push({...row,responsibility_group:responsibility.group,dedupe_key:key});
  }
  return out;
}

export function monthlyDeepCheckCalls({ calls_per_assigned_run, rotation_share = 1 } = {}) {
  const calls = Number(calls_per_assigned_run);
  const share = Number(rotation_share);
  if (!Number.isFinite(calls) || calls < 0 || !Number.isFinite(share) || share < 0 || share > 1) return null;
  return Math.ceil(MAX_MONTHLY_DEEP_CHECKS * share) * calls;
}

export function monthlyCacheCalls({ calls_per_refresh, max_refreshes_per_day } = {}) {
  const calls = Number(calls_per_refresh), refreshes = Number(max_refreshes_per_day);
  if (!Number.isFinite(calls) || calls < 0 || !Number.isFinite(refreshes) || refreshes < 0) return null;
  return calls * refreshes * MAX_DAYS_PER_MONTH;
}

export function paidCoinLobsterMonthlyCredits({ callsPerReport = 0, creditsPerCall = 50 } = {}) {
  const calls = Number(callsPerReport), credits = Number(creditsPerCall);
  if (!Number.isFinite(calls) || calls < 0 || !Number.isFinite(credits) || credits < 0) return null;
  return Math.ceil(MAX_MONTHLY_DEEP_CHECKS * calls * credits);
}

export function sourceBudgetView() {
  const rows = Object.values(SUPPLEMENTAL_SOURCES).map(s => {
    const baseWorst = s.calls_per_assigned_run !== undefined
      ? monthlyDeepCheckCalls(s)
      : monthlyCacheCalls(s);
    const worst=baseWorst+Number(s.catalog_calls_per_day||0)*MAX_DAYS_PER_MONTH;
    const quotaHeadroom = Number.isFinite(s.provider_monthly_quota)
      ? s.provider_monthly_quota - worst
      : null;
    return {
      ...s,
      worst_case_monthly_calls: worst,
      provider_quota_headroom: quotaHeadroom,
      within_known_monthly_quota: quotaHeadroom === null ? null : quotaHeadroom >= 0,
    };
  });
  return {
    version: SUPPLEMENTAL_SOURCE_POLICY_VERSION,
    max_monthly_deep_checks: MAX_MONTHLY_DEEP_CHECKS,
    hot_request_budget: {
      existing: EXISTING_HOT_REQUESTS,
      supplemental_lane_max: SUPPLEMENTAL_LANE_MAX_REQUESTS,
      reserve: HOT_REQUEST_LIMIT - EXISTING_HOT_REQUESTS - SUPPLEMENTAL_LANE_MAX_REQUESTS,
      limit: HOT_REQUEST_LIMIT,
    },
    d1_incremental_budget: {
      ...SUPPLEMENTAL_D1_WORST_PER_RUN,
      projected_daily_rows_read: SUPPLEMENTAL_D1_WORST_PER_RUN.rows_read * (SCHEDULED_RUNS_PER_DAY + MANUAL_RUNS_PER_DAY),
      projected_daily_rows_written: SUPPLEMENTAL_D1_WORST_PER_RUN.rows_written * (SCHEDULED_RUNS_PER_DAY + MANUAL_RUNS_PER_DAY),
      burst_reservation: D1_BURST_RESERVATION,
    },
    rows,
  };
}

export function rotatingLane(runNumber, { liqflowAvailable = false, liqflowKeyConfigured = false } = {}) {
  const lanes = ['LIGHTER', 'GMX', 'GTRADE', liqflowAvailable||liqflowKeyConfigured ? 'LIQFLOW_HL_NATIVE' : 'LIGHTER'];
  const n = Number(runNumber);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return lanes[n % lanes.length];
}

export function validateSupplementalRequest({ source_id, request_count, exact_identity = false, condition_closed = false, secret_configured = false } = {}) {
  const s = SUPPLEMENTAL_SOURCES[source_id];
  if (!s) return { allowed: false, reason: 'SOURCE_NOT_REGISTERED' };
  if(s.requires_secret===true&&secret_configured!==true)return {allowed:false,reason:s.blocker||'SOURCE_SECRET_REQUIRED'};
  const count = Number(request_count);
  const max = Number(s.calls_per_assigned_run ?? s.calls_per_refresh ?? 0);
  if (!Number.isSafeInteger(count) || count < 1 || count > max || count > SUPPLEMENTAL_LANE_MAX_REQUESTS) {
    return { allowed: false, reason: 'SOURCE_REQUEST_BUDGET_EXCEEDED' };
  }
  if ((s.requires_exact_contract_identity || s.requires_exact_protocol_identity) && exact_identity !== true) {
    return { allowed: false, reason: 'EXACT_ASSET_IDENTITY_REQUIRED' };
  }
  if (s.condition && condition_closed !== true) return { allowed: false, reason: 'SOURCE_CONDITION_NOT_CLOSED' };
  return { allowed: true, reason: 'ADMITTED', source: s };
}

export default {
  SUPPLEMENTAL_SOURCE_POLICY_VERSION,
  SUPPLEMENTAL_SOURCES,
  SOURCE_RESPONSIBILITY_GROUPS,
  sourceBudgetView,
  rotatingLane,
  validateSupplementalRequest,
  responsibilityForSource,
  policyForSource,
  dedupeSupplementalFacts,
};
