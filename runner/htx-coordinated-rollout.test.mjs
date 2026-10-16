import test from 'node:test';import {gunzipSync} from 'node:zlib';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {coordinateWeeklyRollout,singleActiveVersion,workerSettingsFingerprint,runtimeSettingsSerializationHashes,historyVersionMetadata,collectorVersionMetadata,resumeOwnUnactivatedCollector,readSingleWorkerModule,verifySupersetHistory,rolloutDigest,WEEKLY_ROLLOUT_POLICY as P} from './htx-coordinated-rollout.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),head='a'.repeat(40),sha='b'.repeat(64);
const base=n=>({deployment_id:id(n),version_id:id(n+10),module_sha256:'original'+n,settings_sha256:'settings'+n,crons_sha256:'cron'+n});
function harness(options={}){
 const original=[base(1),base(2)],states=structuredClone(original),collector={...base(3),status:'EXACT_CURRENT_UNIVERSE_NEUTRAL_COLLECTOR'},events=[],saved=[];let guards=0;
 const names=options.bridgeCounterPatch?['my-report-2-d1-bridge']:options.collectorPatch?[P.collector]:options.historyObserverPatch?['my-report-2-free-history']:P.workers,workers=names.map((name,i)=>({name,module_sha256:'c'.repeat(64-i)+('d'.repeat(i))}));
 const plan={...(options.bridgeCounterPatch?{kind:'sql_bridge_counter_patch'}:options.collectorPatch?{kind:'collector_patch'}:options.historyObserverPatch?{kind:'history_observer_patch'}:{}),head,expected_main:'e'.repeat(40),connected:{head,run:42,status:options.bridgeCounterPatch?'EXACT_MAIN_SQL_BRIDGE_COUNTER_REPAIR_QUALIFIED':options.collectorPatch?'EXACT_MAIN_CURRENT_COLLECTOR_SOURCE_QUALIFIED':options.historyObserverPatch?'EXACT_MAIN_HOURLY_NATIVE_OBSERVER_QUALIFIED':'EXACT_WEEKLY_CONNECTED_CHECK_SUCCESS'},scope:{status:options.bridgeCounterPatch?'EXACT_SQL_BRIDGE_SQL_PARAMS_AUTH_AND_LIMITS_PRESERVED':options.collectorPatch?'EXACT_HUB_PREFIX_PRESERVED_CURRENT_TAIL_PATCH':options.historyObserverPatch?'EXACT_HOURLY_SQL_PARAMS_AND_ARCHIVED_BYTES_PRESERVED':'SUPERSET_AND_PREVIOUS_HISTORY_DIGESTS_PRESERVED'},workers};
 const index=w=>names.indexOf(w.name);
 const adapter={readCollector:async()=>{events.push('collector');return structuredClone(options.collectorDrift&&events.filter(e=>e==='collector').length>1?{...collector,version_id:id(99)}:collector);},snapshot:async w=>{const i=index(w);events.push('read'+i);return structuredClone(states[i]);},requireHeadroom:n=>{events.push('headroom'+n);if(options.noHeadroom)throw Error('HTTP_HEADROOM_REQUIRED');},stage:async w=>{const i=index(w);events.push('stage'+i);return{version_id:id(30+i)};},activate:async(w,version)=>{
  const i=index(w);events.push('activate'+i+':'+version);
  if(version===original[i].version_id){states[i]={...original[i],deployment_id:id(80+i)};return;}
  states[i]={...original[i],deployment_id:id(60+i),version_id:version,module_sha256:w.module_sha256};
  if(i===1&&options.badSecond)states[i].module_sha256='wrong';
  if(i===1&&options.foreignSecond)states[i]={...states[i],version_id:id(99)};
  if(i===1&&options.ambiguousSecond)throw Error('DEPLOYMENT_ACK_LOST');
 }};
 const run=execute=>coordinateWeeklyRollout({plan,adapter,guard:async()=>{guards++;if(options.expireAt===guards)throw Error('LEASE_EXPIRED');},save:async p=>saved.push(p),execute,clock:()=>123});
 return{plan,adapter,run,events,saved,states,original};
}
test('read-only qualification never stages, activates or changes Node scope',async()=>{
 const h=harness(),p=await h.run(false);assert.equal(p.status,'EXACT_CONNECTED_PLAN_AND_ROLLBACK_ORIGINALS_QUALIFIED');assert.equal(h.events.some(e=>/stage|activate/.test(e)),false);assert.deepEqual(h.states,h.original);assert.equal(p.production_scope_changed,false);
});
test('both versions stage before activation and all final states are read back',async()=>{
 const h=harness(),p=await h.run(true);assert.equal(p.status,'ALL_CONNECTED_WORKERS_EXACT_NODE_SCOPE_MERGE_READY');assert.ok(h.events.indexOf('stage1')<h.events.findIndex(e=>e.startsWith('activate0:')));assert.equal(p.production_scope_changed,false);assert.equal(p.sourceHTTP,0);assert.equal(p.D1,0);assert.equal(p.Telegram,0);assert.equal(h.events.filter(e=>e==='collector').length,2);assert.ok(h.events.filter(e=>e==='read0').length>=4);assert.ok(h.saved.some(p=>p.workers[0].activation_intent&&!p.workers[0].after));
});
test('wrong exact module after second activation restores both original versions',async()=>{
 const h=harness({badSecond:true});await assert.rejects(h.run(true),/EXACT_HISTORY_ACTIVATION_READBACK_REQUIRED/);assert.deepEqual(h.states.map(s=>s.version_id),h.original.map(s=>s.version_id));const p=h.saved.at(-1);assert.equal(p.status,'WEEKLY_NOT_ACTIVATED_OR_OWN_ACTIVATIONS_ROLLED_BACK');assert.equal(p.rollback.length,2);assert.equal(p.production_activation_allowed,false);
});
test('an unacknowledged activation is read back and only own active versions roll back',async()=>{
 const h=harness({ambiguousSecond:true});await assert.rejects(h.run(true),/DEPLOYMENT_ACK_LOST/);assert.deepEqual(h.states.map(s=>s.version_id),h.original.map(s=>s.version_id));assert.equal(h.saved.at(-1).rollback.every(r=>r.status==='ORIGINAL_VERSION_AND_SETTINGS_RESTORED'),true);
});
test('foreign deployment is retained, requires exact resume and never gets overwritten',async()=>{
 const h=harness({foreignSecond:true});await assert.rejects(h.run(true));assert.equal(h.states[1].version_id,id(99));assert.equal(h.states[0].version_id,h.original[0].version_id);assert.equal(h.saved.at(-1).status,'WEEKLY_PARTIAL_STATE_REQUIRES_EXACT_RESUME');assert.equal(h.events.filter(e=>e==='activate1:'+h.original[1].version_id).length,0);
});
test('collector drift after both archives causes compensation without changing collector',async()=>{
 const h=harness({collectorDrift:true});await assert.rejects(h.run(true),/COLLECTOR_CHANGED_DURING_WEEKLY_ROLLOUT/);assert.deepEqual(h.states.map(s=>s.version_id),h.original.map(s=>s.version_id));
});
test('expired lease or unavailable rollback reserve stops before first mutation',async()=>{
 for(const options of [{expireAt:4},{noHeadroom:true}]){const h=harness(options);await assert.rejects(h.run(true));assert.equal(h.events.some(e=>/stage|activate/.test(e)),false);}
});
test('wrong connected head cannot invoke a live adapter',async()=>{
 const h=harness();h.plan.connected.head='f'.repeat(40);await assert.rejects(h.run(true),/EXACT_CONNECTED_WEEKLY_ROLLOUT_PLAN_REQUIRED/);assert.equal(h.events.length,0);
});
test('split traffic, missing deployment and invalid UUIDs cannot serve as rollback originals',()=>{
 const d={deployments:[{id:id(1),strategy:'percentage',versions:[{version_id:id(2),percentage:100}]}]};assert.equal(singleActiveVersion(d).version_id,id(2));for(const bad of [{}, {deployments:[]}, {deployments:[{...d.deployments[0],versions:[{version_id:id(2),percentage:50}]}]}, {deployments:[{...d.deployments[0],id:'wrong'}]}])assert.throws(()=>singleActiveVersion(bad));
});
test('exact bindings, compatibility and free usage model survive; unknown settings are refused',()=>{
 const config={compatibility_date:'2026-10-12',d1_databases:[{binding:'DATA_DB',database_id:id(1)}]},settings={compatibility_date:config.compatibility_date,bindings:[{name:'DATA_DB',type:'d1',id:id(1)}]},runtime={compatibility_date:'2026-10-12T00:00:00Z',usage_model:'standard',compatibility_flags:[],limits:{cpu_ms:50}},args={settings,runtime,config,head,main_module:'worker-entry.js'};
 const m=historyVersionMetadata(args);assert.deepEqual(m.bindings,settings.bindings);assert.deepEqual(m.limits,runtime.limits);assert.equal(m.annotations['workers/commit_sha'],head);assert.equal(Object.hasOwn(m,'migrations'),false);
 for(const patch of [{settings:{...settings,bindings:[...settings.bindings,{name:'KEEP_ME',type:'secret_text'}]}},{runtime:{...runtime,usage_model:'unbound'}},{runtime:{...runtime,compatibility_date:'2026-10-11'}},{settings:{...settings,bindings:[{...settings.bindings[0],id:id(2)}]}}])assert.throws(()=>historyVersionMetadata({...args,...patch}));
 assert.equal(workerSettingsFingerprint(settings),workerSettingsFingerprint({...settings,bindings:[...settings.bindings]}));assert.notEqual(workerSettingsFingerprint(settings),workerSettingsFingerprint({...settings,limits:{cpu_ms:99}}));
});
test('retained106 scope preserves all production105 targets and every old history digest',()=>{
 const old=fs.readFileSync('cloudflare/free-history/hourly-archive.mjs','utf8'),next=fs.readFileSync('checkpoints/weekly106-preparation-20261015/files/cloudflare/free-history/hourly-archive.mjs','utf8'),extract=s=>vm.runInNewContext(s.replaceAll('export ', '')+';({TARGETS,KNOWN_HISTORY_MANIFESTS,MANIFEST_SHA256})',{TextEncoder});
 const a=extract(old),b=extract(next),args={previous_targets:Array.from(a.TARGETS),targets:Array.from(b.TARGETS),previous_manifests:JSON.parse(JSON.stringify(a.KNOWN_HISTORY_MANIFESTS)),manifests:JSON.parse(JSON.stringify(b.KNOWN_HISTORY_MANIFESTS)),manifest_sha256:b.MANIFEST_SHA256};assert.equal(verifySupersetHistory(args).target_count,106);assert.throws(()=>verifySupersetHistory({...args,targets:args.targets.filter(s=>s!=='FIL-USDT')}));assert.throws(()=>verifySupersetHistory({...args,manifests:[args.manifests[0]]}));
});
test('workflow admits only main-dispatched exact proposals; no historical owner alias, source or D1 credentials',()=>{
 const y=fs.readFileSync('.github/workflows/weekly-htx-coordinated-rollout.yml','utf8'),s=fs.readFileSync('tools/weekly-htx-coordinated-rollout.mjs','utf8');assert.match(y,/github.ref == 'refs\/heads\/main'/);assert.match(y,/default: false/);assert.match(y,/wrangler@4\.151\.0 deploy --dry-run/g);assert.doesNotMatch(y,/D1_BRIDGE|TELEGRAM_BOT_TOKEN|runner-main|wrangler@4 /);assert.match(s,/verifyWeeklyOriginalProposal/);assert.equal(P.rollback_HTTP_reserved,16);assert.equal(P.max_control_HTTP+P.max_cloudflare_HTTP+P.manual_HTTP_reserved,P.http.whole_job);assert.equal(rolloutDigest('original'),rolloutDigest(Buffer.from('original')));
});
test('current collector repair is a separate one-Worker exact transaction, never a scope adoption',async()=>{
 const h=harness({collectorPatch:true});h.plan.workers[0].required_before=h.original[0];const p=await h.run(true);assert.equal(p.status,'CURRENT_COLLECTOR_EXACT_MODULE_AND_BINDINGS_REPAIRED');assert.equal(p.workers.length,1);assert.equal(p.workers[0].name,P.collector);assert.equal(p.production_scope_changed,false);assert.equal(h.events.includes('collector'),false);assert.equal(h.states[1].version_id,h.original[1].version_id);
});
test('collector patch prepared against a different prefix/version refuses even before staging',async()=>{
 const h=harness({collectorPatch:true});h.plan.workers[0].required_before={...h.original[0],module_sha256:'different-prefix'};await assert.rejects(h.run(true),/WORKER_MOVED_AFTER_PATCH_PREPARATION/);assert.equal(h.events.some(e=>/stage|activate/.test(e)),false);
});
test('collector inherits every existing variable and secret only from the exact active latest version',()=>{
 const settings={compatibility_date:'2026-09-11',bindings:[{name:'DATA_DB',type:'d1',id:'057a2847-2cc4-4e52-8534-1be1596d21d5'},{name:'CANONICAL_ARCHIVE_DB',type:'d1',id:'f66e7081-0e67-49a2-8f69-68af00cdaf92'},{name:'TELEGRAM_BOT_TOKEN',type:'secret_text'},{name:'DELIVERY_ENABLED',type:'plain_text',text:'0'},{name:'EXISTING_KV',type:'kv_namespace',namespace_id:'original'}]},args={settings,runtime:{compatibility_date:'2026-09-11',usage_model:'standard'},head,active_version:id(1),latest_uploaded_version:id(1)},m=collectorVersionMetadata(args);
 assert.equal(m.bindings.length,settings.bindings.length);assert.deepEqual(m.bindings.slice(2),settings.bindings.slice(2).map(b=>({name:b.name,type:'inherit'})));assert.doesNotMatch(JSON.stringify(m),/namespace_id|plain_text|secret_text/);assert.throws(()=>collectorVersionMetadata({...args,latest_uploaded_version:id(2)}));assert.throws(()=>collectorVersionMetadata({...args,settings:{...settings,bindings:[...settings.bindings,settings.bindings[0]]}}));
});
test('single-module readback preserves bytes for multipart and plain responses and rejects extra executable modules',async()=>{
 const bytes=Buffer.from('var x="исходные часы";\n');assert.deepEqual(await readSingleWorkerModule(new Response(bytes,{headers:{'content-type':'application/javascript'}})),bytes);
 const body=new FormData();body.set('metadata','{}');body.set('worker.js',new Blob([bytes],{type:'application/javascript+module'}),'worker.js');assert.deepEqual(await readSingleWorkerModule(new Response(body)),bytes);body.set('other.js',new Blob(['code']),'other.js');await assert.rejects(readSingleWorkerModule(new Response(body)),/EXACT_SINGLE_BUNDLED_WORKER_MODULE_REQUIRED/);
});
test('retained native forecast layout permits its matching non-executable Source Map and hashes only exact module bytes',async()=>{
 const bytes=Buffer.from('export default {fetch(){return new Response("исходные часы");}};\n'),form=new FormData(),name='liquidation-archive-worker-entry.js';
 form.set(name,new Blob([bytes],{type:'application/javascript+module'}),name);form.set(name+'.map',new Blob([JSON.stringify({version:3,file:name,sources:['original.mjs'],sourcesContent:['original source'],names:[],mappings:'AAAA'})],{type:'application/source-map'}),name+'.map');
 assert.deepEqual(await readSingleWorkerModule(new Response(form)),bytes);
});
test('a Source Map never admits a second executable, foreign asset, duplicate or malformed debug metadata',async()=>{
 const name='liquidation-archive-worker-entry.js',map={version:3,sources:['original.mjs'],mappings:'AAAA'};
 for(const kind of ['EXECUTABLE','FOREIGN','MIME','DUPLICATE','INVALID_JSON','WRONG_VERSION','WRONG_FILE']){
  const f=new FormData();f.set(name,new Blob(['code'],{type:'application/javascript+module'}),name);
  const body=kind==='INVALID_JSON'?'not JSON':JSON.stringify({...map,...(kind==='WRONG_VERSION'?{version:4}:{}),...(kind==='WRONG_FILE'?{file:'other.js'}:{})});
  const filename=kind==='EXECUTABLE'?'second.js':kind==='FOREIGN'?'unrelated.json':name+'.map';f.set(filename,new Blob([body],{type:kind==='MIME'?'application/javascript':'application/source-map'}),filename);
  if(kind==='DUPLICATE')f.append(filename,new Blob([body],{type:'application/source-map'}),filename);
  await assert.rejects(readSingleWorkerModule(new Response(f)),/EXACT_(?:SINGLE_BUNDLED_WORKER_MODULE|NONEXECUTABLE_SOURCE_MAP)_REQUIRED/,kind);
 }
});
test('default serialization is compared to the immutable active runtime; an existing variable never disappears from comparison',()=>{
 const old={bindings:[{name:'UNCHANGED',type:'plain_text',text:'0'}],compatibility_date:'2026-09-11'},runtime={compatibility_date:'2026-09-11T00:00:00Z',compatibility_flags:[],usage_model:'standard',limits:{cpu_ms:30000}},expanded={...old,compatibility_flags:[],usage_model:'standard',limits:runtime.limits};
 assert.equal(workerSettingsFingerprint(old,runtime),workerSettingsFingerprint(expanded,runtime));assert.notEqual(workerSettingsFingerprint(old),workerSettingsFingerprint(expanded));assert.ok(runtimeSettingsSerializationHashes(expanded,runtime).includes(workerSettingsFingerprint(old)));assert.equal(runtimeSettingsSerializationHashes({...expanded,bindings:[{...old.bindings[0],text:'1'}]},runtime).includes(workerSettingsFingerprint(old)),false);
});
test('only the exact retained unactivated own version can resume and a real settings change cannot masquerade as default serialization',()=>{
 const prior=JSON.parse(gunzipSync(fs.readFileSync(new URL('../checkpoints/coordinated-rollout-20261015/refused-collector369-38697736170/proof.json.gz',import.meta.url)))),w=prior.workers[0],current={...w.before,runtime_serialization_hashes:[w.before.settings_sha256]},args={prior,current,expected_module_sha256:w.expected_module_sha256,latest_uploaded_version:w.staged.version_id};
 assert.equal(resumeOwnUnactivatedCollector(args).version_id,w.staged.version_id);assert.throws(()=>resumeOwnUnactivatedCollector({...args,latest_uploaded_version:id(99)}));assert.throws(()=>resumeOwnUnactivatedCollector({...args,current:{...current,runtime_serialization_hashes:['different-binding-values']}}));assert.throws(()=>resumeOwnUnactivatedCollector({...args,prior:{...prior,workers:[{...w,activation_intent:{ts:1}}]}}));
});

