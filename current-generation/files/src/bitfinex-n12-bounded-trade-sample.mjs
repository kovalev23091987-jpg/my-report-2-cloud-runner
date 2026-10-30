import {createHash} from 'node:crypto';
import {buildEvidenceV2} from './evidence-source-adapters.mjs';
import {exactBitfinexNativeMarket,exactBitfinexNativeIdentity,bitfinexNativeMarket} from './bitfinex-native-four-hour-flow.mjs';

export const BITFINEX_N12_BOUNDED_SAMPLE_VERSION='bitfinex-n12-bounded-trade-sample-v1-20261018';
const WINDOW=300000,TTL=60000;
const hash=x=>createHash('sha256').update(x).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const exactIdentity=(contract,identity)=>exactBitfinexNativeIdentity(contract,identity)&&identity.asset_kind===(identity.contract_or_mint?'TOKEN':'NATIVE');
const tradeURL=(contract,end)=>`https://api-pub.bitfinex.com/v2/trades/t${bitfinexNativeMarket(contract)}/hist?start=${end-14400000}&end=${end-1}&limit=10000&sort=1`;

// The existing N05 request already obtains this page. Its receipt binds tuples
// (which contain no symbol) to the exact USD pair, window and original clock.
// payload_sha256 binds parsed tuples; body_sha256 separately identifies wire
// bytes. A partial page never proves whole-window volume or another venue.
export function normalizeBitfinexN12BoundedTradeSample({contract,identity,catalog,trades,trade_receipt:r,window_end_ts:end,observed_ts}={}){
 const root={version:BITFINEX_N12_BOUNDED_SAMPLE_VERSION,status:'EXACT_RECENT_BITFINEX_TRADE_PAGE_REQUIRED',check_completed:false,evidence:[],summary:null,network_calls:0,internal_only:true};
 if(!exactIdentity(contract,identity)||!exactBitfinexNativeMarket({contract,identity,catalog})||!Number.isSafeInteger(end)||end%60000||!Number.isSafeInteger(observed_ts)||observed_ts<end||observed_ts-end>120000||!Array.isArray(trades)||trades.length>10000||r?.http_status!==200||r.url!==tradeURL(contract,end)||r.received_ts!==observed_ts||!hex(r.body_sha256)||r.payload_sha256!==hash(JSON.stringify(trades)))return root;
 const ids=new Set(),recent=[];let previous=-1;
 for(const t of trades){
  if(!Array.isArray(t)||t.length!==4||!Number.isSafeInteger(t[0])||t[0]<=0||ids.has(t[0])||!Number.isSafeInteger(t[1])||t[1]<end-14400000||t[1]>=end||t[1]<previous||!Number.isFinite(t[2])||t[2]===0||!Number.isFinite(t[3])||t[3]<=0||!Number.isFinite(Math.abs(t[2])*t[3]))return root;
  ids.add(t[0]);previous=t[1];if(t[1]>=end-WINDOW)recent.push({id:t[0],ts:t[1],buy:t[2]>0,quote:Math.abs(t[2])*t[3]});
 }
 const buy=recent.filter(t=>t.buy).reduce((s,t)=>s+t.quote,0),sell=recent.filter(t=>!t.buy).reduce((s,t)=>s+t.quote,0),total=buy+sell;
 const summary={venue:'BITFINEX',market:'SPOT',quote:'USD',returned_rows:trades.length,valid_recent_rows:recent.length,buy_quote_turnover_usd:buy,sell_quote_turnover_usd:sell,window_start:end-WINDOW,window_end:end,whole_window_coverage_proven:false,saturated:trades.length===10000};
 if(!recent.length)return{...root,status:'NO_RECENT_ORIGINAL_TRADES',summary};
 const latest=recent.at(-1),physical=`BITFINEX_BOUNDED_TRADE_SAMPLE:${contract}:SPOT:${latest.id}`,expires=Math.min(observed_ts+TTL,latest.ts+WINDOW);
 if(!(total>0&&Number.isFinite(total))||expires<=observed_ts)return{...root,status:'SOURCE_SAMPLE_EXPIRED',summary};
 const evidence=buildEvidenceV2({provider_id:'BITFINEX_SPOT_TRADES',upstream_id:'BITFINEX_OFFICIAL_PUBLIC_SPOT_TRADES',asset_id:`HTX:${contract}`,htx_contract:contract,block_id:'N12',metric_family:'ACTUAL_BITFINEX_TAKER_TRADES_BOUNDED',origin_event_id:physical,dependency_group:physical,source_ts:latest.ts,observed_ts,expires_at:expires,coverage_status:'BOUNDED_DIRECTIONAL_SAMPLE',coverage_fraction:0,directional_strength:null,unit:'USD',value:total,extra:{physical_root_key:physical,venue:'BITFINEX',market:'SPOT',quote:'USD',independent_venue_root:'BITFINEX',exact_asset_binding:true,identity,source_symbol:bitfinexNativeMarket(contract),source_clock_policy:'ORIGINAL_BITFINEX_TRADE_MILLISECONDS',direction_semantics:'OFFICIAL_POSITIVE_BOUGHT_NEGATIVE_SOLD_AMOUNT',window_start:end-WINDOW,window_end:end,valid_recent_rows:recent.length,buy_quote_turnover_usd:buy,sell_quote_turnover_usd:sell,taker_imbalance:(buy-sell)/total,trade_receipt:{url:r.url,http_status:200,received_ts:observed_ts,body_sha256:r.body_sha256,payload_sha256:r.payload_sha256},whole_window_coverage_proven:false,score_contribution:0,entry_authorized:false}});
 return{...root,status:'CLOSED_BOUNDED_SAMPLE',check_completed:true,evidence:[evidence],summary};
}

