import fs from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,evaluateWithinRunReservation,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {reserveEvidenceSourceAttempts} from '../current-generation/files/src/evidence-source-store.mjs';
import {normalizeHtxAssetReferences} from '../current-generation/files/src/htx-asset-identity.mjs';
const root='audit-output/n01-source-qualification',sha=b=>createHash('sha256').update(b).digest('hex'),now=Date.now(),id='N01_FREE_SOURCE_QUALIFICATION:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),reservation={rows_read:2000,rows_written:96},budget=createUnifiedHttpBudget();
const universe=JSON.parse(gunzipSync(await fs.readFile('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz')));if(universe.assets.length!==102)throw Error('EXACT_UNIVERSE_REQUIRED');
const out={schema:'N01_FREE_SOURCE_ACTUAL_QUALIFICATION_V1',cloud_run:process.env.GITHUB_RUN_ID,head:process.env.GITHUB_SHA,run_id:id,started_ts:now,universe_count:102,minimum_useful_assets:31,owner_minimum_fraction:0.30,MAIN:0,Telegram:0,score_adjustment:0,production_enabled:false,project_complete:false,sourceHTTP:0,sources:[]};
await fs.mkdir(root,{recursive:true});let reserved=false;
async function original(name,source,url,maxBytes=6*1024*1024){
 const receipt={name,source,url,started_ts:Date.now(),verified_useful_assets:[],coverage_status:'UNQUALIFIED',retrieval_time_is_not_source_clock:true};out.sources.push(receipt);
 try{
 if(!evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:25,extraRowsWritten:8}).allowed)throw Error('D1_HEADROOM_BLOCKED');
 receipt.daily_admission=await reserveEvidenceSourceAttempts(db,{source,reservation_id:id+':'+name,attempts:1,daily_cap:source==='HTX_ASSET_REFERENCE'?8:4,now});if(!receipt.daily_admission.allowed)throw Error('SOURCE_DAILY_ADMISSION_BLOCKED');
 const grant=budget.reserve({logical_request_id:id+':'+name,lane:'background',attempts:1});if(!grant.allowed||grant.duplicate)throw Error('HTTP_ADMISSION_BLOCKED');out.sourceHTTP++;
 const r=await fetch(url,{redirect:'manual',headers:{accept:'text/html,application/json'},signal:AbortSignal.timeout(25000)});receipt.http_status=r.status;receipt.location=r.headers.get('location');receipt.server_date=r.headers.get('date');receipt.content_type=r.headers.get('content-type');
 const chunks=[];let bytes=0;for await(const chunk of r.body){bytes+=chunk.length;if(bytes>maxBytes)throw Error('BOUNDED_BODY_EXCEEDED');chunks.push(chunk);}const b=Buffer.concat(chunks),gz=gzipSync(b);receipt.bytes=b.length;receipt.sha256=sha(b);receipt.gzip_sha256=sha(gz);receipt.file=name+'.gz';await fs.writeFile(root+'/'+receipt.file,gz);receipt.received_ts=Date.now();if(r.status!==200){receipt.coverage_status='HTTP_NOT_CLOSED';return null;}
 const body=b.toString();receipt.coverage_status='ORIGINAL_RETAINED_NOT_YET_QUALIFIED';
 if(name==='htx-identities'){const payload=JSON.parse(body),refs=normalizeHtxAssetReferences(payload);out.identities=Object.fromEntries(universe.assets.map(a=>[a.symbol,refs.entries[a.symbol]??{status:'HTX_CURRENCY_NOT_FOUND',identities:[]} ]));await fs.writeFile(root+'/exact-identities.json',JSON.stringify(out.identities,null,2)+'\n');}
 else{
 receipt.catalog_ticker_mentions=universe.assets.filter(a=>new RegExp('(?:^|[^A-Za-z0-9])'+a.symbol.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:[^A-Za-z0-9]|$)','i').test(body)).map(a=>a.symbol);receipt.catalog_mentions_are_not_coverage=true;
 const next=body.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);if(next){await fs.writeFile(root+'/'+name+'-next-data.json',JSON.stringify(JSON.parse(next[1]),null,2)+'\n');receipt.next_data_retained=true;}
 receipt.script_urls=[...body.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m=>m[1]).slice(0,80);
 }
 return b;
 }catch(e){receipt.received_ts=Date.now();receipt.coverage_status='TRANSPORT_OR_ADMISSION_NOT_CLOSED';receipt.failure_code=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;return null;}
}
try{
 out.daily_admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_BLOCKED');await reserveRunBudget(db,{reservationId:id,now,reservation});reserved=true;
 for(const [name,source,url,max] of [
 ['dropstab-page-js','DROPSTAB_PUBLIC_UNLOCKS','https://dropstab.com/_next/static/chunks/app/%5Blocale%5D/(main)/vesting/page-a4acaf3a9f0e7ae0.js'],
 ['cmc-page-js','CMC_PUBLIC_UNLOCKS','https://s2.coinmarketcap.com/v1/cmc/_next/static/chunks/pages/token-unlocks-960f9fe482d4d9a9.js']
 ])await original(name,source,url,max);
 out.status='ORIGINAL_ACQUISITION_COMPLETE_COVERAGE_OPEN';
}catch(e){out.status='QUALIFICATION_ADMISSION_NOT_CLOSED';out.reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;}
finally{
 out.http_budget=budget.summary();out.D1=db.usageSnapshot();await fs.writeFile(root+'/acquisition.json',JSON.stringify(out,null,2)+'\n');
 if(reserved)try{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}catch(e){out.status='D1_FINALIZATION_NOT_CLOSED';out.finalization_error_fingerprint=sha(String(e.message));}
 out.D1=db.usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';out.completed_ts=Date.now();await fs.writeFile(root+'/acquisition.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,cloud_run:out.cloud_run,sourceHTTP:out.sourceHTTP,D1:out.D1,sources:out.sources.map(s=>({name:s.name,http_status:s.http_status,bytes:s.bytes,status:s.coverage_status,mentions:s.catalog_ticker_mentions,failure:s.failure_code,next:s.next_data_retained})),minimum_useful_assets:31}));
}