test('hourly native observer is confined to the single existing history Worker and retains exact rollback',async()=>{
 const h=harness({historyObserverPatch:true}),p=await h.run(true);assert.equal(p.status,'CURRENT_HOURLY_NATIVE_COST_OBSERVER_EXACTLY_INSTALLED');assert.equal(p.workers.length,1);assert.equal(p.workers[0].name,'my-report-2-free-history');assert.equal(h.events.includes('collector'),false);assert.equal(p.D1,0);assert.equal(p.sourceHTTP,0);assert.equal(p.production_scope_changed,false);
 const failed=harness({historyObserverPatch:true}),activate=failed.adapter.activate;failed.adapter.activate=async(w,v)=>{await activate(w,v);if(v!==failed.original[0].version_id)failed.states[0].module_sha256='bad';};await assert.rejects(failed.run(true));assert.equal(failed.states[0].version_id,failed.original[0].version_id);assert.equal(failed.saved.at(-1).rollback[0].status,'ORIGINAL_VERSION_AND_SETTINGS_RESTORED');
 const wrong=harness({historyObserverPatch:true});wrong.plan.workers[0].name='my-report-2-hub';await assert.rejects(wrong.run(true),/EXACT_CONNECTED/);assert.equal(wrong.events.length,0);
});

test('SQL bridge counter rollout is a single-worker transaction with exact own rollback and no Hub/history adoption',async()=>{const h=harness({bridgeCounterPatch:true}),p=await h.run(true);assert.equal(p.status,'CURRENT_SQL_BRIDGE_COUNTER_REPAIR_EXACTLY_INSTALLED');assert.equal(p.workers[0].name,'my-report-2-d1-bridge');assert.equal(p.workers.length,1);assert.equal(h.events.includes('collector'),false);assert.equal(p.D1,0);const fail=harness({bridgeCounterPatch:true}),activate=fail.adapter.activate;fail.adapter.activate=async(w,v)=>{await activate(w,v);if(v!==fail.original[0].version_id)fail.states[0].module_sha256='bad';};await assert.rejects(fail.run(true));assert.equal(fail.states[0].version_id,fail.original[0].version_id);assert.equal(fail.saved.at(-1).rollback[0].status,'ORIGINAL_VERSION_AND_SETTINGS_RESTORED');const wrong=harness({bridgeCounterPatch:true});wrong.plan.workers[0].name='my-report-2-hub';await assert.rejects(wrong.run(true),/EXACT_CONNECTED/);assert.equal(wrong.events.length,0);});
