import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {pathToFileURL} from 'node:url';

const PREFIX='checkpoints/source-worker-bridge-transport-correlation-20261022';
const NOW=1792678800000,HEADER='x-report2-request-id';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const uid=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
const known=(r=2,w=1)=>({rows_read:r,rows_written:w,measured:true});
const response=(result,usage,status=200,ok=true)=>({status,ok:status>=200&&status<300,text:async()=>JSON.stringify({ok,result,usage,...(!ok?{error:'CONTROLLED_STATUS_FAILURE'}:{})})});
const stripIDs=x=>Array.isArray(x)?x.map(stripIDs):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>k!=='client_request_id').map(([k,v])=>[k,stripIDs(v)])):x;
function inventory(root,relative=''){
 return fs.readdirSync(path.join(root,relative),{withFileTypes:true}).flatMap(e=>{
  assert.ok(!e.isSymbolicLink(),'NO_RUNTIME_SYMLINK');const p=path.join(relative,e.name);
  if(e.isDirectory())return inventory(root,p);assert.ok(e.isFile());const b=fs.readFileSync(path.join(root,p));
  return[{path:p.split(path.sep).join('/'),bytes:b.length,sha256:sha(b)}];
 }).sort((a,b)=>a.path.localeCompare(b.path));
}
async function load(args){
 const root=fs.realpathSync(args.runtime_root),base=fs.realpathSync(args.baseline_runtime_root),repo=fs.realpathSync(args.repo_root);
 assert.notEqual(root,base);assert.notEqual(path.basename(root),'src','ASSEMBLED_ROOT_NOT_SRC');assert.notEqual(path.basename(base),'src');
 const pkg=path.join(repo,PREFIX),bindings=json(path.join(pkg,'target-bindings.json')),deps=json(path.join(pkg,'dependencies.json'));
 for(const pin of json(path.join(pkg,'manifest.json')).payloads){const b=fs.readFileSync(path.join(pkg,pin.path));assert.equal(b.length,pin.bytes);assert.equal(sha(b),pin.sha256);}
 const a=inventory(root),b=inventory(base),am=new Map(a.map(x=>[x.path,x])),bm=new Map(b.map(x=>[x.path,x]));
 assert.equal(a.length,618);assert.equal(b.length,618);assert.deepEqual(a.map(x=>x.path),b.map(x=>x.path));
 const targets=new Set(Object.values(bindings.targets).map(x=>x.runtime_path));assert.equal(targets.size,2);
 for(const x of a)if(!targets.has(x.path))assert.deepEqual(x,bm.get(x.path),'ALL616_NON_TARGET_FILES_EQUAL');
 for(const [source,pin]of Object.entries(bindings.targets)){
  const before=fs.readFileSync(path.join(base,pin.runtime_path)),after=fs.readFileSync(path.join(root,pin.runtime_path));
  assert.equal(before.length,pin.before_bytes);assert.equal(sha(before),pin.before_sha256);assert.equal(after.length,pin.after_bytes);assert.equal(sha(after),pin.after_sha256);
  assert.deepEqual(after,fs.readFileSync(path.join(pkg,pin.proposed)),'EXACT_FULL_PROPOSED_TARGET');
 }
 for(const [p,h]of Object.entries(deps.runtime_pins)){assert.equal(am.get(p)?.sha256,h);assert.equal(bm.get(p)?.sha256,h);}
 for(const [p,h]of Object.entries(deps.repo_pins))assert.equal(sha(fs.readFileSync(path.join(repo,p))),h);
 const sdk=await import(pathToFileURL(path.join(root,'report2-d1-adapter.mjs')).href),old=await import(pathToFileURL(path.join(base,'report2-d1-adapter.mjs')).href);
 const journal=await import(pathToFileURL(path.join(root,'native-query-cost-journal.mjs')).href),oldJournal=await import(pathToFileURL(path.join(base,'native-query-cost-journal.mjs')).href);
 return{sdk,old,journal,oldJournal,binding:{runtime_files:618,non_target_equal:616,actual_root_not_src:true,all_pins_before_imports:true,targets:bindings.targets,actual_full_retained_and_private_modules:true,old_case_import_or_call:0}};
}

