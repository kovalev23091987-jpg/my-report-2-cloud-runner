// Official fixed-window pagination. Listing/HTTP200 never establishes complete flow.
export const BITGET_FLOW_VERSION='bitget-four-hour-flow-v1-20261010';
const tokenChains={ERC20:'ethereum',SOL:'solana',BEP20:'bsc',ArbitrumOne:'arbitrum',Optimism:'optimism',BASE:'base','AVAXC-Chain':'avalanche',Polygon:'polygon'};
const nativeChains={bitcoin:'BTC',ethereum:'ETH',solana:'SOL',bsc:'BEP20',avalanche:'AVAXC-Chain',cardano:'ADA',xrp:'XRP',stellar:'XLM',polkadot:'DOT',dogecoin:'DOGE',litecoin:'LTC',near:'NEAR',sui:'SUI',aptos:'APT',hedera:'HBAR',tron:'TRX',cosmos:'ATOM'};
export function exactBitgetBinding({contract,identity,coins,instrument,market}={}){
 const base=String(contract||'').replace(/-USDT$/,'');
 if(!identity||contract!==base+'-USDT'||!['SPOT','FUTURES'].includes(market)||instrument?.baseCoin!==base||instrument.quoteCoin!=='USDT'||instrument.symbol!==base+'USDT'||(market==='SPOT'?instrument.status!=='online':instrument.symbolStatus!=='normal'||instrument.symbolType!=='perpetual'||instrument.isRwa==='YES'))return false;
 const rows=coins?.code==='00000'&&Array.isArray(coins.data)?coins.data.filter(r=>r.coin===base):[];if(rows.length!==1)return false;
 const matches=(rows[0].chains||[]).filter(r=>identity.asset_kind==='NATIVE'?r.chain===nativeChains[identity.chain]&&!r.contractAddress&&identity.native_asset_id===identity.chain+':mainnet':tokenChains[r.chain]===identity.chain&&typeof r.contractAddress==='string'&&(identity.chain==='solana'?r.contractAddress===identity.contract_or_mint:r.contractAddress.toLowerCase()===String(identity.contract_or_mint).toLowerCase()));
 return matches.length===1;
}
const dec=v=>{if(typeof v!=='string'||!/^\d+(\.\d+)?$/.test(v))throw Error('INVALID_DECIMAL');const parts=v.split('.'),scale=(parts[1]||'').length;if(scale>18)throw Error('DECIMAL_PRECISION_UNSUPPORTED');return{n:BigInt(parts.join('')),scale};};
const pow=n=>10n**BigInt(n),fixed=d=>d.n*pow(36-d.scale),absolute=n=>n<0n?-n:n;
const roundedMatch=(actual,raw)=>{const d=dec(raw),expected=fixed(d);return d.n===0n||d.scale<8?actual===expected:absolute(actual-expected)<=pow(36-d.scale);};
export function reconcileBitgetFlow({contract,market,pages=[],candles,window_end_ts,observed_ts}={}){
 const start=window_end_ts-14400000,result={version:BITGET_FLOW_VERSION,status:'PARTIAL_FOUR_HOUR_FLOW',check_completed:false,contract,venue:'BITGET',market,quote:'USDT',window_start_ts:start,window_end_ts,observed_ts,verified_minutes:0,pages:pages.length,buy_quote:null,sell_quote:null,trade_count:null,score_contribution:0,entry_authorized:false};
 try{
  if(!['SPOT','FUTURES'].includes(market)||!Number.isSafeInteger(window_end_ts)||window_end_ts%60000||!Number.isSafeInteger(observed_ts)||observed_ts<window_end_ts)throw Error('INVALID_CLOSED_WINDOW');
  if(candles?.code!=='00000'||!Array.isArray(candles.data)||candles.data.length!==240)throw Error('NATIVE_240_MINUTE_GRID_REQUIRED');
  const bars=new Map();for(const r of candles.data){const ts=Number(r?.[0]);if(!Array.isArray(r)||r.length<(market==='SPOT'?8:7)||!Number.isSafeInteger(ts)||ts<start||ts>=window_end_ts||ts%60000||bars.has(ts))throw Error('INVALID_OR_DUPLICATE_MINUTE');dec(r[5]);dec(r[6]);if(market==='SPOT'&&r[6]!==r[7])throw Error('USDT_QUOTE_COLUMN_MISMATCH');bars.set(ts,r);}
  const minutes=new Map(),ids=new Set(),notionals=[];let buy=0n,sell=0n,previous=null;
  for(const page of pages){if(page?.code!=='00000'||!Array.isArray(page.data))throw Error('INVALID_TRADE_PAGE');for(const r of page.data){const id=String(r.tradeId),ts=Number(r.ts),side=String(r.side).toLowerCase();if(!/^\d+$/.test(id)||ids.has(id)||previous!==null&&BigInt(id)>=previous||r.symbol!==contract.replace(/-USDT$/,'USDT')||!Number.isSafeInteger(ts)||ts<start||ts>=window_end_ts||!['buy','sell'].includes(side))throw Error('INVALID_DUPLICATE_FOREIGN_OR_NONADVANCING_TRADE');previous=BigInt(id);ids.add(id);const p=dec(r.price),s=dec(r.size);if(p.n===0n||s.n===0n)throw Error('NONPOSITIVE_TRADE');const q=p.n*s.n*pow(36-p.scale-s.scale),b=fixed(s),m=Math.floor(ts/60000)*60000,old=minutes.get(m)||{base:0n,quote:0n};notionals.push({quote:Number(q)/1e36,side,ts,q});old.base+=b;old.quote+=q;minutes.set(m,old);if(side==='buy')buy+=q;else sell+=q;}}
  const mismatch=[];for(let i=0;i<240;i++){const ts=start+i*60000,r=bars.get(ts);if(!r)throw Error('MISSING_MINUTE');const x=minutes.get(ts)||{base:0n,quote:0n};if(!roundedMatch(x.base,r[5])||!roundedMatch(x.quote,r[6]))mismatch.push(ts);else result.verified_minutes++;}
  result.unreconciled_minutes=mismatch;result.trade_count=ids.size;
  if(mismatch.length)throw Error('MINUTE_BASE_AND_QUOTE_VOLUME_NOT_RECONCILED');if(buy+sell===0n)throw Error('NO_TRADED_VOLUME');
  const sorted=notionals.map(r=>r.quote).sort((a,b)=>a-b),p95=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],large=notionals.filter(r=>r.quote>=p95);
  const recent_windows=[15,60].map(length=>{const rows=notionals.filter(r=>r.ts>=window_end_ts-length*60000),b=rows.filter(r=>r.side==='buy').reduce((n,r)=>n+r.q,0n),s=rows.filter(r=>r.side==='sell').reduce((n,r)=>n+r.q,0n);return{minutes:length,window_start_ts:window_end_ts-length*60000,window_end_ts,buy_quote:Number(b)/1e36,sell_quote:Number(s)/1e36,trade_count:rows.length,imbalance:b+s?Number(b-s)/Number(b+s):null};});
  return{...result,recent_windows,large_individual_trades_available:true,large_trade_context:{method:'CURRENT_WINDOW_TOP_FIVE_PERCENT_NOT_CALIBRATED',threshold_quote:p95,count:large.length,buy_quote:large.filter(r=>r.side==='buy').reduce((a,r)=>a+r.quote,0),sell_quote:large.filter(r=>r.side==='sell').reduce((a,r)=>a+r.quote,0),market_impact_verified:false,score_contribution:0},status:'CLOSED_VOLUME_RECONCILED_FOUR_HOURS',check_completed:true,buy_quote:Number(buy)/1e36,sell_quote:Number(sell)/1e36,imbalance:Number(buy-sell)/Number(buy+sell),volume_precision_policy:'EXACT_DECIMAL_PRODUCTS_WITH_ONE_DISPLAYED_UNIT_ROUNDING_BOUND',raw_trade_counter_independently_verified:false,source_clock_policy:'IMMUTABLE_CLOSED_WINDOW',direction_semantics:'OFFICIAL_PUBLIC_TRADE_SIDE',not_onchain_exchange_flows:true};
 }catch(e){return{...result,reason:e.message};}
}
export function bitgetWindowUrls({contract,market,window_end_ts,cursor}={}){
 const symbol=encodeURIComponent(contract.replace(/-USDT$/,'USDT')),start=window_end_ts-14400000,root='https://api.bitget.com/api/v2/'+(market==='SPOT'?'spot':'mix')+'/market/',product=market==='FUTURES'?'&productType=USDT-FUTURES':'';
 return{candles:root+`candles?symbol=${symbol}${product}&granularity=${market==='SPOT'?'1min':'1m'}&startTime=${start}&endTime=${window_end_ts-1}&limit=240`,fills:root+`fills-history?symbol=${symbol}${product}&startTime=${start}&endTime=${window_end_ts-1}&limit=1000`+(cursor?`&idLessThan=${encodeURIComponent(cursor)}`:'')};
}
export async function acquireBitgetFourHourFlow({get,contract,market,window_end_ts,max_pages=3,clock=Date.now}={}){
 const pages=[],receipts=[];let cursor=null,candles=await get(bitgetWindowUrls({contract,market,window_end_ts}).candles,{kind:'candles',page:0});
 if(!candles)return{status:'NATIVE_CANDLES_NOT_RECEIVED',check_completed:false,pages:0};
 for(let page=0;page<Math.min(3,Math.max(1,max_pages));page++){
  const payload=await get(bitgetWindowUrls({contract,market,window_end_ts,cursor}).fills,{kind:'fills',page,cursor});if(!payload)break;pages.push(payload);
  const out=reconcileBitgetFlow({contract,market,pages,candles,window_end_ts,observed_ts:clock()});if(out.check_completed)return{...out,payloads:{pages,candles}};
  const rows=payload?.data;if(!Array.isArray(rows)||rows.length<1000)break;
  const next=rows.at(-1)?.tradeId;if(!/^\d+$/.test(String(next))||cursor&&BigInt(next)>=BigInt(cursor))break;cursor=String(next);
 }
 return{...reconcileBitgetFlow({contract,market,pages,candles,window_end_ts,observed_ts:clock()}),payloads:{pages,candles},bounded_pagination_exhausted:true};
}

