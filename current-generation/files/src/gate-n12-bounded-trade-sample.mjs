import {createHash} from 'node:crypto';
import {verifiedAssetRouteIdentity} from './verified-asset-route-identity.mjs';
import {exactGateTokenBinding} from './gate-four-hour-flow.mjs';
import {GATE_PUBLIC_TAKER_REFERENCE} from './gate-public-taker-reference.mjs';
import {buildEvidenceV2} from './evidence-source-adapters.mjs';

export const GATE_N12_BOUNDED_SAMPLE_VERSION='gate-n12-bounded-trade-sample-v1-20261018';
const WINDOW=300000,TTL=60000;
const hash=x=>createHash('sha256').update(x).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const number=x=>typeof x==='number'&&Number.isFinite(x);
const decimal=x=>typeof x==='string'&&/^\d+(?:\.\d{1,18})?$/.test(x)&&Number.isFinite(Number(x))?Number(x):null;
const tradeId=x=>typeof x==='string'&&/^\d{1,32}$/.test(x)?x:null;
const url=(contract,end,page)=>`https://api.gateio.ws/api/v4/spot/trades?currency_pair=${encodeURIComponent(contract.slice(0,-5)+'_USDT')}&from=${(end-14400000)/1000}&to=${end/1000-1}&limit=1000&page=${page}`;
function referenceClosed(contract,identity,reference){
 try{return exactGateTokenBinding({contract,identity,currencies:reference?.currencies,spot:reference?.spot})&&reference.direction_reference_id===GATE_PUBLIC_TAKER_REFERENCE.reference_id&&GATE_PUBLIC_TAKER_REFERENCE.verified===true;}catch{return false;}
}
function receiptsClosed(receipts,contract,end,observed){
 return Array.isArray(receipts)&&receipts.length>=1&&receipts.length<=3&&receipts.every((r,i)=>r?.url===url(contract,end,i+1)&&r.http_status===200&&Number.isSafeInteger(r.received_ts)&&r.received_ts>=end&&r.received_ts<=observed&&hex(r.body_sha256)&&hex(r.payload_sha256))&&Math.max(...receipts.map(r=>r.received_ts))===observed;
}

// Reuse the exact N05 pages, including when the 240-minute reconciliation is
// incomplete. Receipt clocks are immutable; neither pagination nor a cache
// envelope proves a complete five-minute sample or refreshes old trades.
export function normalizeGateN12BoundedTradeSample({contract,identity,identity_method,asset_binding_proof,currencies,spot,pages=[],trade_receipts,window_end_ts:end,observed_ts}={}){
 const root={version:GATE_N12_BOUNDED_SAMPLE_VERSION,status:'EXACT_RECENT_GATE_SPOT_TRADE_PAGE_REQUIRED',check_completed:false,evidence:[],summary:null,network_calls:0,internal_only:true};
 if(typeof contract!=='string')return root;
 const reference={currencies:Array.isArray(currencies)?currencies.filter(r=>r?.currency===contract?.slice(0,-5)):[],spot:Array.isArray(spot)?spot.filter(r=>r?.id===contract?.slice(0,-5)+'_USDT'):[],direction_reference_id:GATE_PUBLIC_TAKER_REFERENCE.reference_id};
 if(!verifiedAssetRouteIdentity({contract,asset_identity:identity,identity_method,asset_binding_proof})||!referenceClosed(contract,identity,reference)||!Number.isSafeInteger(end)||end%60000||!Number.isSafeInteger(observed_ts)||observed_ts<end||observed_ts-end>=WINDOW||!Array.isArray(pages)||pages.length<1||pages.length>3||!receiptsClosed(trade_receipts,contract,end,observed_ts)||trade_receipts.length!==pages.length)return root;
 const ids=new Set(),recent=[];let returned=0,previous=null;
 for(let i=0;i<pages.length;i++){
  const page=pages[i];if(!Array.isArray(page)||page.length>1000||trade_receipts[i].payload_sha256!==hash(JSON.stringify(page)))return root;
  for(const r of page){
   const id=tradeId(r?.id),ts=typeof r?.create_time_ms==='string'&&/^\d{13}(?:\.\d{1,9})?$/.test(r.create_time_ms)?Number(r.create_time_ms.split('.')[0]):null,price=decimal(r?.price),amount=decimal(r?.amount),quote=price*amount;
   if(!id||ids.has(id)||previous!==null&&BigInt(id)>=previous||!Number.isSafeInteger(ts)||ts<end-14400000||ts>=end||r.currency_pair!==contract.slice(0,-5)+'_USDT'||r.trade_quote&&r.trade_quote!=='USDT'||r.money&&r.money!=='USDT'||r.stock&&r.stock!==contract.slice(0,-5)||r.trade_mode&&r.trade_mode!==0||r.role&&r.role!=='taker'||!['buy','sell'].includes(r.side)||!(price>0&&amount>0&&quote>0&&Number.isFinite(quote)))return root;
   ids.add(id);previous=BigInt(id);returned++;if(ts>=end-WINDOW)recent.push({id,ts,side:r.side,quote});
  }
 }
 const buy=recent.filter(r=>r.side==='buy').reduce((n,r)=>n+r.quote,0),sell=recent.filter(r=>r.side==='sell').reduce((n,r)=>n+r.quote,0),total=buy+sell;
 const summary={venue:'GATE',market:'SPOT',quote:'USDT',returned_rows:returned,valid_recent_rows:recent.length,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,window_start:end-WINDOW,window_end:end,saturated:pages.some(p=>p.length===1000),whole_window_coverage_proven:false};
 if(!recent.length)return{...root,status:'NO_RECENT_ORIGINAL_TRADES',summary};
 const latest=recent.reduce((a,b)=>a.ts>b.ts?a:b),expires=Math.min(observed_ts+TTL,latest.ts+WINDOW);
 if(!(number(total)&&total>0)||expires<=observed_ts)return{...root,status:'SOURCE_SAMPLE_EXPIRED',summary};
 const physical=`GATE_BOUNDED_SPOT_TRADE_SAMPLE:${contract}:${latest.id}`,receipts=trade_receipts.map(r=>({url:r.url,http_status:200,received_ts:r.received_ts,body_sha256:r.body_sha256,payload_sha256:r.payload_sha256}));
 const evidence=buildEvidenceV2({provider_id:'GATE_SPOT_TRADES',upstream_id:'GATE_OFFICIAL_PUBLIC_SPOT_TRADES',asset_id:`HTX:${contract}`,htx_contract:contract,block_id:'N12',metric_family:'ACTUAL_GATE_SPOT_TAKER_TRADES_BOUNDED',origin_event_id:physical,dependency_group:physical,source_ts:latest.ts,observed_ts,expires_at:expires,coverage_status:'BOUNDED_DIRECTIONAL_SAMPLE',coverage_fraction:0,directional_strength:null,unit:'USDT',value:total,extra:{physical_root_key:physical,venue:'GATE',market:'SPOT',quote:'USDT',independent_venue_root:'GATE',exact_asset_binding:true,identity,identity_method,...(asset_binding_proof?{asset_binding_proof}:{}),asset_reference:reference,trade_receipts:receipts,source_clock_policy:'ORIGINAL_GATE_TRADE_MILLISECONDS',direction_semantics:'PAIRED_PUBLIC_REST_TAKER_SIDE',window_start:end-WINDOW,window_end:end,valid_recent_rows:recent.length,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,taker_imbalance:(buy-sell)/total,whole_window_coverage_proven:false,score_contribution:0,entry_authorized:false}});
 return{...root,status:'CLOSED_BOUNDED_SAMPLE',check_completed:true,evidence:[evidence],summary};
}

