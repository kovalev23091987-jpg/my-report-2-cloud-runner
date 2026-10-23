import {createHash} from 'node:crypto';
import {buildEvidenceV2} from './evidence-source-adapters.mjs';
import {exactKrakenNativeBinding,krakenNativeMarketCode} from './kraken-four-hour-flow.mjs';
import {KRAKEN_PUBLIC_TAKER_REFERENCE} from './kraken-public-taker-reference.mjs';
import {inspectKrakenN10CachedPricePath} from './kraken-n10-price-path.mjs';
export const KRAKEN_N12_BOUNDED_SAMPLE_VERSION='kraken-n12-bounded-trade-sample-v1-20261019';
const WINDOW=300000,TTL=60000,FOUR_HOURS=14400000;
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const tradeURL=(symbol,cursor)=>`https://api.kraken.com/0/public/Trades?pair=${encodeURIComponent(symbol)}&since=${cursor}&count=1000`;
const number=x=>typeof x==='number'&&Number.isFinite(x);
const decimal=x=>typeof x==='string'&&/^\d+(?:\.\d{1,18})?$/.test(x)&&Number.isFinite(Number(x))&&Number(x)>0?Number(x):null;
function readRecent(rows,end){
 if(!Array.isArray(rows)||rows.length>3000)return null;
 const out=[];let previousId=0,previousTime=-1;
 for(const r of rows){
  const ts=Math.floor(r?.[2]*1000),price=decimal(r?.[0]),amount=decimal(r?.[1]);
  if(!Array.isArray(r)||r.length!==7||!Number.isSafeInteger(r[6])||r[6]<=previousId||!number(r[2])||r[2]<previousTime||!Number.isSafeInteger(ts)||ts<end-WINDOW||ts>=end||!['b','s'].includes(r[3])||!['l','m'].includes(r[4])||r[5]!==''||!price||!amount||!Number.isFinite(price*amount))return null;
  previousId=r[6];previousTime=r[2];out.push({id:r[6],ts,buy:r[3]==='b',quote:price*amount});
 }
 return out;
}
function receiptsValid(receipts,contract,end,observed){
 if(!Array.isArray(receipts)||!receipts.length||receipts.length>3)return false;
 let cursor=(BigInt(end-FOUR_HOURS)*1000000n-1n).toString();
 for(const r of receipts){
  if(r?.url!==tradeURL(krakenNativeMarketCode(contract),cursor)||r.http_status!==200||!Number.isSafeInteger(r.received_ts)||r.received_ts<end||r.received_ts>observed||!hex(r.body_sha256)||!hex(r.payload_sha256)||typeof r.next_cursor!=='string'||!/^\d{1,24}$/.test(r.next_cursor)||BigInt(r.next_cursor)<=BigInt(cursor))return false;
  cursor=r.next_cursor;
 }
 return Math.max(...receipts.map(r=>r.received_ts))===observed;
}
function makeFact({contract,identity,instrument,rows,trade_receipts,cache_binding,end,observed}){
 const recent=readRecent(rows,end);if(!recent?.length)return null;
 const buy=recent.filter(r=>r.buy).reduce((a,b)=>a+b.quote,0),sell=recent.filter(r=>!r.buy).reduce((a,b)=>a+b.quote,0),total=buy+sell,last=recent.at(-1);
 if(!(total>0&&Number.isFinite(total)))return null;
 const physical=`KRAKEN_BOUNDED_SPOT_TRADE_SAMPLE:${contract}:${last.id}`;
 identity={...identity};instrument=Object.fromEntries(['altname','base','quote','wsname','status'].map(k=>[k,instrument[k]]));rows=rows.map(r=>[...r]);trade_receipts=trade_receipts.map(r=>({...r}));cache_binding={...cache_binding};
 return buildEvidenceV2({provider_id:'KRAKEN_SPOT_TRADES',upstream_id:'KRAKEN_OFFICIAL_PUBLIC_SPOT_TRADES',asset_id:`HTX:${contract}`,htx_contract:contract,block_id:'N12',metric_family:'ACTUAL_KRAKEN_SPOT_TAKER_TRADES_BOUNDED',origin_event_id:physical,dependency_group:physical,source_ts:last.ts,observed_ts:observed,first_known_ts:observed,expires_at:Math.min(observed+TTL,last.ts+WINDOW),coverage_status:'BOUNDED_DIRECTIONAL_SAMPLE',coverage_fraction:0,directional_strength:null,risk_strength:null,unit:'USDT',value:total,extra:{version:KRAKEN_N12_BOUNDED_SAMPLE_VERSION,physical_root_key:physical,venue:'KRAKEN',market:'SPOT',quote:'USDT',independent_venue_root:'KRAKEN',independent_venue_count:1,exact_asset_binding:true,identity,instrument,direction_reference_id:KRAKEN_PUBLIC_TAKER_REFERENCE.reference_id,direction_semantics:'PAIRED_OFFICIAL_PUBLIC_TAKER_SIDE',source_clock_policy:'ORIGINAL_KRAKEN_TRADE_SECONDS_FLOORED_TO_MILLISECONDS',window_start:end-WINDOW,window_end:end,valid_recent_rows:recent.length,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,taker_imbalance:(buy-sell)/total,raw_recent_trades:rows,trade_receipts,source_cache_binding:cache_binding,whole_window_coverage_proven:false,score_contribution:0,entry_authorized:false,liquidation_as_target:false,network_calls:0}});
}
// Provider-side preparation only. Raw tuples are already present in N05;
// receipt/pagination/asset binding must be retained before a new N12 fact exists.
export function normalizeKrakenN12BoundedTradeSample({contract,component,cache,trade_receipts,now}={}){
 const root={version:KRAKEN_N12_BOUNDED_SAMPLE_VERSION,status:'EXACT_BOUND_KRAKEN_PAGES_AND_RECEIPTS_REQUIRED',check_completed:false,evidence:[],summary:null,network_calls:0,internal_only:true};
 try{
  const end=component?.window_end_ts,observed=cache?.observed_ts,p=cache?.payload;
  const checked=inspectKrakenN10CachedPricePath({contract,component,cache,now});
  if(!checked.price_path||!receiptsValid(trade_receipts,contract,end,observed)||trade_receipts.length!==p.pages.length)return root;
  const rows=[];
  for(let i=0;i<p.pages.length;i++){
   const page=p.pages[i],receipt=trade_receipts[i];
   if(receipt.payload_sha256!==sha(page)||receipt.next_cursor!==page.result.last)return root;
   for(const row of page.result[p.instrument.altname])if(row[2]*1000>=end-WINDOW&&row[2]*1000<end)rows.push(row);
  }
  if(!rows.length)return{...root,status:'NO_RECENT_ORIGINAL_TRADES'};
  const fact=makeFact({contract,identity:component.identity,instrument:p.instrument,rows,trade_receipts,cache_binding:checked.price_path.source_cache_binding,end,observed});
  if(!fact||fact.expires_at<=now)return{...root,status:'ORIGINAL_BOUNDED_SAMPLE_EXPIRED'};
  return{...root,status:'CLOSED_BOUNDED_SAMPLE',check_completed:true,evidence:[fact],summary:{venue:'KRAKEN',market:'SPOT',quote:'USDT',valid_recent_rows:fact.valid_recent_rows,buy_quote_turnover_usdt:fact.buy_quote_turnover_usdt,sell_quote_turnover_usdt:fact.sell_quote_turnover_usdt,window_start:end-WINDOW,window_end:end,source_ts:fact.source_ts,first_known_ts:observed,whole_window_coverage_proven:false}};
 }catch{return root;}
}
// Compact stored-fact integrity at producer-receipt trust. This does not fetch
// raw pages or establish a new independent durable cache/wire acknowledgement.
export function validateKrakenN12BoundedTradeSample(row,now){
 try{
  const end=row?.window_end,observed=row?.observed_ts,binding=row?.source_cache_binding;
  if(!Number.isSafeInteger(now)||!Number.isSafeInteger(end)||end%60000||!Number.isSafeInteger(observed)||observed<end||observed>now||!exactKrakenNativeBinding({contract:row.htx_contract,identity:row.identity,instrument:row.instrument})||!receiptsValid(row.trade_receipts,row.htx_contract,end,observed)||row.first_known_ts!==observed||row.expires_at<=now||KRAKEN_PUBLIC_TAKER_REFERENCE.verified!==true||binding?.schema!=='KRAKEN_N10_REDERIVED_CACHE_BINDING_V1'||binding.source!=='N05_OFFICIAL_FLOW:KRAKEN'||binding.asset_key!==`NATIVE_FLOW:${row.htx_contract}:${end}`||binding.cache_observed_ts!==observed||binding.cache_expires_ts!==end+300000||![binding.cache_payload_sha256,binding.rederived_component_sha256,binding.selected_price_bars_sha256].every(hex))return false;
  const rebuilt=makeFact({contract:row.htx_contract,identity:row.identity,instrument:row.instrument,rows:row.raw_recent_trades,trade_receipts:row.trade_receipts,cache_binding:binding,end,observed});
  return Boolean(rebuilt&&JSON.stringify(rebuilt)===JSON.stringify(row));
 }catch{return false;}
}
