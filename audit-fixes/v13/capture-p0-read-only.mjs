import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const runtime=path.resolve(process.argv[2]||'runtime');
const output=path.resolve(process.argv[3]||'report2-v13-p0-read-only.json');
const {RemoteD1Database}=await import(pathToFileURL(path.join(runtime,'report2-d1-adapter.mjs')));
const required=name=>{const value=String(process.env[name]||'').trim();if(!value)throw new Error(`${name}_REQUIRED`);return value;};
const db=new RemoteD1Database(required('REPORT2_D1_BRIDGE_URL'),required('REPORT2_D1_BRIDGE_TOKEN'),{fetchImpl:globalThis.fetch,timeoutMs:45_000});
const START_TS=1790370000000; // 26.09.2026 00:00 MSK
const CONTROL_END_TS=1790626260000; // 28.09.2026 23:11 MSK
const END_TS=1790629200000; // 29.09.2026 00:00 MSK
const tables=[
  'v3_telegram_dispatch_shadow','canonical_publication_shadow','v3_early_candidate_wave','v3_early_feature_snapshot',
  'deep_check_run_log','full_evidence_shadow_log','v3_dispatch_publication_binding_shadow','v3_user_lifecycle_shadow',
  'final_decision_integration_shadow','report2_runner_budget_ledger_shadow','cron_runs','scan_runs',
];
const text=v=>v===null||v===undefined?'':String(v).trim();
const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const all=async(sql,...args)=>{const result=await db.prepare(sql).bind(...args).all();return Array.isArray(result?.results)?result.results:[];};
const shaFile=file=>fs.existsSync(file)?crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null;
const schemaRows=await all(`SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') AND name NOT LIKE 'sqlite_%' ORDER BY type,name`);
const tableSql=new Map(schemaRows.filter(row=>row.type==='table').map(row=>[text(row.name),text(row.sql)]));
const has=(table,column)=>new RegExp(`(?:^|[^A-Za-z0-9_])${column}(?:[^A-Za-z0-9_]|$)`,'i').test(tableSql.get(table)||'');
const timeColumn=table=>['created_ts','updated_ts','observed_ts','persisted_ts','observation_ts','started_ts','ts'].find(column=>has(table,column))||null;
const safeFields=(table,candidates)=>candidates.filter(column=>has(table,column));
const readTable=async(table,candidates,{limit=500,contracts=null}={})=>{
  if(!tableSql.has(table))return{table,status:'TABLE_NOT_AVAILABLE',time_column:null,columns:[],rows:[]};
  const fields=safeFields(table,candidates);
  const tc=timeColumn(table);
  if(!fields.length||!tc)return{table,status:'SCHEMA_NOT_COMPATIBLE',time_column:tc,columns:fields,rows:[]};
  const contractColumn=['contract_code','contract'].find(column=>has(table,column))||null;
  const where=[`${tc}>=?1`,`${tc}<=?2`];
  const args=[START_TS,END_TS];
  if(contractColumn&&Array.isArray(contracts)&&contracts.length){
    const placeholders=contracts.map((_,i)=>`?${i+3}`).join(',');
    where.push(`${contractColumn} IN (${placeholders})`);args.push(...contracts);
  }
  const selected=[...new Set([...fields,tc])];
  try{
    const rows=await all(`SELECT ${selected.join(',')} FROM ${table} WHERE ${where.join(' AND ')} ORDER BY ${tc} ASC LIMIT ${Math.max(1,Math.min(1000,Number(limit)||500))}`,...args);
    return{table,status:'CLOSED',time_column:tc,columns:selected,rows};
  }catch(error){return{table,status:'READ_FAILED',time_column:tc,columns:selected,error:text(error?.message||error).slice(0,240),rows:[]};}
};

