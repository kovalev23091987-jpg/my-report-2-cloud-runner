import {volumeProfileScoreEvidence} from './htx-volume-profile.mjs';
import {consumeEvidenceV2} from './evidence-v2.mjs';
export const SUPPLEMENTAL_SCORE_EVIDENCE_VERSION='supplemental-score-evidence-v2-physical-root-chain-caps-20260928';
export const FIXED_DECISION_WEIGHTS=Object.freeze({CROSS_EXCHANGE_DERIVATIVES:32,MARKET_STRENGTH_SPOT:30,SMART_MONEY_ONCHAIN:20,SUPPORTING_RISK:18});
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const sideSign=(row,direction)=>{const side=String(row?.direction??row?.side??row?.lean??'').toUpperCase();if(!['BUY','SELL','LONG','SHORT','BULLISH','BEARISH'].includes(side))return null;const bullish=['BUY','LONG','BULLISH'].includes(side);return direction==='SHORT'?(bullish?-1:1):(bullish?1:-1);};

export function buildSupplementalScoreEvidence({direction,internal_market_context=null,liquidation_panel=null,volume_profile=null,volume_consensus=null,contract=null,observed_ts=null,reference_price=null}={}){
 const dir=String(direction||'').toUpperCase();if(!['LONG','SHORT'].includes(dir))return[];
 const out=[];const profileEvidence=volumeProfileScoreEvidence(volume_profile,{contract,now:observed_ts,reference_price,direction:dir});if(profileEvidence){const factor=clamp(finite(volume_consensus?.factor)??.5,0,1);profileEvidence.quality*=factor;profileEvidence.consensus_status=volume_consensus?.status||'SINGLE_VENUE';profileEvidence.confirming_venues=volume_consensus?.confirmations?.map(p=>p.source)||[];profileEvidence.maximum_score_points*=factor;if(factor>0)out.push(profileEvidence);}const deribit=internal_market_context?.deribit;
 const liq=liquidation_panel?.score_evidence;
 if(liq?.fresh===true&&liq?.exact_identity===true){const bull=finite(liq.bullish_strength);if(bull!==null&&bull!==0)out.push({...liq,signed_strength:dir==='SHORT'?-bull:bull});}
 if(deribit?.status==='CLOSED'&&deribit?.internal_only===true){
  const regime=String(deribit.market_regime||'');
  const signed=regime==='RISK_OFF_ELEVATED'?-0.5:0;
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
 for(const {row,source_id} of dexRows){const buys=finite(row?.buys_24h),sells=finite(row?.sells_24h);if(buys===null||sells===null||buys+sells<20)continue;out.push({source_id,responsibility_group:'DEX_ACTIVITY',decision_chain:'SMART_MONEY_ONCHAIN',signed_strength:0,quality:0.7,asset_identity:'EXACT_CONTRACT',metric_family:'DEX_BUY_SELL_COUNTS_CONTEXT',provider_object_id:String(row.pool_key||'POOL'),fresh:true,exact_identity:true,direction_neutral_context:true});}
 const llama=sources.DEFILLAMA,change=finite(llama?.tvl_change_7d_pct);
 if(llama?.status==='CLOSED'&&llama?.exact_identity===true&&change!==null&&Math.abs(change)>=2)out.push({source_id:'DEFILLAMA',responsibility_group:'PROTOCOL_AND_TOKEN_CONTEXT',decision_chain:'SUPPORTING_RISK',signed_strength:0,quality:0.6,asset_identity:String(llama.protocol_slug||''),metric_family:'TVL_7D_CONTEXT',provider_object_id:'PROTOCOL',fresh:true,exact_identity:true,direction_neutral_context:true});
 const sol=sources.SOLANA_RPC,cur=finite(sol?.recent_signature_count_1h),prior=finite(sol?.prior_signature_count_1h);
 if(sol?.status==='CLOSED'&&sol?.exact_identity===true&&sol?.comparable_windows===true&&cur!==null&&prior!==null&&cur>=10&&cur>=Math.max(2,prior*2))out.push({source_id:'SOLANA_RPC',responsibility_group:'CHAIN_ACTIVITY_CONTEXT',decision_chain:'SMART_MONEY_ONCHAIN',signed_strength:0,quality:sol.sample_capped?0.4:0.6,asset_identity:String(sol.mint||''),metric_family:'SIGNATURE_COUNT_CONTEXT',provider_object_id:'MINT_SIGNATURES',fresh:true,exact_identity:true,direction_neutral_context:true});
 for(const id of ['BITGET','COINBASE']){const row=sources[id],diff=finite(row?.price_difference_vs_htx_pct);if(row?.status!=='CLOSED'||row?.exact_identity!==true||diff===null)continue;out.push({source_id:id,responsibility_group:'INDEPENDENT_MARKET_VALIDATION',decision_chain:id==='BITGET'?'CROSS_EXCHANGE_DERIVATIVES':'MARKET_STRENGTH_SPOT',signed_strength:0,quality:0.8,asset_identity:String(row.symbol||row.product||''),metric_family:'PRICE_IDENTITY_CONTEXT',provider_object_id:'VENUE_MARKET',fresh:true,exact_identity:true,direction_neutral_context:true});}
 const cex=internal_market_context?.cross_exchange_risk?.sources||{},depth=cex.CROSS_EXCHANGE_DEPTH,depthImbalance=finite(depth?.aggregate_depth_imbalance_2pct);
 if(depth?.status==='CLOSED'&&Number(depth?.venue_count)>=2&&depthImbalance!==null&&Math.abs(depthImbalance)>=0.08){const bull=clamp(depthImbalance,-1,1);out.push({source_id:'CROSS_EXCHANGE_DEPTH',responsibility_group:'CROSS_EXCHANGE_LIQUIDITY',decision_chain:'MARKET_STRENGTH_SPOT',signed_strength:dir==='SHORT'?-bull:bull,quality:clamp(0.3+Number(depth.venue_count)*0.1,0,0.6),asset_identity:'EXACT_LISTED_MARKETS_PRICE_CROSSCHECKED',metric_family:'ORDER_BOOK_DEPTH_IMBALANCE_2PCT',provider_object_id:'BINANCE_BYBIT_OKX',fresh:true,exact_identity:true});}
 const history=cex.COINALYZE,historyTotal=(finite(history?.long_liquidated_recent)||0)+(finite(history?.short_liquidated_recent)||0);
 if(history?.status==='CLOSED'&&historyTotal>0)out.push({source_id:'COINALYZE',responsibility_group:'REALIZED_LIQUIDATION_BASELINE',decision_chain:'CROSS_EXCHANGE_DERIVATIVES',signed_strength:0,quality:0.7,asset_identity:'EXACT_FUTURES_MARKETS',metric_family:'REALIZED_LIQUIDATION_CONTEXT',provider_object_id:'MULTI_EXCHANGE_HISTORY',fresh:true,exact_identity:true,direction_neutral_context:true});
 const gate=cex.GATE_LIQUIDATION_HISTORY;if(gate?.status==='CLOSED'&&gate?.exact_identity===true)out.push({source_id:'GATE_LIQUIDATION_HISTORY',responsibility_group:'REALIZED_LIQUIDATION_BASELINE',decision_chain:'CROSS_EXCHANGE_DERIVATIVES',signed_strength:0,quality:0.5,asset_identity:gate.native_symbol,metric_family:'NATIVE_LIQUIDATION_STATISTIC_CONTEXT',provider_object_id:'GATE_USDT_PERPETUAL',physical_root_key:`GATE|LIQUIDATION_STATISTIC|${gate.native_symbol}|${gate.source_ts}`,fresh:true,exact_identity:true,direction_neutral_context:true});
 const live=cex.CROSS_EXCHANGE_REALIZED,liveTotal=(finite(live?.long_liquidated_usd)||0)+(finite(live?.short_liquidated_usd)||0);
 if(live?.status==='CLOSED'&&liveTotal>=1000)out.push({source_id:'CROSS_EXCHANGE_REALIZED',responsibility_group:'REALIZED_LIQUIDATION_LIVE',decision_chain:'CROSS_EXCHANGE_DERIVATIVES',signed_strength:0,quality:0.65,asset_identity:'EXACT_FUTURES_MARKETS',metric_family:'LIVE_FORCED_ORDER_CONTEXT',provider_object_id:'BINANCE_BYBIT_OKX',fresh:true,exact_identity:true,direction_neutral_context:true});
 const healthRows=Array.isArray(internal_market_context?.predictive_source_health?.sources)?internal_market_context.predictive_source_health.sources:[];
 const healthBySource=new Map(healthRows.map(row=>[String(row?.source_id||'').toUpperCase(),row]));
 const evidenceRows=Array.isArray(internal_market_context?.evidence_v2?.evidence)?internal_market_context.evidence_v2.evidence:[],decisionTs=finite(internal_market_context?.decision_ts)??Date.now();
 if(evidenceRows.length){const alignedEvidence=evidenceRows.map(row=>row?.directional_strength===null||row?.directional_strength===undefined?row:{...row,directional_strength:dir==='SHORT'?-Number(row.directional_strength):Number(row.directional_strength)}),consumed=consumeEvidenceV2(alignedEvidence,{base_interest:0,decision_ts:decisionTs,base_evidence_ids:Array.isArray(internal_market_context?.evidence_v2?.base_evidence_ids)?internal_market_context.evidence_v2.base_evidence_ids:[],base_evidence_roots:Array.isArray(internal_market_context?.evidence_v2?.base_evidence_roots)?internal_market_context.evidence_v2.base_evidence_roots:[]}),chainByFamily={DERIVATIVES:'CROSS_EXCHANGE_DERIVATIVES',MARKET_DEMAND:'MARKET_STRENGTH_SPOT',ONCHAIN:'SMART_MONEY_ONCHAIN',RISK_EVENTS:'SUPPORTING_RISK',TECHNICAL_EXISTING:'MARKET_STRENGTH_SPOT'};const consumedReceipts=consumed.receipts.filter(item=>item.reason==='CONSUMED'&&item.physical_root_key);for(const [block,blockContribution] of Object.entries(consumed.block_contributions||{})){const members=consumedReceipts.filter(item=>item.block_id===block),rawTotal=members.reduce((sum,item)=>sum+Number(item.raw_contribution||0),0),scale=rawTotal===0?0:blockContribution/rawTotal;for(const item of members){const chain=chainByFamily[item.family],den=(FIXED_DECISION_WEIGHTS[chain]||0)*.1,contribution=Number(item.raw_contribution||0)*scale;if(!chain||!den||!contribution)continue;out.push({source_id:'EVIDENCE_V2',responsibility_group:`EVIDENCE_V2_${block}_${item.evidence_id}`,decision_chain:chain,signed_strength:clamp(contribution/den,-1,1),quality:1,asset_identity:'EXACT_EVIDENCE_V2',metric_family:`EVIDENCE_V2_${item.family}`,provider_object_id:item.evidence_id,physical_root_key:item.physical_root_key,fresh:true,exact_identity:true,evidence_v2_receipts:consumed.receipts});}}}
 return out.map(row=>{const health=healthBySource.get(String(row?.source_id||'').toUpperCase()),active=health?.activation_state==='ACTIVE'&&health?.eligibility_protocol==='T16_5'&&Number(health?.eligible)===1&&Number(health?.observations)>=200;const factor=active&&row.source_id!=='HTX_VOLUME_PROFILE'?clamp(finite(health.predictive_weight_factor)??1,0.75,1.25):1,baseQuality=clamp(finite(row.quality)??0,0,1);return{...row,quality:clamp(baseQuality*factor,0,1),base_quality:baseQuality,predictive_weight_factor:factor,predictive_weight_status:active?'ACTIVE_T16_5':'SHADOW_FACTOR_ONE',predictive_observations:Number(health?.observations||0)};});
}

export function applySupplementalScoreAdjustment(baseScore,evidence=[]){
 const base=finite(baseScore);if(base===null)return{status:'BASE_SCORE_MISSING',base_score:null,final_score:null,adjustment:0,receipts:[]};
 const physicalRoot=row=>String(row?.physical_root_key||[row?.source_id,row?.provider_object_id??row?.origin_event_id??row?.metric_family,row?.metric_family,row?.asset_identity].join('|'));
 const byRoot=new Map(),discarded=[];
 for(const row of Array.isArray(evidence)?evidence:[]){
  const chain=String(row?.decision_chain||'');const weight=FIXED_DECISION_WEIGHTS[chain];
  const signed=finite(row?.signed_strength),quality=finite(row?.quality);
  if(!weight||signed===null||quality===null||row?.fresh!==true||row?.exact_identity!==true)continue;
  const root=physicalRoot(row);if(!root)continue;
  const item={...row,physical_root_key:root,signed_strength:clamp(signed,-1,1),quality:clamp(quality,0,1),chain_weight:weight};
  const prior=byRoot.get(root);if(!prior||Math.abs(item.signed_strength*item.quality)>Math.abs(prior.signed_strength*prior.quality)){if(prior)discarded.push({...prior,discard_reason:'DUPLICATE_PHYSICAL_ROOT'});byRoot.set(root,item);}else discarded.push({...item,discard_reason:'DUPLICATE_PHYSICAL_ROOT'});
 }
 const byFamily=new Map();for(const item of byRoot.values()){const family=String(item?.responsibility_group||item?.source_id||'');if(!family)continue;const prior=byFamily.get(family);if(!prior||Math.abs(item.signed_strength*item.quality)>Math.abs(prior.signed_strength*prior.quality)){if(prior)discarded.push({...prior,discard_reason:'DUPLICATE_RESPONSIBILITY_FAMILY'});byFamily.set(family,item);}else discarded.push({...item,discard_reason:'DUPLICATE_RESPONSIBILITY_FAMILY'});}
 const pendingByChain=new Map();for(const item of byFamily.values()){const raw=item.chain_weight*0.10*item.quality*item.signed_strength;const list=pendingByChain.get(item.decision_chain)||[];list.push({item,raw});pendingByChain.set(item.decision_chain,list);}
 const receipts=[];let adjustment=0;const chainContributions={};
 for(const [chain,items] of pendingByChain){const cap=FIXED_DECISION_WEIGHTS[chain]*.1,rawTotal=items.reduce((sum,row)=>sum+row.raw,0),cappedTotal=clamp(rawTotal,-cap,cap),scale=rawTotal===0?0:Math.abs(cappedTotal/rawTotal);chainContributions[chain]=Number(cappedTotal.toFixed(4));adjustment+=cappedTotal;for(const {item,raw} of items){const contribution=raw*scale;receipts.push({...item,source_quality_factor:item.quality,effective_max_score_points:Number((item.chain_weight*.1*item.quality).toFixed(4)),score_contribution:Number(contribution.toFixed(4)),weighting_mode:'PHYSICAL_ROOT_DEDUP_THEN_FIXED_CHAIN_CAP'});}
 }
 adjustment=clamp(adjustment,-10,10);
 return{status:'CLOSED',base_score:base,final_score:Math.round(clamp(base+adjustment,0,100)),adjustment:Number(adjustment.toFixed(4)),receipts,discarded,chain_contributions:chainContributions,weights:{...FIXED_DECISION_WEIGHTS},source_weighting:'T16_5_FAIL_CLOSED_FACTOR_ONE_UNLESS_ACTIVE',core_weights_automatically_changed:false,maximum_absolute_adjustment:10,missing_or_stale_is_zero:true,physical_root_counted_once:true,duplicate_family_counted_once:true,chain_caps_applied:true};
}

export default{SUPPLEMENTAL_SCORE_EVIDENCE_VERSION,FIXED_DECISION_WEIGHTS,buildSupplementalScoreEvidence,applySupplementalScoreAdjustment};
