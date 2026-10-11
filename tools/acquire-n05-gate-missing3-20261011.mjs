import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import * as guard from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {collectGateFlow} from '../current-generation/files/src/gate-flow-collector.mjs';

const repo='kovalev23091987-jpg/my-report-2-cloud-runner',symbols=['CT','RLC','EUL'];
const reservation={rows_read:16000,rows_written:500},root='audit-output/n05-gate-missing3',sha=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const plan={schema:'N05_GATE_MISSING3_PLAN_V1',symbols,approved_assets:104,source:'N05_OFFICIAL_FLOW:GATE',source_cap:16,asset_reference_source:'GATE_ASSET_REFERENCE',asset_reference_cap:8,provider_rolling_minute_cap:4,maximum_source_HTTP:13,maximum_asset_reference_HTTP:1,background_HTTP_cap:28,D1_reservation:reservation,caps_changed:false};
if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));process.exit(0);}
for(const k of ['GITHUB_RUN_ID','GITHUB_SHA','GITHUB_TOKEN','REPORT2_D1_BRIDGE_URL','REPORT2_D1_BRIDGE_TOKEN','REPORT2_EXPECTED_MAIN','REPORT2_EXPECTED_LEASE_OWNER'])if(!process.env[k])throw Error(k+'_REQUIRED');
if(process.env.GITHUB_REPOSITORY!==repo)throw Error('EXACT_REPOSITORY_REQUIRED');
const api=async path=>{const r=await fetch('https://api.github.com/repos/'+repo+'/'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('GITHUB_CONTROL_READ_'+r.status);return r.json();};
const main=(await api('git/ref/heads/main')).object.sha;if(main!==process.env.REPORT2_EXPECTED_MAIN)throw Error('MAIN_MOVED');
const read=async path=>JSON.parse(Buffer.from((await api('contents/'+path+'?ref='+main)).content,'base64').toString());
const phase=await read('checkpoints/CLOUD_PHASE_STATE_20261004.json'),fence=await read('audit-fixes/source-optimization-20260930/execution-lock.json'),routes=await read('checkpoints/N05_104_EXACT_SOURCE_ROUTES_20261010.json');
if(phase.lease?.owner!==process.env.REPORT2_EXPECTED_LEASE_OWNER||phase.lease.expires_ts<=Date.now()||fence.active||routes.rows?.length!==104)throw Error('OWNER_FENCE_OR_UNIVERSE_BLOCKED');
const identities=new Map(routes.rows.map(r=>[r.symbol,r]));for(const symbol of symbols){const r=identities.get(symbol);if(!r||r.prior_individual_full_window||r.identity_status!=='CLOSED'||!r.identity?.contract_or_mint)throw Error('EXACT_MISSING_TOKEN_IDENTITY_REQUIRED:'+symbol);}
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget(),now=Date.now(),run=process.env.GITHUB_RUN_ID,id='N05_GATE_MISSING3:'+run+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={...plan,schema:'N05_GATE_MISSING3_ACTUAL_V1',run,head:process.env.GITHUB_SHA,main,lease_owner:phase.lease.owner,started_ts:now,status:'NOT_ADMITTED',sourceHTTP:0,originals:[],results:[],MAIN:0,Telegram:0,score:0,new_fresh_SENT:false,project_complete:false};
await fs.mkdir(root,{recursive:true});let admitted=false,rawSeq=0;
async function providerSpace(){for(let n=0;n<8;n++){const ts=Date.now(),row=await db.prepare('SELECT COALESCE(SUM(units),0) AS units FROM report2_provider_minute_ledger_v1 WHERE provider=?1 AND created_ts>?2 AND created_ts<=?3').bind('GATE',ts-60000,ts).first(),used=Number(row?.units??0);if(!Number.isSafeInteger(used)||used<0)throw Error('UNKNOWN_PROVIDER_MINUTE_COUNTER');if(used===0)return;await sleep(10000);}throw Error('GATE_ROLLING_MINUTE_HEADROOM_REQUIRED');}
try{
 out.daily_admission=guard.evaluateDailyReservationBudget({daily:await guard.loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');
 await guard.reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 const roleUsed=async source=>{const row=await db.prepare('SELECT attempts FROM report2_evidence_source_daily WHERE source=?1 AND day_utc=?2 LIMIT 1').bind(source,new Date(Date.now()).toISOString().slice(0,10)).first(),n=row==null?0:Number(row.attempts);if(!Number.isSafeInteger(n)||n<0)throw Error('UNKNOWN_SOURCE_COUNTER');return n;};
 const used=await roleUsed('N05_OFFICIAL_FLOW:GATE'),assetUsed=await roleUsed('GATE_ASSET_REFERENCE');out.source_preflight={Gate_used:used,Gate_required:13,Gate_cap:16,Gate_asset_reference_used:assetUsed,Gate_asset_reference_required:1,Gate_asset_reference_cap:8,allowed:16-used>=13&&8-assetUsed>=1};
 if(!out.source_preflight.allowed)throw Error('ENTIRE_USEFUL_BATCH_SOURCE_HEADROOM_REQUIRED');
 for(const symbol of symbols){
  await providerSpace();const r=identities.get(symbol),captured=[];
  const fetch_impl=async(url,options)=>{const response=await fetch(url,options),body=Buffer.from(await response.clone().arrayBuffer()),z=gzipSync(body),file=String(++rawSeq).padStart(2,'0')+'-'+symbol+'.json.gz';await fs.writeFile(root+'/'+file,z);captured.push({url,http_status:response.status,received_ts:Date.now(),body_sha256:sha(body),gzip_sha256:sha(z),bytes:body.length,file});out.sourceHTTP++;return response;};
  const result=await collectGateFlow({db,contract:r.contract,asset_identity:r.identity,identity_method:'HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS',run_id:id+':'+symbol,now:Date.now(),clock:Date.now,request_admit:request=>budget.reserve(request),source_health_admit:extra=>guard.evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:extra.rows_read,extraRowsWritten:extra.rows_written}),fetch_impl});
  const component=result.components?.[0];out.originals.push(...captured);out.results.push({symbol,contract:r.contract,identity:r.identity,status:result.status,reason:result.reason??component?.reason??null,check_completed:component?.check_completed===true,component:component??null,network_calls:result.network_calls,receipts:result.receipts,raw_files:captured.map(x=>x.file)});
 }
 out.status='GATE_NATIVE_BATCH_RETAINED_WITH_PER_COIN_QUALIFICATION';
}catch(e){out.status='BATCH_NOT_CLOSED';out.reason=e.message;}
finally{
 out.http_budget=budget.summary();if(admitted)out.finalized_usage=await guard.finalizeRunUsage(db,{reservationId:id,sourceRunId:run,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();
 if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';
 out.completed_ts=Date.now();out.individual_full_windows=out.results.filter(r=>r.check_completed).length;out.simultaneous_continuous_coverage=false;
 await fs.writeFile(root+'/batch-summary.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,sourceHTTP:out.sourceHTTP,individual_full_windows:out.individual_full_windows,D1:out.D1}));
}
