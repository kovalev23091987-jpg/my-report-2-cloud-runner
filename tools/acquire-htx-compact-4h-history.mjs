import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {reserveEvidenceSourceAttempts} from '../current-generation/files/src/evidence-source-store.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {COMPACT_HTX_4H,planCompactHtx90d,qualifyCompactHtx90d} from '../runner/htx-compact-4h-history.mjs';

const root='checkpoints/htx-compact-4h',audit='audit-output/htx-compact-4h',now=Date.now();
const id='HTX_COMPACT_4H_90D:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const reservation={rows_read:500,rows_written:32},http=createUnifiedHttpBudget();
const sha=b=>createHash('sha256').update(b).digest('hex');
const out={schema:'HTX_COMPACT_90D_4H_ACTUAL_BATCH_V1',source:COMPACT_HTX_4H.source,
  source_daily_cap:6,anchor_end_ts:COMPACT_HTX_4H.anchor_end_ts,
  head:process.env.GITHUB_SHA,cloud_run:Number(process.env.GITHUB_RUN_ID),run_id:id,started_ts:now,
  sourceHTTP:0,source_http_reserved:0,MAIN:0,Telegram:0,score_contribution:0,
  native_1m_qualified:false,volume_qualified:false,entry_authorized:false,
  actual_ENTRY:false,project_complete:false,results:[]};
