export const SUPPLEMENTAL_SCORE_EVIDENCE_VERSION='supplemental-score-evidence-v1-20260927';
export const FIXED_DECISION_WEIGHTS=Object.freeze({CROSS_EXCHANGE_DERIVATIVES:35,MARKET_STRENGTH_SPOT:30,SMART_MONEY_ONCHAIN:20,SUPPORTING_RISK:15});
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const sideSign=(row,direction)=>{const side=String(row?.direction??row?.side??row?.lean??'').toUpperCase();if(!['BUY','SELL','LONG','SHORT','BULLISH','BEARISH'].includes(side))return null;const bullish=['BUY','LONG','BULLISH'].includes(side);return direction==='SHORT'?(bullish?-1:1):(bullish?1:-1);};

export function buildSupplementalScoreEvidence({direction,internal_market_context=null,liquidation_panel=null}={}){
 const dir=String(direction||'').toUpperCase();if(!['LONG','SHORT'].includes(dir))return[];
 const out=[];const deribit=internal_market_context?.deribit;
 const liq=liquidation_panel?.score_evidence;
 if(liq?.fresh===true&&liq?.exact_identity===true){const bull=finite(liq.bullish_strength);if(bull!==null&&bull!==0)out.push({...liq,signed_strength:dir==='SHORT'?-bull:bull});}
 if(deribit?.status==='CLOSED'&&deribit?.internal_only===true){
  const regime=String(deribit.market_regime||'');
  const signed=regime==='RISK_OFF_ELEVATED'?-0.5:regime==='RISK_ON_SUPPORTIVE'?0.25:0;
  if(signed!==0)out.push({source_id:'DERIBIT',responsibility_group:'GLOBAL_MARKET_REGIME',decision_chain:'SUPPORTING_RISK',signed_strength:signed,quality:1,asset_identity:'GLOBAL_BTC_ETH',metric_family:'MARKET_REGIME',provider_object_id:'BTC_ETH_OPTIONS',fresh:true,exact_identity:true});
 }
 const lobster=internal_market_context?.coinlobster;
 if(lobster?.status==='CLOSED'&&lobster?.internal_only===true){
  for(const row of Array.isArray(lobster.whale_radar)?lobster.whale_radar:[]){
   const explicit=sideSign(row,dir);let strength=null;
   const buyShare=finite(row?.buy_share??row?.buyShare);
   if(explicit!==null&&buyShare!==null)strength=explicit*clamp(Math.abs(buyShare-(buyShare>1?50:0.5))/(buyShare>1?50:0.5),0,1);
   else if(explicit!==null){const multiple=finite(row?.multiple??row?.volume_multiple??row?.ratio);strength=explicit*clamp(((multiple??1)-1)/4,0.2,1);}
   if(strength!==null&&strength!==0)out.push({source_id:'COINLOBSTER',responsibility_group:'CROSS_EXCHANGE_WHALE_FLOW',decision_chain:'SMART_MONEY_ONCHAIN',signed_strength:strength,quality:0.8,asset_identity:String(row?.coin??row?.symbol??'').toUpperCase(),metric_family:'WHALE_FLOW',provider_object_id:'AGGREGATED_WHALE_RADAR',fresh:true,exact_identity:true});
  }
 }
 const sources=internal_market_context?.candidate_sources||{};
 const goplus=sources.GOPLUS;
 if(goplus?.status==='CLOSED'&&goplus?.exact_identity===true){
  const flagged=Object.values(goplus.flags||{}).filter(v=>v===true).length;
  if(flagged)out.push({source_id:'GOPLUS',responsibility_group:'PROTOCOL_AND_TOKEN_RISK',decision_chain:'SUPPORTING_RISK',signed_strength:-clamp(flagged/3,0.35,1),quality:1,asset_identity:'EXACT_CONTRACT',metric_family:'TOKEN_RISK',provider_object_id:'TOKEN_SECURITY',fresh:true,exact_identity:true});
 }
 const dexRows=[...(sources.DEX_SCREENER?.pools||[]).map(row=>({row,source_id:'DEX_SCREENER'})),...(sources.GECKOTERMINAL?.pools||[]).map(row=>({row,source_id:'GECKOTERMINAL'}))];
 for(const {row,source_id} of dexRows){const buys=finite(row?.buys_24h),sells=finite(row?.sells_24h);if(buys===null||sells===null||buys+sells<20)continue;const bull=(buys-sells)/(buys+sells);const signed=dir==='SHORT'?-bull:bull;if(Math.abs(signed)>=0.05)out.push({source_id,responsibility_group:'DEX_ACTIVITY',decision_chain:'SMART_MONEY_ONCHAIN',signed_strength:clamp(signed,-1,1),quality:0.7,asset_identity:'EXACT_CONTRACT',metric_family:'DEX_BUY_SELL_ACTIVITY',provider_object_id:String(row.pool_key||'POOL'),fresh:true,exact_identity:true});}
 const llama=sources.DEFILLAMA,change=finite(llama?.tvl_change_7d_pct);
 if(llama?.status==='CLOSED'&&llama?.exact_identity===true&&change!==null&&Math.abs(change)>=2){const bull=clamp(change/25,-1,1);out.push({source_id:'DEFILLAMA',responsibility_group:'PROTOCOL_AND_TOKEN_RISK',decision_chain:'SUPPORTING_RISK',signed_strength:dir==='SHORT'?-bull:bull,quality:0.6,asset_identity:String(llama.protocol_slug||''),metric_family:'TVL_7D_TREND',provider_object_id:'PROTOCOL',fresh:true,exact_identity:true});}
 const sol=sources.SOLANA_RPC,cur=finite(sol?.recent_signature_count_1h),prior=finite(sol?.prior_signature_count_1h);
 if(sol?.status==='CLOSED'&&sol?.exact_identity===true&&cur!==null&&prior!==null&&cur>=10&&cur>=Math.max(2,prior*2))out.push({source_id:'SOLANA_RPC',responsibility_group:'DEX_ACTIVITY',decision_chain:'SMART_MONEY_ONCHAIN',signed_strength:0.2,quality:sol.sample_capped?0.4:0.6,asset_identity:String(sol.mint||''),metric_family:'CHAIN_ACTIVITY_BURST',provider_object_id:'MINT_SIGNATURES',fresh:true,exact_identity:true,direction_neutral_interest:true});
 for(const id of ['BITGET','COINBASE']){const row=sources[id],diff=finite(row?.price_difference_vs_htx_pct);if(row?.status!=='CLOSED'||row?.exact_identity!==true||diff===null)continue;const strength=Math.abs(diff)<=1?0.2:Math.abs(diff)>=3?-0.7:0;if(strength)out.push({source_id:id,responsibility_group:'INDEPENDENT_MARKET_VALIDATION',decision_chain:id==='BITGET'?'CROSS_EXCHANGE_DERIVATIVES':'MARKET_STRENGTH_SPOT',signed_strength:strength,quality:0.8,asset_identity:String(row.symbol||row.product||''),metric_family:'PRICE_CONSISTENCY',provider_object_id:'VENUE_MARKET',fresh:true,exact_identity:true});}
 return out;
}

