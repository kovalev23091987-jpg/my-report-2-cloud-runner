import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import * as guard from '../runner/d1-preaction-budget-guard.mjs';

const repository='kovalev23091987-jpg/my-report-2-cloud-runner';
const root='audit-output/n06-coingecko-trending-pengu';
const source='COINGECKO_ATTENTION_PILOT',dailyCap=2,minuteCap=9;
const mint='2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv';
const coinId='pudgy-penguins',contract='PENGU-USDT';
const reservation={rows_read:10000,rows_written:1000};
const sha256=value=>createHash('sha256').update(value).digest('hex');
const plan={schema:'N06_COINGECKO_PENGU_ATTENTION_PILOT_V1',target:contract,max_source_http:2,
 daily_source_pilot_cap:dailyCap,shared_coingecko_minute_cap:minuteCap,whole_job_background_cap:28,
 D1_reservation:reservation,score_or_format_changed:false,new_fresh_SENT:false};
if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));process.exit(0);}
for(const key of ['GITHUB_RUN_ID','GITHUB_SHA','GITHUB_TOKEN','GITHUB_REPOSITORY','REPORT2_EXPECTED_MAIN',
 'REPORT2_EXPECTED_LEASE_OWNER','REPORT2_D1_BRIDGE_URL','REPORT2_D1_BRIDGE_TOKEN'])if(!process.env[key])throw Error(key+'_REQUIRED');
if(process.env.GITHUB_REPOSITORY!==repository)throw Error('EXACT_REPOSITORY_REQUIRED');
const github=async path=>{const response=await fetch('https://api.github.com/repos/'+repository+'/'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('GITHUB_CONTROL_READ_'+response.status);return response.json();};
const main=(await github('git/ref/heads/main')).object.sha;
if(main!==process.env.REPORT2_EXPECTED_MAIN||process.env.GITHUB_SHA!==main)throw Error('MAIN_OR_EXECUTING_HEAD_MOVED');
const read=async path=>JSON.parse(Buffer.from((await github('contents/'+path+'?ref='+main)).content,'base64').toString());
const phase=await read('checkpoints/CLOUD_PHASE_STATE_20261004.json'),fence=await read('audit-fixes/source-optimization-20260930/execution-lock.json');
if(phase.lease?.owner!==process.env.REPORT2_EXPECTED_LEASE_OWNER||phase.lease.expires_ts<=Date.now()||fence.active)throw Error('OWNER_OR_FENCE_BLOCKED');
const routeBytes=await fs.readFile('checkpoints/N05_104_EXACT_SOURCE_ROUTES_20261010.json');
const routes=JSON.parse(routeBytes);if(routes.rows?.length!==104)throw Error('CURRENT104_ROUTE_MANIFEST_REQUIRED');
const row=routes.rows.find(r=>r.contract===contract);
if(row?.identity_status!=='CLOSED'||row.identity?.chain!=='solana'||row.identity?.contract_or_mint!==mint)throw Error('PENGU_EXACT_HTX_IDENTITY_REQUIRED');
await fs.mkdir(root,{recursive:true});
const [{createUnifiedHttpBudget},{installEvidenceSourceStore,reserveEvidenceSourceAttempts},{installProviderMinuteLedger,reserveProviderMinuteUnits},
 {buildEvidenceV2},{consumeBlockResultContext},{consumeEvidenceV2},{buildRuntimeCanonicalBundle}]=await Promise.all([
 import('../runtime/src/unified-budget.mjs'),import('../runtime/src/evidence-source-store.mjs'),import('../runtime/src/provider-minute-ledger.mjs'),
 import('../runtime/src/evidence-source-adapters.mjs'),import('../runtime/src/block-result-context.mjs'),import('../runtime/src/evidence-v2.mjs'),import('../runtime/src/canonical-runtime-adapter.mjs')]);
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget();
const now=Date.now(),id='N06_COINGECKO_PENGU:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={...plan,run:process.env.GITHUB_RUN_ID,head:main,lease_owner:phase.lease.owner,
 route_sha256:sha256(routeBytes),started_ts:now,status:'NOT_ADMITTED',sourceHTTP:0,originals:[],MAIN:0,Telegram:0,N06_complete:false};
