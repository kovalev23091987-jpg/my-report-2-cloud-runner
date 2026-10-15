import fs from 'node:fs/promises';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {evaluateWithinRunReservation,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {SOURCE_POLICIES} from '../current-generation/files/src/evidence-source-adapters.mjs';
import {validateDydxRouting} from '../current-generation/files/src/liquidation-extension/dydx-runtime-collector.mjs';
import {dydxNativeMarketCoverage} from '../current-generation/files/src/liquidation-extension/dydx-native-market-catalog.mjs';
import {gunzipSync} from 'node:zlib';

const repository='kovalev23091987-jpg/my-report-2-cloud-runner';
export const ACTIVE_BUDGET_READ_PLAN=Object.freeze({rows_read:2500,rows_written:32,max_runs_day:2,max_daily_reads:3500000,max_daily_writes:70000});
const plan=ACTIVE_BUDGET_READ_PLAN;
if(process.argv.includes('--plan')){console.log(JSON.stringify({reservation:plan,provider_HTTP:0,MAIN:0,Telegram:0,source_allowances_modified:false}));process.exit(0);}
for(const key of ['GITHUB_TOKEN','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','REPORT2_EXPECTED_MAIN','REPORT2_EXPECTED_LEASE_OWNER','REPORT2_D1_BRIDGE_URL','REPORT2_D1_BRIDGE_TOKEN'])if(!process.env[key])throw Error(key+'_REQUIRED');
if(process.env.GITHUB_REPOSITORY!==repository)throw Error('EXACT_REPOSITORY_REQUIRED');
const api=async path=>{
 const r=await fetch('https://api.github.com/repos/'+repository+'/'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('GITHUB_CONTROL_READ_NOT_CLOSED');return r.json();
};
const main=(await api('git/ref/heads/main')).object.sha;
if(main!==process.env.REPORT2_EXPECTED_MAIN)throw Error('MAIN_MOVED');
const read=async path=>JSON.parse(Buffer.from((await api('contents/'+path+'?ref='+main)).content,'base64').toString());
const [phase,fence]=await Promise.all([read('checkpoints/CLOUD_PHASE_STATE_20261004.json'),read('audit-fixes/source-optimization-20260930/execution-lock.json')]);
if(phase.lease?.owner!==process.env.REPORT2_EXPECTED_LEASE_OWNER||phase.lease.expires_ts<=Date.now()||phase.latest_own_bounded_continuation_lease?.owner!==phase.lease.owner||phase.current_task!=='LIQ_MAXIMUM_USEFUL_COVERAGE_IN_PROGRESS'||fence.active)throw Error('OWNER_OR_FENCE_BLOCKED');
const now=Date.now(),day=new Date(now).toISOString().slice(0,10),id=`ACTIVE_SOURCE_BUDGET_READ:${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT}`;
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const out={schema:'ACTIVE_SOURCE_BUDGET_ACTUAL_READ_V1',main,cloud_run:process.env.GITHUB_RUN_ID,lease_owner:phase.lease.owner,observed_ts:now,day_utc:day,provider_HTTP:0,MAIN:0,Telegram:0,allowances_modified:false,originals_modified:false,status:'NOT_ADMITTED'};
let admitted=false;
const admit=rows=>{if(evaluateWithinRunReservation({reservation:plan,currentUsage:db.usageSnapshot(),extraRowsRead:rows,extraRowsWritten:2}).allowed!==true)throw Error('ACTIVE_BUDGET_READ_ENVELOPE_REQUIRED');};
try{
 const grant=await db.prepare(`INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts)
 SELECT ?1,?2,?3,?4,'RESERVED',?5 WHERE
 COALESCE((SELECT SUM(MAX(reserve_rows_read,COALESCE(measured_rows_read,0)+CASE WHEN state='FINALIZED' THEN 1 ELSE 0 END)) FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2),0)+?3<=?6 AND
 COALESCE((SELECT SUM(MAX(reserve_rows_written,COALESCE(measured_rows_written,0))) FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2),0)+?4<=?7 AND
 NOT EXISTS(SELECT 1 FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2 AND state='FINALIZED' AND COALESCE(unknown_ops,1)>0) AND
 (SELECT COUNT(*) FROM report2_runner_budget_ledger_shadow WHERE day_utc=?2 AND reservation_id LIKE 'ACTIVE_SOURCE_BUDGET_READ:%')<?8`).bind(id,day,plan.rows_read,plan.rows_written,now,plan.max_daily_reads,plan.max_daily_writes,plan.max_runs_day).run();
 const changed=Number(grant?.meta?.changes??grant?.changes);
 if(changed!==1)throw Error(changed===0?'ACTIVE_BUDGET_DAY_BOUND_OR_DUPLICATE':'ACTIVE_BUDGET_ADMISSION_ACK_UNKNOWN');
 admitted=true;
 const reserved=await db.prepare('SELECT reservation_id,state,reserve_rows_read,reserve_rows_written FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1 LIMIT 1').bind(id).first();
 if(reserved?.state!=='RESERVED'||Number(reserved.reserve_rows_read)!==plan.rows_read||Number(reserved.reserve_rows_written)!==plan.rows_written)throw Error('ACTIVE_BUDGET_RESERVATION_READBACK_REQUIRED');
 admit(500);
 const daily=await db.prepare('SELECT source,attempts,updated_at FROM report2_evidence_source_daily WHERE day_utc=?1 ORDER BY source LIMIT 128').bind(day).all();
 if(daily.results?.length===128)throw Error('DAILY_SOURCE_ROWS_TRUNCATED');
 out.daily=daily.results.map(r=>({...r,cap:SOURCE_POLICIES[r.source]?.daily_cap??null,demo_ordinary_cap:r.source==='COINGECKO_SECTOR'?SOURCE_POLICIES[r.source].demo_ordinary_daily_cap:null,demo_all_cap:r.source==='COINGECKO_SECTOR'?SOURCE_POLICIES[r.source].demo_daily_cap:null,blocks:SOURCE_POLICIES[r.source]?.blocks??null}));
 admit(200);
 const monthly=await db.prepare(`SELECT scope_id,provider,unit,window_start_ts,window_end_ts,allowance_units,used_units,version,active
 FROM report2_liq_source_allowance_shadow WHERE window_start_ts<=?1 AND window_end_ts>?1 AND active=1 ORDER BY provider,scope_id LIMIT 64`).bind(now).all();
 if(monthly.results?.length===64)throw Error('MONTHLY_SOURCE_ROWS_TRUNCATED');
 out.monthly=monthly.results.map(r=>({...r,remaining:Number(r.allowance_units)-Number(r.used_units),is_source_ceiling_not_useful_coverage:true}));
 admit(20);
 const routes=await db.prepare("SELECT source,observed_ts,expires_ts,payload_json FROM report2_liq_venue_catalog_cache WHERE source IN ('DYDX_NATIVE_ACCOUNT_ROUTING','GTRADE_ROUTING') LIMIT 2").all();
 const scope=JSON.parse(gunzipSync(await fs.readFile('checkpoints/htx-approved-crypto-futures-universe-20261012.json.gz')));
 out.structural_catalogs=routes.results.map(row=>{
  const raw=JSON.parse(row.payload_json),dydx=row.source==='DYDX_NATIVE_ACCOUNT_ROUTING',valid=dydx?!!validateDydxRouting(raw,{now}):null;
  return{source:row.source,cache_observed_ts:row.observed_ts,cache_expires_ts:row.expires_ts,source_ts:raw.source_ts,stored_sha_or_fingerprint:raw.routing_fingerprint??raw.fingerprint??null,
   ...(dydx?{routing_valid:valid,complete_market_catalog_present:!!raw.native_market_catalog,product_eligibility:scope.assets.map(a=>({contract:a.asset_analysis_contract,...dydxNativeMarketCoverage(valid?raw.native_market_catalog:null,{contract:a.asset_analysis_contract,now})})),positions_or_levels_exported:false}:{market_rows:Array.isArray(raw.markets)?raw.markets.length:null,structural_only:true})};
 });
 out.status='CLOSED_READ_ONLY_SOURCE_BUDGETS';
}catch(error){out.status='ACTIVE_BUDGET_READ_NOT_CLOSED';out.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:error.name;}
finally{
 if(admitted)try{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}catch{out.status='ACTIVE_BUDGET_FINALIZE_NOT_CLOSED';}
 out.D1=db.usageSnapshot();out.completed_ts=Date.now();
 await fs.mkdir('audit-output/active-source-budget-read',{recursive:true});
 await fs.writeFile('audit-output/active-source-budget-read/budgets.json',JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({status:out.status,daily_rows:out.daily?.length,monthly_rows:out.monthly?.length,reason:out.reason,D1:out.D1}));
 if(out.status!=='CLOSED_READ_ONLY_SOURCE_BUDGETS')process.exitCode=1;
}
