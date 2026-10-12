export const DISCOVERY_CANDIDATE_SCORE_VERSION='discovery-candidate-score-v2-strong-period-funding-20261012';

const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)||0));
const factualNumber=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;

export function fundingDiscoveryBonus({funding_rate_pct,funding_interval_hours,long_watch=false,short_watch=false,directional_market_route=false,fresh=true}={}){
  const rate=factualNumber(funding_rate_pct),hours=factualNumber(funding_interval_hours);
  // The exchange's actual payout period is required. Never infer an hourly
  // equivalent, reward an unknown interval, or let funding create direction.
  if(!fresh||!directional_market_route||long_watch===short_watch||rate===null||hours===null||hours<=0||hours>4||Math.abs(rate)<0.1)return 0;
  if(long_watch&&rate>=0||short_watch&&rate<=0)return 0;
  return hours<=1?15:10;
}

export function scoreDiscoveryCandidate({
  core_liquidity=false,
  early_liquidity=false,
  non_funding_anomaly_count=0,
  directional_market_route=false,
  oi_building=false,
  momentum_confirmed=false,
  relative_strength_confirmed=false,
  funding_rate_pct=null,
  funding_interval_hours=null,
  long_watch=false,
  short_watch=false,
  fresh=true,
}={}){
  const components={
    liquidity:core_liquidity?10:early_liquidity?5:0,
    independent_market_anomalies:Math.min(20,clamp(non_funding_anomaly_count,0,4)*5),
    directional_market_route:directional_market_route?20:0,
    open_interest_confirmation:oi_building?15:0,
    momentum_confirmation:momentum_confirmed?10:0,
    // Independent market evidence contributes up to 85 points. Funding is
    // supplementary and cannot produce an eligible or directional candidate.
    relative_strength_confirmation:relative_strength_confirmed?5:0,
    data_freshness:fresh?5:0,
    funding_bonus:fundingDiscoveryBonus({funding_rate_pct,funding_interval_hours,long_watch,short_watch,directional_market_route,fresh}),
  };
  const score=Math.min(100,Object.values(components).reduce((sum,value)=>sum+value,0));
  return{
    version:DISCOVERY_CANDIDATE_SCORE_VERSION,
    score_0_100:score,
    components,
    funding_bonus_max:15,
    strong_funding_min_abs_pct_per_payout:0.1,
    strong_funding_max_payout_interval_hours:4,
    funding_required:false,
    funding_can_create_candidate:false,
  };
}

export function compareDiscoveryCandidates(a,b){
  const scoreDelta=Number(b?.selection_score_0_100||0)-Number(a?.selection_score_0_100||0);
  if(scoreDelta)return scoreDelta;
  const routeDelta=Number(Boolean(b?.long_watch||b?.short_watch))-Number(Boolean(a?.long_watch||a?.short_watch));
  if(routeDelta)return routeDelta;
  const flagDelta=Number(b?.non_funding_anomaly_flags_count||0)-Number(a?.non_funding_anomaly_flags_count||0);
  if(flagDelta)return flagDelta;
  const turnoverDelta=Number(b?.turnover_24h_usdt||0)-Number(a?.turnover_24h_usdt||0);
  if(turnoverDelta)return turnoverDelta;
  return String(a?.contract||'').localeCompare(String(b?.contract||''));
}

export default{DISCOVERY_CANDIDATE_SCORE_VERSION,scoreDiscoveryCandidate,compareDiscoveryCandidates};
