import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {types as nodeUtilTypes} from 'node:util';
const PREFIX='checkpoints/source-worker-anomaly-callback-purity-20261022';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const NOW=1792650000000,DAY=new Date(NOW).toISOString().slice(0,10),ID=`R2RUN:${NOW}:0123456789abcdef`;
const POLICY={origin:{rows_read:20,rows_written:0},write:{rows_read:30,rows_written:12},read:{rows_read:20,rows_written:0},due:{rows_read:20,rows_written:0}};
function inventory(root,rel=''){
 return fs.readdirSync(path.join(root,rel),{withFileTypes:true}).flatMap(e=>{assert.ok(!e.isSymbolicLink());const p=path.join(rel,e.name);if(e.isDirectory())return inventory(root,p);assert.ok(e.isFile());const b=fs.readFileSync(path.join(root,p));return[{path:p.split(path.sep).join('/'),bytes:b.length,sha256:sha(b)}];}).sort((a,b)=>a.path.localeCompare(b.path));
}
// NEW delta-only loader: old component files are never application imports.
export async function loadRunnerAnomalyCallbackPurityCapability({runtime_root,baseline_runtime_root,repo_root}){
 const src=path.resolve(runtime_root),baseSrc=path.resolve(baseline_runtime_root),repo=path.resolve(repo_root);assert.equal(path.basename(src),'src');assert.equal(path.basename(baseSrc),'src');assert.notEqual(src,baseSrc);
 const root=path.dirname(src),base=path.dirname(baseSrc),pkg=path.join(repo,PREFIX),manifest=json(path.join(pkg,'manifest.json'));
 assert.ok(Array.isArray(manifest.payloads));for(const p of manifest.payloads){const b=fs.readFileSync(path.join(pkg,p.path));assert.equal(b.length,p.bytes);assert.equal(sha(b),p.sha256);}
 const recipe=json(path.join(pkg,'target-bindings.json')),deps=json(path.join(pkg,'dependencies.json')),a=inventory(root),b=inventory(base),ma=new Map(a.map(x=>[x.path,x])),mb=new Map(b.map(x=>[x.path,x]));
 assert.equal(a.length,618);assert.equal(b.length,618);assert.deepEqual([...ma.keys()],[...mb.keys()]);for(const x of a)if(x.path!=='runner-main.mjs')assert.deepEqual(x,mb.get(x.path),'ALL617_NON_RUNNER_BYTES_EQUAL');
 const t=recipe.targets[0];assert.equal(ma.get('runner-main.mjs').sha256,t.after_sha256);assert.equal(mb.get('runner-main.mjs').sha256,t.before_sha256);
 for(const [p,pin] of Object.entries(deps.runtime_pins)){assert.equal(ma.get(p)?.sha256,pin);assert.equal(mb.get(p)?.sha256,pin);}
 for(const [p,pin] of Object.entries(deps.repo_fixture_pins))assert.equal(sha(fs.readFileSync(path.join(repo,p))),pin);
 const before=fs.readFileSync(path.join(base,'runner-main.mjs'),'utf8'),after=fs.readFileSync(path.join(root,'runner-main.mjs'),'utf8'),block=fs.readFileSync(path.join(pkg,'runner-callback-capability.proposed.txt'),'utf8');
 const start=before.indexOf('function installRunnerAnomalyParentCapability('),end=before.indexOf('\nasync function main()',start);assert.ok(start>=0&&end>start);
 const oldBlock=before.slice(start,end);assert.equal(Buffer.byteLength(oldBlock),recipe.function.before_bytes);assert.equal(sha(oldBlock),recipe.function.before_sha256);assert.equal(Buffer.byteLength(block),recipe.function.bytes);assert.equal(sha(block),recipe.function.sha256);assert.equal(recipe.new_builtin_import+before.slice(0,start)+block+before.slice(end),after,'FULL_EXACT_DELTA_RECIPE');
 const kernel=await import(pathToFileURL(path.join(src,'anomaly-native-domain.mjs')).href),guard=await import(pathToFileURL(path.join(root,'d1-preaction-budget-guard.mjs')).href),http=await import(pathToFileURL(path.join(src,'unified-budget.mjs')).href),adapter=await import(pathToFileURL(path.join(root,'report2-d1-adapter.mjs')).href),lifecycle=await import(pathToFileURL(path.join(src,'v3-telegram-lifecycle-sidecar.mjs')).href),delivery=await import(pathToFileURL(path.join(src,'bound-telegram-delivery-sidecar.mjs')).href);
 const compile=body=>new Function('nodeUtilTypes','crypto','Buffer','Date','readAnomalyOrigin','commitAnomalyBundle','readDueAnomalyBundles','ORIGIN_SQL','COMMIT_SQL','READBACK_SQL','DUE_SQL','evaluateWithinRunReservation','V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET','BOUND_TELEGRAM_DELIVERY_BUDGET',body+'\nreturn installRunnerAnomalyParentCapability;')(nodeUtilTypes,crypto,Buffer,Date,kernel.readAnomalyOrigin,kernel.commitAnomalyBundle,kernel.readDueAnomalyBundles,kernel.ORIGIN_SQL,kernel.COMMIT_SQL,kernel.READBACK_SQL,kernel.DUE_SQL,guard.evaluateWithinRunReservation,lifecycle.V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET,delivery.BOUND_TELEGRAM_DELIVERY_BUDGET);
 return{install:compile(block),baseline_install:compile(oldBlock),kernel,guard,http,adapter,binding:{runtime_files:618,non_target_equal:617,runner_before:t.before_sha256,runner_after:t.after_sha256,all_pins_before_imports:true,old_components_imported_or_replayed:0}};
}
function preparedSeed(kernel,contract,operation='PURITY_SEED'){
 const symbol=contract.slice(0,-5),row={contract_code:contract,symbol,pair:contract,business_type:'swap',contract_type:'swap',trade_partition:'USDT',contract_status:1,create_date:'20200101',contract_size:1,price_tick:0.01};
 const descriptor=kernel.opaqueHtxDescriptor({metadata:{status:'ok',ts:NOW-20000,data:[row]},contract,observed_ts:NOW-19000,source_ref:'CONTROLLED_NEW_CALLBACK_PURITY'}),body={instrument:{contract},timeframe:'15m',event_start_ts:NOW-900000,event_end_ts:NOW-10000,first_known_ts:NOW-9000},card={...body,card_hash:kernel.digest(body)},id=kernel.opaqueLogicalEventKey(card,descriptor),plan=kernel.lockedOutcomePlan(card);
 const state={evaluated_ts:NOW-1000,watch:{active:true,next_check_ts:NOW-1},last_snapshot:{ts:NOW-10000},revisions:[{observation_kind:'CAPTURED_CLOSED_WINDOW_FACTS_V1',observation_fingerprint:'a'.repeat(64)}],outcomes:Object.fromEntries(plan.cells.map(c=>[c.key,{target_ts:c.target_ts,status:'PENDING'}])),outbox:{},native_admission_qualified:false,event_first_knowledge_qualified:false,native_epoch_qualified:false};
 return kernel.prepareAnomalyCommit({logical_event_id:id,operation_id:operation+':'+kernel.digest(id),expected_revision:0,card,descriptor,plan,state});
}
function fixture(DatabaseSync,api,repo,mode={}){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(path.join(repo,'current-generation/files/migrations/20261021_anomaly_domain.sql'),'utf8'));
 const seeded=preparedSeed(api.kernel,'ZEC-USDT');sqlite.prepare(api.kernel.COMMIT_SQL).run(seeded.text); // CONTROLLED setup, not SDK/native traffic.
 const wires=[],calls=[];let n=0;
 const db=new api.adapter.RemoteD1Database('https://controlled.invalid/callback-purity','CONTROLLED_NO_TOKEN',{fetchImpl:async(url,req)=>{
  assert.equal(String(url),'https://controlled.invalid/callback-purity');const p=JSON.parse(req.body);wires.push(p);n++;
  if(mode.failBefore===n)throw Error('CONTROLLED_NEW_PURITY_LOST_BEFORE');
  let result;if(p.op==='first')result=sqlite.prepare(p.sql).get(...p.params)??null;else if(p.op==='all')result={results:sqlite.prepare(p.sql).all(...p.params)};else if(p.op==='run'){const r=sqlite.prepare(p.sql).run(...p.params);result={success:true,meta:{changes:Number(r.changes)}};}else throw Error('UNEXPECTED_PURITY_WIRE');
  if(mode.failAfter===n)throw Error('CONTROLLED_NEW_PURITY_LOST_AFTER');mode.onReply?.(n,p);
  return new Response(JSON.stringify({ok:true,result,usage:{measured:mode.unknownAt!==n,rows_read:mode.overAt===n?31:2,rows_written:p.op==='run'?12:0}}),{status:200});
 }});
 const env={DATA_DB:db},reservation={rows_read:54000,rows_written:840},receipt={status:'RESERVED',reservation_id:ID,day_utc:DAY,...reservation},day_admission={allowed:true},http_budget=api.http.createUnifiedHttpBudget({whole_job:164,hot:96,background:56,statistics:12}),reserve=http_budget.reserve;
 http_budget.reserve=x=>{calls.push({...x});mode.onReserve?.(calls.length);if(mode.httpDenyAt===calls.length)return{allowed:false};return reserve(x);};
 const install=(baseline=false,changes={})=>(baseline?api.baseline_install:api.install)({env,db,reservation,reservation_id:ID,receipt,day_admission,http_budget,post_v7:true,cost_bounds:POLICY,...changes});
 return{sqlite,seeded,db,env,reservation,receipt,day_admission,http_budget,wires,calls,mode,install};
}
const deferred=o=>({status:'DUE_DEFERRED',logical_event_id:o.logical_event_id,expected_revision:o.revision,first_known_ts:o.first_known_ts,card_sha256:o.card_sha256,descriptor_sha256:o.descriptor_sha256,plan_sha256:o.plan_sha256,reason:'NO_SAME_COMPLETED_CAPTURE',write_required:false,durable_new_observation:false});
const clone=x=>JSON.parse(JSON.stringify(x));
// ONE NEW delta case, no registration, no old-case invocation.
export async function runAnomalyCallbackPurityConnected(args){
 const api=await loadRunnerAnomalyCallbackPurityCapability(args),{DatabaseSync}=await import('node:sqlite'),oldNow=Date.now,oldFetch=globalThis.fetch;
 let now=NOW,f=null,cap=null;const groups=[];Date.now=()=>now;globalThis.fetch=async()=>{throw Error('NEW_PURITY_GLOBAL_NATIVE_NETWORK_DENIED');};
 const fresh=(mode={})=>{now=NOW;f=fixture(DatabaseSync,api,path.resolve(args.repo_root),mode);return f;},close=async()=>{if(cap)await cap.close();cap=null;if(f)f.sqlite.close();f=null;},add=(name,detail={})=>groups.push({name,status:'NEW_PURITY_CONTROLLED_ASSERTIONS_COMPLETED',...detail});
 const invoke=prepare=>f.env.REPORT2_ANOMALY_DOMAIN_COMMIT({logical_event_id:f.seeded.request.logical_event_id,prepare_from_origin:prepare});
 const revision=o=>api.kernel.prepareAnomalyCommit({logical_event_id:o.logical_event_id,operation_id:'PURITY_REV:'+api.kernel.digest(o.logical_event_id),expected_revision:o.revision,card:o.card,descriptor:o.descriptor,plan:o.plan,state:{...clone(o.state),evaluated_ts:NOW}});
 const noExtra=()=>{assert.equal(f.wires.length,1);assert.equal(f.wires[0].sql,api.kernel.ORIGIN_SQL);assert.equal(f.calls.length,1);assert.equal(f.calls[0].lane,'statistics');assert.deepEqual(Object.fromEntries(['requests','rows_read','rows_written','unknown_ops'].map(k=>[k,f.db.usageSnapshot()[k]])),{requests:1,rows_read:2,rows_written:0,unknown_ops:0});};
 try{
  const proof=[];
  for(const baseline of [true,false]){
   fresh();cap=f.install(baseline);const pending=[];let reads=0;
   const r=await invoke(o=>{const x=deferred(o);Object.defineProperty(x,'status',{enumerable:true,configurable:true,get(){if(reads++===0)pending.push(f.db.prepare('SELECT 1 AS callback_escape').first());return'DUE_DEFERRED';}});return x;});
   await Promise.allSettled(pending);
   if(baseline){assert.equal(r.status,'DUE_DEFERRED');assert.ok(reads>0);assert.equal(f.wires.filter(x=>x.sql==='SELECT 1 AS callback_escape').length,1);assert.equal(f.calls.length,1);}
   else{assert.equal(r.status,'ANOMALY_PARENT_OR_CALLBACK_NOT_CLOSED');assert.equal(reads,0);noExtra();}
   proof.push({baseline,reads,wire_statements:f.wires.length,statistics_reservations:f.calls.length});await close();
  }add('NEW_BASELINE_GETTER_NONDOMAIN_SQL_COUNTEREXAMPLE_AND_DELTA_REFUSAL',{CONTROLLED:proof});
  for(const key of ['then','status','text','request','request_bytes','toJSON']){
   fresh();cap=f.install();let invoked=0;const r=await invoke(o=>{const x=deferred(o);Object.defineProperty(x,key,{enumerable:true,get(){invoked++;throw Error('ACCESSOR_MUST_NEVER_RUN');}});return x;});assert.equal(r.status,'ANOMALY_PARENT_OR_CALLBACK_NOT_CLOSED');assert.equal(invoked,0);noExtra();await close();
  }add('TOP_LEVEL_THEN_STATUS_TEXT_REQUEST_BYTES_TOJSON_ACCESSORS_NEVER_EXECUTED');
  for(const key of ['operation_id','card_json','state_json','non_enumerable']){
   fresh();cap=f.install();let invoked=0;const r=await invoke(o=>{const x=clone(revision(o));Object.defineProperty(x.request,key,{enumerable:key!=='non_enumerable',get(){invoked++;return'FORBIDDEN';}});return x;});assert.equal(r.status,'ANOMALY_PARENT_OR_CALLBACK_NOT_CLOSED');assert.equal(invoked,0);noExtra();await close();
  }add('NESTED_AND_NONENUMERABLE_ACCESSORS_NO_LATER_KERNEL_ACCESS');
  for(const trap of ['getPrototypeOf','ownKeys','getOwnPropertyDescriptor']){
   fresh();cap=f.install();const attempts=[];let hit=0;const r=await invoke(o=>new Proxy(deferred(o),{[trap](...a){hit++;queueMicrotask(()=>attempts.push(f.db.prepare('SELECT 1 AS delayed_reflection_escape').first()));return Reflect[trap](...a);}}));
   await Promise.resolve();await Promise.allSettled(attempts);assert.equal(hit,0);assert.equal(attempts.length,0);assert.equal(r.status,'ANOMALY_PARENT_OR_CALLBACK_NOT_CLOSED');noExtra();await close();
  }add('ALL_PROXY_REFLECTION_TRAPS_REJECTED_BEFORE_SCHEDULING_DELAYED_SQL');
  for(const shape of ['top','nested','revoked']){fresh();cap=f.install();let gets=0;const r=await invoke(o=>{const x=clone(revision(o));const pair=Proxy.revocable(shape==='nested'?x.request:x,{get(){gets++;throw Error('PROXY_GET_MUST_NOT_RUN');}});if(shape==='revoked')pair.revoke();if(shape==='nested'){x.request=pair.proxy;return x;}return pair.proxy;});assert.equal(r.status,'ANOMALY_PARENT_OR_CALLBACK_NOT_CLOSED');assert.equal(gets,0);noExtra();await close();}add('TOP_NESTED_REVOKED_PROXY_NEVER_REACHES_KERNEL');
  fresh();cap=f.install();let retained,expected;let r=await invoke(o=>{retained=clone(revision(o));expected=clone(retained);queueMicrotask(()=>{retained.text='CORRUPTED_AFTER_RETURN';retained.request.operation_id='CORRUPTED_AFTER_RETURN';});return retained;});assert.equal(r.status,'COMMITTED_RECEIPT_READBACK');assert.equal(retained.text,'CORRUPTED_AFTER_RETURN');assert.equal(r.effective_prepared.text,expected.text);assert.equal(r.effective_prepared.request.operation_id,expected.request.operation_id);assert.equal(Object.getPrototypeOf(r.effective_prepared),null);assert.equal(Object.getPrototypeOf(r.effective_prepared.request),null);assert.ok(Object.isFrozen(r.effective_prepared)&&Object.isFrozen(r.effective_prepared.request));assert.equal(f.wires[1].params[0],expected.text);assert.equal(f.wires[2].params[0],expected.request.operation_id);assert.equal(sha(JSON.stringify(r.effective_prepared.request)),sha(JSON.stringify(expected.request)));await close();add('CALLBACK_OWNED_MUTATION_AFTER_AWAIT_CANNOT_CHANGE_EFFECTIVE_BYTES_OR_OPID');
  const stringBytes=v=>typeof v==='string'?Buffer.byteLength(v):v&&typeof v==='object'?Object.entries(v).reduce((n,[k,x])=>n+Buffer.byteLength(k)+stringBytes(x),0):0;
  const boundTransforms=[
   [true,x=>{x.extra={a:{b:{c:1}}};}],[false,x=>{x.extra={a:{b:{c:{d:1}}}};}],
   [true,x=>{while(Object.keys(x).length<32)x['k'+Object.keys(x).length]=0;}],[false,x=>{while(Object.keys(x).length<33)x['k'+Object.keys(x).length]=0;}],
   [true,x=>{x.extra={left:Object.fromEntries(Array.from({length:25},(_,i)=>['k'+i,0])),right:Object.fromEntries(Array.from({length:25},(_,i)=>['k'+i,0]))};}],
   [false,x=>{x.extra={left:Object.fromEntries(Array.from({length:25},(_,i)=>['k'+i,0])),right:Object.fromEntries(Array.from({length:26},(_,i)=>['k'+i,0]))};}],
   [true,x=>{x.padding='';x.padding='p'.repeat(2*131072+8192-stringBytes(x));}],[false,x=>{x.padding='';x.padding='p'.repeat(2*131072+8192-stringBytes(x)+1);}]
  ];
  for(const [accepted,change] of boundTransforms){fresh();cap=f.install();r=await invoke(o=>{const x=deferred(o);change(x);return x;});assert.equal(r.status,accepted?'DUE_DEFERRED':'ANOMALY_PARENT_OR_CALLBACK_NOT_CLOSED');noExtra();await close();}add('DATA_SNAPSHOT_DEPTH_KEYS_NODES_AND_AGGREGATE_UTF8_EXACT_BOUNDARIES');
  for(const bad of [x=>{x.extra=undefined;},x=>{x.extra=()=>0;},x=>{x.then=()=>0;},x=>{x.extra=Symbol('x');},x=>{x[Symbol('key')]=0;},x=>{x.extra=[];},x=>{x.extra=Object.setPrototypeOf([],null);},x=>{x.extra=Object.setPrototypeOf([],Object.prototype);},x=>{x.extra=new Date(NOW);},x=>{x.extra=x;},x=>{x.extra=NaN;},x=>{x.extra=-0;},x=>{x.extra=1n;},x=>{x.extra=Promise.resolve(1);},x=>{x.toJSON=()=>({});}]){fresh();cap=f.install();r=await invoke(o=>{const x=deferred(o);bad(x);return x;});assert.equal(r.status,'ANOMALY_PARENT_OR_CALLBACK_NOT_CLOSED');noExtra();await close();}add('FUNCTION_THENABLE_SYMBOL_ARRAY_NONPLAIN_CYCLE_AND_LOSSY_PRIMITIVES_REFUSED');
  for(const status of ['DUE_DEFERRED','STORED_DUPLICATE','DEFERRED_CAPACITY']){
   fresh();cap=f.install();r=await invoke(o=>({...deferred(o),status,...(status==='STORED_DUPLICATE'?{observation_fingerprint:'a'.repeat(64)}:status==='DEFERRED_CAPACITY'?{observation_fingerprint:'a'.repeat(64),reason:'STATE_BYTES_CAPACITY_NO_DROP'}:{})}));assert.equal(r.status,status);assert.equal(r.write_required,false);assert.equal(r.durable_new_observation,false);noExtra();await close();
  }
  const compatibility=[];for(const baseline of [true,false]){fresh();cap=f.install(baseline);let p;r=await invoke(o=>{p=revision(o);return p;});assert.equal(r.status,'COMMITTED_RECEIPT_READBACK');compatibility.push({text:r.effective_prepared.text,request_sha256:r.effective_prepared.request.request_sha256,wire:clone(f.wires),cost:f.db.usageSnapshot(),protected_budget:cap.protected_budget});if(!baseline)assert.notEqual(r.effective_prepared,p);await close();}assert.deepEqual(compatibility[1],compatibility[0]);add('PLAIN_TERMINALS_AND_ACTUAL_COMMIT_THREE_PHASE_BYTES_COSTS_UNCHANGED');
  for(const mode of [{unknownAt:2},{failBefore:2},{failAfter:2},{overAt:2}]){
   fresh(mode);cap=f.install();let rawPrepared;r=await invoke(o=>{rawPrepared=revision(o);return rawPrepared;});assert.equal(r.new_operation_id_allowed,false);assert.ok(r.effective_prepared);assert.notEqual(r.effective_prepared,rawPrepared);assert.equal(r.effective_prepared.text,rawPrepared.text);assert.equal(Object.isFrozen(r.effective_prepared.request),true);const cut=f.db.usageSnapshot(),pending=cap.retained_reconciliation()[0];assert.equal(pending,r);const hook=f.env.REPORT2_ANOMALY_DOMAIN_COMMIT,again=await hook({logical_event_id:f.seeded.request.logical_event_id,prepare_from_origin:()=>{throw Error('NO_RETRY');}});assert.equal(again,r);assert.equal(again.effective_prepared,r.effective_prepared);assert.equal(f.wires.length,2);assert.deepEqual(f.db.usageSnapshot(),cut);await cap.close();assert.equal(await hook({logical_event_id:f.seeded.request.logical_event_id,prepare_from_origin:()=>{throw Error('NO_RETRY_AFTER_CLOSE');}}),r);
   if(mode.overAt){assert.equal(cut.unknown_ops,0);assert.equal(cut.rows_read,33);}else{assert.equal(cut.unknown_ops,1);assert.equal((await f.db.beforeRequest()).allowed,false);await assert.rejects(api.guard.finalizeRunUsage(f.db,{reservationId:ID,sourceRunId:'NEW_PURITY_FINALIZER',now:NOW,usage:cut}),/D1_LOCAL_HTTP_ADMISSION_DENIED/);assert.equal(f.wires.length,2);assert.deepEqual(f.db.usageSnapshot(),cut);}await close();
  }add('UNKNOWN_LOST_AND_KNOWN_OVERRUN_KEEP_SAME_EFFECTIVE_SNAPSHOT_NO_RETRY_FINALIZER_FENCE');
  for(const mutate of [()=>{f.day_admission.allowed=false;},()=>{f.receipt.day_utc='2000-01-01';},()=>{now=NOW+86400000;},()=>{f.db._recordUsage({op:'first',sql:'CONTROLLED_ACCOUNTING_ONLY'},{measured:false,rows_read:17,rows_written:3});}]){
   fresh();cap=f.install();r=await invoke(o=>{const x=deferred(o);mutate();return x;});assert.equal(r.status,'ANOMALY_PARENT_OR_CALLBACK_NOT_CLOSED');assert.equal(f.wires.length,1);assert.equal(f.calls.length,1);if(f.db.usageSnapshot().unknown_ops){assert.equal((await f.db.beforeRequest()).allowed,false);assert.ok(f.db.usageSnapshot().rows_read>=2);}await close();
  }
  fresh({httpDenyAt:2});cap=f.install();r=await invoke(o=>revision(o));assert.equal(r.status,'COMMIT_NOT_ADMITTED');assert.equal(f.wires.length,1);assert.equal(f.calls.length,2);await close();add('LIVE_PARENT_DAY_UNKNOWN_AND_EACH_PHASE_STATISTICS_CHECKS_RETAINED');
  fresh();const original=f.db._request,descriptor=Object.getOwnPropertyDescriptor(f.db,'_request');cap=f.install(false,{cost_bounds:undefined});assert.equal(cap.installed,false);assert.equal(Object.hasOwn(f.env,'REPORT2_ANOMALY_DOMAIN_COMMIT'),false);assert.equal(f.wires.length,0);await close();
  fresh();const saved=f.db._request,savedDescriptor=Object.getOwnPropertyDescriptor(f.db,'_request');cap=f.install(false,{on_receipt:async snapshot=>{assert.ok(Buffer.byteLength(JSON.stringify(snapshot))<=16384);assert.equal(JSON.stringify(snapshot).includes('card_json'),false);assert.equal(snapshot.native_admission_qualified,false);}});r=await invoke(o=>deferred(o));assert.equal(r.status,'DUE_DEFERRED');assert.equal(cap.receipts().records.length,1);await cap.close();assert.equal(f.db._request,saved);assert.deepEqual(Object.getOwnPropertyDescriptor(f.db,'_request'),savedDescriptor);assert.equal(Object.hasOwn(f.env,'REPORT2_ANOMALY_DOMAIN_COMMIT'),false);assert.equal(Object.hasOwn(f.env,'REPORT2_ANOMALY_DOMAIN_DUE'),false);await close();add('DEFAULT_OFF_METADATA_ONLY_RECEIPT_AND_EXACT_CLOSE_RESTORE');
  return{schema:'NEW_ANOMALY_CALLBACK_PURITY_CONNECTED_V1',groups,controlled_groups:groups.length,binding:api.binding,actual_RemoteD1_into_LocalSQLite:true,fixture_and_counters_CONTROLLED:true,old_components_imported_or_replayed:0,new_SQL_templates:0,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,raw_callback_reference_identity_preserved:false,SAME_effective_snapshot_on_uncertain_replay:true,native_cost_or_epoch_or_firstknowledge_or_SAVING_or_SENT_qualified:false,CPU_heap_latency_or_production_pending_journal_qualified:false};
 }catch(error){error.completed_new_callback_purity_groups=groups;throw error;}
 finally{try{await close();}finally{Date.now=oldNow;globalThis.fetch=oldFetch;}}
}
