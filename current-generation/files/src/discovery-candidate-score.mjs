export const DISCOVERY_CANDIDATE_SCORE_VERSION='discovery-candidate-score-v1-20261001';

const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)||0));

export function scoreDiscoveryCandidate({
  core_liquidity=false,
  early_liquidity=false,
  non_funding_anomaly_count=0,
  directional_market_route=false,
  oi_building=false,
  momentum_confirmed=false,
  relative_strength_confirmed=false,
  funding_directionally_supportive=false,
  fresh=true,
}={}){
  const components={
    liquidity:core_liquidity?15:early_liquidity?8:0,
    independent_market_anomalies:Math.min(20,clamp(non_funding_anomaly_count,0,4)*5),
    directional_market_route:directional_market_route?25:0,
    open_interest_confirmation:oi_building?15:0,
    momentum_confirmation:momentum_confirmed?10:0,
    // Independent market evidence can contribute at most 95 points. This
    // leaves a real, visible five-point improvement for supportive funding
    // without allowing funding to become a primary criterion.
    relative_strength_confirmation:relative_strength_confirmed?5:0,
    data_freshness:fresh?5:0,
    // Funding is deliberately a small bonus. It cannot create eligibility,
    // direction, or a Deep Check route without independent market evidence.
    funding_bonus:directional_market_route&&funding_directionally_supportive?5:0,
  };
  const score=Math.min(100,Object.values(components).reduce((sum,value)=>sum+value,0));
  return{
    version:DISCOVERY_CANDIDATE_SCORE_VERSION,
    score_0_100:score,
    components,
    funding_bonus_max:5,
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
