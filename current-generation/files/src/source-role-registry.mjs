// Capability inventory, NOT evidence that a provider is connected or useful.
// Priorities are inherited operational defaults, never predictive weights.
export const SOURCE_ROLE_REGISTRY_VERSION='source-role-registry-v2-observed-metrics-20260930';
export const SOURCES=Object.freeze({
 HTX_OFFICIAL:{family:'HTX_OFFICIAL',roles:['EXECUTION_TRUTH','FUNDING_PRIMARY','OI_PRIMARY','OI_CURRENT_PRIMARY','PRICE_PRIMARY','TRADES_PRIMARY','SPOT_FLOW_PRIMARY','ORDERBOOK_PRIMARY','REALIZED_LIQUIDATIONS_PRIMARY'],kind:'OFFICIAL_VENUE',priority:100},
 BYKARANTELI:{family:'BYKARANTELI_AGGREGATE',roles:['PROJECTED_LIQUIDATION_MAP','REALIZED_LIQUIDATION_CROSS_VENUE','FUNDING_CROSS_VENUE','OI_CROSS_VENUE','PRESSURE'],kind:'AGGREGATOR',priority:90},
 COINLOBSTER:{family:'COINLOBSTER_AGGREGATE',roles:['REALIZED_LIQUIDATION_VALIDATION','PROJECTED_LIQUIDATION_VALIDATION','WHALE_FLOW','EARLY_WHALE_RADAR','SIGNAL_OUTCOMES'],kind:'AGGREGATOR',priority:85},
 BINANCE_OFFICIAL:{family:'BINANCE_OFFICIAL',roles:['FUNDING_CROSS_VENUE','OI_CROSS_VENUE','OI_CURRENT_CROSS_VENUE','TRADES_CROSS_VENUE','KLINES_CROSS_VENUE'],kind:'OFFICIAL_VENUE',priority:88},
 BYBIT_OFFICIAL:{family:'BYBIT_OFFICIAL',roles:['FUNDING_CROSS_VENUE','OI_CROSS_VENUE','ORDERBOOK_CROSS_VENUE','PRICE_CROSS_VENUE'],kind:'OFFICIAL_VENUE',priority:86},
 GATE_OFFICIAL:{family:'GATE_OFFICIAL',roles:['FUNDING_CROSS_VENUE','OI_CROSS_VENUE','PRICE_CROSS_VENUE','TRADES_CROSS_VENUE','ORDERBOOK_CROSS_VENUE','RISK_TIERS','VENUE_FACT'],kind:'OFFICIAL_VENUE',priority:82},
 // Actual inherited worker paths exist; no untested poll priority is assigned.
 OKX_OFFICIAL:{family:'OKX_OFFICIAL',roles:['FUNDING_CROSS_VENUE','OI_CURRENT_CROSS_VENUE','PRICE_CROSS_VENUE','RELATIVE_STRENGTH_CROSS_VENUE'],kind:'OFFICIAL_VENUE',priority:0},
 COINFUTY:{family:'COINFUTY_AGGREGATE',roles:['DERIVATIVES_SANITY_CHECK'],kind:'AGGREGATOR',priority:60},
 TRADER_PRO:{family:'TRADER_PRO_AGGREGATE',roles:['DERIVATIVES_HISTORY','FUNDING_ARBITRAGE','POSITIONING'],kind:'AGGREGATOR',priority:65},
 DEPTH_RADAR:{family:'DEPTH_RADAR',roles:['CVD','FOOTPRINT','ORDERBOOK_WALLS','DIVERGENCES'],kind:'ORDER_FLOW_SPECIALIST',priority:80},
 VYX:{family:'VYX',roles:['OFI','IMBALANCE','MICROPRICE','TAKER_FLOW','SQUEEZE'],kind:'ORDER_FLOW_SPECIALIST',priority:80},
 NANSEN:{family:'NANSEN',roles:['SMART_MONEY','DEX_FLOW','HYPERLIQUID_SMART_MONEY'],kind:'ONCHAIN_SPECIALIST',priority:75},
 COINGECKO:{family:'COINGECKO',roles:['MARKET_CONTEXT','ASSET_IDENTITY','SECTOR'],kind:'MARKET_CONTEXT',priority:55},
 COINMARKETCAP:{family:'COINMARKETCAP',roles:['GLOBAL_DERIVATIVES_CONTEXT','MACRO_EVENTS','NARRATIVES'],kind:'MARKET_CONTEXT',priority:55},
 TOKEN_TERMINAL:{family:'TOKEN_TERMINAL',roles:['FUNDAMENTALS'],kind:'FUNDAMENTALS',priority:55},
});
export function sourceForRole(role){return Object.entries(SOURCES).filter(([,v])=>v.roles.includes(role)).sort((a,b)=>b[1].priority-a[1].priority).map(([name,v])=>({name,...v,scope:'DECLARED_CAPABILITY_NOT_OBSERVED_EVIDENCE'}));}
export function independentFamilies(observations=[]){return [...new Set(observations.filter(x=>x.role_evidence_usable===true).map(x=>x.independence_group).filter(Boolean))];}
export function canPromoteEarlyObservation({has_htx_facts=false,has_actionable_trigger=false,independent_sources=[]}={}){return has_htx_facts===true&&has_actionable_trigger===true&&independentFamilies(independent_sources).length>=2;}
