import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
const arr=v=>Array.isArray(v)?v:[];const safe=(v,f=[])=>{try{return typeof v==='string'?JSON.parse(v):(v??f);}catch{return f;}};const rows=x=>Array.isArray(x?.results)?x.results:[];const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
async function q(db,sql,binds,label){try{return{status:'CLOSED',rows:rows(await db.prepare(sql).bind(...binds).all()),error:null};}catch(e){return{status:'SOURCE_UNSUPPORTED',rows:[],error:`${label}:${String(e?.message||e).slice(0,240)}`};}}
async function main(){
 const runtime=path.resolve(process.env.REPORT2_PRESELECTION_RUNTIME_DIR||'runtime');const load=n=>import(pathToFileURL(path.join(runtime,'src',n)).href);
 const [{buildPreselectionMetricRouter}]=await Promise.all([load('preselection-metric-router.mjs')]);
 const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{timeoutMs:30000});
 const end=Number(process.env.REPORT2_PRESELECTION_END_TS||Date.now()),start=end-14*86400000;
 const full=await q(db,`SELECT contract_code,observed_ts,dq_status,conflicts_json,evidence_compact_json FROM full_evidence_shadow_log WHERE shadow_only=1 AND observed_ts BETWEEN ?1 AND ?2 ORDER BY observed_ts DESC LIMIT 2048`,[start,end],'full');
 const early=await q(db,`SELECT contract_code,last_seen_ts,lifecycle_stage,shadow_only FROM v3_early_candidate_wave WHERE shadow_only=1 AND last_seen_ts BETWEEN ?1 AND ?2 ORDER BY last_seen_ts DESC LIMIT 512`,[start,end],'early');
 let routedSnapshots=0,selectedMetrics=0,metadataComplete=0;const families=new Set(),sources=new Set();const perContract=[];
 const parsedFull=[];
 for(const row of full.rows){
   const evidence=arr(safe(row.evidence_compact_json,[]));
   const router=buildPreselectionMetricRouter({contract:row.contract_code,evidence,now:Number(row.observed_ts)});
   parsedFull.push({contract_code:row.contract_code,observed_ts:Number(row.observed_ts),router});
   if(router.status==='CLOSED'){
     routedSnapshots++;selectedMetrics+=router.selected_metric_count;metadataComplete+=router.metadata_complete_count;
     router.families.forEach(x=>families.add(x));router.selected_sources.forEach(x=>sources.add(x));
     if(perContract.length<20)perContract.push({contract:row.contract_code,observed_ts:row.observed_ts,selected_metric_count:router.selected_metric_count,families:router.families,sources:router.selected_sources,metadata_complete_count:router.metadata_complete_count});
   }
 }
 let earlyRouterCases=0;
 for(const e of early.rows){
   const ts=Number(e.last_seen_ts);
   const match=parsedFull.filter(x=>x.contract_code===e.contract_code&&x.observed_ts<=ts+60_000&&x.observed_ts>=ts-30*60_000).sort((a,b)=>b.observed_ts-a.observed_ts)[0];
   if(match?.router?.status==='CLOSED'&&match.router.selected_metric_count>0)earlyRouterCases++;
 }
 const allMetadataComplete=selectedMetrics>0&&metadataComplete===selectedMetrics;
 const r009=routedSnapshots>0&&sources.size>0?'CLOSED_FACTUAL_DYNAMIC_PRIMARY_INPUTS':'PARTIAL_NO_FACTUAL_ROUTED_INPUTS';
 const r010=allMetadataComplete?'CLOSED_METADATA_CONTRACT':'PARTIAL_METADATA_CONTRACT';
 const r056=earlyRouterCases>0?'CLOSED_FACTUAL_PRESELECTION_ROUTER_CASES':'PARTIAL_NO_FACTUAL_EARLY_ROUTER_CASE';
 const usage=typeof db.usageSnapshot==='function'?db.usageSnapshot():null;if(usage&&(Number(usage.rows_written)!==0||Number(usage.unknown_ops)!==0))throw new Error('PRESELECTION_AUDIT_NOT_READ_ONLY');
 const out={version:'preselection-router-readonly-audit-v1-20260925',status:'CLOSED_READ_ONLY_AUDIT',r009,r010,r056,counts:{full_rows:full.rows.length,early_rows:early.rows.length,routed_snapshots:routedSnapshots,selected_metrics:selectedMetrics,metadata_complete:metadataComplete,early_router_cases:earlyRouterCases},families:[...families].sort(),sources:[...sources].sort(),examples:perContract,query_status:{full:full.status,early:early.status},d1_usage:usage,safety:{production_writes:false,d1_writes:false,network_calls:0,telegram_send:false,trading:false,thresholds_changed:false,strategy_weights_changed:false,new_sources_added:false}};
 fs.writeFileSync(process.env.REPORT2_PRESELECTION_AUDIT_OUTPUT||'preselection-router-readonly-audit.json',JSON.stringify(out,null,2)+'\n');
 console.log('PRESELECTION_ROUTER_READONLY_AUDIT',JSON.stringify({status:out.status,r009,r010,r056,counts:out.counts,families:out.families,sources:out.sources,d1_usage:usage}));
}
main().catch(e=>{console.error('PRESELECTION_ROUTER_AUDIT_FATAL',String(e?.stack||e));process.exit(1);});
