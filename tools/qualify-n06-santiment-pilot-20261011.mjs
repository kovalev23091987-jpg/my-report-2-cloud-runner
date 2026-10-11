import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import * as guard from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';

const repository='kovalev23091987-jpg/my-report-2-cloud-runner';
const targets=[{symbol:'BTC',slug:'bitcoin',chain:'bitcoin'},{symbol:'HBAR',slug:'hedera-hashgraph',chain:'hedera'}];
const root='audit-output/n06-santiment-pilot',reservation={rows_read:1000,rows_written:100};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const plan={schema:'N06_SANTIMENT_SANAPI_BOUNDED_PILOT_PLAN_V1',targets,max_source_http:2,
  metric:'social_volume_total',source:'SANTIMENT_SOCIAL_CORPUS',D1_reservation:reservation,
  existing_shared_http_budget:true,score_or_format_changed:false,primary_bluesky_substituted:false};
if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));process.exit(0);}
for(const key of ['GITHUB_RUN_ID','GITHUB_SHA','GITHUB_TOKEN','GITHUB_REPOSITORY','REPORT2_EXPECTED_MAIN',
 'REPORT2_EXPECTED_LEASE_OWNER','REPORT2_D1_BRIDGE_URL','REPORT2_D1_BRIDGE_TOKEN'])if(!process.env[key])throw Error(key+'_REQUIRED');
if(process.env.GITHUB_REPOSITORY!==repository)throw Error('EXACT_REPOSITORY_REQUIRED');
await fs.mkdir(root,{recursive:true});
const out={...plan,schema:'N06_SANTIMENT_SANAPI_BOUNDED_PILOT_RESULT_V1',run:process.env.GITHUB_RUN_ID,
 head:process.env.GITHUB_SHA,started_ts:Date.now(),status:'NOT_ADMITTED',sourceHTTP:0,originals:[],results:[],
 MAIN:0,Telegram:0,new_fresh_SENT:false,N06_complete:false};
