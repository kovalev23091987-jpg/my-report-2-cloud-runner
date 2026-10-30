import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const PREFIX='checkpoints/source-worker-anomaly-parent-admission-20261021';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const NOW=1792608000000,DAY=new Date(NOW).toISOString().slice(0,10);
const ID=`R2RUN:${NOW}:0123456789abcdef`;
const POLICY=Object.freeze({origin:{rows_read:20,rows_written:0},write:{rows_read:30,rows_written:12},read:{rows_read:20,rows_written:0}});
function inventory(root,relative=''){
  return fs.readdirSync(path.join(root,relative),{withFileTypes:true}).flatMap(e=>{
    assert.ok(!e.isSymbolicLink(),'RUNTIME_SYMLINK_REFUSED');const rel=path.join(relative,e.name);
    if(e.isDirectory())return inventory(root,rel);
    assert.ok(e.isFile(),'RUNTIME_NONFILE_REFUSED');const b=fs.readFileSync(path.join(root,rel));
    return[{path:rel.split(path.sep).join('/'),bytes:b.length,sha256:sha(b)}];
  }).sort((a,b)=>a.path.localeCompare(b.path));
}

// Test-only factory; it neither calls a component nor creates a DB/HTTP client.
// Application modules are imported ONLY after every full-tree binding below.
export async function loadRunnerAnomalyParentCapability({runtime_root,baseline_runtime_root,repo_root}){
  const src=path.resolve(runtime_root),baseSrc=path.resolve(baseline_runtime_root),repo=path.resolve(repo_root);
  assert.equal(path.basename(src),'src');assert.equal(path.basename(baseSrc),'src');assert.notEqual(src,baseSrc);
  const root=path.dirname(src),base=path.dirname(baseSrc),pkg=path.join(repo,PREFIX);
  const recipe=json(path.join(pkg,'target-bindings.json')),bindings=json(path.join(pkg,'dependencies.json'));
  const a=inventory(root),b=inventory(base);assert.equal(a.length,617);assert.equal(b.length,617);
  const ma=new Map(a.map(x=>[x.path,x])),mb=new Map(b.map(x=>[x.path,x]));
  assert.deepEqual([...ma.keys()],[...mb.keys()]);
  for(const item of a){if(item.path!=='runner-main.mjs')assert.deepEqual(item,mb.get(item.path),'ALL_616_NON_TARGET_BYTES_MUST_MATCH');}
  assert.equal(ma.get('runner-main.mjs').sha256,recipe.after_sha256);assert.equal(mb.get('runner-main.mjs').sha256,recipe.before_sha256);
  for(const [p,pin] of Object.entries(bindings.runtime_pins)){
    assert.equal(ma.get(p)?.sha256,pin,'ACTUAL_ASSEMBLED_PIN_REQUIRED');assert.equal(mb.get(p)?.sha256,pin);
  }
  for(const [p,pin] of Object.entries(bindings.repo_fixture_pins))assert.equal(sha(fs.readFileSync(path.join(repo,p))),pin,'EXISTING_PUBLIC_FIXTURE_PIN');
  const block=fs.readFileSync(path.join(pkg,'runner-parent.insertion.txt'),'utf8');assert.equal(sha(block),recipe.insertion_sha256);
  const before=fs.readFileSync(path.join(base,'runner-main.mjs'),'utf8');
  assert.equal(before.split(recipe.insertion_before).length,2);assert.equal(before.split(recipe.callsite_before).length,2);
  const expected=recipe.imports_prefix+before.replace(recipe.insertion_before,block+'\n'+recipe.insertion_before).replace(recipe.callsite_before,recipe.callsite_after);
  assert.equal(expected,fs.readFileSync(path.join(root,'runner-main.mjs'),'utf8'),'ONLY_DECLARED_RUNNER_TEXT_RECIPE');
  assert.equal(sha(block),recipe.insertion_sha256);
  const kernel=await import(pathToFileURL(path.join(src,'anomaly-native-domain.mjs')).href);
  const guard=await import(pathToFileURL(path.join(root,'d1-preaction-budget-guard.mjs')).href);
  const http=await import(pathToFileURL(path.join(src,'unified-budget.mjs')).href);
  const adapter=await import(pathToFileURL(path.join(root,'report2-d1-adapter.mjs')).href);
  const lifecycle=await import(pathToFileURL(path.join(src,'v3-telegram-lifecycle-sidecar.mjs')).href);
  const delivery=await import(pathToFileURL(path.join(src,'bound-telegram-delivery-sidecar.mjs')).href);
  const build=new Function('crypto','Buffer','Date','readAnomalyOrigin','commitAnomalyBundle','ORIGIN_SQL','COMMIT_SQL','READBACK_SQL','evaluateWithinRunReservation','V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET','BOUND_TELEGRAM_DELIVERY_BUDGET',block+'\nreturn installRunnerAnomalyParentCapability;');
  const install=build(crypto,Buffer,Date,kernel.readAnomalyOrigin,kernel.commitAnomalyBundle,kernel.ORIGIN_SQL,kernel.COMMIT_SQL,kernel.READBACK_SQL,guard.evaluateWithinRunReservation,lifecycle.V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET,delivery.BOUND_TELEGRAM_DELIVERY_BUDGET);
  return{install,kernel,guard,http,adapter,binding:{runtime_files:a.length,non_target_equal:616,runner_before:recipe.before_sha256,runner_after:recipe.after_sha256,all_pins_before_imports:true}};
}