let admitted=false;
try{
 out.daily_admission=guard.evaluateDailyReservationBudget({daily:await guard.loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
 if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');
 await guard.reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 await installEvidenceSourceStore(db);
 const a=await reserveEvidenceSourceAttempts(db,{source,reservation_id:id,attempts:2,daily_cap:dailyCap,now});
 if(!a.allowed){out.status=a.status;throw Error('SOURCE_DAILY_ADMISSION_DENIED');}
 await installProviderMinuteLedger(db);
 const m=await reserveProviderMinuteUnits(db,{provider:'COINGECKO',reservation_id:id,units:2,cap:minuteCap,now});
 if(!m.allowed){out.status=m.status;throw Error('COINGECKO_SHARED_MINUTE_DENIED');}
 if(!guard.evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:60}).allowed)throw Error('D1_HEADROOM_DENIED');
 const metadataUrl='https://api.coingecko.com/api/v3/coins/solana/contract/'+mint+'?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false';
 const trendingUrl='https://api.coingecko.com/api/v3/search/trending';
 const get=async(label,url)=>{const admission=budget.reserve({logical_request_id:id+':'+label,lane:'background',attempts:1});
  if(!admission.allowed||admission.duplicate)throw Error('WHOLE_JOB_HTTP_ADMISSION_DENIED');
  const response=await fetch(url,{headers:{accept:'application/json','user-agent':'My-Report-2/1.0 (https://github.com/kovalev23091987-jpg/my-report-2-cloud-runner)'},redirect:'error',signal:AbortSignal.timeout(10000)});
  const body=Buffer.from(await response.arrayBuffer());if(body.length>250000)throw Error('SOURCE_BODY_LIMIT');
  const compressed=gzipSync(body),file=label+'.json.gz',receipt={label,url,http_status:response.status,received_ts:Date.now(),body_sha256:sha256(body),gzip_sha256:sha256(compressed),bytes:body.length,file};
  await fs.writeFile(root+'/'+file,compressed);out.originals.push(receipt);out.sourceHTTP++;
  if(!response.ok)throw Error('SOURCE_HTTP_'+response.status);
  try{return JSON.parse(body.toString());}catch{throw Error('SOURCE_JSON_INVALID');}};
 const metadata=await get('exact-token-metadata',metadataUrl);
 if(metadata?.id!==coinId||String(metadata.symbol).toLowerCase()!=='pengu'||metadata.platforms?.solana!==mint)throw Error('COINGECKO_EXACT_MINT_BINDING_FAILED');
 const trending=await get('trending-search-list',trendingUrl),items=trending?.coins;
 if(!Array.isArray(items)||items.length<1||items.length>30)throw Error('TRENDING_LIST_SCHEMA_INVALID');
 const matches=items.map((r,i)=>({item:r?.item,rank:i+1})).filter(r=>r.item?.id===coinId&&String(r.item?.symbol).toUpperCase()==='PENGU');
 if(matches.length!==1){out.status='PENGU_NOT_IN_RETURNED_TRENDING_LIST';out.returned_list_length=items.length;throw Error('NO_POSITIVE_PENGU_TRENDING_FACT');}
 const rank=matches[0].rank,observed=out.originals.at(-1).received_ts;
 const evidence=buildEvidenceV2({provider_id:'COINGECKO_ATTENTION',upstream_id:'COINGECKO_SITE_SEARCH',asset_id:'solana:'+mint,htx_contract:contract,block_id:'N06',metric_family:'COINGECKO_TRENDING_SEARCH_CONTEXT',origin_event_id:coinId+':'+observed,dependency_group:'COINGECKO_SITE_SEARCH:'+coinId+':'+observed,source_ts:observed,observed_ts:observed,expires_at:observed+3600000,coverage_status:'TOP_LIST_PRESENCE_ONLY',coverage_fraction:0,directional_strength:null,risk_strength:null,unit:'list_rank',value:rank,extra:{coin_id:coinId,rank,source_clock_policy:'OBSERVATION_TIME_NO_PROVIDER_EVENT_CLOCK',provider_role:'ADDITIONAL_ATTENTION_CONTEXT',directional_vote:false,unique_traders_claim:false,score_contribution:0,entry_authorized:false,trending_body_sha256:out.originals.at(-1).body_sha256,identity_body_sha256:out.originals[0].body_sha256}});
 const decision=Date.now(),context=consumeBlockResultContext({contract,evidence:[evidence],now:decision});
 const weight=consumeEvidenceV2([evidence],{base_interest:70,decision_ts:decision});
 const input={contract,run_id:id,snapshot_id:id+':'+decision,observed_ts:decision};
 const before=buildRuntimeCanonicalBundle(input),after=buildRuntimeCanonicalBundle({...input,internal_market_context:{internal_only:true,evidence_v2:{evidence:[evidence],sources:{COINGECKO_ATTENTION:{status:'CLOSED',evidence:[evidence]}}}}});
 out.consumer_checked=context.facts.some(f=>f.block_id==='N06')&&after.manual.ok&&after.manual.text.includes('Интерес к поиску PENGU')&&after.block_rendered_results.used_context_block_ids.includes('N06')&&JSON.stringify(after.canonical.scores)===JSON.stringify(before.canonical.scores)&&after.canonical.state===before.canonical.state&&after.canonical.direction===before.canonical.direction&&weight.adjustment===0;
 out.report_excerpt=context.facts.find(f=>f.block_id==='N06')?.value??null;out.rank=rank;out.returned_list_length=items.length;out.score_adjustment=weight.adjustment;
 out.status=out.consumer_checked?'ACTUAL_EXACT_ATTENTION_FACT_IN_CONTROLLED_REPORT':'FACT_NOT_IN_CONTROLLED_REPORT';
}catch(error){if(out.status==='NOT_ADMITTED')out.status='PILOT_NOT_CLOSED';out.reason=String(error?.message||error).slice(0,200);}
finally{out.http_budget=budget.summary();if(admitted)out.finalized_usage=await guard.finalizeRunUsage(db,{reservationId:id,sourceRunId:out.run,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();
 if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';
 out.completed_ts=Date.now();await fs.writeFile(root+'/batch-summary.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,sourceHTTP:out.sourceHTTP,rank:out.rank??null,consumer_checked:out.consumer_checked??false,D1:out.D1}));}