await fs.mkdir(root,{recursive:true});await fs.mkdir(audit,{recursive:true});
let db,reserved=false;
async function requestOne(url,contract) {
 const grant=http.reserve({logical_request_id:id+':'+contract,lane:'statistics',attempts:1});
 if(!grant.allowed||grant.duplicate)throw Error('UNIFIED_HTTP_STATISTICS_LANE_BLOCKED');
 const receipt={url,contract,requested_ts:Date.now(),http_status:null,bytes:0,sha256:null};
 out.sourceHTTP++;
 try{
   const res=await fetch(url,{redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});
   receipt.http_status=res.status;receipt.received_ts=Date.now();receipt.server_date=res.headers.get('date');
   if(!res.ok){receipt.reason=res.status===429?'HTX_RATE_LIMITED':'HTTP_'+res.status;return {receipt,raw:null};}
   if(!res.body){receipt.reason='EMPTY_BODY';return {receipt,raw:null};}
   let size=0;const chunks=[];
   for await(const chunk of res.body){
     size+=chunk.length;
     if(size>1_500_000)throw Error('BOUNDED_RESPONSE_BYTES_EXCEEDED');
     chunks.push(chunk);
   }
   const bytes=Buffer.concat(chunks);
   receipt.bytes=bytes.length;receipt.sha256=sha(bytes);
   return {receipt,raw:bytes.toString('utf8')};
 }catch(e){receipt.received_ts=Date.now();receipt.reason=String(e.message).slice(0,150);return {receipt,raw:null};}
}
try{
 const universe=JSON.parse((await import('node:zlib')).gunzipSync(await fs.readFile('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz')));
 const existing=[];
 for(const file of await fs.readdir(root)){
   if(!file.endsWith('.manifest.json'))continue;
   const m=JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
   existing.push(m);
 }
 out.plan=planCompactHtx90d({universe,manifests:existing,now_ts:now,limit:6});
 if(out.plan.status==='ALL_CONTRACTS_ATTEMPTED_OR_COOLDOWN'||out.plan.status==='PILOT_NEAR_NOT_VERIFIED_OR_COOLDOWN'){
   out.status=out.plan.status==='PILOT_NEAR_NOT_VERIFIED_OR_COOLDOWN'?'PILOT_NOT_QUALIFIED_WAIT_OR_REVIEW':'NO_ELIGIBLE_NEW_ASSET_OR_COOLDOWN';
 }else if(out.plan.status!=='BOUNDED_COMPACT_ACQUISITION_PLAN'){
   throw Error('BOUNDED_EXACT_102_SOURCE_PLAN_REQUIRED_'+out.plan.status);
 }else{
   db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
   out.d1_admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),
     nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
   if(!out.d1_admission.allowed)throw Error('D1_DAILY_ADMISSION_'+out.d1_admission.status);
   await reserveRunBudget(db,{reservationId:id,now,reservation});reserved=true;
   out.source_admission=await reserveEvidenceSourceAttempts(db,{
     source:COMPACT_HTX_4H.source,reservation_id:id,attempts:out.plan.planned.length,
     daily_cap:COMPACT_HTX_4H.daily_source_cap,now});
   if(!out.source_admission.allowed)throw Error('SHARED_HTX_SOURCE_DAILY_CAP_'+out.source_admission.status);
   out.source_http_reserved=out.plan.planned.length;
   for(const p of out.plan.planned){
     const prev=existing.find(m=>m.contract===p.contract);
     const {receipt,raw}=await requestOne(p.url,p.contract);
     const qualified=raw===null?null:qualifyCompactHtx90d({contract:p.contract,raw,received_ts:receipt.received_ts});
     const status=qualified?.status??(receipt.http_status===null?'NETWORK_UNAVAILABLE':'HTTP_UNAVAILABLE');
     const file=encodeURIComponent(p.contract);
     const manifest={schema:COMPACT_HTX_4H.schema,contract:p.contract,venue:'HTX_USDT_LINEAR_SWAP',
       source:COMPACT_HTX_4H.source,period:'4hour',anchor_end_ts:COMPACT_HTX_4H.anchor_end_ts,
       attempted_ts:receipt.received_ts,attempts_total:(prev?.attempts_total??0)+1,
       status,receipt,raw_sha256:receipt.sha256,raw_file:raw===null?null:file+'.raw.json.gz',
       normalized_file:qualified?.candles?.length?file+'.normalized.json.gz':null,
       observed_bars:qualified?.observed_bars??0,missing_bars:qualified?.missing_bars??540,
       gaps:qualified?.gaps??[],normalized_sha256:qualified?.normalized_sha256??null,
       source_ts:qualified?.source_ts??null,reason:qualified?.reason??receipt.reason??null,
       complete_90d_4h_price_only:qualified?.complete_90d_4h_price_only===true,
       complete_30d_4h_price_only:qualified?.complete_30d_4h_price_only===true,
       native_1m_complete:false,volume_qualified:false,live_quote_eligible:false,
       decision_replay_eligible:false,entry_authorized:false,score_contribution:0,
       actual_ENTRY:false,project_complete:false};
     if(raw!==null)await fs.writeFile(path.join(root,file+'.raw.json.gz'),gzipSync(raw));
     if(qualified?.candles?.length)await fs.writeFile(path.join(root,file+'.normalized.json.gz'),gzipSync(JSON.stringify(qualified.candles)));
     await fs.writeFile(path.join(root,file+'.manifest.json'),JSON.stringify(manifest,null,2)+'\n');
     out.results.push({contract:p.contract,status,sourceHTTP:1,http_status:receipt.http_status,
       observed_bars:manifest.observed_bars,missing_bars:manifest.missing_bars,
       complete_90d_4h_price_only:manifest.complete_90d_4h_price_only,
       native_1m_complete:false,entry_authorized:false});
   }
   out.status='BOUNDED_ACTUAL_COMPACT_SOURCE_ATTEMPTS_FINISHED';
 }
}catch(e){out.status='ACQUISITION_NOT_CLOSED';out.reason=String(e.message).slice(0,240);}
finally{
 out.http_budget=http.summary();
 if(db){
   const u=db.usageSnapshot();out.D1=u;
   if(reserved)try{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:u});}
   catch(e){out.status='D1_FINALIZATION_NOT_CLOSED';out.finalization_reason=String(e.message).slice(0,180);}
   if(u.unknown_ops||u.rows_read>reservation.rows_read||u.rows_written>reservation.rows_written){
     out.status='D1_USAGE_BOUND_NOT_CLOSED';out.reason='D1_UNMEASURED_OR_EXCEEDED_RESERVATION';
   }
 }
 out.finished_ts=Date.now();
 await fs.writeFile(path.join(audit,'actual-batch.json'),JSON.stringify(out,null,2)+'\n');
 // The small stable summary is committed only after the cloud job verifies its own lease.
 if(out.status==='BOUNDED_ACTUAL_COMPACT_SOURCE_ATTEMPTS_FINISHED')
   await fs.writeFile(path.join(root,'latest-batch.json'),JSON.stringify({
     schema:out.schema,source:out.source,cloud_run:out.cloud_run,head:out.head,
     started_ts:out.started_ts,finished_ts:out.finished_ts,
     anchor_end_ts:out.anchor_end_ts,sourceHTTP:out.sourceHTTP,source_http_reserved:out.source_http_reserved,
     D1:out.D1,results:out.results,native_1m_complete:false,actual_ENTRY:false,project_complete:false
   },null,2)+'\n');
 console.log(JSON.stringify({status:out.status,reason:out.reason,sourceHTTP:out.sourceHTTP,
   source_http_reserved:out.source_http_reserved,results:out.results,D1:out.D1,project_complete:false}));
 if(['D1_FINALIZATION_NOT_CLOSED','D1_USAGE_BOUND_NOT_CLOSED'].includes(out.status))process.exitCode=1;
}