function controlledPrepared(kernel){
  const row={contract_code:'ZEC-USDT',symbol:'ZEC',pair:'ZEC-USDT',business_type:'swap',contract_type:'swap',trade_partition:'USDT',contract_status:1,create_date:'20200101',contract_size:1,price_tick:0.01};
  const descriptor=kernel.opaqueHtxDescriptor({metadata:{status:'ok',ts:NOW-10000,data:[row]},contract:'ZEC-USDT',observed_ts:NOW-9000,source_ref:'CONTROLLED_PARENT_CASE_NOT_NATIVE'});
  const original={instrument:{contract:'ZEC-USDT'},timeframe:'15m',event_start_ts:NOW-900000,event_end_ts:NOW-1000,first_known_ts:NOW-500};
  const card={...original,card_hash:kernel.digest(original)};
  const logical_event_id=kernel.opaqueLogicalEventKey(card,descriptor),plan=kernel.lockedOutcomePlan(card);
  const fp=kernel.digest('CONTROLLED_ORIGINAL_OBSERVATION');
  const state={evaluated_ts:NOW-100,watch:{active:true,next_check_ts:NOW+1000},last_snapshot:{ts:NOW-1000},revisions:[{observation_kind:'CAPTURED_CLOSED_WINDOW_FACTS_V1',observation_fingerprint:fp}],outcomes:Object.fromEntries(plan.cells.map(c=>[c.key,{target_ts:c.target_ts,status:'PENDING'}])),outbox:{},native_admission_qualified:false,event_first_knowledge_qualified:false,native_epoch_qualified:false};
  return kernel.prepareAnomalyCommit({logical_event_id,operation_id:'ANOMALY_INIT:'+kernel.digest(logical_event_id),expected_revision:0,card,descriptor,plan,state});
}

