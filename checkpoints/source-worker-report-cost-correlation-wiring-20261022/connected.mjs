import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const PREFIX='checkpoints/source-worker-report-cost-correlation-wiring-20261022';
const NOW=1792682400000,ID='R2RUN:1792682400000:0123456789abcdef';
const HEADER='x-report2-request-id',ARTIFACT='report2-failure-accounting.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const stripIDs=v=>Array.isArray(v)?v.map(stripIDs):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>k!=='client_request_id').map(([k,x])=>[k,stripIDs(x)])):v;
function inventory(root,rel=''){
 return fs.readdirSync(path.join(root,rel),{withFileTypes:true}).flatMap(e=>{
  assert.ok(!e.isSymbolicLink(),'NO_RUNTIME_SYMLINK');const p=path.join(rel,e.name);
  if(e.isDirectory())return inventory(root,p);assert.ok(e.isFile());const b=fs.readFileSync(path.join(root,p));return[{path:p.split(path.sep).join('/'),bytes:b.length,sha256:sha(b)}];
 }).sort((a,b)=>a.path.localeCompare(b.path));
}
function cut(text,start,end){assert.equal(text.split(start).length,2);assert.equal(text.split(end).length,2);return text.slice(text.indexOf(start),text.indexOf(end));}
async function load(args){
 const root=fs.realpathSync(args.runtime_root),base=fs.realpathSync(args.baseline_runtime_root),repo=fs.realpathSync(args.repo_root);
 assert.notEqual(root,base);assert.notEqual(path.basename(root),'src','ASSEMBLED_ROOT_NOT_SRC');assert.notEqual(path.basename(base),'src');
 const pkg=path.join(repo,PREFIX),binding=json(path.join(pkg,'target-bindings.json')),deps=json(path.join(pkg,'dependencies.json'));
 for(const pin of json(path.join(pkg,'manifest.json')).payloads){const b=fs.readFileSync(path.join(pkg,pin.path));assert.equal(b.length,pin.bytes);assert.equal(sha(b),pin.sha256);}
 const a=inventory(root),b=inventory(base),am=new Map(a.map(x=>[x.path,x])),bm=new Map(b.map(x=>[x.path,x]));
 assert.equal(a.length,618);assert.equal(b.length,618);assert.deepEqual(a.map(x=>x.path),b.map(x=>x.path));
 for(const x of a)if(x.path!==binding.runtime_path)assert.deepEqual(x,bm.get(x.path),'ALL617_OTHER_FILES_EQUAL');
 const before=fs.readFileSync(path.join(base,binding.runtime_path)),after=fs.readFileSync(path.join(root,binding.runtime_path));
 assert.equal(before.length,binding.before_bytes);assert.equal(sha(before),binding.before_sha256);assert.equal(after.length,binding.after_bytes);assert.equal(sha(after),binding.after_sha256);
 assert.equal(before.toString().split(binding.literal_before).length,2);assert.equal(after.toString(),before.toString().replace(binding.literal_before,binding.literal_after),'ONLY_REAL_CALLER_FLAG');
 for(const [p,h]of Object.entries(deps.runtime_pins)){assert.equal(am.get(p)?.sha256,h);assert.equal(bm.get(p)?.sha256,h);}
 for(const [p,h]of Object.entries(deps.repo_pins))assert.equal(sha(fs.readFileSync(path.join(repo,p))),h);
 const buildBefore=cut(before.toString(),binding.build_start,binding.build_end),buildAfter=cut(after.toString(),binding.build_start,binding.build_end);
 assert.equal(sha(buildBefore),binding.build_before_sha256);assert.equal(sha(buildAfter),binding.build_after_sha256);
 const fatal=cut(after.toString(),binding.failure_start,binding.failure_end);assert.equal(Buffer.byteLength(fatal),binding.failure_bytes);assert.equal(sha(fatal),binding.failure_sha256);assert.equal(fatal,cut(before.toString(),binding.failure_start,binding.failure_end));
 for(const text of [before.toString(),after.toString()])assert.equal(text.split(binding.factory_call).length,2);
 assert.equal(sha(binding.factory_call),binding.factory_call_sha256);
 // All application imports and extracted real fragments come AFTER all full-tree/byte pins.
 const sdk=await import(pathToFileURL(path.join(root,'report2-d1-adapter.mjs')).href),oldSDK=await import(pathToFileURL(path.join(base,'report2-d1-adapter.mjs')).href);
 const account=await import(pathToFileURL(path.join(root,'src/failed-d1-run-accounting.mjs')).href),budget=await import(pathToFileURL(path.join(root,'d1-preaction-budget-guard.mjs')).href);
 const build=(SDK,source,fetcher)=>Function('RemoteD1Database','envText','nativeFetch',source+'\nreturn buildEnv();')(SDK.RemoteD1Database,(name)=>name==='REPORT2_D1_BRIDGE_URL'?'https://CONTROLLED.invalid/bridge':name==='REPORT2_D1_BRIDGE_TOKEN'?'CONTROLLED_TOKEN_NOT_REAL':name==='BYKARANTELI_API_KEY'?'CONTROLLED_KEY_NOT_REAL':'',fetcher);
 const accounting=env=>Function('createFailedD1RunAccounting','env','d1ReservationId','process','started','finalizeRunUsage','let failedD1RunAccounting;'+binding.factory_call+'return failedD1RunAccounting;')(account.createFailedD1RunAccounting,env,ID,{env:{GITHUB_RUN_ID:'CONTROLLED_ORDINARY_RUN'}},NOW,budget.finalizeRunUsage);
 const exporter=Function('failedD1RunAccounting','error','fs','canonicalOutputForFailure','markPostAnalysisControlFailure','console','return(async()=>{'+fatal+'})();');
 return{sdk,oldSDK,budget,accounting,exporter,buildOld:f=>build(oldSDK,buildBefore,f),buildNew:f=>build(sdk,buildAfter,f),binding:{runtime_files:618,non_target_equal:617,ROOT_not_SRC:true,all_pins_before_application_imports:true,target:binding,actualSDK_and_journal_unchanged:true,actual_accounting_and_finalizer:true,actual_buildEnv_and_fatal_block_extracted:true,full_MAIN_imported_or_called:false,old_case_import_or_call:0}};
}

