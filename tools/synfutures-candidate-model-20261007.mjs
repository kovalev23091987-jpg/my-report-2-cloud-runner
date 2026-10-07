// SynFutures V3 0.2.33, official oyster-sdk tree aa43ccbf84fde833473552e1d65db2543cd4f178.
// Isolated candidate calculation; no scheduled route, score, entry or target authorization.
const W=10n**18n,abs=x=>x<0n?-x:x,up=(a,b,d)=>(a*b+d-1n)/d,down=(a,b,d)=>a*b/d;
export function calculateCandidateSynfuturesThreshold({position,amm,maintenance_margin_ratio}){
 const size=BigInt(position.size),balance=BigInt(position.balance),notional=BigInt(position.entryNotional),entryLoss=BigInt(position.entrySocialLossIndex),entryFunding=BigInt(position.entryFundingIndex),mmr=BigInt(maintenance_margin_ratio);
 if(size===0n||balance<=0n||notional<=0n||mmr<=0n||mmr>=10000n)throw Error('EXACT_NONZERO_POSITION_AND_MMR_REQUIRED');
 const long=size>0n,lossIndex=BigInt(long?amm.longSocialLossIndex:amm.shortSocialLossIndex),fundIndex=BigInt(long?amm.longFundingIndex:amm.shortFundingIndex);
 if(lossIndex<entryLoss)throw Error('SOCIAL_LOSS_INDEX_REGRESSED');
 const loss=up(lossIndex-entryLoss,abs(size),W),fundProduct=(fundIndex-entryFunding)*abs(size),fundFee=(fundProduct+(fundProduct<0n?-W/2n:W/2n))/W,numerator=long?notional+loss-balance-fundFee:notional-loss+balance+fundFee;
 if(numerator<=0n)return{price_wad:'0',positive_threshold:false};
 const denominator=long?up(abs(size),(10000n-mmr)*10n**14n,W):down(abs(size),(10000n+mmr)*10n**14n,W);
 if(denominator<=0n)throw Error('EXACT_THRESHOLD_DENOMINATOR_REQUIRED');
 const price=long?down(numerator,W,denominator):up(numerator,W,denominator);
 return{price_wad:String(price),positive_threshold:price>0n,position_side:long?'LONG':'SHORT',social_loss_wad:String(loss),funding_fee_wad:String(fundFee),price_semantics:'CALCULATED_CONDITIONAL_PROTOCOL_STORED_INDEX_SDK_ESTIMATE',funding_basis:'EXACT_STORED_NATIVE_AMM_INDEX_AT_PINNED_BLOCK',entry_authorized:false,execution_target_eligible:false};
}
