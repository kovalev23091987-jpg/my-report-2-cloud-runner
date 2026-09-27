const text = value => typeof value === 'string' ? value.trim().normalize('NFC') : '';
const upper = value => text(value).toLocaleUpperCase('en-US');

export function parseHtxFuturesContract(contract) {
  const canonical = upper(contract);
  const match = canonical.match(/^([\p{L}\p{N}]+)-USDT$/u);
  if (!match) return { ok:false, status:'HTX_FUTURES_CONTRACT_INVALID', contract:canonical || null, base:null };
  return { ok:true, status:'HTX_FUTURES_CONTRACT_CLOSED', contract:canonical, base:match[1] };
}

const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

export function liquidationMapPriority({contract,move_pct=null,oi_delta_pct=null,funding_shift_abs=null,volume_spike_ratio=null,spot_flow_anomaly=false}={}) {
  const parsed = parseHtxFuturesContract(contract);
  if (!parsed.ok) return {eligible:false,priority:'INVALID',reason:parsed.status,no_upper_move_cap:true};
  if (['BTC','ETH'].includes(parsed.base)) return {eligible:false,priority:'SKIP_BTC_ETH',reason:'BTC_ETH_EXCLUDED_BY_USER_POLICY',no_upper_move_cap:true};
  const move = finite(move_pct), oi = finite(oi_delta_pct), funding = finite(funding_shift_abs), volume = finite(volume_spike_ratio);
  const urgentMove = move !== null && Math.abs(move) >= 5;
  const early = spot_flow_anomaly === true || (oi !== null && Math.abs(oi) >= 3) || (funding !== null && funding > 0) || (volume !== null && volume >= 2);
  return {
    eligible:true,
    priority:urgentMove?'URGENT_MOVE_5_PLUS_NO_CEILING':(early?'EARLY_PREMOVE_ANOMALY':'NORMAL_HTX_ALT'),
    reason:urgentMove?'ABS_MOVE_AT_LEAST_5_PERCENT':(early?'OI_FUNDING_VOLUME_OR_SPOT_ANOMALY':'HTX_FUTURES_EXCEPT_BTC_ETH'),
    no_upper_move_cap:true,
    observed_abs_move_pct:move===null?null:Math.abs(move),
  };
}

function bykSymbols(payload) {
  const rows = Array.isArray(payload?.symbols) ? payload.symbols : [];
  return new Set(rows.map(row => upper(row?.symbol)).filter(Boolean));
}

function hyperliquidSymbols(payload) {
  const rows = Array.isArray(payload?.[0]?.universe) ? payload[0].universe : [];
  return new Set(rows.filter(row => row?.isDelisted !== true).map(row => upper(row?.name)).filter(Boolean));
}

function gtradeSymbols(payload) {
  const rows = Array.isArray(payload?.pairs) ? payload.pairs : [];
  return new Set(rows.filter(row => upper(row?.to) === 'USD').map(row => upper(row?.from)).filter(Boolean));
}

// Every valid HTX Futures contract remains eligible. Provider routes are added
// only after an exact provider-owned registry match. No guessed alias, price
// multiplier or case-only substitution is allowed.
export function resolveHtxLiquidationSources({contract,byk_registry=null,hyperliquid_catalog=null,gtrade_variables=null}={}) {
  const parsed = parseHtxFuturesContract(contract);
  if (!parsed.ok) return {...parsed,htx_factual:false,projected_routes:[],native_routes:[],coverage_status:'INVALID'};
  const bykTarget = `${parsed.base}USDT`;
  const mapNeeded = !new Set(['BTC','ETH']).has(parsed.base);
  const byk = bykSymbols(byk_registry).has(bykTarget);
  const hyperliquid = hyperliquidSymbols(hyperliquid_catalog).has(parsed.base);
  const gtrade = gtradeSymbols(gtrade_variables).has(parsed.base);
  const projected_routes = mapNeeded && byk ? [{provider:'BYKARANTELI',symbol:parsed.base,registry_symbol:bykTarget}] : [];
  const native_routes = [
    ...(mapNeeded && hyperliquid ? [{provider:'HYPERLIQUID_LIQFLOW',symbol:parsed.base}] : []),
    ...(mapNeeded && gtrade ? [{provider:'GTRADE',symbol:parsed.base}] : []),
  ];
  return {
    ...parsed,
    htx_factual:true,
    external_liquidation_map_needed:mapNeeded,
    priority_class:mapNeeded?'HTX_FUTURES_EXCEPT_BTC_ETH':'BTC_ETH_SKIPPED_BY_POLICY',
    projected_routes,
    native_routes,
    coverage_status:!mapNeeded?'BTC_ETH_SKIPPED_BY_POLICY':(projected_routes.length || native_routes.length ? 'EXTERNAL_ROUTE_CONFIRMED' : 'HTX_FACTUAL_ONLY_EXTERNAL_UNSUPPORTED'),
    exact_registry_matching:true,
    guessed_alias:false,
    price_scale_conversion:false,
  };
}
