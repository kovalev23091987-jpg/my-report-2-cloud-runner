import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {evaluateWithinRunReservation,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {active105OfflineReviewOwner} from '../runner/offline-review-authority.mjs';
import {NEW_LIQ_SOURCE_RESEARCH as policy,reserveNewLiquidationSourceResearch} from './liquidation-new-source-admission-20261015.mjs';
const repo='kovalev23091987-jpg/my-report-2-cloud-runner',folder='audit-output/new-liquidation-source';
if(process.argv.includes('--plan')){console.log(JSON.stringify({...policy,status:'AUTOMATION_PERMISSION_REQUIRED',permission_source:'https://pumpglass.com/terms',purpose:'The completed one-off investigation is retained as evidence. PumpGlass terms prohibit automated collection; no further probe or production enablement is admitted.'}));process.exit(0);}
// Read after the first qualification: current publisher terms prohibit
// automated collection and redistribution. Stop before authority, D1 or HTTP;
// a user's project permission does not supply the publisher's data permission.
console.log(JSON.stringify({status:'AUTOMATION_PERMISSION_REQUIRED',source:'PumpGlass',permission_source:'https://pumpglass.com/terms',provider_HTTP:0,D1:0,MAIN:0,Telegram:0,production_enabled:false}));
process.exit(0);
for(const k of ['GITHUB_TOKEN','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_SHA','REPORT2_EXPECTED_MAIN','REPORT2_EXPECTED_LEASE_OWNER','REPORT2_D1_BRIDGE_URL','REPORT2_D1_BRIDGE_TOKEN'])if(!process.env[k])throw Error(k+'_REQUIRED');
if(process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF!=='refs/heads/main')throw Error('EXACT_MAIN_REPOSITORY_REQUIRED');
const api=async path=>{const r=await fetch('https://api.github.com/repos/'+repo+'/'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('GITHUB_CONTROL_NOT_CLOSED');return r.json();};
const guard=async()=>{
 const main=(await api('git/ref/heads/main')).object.sha;if(main!==process.env.GITHUB_SHA||main!==process.env.REPORT2_EXPECTED_MAIN)throw Error('MAIN_MOVED');
 const read=async path=>JSON.parse(Buffer.from((await api('contents/'+path+'?ref='+main)).content,'base64').toString());
 const [phase,fence]=await Promise.all([read('checkpoints/CLOUD_PHASE_STATE_20261004.json'),read('audit-fixes/source-optimization-20260930/execution-lock.json')]);
 if(!active105OfflineReviewOwner(phase)||phase.lease.owner!==process.env.REPORT2_EXPECTED_LEASE_OWNER||fence.active)throw Error('OWNER_OR_FENCE_BLOCKED');
};
await guard();
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),id='LIQ_NEW_SOURCE_VALIDATE:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={schema:'NEW_PUBLIC_LIQ_SOURCE_QUALIFICATION_V1',head:process.env.GITHUB_SHA,cloud_run:Number(process.env.GITHUB_RUN_ID),run_id:id,status:'NOT_ADMITTED',plan:policy,source:'PumpGlass',source_origin:'BINANCE_USDT_M_PROVIDER_MODEL',actual_provider_HTTP:0,responses:[],MAIN:0,Telegram:0,production_enabled:false,useful_coverage_claimed:false,source_clocks_refreshed:false};
let admitted=false;
try{
 const grant=await reserveNewLiquidationSourceResearch(db,{id,now});if(!grant.allowed)throw Error('SHARED_NATIVE_DAY_NOT_ADMITTED');admitted=true;
 const targets=[['symbols','https://pumpglass.com/smart-money/api/symbols'],['龙虾USDT','https://pumpglass.com/smart-money/api/heatmap?symbol='+encodeURIComponent('龙虾USDT')+'&range=12h'],['BANKUSDT','https://pumpglass.com/smart-money/api/heatmap?symbol=BANKUSDT&range=12h']];
 for(const [symbol,url] of targets){
  if(out.actual_provider_HTTP>=policy.maximum_provider_HTTP||!evaluateWithinRunReservation({reservation:policy.reservation,currentUsage:db.usageSnapshot(),extraRowsRead:10,extraRowsWritten:3}).allowed)break;
  await guard();out.actual_provider_HTTP++;
  const r=await fetch(url,{headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});
  const reader=r.body.getReader(),parts=[];let bytes=0;
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2000000){await reader.cancel();throw Error('PUBLIC_RESEARCH_RESPONSE_BOUND');}parts.push(Buffer.from(value));}
  const body=Buffer.concat(parts).toString('utf8');if([process.env.REPORT2_D1_BRIDGE_TOKEN,process.env.GITHUB_TOKEN].some(s=>s.length>12&&body.includes(s)))throw Error('SECRET_EXPORT_DENIED');
  out.responses.push({requested:symbol,url,received_ts:Date.now(),http_status:r.status,body_sha256:createHash('sha256').update(body).digest('hex'),body});
  if([401,403,429].includes(r.status))break;
 }
 out.status='PUBLIC_SOURCE_REPLIES_CAPTURED_NOT_YET_QUALIFIED';
}catch(error){out.status='NEW_SOURCE_QUALIFICATION_NOT_CLOSED';out.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:error.name;}
finally{
 if(admitted)try{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}catch{out.status='FINALIZATION_NOT_CLOSED';}
 out.D1=db.usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>policy.reservation.rows_read||out.D1.rows_written>policy.reservation.rows_written)out.status='NATIVE_ENVELOPE_NOT_CLOSED';
 await fs.mkdir(folder,{recursive:true});await fs.writeFile(folder+'/qualification.json',JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({status:out.status,reason:out.reason,provider_HTTP:out.actual_provider_HTTP,D1:out.D1,responses:out.responses.map(r=>({symbol:r.requested,http:r.http_status,bytes:Buffer.byteLength(r.body)})),production_enabled:false}));
}