export function validateGateN12BoundedTradeSample(row,now){
 const end=row?.window_end,buy=row?.buy_quote_turnover_usdt,sell=row?.sell_quote_turnover_usdt,total=row?.value;
 return Boolean(row&&Number.isSafeInteger(now)&&verifiedAssetRouteIdentity({contract:row.htx_contract,asset_identity:row.identity,identity_method:row.identity_method,asset_binding_proof:row.asset_binding_proof})&&referenceClosed(row.htx_contract,row.identity,row.asset_reference)&&row.asset_id===`HTX:${row.htx_contract}`&&row.block_id==='N12'&&row.metric_family==='ACTUAL_GATE_SPOT_TAKER_TRADES_BOUNDED'&&row.provider_id==='GATE_SPOT_TRADES'&&row.upstream_id==='GATE_OFFICIAL_PUBLIC_SPOT_TRADES'&&row.venue==='GATE'&&row.market==='SPOT'&&row.quote==='USDT'&&row.unit==='USDT'&&row.independent_venue_root==='GATE'&&row.exact_asset_binding===true&&row.source_clock_policy==='ORIGINAL_GATE_TRADE_MILLISECONDS'&&row.direction_semantics==='PAIRED_PUBLIC_REST_TAKER_SIDE'&&row.coverage_status==='BOUNDED_DIRECTIONAL_SAMPLE'&&row.coverage_fraction===0&&row.directional_strength===null&&row.whole_window_coverage_proven===false&&row.score_contribution===0&&row.entry_authorized===false&&Number.isSafeInteger(row.valid_recent_rows)&&row.valid_recent_rows>0&&row.valid_recent_rows<=3000&&number(buy)&&buy>=0&&number(sell)&&sell>=0&&number(total)&&total>0&&Math.abs(buy+sell-total)<=Math.max(1e-8,total*1e-10)&&number(row.taker_imbalance)&&Math.abs((buy-sell)/total-row.taker_imbalance)<=1e-10&&Number.isSafeInteger(end)&&end%60000===0&&row.window_start===end-WINDOW&&Number.isSafeInteger(row.source_ts)&&row.source_ts>=row.window_start&&row.source_ts<end&&Number.isSafeInteger(row.observed_ts)&&row.observed_ts>=end&&row.observed_ts-end<WINDOW&&row.first_known_ts===row.observed_ts&&row.observed_ts<=now&&row.expires_at===Math.min(row.observed_ts+TTL,row.source_ts+WINDOW)&&row.expires_at>now&&receiptsClosed(row.trade_receipts,row.htx_contract,end,row.observed_ts)&&typeof row.origin_event_id==='string'&&row.origin_event_id===row.physical_root_key&&row.dependency_group===row.physical_root_key&&row.origin_event_id.startsWith(`GATE_BOUNDED_SPOT_TRADE_SAMPLE:${row.htx_contract}:`)&&/^\d{1,32}$/.test(row.origin_event_id.slice(`GATE_BOUNDED_SPOT_TRADE_SAMPLE:${row.htx_contract}:`.length)));
}
