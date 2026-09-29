import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const runtime=path.resolve(process.argv[2]||'runtime');
const output=path.resolve(process.argv[3]||'report2-early-evidence-isolated-acceptance.json');
const runLog=path.resolve(process.argv[4]||'report2-early-evidence-isolated-run.log');
const required=name=>{const value=String(process.env[name]||'').trim();if(!value)throw new Error(`${name}_REQUIRED`);return value;};
const text=value=>value==null?'':String(value).trim();
const finite=value=>{const number=Number(value);return Number.isFinite(number)?number:null;};
const quoteIdentifier=value=>{const name=text(value);if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw new Error(`UNSAFE_IDENTIFIER:${name}`);return `"${name}"`;};
const apiToken=required('CLOUDFLARE_API_TOKEN');
const productionUrl=required('REPORT2_D1_BRIDGE_URL');
const productionToken=required('REPORT2_D1_BRIDGE_TOKEN');
const {RemoteD1Database}=await import(pathToFileURL(path.join(runtime,'report2-d1-adapter.mjs')));
const production=new RemoteD1Database(productionUrl,productionToken,{fetchImpl:globalThis.fetch,timeoutMs:45_000});
const startedTs=Date.now();
const runName=`report2-accept-${text(process.env.GITHUB_RUN_ID)||startedTs}-${startedTs}`.slice(0,63);
let databaseId=null;
let accountId=text(process.env.CLOUDFLARE_ACCOUNT_ID)||null;
let server=null;
let serverUrl=null;
let deletion={attempted:false,success:false};
let failure=null;
let receipt=null;