const dispatch=await readTable('v3_telegram_dispatch_shadow',[
  'dispatch_id','idempotency_key','contract','direction','wave_id','lifecycle_event','rules_version','state','decision_id',
  'message_hash','telegram_message_id','last_error','created_ts','updated_ts','sent_ts','shadow_only',
],{limit:1000});
const canonical=await readTable('canonical_publication_shadow',[
  'publication_id','contract_code','direction','run_id','snapshot_id','wave_id','decision_id','observed_ts','valid_until_ts',
  'lifecycle_event','canonical_state','analytical_fingerprint','canonical_json','actionability_status','actionability_reason','created_ts','bound_ts','shadow_only',
],{limit:1000});
const waves=await readTable('v3_early_candidate_wave',[
  'contract_code','wave_id','direction_hint','direction_state','lifecycle_stage','early_detection_quality_0_100','feature_observed_ts',
  'first_seen_ts','last_seen_ts','evidence_refs_json','evidence_json','feature_json','created_ts','updated_ts','shadow_only',
],{limit:1000});
const features=await readTable('v3_early_feature_snapshot',[
  'snapshot_id','run_id','contract_code','wave_id','direction_hint','direction_state','observed_ts','source_ts','available_at',
  'computed_at','quality_0_100','early_detection_quality_0_100','feature_json','evidence_json','evidence_refs_json','created_ts','updated_ts','shadow_only',
],{limit:1000});
const deep=await readTable('deep_check_run_log',[
  'run_id','snapshot_id','contract_code','contract','direction','status','data_sufficiency','interest_score','priority_rank',
  'started_ts','completed_ts','created_ts','updated_ts','error_text','first_blocking_stage','first_blocking_reason',
],{limit:1000});
const evidence=await readTable('full_evidence_shadow_log',[
  'run_id','snapshot_id','contract_code','direction','status','error','insert_changes','observed_ts','created_ts','persisted_ts','receipt_id','content_digest',
],{limit:1000});
const bindings=await readTable('v3_dispatch_publication_binding_shadow',[
  'publication_id','dispatch_id','idempotency_key','contract_code','contract','direction','run_id','snapshot_id','wave_id','observed_ts',
  'analytical_fingerprint','presentation_hash','created_ts','updated_ts',
],{limit:1000});
const lifecycle=await readTable('v3_user_lifecycle_shadow',[
  'contract','direction','wave_id','rules_version','status','reason','observation_ts','valid_until_ts','updated_ts','shadow_only',
],{limit:1000});
const decisions=await readTable('final_decision_integration_shadow',[
  'decision_id','run_id','snapshot_id','contract_code','direction','decision_status','entry_action','management_action','data_quality',
  'hard_veto','shadow_only','telegram_eligible','observation_ts','persisted_ts','created_ts','updated_ts','early_candidate','early_candidate_json',
],{limit:1000});
const budgets=await readTable('report2_runner_budget_ledger_shadow',[
  'reservation_id','source_run_id','status','measured_rows_read','measured_rows_written','measured_requests','unknown_ops','created_ts','updated_ts','finalized_ts',
],{limit:500});