// NEW affected callable only. No registration or invocation at module load.
export async function runBridgeClientCorrelationConnected(args){
 const savedNow=Date.now,savedFetch=globalThis.fetch,savedUUID=crypto.randomUUID;
 const groups=[];let api,uuidCalls=0,serial=0,unexpectedHTTP=0;
 const add=(name,variants=1,detail={})=>groups.push({name,variants,status:'NEW_BRIDGE_CLIENT_CONTROLLED_ASSERTIONS_COMPLETED',...detail});
 const setUUID=f=>{crypto.randomUUID=()=>{uuidCalls++;return f();};syncBuiltinESMExports();};
 const resetUUID=()=>setUUID(()=>uid(++serial));
 function make(SDK,{optin=true,grant=()=>({allowed:true}),fetcher}={}){
  const calls=[],admissions=[];
  const db=new SDK.RemoteD1Database('https://CONTROLLED.invalid/bridge','CONTROLLED_TOKEN_NOT_REAL',{
   nativeQueryReceipts:optin,nativeQueryClock:()=>NOW,timeoutMs:1000,
   beforeRequest:grant===null?undefined:async event=>{admissions.push({...event});return grant(event);},
   fetchImpl:async(url,options)=>{
    const wire=JSON.parse(options.body);calls.push({url,headers:{...options.headers},body:options.body,wire,signal:options.signal});
    if(fetcher)return fetcher(wire,options,calls.length);
    const usage=wire.op==='batch'?{statements:wire.statements.map(()=>known())}:known();
    return response({CONTROLLED_RESULT:true},usage);
   }
  });return{db,calls,admissions};
 }
 const all=f=>f.db.prepare(' SELECT  value FROM controlled_table WHERE code = ? ').bind('CONTROLLED_BOUND_VALUE').all();
 try{
  Date.now=()=>NOW;globalThis.fetch=async()=>{unexpectedHTTP++;throw Error('UNEXPECTED_NETWORK');};
  api=await load(args);resetUUID();
  // 1. Six original wire/result forms, journaling OFF: no UUID generation/header.
  const invoke=[f=>f.db.prepare('SELECT value FROM controlled_table').first(),all,f=>f.db.prepare('UPDATE controlled_table SET value=?').bind(3).run(),f=>f.db.prepare('SELECT value FROM controlled_table').raw({columnNames:true}),f=>f.db.exec('CREATE TABLE controlled_table(value INTEGER)'),f=>f.db.batch([f.db.prepare('SELECT 1'),f.db.prepare('SELECT 2')])];
  for(const call of invoke){const a=make(api.old,{optin:false}),b=make(api.sdk,{optin:false}),start=uuidCalls;assert.deepEqual(await call(a),await call(b));assert.deepEqual(a.calls.map(x=>({headers:x.headers,body:x.body})),b.calls.map(x=>({headers:x.headers,body:x.body})));assert.deepEqual(a.admissions,b.admissions);assert.deepEqual(a.db.usageSnapshot(),b.db.usageSnapshot());assert.equal(b.db.nativeQueryCostReceipts(),null);assert.equal(uuidCalls,start);assert.equal(Object.hasOwn(b.calls[0].headers,HEADER),false);if(b.calls[0].wire.op==='first')assert.equal(b.calls[0].wire.column,null);}
  add('LEGACY_OFF_SIX_WIRE_FORMS_HEADERS_BODY_OUTPUT_USAGE_EXACT',invoke.length);
  // 2. ID generated only after existing admission, no response echo required.
  const order=[];setUUID(()=>{order.push('uuid');return uid(++serial);});
  let f=make(api.sdk,{grant:()=>{order.push('admit');return{allowed:true};},fetcher:()=>{order.push('fetch');return response({CONTROLLED_RESULT:true},known());}});await all(f);
  assert.deepEqual(order,['admit','uuid','fetch']);assert.equal(f.calls.length,1);assert.ok(UUID.test(f.calls[0].headers[HEADER]));assert.equal(Object.hasOwn(f.calls[0].wire,'client_request_id'),false);
  let snap=f.db.nativeQueryCostReceipts();assert.equal(snap.receipts[0].client_request_id,f.calls[0].headers[HEADER]);assert.equal(snap.receipts[0].wire_sql_sha256,sha(f.calls[0].wire.sql));assert.equal(snap.receipts[0].unknown,false);assert.equal(f.db.usageSnapshot().requests,1);resetUUID();
  add('ONE_ID_AFTER_ADMISSION_HEADER_AND_RETAINED_JOURNAL_NO_ECHO_OR_BODY_FIELD');
  // 3. Local denial/throw never creates transport or fake native unknown.
  for(const grant of [()=>({allowed:false}),()=>{throw Error('CONTROLLED_LOCAL_DENIAL');}]){f=make(api.sdk,{grant});const n=uuidCalls;await assert.rejects(all(f));assert.equal(uuidCalls,n);assert.equal(f.calls.length,0);assert.equal(f.db.usageSnapshot().unknown_ops,0);assert.equal(f.db.nativeQueryCostReceipts().attempted_statements,0);}
  add('LOCAL_DENIAL_OR_THROW_BEFORE_UUID_AND_IO',2);
  // 4. Including undefined/null: SDK cannot accidentally take standalone legacy default.
  const invalid=[undefined,null,'',uid(1).toUpperCase().replace('00000000','ABCDEF00'),'00000000-0000-1000-8000-000000000001',17,{},' '+uid(1)];
  for(const value of invalid){setUUID(()=>value);f=make(api.sdk);await assert.rejects(all(f),/D1_CLIENT_REQUEST_ID_INVALID/);assert.equal(f.calls.length,0);assert.equal(f.admissions.length,1);assert.deepEqual(f.db.usageSnapshot(),{requests:0,rows_read:0,rows_written:0,unknown_ops:0,targets:{}});assert.equal(f.db.nativeQueryCostReceipts().attempted_statements,0);}
  setUUID(()=>{throw Error('CONTROLLED_UUID_FAILURE');});f=make(api.sdk);await assert.rejects(all(f),/CONTROLLED_UUID_FAILURE/);assert.equal(f.calls.length,0);assert.equal(f.admissions.length,1);assert.equal(f.db.usageSnapshot().unknown_ops,0);resetUUID();
  add('UUID_THROW_OR_INVALID_FAILS_BEFORE_ATTEMPT_NO_REFUND_OR_FAKE_UNKNOWN',invalid.length+1);
  // 5. Three repeated-hash batch members after a prior transport: rank, not sequence.
  f=make(api.sdk);await all(f);const SQL=['SELECT ? AS same','SELECT ? AS same',' SELECT ? AS same '];await f.db.batch(SQL.map((s,i)=>f.db.prepare(s).bind(i)));
  snap=f.db.nativeQueryCostReceipts();const id=f.calls[1].headers[HEADER],rows=snap.receipts.filter(x=>x.client_request_id===id);
  assert.equal(rows.length,3);assert.deepEqual(rows.map(x=>x.sequence),[2,3,4]);assert.deepEqual(rows.map(x=>x.transport_sequence),[2,2,2]);assert.deepEqual(rows.map(x=>x.wire_sql_sha256),f.calls[1].wire.statements.map(x=>sha(x.sql)));assert.equal(f.calls[1].wire.statements[2].sql,SQL[2].trim());assert.equal(rows[0].wire_sql_sha256,rows[1].wire_sql_sha256);assert.equal(rows[0].wire_sql_sha256,rows[2].wire_sql_sha256);assert.notEqual(id,f.calls[0].headers[HEADER]);assert.equal(f.calls.length,2);
  add('PER_BATCH_SHARED_ID_REPEATED_SQL_HASH_ORDER_ZERO_BASE_RANK_NOT_GLOBAL_SEQUENCE',3);
  // 6. Concurrent requests settle in the reverse order without identity mixing.
  let ready,waiting=[];const both=new Promise(resolve=>{ready=resolve;});
  f=make(api.sdk,{fetcher:(wire,options)=>new Promise(resolve=>{waiting.push({wire,options,resolve});if(waiting.length===2)ready();})});
  const pending=[f.db.prepare('SELECT 101').all(),f.db.prepare('SELECT 202').all()];await both;waiting[1].resolve(response({second:true},known()));await pending[1];waiting[0].resolve(response({first:true},known()));await pending[0];
  const ids=f.calls.map(x=>x.headers[HEADER]);assert.equal(new Set(ids).size,2);snap=f.db.nativeQueryCostReceipts();assert.deepEqual(snap.receipts.map(x=>x.client_request_id),[ids[1],ids[0]]);assert.deepEqual(snap.receipts.map(x=>x.transport_sequence),[2,1]);assert.equal(f.calls.length,2);
  add('CONCURRENT_DISTINCT_IDS_REVERSE_SETTLEMENT_NO_CROSS_ATTRIBUTION',2);
  // 7. Simulated loss before/after the controlled service applied an operation.
  for(const applied of [false,true]){let operations=0;f=make(api.sdk,{fetcher:(w,o,n)=>{if(n===1)return response({},known(17,3));if(applied)operations++;throw new TypeError('CONTROLLED_LOST_REPLY');}});await all(f);await assert.rejects(all(f),/CONTROLLED_LOST_REPLY/);snap=f.db.nativeQueryCostReceipts();const u=f.db.usageSnapshot();assert.equal(u.rows_read,17);assert.equal(u.rows_written,3);assert.equal(u.unknown_ops,1);assert.equal(operations,applied?1:0);assert.equal(f.calls.length,2);assert.equal(snap.receipts[1].client_request_id,f.calls[1].headers[HEADER]);assert.equal(snap.receipts[1].unknown,true);assert.equal(snap.receipts[1].rows_read,null);assert.equal(u.unmeasured_receipts[0].client_request_id,f.calls[1].headers[HEADER]);}
  add('LOSS_BEFORE_OR_AFTER_CONTROLLED_EXECUTION_RETAINS_ID_KNOWN_COSTS_AND_UNKNOWN',2);
  // 8. These four existing response paths keep original counters/result behavior.
  const failures=[()=>response(null,{rows_read:7,rows_written:null,measured:false},500,false),()=>({status:200,ok:true,text:async()=>'{INVALID'}),()=>({status:200,ok:true,text:async()=>{throw new TypeError('CONTROLLED_BODY_LOSS');}}),()=>response({partial:true},{rows_read:9,rows_written:null,measured:false})];
  for(const fail of failures){const a=make(api.old,{fetcher:fail}),b=make(api.sdk,{fetcher:fail});const settle=async x=>{try{return{result:await all(x)};}catch(e){return{error:String(e)};}};assert.deepEqual(await settle(a),await settle(b));assert.deepEqual(a.db.usageSnapshot(),stripIDs(b.db.usageSnapshot()));assert.deepEqual(a.db.nativeQueryCostReceipts(),stripIDs(b.db.nativeQueryCostReceipts()));assert.equal(b.calls.length,1);assert.equal(b.db.nativeQueryCostReceipts().receipts[0].client_request_id,b.calls[0].headers[HEADER]);assert.equal(b.db.usageSnapshot().unknown_ops,1);}
  add('STATUS_PARTIAL_INVALID_JSON_AND_BODY_LOSS_LEGACY_COUNTERS_EXACT',failures.length);
  // 9. Real existing AbortController timer, one controlled hanging fetch, no network.
  f=make(api.sdk,{fetcher:(wire,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{const error=new Error('CONTROLLED_ABORT');error.name='AbortError';reject(error);},{once:true}))});await assert.rejects(all(f),/D1_BRIDGE_TIMEOUT/);assert.equal(f.calls.length,1);assert.equal(f.db.nativeQueryCostReceipts().receipts[0].client_request_id,f.calls[0].headers[HEADER]);assert.equal(f.db.usageSnapshot().unknown_ops,1);assert.equal(f.db.usageSnapshot().unmeasured_receipts[0].failure_class,'BRIDGE_TIMEOUT');
  add('ACTUAL_EXISTING_TIMEOUT_ABORT_ONE_ATTEMPT_ID_RETAINED');
  // 10. Standalone omitted/null beginTransport API retains exact old field shapes.
  for(const value of [undefined,null]){const a=new api.oldJournal.NativeQueryCostJournal({binding:'CONTROLLED',clock:()=>NOW}),b=new api.journal.NativeQueryCostJournal({binding:'CONTROLLED',clock:()=>NOW}),as=a.beginTransport(value),bs=b.beginTransport(value);assert.deepEqual(as,bs);assert.deepEqual(a.endTransport(as),b.endTransport(bs));a.record({operation:'all',sql:'SELECT 1',usage:known(),transport:a.endTransport(as)});b.record({operation:'all',sql:'SELECT 1',usage:known(),transport:b.endTransport(bs)});assert.deepEqual(a.snapshot(),b.snapshot());}
  add('STANDALONE_JOURNAL_OMITTED_OR_NULL_ID_LEGACY_SHAPES_EXACT',2);
  // 11. Explicit valid field only; invalid nonNULL cannot consume sequence.
  const journal=new api.journal.NativeQueryCostJournal({binding:'CONTROLLED',clock:()=>NOW});for(const v of ['',17,{},uid(1).toUpperCase().replace('00000000','ABCDEF00'),'00000000-0000-4000-7000-000000000001'])assert.throws(()=>journal.beginTransport(v),/NATIVE_QUERY_CLIENT_REQUEST_ID_INVALID/);
  const start=journal.beginTransport(uid(777));assert.equal(start.transport_sequence,1);const end=journal.endTransport(start);journal.record({operation:'all',sql:'SELECT 1',usage:known(),transport:end});assert.equal(journal.snapshot().receipts[0].client_request_id,uid(777));assert.equal(Object.hasOwn(journal.endTransport({client_request_id:'INVALID'}),'client_request_id'),false);const copy=journal.snapshot();copy.receipts[0].client_request_id='MUTATED';assert.equal(journal.snapshot().receipts[0].client_request_id,uid(777));
  add('STANDALONE_EXPLICIT_UUID_VALIDATION_CONDITIONAL_FIELDS_AND_SNAPSHOT_COPY',7);
  // 12. Known512 then thirteen losses: first10 unknown IDs survive journal overflow.
  async function overflow(SDK){const x=make(SDK,{fetcher:(wire,opts,n)=>{if(wire.op==='batch')return response([], {statements:wire.statements.map(()=>known(1,0))});throw new TypeError('CONTROLLED_OVERFLOW_LOSS');}});for(const size of [100,100,100,100,100,12])await x.db.batch(Array.from({length:size},()=>x.db.prepare('SELECT 1')));assert.equal(x.db.nativeQueryCostReceipts().overflow,false);for(let i=0;i<13;i++)await assert.rejects(all(x));return x;}
  const oa=await overflow(api.old),ob=await overflow(api.sdk),os=ob.db.nativeQueryCostReceipts(),ou=ob.db.usageSnapshot();assert.equal(os.attempted_statements,525);assert.equal(os.recorded_statements,512);assert.equal(os.max_recorded_statements,512);assert.equal(os.overflow,true);assert.equal(ou.unmeasured_receipts.length,10);assert.equal(ou.unknown_ops,13);assert.equal(ob.calls.length,19);assert.deepEqual(oa.db.usageSnapshot(),stripIDs(ou));assert.deepEqual(oa.db.nativeQueryCostReceipts(),stripIDs(os));assert.deepEqual(ou.unmeasured_receipts.map(x=>x.client_request_id),ob.calls.slice(6,16).map(x=>x.headers[HEADER]));assert.equal(os.receipts.some(x=>x.client_request_id===ob.calls[6].headers[HEADER]),false);assert.equal(new Set(ou.unmeasured_receipts.map(x=>x.client_request_id)).size,10);
  add('MAX512_JOURNAL_OVERFLOW_FIRST10_UNKNOWN_IDS_RETAINED_LATER_OMISSION_HONEST',2,{max_journal:512,max_unknown_carrier:10,all_run_correlation_claimed:false});
  // 13. Exact actual rewritten wire SQL remains the hash basis, not normalized SQL.
  const rewriteSQL=' SELECT evidence_json FROM full_evidence_shadow_log INDEXED BY controlled_index WHERE contract_code = ? ';
  const ra=make(api.old),rb=make(api.sdk);for(const x of [ra,rb])x.db.enableRetainedHistory({fetch_impl:async()=>{throw Error('NO_ARCHIVE_HTTP');}});assert.deepEqual(await ra.db.prepare(rewriteSQL).bind('CONTROLLED').all(),await rb.db.prepare(rewriteSQL).bind('CONTROLLED').all());assert.equal(ra.calls[0].body,rb.calls[0].body);assert.notEqual(rb.calls[0].wire.sql,rewriteSQL);assert.equal(rb.db.nativeQueryCostReceipts().receipts[0].wire_sql_sha256,sha(rb.calls[0].wire.sql));assert.equal(rb.db.nativeQueryCostReceipts().receipts[0].sql_sha256,sha(rewriteSQL.replace(/\s+/g,' ').trim()));assert.equal(rb.calls.length,1);
  add('ACTUAL_EXISTING_RETAINED_REWRITE_EXACT_SENT_SQL_HASH_NO_ARCHIVE_IO');
  // 14. No gate is invented, no UUID/SQL/params/result/rawerror leak in metadata.
  f=make(api.sdk,{grant:null,fetcher:()=>response({payload:'CONTROLLED_SECRET_RESULT'},known())});await f.db.prepare("SELECT ? AS controlled_value /* CONTROLLED_SECRET_SQL */").bind('CONTROLLED_SECRET_PARAM').all();snap=f.db.nativeQueryCostReceipts();const text=JSON.stringify(snap);for(const secret of ['CONTROLLED_TOKEN_NOT_REAL','CONTROLLED.invalid','CONTROLLED_SECRET_RESULT','CONTROLLED_SECRET_PARAM','CONTROLLED_SECRET_SQL'])assert.equal(text.includes(secret),false);assert.equal(f.admissions.length,0);assert.equal(f.calls.length,1);assert.equal(snap.additional_SQL,0);assert.equal(snap.contains_SQL_params_or_results,false);assert.ok(UUID.test(snap.receipts[0].client_request_id));assert.equal(unexpectedHTTP,0);
  add('OPTIONAL_ADMISSION_API_UNCHANGED_METADATA_ONLY_NO_SENSITIVE_VALUES_OR_NEW_IO');
  assert.equal(groups.length,14);
  return{schema:'BRIDGE_CLIENT_CORRELATION_CONNECTED_V1',status:'NEW_CONTROLLED_CLIENT_CORRELATION_COMPLETED',controlled_groups:groups.length,nested_variants:groups.reduce((n,g)=>n+g.variants,0),groups,binding:api.binding,actual_new_and_old_SDK_and_journal:true,fixtures_CONTROLLED:true,additional_request_per_transport:0,additional_SQL:0,provider_HTTP:0,native_SQL:0,MAIN:0,Telegram:0,old_components_replayed:0,client_ID_is_admission_or_dedupe:false,unknown_reset:false,oldUTC22unknown_recovered:false,server_bridge_installed:false,server_cost_or_native_admission_qualified:false,whole_run_correlation_guaranteed:false,author_semantics:0};
 }catch(error){error.completed_new_bridge_client_groups=groups;error.old_completed_components_must_not_replay=true;throw error;}
 finally{crypto.randomUUID=savedUUID;syncBuiltinESMExports();Date.now=savedNow;globalThis.fetch=savedFetch;}
}
