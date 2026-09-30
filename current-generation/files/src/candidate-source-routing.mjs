export const CANDIDATE_SOURCE_ROUTING_VERSION='candidate-source-routing-v1-high-interest-confirmation-20260929';
export const HIGH_INTEREST_SOURCE_THRESHOLD=70;
export const CANDIDATE_CONFIRMATION_HTTP_ENVELOPE=5;

const finite=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;

export function buildCandidateSourceRoutingPlan({
 discovery_row=null,
 cross_exchange_turn=false,
 manual_coin=false,
 queued_coin=false,
 total_http_envelope=CANDIDATE_CONFIRMATION_HTTP_ENVELOPE,
}={}){
 const interest=finite(discovery_row?.early_candidate_quality_0_100);
 const move=finite(discovery_row?.rolling_24h_change_pct??discovery_row?.move_pct);
 const highInterest=interest!==null&&interest>=HIGH_INTEREST_SOURCE_THRESHOLD;
 const explicitPriority=manual_coin===true||queued_coin===true;
 const ordinaryLiquidationPriority=(move!==null&&Math.abs(move)>=5)||discovery_row?.early_candidate_bridge===true;
 const reserveLiquidation=highInterest||explicitPriority||(cross_exchange_turn!==true&&ordinaryLiquidationPriority);
 const envelope=Number.isSafeInteger(total_http_envelope)&&total_http_envelope>=1&&total_http_envelope<=8
  ?total_http_envelope:CANDIDATE_CONFIRMATION_HTTP_ENVELOPE;
 return {
  version:CANDIDATE_SOURCE_ROUTING_VERSION,
  interest_score_0_100:interest,
  high_interest:highInterest,
  high_interest_threshold:HIGH_INTEREST_SOURCE_THRESHOLD,
  explicit_priority:explicitPriority,
  cross_exchange_turn:cross_exchange_turn===true,
  run_cross_exchange:cross_exchange_turn===true||reserveLiquidation,
  reserve_liquidation_lane:reserveLiquidation,
  total_http_envelope:envelope,
  reason:highInterest?'HIGH_INTEREST_REQUIRES_CONFIRMATION':explicitPriority?'EXPLICIT_OR_QUEUED_CANDIDATE_REQUIRES_CONFIRMATION':ordinaryLiquidationPriority?'EARLY_OR_FAST_MOVE_LIQUIDATION_PRIORITY':'ORDINARY_ROTATION',
  weights_changed:false,
  entry_rules_changed:false,
 };
}

export function remainingLiquidationHttpCap({plan,cross_exchange_context=null}={}){
 if(!plan?.reserve_liquidation_lane)return 0;
 const total=Number(plan?.total_http_envelope);
 if(!Number.isSafeInteger(total)||total<1)return 0;
 if(plan?.run_cross_exchange!==true)return total;
 const used=Number(cross_exchange_context?.network_calls);
 // Unknown consumption must fail closed rather than exceed the proven envelope.
 if(!Number.isSafeInteger(used)||used<0)return 0;
 return Math.max(0,total-used);
}

export default{CANDIDATE_SOURCE_ROUTING_VERSION,HIGH_INTEREST_SOURCE_THRESHOLD,CANDIDATE_CONFIRMATION_HTTP_ENVELOPE,buildCandidateSourceRoutingPlan,remainingLiquidationHttpCap};
