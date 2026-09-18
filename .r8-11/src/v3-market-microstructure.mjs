export const V3_MARKET_MICROSTRUCTURE_VERSION='v3-market-microstructure-shadow-v1';

function text(v){return v==null?'':String(v).trim();}
function upper(v){return text(v).toUpperCase();}
function finite(v){if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function int(v){const n=finite(v);return n!==null&&Number.isSafeInteger(n)?n:null;}
function closedIdentity(identity,venue){return identity?.identity_status==='CLOSED'&&upper(identity?.venue)===upper(venue)&&text(identity?.htx_contract)&&text(identity?.venue_symbol);}
function notional(price,qty){const p=finite(price),q=finite(qty);return p!==null&&q!==null?Math.abs(p*q):null;}
function result(status,kind,data=null,errors=[]){return{version:V3_MARKET_MICROSTRUCTURE_VERSION,status,kind,data,errors,probability:null,shadow_only:true};}

export function buildMicrostructureSubscribeFrames({venue,identity_by_contract={},depth=50,now_s=Math.floor(Date.now()/1000)}={}){
 const v=upper(venue),ids=Object.values(identity_by_contract||{}).filter(x=>closedIdentity(x,v));
 if(!ids.length)return result('IDENTITY_UNRESOLVED','SUBSCRIPTIONS',[],['NO_CLOSED_IDENTITIES']);
 if(v==='BYBIT'){
   const args=[];for(const x of ids){args.push(`publicTrade.${x.venue_symbol}`,`tickers.${x.venue_symbol}`,`orderbook.${Math.max(1,Math.min(200,Number(depth)||50))}.${x.venue_symbol}`);}
   return result('CLOSED','SUBSCRIPTIONS',[{op:'subscribe',args}]);
 }
 if(v==='GATE'){
   const symbols=ids.map(x=>x.venue_symbol);
   const frames=[
     {time:now_s,channel:'futures.trades',event:'subscribe',payload:symbols},
     {time:now_s,channel:'futures.book_ticker',event:'subscribe',payload:symbols},
   ];
   for(const s of symbols)frames.push({time:now_s,channel:'futures.order_book_update',event:'subscribe',payload:[s,'100ms','20']});
   for(const s of symbols)frames.push({time:now_s,channel:'futures.contract_stats',event:'subscribe',payload:[s,'1m']});
   return result('CLOSED','SUBSCRIPTIONS',frames);
 }
 return result('SOURCE_UNSUPPORTED','SUBSCRIPTIONS',[],['VENUE_MICROSTRUCTURE_ADAPTER_UNSUPPORTED']);
}

export function parseBybitPublicTrade(message,{identity,received_ts=Date.now()}={}){
 if(!closedIdentity(identity,'BYBIT'))return result('IDENTITY_UNRESOLVED','TRADE',[],['BYBIT_IDENTITY_NOT_CLOSED']);
 const msg=message||{};if(!String(msg.topic||'').startsWith('publicTrade.')||!Array.isArray(msg.data))return result('SOURCE_SCHEMA_UNVERIFIED','TRADE',[],['BYBIT_TRADE_SCHEMA_MISMATCH']);
 const events=[];for(const r of msg.data){if(upper(r?.s)!==upper(identity.venue_symbol))continue;const p=finite(r?.p),q=finite(r?.v),ts=int(r?.T);if(p===null||q===null||ts===null)continue;events.push({venue:'BYBIT',contract:identity.htx_contract,normalized_base:identity.normalized_base,ts_exchange:ts,ts_received:int(received_ts),trade_id:text(r?.i)||null,sequence:int(r?.seq),taker_side:upper(r?.S)==='BUY'?'BUY':upper(r?.S)==='SELL'?'SELL':'UNKNOWN',price:p,qty:q,qty_unit:'BASE',notional_usdt:notional(p,q),coverage_status:'CLOSED_PUBLIC_TRADE',shadow_only:true});}
 return result(events.length?'CLOSED':'NOT_CLOSED','TRADE',events,events.length?[]:['NO_VALID_TRADE_ROWS']);
}

export function parseBybitTicker(message,{identity,previous=null,received_ts=Date.now()}={}){
 if(!closedIdentity(identity,'BYBIT'))return result('IDENTITY_UNRESOLVED','TICKER',null,['BYBIT_IDENTITY_NOT_CLOSED']);
 const msg=message||{};if(!String(msg.topic||'').startsWith('tickers.')||!msg.data||typeof msg.data!=='object')return result('SOURCE_SCHEMA_UNVERIFIED','TICKER',null,['BYBIT_TICKER_SCHEMA_MISMATCH']);
 const row=msg.type==='delta'?{...(previous||{}),...msg.data}:msg.data;
 if(msg.type==='delta'&&!previous)return result('PREVIOUS_SNAPSHOT_REQUIRED','TICKER',null,['BYBIT_TICKER_DELTA_WITHOUT_SNAPSHOT']);
 if(upper(row.symbol)!==upper(identity.venue_symbol))return result('IDENTITY_UNRESOLVED','TICKER',null,['BYBIT_TICKER_SYMBOL_MISMATCH']);
 const bid=finite(row.bid1Price),ask=finite(row.ask1Price),bidSize=finite(row.bid1Size),askSize=finite(row.ask1Size);
 const data={venue:'BYBIT',contract:identity.htx_contract,ts_exchange:int(msg.ts),ts_received:int(received_ts),price:finite(row.lastPrice),mark:finite(row.markPrice),index:finite(row.indexPrice),oi:finite(row.openInterest),oi_value_usdt:finite(row.openInterestValue),turnover_24h_usdt:finite(row.turnover24h),volume_24h:finite(row.volume24h),funding_rate:finite(row.fundingRate),funding_interval_hours:finite(row.fundingIntervalHour),bid,ask,bid_size:bidSize,ask_size:askSize,top1_bid_usdt:notional(bid,bidSize),top1_ask_usdt:notional(ask,askSize),coverage_status:'CLOSED_PUBLIC_TICKER',shadow_only:true};
 return result(data.ts_exchange!==null?'CLOSED':'NOT_CLOSED','TICKER',data,data.ts_exchange!==null?[]:['BYBIT_TICKER_TS_MISSING']);
}

function applyBookSide(map,rows){for(const row of Array.isArray(rows)?rows:[]){const p=finite(row?.[0]),q=finite(row?.[1]);if(p===null||q===null)continue;const k=String(p);if(q===0)map.delete(k);else map.set(k,{price:p,qty:q});}}
function bookSummary(state,levels=20){const bids=[...state.bids.values()].sort((a,b)=>b.price-a.price).slice(0,levels),asks=[...state.asks.values()].sort((a,b)=>a.price-b.price).slice(0,levels);const sum=(a)=>a.reduce((s,x)=>s+(notional(x.price,x.qty)||0),0);const b=sum(bids),a=sum(asks);return{bid:bids[0]?.price??null,ask:asks[0]?.price??null,top1_bid_usdt:bids[0]?notional(bids[0].price,bids[0].qty):null,top1_ask_usdt:asks[0]?notional(asks[0].price,asks[0].qty):null,top20_bid_usdt:b,top20_ask_usdt:a,imbalance:b+a>0?(b-a)/(b+a):null};}
export function applyBybitOrderbook(state,message,{identity,received_ts=Date.now()}={}){
 if(!closedIdentity(identity,'BYBIT'))return result('IDENTITY_UNRESOLVED','ORDERBOOK',null,['BYBIT_IDENTITY_NOT_CLOSED']);
 const msg=message||{},d=msg.data||{};if(!String(msg.topic||'').startsWith('orderbook.')||!d||upper(d.s)!==upper(identity.venue_symbol))return result('SOURCE_SCHEMA_UNVERIFIED','ORDERBOOK',null,['BYBIT_BOOK_SCHEMA_MISMATCH']);
 const next=state&&state.venue==='BYBIT'?{...state,bids:new Map(state.bids),asks:new Map(state.asks)}:{venue:'BYBIT',contract:identity.htx_contract,bids:new Map(),asks:new Map(),last_update_id:null,last_seq:null};
 if(msg.type==='snapshot'){next.bids.clear();next.asks.clear();}
 if(msg.type!=='snapshot'&&msg.type!=='delta')return result('SOURCE_SCHEMA_UNVERIFIED','ORDERBOOK',null,['BYBIT_BOOK_TYPE_UNSUPPORTED']);
 applyBookSide(next.bids,d.b);applyBookSide(next.asks,d.a);next.last_update_id=int(d.u);next.last_seq=int(d.seq);next.ts_exchange=int(d.cts??msg.ts);next.ts_received=int(received_ts);
 return result('CLOSED','ORDERBOOK',{state:next,summary:{venue:'BYBIT',contract:identity.htx_contract,ts_exchange:next.ts_exchange,ts_received:next.ts_received,...bookSummary(next),coverage_status:'CLOSED_BOOK_STATE',gap_detected:false,shadow_only:true}});
}

export function parseGatePublicTrades(message,{identity,received_ts=Date.now(),multiplier=null}={}){
 if(!closedIdentity(identity,'GATE'))return result('IDENTITY_UNRESOLVED','TRADE',[],['GATE_IDENTITY_NOT_CLOSED']);
 const msg=message||{};if(msg.channel!=='futures.trades'||msg.event!=='update'||!Array.isArray(msg.result))return result('SOURCE_SCHEMA_UNVERIFIED','TRADE',[],['GATE_TRADE_SCHEMA_MISMATCH']);
 const mult=finite(multiplier??identity.multiplier),events=[];for(const r of msg.result){const symbol=upper(r?.contract??r?.s);if(symbol&&symbol!==upper(identity.venue_symbol))continue;const size=finite(r?.size),p=finite(r?.price),ts=int(r?.create_time_ms??(finite(r?.create_time)!==null?finite(r.create_time)*1000:null)??msg.time_ms);if(size===null||p===null||ts===null)continue;const baseQty=mult!==null?Math.abs(size)*mult:null;events.push({venue:'GATE',contract:identity.htx_contract,normalized_base:identity.normalized_base,ts_exchange:ts,ts_received:int(received_ts),trade_id:text(r?.id)||null,taker_side:size>0?'BUY':size<0?'SELL':'UNKNOWN',price:p,qty_raw:Math.abs(size),qty_unit:'CONTRACT',base_qty_normalized:baseQty,notional_usdt:baseQty!==null?notional(p,baseQty):null,notional_status:baseQty!==null?'CLOSED':'UNKNOWN_MULTIPLIER',coverage_status:'CLOSED_PUBLIC_TRADE',shadow_only:true});}
 return result(events.length?'CLOSED':'NOT_CLOSED','TRADE',events,events.length?[]:['NO_VALID_TRADE_ROWS']);
}

export function parseGateBookTicker(message,{identity,received_ts=Date.now(),multiplier=null}={}){
 if(!closedIdentity(identity,'GATE'))return result('IDENTITY_UNRESOLVED','BBO',null,['GATE_IDENTITY_NOT_CLOSED']);
 const msg=message||{},r=msg.result||{};if(msg.channel!=='futures.book_ticker'||msg.event!=='update'||upper(r.s)!==upper(identity.venue_symbol))return result('SOURCE_SCHEMA_UNVERIFIED','BBO',null,['GATE_BBO_SCHEMA_MISMATCH']);
 const bid=finite(r.b),ask=finite(r.a),bq=finite(r.B),aq=finite(r.A),mult=finite(multiplier??identity.multiplier);const data={venue:'GATE',contract:identity.htx_contract,ts_exchange:int(r.t??msg.time_ms),ts_received:int(received_ts),bid,ask,bid_size_contracts:bq,ask_size_contracts:aq,top1_bid_usdt:mult!==null?notional(bid,bq*mult):null,top1_ask_usdt:mult!==null?notional(ask,aq*mult):null,notional_status:mult!==null?'CLOSED':'UNKNOWN_MULTIPLIER',coverage_status:'CLOSED_PUBLIC_BBO',shadow_only:true};return result(data.ts_exchange!==null?'CLOSED':'NOT_CLOSED','BBO',data);
}

function applyGateLevels(map,rows,mult){for(const r of Array.isArray(rows)?rows:[]){const p=finite(r?.p),s=finite(r?.s);if(p===null||s===null)continue;const k=String(p);if(s===0)map.delete(k);else map.set(k,{price:p,qty_contracts:Math.abs(s),qty_base:mult!==null?Math.abs(s)*mult:null});}}
function gateBookSummary(state,levels=20){const bids=[...state.bids.values()].sort((a,b)=>b.price-a.price).slice(0,levels),asks=[...state.asks.values()].sort((a,b)=>a.price-b.price).slice(0,levels);const sum=(rows)=>rows.reduce((s,x)=>s+(x.qty_base!==null?(notional(x.price,x.qty_base)||0):0),0);const b=sum(bids),a=sum(asks),closed=state.multiplier!==null;return{bid:bids[0]?.price??null,ask:asks[0]?.price??null,top1_bid_usdt:closed&&bids[0]?notional(bids[0].price,bids[0].qty_base):null,top1_ask_usdt:closed&&asks[0]?notional(asks[0].price,asks[0].qty_base):null,top20_bid_usdt:closed?b:null,top20_ask_usdt:closed?a:null,imbalance:closed&&b+a>0?(b-a)/(b+a):null,notional_status:closed?'CLOSED':'UNKNOWN_MULTIPLIER'};}
export function applyGateOrderbookUpdate(state,message,{identity,received_ts=Date.now(),multiplier=null}={}){
 if(!closedIdentity(identity,'GATE'))return result('IDENTITY_UNRESOLVED','ORDERBOOK',null,['GATE_IDENTITY_NOT_CLOSED']);
 const msg=message||{},d=msg.result||{};if(msg.channel!=='futures.order_book_update'||msg.event!=='update'||upper(d.s)!==upper(identity.venue_symbol))return result('SOURCE_SCHEMA_UNVERIFIED','ORDERBOOK',null,['GATE_BOOK_SCHEMA_MISMATCH']);
 const mult=finite(multiplier??identity.multiplier);const next=state&&state.venue==='GATE'?{...state,bids:new Map(state.bids),asks:new Map(state.asks)}:{venue:'GATE',contract:identity.htx_contract,bids:new Map(),asks:new Map(),last_update_id:null,multiplier:mult};next.multiplier=mult;
 const U=int(d.U),u=int(d.u);const gap=next.last_update_id!==null&&U!==null&&U>next.last_update_id+1;if(d.full===true){next.bids.clear();next.asks.clear();}
 applyGateLevels(next.bids,d.b,mult);applyGateLevels(next.asks,d.a,mult);next.last_update_id=u;next.ts_exchange=int(d.t??msg.time_ms);next.ts_received=int(received_ts);
 const status=gap?'PARTIAL':'CLOSED';return result(status,'ORDERBOOK',{state:next,summary:{venue:'GATE',contract:identity.htx_contract,ts_exchange:next.ts_exchange,ts_received:next.ts_received,...gateBookSummary(next),coverage_status:gap?'PARTIAL_GAP_DETECTED':'CLOSED_BOOK_STATE',gap_detected:gap,first_update_id:U,last_update_id:u,shadow_only:true}},gap?['GATE_ORDERBOOK_SEQUENCE_GAP']:[]);
}

export function parseGateContractStats(message,{identity,received_ts=Date.now()}={}){
 if(!closedIdentity(identity,'GATE'))return result('IDENTITY_UNRESOLVED','STATS',null,['GATE_IDENTITY_NOT_CLOSED']);
 const msg=message||{};if(msg.channel!=='futures.contract_stats'||msg.event!=='update'||!Array.isArray(msg.result))return result('SOURCE_SCHEMA_UNVERIFIED','STATS',null,['GATE_STATS_SCHEMA_MISMATCH']);
 const r=msg.result.find(x=>!x.contract||upper(x.contract)===upper(identity.venue_symbol))||msg.result[0];if(!r)return result('NOT_CLOSED','STATS',null,['GATE_STATS_ROW_MISSING']);
 const data={venue:'GATE',contract:identity.htx_contract,ts_exchange:int((finite(r.time)!==null?finite(r.time)*1000:null)??msg.time_ms),ts_received:int(received_ts),mark:finite(r.mark_price),oi:finite(r.open_interest),oi_value_usdt:finite(r.open_interest_usd),top_account_ratio:finite(r.top_lsr_account),top_position_ratio:finite(r.top_lsr_size),account_ratio:finite(r.lsr_account),taker_ratio:finite(r.lsr_taker),long_liq_usd:finite(r.long_liq_usd),short_liq_usd:finite(r.short_liq_usd),coverage_status:'CLOSED_PUBLIC_CONTRACT_STATS',shadow_only:true};return result(data.ts_exchange!==null?'CLOSED':'NOT_CLOSED','STATS',data);
}

export function aggregateMicrostructureMinute({contract,venue,bucket_ts,trades=[],trade_stream_coverage_closed=false,ticker=null,bbo=null,orderbook=null,stats=null}={}){
 const c=text(contract),v=upper(venue),bucket=int(bucket_ts);if(!c||!v||bucket===null)return result('INVALID_INPUT','AGGREGATE',null,['IDENTITY_OR_BUCKET_MISSING']);
 const rows=(Array.isArray(trades)?trades:[]).filter(x=>x?.contract===c&&upper(x?.venue)===v);let buy=0,sell=0,buyCount=0,sellCount=0,buyKnown=0,sellKnown=0;for(const t of rows){const n=finite(t?.notional_usdt);if(t?.taker_side==='BUY'){buyCount+=1;if(n!==null){buy+=n;buyKnown+=1;}}if(t?.taker_side==='SELL'){sellCount+=1;if(n!==null){sell+=n;sellKnown+=1;}}}
 const coverage=trade_stream_coverage_closed===true&&rows.every(x=>finite(x?.notional_usdt)!==null);
 const buyClosed=coverage?buy:(buyCount>0&&buyKnown===buyCount?buy:null),sellClosed=coverage?sell:(sellCount>0&&sellKnown===sellCount?sell:null);
 const book=orderbook?.summary??orderbook??null;const quote=bbo??ticker??null;const data={contract_code:c,venue:v,bucket_ts:bucket,trade_count:rows.length,taker_buy_usdt:buyClosed,taker_sell_usdt:sellClosed,delta_usdt:coverage?buy-sell:(buyClosed!==null&&sellClosed!==null?buyClosed-sellClosed:null),trade_notional_coverage_closed:coverage,price:finite(ticker?.price),mark:finite(ticker?.mark??stats?.mark),index:finite(ticker?.index),oi:finite(ticker?.oi??stats?.oi),oi_value_usdt:finite(ticker?.oi_value_usdt??stats?.oi_value_usdt),funding_rate:finite(ticker?.funding_rate),funding_interval_hours:finite(ticker?.funding_interval_hours),bid:finite(quote?.bid??book?.bid),ask:finite(quote?.ask??book?.ask),top1_bid_usdt:finite(quote?.top1_bid_usdt??book?.top1_bid_usdt),top1_ask_usdt:finite(quote?.top1_ask_usdt??book?.top1_ask_usdt),top20_bid_usdt:finite(book?.top20_bid_usdt),top20_ask_usdt:finite(book?.top20_ask_usdt),imbalance:finite(book?.imbalance),top_account_ratio:finite(stats?.top_account_ratio),top_position_ratio:finite(stats?.top_position_ratio),book_gap_detected:book?.gap_detected===true,coverage_json:{trade:rows.length?'OBSERVED':'NO_EVENTS_OBSERVED',ticker:ticker?.coverage_status??'NOT_AVAILABLE',bbo:bbo?.coverage_status??'NOT_AVAILABLE',orderbook:book?.coverage_status??'NOT_AVAILABLE',stats:stats?.coverage_status??'NOT_AVAILABLE'},probability:null,shadow_only:true};
 return result('CLOSED','AGGREGATE',data);
}

export default {buildMicrostructureSubscribeFrames,parseBybitPublicTrade,parseBybitTicker,applyBybitOrderbook,parseGatePublicTrades,parseGateBookTicker,applyGateOrderbookUpdate,parseGateContractStats,aggregateMicrostructureMinute};
