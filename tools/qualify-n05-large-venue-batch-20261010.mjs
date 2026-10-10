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
 await new Promise(resolve=>{let done=false,total=0;const ws=new WebSocket(receipt.url),finish=status=>{if(done)return;done=true;clearTimeout(timer);receipt.status=status;receipt.received_ts=Date.now();try{ws.close();}catch{}resolve();},timer=setTimeout(()=>finish('BOUNDED_PUBLIC_CAPTURE_CLOSED'),120000);
  ws.addEventListener('open',()=>{receipt.http_status=101;ws.send(JSON.stringify(request));});
  ws.addEventListener('message',e=>{if(done)return;const text=String(e.data);total+=Buffer.byteLength(text);if(total>2*1024*1024)return finish('BODY_LIMIT');raw.push({received_ts:Date.now(),text});try{const m=JSON.parse(text);messages.push(m);if(m.error)return finish('PUBLIC_SUBSCRIPTION_ERROR');if(messages.filter(x=>x.channel==='spot.trades'&&x.event==='update').length>=40)return finish('BOUNDED_PUBLIC_CAPTURE_CLOSED');}catch{return finish('INVALID_PUBLIC_JSON');}});
  ws.addEventListener('error',()=>finish('PUBLIC_SOCKET_TRANSPORT_ERROR'));ws.addEventListener('close',()=>finish('PUBLIC_SOCKET_CLOSED'));
 });
 const bytes=Buffer.from(JSON.stringify({request,raw})),gz=gzipSync(bytes);receipt.body_sha256=hash(bytes);receipt.gzip_sha256=hash(gz);receipt.bytes=bytes.length;receipt.file=receipt.name+'.json.gz';await fs.writeFile(root+'/'+receipt.file,gz);
 return messages;
}
try{
 out.daily_admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');await reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 const previous=JSON.parse(await fs.readFile('checkpoints/n05-large-qualification-38064035277/large-summary.json','utf8'));out.previous_qualification_run=38064035277;out.direction_proof=previous.direction_proof;out.native_windows=previous.native_windows;out.gate_windows=previous.gate_windows;out.source_history=previous.source_history;
 const currencies=await saved(oldDir,'GATE-ALL-CURRENCY-IDENTITY'),spot=await saved(firstDir,'catalog-GATE-SPOT'),old=prior.gate_windows.find(r=>r.contract==='SUSHI-USDT'),contract=old.contract,identity=old.identity,end=Math.floor(Date.now()/60000)*60000,query='currency_pair=SUSHI_USDT&from='+(end-14400000)/1000+'&to='+(end/1000-1);out.window_end_ts=end;
 const candles=await get('GATE-SUSHI-CLOSED-REFRESH-CANDLES','GATE','https://api.gateio.ws/api/v4/spot/candlesticks?'+query+'&interval=1m'),pages=[];let flow;
 for(let page=1;candles&&page<=3;page++){const rows=await get('GATE-SUSHI-CLOSED-REFRESH-PAGE-'+page,'GATE','https://api.gateio.ws/api/v4/spot/trades?'+query+'&limit=1000&page='+page);if(!Array.isArray(rows))break;pages.push(rows);flow=normalizeGateSpotFlow({contract,identity,currencies,spot,pages,candles,window_end_ts:end,observed_ts:out.sources.at(-1).received_ts,direction_reference:out.direction_proof});if(flow.check_completed||rows.length<1000)break;}
 if(flow){out.gate_windows.push({...flow,scope:'NEW_CLOSED_WINDOW_AFTER_RETAINED_OPEN_MINUTE_REJECTED'});if(flow.check_completed){const histEnd=turnoverHistoryEnd(flow.window_start_ts),hour=await get('GATE-SUSHI-CLOSED-REFRESH-PRIOR30D-HOURS','GATE','https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=SUSHI_USDT&from='+(histEnd-30*86400000)/1000+'&to='+(histEnd/1000-1)+'&interval=1h');out.source_history.push(normalizeTurnoverBaseline({contract,venue:'GATE',candles:hour,history_end_ts:histEnd,observed_ts:out.sources.at(-1).received_ts,current_flow:flow}));}}
 out.original_open_minute_not_changed=true;out.actual_other_source_research_reused=true;out.individual_trade_size_and_price_impact_calibration_still_open=true;out.status='LARGE_VENUE_AND_TURNOVER_FACTS_RETAINED';

}catch(e){out.status='LARGE_BATCH_NOT_CLOSED';out.reason=e.message;}
finally{
 out.http_budget=budget.summary();if(admitted)out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';out.completed_ts=Date.now();await fs.writeFile(root+'/large-summary.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,sourceHTTP:out.sourceHTTP,direction:out.direction_proof?.status,matches:out.direction_proof?.matched_count,D1:out.D1,native:out.native_windows?.map(r=>({contract:r.contract,status:r.status,reason:r.reason})),gate:out.gate_windows?.map(r=>({contract:r.contract,status:r.status,reason:r.reason,scope:r.scope})),history:out.source_history?.map(r=>({contract:r.contract,venue:r.venue,status:r.status,reason:r.reason,ratio:r.ratio_to_median})),sources:out.sources.map(r=>({name:r.name,status:r.status,http:r.http_status,bytes:r.bytes}))}));
}
