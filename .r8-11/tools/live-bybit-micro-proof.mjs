#!/usr/bin/env node
import fs from 'node:fs/promises';
import { RemoteD1Database } from '../../runner/report2-d1-adapter.mjs';
import { buildVenueIdentity } from '../src/v3-liquidation-data-plane.mjs';
import {
  buildMicrostructureSubscribeFrames,
  parseBybitPublicTrade,
  parseBybitTicker,
  applyBybitOrderbook,
  aggregateMicrostructureMinute,
} from '../src/v3-market-microstructure.mjs';
import { persistMicrostructureMinute } from '../src/v3-market-microstructure-persistence.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(x=>{const [k,...v]=x.replace(/^--/,'').split('=');return [k,v.join('=')||'1'];}));
const durationMs=Math.max(30_000,Math.min(180_000,Number(args.seconds||70)*1000));
const outPath=String(args.out||`.r8-11/proof/microstructure-${Date.now()}.json`);
const d1Url=String(process.env.REPORT2_D1_BRIDGE_URL||'').trim();
const d1Token=String(process.env.REPORT2_D1_BRIDGE_TOKEN||'').trim();
if(!d1Url||!d1Token) throw new Error('D1_BRIDGE_ENV_REQUIRED');
if(Number(process.versions.node.split('.')[0])<24) throw new Error('NODE24_REQUIRED');

const identity=buildVenueIdentity({htx_contract:'BTC-USDT',venue:'BYBIT',venue_symbol:'BTCUSDT',verified:true});
if(identity.identity_status!=='CLOSED') throw new Error('BYBIT_BTC_IDENTITY_NOT_CLOSED');
const frames=buildMicrostructureSubscribeFrames({venue:'BYBIT',identity_by_contract:{'BTC-USDT':identity},depth:50});
if(frames.status!=='CLOSED'||!Array.isArray(frames.data)||!frames.data.length) throw new Error('MICRO_SUBSCRIPTIONS_NOT_CLOSED');

const state={started_ts:Date.now(),connected_ts:null,last_message_ts:null,max_message_gap_ms:0,message_count:0,parse_errors:0,trade_messages:0,ticker_messages:0,book_messages:0,trades:[],ticker:null,tickerRaw:null,bookState:null,bookSummary:null};
let ws;
const connect=()=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('BYBIT_MICRO_CONNECT_TIMEOUT')),15_000);
  ws=new WebSocket('wss://stream.bybit.com/v5/public/linear');
  ws.onopen=()=>{clearTimeout(timer);state.connected_ts=Date.now();resolve();};
  ws.onerror=()=>{clearTimeout(timer);reject(new Error('BYBIT_MICRO_CONNECT_ERROR'));};
});
await connect();
for(const frame of frames.data) ws.send(JSON.stringify(frame));
const ping=setInterval(()=>{try{ws?.send(JSON.stringify({op:'ping'}));}catch{}},20_000);
ws.onmessage=(evt)=>{
  const now=Date.now();
  if(state.last_message_ts!==null) state.max_message_gap_ms=Math.max(state.max_message_gap_ms,now-state.last_message_ts);
  state.last_message_ts=now; state.message_count++;
  try{
    const msg=JSON.parse(String(evt.data));
    const topic=String(msg?.topic||'');
    if(topic.startsWith('publicTrade.')){
      const p=parseBybitPublicTrade(msg,{identity,received_ts:now});
      if(p.status==='CLOSED'&&Array.isArray(p.data)){state.trades.push(...p.data);state.trade_messages++;}
      else if(!['NOT_CLOSED','SOURCE_SCHEMA_UNVERIFIED'].includes(p.status)) state.parse_errors++;
    }else if(topic.startsWith('tickers.')){
      const prev=state.tickerRaw;
      const p=parseBybitTicker(msg,{identity,previous:prev,received_ts:now});
      if(p.status==='CLOSED'&&p.data){state.ticker=p.data;state.ticker_messages++;state.tickerRaw=msg.type==='delta'?{...(prev||{}),...(msg.data||{})}:{...(msg.data||{})};}
      else if(p.status!=='PREVIOUS_SNAPSHOT_REQUIRED') state.parse_errors++;
    }else if(topic.startsWith('orderbook.')){
      const p=applyBybitOrderbook(state.bookState,msg,{identity,received_ts:now});
      if(p.status==='CLOSED'&&p.data){state.bookState=p.data.state;state.bookSummary=p.data.summary;state.book_messages++;}
      else state.parse_errors++;
    }
  }catch{state.parse_errors++;}
};
await new Promise(r=>setTimeout(r,durationMs));
clearInterval(ping); try{ws?.close();}catch{}
state.completed_ts=Date.now();
if(state.message_count<10) throw new Error(`MICRO_MESSAGE_COVERAGE_TOO_SMALL:${state.message_count}`);
if(state.trades.length<1) throw new Error('MICRO_NO_PUBLIC_TRADES');
if(!state.ticker) throw new Error('MICRO_TICKER_NOT_CLOSED');
if(!state.bookSummary) throw new Error('MICRO_ORDERBOOK_NOT_CLOSED');
if(state.parse_errors>0) throw new Error(`MICRO_PARSE_ERRORS:${state.parse_errors}`);

