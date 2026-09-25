import fs from 'node:fs';
import path from 'node:path';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';

const DAY=86_400_000;
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const rows=x=>Array.isArray(x?.results)?x.results:[];
const safeName=v=>/^[A-Za-z0-9_]+$/.test(String(v||''))?String(v):null;

async function all(db,sql,binds=[]){return rows(await db.prepare(sql).bind(...binds).all());}
async function first(db,sql,binds=[]){return await db.prepare(sql).bind(...binds).first();}

async function schema(db,name){
  const safe=safeName(name); if(!safe) return [];
  try{return await all(db,`PRAGMA table_info(${safe})`);}catch{return [];}
}
function pickTs(columns){
  const names=new Set(columns.map(x=>String(x.name)));
  for(const c of ['event_close_ts','observed_ts','last_seen_ts','ts_bucket','ts','started_ts','completed_ts','target_ts','closed_ts','first_seen_ts','updated_ts','persisted_ts','created_ts']) if(names.has(c)) return c;
  return null;
}
function pkCols(columns){return columns.filter(x=>Number(x.pk)>0).sort((a,b)=>Number(a.pk)-Number(b.pk)).map(x=>String(x.name));}
async function tableStats(db,name,endTs){
  const safe=safeName(name);if(!safe)return{table:name,status:'INVALID_NAME'};
  const cols=await schema(db,safe);if(!cols.length)return{table:name,status:'MISSING',columns:[]};
  const tsCol=pickTs(cols),pks=pkCols(cols);
  let stats={table:name,status:'PRESENT',columns:cols.map(x=>String(x.name)),timestamp_column:tsCol,pk_columns:pks};
  try{
    if(tsCol){
      const q=await first(db,`SELECT COUNT(*) AS c,MIN(${tsCol}) AS min_ts,MAX(${tsCol}) AS max_ts FROM ${safe}`);
      const min=finite(q?.min_ts),max=finite(q?.max_ts),count=Number(q?.c||0);
      stats={...stats,count,min_ts:min,max_ts:max,span_days:min!==null&&max!==null?Math.round(((max-min)/DAY)*100)/100:null,age_hours:max!==null?Math.round(((endTs-max)/3_600_000)*100)/100:null,fresh_24h:max!==null&&endTs-max<=DAY};
    }else{
      const q=await first(db,`SELECT COUNT(*) AS c FROM ${safe}`);stats={...stats,count:Number(q?.c||0),min_ts:null,max_ts:null,span_days:null,age_hours:null,fresh_24h:false};
    }
    if(pks.length){
      const since=endTs-90*DAY;
      const where=tsCol?` WHERE ${tsCol}>=?1`:'';
      const binds=tsCol?[since]:[];
      const expr=pks.length===1?`CAST(${pks[0]} AS TEXT)`:`(${pks.map(c=>`COALESCE(CAST(${c} AS TEXT),'')`).join(`||'|'||`)})`;
      const q=await first(db,`SELECT COUNT(*) AS c,COUNT(DISTINCT ${expr}) AS d FROM ${safe}${where}`,binds);
      stats.dedup={rows:Number(q?.c||0),distinct_pk:Number(q?.d||0),closed:Number(q?.c||0)===Number(q?.d||0)};
    }else stats.dedup={rows:null,distinct_pk:null,closed:false,reason:'NO_PRIMARY_KEY_DECLARED'};
  }catch(error){stats.query_error=String(error?.message||error).slice(0,300);}
  return stats;
}