// One NEW affected callable. No registration, autorun, old components or full MAIN.
export async function runOrdinaryCallerCostCorrelationConnected(args){
 const savedNow=Date.now,savedFetch=globalThis.fetch,groups=[];let unexpectedHTTP=0;
 const add=(name,details={})=>groups.push({name,status:'NEW_ORDINARY_CALLER_CONTROLLED_ASSERTIONS_COMPLETED',...details});
 try{
  Date.now=()=>NOW;globalThis.fetch=async()=>{unexpectedHTTP++;throw Error('UNEXPECTED_NETWORK_DENIED');};
  const api=await load(args);
  const make=(candidate,{loss=false}={})=>{
   const calls=[];const fetcher=async(url,options)=>{
    const wire=JSON.parse(options.body);calls.push({url,headers:{...options.headers},body:options.body,wire});
    if(loss&&calls.length===2)throw new TypeError('CONTROLLED_ORDINARY_REPLY_LOST');
    const finalization=wire.op==='run';
    return{status:200,ok:true,text:async()=>JSON.stringify({ok:true,result:finalization?{meta:{changes:1}}:{results:[{CONTROLLED:true}]},usage:{rows_read:finalization?1:17,rows_written:finalization?1:3,measured:true}})};
   };
   const env=candidate?api.buildNew(fetcher):api.buildOld(fetcher);return{env,db:env.DATA_DB,calls};
  };
  const query=f=>f.db.prepare('SELECT ? AS CONTROLLED_RESULT FROM controlled_input').bind('CONTROLLED_PARAM_NOT_REAL').all();
  const comparable=calls=>calls.map(c=>({url:c.url,headers:Object.fromEntries(Object.entries(c.headers).filter(([k])=>k!==HEADER)),body:c.body}));
  async function failure(f,{sinkFails=false}={}){
   const accounting=api.accounting(f.env),writes=[],logs=[];
   const sink={writeFile:async(name,text)=>{writes.push({name,text});if(sinkFails)throw Error('CONTROLLED_FS_FAILURE');}};
   const error={partial_cron_failure:{status:'CONTROLLED_PARTIAL',checked:99}};
   await api.exporter(accounting,error,sink,null,()=>{throw Error('UNREACHED_CANONICAL_BRANCH');},{error:(...v)=>logs.push(v)});
   return{accounting,writes,logs,artifact:writes.length?JSON.parse(writes[0].text):null};
  }
  // 1. Actual ordinary buildEnv constructor now opts in; no constructor transport.
  let a=make(false),b=make(true);const nonDB=e=>Object.fromEntries(Object.entries(e).filter(([k])=>k!=='DATA_DB'));
  assert.deepEqual(nonDB(a.env),nonDB(b.env));assert.equal(a.db.timeoutMs,45000);assert.equal(b.db.timeoutMs,45000);assert.equal(a.calls.length+b.calls.length,0);
  assert.equal(a.db.nativeQueryCostReceipts(),null);assert.equal(b.db.nativeQueryCostReceipts().recorded_statements,0);assert.deepEqual(a.db.usageSnapshot(),b.db.usageSnapshot());
  add('ACTUAL_ORDINARY_CONSTRUCTOR_OPTIN_ONLY_NO_CONSTRUCTION_IO');
  // 2. Actual ctor -> unchanged SDK known reply. Only header/journal metadata added.
  const ar=await query(a),br=await query(b);assert.deepEqual(ar,br);assert.deepEqual(comparable(a.calls),comparable(b.calls));assert.deepEqual(a.db.usageSnapshot(),b.db.usageSnapshot());assert.equal(a.calls.length,1);assert.equal(b.calls.length,1);
  assert.equal(Object.hasOwn(a.calls[0].headers,HEADER),false);assert.equal(b.db.nativeQueryCostReceipts().receipts[0].client_request_id,b.calls[0].headers[HEADER]);assert.equal(b.db.usageSnapshot().rows_read,17);assert.equal(b.db.usageSnapshot().rows_written,3);assert.equal(b.db.usageSnapshot().unknown_ops,0);
  add('ACTUAL_CALLER_KNOWN_COST_RESULT_WIRE_AND_REQUEST_COUNT_UNCHANGED');
  // 3. Same real loss follows known cost; existing factory/finalizer/fatal JSON keeps ID.
  a=make(false,{loss:true});b=make(true,{loss:true});
  for(const f of [a,b]){await query(f);await assert.rejects(query(f),/CONTROLLED_ORDINARY_REPLY_LOST/);}
  const lossID=b.calls[1].headers[HEADER],before=b.db.usageSnapshot();assert.equal(before.unmeasured_receipts.length,1);assert.equal(before.unmeasured_receipts[0].client_request_id,lossID);assert.equal(before.unmeasured_receipts[0].http_status,null);
  assert.deepEqual(a.db.usageSnapshot(),stripIDs(before));assert.equal(before.rows_read,17);assert.equal(before.rows_written,3);assert.equal(before.unknown_ops,1);
  const af=await failure(a),bf=await failure(b);assert.equal(af.writes.length,1);assert.equal(bf.writes.length,1);assert.equal(bf.writes[0].name,ARTIFACT);assert.equal(bf.artifact.status,'FAILED_RUN_NATIVE_USAGE_FINALIZED');
  assert.deepEqual(stripIDs(bf.artifact),af.artifact);assert.deepEqual(comparable(a.calls),comparable(b.calls));assert.equal(b.calls.length,3);assert.equal(b.calls[2].wire.op,'run');
  assert.equal(bf.artifact.usage_before.unmeasured_receipts[0].client_request_id,lossID);assert.equal(bf.artifact.usage_after.unmeasured_receipts[0].client_request_id,lossID);assert.equal(bf.artifact.usage_after.rows_read,18);assert.equal(bf.artifact.usage_after.rows_written,4);assert.equal(bf.artifact.unknown_ops_preserved,1);assert.equal(bf.artifact.reservation_never_reduced,true);
  assert.equal(bf.artifact.receipt.reservation_id,ID);assert.equal(bf.artifact.receipt.unknown_ops,1);assert.deepEqual(bf.artifact.partial_cron_failure,{status:'CONTROLLED_PARTIAL',checked:99});
  const text=bf.writes[0].text;for(const secret of ['CONTROLLED_TOKEN_NOT_REAL','CONTROLLED_KEY_NOT_REAL','CONTROLLED_PARAM_NOT_REAL','SELECT ? AS','https://CONTROLLED.invalid','CONTROLLED_ORDINARY_REPLY_LOST'])assert.equal(text.includes(secret),false);
  assert.equal(Object.hasOwn(bf.artifact,'native_query_cost_journal'),false);assert.equal((await bf.accounting.finalizeFailure()).status,'ALREADY_FINALIZED');assert.equal(b.calls.length,3);
  add('LOSS_ID_THROUGH_REAL_FACTORY_FINALIZER_AND_EXISTING_FATAL_JSON',{artifact:ARTIFACT,controlled_wire_attempts:3,existing_finalization_UPDATE_attempts:1,artifact_sha256:sha(text),artifact_bytes:Buffer.byteLength(text),unknown_preserved:1,additional_export_fields:0,new_full512_export:false});
  // 4. Same DB unknown fence denies optional SQL and the existing finalizer before wire.
  b=make(true,{loss:true});await query(b);await assert.rejects(query(b));const held=b.db.usageSnapshot();let guardCalls=0;
  b.db.beforeRequest=()=>{guardCalls++;return api.budget.evaluateWithinRunReservation({reservation:{rows_read:54000,rows_written:840},currentUsage:b.db.usageSnapshot(),extraRowsRead:1,extraRowsWritten:1});};
  assert.equal(api.budget.evaluateWithinRunReservation({reservation:{rows_read:54000,rows_written:840},currentUsage:held}).status,'UNMEASURED_D1_USAGE');
  await assert.rejects(query(b),/D1_LOCAL_HTTP_ADMISSION_DENIED/);const fenced=await failure(b);
  assert.equal(fenced.artifact.status,'FAILURE_FINALIZATION_NOT_ACKNOWLEDGED');assert.deepEqual(fenced.artifact.usage_before,held);assert.deepEqual(fenced.artifact.usage_after,held);assert.equal(fenced.artifact.reservation_never_reduced,true);assert.equal(fenced.artifact.native_cost_not_guessed,true);assert.equal(b.calls.length,2);assert.equal(guardCalls,2);assert.equal(fenced.artifact.usage_before.unmeasured_receipts[0].client_request_id,b.calls[1].headers[HEADER]);
  add('ACTUAL_UNKNOWN_GUARD_SAME_DB_FAILURE_ARTIFACT_NO_FOLLOWING_WIRE',{optional_and_finalizer_denied:2,controlled_wire_attempts:2,unknown_preserved:1});
  // 5. Actual existing fs-error branch: attempt != durable artifact; no retry/extra SQL.
  b=make(true,{loss:true});await query(b);await assert.rejects(query(b));const failedSink=await failure(b,{sinkFails:true});
  assert.equal(failedSink.writes.length,1);assert.equal(b.calls.length,3);assert.ok(failedSink.logs.some(row=>row[0]==='REPORT2_FAILURE_ACCOUNTING_ARTIFACT_NOT_CLOSED'));assert.equal(failedSink.artifact.unknown_ops_preserved,1);assert.equal(failedSink.artifact.usage_before.unmeasured_receipts[0].client_request_id,b.calls[1].headers[HEADER]);
  assert.equal((await failedSink.accounting.finalizeFailure()).status,'ALREADY_FINALIZED');assert.equal(b.calls.length,3);assert.equal(unexpectedHTTP,0);
  add('EXISTING_FATAL_SINK_FAILURE_RETAINS_ACCOUNTING_NO_RETRY_NO_DURABILITY_CLAIM',{artifact_write_attempts:1,artifact_durable:false});
  assert.equal(groups.length,5);
  return{schema:'ORDINARY_CALLER_COST_CORRELATION_CONNECTED_V1',status:'NEW_ORDINARY_CALLER_CONTROLLED_COMPLETED',controlled_groups:groups.length,groups,binding:api.binding,CONTROLLED_replies_and_counters:true,existing_failure_writer_memory_sink:true,source_author_semantics:0,old_components_replayed:0,additional_SQL_or_HTTP_per_existing_operation:0,new_512_export:false,first10_unknown_bound_unchanged:true,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,installed_bridge_or_logging_changed:false,oldUTC22unknown_recovered:false,native_cost_saving_or_daygrant:false,fs_durability_qualified:false,SENT:false};
 }catch(error){error.completed_new_ordinary_caller_groups=groups;error.old_completed_components_must_not_replay=true;throw error;}
 finally{Date.now=savedNow;globalThis.fetch=savedFetch;}
}