function fixture(DatabaseSync,api,repo,mode={}){
  const sqlite=new DatabaseSync(':memory:');
  // Existing public migration is a CONTROLLED local fixture, not installed native DDL.
  sqlite.exec(fs.readFileSync(path.join(repo,'current-generation/files/migrations/20261021_anomaly_domain.sql'),'utf8'));
  const wires=[],saved=[],known=[];let count=0;
  const db=new api.adapter.RemoteD1Database('https://controlled.invalid/d1','CONTROLLED_NO_NATIVE_TOKEN',{fetchImpl:async(url,req)=>{
    assert.equal(String(url),'https://controlled.invalid/d1');const p=JSON.parse(req.body);wires.push(p);count++;
    if(mode.failAt===count)throw Error('CONTROLLED_LOST_REPLY');
    let result;
    if(p.op==='first')result=sqlite.prepare(p.sql).get(...p.params)??null;
    else if(p.op==='run'){const r=sqlite.prepare(p.sql).run(...p.params);result={success:true,meta:{changes:Number(r.changes)}};}
    else throw Error('UNEXPECTED_CONTROLLED_SQL');
    saved.push(result);
    const usage={measured:mode.unknownAt!==count,rows_read:mode.overAt===count?31:2,rows_written:p.op==='run'?12:0};
    known.push(usage);
    mode.onReply?.(count);
    if(mode.snapshotThrowsAt===count){const native=db.usageSnapshot;db.usageSnapshot=()=>{throw Error('CONTROLLED_SNAPSHOT_THROW');};mode.restoreSnapshot=()=>{db.usageSnapshot=native;};}
    return new Response(JSON.stringify({ok:true,result,usage}),{status:200});
  }});
  const env={DATA_DB:db},reservation={rows_read:54000,rows_written:840},receipt={status:'RESERVED',reservation_id:ID,day_utc:DAY,...reservation},day_admission={allowed:true};
  const http_budget=api.http.createUnifiedHttpBudget({whole_job:164,hot:96,background:56,statistics:12});
  const calls=[];const reserve=http_budget.reserve;
  http_budget.reserve=x=>{calls.push({...x});if(mode.httpDenyAt===calls.length)return{allowed:false};if(mode.httpDuplicate)return{allowed:true,duplicate:true};return reserve(x);};
  const install=changes=>api.install({env,db,reservation,reservation_id:ID,receipt,day_admission,http_budget,post_v7:true,cost_bounds:POLICY,...changes});
  return{sqlite,db,env,reservation,receipt,day_admission,http_budget,calls,wires,saved,known,install,mode,close:()=>sqlite.close()};
}

