import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import * as guard from '../runner/d1-preaction-budget-guard.mjs';

const repository='kovalev23091987-jpg/my-report-2-cloud-runner';
const targets=['PEPE','PENGU','TRUMP','WIF','BONK','SHIB','PUMP','FARTCOIN','LINK','UNI','AAVE','FLOKI'];
const source='BLUESKY_PUBLIC',cap=240,reservation={rows_read:10000,rows_written:1000};
const root='audit-output/n06-bluesky-exact12',sha256=b=>createHash('sha256').update(b).digest('hex');
const plan={schema:'N06_BLUESKY_EXACT_TOKEN_PILOT_PLAN_V1',targets,max_source_http:targets.length,
 existing_source_daily_cap:cap,whole_job_background_cap:28,D1_reservation:reservation,
 score_or_format_changed:false,source_identity:'EXACT_CONTRACT_OR_MINT'};
if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));process.exit(0);}
for(const key of ['GITHUB_RUN_ID','GITHUB_SHA','GITHUB_TOKEN','GITHUB_REPOSITORY','REPORT2_EXPECTED_MAIN',
 'REPORT2_EXPECTED_LEASE_OWNER','REPORT2_D1_BRIDGE_URL','REPORT2_D1_BRIDGE_TOKEN'])if(!process.env[key])throw Error(key+'_REQUIRED');
if(process.env.GITHUB_REPOSITORY!==repository)throw Error('EXACT_REPOSITORY_REQUIRED');
const api=async path=>{const response=await fetch('https://api.github.com/repos/'+repository+'/'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('GITHUB_CONTROL_READ_'+response.status);return response.json();};
const main=(await api('git/ref/heads/main')).object.sha;
if(main!==process.env.REPORT2_EXPECTED_MAIN||process.env.GITHUB_SHA!==main)throw Error('MAIN_OR_EXECUTING_HEAD_MOVED');
const read=async path=>JSON.parse(Buffer.from((await api('contents/'+path+'?ref='+main)).content,'base64').toString());
const phase=await read('checkpoints/CLOUD_PHASE_STATE_20261004.json'),fence=await read('audit-fixes/source-optimization-20260930/execution-lock.json');
if(phase.lease?.owner!==process.env.REPORT2_EXPECTED_LEASE_OWNER||phase.lease.expires_ts<=Date.now()||fence.active)throw Error('OWNER_OR_FENCE_BLOCKED');
const routePath='checkpoints/N05_104_EXACT_SOURCE_ROUTES_20261010.json',routeBytes=await fs.readFile(routePath),routes=JSON.parse(routeBytes);
if(routes.rows?.length!==104)throw Error('CURRENT104_EXACT_ROUTE_MANIFEST_REQUIRED');
const identities=new Map(routes.rows.map(r=>[r.symbol,r]));
for(const symbol of targets){const row=identities.get(symbol),address=row?.identity?.contract_or_mint;
 if(row?.identity_status!=='CLOSED'||row.contract!==symbol+'-USDT'||!(row.identity?.chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address):/^0x[0-9a-f]{40}$/i.test(address)))throw Error('EXACT_TOKEN_BINDING_REQUIRED:'+symbol);}
await fs.mkdir(root,{recursive:true});
const [{collectBlueskyAttentionEvidence},{createUnifiedHttpBudget},{consumeBlockResultContext},{consumeEvidenceV2},{buildRuntimeCanonicalBundle}]=await Promise.all([
 import('../runtime/src/bluesky-attention-evidence.mjs'),import('../runtime/src/unified-budget.mjs'),import('../runtime/src/block-result-context.mjs'),import('../runtime/src/evidence-v2.mjs'),import('../runtime/src/canonical-runtime-adapter.mjs')]);
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget();
const now=Date.now(),id='N06_BLUESKY_EXACT12:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={...plan,schema:'N06_BLUESKY_EXACT_TOKEN_PILOT_RESULT_V1',run:process.env.GITHUB_RUN_ID,
 head:main,lease_owner:phase.lease.owner,started_ts:now,route_sha256:sha256(routeBytes),status:'NOT_ADMITTED',
 sourceHTTP:0,originals:[],results:[],MAIN:0,Telegram:0,new_fresh_SENT:false,N06_complete:false};