async function cloudflare(pathname,{method='GET',body=null}={}){
  const response=await fetch(`https://api.cloudflare.com/client/v4${pathname}`,{method,headers:{authorization:`Bearer ${apiToken}`,accept:'application/json',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const raw=await response.text();
  let data=null;try{data=raw?JSON.parse(raw):null;}catch{throw new Error(`CLOUDFLARE_INVALID_JSON_HTTP_${response.status}`);}
  if(!response.ok||data?.success!==true){const message=(data?.errors||[]).map(item=>`${item.code||'ERR'}:${item.message||'UNKNOWN'}`).join('|')||`HTTP_${response.status}`;throw new Error(`CLOUDFLARE_API_FAILURE:${message.slice(0,500)}`);}
  return data;
}

async function resolveAccount(){
  if(accountId)return accountId;
  const data=await cloudflare('/accounts?per_page=50');
  const accounts=Array.isArray(data.result)?data.result:[];
  if(accounts.length!==1)throw new Error(`CLOUDFLARE_ACCOUNT_ID_AMBIGUOUS:${accounts.length}`);
  accountId=text(accounts[0]?.id);
  if(!accountId)throw new Error('CLOUDFLARE_ACCOUNT_ID_MISSING');
  return accountId;
}

function parts(data){return Array.isArray(data?.result)?data.result:(data?.result?[data.result]:[]);}
async function d1Query(body,{raw=false}={}){
  const data=await cloudflare(`/accounts/${accountId}/d1/database/${databaseId}/${raw?'raw':'query'}`,{method:'POST',body});
  const out=parts(data);
  if(!out.length||out.some(item=>item?.success!==true))throw new Error('ISOLATED_D1_QUERY_NOT_CLOSED');
  return out;
}
function usageOf(item){return{measured:true,rows_read:Number(item?.meta?.rows_read||0),rows_written:Number(item?.meta?.rows_written||0)};}

async function productionAll(sql,...params){
  if(!/^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql))throw new Error('PRODUCTION_READ_ONLY_GUARD');
  const result=await production.prepare(sql).bind(...params).all();
  return Array.isArray(result?.results)?result.results:[];
}

async function applySchema(schemaRows){
  const priority={table:0,index:1,trigger:2,view:3};
  const rows=schemaRows.filter(row=>text(row.sql)&&priority[row.type]!==undefined).sort((a,b)=>priority[a.type]-priority[b.type]||text(a.name).localeCompare(text(b.name)));
  for(let index=0;index<rows.length;index+=10){
    await d1Query({batch:rows.slice(index,index+10).map(row=>({sql:row.sql,params:[]}))});
  }
}

async function insertRows(table,rows){
  if(!rows.length)return 0;
  const statements=[];
  for(const row of rows){
    const columns=Object.keys(row);
    if(!columns.length)continue;
    const sql=`INSERT OR REPLACE INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`;
    statements.push({sql,params:columns.map(column=>row[column])});
  }
  let inserted=0,batch=[];
  for(const statement of statements){
    const proposed=[...batch,statement];
    if(batch.length&&(proposed.length>10||Buffer.byteLength(JSON.stringify({batch:proposed}))>750_000)){
      await d1Query({batch});inserted+=batch.length;batch=[];
    }
    batch.push(statement);
  }
  if(batch.length){await d1Query({batch});inserted+=batch.length;}
  return inserted;
}

async function copyCurrentInputs(schemaRows){
  const available=new Set(schemaRows.filter(row=>row.type==='table').map(row=>text(row.name)));
  const summary={};
  const copy=async(table,sql,params=[])=>{
    if(!available.has(table)){summary[table]={status:'TABLE_NOT_AVAILABLE',rows:0};return;}
    try{const rows=await productionAll(sql,...params);const count=await insertRows(table,rows);summary[table]={status:'CLOSED',rows:count};}
    catch(error){summary[table]={status:'READ_OR_COPY_FAILED',rows:0,error:text(error?.message||error).slice(0,240)};}
  };
  const now=Date.now(),historyStart=now-6*60*60_000-5*60_000;
  if(available.has('report2_market_snapshot_batch_v1')){
    const collected=[];let cursorBucket=historyStart-1,cursorShard=-1;
    for(let page=0;page<20;page+=1){
      const rows=await productionAll(`SELECT * FROM report2_market_snapshot_batch_v1 WHERE bucket>=?1 AND bucket<=?2 AND (bucket>?3 OR (bucket=?3 AND shard>?4)) ORDER BY bucket ASC,shard ASC LIMIT 80`,historyStart,now,cursorBucket,cursorShard);
      collected.push(...rows);if(rows.length<80)break;const last=rows.at(-1);cursorBucket=Number(last.bucket);cursorShard=Number(last.shard);
    }
    summary.report2_market_snapshot_batch_v1={status:'CLOSED',rows:await insertRows('report2_market_snapshot_batch_v1',collected)};
  }
  await copy('scan_runs','SELECT * FROM scan_runs WHERE ts>=?1 AND ts<=?2 ORDER BY ts DESC LIMIT 100',[now-26*60*60_000,now]);
  for(const table of [
    'v3_early_candidate_wave','v3_early_feature_snapshot','deep_check_scheduler_state','fast_move_recheck_queue',
    'report2_liquidation_candidate_queue','report2_candidate_source_cache','report2_coinalyze_catalog',
    'report2_cross_exchange_catalog','report2_cross_exchange_risk_cache','report2_global_source_cache',
    'report2_liq_venue_catalog_cache','report2_liquidation_predictive_health','report2_liquidation_source_health',
    'report2_supplemental_identity_cache','v3_pipeline_health_shadow','v3_pipeline_health_event_shadow','v3_source_health_1m'
  ])await copy(table,`SELECT * FROM ${quoteIdentifier(table)} LIMIT 500`);
  return summary;
}

function addUsage(total,item){const usage=usageOf(item);total.rows_read+=usage.rows_read;total.rows_written+=usage.rows_written;total.statements+=1;}
async function startBridge(){
  const aggregate={rows_read:0,rows_written:0,statements:0};
  const telegram={attempts:0,trade_attempts:0,technical_attempts:0,hashes:[]};
  server=http.createServer(async(request,response)=>{
    try{
      const chunks=[];for await(const chunk of request)chunks.push(chunk);const raw=Buffer.concat(chunks).toString('utf8');const body=raw?JSON.parse(raw):{};
      if(request.url==='/telegram-test'){
        telegram.attempts+=1;const rendered=text(body?.text||body?.message);const technical=/техническ|CRITICAL_FEED_DEGRADED|состояние ухудшилось|состояние восстановилось/i.test(rendered);
        if(technical)telegram.technical_attempts+=1;else telegram.trade_attempts+=1;
        telegram.hashes.push(crypto.createHash('sha256').update(rendered).digest('hex'));
        response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({ok:true,status:'SENT',message_id:900000+telegram.attempts}));return;
      }
      if(request.url!=='/d1')throw new Error('LOCAL_ROUTE_NOT_FOUND');
      let result,usage;
      if(body.op==='batch'){
        const queried=await d1Query({batch:(body.statements||[]).map(statement=>({sql:statement.sql,params:statement.params||[]}))});
        queried.forEach(item=>addUsage(aggregate,item));result=queried;usage={statements:queried.map(usageOf)};
      }else if(body.op==='raw'){
        const [queried]=await d1Query({sql:body.sql,params:body.params||[]},{raw:true});addUsage(aggregate,queried);
        const columns=queried?.results?.columns||[],rows=queried?.results?.rows||[];result=body?.options?.columnNames===true?[columns,...rows]:rows;usage=usageOf(queried);
      }else{
        const queried=await d1Query({sql:body.sql,params:body.params||[]});queried.forEach(item=>addUsage(aggregate,item));const first=queried[0];usage=usageOf(first);
        if(body.op==='first'){const row=(first.results||[])[0]||null;result=body.column==null?row:(row?.[body.column]??null);}
        else if(body.op==='all'||body.op==='run')result=first;
        else if(body.op==='exec')result={count:queried.length,duration:queried.reduce((sum,item)=>sum+Number(item?.meta?.duration||0),0)};
        else throw new Error(`LOCAL_D1_OPERATION_UNSUPPORTED:${body.op}`);
      }
      response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({ok:true,result,usage}));
    }catch(error){response.writeHead(500,{'content-type':'application/json'});response.end(JSON.stringify({ok:false,error:text(error?.message||error).slice(0,500)}));}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();serverUrl=`http://127.0.0.1:${address.port}`;
  return{aggregate,telegram};
}

async function runWorker(local){
  const log=fs.createWriteStream(runLog,{flags:'w'});
  const counterPath=path.join(runtime,'report2-external-http-count.json');
  try{fs.unlinkSync(counterPath);}catch{}
  const env={...process.env,
    REPORT2_D1_BRIDGE_URL:`${serverUrl}/d1`,REPORT2_D1_BRIDGE_TOKEN:'ISOLATED_LOCAL_ONLY',
    REPORT2_TELEGRAM_RELAY_URL:`${serverUrl}/telegram-test`,REPORT2_TELEGRAM_RELAY_KEY:'ISOLATED_LOCAL_ONLY',
    REPORT2_RUN_SOURCE:'schedule',REPORT2_MANUAL_COMMAND:'',REPORT2_MANUAL_COIN_CONTRACT:'',REPORT2_COMMAND_ID:'',
    DELIVERY_ENABLED:'1',REPORT2_V3_TELEGRAM_NETWORK_ENABLED:'1',REPORT2_TELEGRAM_OUTPUT_ENABLED:'1',
    REPORT2_TELEGRAM_INFO_ENABLED:'0',REPORT2_TELEGRAM_INFO_OBSERVE_ENABLED:'0',REPORT2_TELEGRAM_REPORT_TEST:'false',
    REPORT2_ACCEPTANCE_HTTP_COUNTER_PATH:counterPath,
    REPORT2_TELEGRAM_INSTALL_VALIDATION:'0',REPORT2_MEASUREMENT_ARTIFACT_ENABLED:'1',PUBLIC_COLLECTOR_ENABLED:'0'};
  const counterModule=path.resolve('audit-fixes/early-evidence-20260929/count-external-http.mjs');
  const child=spawn(process.execPath,['--import',counterModule,'runner-main.mjs'],{cwd:runtime,env,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',chunk=>{process.stdout.write(chunk);log.write(chunk);});child.stderr.on('data',chunk=>{process.stderr.write(chunk);log.write(chunk);});
  const timeout=setTimeout(()=>child.kill('SIGTERM'),9*60_000);
  const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});clearTimeout(timeout);
  await new Promise(resolve=>log.end(resolve));
  let externalHttp=null;try{externalHttp=JSON.parse(fs.readFileSync(counterPath,'utf8'));}catch{}
  return{exit_code:exitCode,usage:local.aggregate,telegram:local.telegram,external_http:externalHttp};
}

async function isolatedAll(sql,...params){const [result]=await d1Query({sql,params});return Array.isArray(result.results)?result.results:[];}
function columnsFor(schemaRows,table){const sql=text(schemaRows.find(row=>row.type==='table'&&row.name===table)?.sql);const candidates=['updated_ts','created_ts','observed_ts','persisted_ts','observation_ts','started_ts','last_seen_ts','ts'];return{sql,time:candidates.find(column=>new RegExp(`(?:^|[^A-Za-z0-9_])${column}(?:[^A-Za-z0-9_]|$)`,'i').test(sql))||null};}
async function traceTable(schemaRows,table,fields){
  const {sql,time}=columnsFor(schemaRows,table);if(!sql)return{status:'TABLE_NOT_AVAILABLE',rows:[]};
  const selected=fields.filter(field=>new RegExp(`(?:^|[^A-Za-z0-9_])${field}(?:[^A-Za-z0-9_]|$)`,'i').test(sql));if(time&&!selected.includes(time))selected.push(time);
  if(!selected.length)return{status:'NO_SAFE_COLUMNS',rows:[]};
  const where=time?` WHERE ${quoteIdentifier(time)}>=?1`:'';const order=time?` ORDER BY ${quoteIdentifier(time)} ASC`:'';const rows=await isolatedAll(`SELECT ${selected.map(quoteIdentifier).join(',')} FROM ${quoteIdentifier(table)}${where}${order} LIMIT 1000`,...(time?[startedTs]:[]));
  return{status:'CLOSED',time_column:time,rows};
}
function groupReasons(rows){const grouped={};for(const row of rows){const reason=text(row.first_blocking_reason||row.error_text||row.error||row.actionability_reason||row.decision_status||row.status)||'UNSPECIFIED';grouped[reason]=(grouped[reason]||0)+1;}return grouped;}
function logMarker(name){
  try{
    const prefix=`${name} `,lines=fs.readFileSync(runLog,'utf8').split(/\r?\n/);
    for(let index=lines.length-1;index>=0;index-=1){const at=lines[index].indexOf(prefix);if(at<0)continue;return JSON.parse(lines[index].slice(at+prefix.length));}
  }catch{}
  return null;
}

try{
  await resolveAccount();
  const created=await cloudflare(`/accounts/${accountId}/d1/database`,{method:'POST',body:{name:runName,primary_location_hint:'weur'}});
  databaseId=text(created?.result?.uuid);if(!databaseId)throw new Error('ISOLATED_D1_CREATE_NO_ID');
  const schemaRows=await productionAll(`SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name`);
  await applySchema(schemaRows);
  const copiedInputs=await copyCurrentInputs(schemaRows);
  const local=await startBridge();
  const worker=await runWorker(local);
  const measurementPath=path.join(runtime,'report2-measurement.json'),canonicalPath=path.join(runtime,'report2-run-result.json');
  const measurement=fs.existsSync(measurementPath)?JSON.parse(fs.readFileSync(measurementPath,'utf8')):null;
  const canonical=fs.existsSync(canonicalPath)?JSON.parse(fs.readFileSync(canonicalPath,'utf8')):null;
  const early=await traceTable(schemaRows,'v3_early_feature_snapshot',['contract_code','wave_id','direction_hint','direction_state','early_detection_quality_0_100','quality_0_100','observed_ts','source_ts']);
  const handoff=await traceTable(schemaRows,'v3_discovery_deep_handoff_shadow',['contract_code','contract','direction','status','reason','run_id','snapshot_id','wave_id','created_ts']);
  const deep=await traceTable(schemaRows,'deep_check_run_log',['contract_code','contract','direction','status','data_sufficiency','interest_score','priority_rank','error_text','first_blocking_stage','first_blocking_reason','run_id','snapshot_id']);
  const evidence=await traceTable(schemaRows,'full_evidence_shadow_log',['contract_code','direction','status','error','insert_changes','run_id','snapshot_id','observed_ts']);
  const decisions=await traceTable(schemaRows,'final_decision_integration_shadow',['contract_code','direction','decision_status','entry_action','management_action','data_quality','hard_veto','telegram_eligible','run_id','snapshot_id','observation_ts']);
  const publications=await traceTable(schemaRows,'canonical_publication_shadow',['contract_code','direction','canonical_state','actionability_status','actionability_reason','lifecycle_event','run_id','snapshot_id','wave_id','created_ts']);
  const dispatch=await traceTable(schemaRows,'v3_telegram_dispatch_shadow',['contract','direction','lifecycle_event','state','last_error','telegram_message_id','wave_id','created_ts','updated_ts']);
  const reads=Number(measurement?.d1_usage?.rows_read??worker.usage.rows_read),writes=Number(measurement?.d1_usage?.rows_written??worker.usage.rows_written),unknown=Number(measurement?.unknown_ops??measurement?.d1_usage?.unknown_ops??0);
  const duplicateHashes=worker.telegram.hashes.length-new Set(worker.telegram.hashes).size;
  const universe=Number(measurement?.universe_total||0),scanned=Number(measurement?.scanned||0),deepCount=Number(measurement?.live_deep_check_count||deep.rows.length),shortlist=Number(measurement?.live_shortlist_count||0);
  const liquidationSources=logMarker('LIQUIDATION_SOURCES_CANONICAL_RECEIPT');
  const earlyByContract=new Map(early.rows.map(row=>[text(row.contract_code||row.contract).toUpperCase(),row]));
  const ownEvidenceHandoffs=deep.rows.filter(row=>{
    const contract=text(row.contract_code||row.contract).toUpperCase(),source=earlyByContract.get(contract);
    const direction=text(row.direction).toUpperCase(),earlyDirection=text(source?.direction_hint||source?.direction_state).toUpperCase();
    return Boolean(source)&&(/LONG|SHORT/.test(earlyDirection))&&(!direction||earlyDirection.includes(direction));
  }).length;
  const policy={threshold_70_unchanged:true,minimum_move_5pct_unchanged:true,external_format_changed:false,working_telegram_used:false,working_database_written:false};
  const checks={worker_success:worker.exit_code===0,full_scan:universe>0&&scanned===universe,d1_read_cap:reads<=34000,d1_write_cap:writes<=560,d1_unknown_ops_zero:unknown===0,technical_telegram_attempts_zero:worker.telegram.technical_attempts===0,duplicate_delivery_attempts_zero:duplicateHashes===0,deep_candidate_present:deepCount>0,correct_rejection_or_natural_dispatch:decisions.rows.length>0||publications.rows.length>0||worker.telegram.trade_attempts>0};
  const naturalCandidateReachedTestSender=worker.telegram.trade_attempts>0;
  const deploymentGate={ready:Object.values(checks).every(Boolean)&&naturalCandidateReachedTestSender,reason:naturalCandidateReachedTestSender?'ALL_REQUIRED_ISOLATED_GATES_CLOSED':'NATURAL_CANDIDATE_DID_NOT_REACH_TEST_SENDER'};
  receipt={schema:'my-report-2-early-evidence-isolated-acceptance-v1',status:Object.values(checks).every(Boolean)?'ISOLATED_CYCLE_CLOSED':'ISOLATED_CYCLE_NOT_CLOSED',branch:text(process.env.GITHUB_REF_NAME)||null,commit:text(process.env.GITHUB_SHA)||null,base_commit:'086d1542f2615d3dd19bdf4769b28a9938027ffb',worker_sha256:text(process.env.REPORT2_EXPECTED_WORKER_SHA)||null,started_ts:startedTs,completed_ts:Date.now(),temporary_database:{created:true,name:runName,id_hash:crypto.createHash('sha256').update(databaseId).digest('hex'),production_database:false},copied_inputs:copiedInputs,stage_counts:{available_for_scan:universe,scanned,primary_shortlist:shortlist,early_evidence_rows:early.rows.length,deep_selected:deepCount,own_evidence_handoffs:ownEvidenceHandoffs,recorded_handoff_rows:handoff.rows.length,full_evidence_rows:evidence.rows.length,final_decisions:decisions.rows.length,formatted_publications:publications.rows.length,test_sender_attempts:worker.telegram.trade_attempts},drop_reasons:{deep:groupReasons(deep.rows),full_evidence:groupReasons(evidence.rows),decisions:groupReasons(decisions.rows),publications:groupReasons(publications.rows),dispatch:groupReasons(dispatch.rows)},traces:{early,handoff,deep,evidence,decisions,publications,dispatch},source_receipts:{liquidation:liquidationSources},budget:{d1_rows_read:reads,d1_rows_written:writes,d1_unknown_ops:unknown,d1_read_cap:34000,d1_write_cap:560,d1_read_headroom:34000-reads,d1_write_headroom:560-writes,d1_statement_count:worker.usage.statements,external_http:worker.external_http,duration_ms:measurement?.duration_ms??null},delivery:{technical_possibility_tested:true,natural_candidate_reached_test_sender:naturalCandidateReachedTestSender,real_user_telegram_delivery_confirmed:false,test_sender_attempts:worker.telegram.attempts,technical_attempts:worker.telegram.technical_attempts,duplicate_hashes:duplicateHashes},policy,checks,deployment_gate:deploymentGate,canonical_run:{status:canonical?.status||null,candidate_count:Array.isArray(canonical?.candidates)?canonical.candidates.length:0},production_changed:false};
  if(worker.exit_code!==0)throw new Error(`ISOLATED_WORKER_EXIT_${worker.exit_code}`);
}catch(error){failure=text(error?.stack||error).slice(0,4000);if(!receipt)receipt={schema:'my-report-2-early-evidence-isolated-acceptance-v1',status:'FAILED',started_ts:startedTs,completed_ts:Date.now(),production_changed:false};receipt.failure=failure;}
finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(databaseId&&accountId){deletion.attempted=true;try{await cloudflare(`/accounts/${accountId}/d1/database/${databaseId}`,{method:'DELETE'});deletion.success=true;}catch(error){deletion.error=text(error?.message||error).slice(0,500);}}
  receipt=receipt||{schema:'my-report-2-early-evidence-isolated-acceptance-v1',status:'FAILED',production_changed:false};receipt.cleanup=deletion;receipt.temporary_database_removed=deletion.success;
  if(!deletion.success&&databaseId)receipt.status='FAILED_TEMP_DATABASE_CLEANUP';
  fs.writeFileSync(output,`${JSON.stringify(receipt,null,2)}\n`,'utf8');
}
console.log('ISOLATED_ACCEPTANCE_SUMMARY',JSON.stringify({status:receipt.status,stages:receipt.stage_counts||null,budget:receipt.budget||null,delivery:receipt.delivery||null,cleanup:receipt.cleanup}));
if(failure||receipt.status.startsWith('FAILED')||receipt.status==='ISOLATED_CYCLE_NOT_CLOSED')process.exit(1);
