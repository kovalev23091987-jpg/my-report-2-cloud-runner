import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import * as guard from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {readEvidenceSourceCache,reserveEvidenceSourceAttempts,writeEvidenceSourceCache} from '../current-generation/files/src/evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from '../current-generation/files/src/provider-minute-ledger.mjs';
import {exactBackpackTokenBinding,normalizeBackpackSpotFlow} from '../current-generation/files/src/backpack-four-hour-flow.mjs';

const repo='kovalev23091987-jpg/my-report-2-cloud-runner',source='N05_OFFICIAL_FLOW:BACKPACK',symbols=['ENA','JUP','ONDO','PENGU'];
const cap=16,reservation={rows_read:16000,rows_written:500},root='audit-output/n05-backpack-missing4',sleep=ms=>new Promise(r=>setTimeout(r,ms)),sha=b=>createHash('sha256').update(b).digest('hex');
const proposal={schema:'N05_BACKPACK_MISSING4_PLAN_V1',symbols,approved_assets:104,source,shared_metadata_HTTP:2,maximum_window_HTTP:8,maximum_source_HTTP:10,source_cap:cap,provider_rolling_minute_cap:6,background_HTTP_cap:28,D1_reservation:reservation,caps_changed:false,one_trade_page_per_market:true};
if(process.argv.includes('--plan')){console.log(JSON.stringify(proposal,null,2));process.exit(0);}
for(const name of ['GITHUB_RUN_ID','GITHUB_SHA','GITHUB_TOKEN','REPORT2_D1_BRIDGE_URL','REPORT2_D1_BRIDGE_TOKEN','REPORT2_EXPECTED_MAIN','REPORT2_EXPECTED_LEASE_OWNER'])if(!process.env[name])throw Error(name+'_REQUIRED');
if(process.env.GITHUB_REPOSITORY!==repo)throw Error('EXACT_REPOSITORY_REQUIRED');
const api=async path=>{const r=await fetch('https://api.github.com/repos/'+repo+'/'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('GITHUB_CONTROL_READ_'+r.status);return r.json();};
const main=(await api('git/ref/heads/main')).object.sha;if(main!==process.env.REPORT2_EXPECTED_MAIN)throw Error('MAIN_MOVED');
const read=async path=>JSON.parse(Buffer.from((await api('contents/'+path+'?ref='+main)).content,'base64').toString());
const phase=await read('checkpoints/CLOUD_PHASE_STATE_20261004.json'),fence=await read('audit-fixes/source-optimization-20260930/execution-lock.json');
if(phase.lease?.owner!==process.env.REPORT2_EXPECTED_LEASE_OWNER||phase.lease.expires_ts<=Date.now()||fence.active)throw Error('OWNER_OR_FENCE_BLOCKED');
const routes=await read('checkpoints/N05_104_EXACT_SOURCE_ROUTES_20261010.json');if(routes.rows?.length!==104)throw Error('CURRENT104_ROUTES_REQUIRED');
const identities=new Map(routes.rows.map(r=>[r.symbol,r]));for(const symbol of symbols){const row=identities.get(symbol);if(!row||row.prior_individual_full_window||!row.identity)throw Error('FOUR_MISSING_IDENTITIES_REQUIRED:'+symbol);}
const now=Date.now(),run=process.env.GITHUB_RUN_ID,id='N05_BACKPACK_MISSING4:'+run+':'+process.env.GITHUB_RUN_ATTEMPT;
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget();
const out={...proposal,schema:'N05_BACKPACK_MISSING4_ACTUAL_V1',run,head:process.env.GITHUB_SHA,main,lease_owner:phase.lease.owner,started_ts:now,status:'NOT_ADMITTED',sourceHTTP:0,originals:[],results:[],MAIN:0,Telegram:0,score:0,new_fresh_SENT:false,project_complete:false};
await fs.mkdir(root,{recursive:true});let admitted=false,sequence=0;
async function acquire(name,url){
 const receipt={name,url,source,status:'NOT_ATTEMPTED',actual_http:0};out.originals.push(receipt);
 try{
  if(!guard.evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:22}).allowed)throw Error('D1_HEADROOM_DENIED');
  if(await readEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:BACKPACK',asset_key:'SHARED',now:Date.now()}))throw Error('DURABLE_VENUE_BACKOFF');
  const requestId=id+':'+(++sequence)+':'+name;let minute;
  for(let attempt=0;attempt<8;attempt++){minute=await reserveProviderMinuteUnits(db,{provider:'BACKPACK',reservation_id:requestId,units:1,cap:6,now:Date.now()});if(minute.allowed||minute.status!=='ROLLING_60S_CAP_REACHED')break;await sleep(10000);}
  receipt.minute_admission=minute;if(!minute.allowed)throw Error(minute.status);
  const whole=budget.reserve({logical_request_id:requestId,lane:'background',attempts:1});receipt.whole_admission=whole;if(!whole.allowed||whole.duplicate)throw Error('WHOLE_JOB_HTTP_DENIED');
  const daily=await reserveEvidenceSourceAttempts(db,{source,reservation_id:requestId,attempts:1,daily_cap:cap,now:Date.now()});receipt.daily_admission=daily;if(!daily.allowed)throw Error('SOURCE_DAILY_CAP_DENIED');
  receipt.actual_http=1;receipt.attempt_ts=Date.now();out.sourceHTTP++;
  const response=await fetch(url,{headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(15000)}),chunks=[];let size=0;receipt.http_status=response.status;
  for await(const c of response.body){size+=c.length;if(size>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(c);}
  const bytes=Buffer.concat(chunks),gz=gzipSync(bytes);receipt.received_ts=Date.now();receipt.body_sha256=sha(bytes);receipt.gzip_sha256=sha(gz);receipt.bytes=size;receipt.file=name+'.json.gz';await fs.writeFile(root+'/'+receipt.file,gz);
  if([401,403,429,451].includes(response.status)){const retry=response.headers.get('retry-after'),seconds=/^\d+$/.test(retry||'')?Number(retry):0;await writeEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:BACKPACK',asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:response.status,original_received_ts:receipt.received_ts}});}
  if(response.status!==200)throw Error('HTTP_'+response.status);const p=JSON.parse(bytes);if(!Array.isArray(p))throw Error('INVALID_PROVIDER_SCHEMA');receipt.status='RECEIVED_NOT_QUALIFIED';return p;
 }catch(e){receipt.status=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;receipt.received_ts??=Date.now();return null;}
}
try{
 out.daily_admission=guard.evaluateDailyReservationBudget({daily:await guard.loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');
 await guard.reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 const row=await db.prepare('SELECT attempts FROM report2_evidence_source_daily WHERE source=?1 AND day_utc=?2 LIMIT 1').bind(source,new Date(Date.now()).toISOString().slice(0,10)).first();
 const used=row==null?0:Number(row.attempts);if(!Number.isSafeInteger(used)||used<0)throw Error('UNKNOWN_SOURCE_COUNTER');out.source_preflight={used,required:10,cap,remaining:cap-used,allowed:cap-used>=10};if(cap-used<10)throw Error('ENTIRE_USEFUL_BATCH_SOURCE_HEADROOM_REQUIRED');
 const assets=await acquire('BACKPACK-ASSETS','https://api.backpack.exchange/api/v1/assets'),markets=await acquire('BACKPACK-MARKETS','https://api.backpack.exchange/api/v1/markets');
 if(!assets||!markets)throw Error('CURRENT_PRIMARY_METADATA_REQUIRED');
 const end=Math.floor(Date.now()/60000)*60000;out.window_end_ts=end;out.window_start_ts=end-14400000;
 for(const symbol of symbols){
  if(Date.now()-end>300000){out.results.push({symbol,status:'ANCHOR_AGED_DURING_BATCH',check_completed:false});continue;}
  const row=identities.get(symbol),contract=row.contract,quote='USDC';
  if(!exactBackpackTokenBinding({contract,identity:row.identity,assets,markets,quote})){out.results.push({symbol,status:'EXACT_CURRENT_PRIMARY_BINDING_REQUIRED',check_completed:false});continue;}
  const pair=symbol+'_'+quote,query='symbol='+encodeURIComponent(pair);
  const candles=await acquire('BACKPACK-'+symbol+'-CANDLES','https://api.backpack.exchange/api/v1/klines?'+query+'&interval=1m&startTime='+(end-14400000)/1000+'&endTime='+end/1000+'&priceType=Last&source=Venue');
  const fills=await acquire('BACKPACK-'+symbol+'-TRADES','https://api.backpack.exchange/api/v1/trades/history?'+query+'&limit=1000&offset=0');
  if(!candles||!fills){out.results.push({symbol,status:'WINDOW_RESPONSE_NOT_RECEIVED',check_completed:false});continue;}
  const receipt=out.originals.at(-1),component=normalizeBackpackSpotFlow({contract,identity:row.identity,assets,markets,quote,pages:[fills],candles,window_end_ts:end,observed_ts:receipt.received_ts});
  out.results.push({...component,symbol,identity_original_received_ts:row.identity_original_received_ts,receipt_hashes:out.originals.slice(-2).map(r=>r.body_sha256),one_page_bounded:true});
 }
 out.status='BACKPACK_SPOT_BATCH_RETAINED_WITH_PER_COIN_QUALIFICATION';
}catch(e){out.status='BATCH_NOT_CLOSED';out.reason=e.message;}
finally{
 out.http_budget=budget.summary();if(admitted)out.finalized_usage=await guard.finalizeRunUsage(db,{reservationId:id,sourceRunId:run,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();
 if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';
 out.completed_ts=Date.now();out.individual_full_windows=out.results.filter(w=>w.check_completed).length;out.simultaneous_continuous_coverage=false;
 await fs.writeFile(root+'/batch-summary.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,sourceHTTP:out.sourceHTTP,individual_full_windows:out.individual_full_windows,D1:out.D1}));
}
