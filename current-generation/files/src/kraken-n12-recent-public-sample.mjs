import {createHash} from 'node:crypto';
import {buildEvidenceV2} from './evidence-source-adapters.mjs';
import {exactKrakenNativeBinding} from './kraken-four-hour-flow.mjs';
import {KRAKEN_PUBLIC_TAKER_REFERENCE} from './kraken-public-taker-reference.mjs';
export const KRAKEN_RECENT_PUBLIC_VERSION='kraken-n12-recent-public-carrier-v1-20261019';
// Conservative availability of the retained CLOSED direction result. This is
// not a reconstructed first execution/authority time or a refreshed trade clock.
export const KRAKEN_RECENT_DIRECTION_AVAILABILITY=Object.freeze({reference_id:'KRAKEN_PAIRED_PUBLIC_TAKER_V2_38066590063',raw_receipt_lower_bound:1791648650537,known_ts:1791648709892,summary_sha256:'e3610013fc73174abea0459cceccd22d798b238f20a198b93dd79213f5e19edc',known_policy:'CONSERVATIVE_SAVED_DIRECTION_RESULT_COMPLETION'});
const WINDOW=300000,TTL=60000,REF_TTL=21600000;
const native=Object.freeze({DOT:{chain:'polkadot',htx_chain:'dot1'},ATOM:{chain:'cosmos',htx_chain:'atom1'}});
const hash=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function wire(c,url,now){
 const r=c?.receipt;
 if(typeof c?.body_utf8!=='string'||Buffer.byteLength(c.body_utf8)>8*1024*1024||r?.url!==url||r.http_status!==200||!Number.isSafeInteger(r.received_ts)||r.received_ts<1e12||r.received_ts>now||!hex(r.body_sha256)||hash(c.body_utf8)!==r.body_sha256)throw Error('EXACT_ORIGINAL_WIRE_RECEIPT_REQUIRED');
 const data=JSON.parse(c.body_utf8);return{data,receipt:{url,http_status:200,received_ts:r.received_ts,body_sha256:r.body_sha256,payload_sha256:hash(JSON.stringify(data))}};
}
function selectedTrades(rows,end){
 const ids=new Set(),recent=[];let lastId=0,lastTime=-1;
 if(!Array.isArray(rows)||!rows.length||rows.length>1000)throw Error('BOUNDED_NATIVE_RECENT_PAGE_REQUIRED');
 for(const r of rows){
  const price=typeof r?.[0]==='string'&&/^\d+(?:\.\d{1,18})?$/.test(r[0])?Number(r[0]):null,amount=typeof r?.[1]==='string'&&/^\d+(?:\.\d{1,18})?$/.test(r[1])?Number(r[1]):null;
  if(!Array.isArray(r)||r.length!==7||!Number.isSafeInteger(r[6])||r[6]<=lastId||ids.has(r[6])||typeof r[2]!=='number'||!Number.isFinite(r[2])||r[2]<lastTime||!['b','s'].includes(r[3])||!['l','m'].includes(r[4])||r[5]!==''||!(price>0&&amount>0&&Number.isFinite(price*amount)))throw Error('INVALID_NATIVE_RECENT_TRADE');
  lastId=r[6];lastTime=r[2];ids.add(r[6]);const ts=Math.floor(r[2]*1000);
  if(ts>=end-WINDOW&&ts<end)recent.push({id:r[6],ts,buy:r[3]==='b',quote:price*amount,raw:[...r]});
 }
 return recent;
}
function fact({contract,identity,instrument,recent,receipts,plan,first,returned}){
 const buy=recent.filter(r=>r.buy).reduce((a,r)=>a+r.quote,0),sell=recent.filter(r=>!r.buy).reduce((a,r)=>a+r.quote,0),total=buy+sell,last=recent.at(-1),end=plan.window_end_ts;
 if(!last||!(total>0&&Number.isFinite(total)))throw Error('NO_RECENT_ORIGINAL_TRADES');
 const root=`KRAKEN_BOUNDED_SPOT_TRADE_SAMPLE:${contract}:${last.id}`;
 return buildEvidenceV2({provider_id:'KRAKEN_SPOT_TRADES',upstream_id:'KRAKEN_OFFICIAL_PUBLIC_SPOT_TRADES',asset_id:`HTX:${contract}`,htx_contract:contract,block_id:'N12',metric_family:'ACTUAL_KRAKEN_SPOT_TAKER_TRADES_BOUNDED',origin_event_id:root,dependency_group:root,source_ts:last.ts,observed_ts:first,first_known_ts:first,expires_at:Math.min(first+TTL,last.ts+WINDOW),coverage_status:'BOUNDED_DIRECTIONAL_SAMPLE',coverage_fraction:0,directional_strength:null,risk_strength:null,unit:'USDT',value:total,extra:{version:KRAKEN_RECENT_PUBLIC_VERSION,carrier_kind:'RECENT_PUBLIC_NO_SINCE',physical_root_key:root,venue:'KRAKEN',market:'SPOT',quote:'USDT',independent_venue_root:'KRAKEN',independent_venue_count:1,exact_asset_binding:true,identity,instrument,direction_reference:KRAKEN_RECENT_DIRECTION_AVAILABILITY,source_clock_policy:'ORIGINAL_KRAKEN_TRADE_SECONDS_FLOORED_TO_MILLISECONDS',first_known_policy:'MAX_ORIGINAL_RECEIPTS_AND_CONSERVATIVE_REFERENCE_COMPLETION',window_plan:{...plan},window_start:end-WINDOW,window_end:end,returned_rows:returned,saturated:returned===1000,valid_recent_rows:recent.length,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,taker_imbalance:(buy-sell)/total,raw_recent_trades:recent.map(r=>r.raw),source_receipts:receipts,whole_window_coverage_proven:false,full_240m_qualification_claimed:false,native_quote_volume_available:false,quote_turnover_basis:'RAW_NATIVE_PRICE_TIMES_BASE_AMOUNT_SUM',score_contribution:0,entry_authorized:false,liquidation_as_target:false,network_calls:0}});
}
// Separate source carrier; no full240/SINCE normalizer, cache, HTTP or SQL call.
export function normalizeKrakenRecentPublicN12({contract,htx_reference,pairs_reference,recent_page,window_plan,now}={}){
 const root={version:KRAKEN_RECENT_PUBLIC_VERSION,status:'RECENT_PUBLIC_SOURCE_NOT_CLOSED',check_completed:false,evidence:[],network_calls:0,internal_only:true};
 try{
  const base=String(contract||'').replace(/-USDT$/,''),def=native[base],end=window_plan?.window_end_ts,planned=window_plan?.known_ts;
  if(!def||contract!==base+'-USDT'||!Number.isSafeInteger(now)||!Number.isSafeInteger(end)||!Number.isSafeInteger(planned)||end!==Math.floor(planned/60000)*60000||planned>now||typeof window_plan?.plan_id!=='string'||!window_plan.plan_id)throw Error('EXACT_NATIVE_ASSET_AND_ORIGINAL_WINDOW_PLAN_REQUIRED');
  const htx=wire(htx_reference,'https://api.huobi.pro/v2/reference/currencies',now),pairs=wire(pairs_reference,'https://api.kraken.com/0/public/AssetPairs',now),page=wire(recent_page,`https://api.kraken.com/0/public/Trades?pair=${base}USDT&count=1000`,now);
  if(htx.data.code!==200||!Array.isArray(htx.data.data)||pairs.data.error?.length!==0||!pairs.data.result||Array.isArray(pairs.data.result)||page.data.error?.length!==0||!page.data.result||Array.isArray(page.data.result)||planned>page.receipt.received_ts)throw Error('SOURCE_REFERENCE_OR_PLAN_NOT_CLOSED');
  const first=Math.max(page.receipt.received_ts,htx.receipt.received_ts,pairs.receipt.received_ts,KRAKEN_RECENT_DIRECTION_AVAILABILITY.known_ts,planned);
  if(first>now||first-end>=WINDOW||first-htx.receipt.received_ts>REF_TTL||first-pairs.receipt.received_ts>REF_TTL||KRAKEN_PUBLIC_TAKER_REFERENCE.verified!==true||KRAKEN_PUBLIC_TAKER_REFERENCE.reference_id!==KRAKEN_RECENT_DIRECTION_AVAILABILITY.reference_id)throw Error('REFERENCE_NOT_KNOWN_OR_EXPIRED');
  const hrows=htx.data.data.filter(r=>String(r.currency).toUpperCase()===base),instruments=Object.values(pairs.data.result).filter(r=>r.altname===base+'USDT');
  if(hrows.length!==1||hrows[0].instStatus!=='normal'||!Array.isArray(hrows[0].chains)||hrows[0].chains.filter(r=>r.chain===def.htx_chain&&r.chainType===0&&!r.contractAddress).length!==1||instruments.length!==1)throw Error('EXACT_PRIMARY_NATIVE_REFERENCE_REQUIRED');
  const identity={chain:def.chain,asset_kind:'NATIVE',native_asset_id:def.chain+':mainnet',contract_or_mint:null},instrument=Object.fromEntries(['altname','base','quote','wsname','status'].map(k=>[k,instruments[0][k]]));
  if(!exactKrakenNativeBinding({contract,identity,instrument}))throw Error('EXACT_KRAKEN_NATIVE_PAIR_REQUIRED');
  const key=instrument.altname,result=page.data.result,rows=result[key];
  if(Object.keys(result).some(k=>k!==key&&k!=='last')||typeof result.last!=='string'||!/^\d{1,24}$/.test(result.last))throw Error('EXACT_NATIVE_RECENT_ENVELOPE_REQUIRED');
  const recent=selectedTrades(rows,end);
  if(rows.some(r=>Math.floor(r[2]*1000)>page.receipt.received_ts))throw Error('FUTURE_RAW_TRADE');
  if(!recent.length)return{...root,status:'NO_RECENT_ORIGINAL_TRADES'};
  const row=fact({contract,identity,instrument,recent,receipts:{htx:htx.receipt,pairs:pairs.receipt,recent:{...page.receipt,next_cursor:result.last}},plan:window_plan,first,returned:rows.length});
  if(row.expires_at<=now)return{...root,status:'ORIGINAL_BOUNDED_SAMPLE_EXPIRED'};
  return{...root,status:'CLOSED_BOUNDED_RECENT_PUBLIC_SAMPLE',check_completed:true,evidence:[row],reference_known_ts:first};
 }catch(e){return{...root,reason:e.message};}
}
// Exact rederivation when the original in-memory carrier is available. No
// retrieval/durable ACK is implied by a stored row or a supplied hash alone.
export function verifyKrakenRecentPublicN12(row,carrier,now){
 const rebuilt=normalizeKrakenRecentPublicN12({...carrier,now}).evidence[0];
 return Boolean(rebuilt&&canonical(rebuilt)===canonical(row));
}