// ONE future component. No registration/autorun, no old component invocation.
export async function runAnomalyParentAdmissionConnected(args){
  const api=await loadRunnerAnomalyParentCapability(args);
  const {DatabaseSync}=await import('node:sqlite');
  const oldNow=Date.now,oldFetch=globalThis.fetch;Date.now=()=>NOW;
  globalThis.fetch=async()=>{throw Error('GLOBAL_NATIVE_NETWORK_DENIED');};
  const groups=[];let active=null,capability=null;
  const add=(name,detail={})=>groups.push({name,status:'CONTROLLED_ASSERTIONS_COMPLETED',...detail});
  const fresh=(mode={})=>{active=fixture(DatabaseSync,api,path.resolve(args.repo_root),mode);return active;};
  const close=async()=>{if(capability)await capability.close();capability=null;if(active)active.close();active=null;};
  const prepared=controlledPrepared(api.kernel),id=prepared.request.logical_event_id;
  const input=()=>({logical_event_id:id,prepare_from_origin:origin=>{assert.equal(origin,null);return prepared;}});
  try{
    let f=fresh();const original=f.db._request,desc=Object.getOwnPropertyDescriptor(f.db,'_request'),observed=[];capability=f.install({on_receipt:async snapshot=>{observed.push(snapshot);}});
    assert.equal(capability.installed,true);assert.deepEqual(capability.protected_budget,{rows_read:9448,rows_written:244});
    let r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(r.status,'COMMITTED_RECEIPT_READBACK');assert.equal(r.effective_prepared,prepared);
    assert.deepEqual(f.wires.map(p=>p.sql),[api.kernel.ORIGIN_SQL,api.kernel.COMMIT_SQL,api.kernel.READBACK_SQL]);assert.equal(f.calls.length,3);assert.ok(f.calls.every(x=>x.lane==='statistics'&&x.attempts===1));
    const u=f.db.usageSnapshot();assert.equal(u.requests,3);assert.equal(u.rows_read,6);assert.equal(u.rows_written,12);assert.equal(u.unknown_ops,0);
    assert.equal(observed.length,1);const receipt=capability.receipts();assert.equal(receipt.records.length,1);assert.equal(receipt.records[0].status,'COMMITTED_RECEIPT_READBACK');assert.equal(receipt.records[0].operation_id,prepared.request.operation_id);assert.equal(receipt.records[0].request_sha256,prepared.request.request_sha256);assert.equal(receipt.records[0].card_sha256,prepared.request.card_sha256);assert.deepEqual(receipt.records[0].usage_after,{requests:3,rows_read:6,rows_written:12,unknown_ops:0});assert.ok(!JSON.stringify(receipt).includes(prepared.request.card_json));assert.ok(Buffer.byteLength(JSON.stringify(receipt))<=16384);
    await capability.close();assert.equal(f.db._request,original);assert.deepEqual(Object.getOwnPropertyDescriptor(f.db,'_request'),desc);assert.equal(Object.hasOwn(f.env,'REPORT2_ANOMALY_DOMAIN_COMMIT'),false);
    add('THREE_ACTUAL_RPC_AND_EXACT_PARENT_HTTP',{RPC:3,known_usage:u});await close();

    for(const bad of [undefined,{}, {origin:POLICY.origin,write:POLICY.write}, {...POLICY,write:{rows_read:'30',rows_written:12}},'{bad']){
      f=fresh();const request=f.db._request;capability=f.install({cost_bounds:bad});assert.equal(capability.installed,false);assert.equal(f.db._request,request);assert.equal(Object.hasOwn(f.env,'REPORT2_ANOMALY_DOMAIN_COMMIT'),false);assert.equal(f.wires.length,0);await close();
    }add('NO_NUMERIC_POLICY_NO_HOOK_OR_IO');

    for(const change of ['FINALIZED','WRONG_DAY','DAY_DENIED','NAMESPACE']){
      f=fresh();if(change==='FINALIZED')f.receipt.status='FINALIZED';if(change==='WRONG_DAY')f.receipt.day_utc='2026-10-20';if(change==='DAY_DENIED')f.day_admission.allowed=false;
      capability=f.install(change==='NAMESPACE'?{env:{DATA_DB:{}}}:{});if(capability.installed){r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(r.status,'ANOMALY_PARENT_NOT_ADMITTED');}assert.equal(f.wires.length,0);await close();
    }
    for(const n of [1,2]){
      f=fresh();f.mode.onReply=count=>{if(count===n)f.receipt.status='FINALIZED';};capability=f.install();r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(f.wires.length,n);assert.equal(f.db.usageSnapshot().unknown_ops,0);await close();
    }add('RECEIPT_DAY_FINALIZED_AND_SAME_NAMESPACE');

    for(const [rr,rw,expected] of [[54000-9448-70,840-244-12,3],[54000-9448-70+1,0,0],[0,840-244-12+1,0]]){
      f=fresh();f.db._usage.rows_read=rr;f.db._usage.rows_written=rw;capability=f.install();r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(f.wires.length,expected);assert.equal(f.db.usageSnapshot().rows_read,rr+(expected?6:0));await close();
    }add('EXACT_PARENT_R_W_BOUNDARIES_NO_CAP_RAISE');

    for(const n of [1,2,3]){
      f=fresh({httpDenyAt:n});capability=f.install();r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(f.wires.length,n-1);assert.equal(f.calls.length,n);assert.equal(f.db.usageSnapshot().unknown_ops,0);await close();
    }
    f=fresh({httpDuplicate:true});capability=f.install();r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(f.calls.length,1);assert.equal(f.wires.length,0);await close();
    f=fresh();const liveReserve=f.http_budget.reserve;f.http_budget.reserve=x=>{const grant=liveReserve(x);f.db._usage.requests++;f.db._usage.rows_read++;return grant;};capability=f.install();r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(f.wires.length,0);assert.equal(f.db.usageSnapshot().requests,1);assert.equal(f.http_budget.summary().used.statistics,1);await close();
    add('UNIFIED_STATISTICS_EACH_PHASE_REFUSAL');

    for(const n of [1,2,3]){
      f=fresh({unknownAt:n});capability=f.install();r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(f.wires.length,n);const usage=f.db.usageSnapshot();assert.ok(usage.unknown_ops>0);assert.equal(usage.rows_read,2*n);if(n>=2)assert.equal(usage.rows_written,12);
      const wireBefore=f.wires.length;await assert.rejects(f.db.prepare('SELECT 1').first(),/D1_LOCAL_HTTP_ADMISSION_DENIED|ANOMALY_NATIVE_USAGE_NOT_CLOSED/);assert.equal(f.wires.length,wireBefore);
      const metadata=capability.receipts().records.at(-1);assert.ok(metadata.last_reported_usage.unknown_ops>0);assert.equal(metadata.last_reported_usage.rows_read,2*n);assert.equal(metadata.usage_after,null);
      if(n>=2){assert.equal(r.effective_prepared,prepared);const again=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(again,r);assert.equal(f.wires.length,n);assert.equal(capability.retained_reconciliation()[0],r);}
      await capability.close();assert.equal((await f.db.beforeRequest()).allowed,false);const frozenUsage=f.db.usageSnapshot();await assert.rejects(api.guard.finalizeRunUsage(f.db,{reservationId:ID,sourceRunId:'CONTROLLED_PARENT_FINALIZER',now:NOW,usage:frozenUsage}),/D1_LOCAL_HTTP_ADMISSION_DENIED/);assert.equal(f.wires.length,n);assert.deepEqual(f.db.usageSnapshot(),frozenUsage);await close();
    }add('UNKNOWN_ALL_PHASES_BEFORE_LATER_SQL_AND_FINALIZER');

    f=fresh({snapshotThrowsAt:1});capability=f.install();r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(f.wires.length,1);assert.equal((await f.db.beforeRequest()).allowed,false);f.mode.restoreSnapshot();assert.deepEqual(Object.fromEntries(['requests','rows_read','rows_written','unknown_ops'].map(k=>[k,f.db.usageSnapshot()[k]])),{requests:1,rows_read:2,rows_written:0,unknown_ops:0});await close();add('SNAPSHOT_THROW_AFTER_SETTLED_REPLY_KNOWN_COST_NOT_ERASED');

    for(const n of [2,3]){
      f=fresh({failAt:n});capability=f.install();r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(f.wires.length,n);assert.equal(r.effective_prepared,prepared);assert.equal(r.new_operation_id_allowed,false);assert.ok(f.db.usageSnapshot().unknown_ops>0);assert.equal(await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input()),r);await close();
    }add('LOST_REPLY_RETAINS_SAME_EFFECTIVE_PREPARED_OPERATION');

    f=fresh({overAt:1});capability=f.install();r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(r.status,'ORIGIN_REPLY_RETAINED_RECONCILIATION_REQUIRED');assert.equal(f.wires.length,1);assert.equal(f.db.usageSnapshot().rows_read,31);await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(f.wires.length,1);await close();add('KNOWN_PROJECTION_OVERRUN_STOPS_DOMAIN_WITH_COST');

    f=fresh();capability=f.install();r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(r.status,'COMMITTED_RECEIPT_READBACK');
    const fp=JSON.parse(prepared.request.state_json).revisions[0].observation_fingerprint;
    const duplicate={logical_event_id:id,prepare_from_origin:origin=>{
      assert.ok(Object.isFrozen(origin)&&Object.isFrozen(origin.state)&&Object.isFrozen(origin.card));
      return{status:'STORED_DUPLICATE',logical_event_id:id,observation_fingerprint:fp,card_sha256:origin.card_sha256,descriptor_sha256:origin.descriptor_sha256,plan_sha256:origin.plan_sha256,first_known_ts:origin.first_known_ts,expected_revision:origin.revision,write_required:false,durable_new_observation:false};
    }};
    r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(duplicate);assert.equal(r.status,'STORED_DUPLICATE');assert.equal(f.wires.length,4);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM report2_anomaly_operation_v1').get().n,1);
    let overflowObserved=false;for(let i=0;i<20;i++){const before=f.wires.length;r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(duplicate);if(r.status==='RECEIPT_CAPACITY_DEFERRED_BEFORE_SQL'){assert.equal(f.wires.length,before);overflowObserved=true;break;}}
    assert.equal(overflowObserved,true);assert.equal(capability.receipts().overflow.status,'RECEIPT_CAPACITY_DEFERRED_BEFORE_SQL');assert.ok(capability.receipts().records.some(x=>x.status==='COMMITTED_RECEIPT_READBACK'));assert.ok(Buffer.byteLength(JSON.stringify(capability.receipts()))<=16384);await close();add('VERIFIED_ORIGIN_FROZEN_AND_EXACT_DUPLICATE_ONLY_ORIGIN');

    f=fresh();capability=f.install();await capability.close();assert.equal(Object.hasOwn(f.env,'REPORT2_ANOMALY_DOMAIN_COMMIT'),false);assert.equal(f.wires.length,0);await close();add('WORKER_LIFETIME_CLOSE_BEFORE_FINALIZATION');

    f=fresh();const opaque=Object.create({prototype_marker:true});Object.defineProperty(opaque,'basis',{enumerable:false,get(){throw Error('SOURCE_BASIS_MUST_NOT_BE_SERIALIZED');}});f.env.CONTROLLED_SAME_SOURCE=opaque;capability=f.install();await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(f.env.CONTROLLED_SAME_SOURCE,opaque);assert.equal(Object.getPrototypeOf(opaque).prototype_marker,true);await close();
    f=fresh();capability=f.install();let asyncCalled=false;r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT({logical_event_id:id,prepare_from_origin:async()=>{asyncCalled=true;return prepared;}});assert.equal(asyncCalled,false);assert.equal(f.wires.length,0);await close();
    f=fresh();capability=f.install();r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT({logical_event_id:id,prepare_from_origin:()=>{f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());return prepared;}});assert.equal(f.wires.length,1);assert.equal(r.status,'ANOMALY_PARENT_OR_CALLBACK_NOT_CLOSED');await close();
    f=fresh();capability=f.install();r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT({logical_event_id:id,prepare_from_origin:()=>({then(){}})});assert.equal(f.wires.length,1);assert.equal(r.status,'ANOMALY_PARENT_OR_CALLBACK_NOT_CLOSED');await close();
    f=fresh();capability=f.install();let attempted;
    r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT({logical_event_id:id,prepare_from_origin:()=>{attempted=f.db.prepare('SELECT 1').first().catch(error=>error.message);return prepared;}});assert.equal(f.wires.length,1);assert.equal(r.status,'ANOMALY_PARENT_OR_CALLBACK_NOT_CLOSED');assert.equal(await attempted,'ANOMALY_PREPARE_SQL_REFUSED');await close();
    f=fresh();capability=f.install({on_receipt:async()=>{throw Error('CONTROLLED_ARTIFACT_SINK_FAILURE');}});r=await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(r.status,'COMMITTED_RECEIPT_READBACK');assert.equal(capability.receipts().observer_failed,true);assert.equal(capability.receipts().records[0].request_sha256,prepared.request.request_sha256);await f.env.REPORT2_ANOMALY_DOMAIN_COMMIT(input());assert.equal(f.wires.length,3);await close();
    add('NO_SOURCE_ENV_OR_DB_SERIALIZATION');
    return{schema:'RUNNER_ANOMALY_PARENT_CONNECTED_CONTROLLED_V1',binding:api.binding,groups,controlled_groups:groups.length,actual_SQL:'LOCAL_SQLITE_ONLY',provider_HTTP:0,native_SQL:0,MAIN:0,Telegram:0,native_numeric_policy_available:false,old_component_replay:false,protected_budget:{rows_read:9448,rows_written:244},all_qualification_flags:false,native_cost_saving:null};
  }finally{try{await close();}finally{Date.now=oldNow;globalThis.fetch=oldFetch;}}
}
