import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {evaluateWithinRunReservation,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {normalizeHtxAssetReferences} from '../current-generation/files/src/htx-asset-identity.mjs';
import {collectCoingeckoSectorEvidence} from '../current-generation/files/src/coingecko-sector-evidence.mjs';
import {consumeSectorContext} from '../current-generation/files/src/sector-context.mjs';

import {nativeSectorValidationPlan,reserveNativeSectorValidationBatch} from './native-sector-validation-admission-20261014.mjs';
const plan=nativeSectorValidationPlan(process.env.REPORT2_NATIVE_VALIDATION_BATCH||'INITIAL_NATIVE4'),{symbols}=plan,reservation=plan.D1_reservation,maxHTTP=plan.maximum_provider_HTTP,repo='kovalev23091987-jpg/my-report-2-cloud-runner';
if(process.argv.includes('--plan')){
 console.log(JSON.stringify({...plan,live_use_claim:false}));process.exit(0);
}
for(const key of ['GITHUB_TOKEN','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_SHA','REPORT2_EXPECTED_MAIN','REPORT2_EXPECTED_LEASE_OWNER','REPORT2_COINGECKO_DEMO_API_KEY','REPORT2_D1_BRIDGE_URL','REPORT2_D1_BRIDGE_TOKEN'])if(!process.env[key])throw Error(key+'_REQUIRED');
if(process.env.GITHUB_REPOSITORY!==repo)throw Error('EXACT_REPOSITORY_REQUIRED');
const api=async path=>{const r=await fetch('https://api.github.com/repos/'+repo+'/'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('GITHUB_CONTROL_NOT_CLOSED');return r.json();};
const main=(await api('git/ref/heads/main')).object.sha,head=process.env.GITHUB_SHA;
if(main!==process.env.REPORT2_EXPECTED_MAIN)throw Error('MAIN_MOVED');
if(head!==main){
 if(head!==process.env.REPORT2_EXPECTED_CANDIDATE||!['refs/heads/codex/native-sector-source-coverage-20261014','refs/heads/codex/native-sector-missing-rest-20261014'].includes(process.env.GITHUB_REF))throw Error('EXACT_CANDIDATE_REQUIRED');
 const compared=await api('compare/'+main+'...'+head),allowed=new Set(['current-generation/files/src/coingecko-sector-evidence.mjs','current-generation/tests/shared-sector-batch.test.mjs','current-generation/tests/native-sector-provider-binding.test.mjs','tools/validate-native-sector-batch-20261014.mjs','tools/native-sector-validation-admission-20261014.mjs','current-generation/tests/native-sector-validation-admission.test.mjs','tools/validate-coingecko-demo-sector-20261013.mjs','.github/workflows/coingecko-demo-validation.yml','.github/workflows/liq-assembled-offline-20261012.yml','checkpoints/NATIVE_SECTOR_PROVIDER_IDENTITY_CANDIDATE_20261014.json']);
 if(compared.status!=='ahead'||compared.merge_base_commit?.sha!==main||!compared.files?.length||compared.files.length>allowed.size||compared.files.some(r=>!allowed.has(r.filename)||!['added','modified'].includes(r.status)))throw Error('CANDIDATE_SCOPE_NOT_CLOSED');
}
const read=async path=>JSON.parse(Buffer.from((await api('contents/'+path+'?ref='+main)).content,'base64').toString());
const [phase,fence]=await Promise.all([read('checkpoints/CLOUD_PHASE_STATE_20261004.json'),read('audit-fixes/source-optimization-20260930/execution-lock.json')]);
if(phase.lease?.owner!==process.env.REPORT2_EXPECTED_LEASE_OWNER||phase.lease.expires_ts<=Date.now()||phase.current_task!=='LIQ_MAXIMUM_USEFUL_COVERAGE_IN_PROGRESS'||phase.latest_own_bounded_continuation_lease?.owner!==phase.lease.owner||fence.active)throw Error('OWNER_OR_FENCE_BLOCKED');
const raw=gunzipSync(await fs.readFile('checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz'));
if(createHash('sha256').update(raw).digest('hex')!=='f2bcb443ac8b167fa0b64709fa019107043208e37ae94df96b676ef9c51a0d29')throw Error('ORIGINAL_HTX_IDENTITY_DIGEST');
const original=JSON.parse(raw),identities=normalizeHtxAssetReferences(original.payload||original).entries;
const approved=JSON.parse(gunzipSync(await fs.readFile('checkpoints/htx-approved-crypto-futures-universe-20261012.json.gz'))).assets;
for(const symbol of symbols)if(!approved.some(a=>a.symbol===symbol&&a.asset_analysis_contract===symbol+'-USDT')||identities[symbol]?.status!=='CLOSED'||identities[symbol].identities[0]?.asset_kind!=='NATIVE')throw Error('APPROVED_EXACT_NATIVE_REQUIRED');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),day=new Date(now).toISOString().slice(0,10),id='NATIVE_SECTOR_VALIDATE:'+plan.batch+':'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={schema:'NATIVE_SECTOR_MISSING_FACT_BATCH_V1',head,expected_main:main,cloud_run:Number(process.env.GITHUB_RUN_ID),run_id:id,status:'NOT_ADMITTED',batch:plan.batch,symbols,maximum_provider_HTTP:maxHTTP,D1_reservation:reservation,original_HTX_binding_sha256:createHash('sha256').update(raw).digest('hex'),rows:[],responses:[],MAIN:0,Telegram:0,manual_reserve_consumed:false,score_changed:false,project_complete:false,production_use_claim:false};
let admitted=false,wholeReserved=0;
await fs.mkdir('audit-output/coingecko-demo-sector',{recursive:true});
try{
 const grant=await reserveNativeSectorValidationBatch(db,{batch:plan.batch,id,now});
 if(!grant)throw Error('ATOMIC_DAY_RESERVATION_NOT_ADMITTED');admitted=true;
 const row=await db.prepare('SELECT state,reserve_rows_read,reserve_rows_written FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1 LIMIT 1').bind(id).first();
 if(row?.state!=='RESERVED'||Number(row.reserve_rows_read)!==reservation.rows_read||Number(row.reserve_rows_written)!==reservation.rows_written)throw Error('RESERVATION_READBACK_REQUIRED');
 const request_admit=()=>{if(wholeReserved>=maxHTTP||!evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:40}).allowed)return{allowed:false,status:'VALIDATION_HTTP_OR_D1_BOUND'};wholeReserved++;return{allowed:true,status:'RESERVED'};};
 const fetch_impl=async(url,options)=>{
  const response=await fetch(url,options),body=await response.clone().text(),received_ts=Date.now();
  if(response.ok&&body.length<=2*1024*1024&&!body.includes(process.env.REPORT2_COINGECKO_DEMO_API_KEY))out.responses.push({url,received_ts,http_status:response.status,body_sha256:createHash('sha256').update(body).digest('hex'),body,synthetic:false});
  return response;
 };
 for(const symbol of symbols){
  const contract=symbol+'-USDT',identity=identities[symbol].identities[0],result=await collectCoingeckoSectorEvidence({db,request_admit,fetch_impl,contract,run_id:id+':'+symbol,asset_identity:identity,asset_metadata:{},now:Date.now(),strict_fresh_manual:false,coingecko_demo_api_key:process.env.REPORT2_COINGECKO_DEMO_API_KEY});
  const context=consumeSectorContext({evidence:result.evidence,contract,asset_identity:identity,now:Date.now()});
  out.rows.push({contract,identity,status:result.status,source_clock_unchanged:true,network_calls:result.network_calls,receipts:result.receipts,admission:result.admission,summary:result.summary,evidence:result.evidence,consumer_status:context.status,consumer_facts:context.facts,manual_Telegram_production_use:false});
  if(/SOURCE_ACCESS_BLOCKED|PROVIDER_RATE_LIMITED/.test(result.status))break;
 }
 out.status=out.rows.some(r=>r.status==='CLOSED'&&r.consumer_status==='CLOSED')?'USEFUL_NATIVE_SECTOR_FACT_AND_CONSUMER_PARTIAL':'NO_USEFUL_NATIVE_SECTOR_FACT';
}catch(error){out.status='VALIDATION_NOT_CLOSED';out.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:error.name;}
finally{
 if(admitted)try{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}catch{out.status='FINALIZATION_NOT_CLOSED';}
 out.D1=db.usageSnapshot();out.actual_HTTP=out.rows.reduce((sum,row)=>sum+Number(row.network_calls||0),0);out.completed_ts=Date.now();
 if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written||out.actual_HTTP>maxHTTP)out.status='ENVELOPE_NOT_CLOSED';
 await fs.writeFile('audit-output/coingecko-demo-sector/validation.json',JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({status:out.status,actual_HTTP:out.actual_HTTP,rows:out.rows.map(r=>({contract:r.contract,status:r.status,consumer:r.consumer_status})),D1:out.D1,reason:out.reason}));
}
