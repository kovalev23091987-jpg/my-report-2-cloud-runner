import fs from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,evaluateWithinRunReservation,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from '../current-generation/files/src/evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from '../current-generation/files/src/provider-minute-ledger.mjs';
// Runtime pagination tests must pass before provider attempts.
const stage='large-venue',root='audit-output/n05-large-venue',hash=b=>createHash('sha256').update(b).digest('hex');
const universe=JSON.parse(gunzipSync(await fs.readFile('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz')));if(universe.assets.length!==102)throw Error('EXACT_UNIVERSE_REQUIRED');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),id=`N05_QUALIFICATION:${process.env.GITHUB_RUN_ID}:${stage}:${process.env.GITHUB_RUN_ATTEMPT}`,reservation={rows_read:16000,rows_written:500},budget=createUnifiedHttpBudget(),blocked=new Set();
const out={schema:'N05_LARGE_VENUE_QUALIFICATION_V1',stage,run:process.env.GITHUB_RUN_ID,head:process.env.GITHUB_SHA,started_ts:now,approved_assets:102,minimum_useful_assets:31,coverage_is_not_listing:true,sourceHTTP:0,sources:[],MAIN:0,Telegram:0,score_adjustment:0,production_enabled:false,new_fresh_SENT:false,project_complete:false};
await fs.mkdir(root,{recursive:true});let admitted=false;
async function get(name,venue,url,{method='GET',body=null,source=null,daily_cap=null}={}){
 const receipt={name,venue,url,method,received_ts:null,http_status:null,status:'NOT_ATTEMPTED',sourceHTTP:0,source_ts:null,retrieval_is_not_event_time:true};out.sources.push(receipt);
 if(['BITGET','GATE','BINANCE'].includes(venue)){const recent=out.sources.filter(r=>r.venue===venue&&r.sourceHTTP===1&&Date.now()-r.received_ts<60000);if(recent.length>=(venue==='GATE'?4:6)){const delay=Math.max(1,60050-(Date.now()-recent[0].received_ts));console.log(JSON.stringify({type:'PROVIDER_PACING',venue,delay_ms:delay}));await new Promise(r=>setTimeout(r,delay));}}
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


import {normalizeHtxAssetReferences} from '../current-generation/files/src/htx-asset-identity.mjs';
import {normalizeBinanceNativeFlow} from '../current-generation/files/src/binance-native-four-hour-flow.mjs';
import {exactGateTokenBinding,normalizeGateSpotFlow,matchGatePublicRestDirection} from '../current-generation/files/src/gate-four-hour-flow.mjs';
import {normalizeTurnoverBaseline,turnoverHistoryEnd} from '../current-generation/files/src/flow-turnover-baseline.mjs';
const saved=async(dir,name)=>JSON.parse(gunzipSync(await fs.readFile(dir+'/'+name+'.json.gz'))),oldDir='checkpoints/n05-native-qualification-38052957545',firstDir='checkpoints/n05-actual-qualification-38049404414';
const prior=JSON.parse(await fs.readFile(oldDir+'/native-summary.json','utf8'));
async function publicSocket(){
 const receipt={name:'GATE-PUBLIC-WS-DIRECTION',venue:'GATE',url:'wss://api.gateio.ws/ws/v4/',method:'GET_HTTP_UPGRADE',transport:'PUBLIC_WEBSOCKET',sourceHTTP:0,received_ts:null,http_status:null,status:'NOT_ATTEMPTED'};out.sources.push(receipt);
 if(!evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:22}).allowed){receipt.status='D1_HEADROOM_DENIED';return [];}
 if(await readEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:GATE',asset_key:'SHARED',now:Date.now()})){receipt.status='DURABLE_VENUE_BACKOFF';return [];}
 const key=id+':GATE-PUBLIC-WS-DIRECTION';receipt.whole_admission=budget.reserve({logical_request_id:key,lane:'background',attempts:1});if(!receipt.whole_admission.allowed){receipt.status='WHOLE_JOB_HTTP_DENIED';return [];}
 receipt.daily_admission=await reserveEvidenceSourceAttempts(db,{source:'N05_OFFICIAL_FLOW:GATE',reservation_id:key,attempts:1,daily_cap:16,now:Date.now()});if(!receipt.daily_admission.allowed){receipt.status='SOURCE_DAILY_CAP_DENIED';return [];}
 receipt.minute_admission=await reserveProviderMinuteUnits(db,{provider:'GATE',reservation_id:key,units:1,cap:4,now:Date.now()});if(!receipt.minute_admission.allowed){receipt.status='PROVIDER_MINUTE_CAP_DENIED';return [];}
 const request={time:Math.floor(Date.now()/1000),channel:'spot.trades',event:'subscribe',payload:['BTC_USDT']},messages=[],raw=[];receipt.sourceHTTP=1;out.sourceHTTP++;receipt.started_ts=Date.now();
 await new Promise(resolve=>{let done=false,total=0;const ws=new WebSocket(receipt.url),finish=status=>{if(done)return;done=true;clearTimeout(timer);receipt.status=status;receipt.received_ts=Date.now();try{ws.close();}catch{}resolve();},timer=setTimeout(()=>finish('BOUNDED_PUBLIC_CAPTURE_CLOSED'),20000);
  ws.addEventListener('open',()=>{receipt.http_status=101;ws.send(JSON.stringify(request));});
  ws.addEventListener('message',e=>{if(done)return;const text=String(e.data);total+=Buffer.byteLength(text);if(total>2*1024*1024)return finish('BODY_LIMIT');raw.push({received_ts:Date.now(),text});try{const m=JSON.parse(text);messages.push(m);if(m.error)return finish('PUBLIC_SUBSCRIPTION_ERROR');if(messages.filter(x=>x.channel==='spot.trades'&&x.event==='update').length>=80)return finish('BOUNDED_PUBLIC_CAPTURE_CLOSED');}catch{return finish('INVALID_PUBLIC_JSON');}});
  ws.addEventListener('error',()=>finish('PUBLIC_SOCKET_TRANSPORT_ERROR'));ws.addEventListener('close',()=>finish('PUBLIC_SOCKET_CLOSED'));
 });
 const bytes=Buffer.from(JSON.stringify({request,raw})),gz=gzipSync(bytes);receipt.body_sha256=hash(bytes);receipt.gzip_sha256=hash(gz);receipt.bytes=bytes.length;receipt.file=receipt.name+'.json.gz';await fs.writeFile(root+'/'+receipt.file,gz);
 return messages;
}
try{
 out.daily_admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');await reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 const htx=normalizeHtxAssetReferences(await saved(firstDir,'identity-HTX')),catalog=await saved(oldDir,'BINANCE-SMALL-CATALOG'),currencies=await saved(oldDir,'GATE-ALL-CURRENCY-IDENTITY'),spot=await saved(firstDir,'catalog-GATE-SPOT');
 const end=Math.floor(Date.now()/60000)*60000;out.window_end_ts=end;out.source_history=[];out.native_windows=[];out.gate_windows=[];
 // Structural identity cache uses the actual retained metadata clock, never this retrieval clock.
 const curReceipt=prior.sources.find(r=>r.name==='GATE-ALL-CURRENCY-IDENTITY'),catalogSummary=JSON.parse(await fs.readFile(firstDir+'/catalog-summary.json','utf8'));
 const compactCurrencies=currencies.map(r=>({currency:r.currency,delisted:r.delisted,trade_disabled:r.trade_disabled,chains:(r.chains||[]).map(c=>({name:c.name,addr:c.addr}))})),compactSpot=spot.map(r=>({id:r.id,base:r.base,quote:r.quote,trade_status:r.trade_status}));
 const spotReceipt=(catalogSummary.sources||catalogSummary.receipts||[]).find(r=>/GATE-SPOT/.test(r.name||'')),spotClock=spotReceipt?.received_ts;
 if(Buffer.byteLength(JSON.stringify(compactCurrencies))<900000)await writeEvidenceSourceCache(db,{source:'GATE_ASSET_REFERENCE',asset_key:'N05:CURRENCIES',observed_ts:curReceipt.received_ts,expires_ts:curReceipt.received_ts+21600000,payload:{version:'gate-flow-collector-v1-20261010',observed_ts:curReceipt.received_ts,payload:compactCurrencies,receipt:curReceipt}});
 if(spotReceipt&&Buffer.byteLength(JSON.stringify(compactSpot))<900000)await writeEvidenceSourceCache(db,{source:'N05_OFFICIAL_FLOW:GATE',asset_key:'METADATA:SPOT',observed_ts:spotClock,expires_ts:spotClock+21600000,payload:{version:'gate-flow-collector-v1-20261010',observed_ts:spotClock,payload:compactSpot,receipt:spotReceipt}});
 out.metadata_cache_seed={original_currencies_observed_ts:curReceipt.received_ts,spot_receipt_available:Boolean(spotReceipt),clocks_refreshed:false};
 const messages=await publicSocket(),updates=messages.filter(m=>m.channel==='spot.trades'&&m.event==='update');
 const wsReceipt=out.sources.at(-1);
 const trades=updates.length?await get('GATE-PAIRED-REST-DIRECTION','GATE','https://api.gateio.ws/api/v4/spot/trades?currency_pair=BTC_USDT&from='+Math.floor(wsReceipt.started_ts/1000)+'&to='+Math.floor(Date.now()/1000)+'&limit=1000&page=1'):null;
 out.direction_proof=matchGatePublicRestDirection({messages,rest:trades,pair:'BTC_USDT'});out.direction_proof.reference_id=out.direction_proof.verified?'GATE_PAIRED_PUBLIC_TAKER_V4_'+process.env.GITHUB_RUN_ID:null;
 out.direction_proof.source_receipts=out.sources.filter(r=>/DIRECTION/.test(r.name)).map(r=>({file:r.file,body_sha256:r.body_sha256,gzip_sha256:r.gzip_sha256,received_ts:r.received_ts,http_status:r.http_status,sourceHTTP:r.sourceHTTP}));
 // Saved 240-minute Gate windows are re-qualified from original bytes only if the generic public REST taker contract is proven.
 for(const old of prior.gate_windows){
  const base=old.contract.slice(0,-5),pages=[await saved(oldDir,'GATE-'+base+'-PAGE-1')],candles=await saved(oldDir,'GATE-'+base+'-CANDLES'),flow=normalizeGateSpotFlow({contract:old.contract,identity:old.identity,currencies,spot,pages,candles,window_end_ts:old.window_end_ts,observed_ts:old.observed_ts,direction_reference:out.direction_proof});
  out.gate_windows.push({...flow,scope:'RETAINED_ORIGINAL_WINDOW'});
  const histEnd=turnoverHistoryEnd(old.window_start_ts),hour=await get('GATE-'+base+'-PRIOR30D-HOURS','GATE','https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair='+base+'_USDT&from='+(histEnd-30*86400000)/1000+'&to='+(histEnd/1000-1)+'&interval=1h');
  out.source_history.push(normalizeTurnoverBaseline({contract:old.contract,venue:'GATE',candles:hour,history_end_ts:histEnd,observed_ts:out.sources.at(-1).received_ts,current_flow:flow}));
 }
 const oldNative=prior.binance_native_market_windows;
 for(const old of oldNative){const receipt=prior.sources.find(r=>r.name==='BINANCE-'+old.base+'-NATIVE-240'),flow=normalizeBinanceNativeFlow({contract:old.base+'-USDT',identity:old.HTX_identity,catalog,candles:await saved(oldDir,'BINANCE-'+old.base+'-NATIVE-240'),window_end_ts:old.window_end_ts,observed_ts:receipt.received_ts}),histEnd=turnoverHistoryEnd(flow.window_start_ts),hour=await get('BINANCE-'+old.base+'-PRIOR30D-HOURS','BINANCE','https://data-api.binance.vision/api/v3/klines?symbol='+old.base+'USDT&interval=1h&startTime='+(histEnd-30*86400000)+'&endTime='+(histEnd-1)+'&limit=720');out.source_history.push(normalizeTurnoverBaseline({contract:flow.contract,venue:'BINANCE',candles:hour,history_end_ts:histEnd,observed_ts:out.sources.at(-1).received_ts,current_flow:flow}));}
 for(const base of ['BTC','ETH','BNB']){
  const identity=htx.entries[base]?.status==='CLOSED'?htx.entries[base].identities[0]:null;if(!identity){out.native_windows.push({contract:base+'-USDT',status:'HTX_EXACT_IDENTITY_OPEN',check_completed:false});continue;}
  const candles=await get('BINANCE-'+base+'-NATIVE-240','BINANCE','https://data-api.binance.vision/api/v3/klines?symbol='+base+'USDT&interval=1m&startTime='+(end-14400000)+'&endTime='+(end-1)+'&limit=240'),flow=normalizeBinanceNativeFlow({contract:base+'-USDT',identity,catalog,candles,window_end_ts:end,observed_ts:out.sources.at(-1).received_ts});out.native_windows.push(flow);
  if(flow.check_completed){const histEnd=turnoverHistoryEnd(flow.window_start_ts),hour=await get('BINANCE-'+base+'-PRIOR30D-HOURS','BINANCE','https://data-api.binance.vision/api/v3/klines?symbol='+base+'USDT&interval=1h&startTime='+(histEnd-30*86400000)+'&endTime='+(histEnd-1)+'&limit=720');out.source_history.push(normalizeTurnoverBaseline({contract:flow.contract,venue:'BINANCE',candles:hour,history_end_ts:histEnd,observed_ts:out.sources.at(-1).received_ts,current_flow:flow}));}
 }
 // Only two already exactly bound markets; original qualification is not fetched again.
 if(out.direction_proof.verified)for(const old of prior.gate_windows){
  const contract=old.contract,base=contract.slice(0,-5),identity=old.identity;
  if(!exactGateTokenBinding({contract,identity,currencies,spot}))continue;
  const query='currency_pair='+base+'_USDT&from='+(end-14400000)/1000+'&to='+(end/1000-1),candles=await get('GATE-'+base+'-FRESH-CANDLES','GATE','https://api.gateio.ws/api/v4/spot/candlesticks?'+query+'&interval=1m'),pages=[];
  for(let page=1;candles&&page<=3;page++){
   const rows=await get('GATE-'+base+'-FRESH-PAGE-'+page,'GATE','https://api.gateio.ws/api/v4/spot/trades?'+query+'&limit=1000&page='+page);if(!Array.isArray(rows))break;pages.push(rows);
   const flow=normalizeGateSpotFlow({contract,identity,currencies,spot,pages,candles,window_end_ts:end,observed_ts:out.sources.at(-1).received_ts,direction_reference:out.direction_proof});
   if(flow.check_completed||rows.length<1000||page===3){out.gate_windows.push({...flow,scope:'ACTUAL_BOUNDED_CURRENT_WINDOW'});break;}
  }
 }
 out.actual_other_source_research_reused=true;out.no_unsupported_or_partial_old_feed_declared_complete=true;out.individual_trade_size_and_price_impact_calibration_still_open=true;out.status='LARGE_VENUE_AND_TURNOVER_FACTS_RETAINED';
}catch(e){out.status='LARGE_BATCH_NOT_CLOSED';out.reason=e.message;}
finally{
 out.http_budget=budget.summary();if(admitted)out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';out.completed_ts=Date.now();await fs.writeFile(root+'/large-summary.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,sourceHTTP:out.sourceHTTP,direction:out.direction_proof?.status,matches:out.direction_proof?.matched_count,D1:out.D1,native:out.native_windows?.map(r=>({contract:r.contract,status:r.status,reason:r.reason})),gate:out.gate_windows?.map(r=>({contract:r.contract,status:r.status,reason:r.reason,scope:r.scope})),history:out.source_history?.map(r=>({contract:r.contract,venue:r.venue,status:r.status,reason:r.reason,ratio:r.ratio_to_median})),sources:out.sources.map(r=>({name:r.name,status:r.status,http:r.http_status,bytes:r.bytes}))}));
}