const buckets=new Map();
for(const t of state.trades){const b=Math.floor(Number(t.ts_exchange)/60_000)*60_000;if(!buckets.has(b))buckets.set(b,[]);buckets.get(b).push(t);}
const selected=[...buckets.entries()].sort((a,b)=>b[1].length-a[1].length||b[0]-a[0])[0];
if(!selected) throw new Error('MICRO_BUCKET_NOT_FOUND');
const [bucketTs,bucketTrades]=selected;
const agg=aggregateMicrostructureMinute({contract:'BTC-USDT',venue:'BYBIT',bucket_ts:bucketTs,trades:bucketTrades,trade_stream_coverage_closed:true,ticker:state.ticker,orderbook:state.bookSummary});
if(agg.status!=='CLOSED'||!agg.data) throw new Error('MICRO_AGGREGATE_NOT_CLOSED');
const row={...agg.data,observed_ts:state.completed_ts};
const db=new RemoteD1Database(d1Url,d1Token,{timeoutMs:45_000});
const persisted=await persistMicrostructureMinute(db,[row],{persisted_ts:state.completed_ts});
if(persisted.status!=='CLOSED'||persisted.persisted!==1) throw new Error(`MICRO_PERSIST_FAIL:${JSON.stringify(persisted)}`);
const readback=await db.prepare(`SELECT contract_code,venue,bucket_ts,trade_count,taker_buy_usdt,taker_sell_usdt,delta_usdt,trade_notional_coverage_closed,bid,ask,top20_bid_usdt,top20_ask_usdt,coverage_json,shadow_only FROM v3_market_microstructure_1m WHERE contract_code=?1 AND venue=?2 AND bucket_ts=?3 LIMIT 1`).bind('BTC-USDT','BYBIT',bucketTs).first();
if(!readback||String(readback.contract_code)!=='BTC-USDT'||String(readback.venue)!=='BYBIT'||Number(readback.bucket_ts)!==bucketTs||Number(readback.shadow_only)!==1) throw new Error('MICRO_D1_READBACK_IDENTITY_FAIL');
if(Number(readback.trade_count||0)<1||Number(readback.trade_notional_coverage_closed)!==1) throw new Error('MICRO_D1_READBACK_COVERAGE_FAIL');
const report={
  status:'R8_11_MICROSTRUCTURE_LIVE_D1_PASS',
  version:'r8-11-live-bybit-micro-proof-v1',
  node:process.versions.node,
  duration_ms:state.completed_ts-state.started_ts,
  message_count:state.message_count,
  trade_messages:state.trade_messages,
  ticker_messages:state.ticker_messages,
  book_messages:state.book_messages,
  max_message_gap_ms:state.max_message_gap_ms,
  trades_observed:state.trades.length,
  selected_bucket_ts:bucketTs,
  selected_trade_count:bucketTrades.length,
  persistence:persisted,
  readback,
  d1_usage:db.usageSnapshot(),
  production_main_changed:false,
  d1_schema_changed:false,
  d1_shadow_data_written:true,
  telegram_network_enabled:false,
  probability:null,
  validated_signal:false,
  trading_execution:false,
};
await fs.mkdir(new URL('.',`file://${process.cwd()}/${outPath}`).pathname,{recursive:true}).catch(()=>{});
await fs.mkdir(outPath.split('/').slice(0,-1).join('/')||'.',{recursive:true});
await fs.writeFile(outPath,JSON.stringify(report,null,2)+'\n');
console.log('R8_11_MICROSTRUCTURE_LIVE_D1=PASS');
console.log(JSON.stringify({status:report.status,duration_ms:report.duration_ms,messages:report.message_count,trades:report.trades_observed,bucket_ts:bucketTs,d1_usage:report.d1_usage}));
