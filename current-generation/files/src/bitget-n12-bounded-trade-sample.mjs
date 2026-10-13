import {verifiedAssetRouteIdentity} from './verified-asset-route-identity.mjs';
import {buildEvidenceV2} from './evidence-source-adapters.mjs';

export const BITGET_N12_BOUNDED_SAMPLE_VERSION='bitget-n12-bounded-trade-sample-v1-20261011';
const WINDOW=5*60_000,TTL=60_000;
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const id=x=>typeof x==='string'&&/^\d{1,32}$/.test(x)?x:null;

// Reuse the actual trade pages already obtained by the exact-bound N05
// collector. A recent page is a bounded N12 sample even when the full 240
// minute N05 reconciliation fails. It never proves the complete five minutes.
export function normalizeBitgetN12BoundedTradeSample({contract,market,identity,identity_method,asset_binding_proof,exact_asset_binding,pages=[],window_end_ts,observed_ts}={}){
 const root={version:BITGET_N12_BOUNDED_SAMPLE_VERSION,status:'EXACT_RECENT_BITGET_TRADE_PAGE_REQUIRED',check_completed:false,evidence:[],summary:null,network_calls:0,internal_only:true};
 const base=String(contract||'').replace(/-USDT$/,'');
 if(contract!==base+'-USDT'||!/^[^\s-]{1,32}$/.test(base)||!['SPOT','FUTURES'].includes(market)||exact_asset_binding!==true||!identity||!verifiedAssetRouteIdentity({contract,asset_identity:identity,identity_method,asset_binding_proof})||!Number.isSafeInteger(window_end_ts)||window_end_ts%60000||!Number.isSafeInteger(observed_ts)||observed_ts<window_end_ts||observed_ts-window_end_ts>120000||!Array.isArray(pages)||pages.length<1||pages.length>3)return root;
 const rows=[];
 for(const page of pages){
  if(page?.code!=='00000'||!Array.isArray(page.data)||page.data.length>1000)return root;
  rows.push(...page.data);
 }
 const ids=new Map();
 for(const row of rows){const tradeId=id(row?.tradeId);if(tradeId)ids.set(tradeId,(ids.get(tradeId)||0)+1);}
 let rejected=0;const accepted=[];
 for(const row of rows){
  const tradeId=id(row?.tradeId),ts=finite(row?.ts),price=finite(row?.price),size=finite(row?.size),side=String(row?.side||'').toLowerCase();
  const quote=price===null||size===null?null:price*size;
  if(!tradeId||ids.get(tradeId)!==1||row?.symbol!==base+'USDT'||!Number.isSafeInteger(ts)||ts<window_end_ts-WINDOW||ts>=window_end_ts||ts>observed_ts||!(price>0&&size>0&&quote>0&&Number.isFinite(quote))||!['buy','sell'].includes(side)){rejected++;continue;}
  accepted.push({id:tradeId,source_ts:ts,side,quote});
 }
 const buy=accepted.filter(x=>x.side==='buy').reduce((n,x)=>n+x.quote,0),sell=accepted.filter(x=>x.side==='sell').reduce((n,x)=>n+x.quote,0),total=buy+sell;
 const summary={venue:'BITGET',market,returned_rows:rows.length,valid_recent_rows:accepted.length,rejected_rows:rejected,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,observed_quote_turnover_usdt:total,taker_imbalance:total?(buy-sell)/total:null,window_start:window_end_ts-WINDOW,window_end:window_end_ts,saturated:pages.some(p=>p.data.length===1000),whole_window_coverage_proven:false};
 if(!accepted.length)return{...root,status:rows.length?'TRADE_VALIDATION_NOT_CLOSED':'CLOSED_EMPTY_BOUNDED_SAMPLE',summary,check_completed:rows.length===0};
 const latest=accepted.reduce((a,b)=>a.source_ts>b.source_ts?a:b),physical=`BITGET_BOUNDED_TRADE_SAMPLE:${contract}:${market}:${latest.id}`;
 const evidence=buildEvidenceV2({provider_id:`BITGET_${market}_TRADES`,upstream_id:`BITGET_OFFICIAL_PUBLIC_${market}_TRADES`,asset_id:`HTX:${contract}`,htx_contract:contract,block_id:'N12',metric_family:'ACTUAL_BITGET_TAKER_TRADES_BOUNDED',origin_event_id:physical,dependency_group:physical,source_ts:latest.source_ts,observed_ts,expires_at:Math.min(observed_ts+TTL,latest.source_ts+WINDOW),coverage_status:'BOUNDED_DIRECTIONAL_SAMPLE',coverage_fraction:0,directional_strength:null,unit:'USDT',value:total,extra:{physical_root_key:physical,venue:'BITGET',market,independent_venue_root:'BITGET',exact_asset_binding:true,identity,identity_method,...(asset_binding_proof?{asset_binding_proof}:{}),source_clock_policy:'ORIGINAL_BITGET_TRADE_TIMESTAMPS',valid_recent_rows:accepted.length,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,taker_imbalance:summary.taker_imbalance,whole_window_coverage_proven:false,score_contribution:0,entry_authorized:false}});
 return{...root,status:'CLOSED_BOUNDED_SAMPLE',check_completed:true,evidence:[evidence],summary};
}

export function validateBitgetN12BoundedTradeSample(row,now){
 const buy=finite(row?.buy_quote_turnover_usdt),sell=finite(row?.sell_quote_turnover_usdt),total=finite(row?.value);
 return row?.block_id==='N12'&&row?.metric_family==='ACTUAL_BITGET_TAKER_TRADES_BOUNDED'&&['SPOT','FUTURES'].includes(row?.market)&&row.provider_id===`BITGET_${row.market}_TRADES`&&row.upstream_id===`BITGET_OFFICIAL_PUBLIC_${row.market}_TRADES`&&row.venue==='BITGET'&&row.independent_venue_root==='BITGET'&&row.exact_asset_binding===true&&Boolean(verifiedAssetRouteIdentity({contract:row.htx_contract,asset_identity:row.identity,identity_method:row.identity_method,asset_binding_proof:row.asset_binding_proof}))&&row.identity&&row.source_clock_policy==='ORIGINAL_BITGET_TRADE_TIMESTAMPS'&&row.coverage_status==='BOUNDED_DIRECTIONAL_SAMPLE'&&row.coverage_fraction===0&&row.directional_strength===null&&row.whole_window_coverage_proven===false&&row.score_contribution===0&&row.entry_authorized===false&&row.unit==='USDT'&&Number.isSafeInteger(row.valid_recent_rows)&&row.valid_recent_rows>0&&buy!==null&&sell!==null&&buy>=0&&sell>=0&&total>0&&Math.abs(buy+sell-total)<=Math.max(.000001,total*.000001)&&Math.abs((buy-sell)/total-row.taker_imbalance)<=1e-9&&row.origin_event_id===row.physical_root_key&&String(row.origin_event_id).startsWith(`BITGET_BOUNDED_TRADE_SAMPLE:${row.htx_contract}:${row.market}:`)&&Number.isSafeInteger(row.source_ts)&&row.source_ts<=now&&now-row.source_ts<=WINDOW&&row.expires_at>now;
}