export function applySupplementalScoreAdjustment(baseScore,evidence=[]){
 const base=finite(baseScore);if(base===null)return{status:'BASE_SCORE_MISSING',base_score:null,final_score:null,adjustment:0,receipts:[]};
 const byFamily=new Map();
 for(const row of Array.isArray(evidence)?evidence:[]){
  const chain=String(row?.decision_chain||'');const weight=FIXED_DECISION_WEIGHTS[chain];
  const signed=finite(row?.signed_strength),quality=finite(row?.quality);
  if(!weight||signed===null||quality===null||row?.fresh!==true||row?.exact_identity!==true)continue;
  const family=String(row?.responsibility_group||row?.source_id||'');if(!family)continue;
  const item={...row,signed_strength:clamp(signed,-1,1),quality:clamp(quality,0,1),chain_weight:weight};
  const prior=byFamily.get(family);if(!prior||Math.abs(item.signed_strength*item.quality)>Math.abs(prior.signed_strength*prior.quality))byFamily.set(family,item);
 }
 const receipts=[];let adjustment=0;
 for(const item of byFamily.values()){
  // Supplemental sources may influence at most ten percent of the existing
  // fixed block. This preserves 35/30/20/15 ownership and bounds the total to 10.
  const effectiveMax=item.chain_weight*0.10*item.quality;
  const contribution=effectiveMax*item.signed_strength;
  adjustment+=contribution;receipts.push({...item,source_quality_factor:item.quality,effective_max_score_points:Number(effectiveMax.toFixed(4)),score_contribution:Number(contribution.toFixed(4)),weighting_mode:'PER_RUN_VERIFIED_QUALITY'});
 }
 adjustment=clamp(adjustment,-10,10);
 return{status:'CLOSED',base_score:base,final_score:Math.round(clamp(base+adjustment,0,100)),adjustment:Number(adjustment.toFixed(4)),receipts,weights:{...FIXED_DECISION_WEIGHTS},source_weighting:'ADAPTIVE_PER_RUN_QUALITY_WITH_FIXED_DECISION_BLOCKS',core_weights_automatically_changed:false,maximum_absolute_adjustment:10,missing_or_stale_is_zero:true,duplicate_family_counted_once:true};
}

export default{SUPPLEMENTAL_SCORE_EVIDENCE_VERSION,FIXED_DECISION_WEIGHTS,buildSupplementalScoreEvidence,applySupplementalScoreAdjustment};
