import fs from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,evaluateWithinRunReservation,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from '../current-generation/files/src/evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from '../current-generation/files/src/provider-minute-ledger.mjs';
// Runtime pagination tests must pass before provider attempts.
const stage='broad-exchanges',root='audit-output/n05-broad-exchanges',hash=b=>createHash('sha256').update(b).digest('hex');
const universe=JSON.parse(gunzipSync(await fs.readFile('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz')));if(universe.assets.length!==102)throw Error('EXACT_UNIVERSE_REQUIRED');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),id=`N05_QUALIFICATION:${process.env.GITHUB_RUN_ID}:${stage}:${process.env.GITHUB_RUN_ATTEMPT}`,reservation={rows_read:16000,rows_written:500},budget=createUnifiedHttpBudget(),blocked=new Set();
const out={schema:'N05_BROAD_EXCHANGE_QUALIFICATION_V1',stage,run:process.env.GITHUB_RUN_ID,head:process.env.GITHUB_SHA,started_ts:now,approved_assets:102,minimum_useful_assets:31,coverage_is_not_listing:true,sourceHTTP:0,sources:[],MAIN:0,Telegram:0,score_adjustment:0,production_enabled:false,new_fresh_SENT:false,project_complete:false};
await fs.mkdir(root,{recursive:true});let admitted=false;
async function get(name,venue,url,{method='GET',body=null,source=null,daily_cap=null}={}){
 const receipt={name,venue,url,method,received_ts:null,http_status:null,status:'NOT_ATTEMPTED',sourceHTTP:0,source_ts:null,retrieval_is_not_event_time:true};out.sources.push(receipt);
 if(true){const recent=out.sources.filter(r=>r.venue===venue&&r.sourceHTTP===1&&Date.now()-r.received_ts<60000);if(recent.length>=(venue==='GATE'?4:6)){const delay=Math.max(1,60050-(Date.now()-recent[0].received_ts));console.log(JSON.stringify({type:'PROVIDER_PACING',venue,delay_ms:delay}));await new Promise(r=>setTimeout(r,delay));}}
 const key=source||`N05_OFFICIAL_FLOW:${venue}`,cap=daily_cap??16;
 if(blocked.has(venue)){receipt.status='SHARED_VENUE_BACKOFF';return null;}
 try{
  if(!evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:22}).allowed)throw Error('D1_HEADROOM_DENIED');
  const old=await readEvidenceSourceCache(db,{source:`N05_PROVIDER_BACKOFF:${venue}`,asset_key:'SHARED',now:Date.now()});if(old){receipt.status='DURABLE_VENUE_BACKOFF';blocked.add(venue);return null;}
  const whole=budget.reserve({logical_request_id:id+':'+name,lane:'background',attempts:1});receipt.whole_admission=whole;if(!whole.allowed||whole.duplicate)throw Error('WHOLE_JOB_HTTP_DENIED');
  const daily=await reserveEvidenceSourceAttempts(db,{source:key,reservation_id:id+':'+name,attempts:1,daily_cap:cap,now:Date.now()});receipt.daily_admission=daily;if(!daily.allowed)throw Error('SOURCE_DAILY_CAP_DENIED');
  const minute=await reserveProviderMinuteUnits(db,{provider:venue,reservation_id:id+':'+name,units:1,cap:venue==='GATE'?4:6,now:Date.now()});receipt.minute_admission=minute;if(!minute.allowed)throw Error('PROVIDER_MINUTE_CAP_DENIED');
  out.sourceHTTP++;receipt.sourceHTTP=1;
  const r=await fetch(url,{method,body:body?JSON.stringify(body):undefined,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{})},redirect:'manual',signal:AbortSignal.timeout(15000)});
  receipt.http_status=r.status;receipt.retry_after=r.headers.get('retry-after');const chunks=[];let n=0;for await(const chunk of r.body){n+=chunk.length;if(n>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(chunk);}const bytes=Buffer.concat(chunks),gz=gzipSync(bytes);receipt.received_ts=Date.now();receipt.body_sha256=hash(bytes);receipt.gzip_sha256=hash(gz);receipt.bytes=bytes.length;receipt.file=name+'.json.gz';await fs.writeFile(root+'/'+receipt.file,gz);
  if([401,403,429,451].includes(r.status)){blocked.add(venue);const seconds=/^\d+$/.test(receipt.retry_after||'')?Number(receipt.retry_after):0;await writeEvidenceSourceCache(db,{source:`N05_PROVIDER_BACKOFF:${venue}`,asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:r.status,original_received_ts:receipt.received_ts}});}
  if(r.status!==200){receipt.status=`HTTP_${r.status}`;return null;}
  let p;try{p=JSON.parse(bytes);}catch{receipt.status='INVALID_JSON';return null;}
  receipt.status='RECEIVED_NOT_QUALIFIED';return p;
 }catch(e){receipt.status=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;receipt.received_ts??=Date.now();return null;}
}
import {normalizeKrakenNativeFlow,matchKrakenPublicRestDirection} from '../current-generation/files/src/kraken-four-hour-flow.mjs';
import {normalizeBinanceNativeFlow} from '../current-generation/files/src/binance-native-four-hour-flow.mjs';
import {normalizeBackpackSpotFlow} from '../current-generation/files/src/backpack-four-hour-flow.mjs';
import {normalizeHtxAssetReferences} from '../current-generation/files/src/htx-asset-identity.mjs';
const saved=async(dir,name)=>JSON.parse(gunzipSync(await fs.readFile(dir+'/'+name+'.json.gz')));
async function publicSocket(){
 const receipt={name:'KRAKEN-PUBLIC-WS-DIRECTION',venue:'KRAKEN',url:'wss://ws.kraken.com/v2',method:'GET_HTTP_UPGRADE',transport:'PUBLIC_WEBSOCKET',sourceHTTP:0,received_ts:null,http_status:null,status:'NOT_ATTEMPTED'};out.sources.push(receipt);
 if(!evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:22}).allowed){receipt.status='D1_HEADROOM_DENIED';return [];}
 if(await readEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:KRAKEN',asset_key:'SHARED',now:Date.now()})){receipt.status='DURABLE_VENUE_BACKOFF';return [];}
 const key=id+':KRAKEN-PUBLIC-WS-DIRECTION';receipt.whole_admission=budget.reserve({logical_request_id:key,lane:'background',attempts:1});if(!receipt.whole_admission.allowed){receipt.status='WHOLE_JOB_HTTP_DENIED';return [];}
 receipt.daily_admission=await reserveEvidenceSourceAttempts(db,{source:'N05_OFFICIAL_FLOW:KRAKEN',reservation_id:key,attempts:1,daily_cap:16,now:Date.now()});if(!receipt.daily_admission.allowed){receipt.status='SOURCE_DAILY_CAP_DENIED';return [];}
 receipt.minute_admission=await reserveProviderMinuteUnits(db,{provider:'KRAKEN',reservation_id:key,units:1,cap:6,now:Date.now()});if(!receipt.minute_admission.allowed){receipt.status='PROVIDER_MINUTE_CAP_DENIED';return [];}
 const request={method:'subscribe',params:{channel:'trade',symbol:['DOT/USDT','ATOM/USDT'],snapshot:true}},messages=[],raw=[];receipt.sourceHTTP=1;out.sourceHTTP++;receipt.started_ts=Date.now();
 await new Promise(resolve=>{let done=false,total=0;const ws=new WebSocket(receipt.url),finish=status=>{if(done)return;done=true;clearTimeout(timer);receipt.status=status;receipt.received_ts=Date.now();try{ws.close();}catch{}resolve();},timer=setTimeout(()=>finish('BOUNDED_PUBLIC_CAPTURE_CLOSED'),60000);
  ws.addEventListener('open',()=>{receipt.http_status=101;ws.send(JSON.stringify(request));});
  ws.addEventListener('message',e=>{if(done)return;const text=String(e.data);total+=Buffer.byteLength(text);if(total>2*1024*1024)return finish('BODY_LIMIT');raw.push({received_ts:Date.now(),text});try{const m=JSON.parse(text);messages.push(m);if(m.error)return finish('PUBLIC_SUBSCRIPTION_ERROR');if(new Set(messages.filter(x=>x.channel==='trade'&&x.type==='snapshot').flatMap(x=>x.data||[]).map(x=>x.symbol)).size===2)return finish('BOUNDED_PUBLIC_CAPTURE_CLOSED');}catch{return finish('INVALID_PUBLIC_JSON');}});
  ws.addEventListener('error',()=>finish('PUBLIC_SOCKET_TRANSPORT_ERROR'));ws.addEventListener('close',()=>finish('PUBLIC_SOCKET_CLOSED'));
 });
 const bytes=Buffer.from(JSON.stringify({request,raw})),gz=gzipSync(bytes);receipt.body_sha256=hash(bytes);receipt.gzip_sha256=hash(gz);receipt.bytes=bytes.length;receipt.file=receipt.name+'.json.gz';await fs.writeFile(root+'/'+receipt.file,gz);
 return messages;
}
try{
 out.daily_admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');await reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;



 const prior=JSON.parse(await fs.readFile('checkpoints/n05-broad-qualification-38065882136/broad-summary.json','utf8')),windows=JSON.parse(await fs.readFile('checkpoints/n05-broad-qualification-38066068287/broad-summary.json','utf8')),last=JSON.parse(await fs.readFile('checkpoints/n05-broad-qualification-38066287652/broad-summary.json','utf8'));
 out.backpack_bindings=last.backpack_bindings;out.backpack_windows=last.backpack_windows.map(r=>r.flow);out.native_assets=last.native_assets;out.binance_bindings=last.binance_bindings;
 const catalog=await saved('checkpoints/n05-native-qualification-38052957545','BINANCE-SMALL-CATALOG');out.binance_windows=windows.binance_windows.filter(r=>r.candles).map(r=>normalizeBinanceNativeFlow({...r,catalog,window_end_ts:windows.window_end_ts}));out.kraken_usdt_markets=last.kraken_usdt_markets;out.coinbase_chain_metadata=last.coinbase_chain_metadata.map(a=>({id:a.id,supported_networks:a.supported_networks}));
 const messages=await publicSocket();out.kraken_direction=[];
 for(const symbol of ['DOT','ATOM']){const payload=await get('KRAKEN-'+symbol+'-PAIRED-RECENT','KRAKEN','https://api.kraken.com/0/public/Trades?pair='+symbol+'USDT&count=1000');out.kraken_direction.push(matchKrakenPublicRestDirection({messages,rest:payload?.result?.[symbol+'USDT'],symbol:symbol+'/USDT'}));}
 const direction=out.kraken_direction.find(r=>r.verified);if(direction){direction.reference_id='KRAKEN_PAIRED_PUBLIC_TAKER_V2_'+process.env.GITHUB_RUN_ID;direction.immutable_receipts=out.sources.filter(r=>r.body_sha256).map(r=>({name:r.name,body_sha256:r.body_sha256,gzip_sha256:r.gzip_sha256,received_ts:r.received_ts,file:r.file}));}
 out.direction_reference=direction||{verified:false};out.kraken_windows=last.kraken_windows.map(r=>normalizeKrakenNativeFlow({...r,instrument:r.market,pages:[r.trades],window_end_ts:last.window_end_ts,direction_reference:out.direction_reference}));
 const end=Math.floor(Date.now()/60000)*60000;out.window_end_ts=end;
 for(const symbol of ['BCH','LTC']){const binding=out.native_assets.find(a=>a.symbol===symbol),market=out.kraken_usdt_markets.find(m=>m.wsname===symbol+'/USDT');if(!binding||!market)continue;const candles=await get('KRAKEN-'+symbol+'-CANDLES','KRAKEN','https://api.kraken.com/0/public/OHLC?pair='+encodeURIComponent(market.altname)+'&interval=1&since='+(end-14400000)/1000),trades=await get('KRAKEN-'+symbol+'-HISTORY','KRAKEN','https://api.kraken.com/0/public/Trades?pair='+encodeURIComponent(market.altname)+'&since='+(BigInt(end-14400000)*1000000n-1n).toString()+'&count=1000');out.kraken_windows.push(normalizeKrakenNativeFlow({contract:symbol+'-USDT',identity:binding.identities[0],instrument:market,candles,pages:[trades],window_end_ts:end,observed_ts:out.sources.at(-1).received_ts,direction_reference:out.direction_reference}));}
 out.status='BROAD_SOURCE_COUNT_AND_SIDE_QUALIFICATION_RETAINED';



}catch(e){out.status='BROAD_BATCH_NOT_CLOSED';out.reason=e.message;}
finally{
 out.http_budget=budget.summary();if(admitted)out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';out.completed_ts=Date.now();await fs.writeFile(root+'/broad-summary.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,sourceHTTP:out.sourceHTTP,D1:out.D1,natives:out.all_native_entries?.map(r=>r.symbol),shape:out.original_universe_shape,backpack_windows:out.backpack_windows?.map(r=>({contract:r.contract,status:r.status,reason:r.reason,count:r.trade_count})),kraken:out.kraken_windows?.map(r=>({contract:r.contract,status:r.status,reason:r.reason,count:r.trade_count})),direction:out.kraken_direction,binance:out.binance_windows?.map(r=>({contract:r.contract,status:r.status,reason:r.reason})),sources:out.sources.map(r=>({name:r.name,status:r.status,http:r.http_status,bytes:r.bytes}))}));
}
