import fs from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifestPath='checkpoints/htx-current-crypto-futures-universe-20261010.json.gz',z=await fs.readFile(manifestPath);
if(hash(z)!=='ade6878a0ba9921a83695a1a82d19be9867ddebb7ff8b741a3b46f59f950a81c')throw Error('CURRENT104_MANIFEST_HASH');
const universe=JSON.parse(gunzipSync(z)),plan=JSON.parse(await fs.readFile('checkpoints/HTX_104_ASSET_COLLECTION_AND_N05_PLAN_20261010.json'));
const candidates=plan.next_qualification_plan?.candidate_contracts;
if(universe.assets.length!==104||!Array.isArray(candidates)||candidates.length!==12||new Set(candidates).size!==12||candidates.some(c=>!universe.assets.some(a=>a.symbol+'-USDT'===c)))throw Error('EXACT104_AND_SAVED12_REQUIRED');
const proposal={schema:'N05_SAVED12_SHARED_NATIVE_BATCH_PLAN_V1',approved_assets:104,candidate_contracts:candidates,common_closed_anchor:true,shared_poloniex_metadata_HTTP:3,maximum_poloniex_native_HTTP:12,maximum_poloniex_HTTP:15,maximum_primary_identity_HTTP:1,maximum_source_HTTP:16,Poloniex_daily_cap:16,HTX_ASSET_REFERENCE_daily_cap:8,provider_minute_cap:6,background_HTTP_cap:28,D1_reservation:{rows_read:16000,rows_written:500},new_source_HTTP:0,new_D1:0,caps_changed:false,requires_fresh_owned_cloud_guard_before_execution:true,not_scheduled_or_executed:true};
if(process.argv.includes('--plan')){console.log(JSON.stringify(proposal,null,2));process.exit(0);}
if(!process.env.GITHUB_RUN_ID||!process.env.GITHUB_SHA||!process.env.REPORT2_D1_BRIDGE_URL||!process.env.REPORT2_D1_BRIDGE_TOKEN||!process.env.GITHUB_TOKEN||!process.env.REPORT2_EXPECTED_MAIN||!process.env.REPORT2_EXPECTED_LEASE_OWNER)throw Error('GUARDED_CLOUD_RUNTIME_REQUIRED');
const repo=process.env.GITHUB_REPOSITORY;if(repo!=='kovalev23091987-jpg/my-report-2-cloud-runner')throw Error('EXACT_REPOSITORY_REQUIRED');
const readControl=async path=>{const r=await fetch('https://api.github.com/repos/'+repo+'/'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('CLOUD_OWNER_CONTROL_READ_REQUIRED');return r.json();};
const main=(await readControl('git/ref/heads/main')).object.sha;
if(main!==process.env.REPORT2_EXPECTED_MAIN)throw Error('MAIN_MOVED');
const readGuard=async path=>JSON.parse(Buffer.from((await readControl('contents/'+path+'?ref='+main)).content,'base64').toString());
const phase=await readGuard('checkpoints/CLOUD_PHASE_STATE_20261004.json'),fence=await readGuard('audit-fixes/source-optimization-20260930/execution-lock.json');
if(phase.lease?.owner!==process.env.REPORT2_EXPECTED_LEASE_OWNER||phase.lease.expires_ts<=Date.now()||fence.active)throw Error('CURRENT_OWNED_LEASE_REQUIRED');
const [{RemoteD1Database},guard,{createUnifiedHttpBudget},store,{reserveProviderMinuteUnits},{normalizeHtxAssetReferences,FUTURES_ONLY_EXACT_ASSET_BINDINGS},{exactPoloniexBinding,normalizePoloniexNativeFlow}]=await Promise.all([
 import('../runner/report2-d1-adapter.mjs'),import('../runner/d1-preaction-budget-guard.mjs'),import('../current-generation/files/src/unified-budget.mjs'),import('../current-generation/files/src/evidence-source-store.mjs'),import('../current-generation/files/src/provider-minute-ledger.mjs'),import('../current-generation/files/src/htx-asset-identity.mjs'),import('../current-generation/files/src/poloniex-native-four-hour-flow.mjs')
]);
const root='audit-output/n05-saved12-native',now=Date.now(),run=process.env.GITHUB_RUN_ID,id='N05_PLANNED_NATIVE:'+run+':'+process.env.GITHUB_RUN_ATTEMPT,reservation=proposal.D1_reservation,db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget(),blocked=new Set();
const out={...proposal,not_scheduled_or_executed:false,schema:'N05_SAVED12_SHARED_NATIVE_BATCH_ACTUAL_V1',run,head:process.env.GITHUB_SHA,cloud_owner_guard:{main,lease_owner:phase.lease.owner,fence_active:false,GitHub_control_reads:3},started_ts:now,status:'NOT_ADMITTED',sourceHTTP:0,sources:[],windows:[],MAIN:0,Telegram:0,score:0,new_fresh_SENT:false,project_complete:false};
await fs.mkdir(root,{recursive:true});let admitted=false;
const roleUsed=async source=>{const r=await db.prepare('SELECT attempts FROM report2_evidence_source_daily WHERE source=?1 AND day_utc=?2 LIMIT 1').bind(source,new Date(Date.now()).toISOString().slice(0,10)).first();const n=r==null?0:Number(r.attempts);if(!Number.isSafeInteger(n)||n<0)throw Error('UNKNOWN_SOURCE_COUNTER');return n;};
async function get(name,venue,url,source='N05_OFFICIAL_FLOW:'+venue,cap=16){
 const receipt={name,venue,source,url,status:'NOT_ATTEMPTED',actual_http:0};out.sources.push(receipt);
 try{
  if(blocked.has(venue))throw Error('SHARED_VENUE_BACKOFF');
  while(true){const recent=out.sources.filter(r=>r.venue===venue&&r.actual_http===1&&Date.now()-r.attempt_ts<60000);if(recent.length<6)break;await new Promise(r=>setTimeout(r,Math.min(10000,Math.max(1,60050-(Date.now()-recent[0].attempt_ts)))));}
  if(!guard.evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:22}).allowed)throw Error('D1_HEADROOM_DENIED');
  if(await store.readEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:'+venue,asset_key:'SHARED',now:Date.now()})){blocked.add(venue);throw Error('DURABLE_VENUE_BACKOFF');}
  if(await roleUsed(source)>=cap)throw Error('SOURCE_DAILY_CAP_DENIED');
  const logical_request_id=id+':'+name,whole=budget.reserve({logical_request_id,lane:'background',attempts:1});receipt.whole_admission=whole;if(!whole.allowed||whole.duplicate)throw Error('WHOLE_JOB_HTTP_DENIED');
  const daily=await store.reserveEvidenceSourceAttempts(db,{source,reservation_id:logical_request_id,attempts:1,daily_cap:cap,now:Date.now()});receipt.daily_admission=daily;if(!daily.allowed)throw Error('SOURCE_DAILY_CAP_DENIED');
  const minute=await reserveProviderMinuteUnits(db,{provider:venue,reservation_id:logical_request_id,units:1,cap:6,now:Date.now()});receipt.minute_admission=minute;if(!minute.allowed)throw Error('PROVIDER_MINUTE_CAP_DENIED');
  receipt.actual_http=1;receipt.attempt_ts=Date.now();out.sourceHTTP++;
  const response=await fetch(url,{headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(15000)}),chunks=[];let size=0;receipt.http_status=response.status;
  for await(const c of response.body){size+=c.length;if(size>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(c);}
  const b=Buffer.concat(chunks),gz=gzipSync(b);receipt.received_ts=Date.now();receipt.body_sha256=hash(b);receipt.gzip_sha256=hash(gz);receipt.bytes=size;receipt.file=name+'.json.gz';await fs.writeFile(root+'/'+receipt.file,gz);
  if([401,403,429,451].includes(response.status)){blocked.add(venue);const retry=response.headers.get('retry-after'),seconds=/^\d+$/.test(retry||'')?Number(retry):0;await store.writeEvidenceSourceCache(db,{source:'N05_PROVIDER_BACKOFF:'+venue,asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:response.status,original_received_ts:receipt.received_ts}});}
  if(response.status!==200)throw Error('HTTP_'+response.status);
  const payload=JSON.parse(b);receipt.status='RECEIVED_NOT_QUALIFIED';return payload;
 }catch(e){receipt.status=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;receipt.received_ts??=Date.now();return null;}
}
try{
 out.daily_admission=guard.evaluateDailyReservationBudget({daily:await guard.loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
 if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');
 await guard.reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 const used=await roleUsed('N05_OFFICIAL_FLOW:POLONIEX'),primaryUsed=await roleUsed('HTX_ASSET_REFERENCE');out.source_preflight={Poloniex_used:used,Poloniex_required:15,Poloniex_cap:16,HTX_identity_used:primaryUsed,HTX_identity_cap:8};
 // Refuse the whole planned acquisition before metadata when its native role
 // cannot fund this batch. Never reset, alias or refund earlier reservations.
 if(used+15>16||primaryUsed+1>8)throw Error('ENTIRE_BATCH_SOURCE_HEADROOM_REQUIRED');
 const htx=await get('HTX-CURRENT-IDENTITIES','HTX','https://api.huobi.pro/v2/reference/currencies','HTX_ASSET_REFERENCE',8);
 const entries=normalizeHtxAssetReferences(htx);if(entries.status!=='CLOSED')throw Error('CURRENT_PRIMARY_IDENTITIES_REQUIRED');out.primary_identity_received_ts=out.sources.at(-1).received_ts;
 const assets=await get('POLONIEX-ALL-ASSETS','POLONIEX','https://api.poloniex.com/v2/currencies');
 const markets=await get('POLONIEX-ALL-MARKETS','POLONIEX','https://api.poloniex.com/markets');
 const activity=await get('POLONIEX-ALL-ACTIVITY','POLONIEX','https://api.poloniex.com/markets/ticker24h');
 if(![assets,markets,activity].every(Array.isArray))throw Error('SHARED_NATIVE_METADATA_REQUIRED');
 const end=Math.floor(Date.now()/60000)*60000;out.window_end_ts=end;out.window_start_ts=end-14400000;
 for(const contract of candidates){
  if(Date.now()-end>300000){out.windows.push({contract,status:'ANCHOR_AGED_DURING_BATCH',check_completed:false});continue;}
  const symbol=contract.slice(0,-5),e=entries.entries[symbol],override=FUTURES_ONLY_EXACT_ASSET_BINDINGS[symbol],identity=e?.status==='CLOSED'?e.identities[0]:override?.identity;
  if(!identity||!exactPoloniexBinding({contract,identity,assets,markets})){out.windows.push({contract,status:'CURRENT_EXACT_ASSET_BINDING_REQUIRED',check_completed:false});continue;}
  const hints=activity.filter(r=>r.symbol===symbol+'_USDT'),hint=hints.length===1?hints[0]:null;
  if(hint?.tradeCount===0&&/^0(?:\.0+)?$/.test(hint.amount||'')&&/^0(?:\.0+)?$/.test(hint.quantity||'')&&Number.isSafeInteger(hint.startTime)&&Number.isSafeInteger(hint.closeTime)&&hint.startTime<=end-14400000&&hint.closeTime>=end&&hint.closeTime<=Date.now()){out.windows.push({contract,status:'NO_TRADES_IN_CONTAINING_NATIVE_ACTIVITY_WINDOW',check_completed:false,activity_hint:hint,not_a_full_minute_grid:true});continue;}
  const candles=await get('POLONIEX-'+symbol+'-NATIVE240','POLONIEX','https://api.poloniex.com/markets/'+encodeURIComponent(symbol+'_USDT')+'/candles?interval=MINUTE_1&startTime='+(end-14400000)+'&endTime='+(end-1)+'&limit=240');
  const receipt=out.sources.at(-1),component=normalizePoloniexNativeFlow({contract,identity,assets,markets,candles,window_end_ts:end,observed_ts:receipt.received_ts});
  out.windows.push({...component,identity_method:e?.status==='CLOSED'?'CURRENT_PRIMARY_HTX_REFERENCE':'VERSIONED_EXPLORER_EXACT_TOKEN_BINDING',identity_original_ts:e?.status==='CLOSED'?out.primary_identity_received_ts:Date.parse(override.verified_at),raw_file:receipt.file,raw_body_sha256:receipt.body_sha256});
 }
 out.status='SHARED_NATIVE_BATCH_RETAINED_WITH_EXPLICIT_PER_COIN_QUALIFICATION';
}catch(e){out.status='BATCH_NOT_CLOSED';out.reason=e.message;}
finally{
 out.http_budget=budget.summary();if(admitted)out.finalized_usage=await guard.finalizeRunUsage(db,{reservationId:id,sourceRunId:run,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();
 if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';
 out.completed_ts=Date.now();out.new_D1=undefined;out.new_source_HTTP=undefined;
 const b=Buffer.from(JSON.stringify(out)),gz=gzipSync(b);await fs.writeFile(root+'/original-batch.json.gz',gz);
 const summary={...out,raw_batch:{body_sha256:hash(b),gzip_sha256:hash(gz),file:'original-batch.json.gz'},individual_full_windows:out.windows.filter(c=>c.check_completed).length,simultaneous_continuous_coverage:false};
 await fs.writeFile(root+'/batch-summary.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
}