let admitted=false;
try{
 out.daily_admission=guard.evaluateDailyReservationBudget({daily:await guard.loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
 if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');
 await guard.reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 const daily=await db.prepare('SELECT attempts FROM report2_evidence_source_daily WHERE source=?1 AND day_utc=?2 LIMIT 1').bind(source,new Date(now).toISOString().slice(0,10)).first();
 const used=daily==null?0:Number(daily.attempts);if(!Number.isSafeInteger(used)||used<0)throw Error('UNKNOWN_SOURCE_COUNTER');
 const affordable=Math.max(0,Math.min(targets.length,cap-used));out.source_preflight={used,cap,affordable,selected:targets.slice(0,affordable)};
 if(affordable<4)throw Error('BLUESKY_SOURCE_HEADROOM_REQUIRED');
 for(const symbol of out.source_preflight.selected){
  if(!guard.evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:60}).allowed){out.results.push({symbol,status:'D1_HEADROOM_DENIED'});break;}
  const row=identities.get(symbol),contract=row.contract,asset_identity=row.identity;
  const fetch_impl=async(url,options)=>{const u=new URL(url);if(u.origin!=='https://api.bsky.app'||u.pathname!=='/xrpc/app.bsky.feed.searchPosts'||!u.searchParams.get('q')?.includes(asset_identity.contract_or_mint))throw Error('UNEXPECTED_SOURCE_ROUTE');
   const response=await fetch(url,options),body=Buffer.from(await response.arrayBuffer());if(body.length>500000)throw Error('SOURCE_BODY_LIMIT');
   const gz=gzipSync(body),file=symbol+'.json.gz',receipt={symbol,url,http_status:response.status,received_ts:Date.now(),body_sha256:sha256(body),gzip_sha256:sha256(gz),bytes:body.length,file};
   await fs.writeFile(root+'/'+file,gz);out.originals.push(receipt);out.sourceHTTP++;return new Response(body,{status:response.status,headers:response.headers});};
  const result=await collectBlueskyAttentionEvidence({db,fetch_impl,request_admit:x=>budget.reserve(x),contract,run_id:id,asset_identity,now:Date.now(),strict_fresh_manual:true});
  const entry={symbol,contract,status:result.status,network_calls:result.network_calls,summary:result.summary??null,receipt:out.originals.at(-1)?.symbol===symbol?out.originals.at(-1):null,consumer_checked:false};out.results.push(entry);
  if(result.status==='CLOSED'&&result.summary?.original_posts>0&&result.summary?.unique_authors>0&&result.evidence?.length===1){
   const decision=Date.now(),context=consumeBlockResultContext({contract,evidence:result.evidence,now:decision}),weight=consumeEvidenceV2(result.evidence,{base_interest:70,decision_ts:decision}),input={contract,run_id:id,snapshot_id:id+':'+symbol+':'+decision,observed_ts:decision};
   const before=buildRuntimeCanonicalBundle(input),after=buildRuntimeCanonicalBundle({...input,internal_market_context:{internal_only:true,evidence_v2:{evidence:result.evidence,sources:{BLUESKY_PUBLIC:result}}}});
   entry.consumer_checked=context.facts.some(f=>f.block_id==='N06')&&after.manual.ok&&after.manual.text.includes('Публичные сообщения с точным адресом токена')&&after.block_rendered_results.used_context_block_ids.includes('N06')&&JSON.stringify(after.canonical.scores)===JSON.stringify(before.canonical.scores)&&after.canonical.state===before.canonical.state&&after.canonical.direction===before.canonical.direction&&weight.adjustment===0;
   entry.report_excerpt=context.facts.find(f=>f.block_id==='N06')?.value??null;entry.score_adjustment=weight.adjustment;
  }
  if([401,403,429].includes(entry.receipt?.http_status))break;
 }
 out.qualified_assets=out.results.filter(r=>r.consumer_checked).map(r=>r.symbol);
 out.status=out.qualified_assets.length?'ACTUAL_EXACT_SOCIAL_POST_FACTS_WITH_CONTROLLED_REPORT_USE':'NO_POSITIVE_EXACT_SOCIAL_POST_FACT';
}catch(error){out.status='BATCH_NOT_CLOSED';out.reason=String(error?.message||error).slice(0,200);}
finally{out.http_budget=budget.summary();if(admitted)out.finalized_usage=await guard.finalizeRunUsage(db,{reservationId:id,sourceRunId:out.run,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();
 if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';
 out.completed_ts=Date.now();await fs.writeFile(root+'/batch-summary.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,sourceHTTP:out.sourceHTTP,qualified_assets:out.qualified_assets??[],D1:out.D1}));}