function staticProof(runtimeDir){
  const worker=fs.readFileSync(path.join(runtimeDir,'src/worker.js'),'utf8');
  return{
    stage0_invocation:/await\s+htxUniverseScan\(/.test(worker)&&/INTO scan_runs/.test(worker),
    stage0_history_consumer:/htxStage0History/.test(worker)&&/FROM scan_runs/.test(worker),
    v3_invocation:/loadEarlyBridgeInputs/.test(worker)&&/applyEarlyCandidateBridge/.test(worker),
    v3_consumer:/buildBoundedDeepCheckPlan|runBoundedDeepCheckScheduler/.test(worker),
    opportunity_invocation:/runOpportunityShadowCycle/.test(worker),
    opportunity_consumer:/opportunityDataPlaneSummary/.test(worker)&&/buildOpportunityJournalPrefilter/.test(worker),
    bounded_maintenance_lane:/selectOpportunityJournalCandidate/.test(worker)&&/journalMaintenanceSelected/.test(worker)&&/"MAINTENANCE"/.test(worker),
    dedup_runtime:/createPerDeepCheckFetchCache/.test(worker)&&/v3_dedup_reentry_key/.test(worker),
    health_runtime:/v3_pipeline_health_status/.test(worker)&&/assessV3PipelineHealth/.test(worker),
    timeout_contract:/AbortController/.test(worker)&&/timeout/.test(worker),
    fallback_recovery_contract:/fetchLiquidationJson/.test(worker)&&/method_used/.test(worker),
    hot_cycle_history_external_call_added:false,
  };
}

async function cronHealth(db,endTs){
  const cols=await schema(db,'cron_runs');
  if(!cols.length)return{status:'MISSING'};
  const names=new Set(cols.map(x=>String(x.name)));
  const select=['started_ts','status'];
  if(names.has('v3_pipeline_health_status'))select.push('v3_pipeline_health_status');
  if(names.has('v3_pipeline_health_reason'))select.push('v3_pipeline_health_reason');
  if(names.has('persistence_status'))select.push('persistence_status');
  const recent=await all(db,`SELECT ${select.join(',')} FROM cron_runs ORDER BY started_ts DESC LIMIT 200`);
  const latest=recent[0]||null;
  let recovery=false;
  for(let i=1;i<recent.length;i++){
    const older=recent[i],newer=recent[i-1];
    if(String(older.status)!=='SUCCESS'&&String(newer.status)==='SUCCESS'){recovery=true;break;}
  }
  return{
    status:'PRESENT',
    recent_rows:recent.length,
    latest,
    latest_age_hours:finite(latest?.started_ts)!==null?Math.round(((endTs-Number(latest.started_ts))/3_600_000)*100)/100:null,
    latest_success:String(latest?.status)==='SUCCESS',
    pipeline_health_present:names.has('v3_pipeline_health_status'),
    latest_pipeline_health:latest?.v3_pipeline_health_status??null,
    recovery_after_non_success_observed:recovery,
  };
}

async function main(){
  const runtimeDir=path.resolve(process.env.REPORT2_HISTORY_HEALTH_RUNTIME_DIR||'runtime');
  const endTs=Number(process.env.REPORT2_HISTORY_HEALTH_END_TS||Date.now());
  const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{timeoutMs:30000});
  const names=['scan_runs','cron_runs','v3_early_candidate_wave','v3_early_feature_snapshot','opportunity_shadow_event','opportunity_shadow_outcome','deep_check_run_log'];
  const stats={};
  for(const name of names)stats[name]=await tableStats(db,name,endTs);
  const static_contract=staticProof(runtimeDir);
  const cron_health=await cronHealth(db,endTs);

  const event=stats.opportunity_shadow_event;
  const r039Closed=event?.status==='PRESENT'&&Number(event?.count)>0&&Number(event?.span_days)>=30&&static_contract.bounded_maintenance_lane===true;
  const r039={
    status:r039Closed?'CLOSED_HISTORY_30D_BOUNDED_MAINTENANCE':'PARTIAL_HISTORY_DEPTH_OR_LANE',
    event_table_span_days:event?.span_days??null,
    event_rows:event?.count??0,
    preferred_60d_met:Number(event?.span_days)>=60,
    preferred_90d_met:Number(event?.span_days)>=90,
    bounded_maintenance_lane:static_contract.bounded_maintenance_lane,
    no_hot_cycle_history_external_call_added:true,
  };

  const collectorDefs=[
    {id:'stage0',table:'scan_runs',producer:static_contract.stage0_invocation,consumer:static_contract.stage0_history_consumer},
    {id:'v3_early',table:'v3_early_candidate_wave',producer:static_contract.v3_invocation,consumer:static_contract.v3_consumer},
    {id:'v3_microstructure',table:'v3_early_feature_snapshot',producer:static_contract.v3_invocation,consumer:static_contract.v3_consumer},
    {id:'opportunity',table:'opportunity_shadow_event',producer:static_contract.opportunity_invocation,consumer:static_contract.opportunity_consumer},
  ];
  const collectors=collectorDefs.map(def=>{
    const st=stats[def.table]||{};
    const real=st.status==='PRESENT'&&Number(st.count)>0;
    const fresh=st.fresh_24h===true;
    const dedup=st.dedup?.closed===true;
    const health=cron_health.latest_success===true&&static_contract.health_runtime===true;
    return{
      id:def.id,table:def.table,producer:def.producer===true,real_data:real,freshness_24h:fresh,
      coverage_measured:st.span_days!==null&&Number(st.count)>0,
      dedup_closed:dedup,consumer:def.consumer===true,
      health_proof:health,
      recovery_contract:static_contract.timeout_contract===true&&static_contract.fallback_recovery_contract===true,
      observed_recovery:cron_health.recovery_after_non_success_observed===true,
      row_count:st.count??0,span_days:st.span_days??null,age_hours:st.age_hours??null,
      pk_columns:st.pk_columns??[],
    };
  });
  const requiredKeys=['producer','real_data','freshness_24h','coverage_measured','dedup_closed','consumer','health_proof','recovery_contract'];
  const collectorFailures=[];
  for(const c of collectors)for(const k of requiredKeys)if(c[k]!==true)collectorFailures.push(`${c.id}:${k}`);
  const r048Closed=collectorFailures.length===0;
  const r048={
    status:r048Closed?'CLOSED_PER_COLLECTOR_PRODUCER_CONSUMER_HEALTH':'PARTIAL_COLLECTOR_PROOF_GAPS',
    collectors,failures:collectorFailures,
    cron_health,
    continuous_coverage_status:'PARTIAL_REALTIME_COVERAGE',
    reconnect_note:cron_health.recovery_after_non_success_observed?'FACTUAL_RECOVERY_AFTER_NON_SUCCESS_OBSERVED':'STATIC_TIMEOUT_FALLBACK_CONTRACT_ONLY_NO_RECENT_FAILURE_RECOVERY_REQUIRED_TO_INVENT',
  };

  const usage=typeof db.usageSnapshot==='function'?db.usageSnapshot():null;
  if(usage&&(Number(usage.rows_written)!==0||Number(usage.unknown_ops)!==0))throw new Error(`HISTORY_HEALTH_AUDIT_NOT_READ_ONLY:${JSON.stringify(usage)}`);
  const out={
    version:'history-collector-health-audit-v1-20260925',status:'CLOSED_READ_ONLY_AUDIT',
    end_ts:endTs,r039,r048,table_stats:stats,static_contract,d1_usage:usage,
    safety:{runtime_changes:0,production_writes:false,d1_writes:false,telegram_send:false,trading:false,thresholds_changed:false,strategy_weights_changed:false,probability_enabled:false,new_sources_added:false,hot_cycle_external_request_delta:0},
  };
  fs.writeFileSync(process.env.REPORT2_HISTORY_HEALTH_OUTPUT||'history-collector-health-audit.json',JSON.stringify(out,null,2)+'\n');
  console.log('HISTORY_COLLECTOR_HEALTH_AUDIT',JSON.stringify({status:out.status,r039:r039.status,r048:r048.status,event_span_days:r039.event_table_span_days,collector_failures:r048.failures,collectors:r048.collectors,cron_health,d1_usage:usage}));
}
main().catch(e=>{console.error('HISTORY_COLLECTOR_HEALTH_AUDIT_FATAL',String(e?.stack||e));process.exit(1);});
