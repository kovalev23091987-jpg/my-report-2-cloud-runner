import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
const DAY=86400000,arr=v=>Array.isArray(v)?v:[],rows=x=>Array.isArray(x?.results)?x.results:[],finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;},safe=(v,f=[])=>{try{return typeof v==='string'?JSON.parse(v):(v??f);}catch{return f;}};
const read=n=>{try{return JSON.parse(fs.readFileSync(n,'utf8'));}catch{return null;}};
async function q(db,sql,binds=[]){try{return rows(await db.prepare(sql).bind(...binds).all());}catch{return[];}}
async function one(db,sql,binds=[]){try{return await db.prepare(sql).bind(...binds).first();}catch{return null;}}
function effectConfirmed(evidence,direction){const rs=arr(evidence).filter(e=>/^rs_vs_(btc|eth)_(1h|4h|24h)$/i.test(String(e?.metric||''))&&finite(e?.value)!==null&&String(e?.status||'').toUpperCase()==='CLOSED');if(direction==='LONG')return rs.length>=2&&rs.every(e=>Number(e.value)>0);if(direction==='SHORT')return rs.length>=2&&rs.every(e=>Number(e.value)<0);return false;}
async function main(){
 const runtime=path.resolve(process.env.REPORT2_CONSOLIDATED_RUNTIME_DIR||'runtime'),load=n=>import(pathToFileURL(path.join(runtime,'src',n)).href);
 const [{normalizeEarlyBridgeReceipt},{buildPreselectionMetricRouter}]=await Promise.all([load('early-candidate-bridge.mjs'),load('preselection-metric-router.mjs')]);
 const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{timeoutMs:30000});
 const end=Date.now(),start=end-14*DAY;
 const latestAny=await one(db,`SELECT started_ts,status,v3_pipeline_health_status,v3_pipeline_health_reason,persistence_status FROM cron_runs ORDER BY started_ts DESC LIMIT 1`);
 const latestHealthy=await one(db,`SELECT started_ts,status,v3_pipeline_health_status,v3_pipeline_health_reason,persistence_status FROM cron_runs WHERE status='SUCCESS' AND v3_pipeline_health_status IS NOT NULL ORDER BY started_ts DESC LIMIT 1`);
 const r048={latest_any:latestAny,latest_completed_health:latestHealthy,status:latestHealthy&&end-Number(latestHealthy.started_ts)<=DAY&&!['FAIL','FAILED','UNKNOWN','NOT_CLOSED'].includes(String(latestHealthy.v3_pipeline_health_status||'').toUpperCase())?'CLOSED_CURRENT_COMPLETED_HEALTH_PROOF':'PARTIAL_NO_FRESH_COMPLETED_HEALTH_RECEIPT'};
 const early=await q(db,`SELECT wave_id,contract_code,last_seen_ts,lifecycle_stage,early_detection_quality_0_100,long_evidence_domain_count,short_evidence_domain_count,direction_hint,direction_state,shadow_only,feature_json,evidence_json,evidence_refs_json FROM v3_early_candidate_wave WHERE shadow_only=1 AND last_seen_ts BETWEEN ?1 AND ?2 ORDER BY last_seen_ts DESC LIMIT 1024`,[start,end]);
 const full=await q(db,`SELECT contract_code,observed_ts,dq_status,conflicts_json,evidence_compact_json FROM full_evidence_shadow_log WHERE shadow_only=1 AND observed_ts BETWEEN ?1 AND ?2 ORDER BY observed_ts DESC LIMIT 4096`,[start,end]);
 let routed=0,effectCases=0;
 for(const er of early){
   const receipt=normalizeEarlyBridgeReceipt(er);if(!receipt?.contract)continue;
   const ts=Number(er.last_seen_ts);
   const match=full.filter(x=>x.contract_code===receipt.contract&&Number(x.observed_ts)<=ts+60000&&Number(x.observed_ts)>=ts-30*60000).sort((a,b)=>Number(b.observed_ts)-Number(a.observed_ts))[0];
   if(!match)continue;
   const ev=arr(safe(match.evidence_compact_json,[]));const router=buildPreselectionMetricRouter({contract:receipt.contract,evidence:ev,now:Number(match.observed_ts)});
   if(router.status==='CLOSED'&&router.selected_metric_count>0){routed++;if(effectConfirmed(router.selected_facts,receipt.direction_hint))effectCases++;}
 }
 const r056={status:routed>0?'CLOSED_FACTUAL_EARLY_ROUTER_CASE':'PARTIAL_NO_FACTUAL_EARLY_ROUTER_CASE',early_rows:early.length,routed_cases:routed};
 const r084={status:effectCases>0?'CLOSED_FACTUAL_SOURCE_CONTEXT_EFFECT_CASE':'PARTIAL_NO_FACTUAL_EFFECT_CASE',effect_cases:effectCases};
 const validation=read('validation-acceptance-refresh.json');
 const funnel=read('consolidated-funnel-replay.json');
 const stats=read('consolidated-shadow-statistics.json');
 const live=read('consolidated-live-proof.json');
 const publication=await one(db,`SELECT COUNT(*) AS c FROM tz101_publication_input_shadow`);
 const decisions=await one(db,`SELECT COUNT(*) AS c FROM final_decision_integration_shadow`);
 const horizons=await q(db,`SELECT horizon,COUNT(*) AS c FROM opportunity_shadow_outcome GROUP BY horizon ORDER BY horizon`);
 const r005={status:Number(publication?.c||0)>0?'POSSIBLE_FACTUAL_PUBLICATION_RECEIPT_PRESENT':'PARTIAL_NO_FACTUAL_PUBLICATION_INPUT_RECEIPT',publication_input_rows:Number(publication?.c||0)};
 const r007={status:'PARTIAL_OWNER_AUTH_RECEIVED_BUT_FACTUAL_FEE_HOLDING_RECEIPT_NOT_INVENTED',owner_authorized:true,publication_input_rows:Number(publication?.c||0)};
 const r008={status:'PARTIAL_CRITICAL_SOURCE_CLASSIFICATION_REQUIRES_FACTUAL_RECEIPT_CLOSURE',owner_authorized:true};
 const r017={status:live?.r017?.status==='CLOSED'?'CLOSED_RUNTIME_FILTER_AND_LIVE_HISTORY':'PARTIAL_LIVE_MONTHLY_HISTORY_PROOF',live:live?.r017??null};
 const r027={status:'PARTIAL_PRODUCT_INVOCATION_BINDING_OUTSIDE_REPO_RUNTIME'};
 const r042={status:live?.r042?.status==='CLOSED'?'CLOSED_DOMAIN_CONTRACT':'PARTIAL_DOMAIN_CONTRACT',closed_count:live?.r042?.closed_count??null,explicit_missing_count:live?.r042?.explicit_missing_count??null};
 const hset=new Set(horizons.map(x=>String(x.horizon)));const r051={status:hset.has('15m')&&hset.has('30m')&&Number(decisions?.c||0)>0&&Number(publication?.c||0)>0?'CLOSED_FACTUAL_STORAGE':'PARTIAL_MEASUREMENT_SUPPORT_ADDED_WAITING_FACTUAL_ROWS',horizons,decision_rows:Number(decisions?.c||0),publication_input_rows:Number(publication?.c||0),validation_status:validation?.r051??null};
 const r071={status:process.env.REPORT2_ALCHEMY_API_KEY?'PARTIAL_KEY_PRESENT_LIVE_PROBE_NOT_PROMOTED':'BLOCKED_KEY_NOT_CONFIGURED',key_present:Boolean(process.env.REPORT2_ALCHEMY_API_KEY)};
 const r078={status:'PARTIAL_BOUNDED_ALLOWLIST_FETCHER_IMPLEMENTED_PROJECT_ALLOWLIST_NOT_CONFIGURED'};
 const r083={status:funnel?.status??'PARTIAL_REPLAY_OUTPUT_UNAVAILABLE',funnel};
 const r092={status:'PARTIAL_SAFE_PROTECTION_SUBSET_TO_BE_APPLIED_BY_OWNER_LAUNCHER_AFTER_CI'};
 const r093={status:stats?.calibration_ready===true?'CLOSED_CALIBRATION_SUBSTRATE_READY':'PARTIAL_CALIBRATION_NOT_READY',statistics:stats};
 const usage=typeof db.usageSnapshot==='function'?db.usageSnapshot():null;if(usage&&(Number(usage.rows_written)!==0||Number(usage.unknown_ops)!==0))throw new Error('CONSOLIDATED_AUDIT_NOT_READ_ONLY');
 const requirements={R005:r005,R007:r007,R008:r008,R017:r017,R027:r027,R042:r042,R048:r048,R051:r051,R056:r056,R071:r071,R078:r078,R083:r083,R084:r084,R092:r092,R093:r093};
 const out={version:'consolidated-remaining-audit-v1-20260925',status:'CLOSED_READ_ONLY_AUDIT',requirements,d1_usage:usage,safety:{production_writes:false,d1_writes:false,telegram_send:false,trading:false,threshold_autotune:false,probability_enabled:false}};
 fs.writeFileSync(process.env.REPORT2_CONSOLIDATED_AUDIT_OUTPUT||'consolidated-remaining-audit.json',JSON.stringify(out,null,2)+'\n');
 console.log('CONSOLIDATED_REMAINING_AUDIT',JSON.stringify({status:out.status,requirements:Object.fromEntries(Object.entries(requirements).map(([k,v])=>[k,v.status])),d1_usage:usage}));
}
main().catch(e=>{console.error('CONSOLIDATED_REMAINING_AUDIT_FATAL',String(e?.stack||e));process.exit(1);});
