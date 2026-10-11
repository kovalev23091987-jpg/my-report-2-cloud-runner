import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import * as guard from '../runner/d1-preaction-budget-guard.mjs';

const repository='kovalev23091987-jpg/my-report-2-cloud-runner';
const groups={native10:['AVAX','BCH','ATOM','ETC','LTC','NEAR','DOT','XLM','TRX','ZEC'],extra2:['XRP','HBAR']};
const batch=process.env.REPORT2_N06_BATCH||'native10',targets=groups[batch];if(!targets)throw Error('EXACT_N06_BATCH_REQUIRED');
const source='WIKIMEDIA_ATTENTION',cap=12,reservation={rows_read:10000,rows_written:1000};
const root='audit-output/n06-wikimedia-native10',digest=b=>createHash('sha256').update(b).digest('hex');
const plan={schema:'N06_WIKIMEDIA_NATIVE_PAGE_BATCH_PLAN_V1',batch,targets,source,maximum_source_HTTP:targets.length,existing_manual_source_daily_cap:cap,existing_provider_minute_cap:2,whole_job_background_cap:28,D1_reservation:reservation,primary_bluesky_substituted:false,score_or_format_changed:false};
if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));process.exit(0);}
for(const k of ['GITHUB_RUN_ID','GITHUB_SHA','GITHUB_TOKEN','GITHUB_REPOSITORY','REPORT2_EXPECTED_MAIN','REPORT2_EXPECTED_LEASE_OWNER','REPORT2_D1_BRIDGE_URL','REPORT2_D1_BRIDGE_TOKEN'])if(!process.env[k])throw Error(k+'_REQUIRED');
if(process.env.GITHUB_REPOSITORY!==repository)throw Error('EXACT_REPOSITORY_REQUIRED');
const api=async p=>{const r=await fetch('https://api.github.com/repos/'+repository+'/'+p,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('GITHUB_CONTROL_READ_'+r.status);return r.json();};
const main=(await api('git/ref/heads/main')).object.sha;
if(main!==process.env.REPORT2_EXPECTED_MAIN||process.env.GITHUB_SHA!==main)throw Error('MAIN_OR_EXECUTING_HEAD_MOVED');
const read=async p=>JSON.parse(Buffer.from((await api('contents/'+p+'?ref='+main)).content,'base64').toString());
const phase=await read('checkpoints/CLOUD_PHASE_STATE_20261004.json'),fence=await read('audit-fixes/source-optimization-20260930/execution-lock.json');
if(phase.lease?.owner!==process.env.REPORT2_EXPECTED_LEASE_OWNER||phase.lease.expires_ts<=Date.now()||fence.active)throw Error('OWNER_OR_FENCE_BLOCKED');
const routePath='checkpoints/N05_104_EXACT_SOURCE_ROUTES_20261010.json',routeBytes=await fs.readFile(routePath),routes=JSON.parse(routeBytes);
if(routes.rows?.length!==104)throw Error('CURRENT104_PRIMARY_IDENTITY_REQUIRED');
const identities=new Map(routes.rows.map(r=>[r.symbol,r]));
const [{collectWikimediaAttention,WIKIMEDIA_LIMITS},{exactWikimediaPageBinding},{createUnifiedHttpBudget},{consumeBlockResultContext},{consumeEvidenceV2},{auditCandidateBlocks},{buildRuntimeCanonicalBundle}]=await Promise.all([
 import('../runtime/src/wikimedia-attention-context.mjs'),import('../runtime/src/wikimedia-page-binding.mjs'),import('../runtime/src/unified-budget.mjs'),import('../runtime/src/block-result-context.mjs'),import('../runtime/src/evidence-v2.mjs'),import('../runtime/src/candidate-evidence-v2-runtime.mjs'),import('../runtime/src/canonical-runtime-adapter.mjs')
]);
for(const symbol of targets){const row=identities.get(symbol),binding=exactWikimediaPageBinding({contract:symbol+'-USDT',asset_identity:row?.identity});if(!row||row.identity_status!=='CLOSED'||!binding)throw Error('EXACT_NATIVE_PAGE_BINDING_REQUIRED:'+symbol);}
await fs.mkdir(root,{recursive:true});
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget();
const now=Date.now(),run=process.env.GITHUB_RUN_ID,id='N06_WIKIMEDIA_NATIVE10:'+run+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={...plan,schema:'N06_WIKIMEDIA_NATIVE10_ACTUAL_V1',run,head:main,lease_owner:phase.lease.owner,started_ts:now,route_file:routePath,route_sha256:digest(routeBytes),status:'NOT_ADMITTED',sourceHTTP:0,originals:[],results:[],MAIN:0,Telegram:0,new_fresh_SENT:false,N06_complete:false};
let admitted=false,lastWaitAfter=0;
try{
 out.daily_admission=guard.evaluateDailyReservationBudget({daily:await guard.loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
 if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');
 await guard.reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 const row=await db.prepare('SELECT attempts FROM report2_evidence_source_daily WHERE source=?1 AND day_utc=?2 LIMIT 1').bind(source,new Date(now).toISOString().slice(0,10)).first();
 const used=row==null?0:Number(row.attempts);if(!Number.isSafeInteger(used)||used<0)throw Error('UNKNOWN_SOURCE_COUNTER');
 const affordable=Math.max(0,Math.min(targets.length,cap-used));out.source_preflight={used,cap,affordable,selected:targets.slice(0,affordable)};
 if(affordable<Math.min(4,targets.length))throw Error('USEFUL_NATIVE_BATCH_SOURCE_HEADROOM_REQUIRED');
 for(const symbol of out.source_preflight.selected){
  if(out.sourceHTTP>0&&out.sourceHTTP%2===0&&out.sourceHTTP!==lastWaitAfter){await new Promise(r=>setTimeout(r,61000));lastWaitAfter=out.sourceHTTP;}
  if(!guard.evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:60}).allowed){out.results.push({symbol,status:'D1_HEADROOM_DENIED'});break;}
  const original=identities.get(symbol),contract=original.contract,asset_identity=original.identity,binding=exactWikimediaPageBinding({contract,asset_identity});
  const fetch_impl=async(url,options)=>{
   if(new URL(url).origin!=='https://wikimedia.org'||!url.includes('/'+encodeURIComponent(binding.article)+'/daily/'))throw Error('UNEXPECTED_SOURCE_ROUTE');
   const response=await fetch(url,options),chunks=[];let size=0;
   for await(const chunk of response.body){size+=chunk.length;if(size>100000)throw Error('SOURCE_BODY_LIMIT');chunks.push(chunk);}
   const bytes=Buffer.concat(chunks),gz=gzipSync(bytes),file=symbol+'.json.gz',receipt={symbol,url,http_status:response.status,received_ts:Date.now(),body_sha256:digest(bytes),gzip_sha256:digest(gz),bytes:bytes.length,file};
   await fs.writeFile(root+'/'+file,gz);out.originals.push(receipt);out.sourceHTTP++;
   return new Response(bytes,{status:response.status,headers:response.headers});
  };
  const result=await collectWikimediaAttention({db,fetch_impl,request_admit:x=>budget.reserve(x),contract,run_id:id,asset_identity,now:Date.now(),clock:Date.now,strict_fresh_manual:true});
  const entry={symbol,contract,page:binding.article,identity:asset_identity,identity_original_received_ts:original.identity_original_received_ts,status:result.status,network_calls:result.network_calls,summary:result.summary??null,receipt:out.originals.at(-1)?.symbol===symbol?out.originals.at(-1):null,consumer_checked:false};out.results.push(entry);
  if(result.status==='CLOSED'&&result.summary?.recent_7day_views>0&&result.evidence?.length===1){
   const decision=Date.now(),context=consumeBlockResultContext({contract,evidence:result.evidence,now:decision}),weight=consumeEvidenceV2(result.evidence,{base_interest:70,decision_ts:decision}),input={contract,run_id:id,snapshot_id:id+':'+symbol+':'+decision,observed_ts:decision};
   const before=buildRuntimeCanonicalBundle(input),after=buildRuntimeCanonicalBundle({...input,internal_market_context:{internal_only:true,evidence_v2:{evidence:result.evidence,sources:{WIKIMEDIA_ATTENTION:result}}}}),audit=auditCandidateBlocks({sources:{WIKIMEDIA_ATTENTION:result},evidence:result.evidence,decision_ts:decision});
   entry.consumer_checked=context.facts.length===1&&context.facts[0].block_id==='N06'&&weight.adjustment===0&&after.manual.ok&&after.manual.text.includes('Внимание к статье '+binding.label)&&after.block_rendered_results.used_context_block_ids.includes('N06')&&JSON.stringify(after.canonical.scores)===JSON.stringify(before.canonical.scores)&&after.canonical.state===before.canonical.state&&after.canonical.direction===before.canonical.direction&&audit.blocks.N06.checked===false&&audit.blocks.N06.missing_required.includes('BLUESKY_PUBLIC');
   entry.report_excerpt=context.facts[0]?.value??null;entry.primary_bluesky_substituted=false;entry.score_adjustment=weight.adjustment;
   const hit=await collectWikimediaAttention({db,fetch_impl,request_admit:x=>budget.reserve(x),contract,run_id:id+':CACHE',asset_identity,now:Date.now(),clock:Date.now()});entry.cache_hit_original_clocks_unchanged=hit.network_calls===0&&JSON.stringify(hit.evidence)===JSON.stringify(result.evidence);
  }
  if(['PROVIDER_RATE_LIMITED','SOURCE_ACCESS_BACKOFF'].includes(result.status))break;
 }
 out.qualified_assets=out.results.filter(r=>r.consumer_checked&&r.cache_hit_original_clocks_unchanged).map(r=>r.symbol);
 out.status=out.qualified_assets.length?'ACTUAL_NATIVE_PAGEVIEW_FACTS_RETAINED_WITH_NEUTRAL_REPORT_USE':'NO_NEW_QUALIFIED_NATIVE_PAGEVIEW_FACT';
}catch(e){out.status='BATCH_NOT_CLOSED';out.reason=String(e.message).slice(0,240);}
finally{
 out.http_budget=budget.summary();if(admitted)out.finalized_usage=await guard.finalizeRunUsage(db,{reservationId:id,sourceRunId:run,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();
 if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';
 out.completed_ts=Date.now();out.source_limits_unchanged=WIKIMEDIA_LIMITS.internal_daily_cap===cap&&WIKIMEDIA_LIMITS.internal_minute_cap===2;
 await fs.writeFile(root+'/batch-summary.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,sourceHTTP:out.sourceHTTP,qualified_assets:out.qualified_assets??[],D1:out.D1}));
}
