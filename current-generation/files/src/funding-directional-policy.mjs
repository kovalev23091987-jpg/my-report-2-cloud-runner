export const FUNDING_DIRECTIONAL_POLICY_VERSION='funding-directional-policy-v1-20261001';

export function fundingDirectionalRoutes({
 early_liquidity=false,negative_funding_tail=false,positive_funding_tail=false,
 oi_building=false,positive_momentum=false,negative_momentum=false,
 strong_relative_long=false,strong_relative_short=false,
}={}){
 const longConfirmation=oi_building||positive_momentum||strong_relative_long;
 const shortConfirmation=oi_building||negative_momentum||strong_relative_short;
 return{
  long_routes:early_liquidity&&negative_funding_tail&&longConfirmation?['LONG_NEGATIVE_FUNDING_FUEL']:[],
  short_routes:early_liquidity&&positive_funding_tail&&shortConfirmation?['SHORT_POSITIVE_FUNDING_FUEL']:[],
  directional_vote:Boolean(early_liquidity&&((negative_funding_tail&&longConfirmation)||(positive_funding_tail&&shortConfirmation))),
  funding_alone_is_veto:false,
  funding_alone_can_authorize_entry:false,
 };
}

export default{fundingDirectionalRoutes};