const write=async()=>fs.writeFile(root+'/pilot-summary.json',JSON.stringify(out,null,2)+'\n');
if(!process.env.REPORT2_SANTIMENT_API_KEY){out.status='GITHUB_SECRET_ABSENT';await write();process.exit(0);}
const api=async path=>{const response=await fetch('https://api.github.com/repos/'+repository+'/'+path,
 {headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('GITHUB_CONTROL_READ_'+response.status);return response.json();};
const main=(await api('git/ref/heads/main')).object.sha;
if(main!==process.env.REPORT2_EXPECTED_MAIN||process.env.GITHUB_SHA!==main)throw Error('MAIN_OR_EXECUTING_HEAD_MOVED');
const read=async path=>JSON.parse(Buffer.from((await api('contents/'+path+'?ref='+main)).content,'base64').toString());
const phase=await read('checkpoints/CLOUD_PHASE_STATE_20261004.json'),fence=await read('audit-fixes/source-optimization-20260930/execution-lock.json');
if(phase.lease?.owner!==process.env.REPORT2_EXPECTED_LEASE_OWNER||phase.lease.expires_ts<=Date.now()||fence.active)throw Error('OWNER_OR_FENCE_BLOCKED');
const routePath='checkpoints/N05_104_EXACT_SOURCE_ROUTES_20261010.json',routeBytes=await fs.readFile(routePath),routes=JSON.parse(routeBytes);
if(routes.rows?.length!==104)throw Error('CURRENT104_EXACT_ROUTE_MANIFEST_REQUIRED');
for(const target of targets){const row=routes.rows.find(r=>r.symbol===target.symbol);
 if(row?.identity_status!=='CLOSED'||row.contract!==target.symbol+'-USDT'||row.identity?.asset_kind!=='NATIVE'||
 row.identity?.chain!==target.chain||row.identity?.native_asset_id!==target.chain+':mainnet'||row.identity?.contract_or_mint!=null)
 throw Error('EXACT_NATIVE_HTX_BINDING_REQUIRED:'+target.symbol);}
out.lease_owner=phase.lease.owner;out.route_sha256=sha256(routeBytes);
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget();
const now=Date.now(),id='N06_SANTIMENT_PILOT:'+out.run+':'+process.env.GITHUB_RUN_ATTEMPT;
let admitted=false;
try{
 out.daily_admission=guard.evaluateDailyReservationBudget({daily:await guard.loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});
 if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');
 await guard.reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 const day=86400000,end=Math.floor(now/day)*day,start=end-7*day;
 out.window={from:new Date(start).toISOString(),to:new Date(end).toISOString(),completed_UTC_days:7};
 for(const target of targets){
  if(!guard.evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:200,extraRowsWritten:20}).allowed){out.results.push({symbol:target.symbol,status:'D1_HEADROOM_DENIED'});break;}
  const admission=budget.reserve({logical_request_id:id+':'+target.symbol,lane:'background',attempts:1});
  if(!admission.allowed){out.results.push({symbol:target.symbol,status:admission.status});break;}
  const query=`{ getMetric(metric: "social_volume_total") { timeseriesDataJson(selector: {slug: "${target.slug}"}, from: "${new Date(start).toISOString()}", to: "${new Date(end).toISOString()}", interval: "1d") } }`;
  const response=await fetch('https://api.santiment.net/graphql',{method:'POST',headers:{'content-type':'application/json',accept:'application/json',authorization:'Apikey '+process.env.REPORT2_SANTIMENT_API_KEY},body:JSON.stringify({query}),signal:AbortSignal.timeout(15000)});
  const body=Buffer.from(await response.arrayBuffer());if(body.length>100000)throw Error('SANAPI_SOURCE_BODY_LIMIT');
  const file=target.symbol+'.json.gz',gz=gzipSync(body),received_ts=Date.now();await fs.writeFile(root+'/'+file,gz);out.sourceHTTP++;
  const receipt={symbol:target.symbol,slug:target.slug,file,http_status:response.status,received_ts,
   body_sha256:sha256(body),gzip_sha256:sha256(gz),bytes:body.length,
   rate_limit_remaining:response.headers.get('x-ratelimit-remaining')};out.originals.push(receipt);
  let payload=null;try{payload=JSON.parse(body.toString());}catch{}
  const errors=Array.isArray(payload?.errors)?payload.errors.map(e=>String(e?.message||'GRAPHQL_ERROR').slice(0,160)):[];
  let rows=payload?.data?.getMetric?.timeseriesDataJson;if(typeof rows==='string'){try{rows=JSON.parse(rows);}catch{rows=null;}}
  const days=new Map();if(Array.isArray(rows))for(const row of rows){const ts=Date.parse(row?.datetime||row?.timestamp||row?.time||'');const value=row?.value;
   if(Number.isSafeInteger(ts)&&ts>=start&&ts<end&&ts%day===0&&Number.isSafeInteger(value)&&value>=0)days.set(ts,value);}
  const complete=Array.from({length:7},(_,i)=>start+i*day).every(ts=>days.has(ts));
  const result={symbol:target.symbol,slug:target.slug,status:!response.ok?'HTTP_'+response.status:errors.length?'GRAPHQL_ERROR':complete?'EXACT_COMPLETE_DAILY_FACT':'INCOMPLETE_OR_INVALID_DAILY_SERIES',
   errors,complete_days:days.size,series:complete?Array.from({length:7},(_,i)=>({day_utc:new Date(start+i*day).toISOString().slice(0,10),value:days.get(start+i*day)})):null,
   receipt,exact_htx_native_identity:true,report_use_verified:false,score_adjustment:0};out.results.push(result);
  if(!response.ok||errors.length)break;
 }
 out.status=out.results.every(r=>r.status==='EXACT_COMPLETE_DAILY_FACT')?'TWO_COMPLETE_EXACT_NATIVE_SOCIAL_FACTS_NOT_YET_REPORT_CONNECTED':'PILOT_PARTIAL_OR_ACCESS_LIMITED';
}catch(error){out.status='PILOT_NOT_CLOSED';out.reason=String(error?.message||error).slice(0,200);}
finally{out.http_budget=budget.summary();if(admitted)out.finalized_usage=await guard.finalizeRunUsage(db,{reservationId:id,sourceRunId:out.run,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();
 if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';
 out.completed_ts=Date.now();await write();console.log(JSON.stringify({status:out.status,sourceHTTP:out.sourceHTTP,results:out.results.map(r=>({symbol:r.symbol,status:r.status,complete_days:r.complete_days})),D1:out.D1}));}
