#!/usr/bin/env node
import fs from 'node:fs/promises';
import {
  buildCollectorPlan,
  buildCollectorSubscribeFrames,
  createCollectorHealth,
  collectorHealthTransition,
  assessEnduranceProof,
} from '../src/v3-collector-runtime.mjs';
import { buildVenueIdentity } from '../src/v3-liquidation-data-plane.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(x=>{const [k,...v]=x.replace(/^--/,'').split('=');return [k,v.join('=')||'1'];}));
const venue=String(args.venue||'BYBIT').toUpperCase();
const htx=String(args.contract||'BTC-USDT');
const symbol=String(args.symbol||({BYBIT:'BTCUSDT',BINANCE:'BTCUSDT',GATE:'BTC_USDT'}[venue]||''));
const seconds=Math.max(10,Math.min(86400,Number(args.seconds||60)));
const out=String(args.out||`v3-collector-probe-${venue}-${Date.now()}.json`);
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('NODE24_REQUIRED_FOR_ENDURANCE_PROOF');
if (!['BYBIT','BINANCE','GATE'].includes(venue)) throw new Error('VENUE_UNSUPPORTED');
const identity=buildVenueIdentity({htx_contract:htx,venue,venue_symbol:symbol,verified:true});
const plan=buildCollectorPlan({venue,htx_contracts:[htx],identity_by_contract:{[htx]:identity},websocket_header_capable:false});
// Gate is allowed for event/gap endurance but not normalized notional precision when custom header cannot be proven.
let health=createCollectorHealth({venue,now_ts:Date.now()});
const started=Date.now();
let socket=null;
let lastError=null;
try {
  socket=new WebSocket(plan.url);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('CONNECT_TIMEOUT')),15000);socket.onopen=()=>{clearTimeout(timer);resolve();};socket.onerror=()=>{clearTimeout(timer);reject(new Error('CONNECT_ERROR'));};});
  health=collectorHealthTransition(health,{type:'CONNECTED',now_ts:Date.now()});
  for (const frame of buildCollectorSubscribeFrames(plan)) socket.send(JSON.stringify(frame));
  socket.onmessage=(evt)=>{
    const now=Date.now();
    try {
      const msg=JSON.parse(String(evt.data));
      const exchangeTs=Number(msg?.ts ?? msg?.T ?? msg?.E ?? msg?.time_ms ?? msg?.time ?? now);
      const eventCount=Array.isArray(msg?.data)?msg.data.length:Array.isArray(msg?.result)?msg.result.length:(msg?.o?1:0);
      health=collectorHealthTransition(health,{type:'MESSAGE',now_ts:now,exchange_ts:exchangeTs,normalized_events:eventCount});
    } catch (e) {
      health=collectorHealthTransition(health,{type:'ERROR',now_ts:now,error:String(e?.message||e),parse_error:true});
    }
  };
  socket.onerror=()=>{lastError='SOCKET_ERROR';health=collectorHealthTransition(health,{type:'ERROR',now_ts:Date.now(),error:lastError});};
  await new Promise(resolve=>setTimeout(resolve,seconds*1000));
} catch(e) {
  lastError=String(e?.message||e);
  health=collectorHealthTransition(health,{type:'ERROR',now_ts:Date.now(),error:lastError});
} finally {
  try { socket?.close(); } catch {}
}
const completed=Date.now();
const proof=assessEnduranceProof({health,started_ts:started,completed_ts:completed,required_duration_ms:seconds*1000,min_messages:1});
const report={version:'v3-collector-endurance-probe-v1',venue,htx_contract:htx,venue_symbol:symbol,plan,health,proof,last_error:lastError,production_changed:false,d1_changed:false};
await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:proof.status,venue,duration_ms:proof.duration_ms,messages:proof.messages,reconnects:proof.reconnect_count,out},null,2));
process.exitCode=proof.status==='CLOSED'?0:2;