export function validateBitfinexN12BoundedTradeSample(row,now){
 const r=row?.trade_receipt,buy=row?.buy_quote_turnover_usd,sell=row?.sell_quote_turnover_usd,total=row?.value,end=row?.window_end;
 return Boolean(row&&Number.isSafeInteger(now)&&exactIdentity(row.htx_contract,row.identity)&&row.asset_id===`HTX:${row.htx_contract}`&&row.block_id==='N12'&&row.metric_family==='ACTUAL_BITFINEX_TAKER_TRADES_BOUNDED'&&row.provider_id==='BITFINEX_SPOT_TRADES'&&row.upstream_id==='BITFINEX_OFFICIAL_PUBLIC_SPOT_TRADES'&&row.venue==='BITFINEX'&&row.market==='SPOT'&&row.quote==='USD'&&row.unit==='USD'&&row.independent_venue_root==='BITFINEX'&&row.exact_asset_binding===true&&row.source_symbol===bitfinexNativeMarket(row.htx_contract)&&row.source_clock_policy==='ORIGINAL_BITFINEX_TRADE_MILLISECONDS'&&row.direction_semantics==='OFFICIAL_POSITIVE_BOUGHT_NEGATIVE_SOLD_AMOUNT'&&row.coverage_status==='BOUNDED_DIRECTIONAL_SAMPLE'&&row.coverage_fraction===0&&row.directional_strength===null&&row.whole_window_coverage_proven===false&&row.score_contribution===0&&row.entry_authorized===false&&Number.isSafeInteger(row.valid_recent_rows)&&row.valid_recent_rows>0&&row.valid_recent_rows<=10000&&Number.isFinite(buy)&&buy>=0&&Number.isFinite(sell)&&sell>=0&&Number.isFinite(total)&&total>0&&Math.abs(buy+sell-total)<=Math.max(1e-8,total*1e-10)&&Number.isFinite(row.taker_imbalance)&&Math.abs((buy-sell)/total-row.taker_imbalance)<=1e-10&&Number.isSafeInteger(end)&&end%60000===0&&row.window_start===end-WINDOW&&Number.isSafeInteger(row.source_ts)&&row.source_ts>=row.window_start&&row.source_ts<end&&Number.isSafeInteger(row.observed_ts)&&row.observed_ts>=end&&row.observed_ts-end<=120000&&row.first_known_ts===row.observed_ts&&row.observed_ts<=now&&row.expires_at===Math.min(row.observed_ts+TTL,row.source_ts+WINDOW)&&row.expires_at>now&&r?.url===tradeURL(row.htx_contract,end)&&r.http_status===200&&r.received_ts===row.observed_ts&&hex(r.body_sha256)&&hex(r.payload_sha256)&&row.origin_event_id===row.physical_root_key&&row.dependency_group===row.physical_root_key&&new RegExp(`^BITFINEX_BOUNDED_TRADE_SAMPLE:${row.htx_contract}:SPOT:[1-9][0-9]*$`).test(row.origin_event_id));
}
