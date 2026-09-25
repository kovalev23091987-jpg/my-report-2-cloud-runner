export const EXISTING_SOURCE_COVERAGE_NORMALIZERS_VERSION='existing-source-coverage-normalizers-v1-20260925';
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const clean=v=>String(v??'').trim();
const arr=v=>Array.isArray(v)?v:[];
export function normalizeHyperliquidContext({coin='BTC',metaAndAssetCtxs=null,fundingHistory=null,l2Book=null,clearinghouseState=null,address=null,observed_ts=Date.now()}={}){
  const c=clean(coin).toUpperCase();const meta=Array.isArray(metaAndAssetCtxs)?metaAndAssetCtxs[0]:null,ctxs=Array.isArray(metaAndAssetCtxs)?metaAndAssetCtxs[1]:null;
  const idx=arr(meta?.universe).findIndex(x=>clean(x?.name).toUpperCase()===c);const ctx=idx>=0?arr(ctxs)[idx]:null;
  const mark=finite(ctx?.markPx),oi=finite(ctx?.openInterest),funding=finite(ctx?.funding);
  const hist=arr(fundingHistory).filter(x=>clean(x?.coin).toUpperCase()===c).sort((a,b)=>(finite(b?.time)??0)-(finite(a?.time)??0));
  const latestFunding=finite(hist[0]?.fundingRate)??funding;
  const bids=arr(l2Book?.levels?.[0]),asks=arr(l2Book?.levels?.[1]);const bid=finite(bids[0]?.px),ask=finite(asks[0]?.px);
  const mid=bid!==null&&ask!==null?(bid+ask)/2:null;const spread=mid&&mid>0?(ask-bid)/mid*100:null;
  const positions=arr(clearinghouseState?.assetPositions).map(x=>x?.position||x).filter(Boolean).map(p=>({coin:clean(p?.coin),szi:finite(p?.szi),entry_px:finite(p?.entryPx),position_value:finite(p?.positionValue)}));
  const closed=idx>=0&&mark!==null&&oi!==null&&latestFunding!==null&&spread!==null;
  return {version:EXISTING_SOURCE_COVERAGE_NORMALIZERS_VERSION,status:closed?'CLOSED':'NOT_CLOSED',coin:c,mark_price:mark,open_interest_contracts:oi,open_interest_usd:mark!==null&&oi!==null?mark*oi:null,funding_rate:latestFunding,best_bid:bid,best_ask:ask,spread_pct:spread,positions,address:clean(address)||null,known_addresses_are_sample_only:true,not_global_liquidation_map:true,observed_ts};
}
export function classifyHyperliquidPositionChange(prev,next){
  const p=finite(prev?.szi)??0,n=finite(next?.szi)??0;
  if(p===0&&n===0)return{status:'UNCHANGED',delta:0};
  if(p===0&&n!==0)return{status:'OPENED',delta:n};
  if(p!==0&&n===0)return{status:'CLOSED',delta:-p};
  if(Math.sign(p)!==Math.sign(n))return{status:'FLIPPED',delta:n-p};
  const ap=Math.abs(p),an=Math.abs(n);if(an>ap)return{status:'INCREASED',delta:n-p};if(an<ap)return{status:'DECREASED',delta:n-p};return{status:'UNCHANGED',delta:0};
}
function firstData(x){const d=x?.data;return Array.isArray(d)?d[0]:(d&&typeof d==='object'?d:null);}
export function normalizeBitgetContext({ticker=null,openInterest=null,funding=null,observed_ts=Date.now()}={}){
  const t=firstData(ticker)||{},f=firstData(funding)||{};const oiRoot=openInterest?.data||{};const oi=Array.isArray(oiRoot?.openInterestList)?oiRoot.openInterestList[0]:firstData(openInterest)||oiRoot;
  const price=finite(t?.lastPr??t?.last??t?.price),fundingRate=finite(f?.fundingRate??f?.funding_rate),open=finite(oi?.size??oi?.openInterest??oi?.open_interest);
  const status=price!==null&&(fundingRate!==null||open!==null)?'CLOSED':'NOT_CLOSED';
  return {version:EXISTING_SOURCE_COVERAGE_NORMALIZERS_VERSION,status,source:'Bitget',symbol:clean(t?.symbol||f?.symbol||oi?.symbol),price,funding_rate:fundingRate,open_interest:open,open_interest_unit:'контрактов',observed_ts,measurement_only:true,no_automatic_voting:true};
}
export function normalizeCoinbaseContext({product='BTC-USD',ticker=null,book=null,observed_ts=Date.now()}={}){
  const quote=clean(product).toUpperCase().split('-')[1]||null;const price=finite(ticker?.price),bid=finite(ticker?.bid),ask=finite(ticker?.ask),seq=finite(book?.sequence);
  const status=price!==null&&quote&&Array.isArray(book?.bids)&&Array.isArray(book?.asks)?'CLOSED':'NOT_CLOSED';
  return {version:EXISTING_SOURCE_COVERAGE_NORMALIZERS_VERSION,status,source:'Coinbase Exchange',product:clean(product).toUpperCase(),quote_currency:quote,price,bid,ask,sequence:seq,quotes_are_not_equivalent:true,observed_ts,measurement_only:true,no_automatic_voting:true};
}
export function decideDeribitUtility({currency='BTC',summary=null,target_asset='ALT'}={}){
  const rows=arr(summary?.result);const oi=rows.reduce((s,x)=>s+(finite(x?.open_interest)??0),0);const live=rows.length>0;
  return {version:EXISTING_SOURCE_COVERAGE_NORMALIZERS_VERSION,status:live?'CLOSED':'NOT_CLOSED',source:'Deribit',currency:clean(currency).toUpperCase(),option_instruments:rows.length,total_open_interest:oi,target_asset:clean(target_asset).toUpperCase(),decision:'DISABLED_NO_DIRECT_ALTCOIN_SIGNAL',second_priority:true,market_background_only:true,automatic_enablement:false,directional_vote:false};
}
