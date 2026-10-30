export const ORDERLY_PUBLIC_LIQUIDATION_VERSION='orderly-public-position-estimates-v1-20261012';
// Exact intersection of the 2026-10-12 public marketSummary with the approved
// HTX futures universe. BTC/ETH are deliberately absent by owner policy.
export const ORDERLY_VERIFIED_HTX_MARKETS=new Set('AAVE ADA APT ARB ASTER AVAX BNB DOGE DOT ENA ETHFI FARTCOIN HBAR HYPE JUP LINK LIT LTC NEAR ONDO OP PENGU PUMP RAY SOL SUI TAO TIA TRUMP TRX UNI USELESS WIF WLD XMR XPL XRP ZEC'.split(' '));
const finite=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):null;
const empty=(contract,status,reason,network_calls=0,extra={})=>({source:'ORDERLY_PUBLIC_POSITIONS',contract,status,reason,network_calls,levels:[],internal_only:true,...extra});

export function normalizeOrderlyPublicPositions(raw,{contract,reference_price,now=Date.now()}={}){
 const asset=String(contract||'').replace(/-USDT$/,'').toUpperCase(),reference=finite(reference_price),sourceTs=finite(raw?.ts),rows=raw?.data?.rows;
 if(!ORDERLY_VERIFIED_HTX_MARKETS.has(asset)||contract!==`${asset}-USDT`)return empty(contract,'EXACT_MARKET_UNVERIFIED','NOT_IN_VERIFIED_HTX_ORDERLY_INTERSECTION');
 if(raw?.success!==true||!Array.isArray(rows)||!Number.isSafeInteger(now)||!Number.isSafeInteger(sourceTs)||sourceTs>now||now-sourceTs>120000||!reference||reference<=0)return empty(contract,'INVALID_SOURCE_RESPONSE','PAYLOAD_CLOCK_OR_HTX_REFERENCE_INVALID');
 const symbol=`PERP_${asset}_USDC`,levels=[];let numericPositions=0,excludedPriceDivergence=0;
 for(let index=0;index<rows.length;index++){
  const row=rows[index];if(row?.symbol!==symbol)continue;
  const mark=finite(row.mark_price),price=finite(row.est_liq_price),notional=finite(row.notional),side=String(row.side||'').toUpperCase();
  if(!mark||!price||!notional||mark<=0||price<=0||notional<=0||!['LONG','SHORT'].includes(side)||price===mark)continue;
  numericPositions++;
  if(Math.abs(mark/reference-1)>0.05){excludedPriceDivergence++;continue;}
  // The owner's 5% rule merges nearby levels with one another. It is not a
  // distance-to-market cutoff: a distant open position is still a future level.
  if((side==='LONG'&&price>=mark)||(side==='SHORT'&&price<=mark))continue;
  levels.push({htx_contract:contract,source:'Orderly',venue:'ORDERLY',independence_group:'ORDERLY_PUBLIC_POSITIONS',evidence_class:'PUBLIC_OPEN_POSITION_WITH_ESTIMATED_LIQUIDATION_PRICE',status:'CLOSED',source_ts:sourceTs,native_price:price,native_reference_price:mark,price_quote:'USDC',notional_usd:notional,notional_unit:'USDC',liquidated_side:side,price_semantics:'ORDERLY_ESTIMATED_POSITION_LIQUIDATION_PRICE',amount_semantics:'REPORTED_OPEN_POSITION_NOTIONAL',estimated:true,conditional_cross:row.margin_mode==='CROSS',position_count:1,position_key:`ORDERLY_PUBLIC_ROW_${index}`,decision_target_eligible:false});
 }
 return{source:'ORDERLY_PUBLIC_POSITIONS',contract,status:levels.length?'CLOSED':'NO_VALID_ESTIMATED_POSITION_LEVELS',source_ts:sourceTs,reference_price:reference,reported_positions:finite(raw.data.total_positions),page_rows:rows.length,has_next_page:Boolean(raw.data.next_cursor),numeric_positions:numericPositions,excluded_price_divergence:excludedPriceDivergence,levels,network_calls:0,exact_market:true,independent_primary_source:true,price_estimated:true,position_notional_reported:true,internal_only:true};
}

export async function collectOrderlyPublicPositions({contract,reference_price,run_id,fetch_impl=globalThis.fetch,request_admit=null,max_http=1,now=Date.now()}={}){
 const asset=String(contract||'').replace(/-USDT$/,'').toUpperCase();
 if(!ORDERLY_VERIFIED_HTX_MARKETS.has(asset)||contract!==`${asset}-USDT`)return empty(contract,'EXACT_MARKET_UNVERIFIED','NOT_IN_VERIFIED_HTX_ORDERLY_INTERSECTION');
 if(!Number.isSafeInteger(now))return empty(contract,'INVALID_OBSERVATION_CLOCK','CURRENT_INTEGER_OBSERVATION_REQUIRED');
 if(max_http<1)return empty(contract,'DEFERRED_HTTP_ENVELOPE','NO_SOURCE_HTTP_HEADROOM');
 if(!finite(reference_price)||reference_price<=0)return empty(contract,'HTX_REFERENCE_REQUIRED','NO_CURRENT_HTX_REFERENCE');
 if(request_admit){const grant=request_admit({logical_request_id:`ORDERLY_PUBLIC_POSITIONS:${run_id}:${contract}`,lane:'background',attempts:1});if(!grant?.allowed||grant.duplicate)return empty(contract,'DEFERRED_HTTP_ENVELOPE','UNIFIED_HTTP_NOT_ADMITTED');}
 try{
  const response=await fetch_impl('https://api.orderly.org/v1/public/query',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'platformPositions',symbol:`PERP_${asset}_USDC`,min_notional:'0',limit:5000}),signal:AbortSignal.timeout(12000)});
  if(!response?.ok)return empty(contract,'SOURCE_HTTP_ERROR',`HTTP_${response?.status??'UNKNOWN'}`,1);
  const raw=await response.json(),result=normalizeOrderlyPublicPositions(raw,{contract,reference_price,now:Math.max(now,Date.now())});
  return{...result,network_calls:1};
 }catch(error){return empty(contract,'SOURCE_ERROR',String(error?.message||error).slice(0,120),1);}
}