function dayMsk(ts){const n=finite(ts);if(n===null)return'UNKNOWN';return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(n));}
function group(rows,keys){const out={};for(const row of rows){const key=keys.map(k=>text(row[k])||'NULL').join('|');out[key]=(out[key]||0)+1;}return out;}
function summarizeCanonical(row){
  let parsed=null;try{parsed=row.canonical_json?JSON.parse(row.canonical_json):null;}catch{}
  return{
    publication_id:row.publication_id??null,contract_code:row.contract_code??null,direction:row.direction??null,run_id:row.run_id??null,
    snapshot_id:row.snapshot_id??null,wave_id:row.wave_id??null,observed_ts:finite(row.observed_ts),created_ts:finite(row.created_ts),
    canonical_state:row.canonical_state??parsed?.state??null,actionability_status:row.actionability_status??null,actionability_reason:row.actionability_reason??null,
    early_candidate_present:Boolean(parsed?.early_candidate?.items?.length),interest:finite(parsed?.scores?.coin_interest_0_100),overall:finite(parsed?.scores?.overall_0_100),
    first_reason:text(parsed?.reasons?.[0]?.internal_code||parsed?.reasons?.[0]?.event||parsed?.reasons?.[0]?.label)||null,
    remaining_move_pct:finite(parsed?.metadata?.technical_move_potential?.potential_move_pct),analytical_fingerprint:row.analytical_fingerprint??null,
  };
}
const canonicalSummary=canonical.rows.map(summarizeCanonical);
const controlCanonical=canonicalSummary.filter(row=>(row.created_ts??row.observed_ts??0)<=CONTROL_END_TS);
const controlDispatch=dispatch.rows.filter(row=>(finite(row.created_ts)??finite(row.updated_ts)??0)<=CONTROL_END_TS);
const targetContracts=new Set(['AKE-USDT','NEAR-USDT','ARB-USDT']);
const targetRows={
  waves:waves.rows.filter(row=>targetContracts.has(text(row.contract_code))),
  features:features.rows.filter(row=>targetContracts.has(text(row.contract_code))),
  canonical:canonicalSummary.filter(row=>targetContracts.has(text(row.contract_code))),
};
const moduleRel=[
  'src/worker.js','src/v3-early-sidecar.mjs','src/early-candidate-bridge.mjs','src/canonical-runtime-adapter.mjs',
  'src/canonical-publication.mjs','src/publication-reconciler.mjs','src/v3-telegram-lifecycle-sidecar.mjs',
  'src/bound-telegram-delivery-sidecar.mjs','src/technical-move-potential.mjs','src/manual-report-formatter.mjs','src/telegram-compact-formatter.mjs',
];
const moduleHashes=Object.fromEntries(moduleRel.map(rel=>[rel,shaFile(path.join(runtime,rel))]));
const receipt={
  schema:'my-report-2-v13-p0-read-only-diagnostic-v1',captured_at:Date.now(),window:{start_ts:START_TS,control_end_ts:CONTROL_END_TS,end_ts:END_TS,time_zone:'Europe/Moscow'},
  changed_db:false,rows_written:0,secrets_included:false,recipient_identifiers_included:false,
  schema_inventory:{tables:Object.fromEntries(tables.map(name=>[name,{present:tableSql.has(name),sql:tableSql.get(name)||null}]))},
  control_counts:{
    dispatch_by_day_state_event:group(controlDispatch.map(row=>({...row,day:dayMsk(row.created_ts??row.updated_ts)})),['day','state','lifecycle_event']),
    canonical_by_day_state_actionability:group(controlCanonical.map(row=>({...row,day:dayMsk(row.created_ts??row.observed_ts)})),['day','canonical_state','actionability_status']),
    canonical_total:controlCanonical.length,canonical_without_early_candidate:controlCanonical.filter(row=>!row.early_candidate_present).length,
    dispatch_expired_not_sent:controlDispatch.filter(row=>text(row.state)==='EXPIRED_NOT_SENT').length,
  },
  target_contract_trace:targetRows,
  rows:{dispatch,canonical:{...canonical,rows:canonicalSummary},waves,features,deep,evidence,bindings,lifecycle,decisions,budgets},
  module_hashes:moduleHashes,d1_usage:db.usageSnapshot(),
};
if(receipt.d1_usage.unknown_ops!==0)throw new Error(`READ_ONLY_DIAGNOSTIC_USAGE_UNKNOWN:${receipt.d1_usage.unknown_ops}`);
if(receipt.d1_usage.rows_written!==0)throw new Error(`READ_ONLY_DIAGNOSTIC_WROTE_ROWS:${receipt.d1_usage.rows_written}`);
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,`${JSON.stringify(receipt,null,2)}\n`,'utf8');
console.log(JSON.stringify({status:'CLOSED_READ_ONLY',output:path.basename(output),schema_objects:schemaRows.length,canonical:canonicalSummary.length,dispatch:dispatch.rows.length,rows_read:receipt.d1_usage.rows_read,rows_written:receipt.d1_usage.rows_written,unknown_ops:receipt.d1_usage.unknown_ops}));
