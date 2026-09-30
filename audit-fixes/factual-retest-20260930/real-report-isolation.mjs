import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const repo=path.resolve('..'),root=process.cwd(),output=path.join(repo,'audit-output');
fs.mkdirSync(output,{recursive:true});
const mod=name=>import(pathToFileURL(path.join(root,name)).href);
const {RemoteD1Database}=await mod('report2-d1-adapter.mjs');
const original=RemoteD1Database.prototype._request;
const remote=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const schema=await remote.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL").all();
const local=new DatabaseSync(':memory:'),tables=new Set();
const isolated=name=>name==='canonical_publication_shadow'||name==='report2_command_v2'||/^v3_(telegram_|user_lifecycle_|dispatch_publication_|pipeline_health)/.test(name);
for(const row of schema.results){try{local.exec(row.sql);tables.add(row.name);}catch(error){if(isolated(row.name))throw error;}}
assert.ok(tables.has('canonical_publication_shadow')&&tables.has('report2_command_v2'),'exact isolation schemas required');
const localOnly=sql=>[...tables].some(name=>isolated(name)&&new RegExp(`\\b${name}\\b`,'i').test(sql));
const args=(sql,params=[])=>{const indexes=[];const query=sql.replace(/\?(\d+)/g,(_,n)=>{indexes.push(Number(n)-1);return '?';});return [query,indexes.length?indexes.map(i=>params[i]):params];};
let isolatedReads=0,isolatedWrites=0,telegramNetworkCalls=0;
function localRequest(db,payload){
 const [sql,parameters]=args(payload.sql,payload.params),stmt=local.prepare(sql);
 let result,read=0,written=0;
 if(payload.op==='first'){const row=stmt.get(...parameters)??null;read=row?1:0;result=payload.column&&row?row[payload.column]:row;}
 else if(payload.op==='all'){const rows=stmt.all(...parameters);read=rows.length;result={results:rows,success:true,meta:{rows_read:read,rows_written:0,changes:0}};}
 else if(payload.op==='raw'){const rows=stmt.all(...parameters);read=rows.length;result=rows.map(Object.values);}
 else {const ack=stmt.run(...parameters);written=Number(ack.changes);result={success:true,meta:{changes:written,rows_read:0,rows_written:written}};}
 isolatedReads+=read;isolatedWrites+=written;
 db._recordSingle(payload.op,payload.sql,{measured:true,rows_read:read,rows_written:written});
 return result;
}
RemoteD1Database.prototype._request=async function(payload){
 if(payload.op==='batch'&&payload.statements.some(s=>localOnly(s.sql))){const results=[];for(const statement of payload.statements)results.push(await this._request({op:'run',...statement}));return results;}
 if(payload.sql&&localOnly(payload.sql))return localRequest(this,payload);
 const result=await original.call(this,payload);
 // Shared research/budget writes keep their actual production ACK. Mirror
 // these factual rows locally so joins with isolated publication rows work.
 for(const p of payload.op==='batch'?payload.statements:[payload])if(/^(?:\s*)(?:INSERT|UPDATE|DELETE)\b/i.test(p.sql||'')){try{const [sql,parameters]=args(p.sql,p.params);local.prepare(sql).run(...parameters);}catch{}}
 return result;
};
const fetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=async(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input));if(url.hostname==='api.telegram.org'||/\/telegram(?:-test|-shadow-test)?\/?$/.test(url.pathname)){telegramNetworkCalls++;throw Error('REAL_ACCEPTANCE_TELEGRAM_NETWORK_FORBIDDEN');}return fetch(input,init);};
assert.equal(process.env.DELIVERY_ENABLED,'0');
assert.equal(process.env.REPORT2_V3_TELEGRAM_NETWORK_ENABLED,'0');
assert.equal(process.env.REPORT2_TELEGRAM_OUTPUT_ENABLED,'0');
const {enqueueCommand}=await mod('src/durable-command-queue.mjs');
const now=Date.now(),command_id=`CMD:SOURCE_BINDING_ACCEPTANCE:${process.env.GITHUB_RUN_ID}:${now}`;
const contract=process.env.REPORT2_MANUAL_COIN_CONTRACT||null;
await enqueueCommand(remote,{command_id,mode:contract?'MANUAL_COIN':'FULL_MANUAL',contract,request_channel:'ISOLATED_CLOUD_ACCEPTANCE',received_at:now,deadline:now+10*60000,generation:process.env.REPORT2_CURRENT_GENERATION});
process.env.REPORT2_COMMAND_ID=command_id;
// Compare both adapters on the SAME genuine inputs from this real report.
fs.copyFileSync(path.join(root,'src/canonical-runtime-adapter.mjs'),path.join(root,'src/canonical-runtime-adapter.accepted.mjs'));
fs.copyFileSync(path.join(repo,'audit-fixes/factual-retest-20260930/adapter-before.mjs'),path.join(root,'src/canonical-runtime-adapter.baseline.mjs'));
fs.writeFileSync(path.join(root,'src/canonical-runtime-adapter.mjs'),`import assert from 'node:assert/strict';\nimport * as candidate from './canonical-runtime-adapter.accepted.mjs';\nimport * as baseline from './canonical-runtime-adapter.baseline.mjs';\nexport * from './canonical-runtime-adapter.accepted.mjs';\nexport function buildRuntimeCanonicalBundle(input){const next=candidate.buildRuntimeCanonicalBundle(input),old=baseline.buildRuntimeCanonicalBundle(input);for(const key of ['state','direction','scores','entry','trigger','invalidation','targets','hard_gates','early_candidate','opportunity','liquidations'])assert.deepEqual(next.canonical[key],old.canonical[key],'REAL_STRATEGY_INVARIANT:'+key);globalThis.__report2AcceptanceComparisons.push({contract:input.contract,snapshot_id:input.snapshot_id,observed_ts:input.observed_ts,sealed_status:input.full_evidence_proof?.status??null,old_origins:[...new Set((old.canonical.metadata.source_role_view?.classified||[]).filter(x=>x.role_evidence_usable).map(x=>x.independence_group))],new_origins:[...new Set((next.canonical.metadata.source_role_view?.classified||[]).filter(x=>x.role_evidence_usable).map(x=>x.independence_group))],strategy_unchanged:true});return next;}\n`);
globalThis.__report2AcceptanceComparisons=[];
let finishing=false;
process.on('beforeExit',async()=>{
 if(finishing)return;finishing=true;
 const rows=local.prepare('SELECT * FROM canonical_publication_shadow ORDER BY observed_ts').all();
 const pub=await mod('src/canonical-publication.mjs'),sender=await mod('src/bound-telegram-delivery-sidecar.mjs');
 const assessments=rows.map(row=>({publication_id:row.publication_id,contract:row.contract_code,...pub.assessActionability({canonical:JSON.parse(row.canonical_json),lifecycle_event:row.canonical_state==='OBSERVE'?'OBSERVE':row.canonical_state==='WAIT_FOR_TRIGGER'?'WAIT':'ENTRY'})}));
 const captured=[];let dispatchSeeded=0;
 // A manual report intentionally has no scheduled Telegram event. For this
 // acceptance check only, derive a local PENDING event from its actual
 // actionable canonical wave. No source/score/plan or production queue changes.
 for(const assessment of assessments.filter(x=>x.deliver)){
  const row=rows.find(x=>x.publication_id===assessment.publication_id),c=JSON.parse(row.canonical_json);
  const wave=row.wave_id||c.early_candidate?.items?.[0]?.wave_id;
  assert.ok(wave,'actual canonical analytical wave required');
  const existing=local.prepare("SELECT 1 FROM v3_telegram_dispatch_shadow WHERE contract=? AND direction=? AND wave_id=? AND lifecycle_event='OBSERVE' LIMIT 1").get(row.contract_code,c.direction,wave);
  if(existing)continue;
  local.prepare(`INSERT INTO v3_user_lifecycle_shadow(contract,direction,wave_id,rules_version,status,reason,observation_ts,valid_until_ts,updated_ts,shadow_only) VALUES(?,?,?,?,?,?,?,?,?,1) ON CONFLICT(contract,direction,wave_id,rules_version) DO NOTHING`).run(row.contract_code,c.direction,wave,'v3','OBSERVE','ISOLATED_ACTUAL_CANONICAL_TRANSPORT_CHECK',c.observed_ts,c.trigger.expires_ts,Date.now());
  local.prepare(`INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts,shadow_only) VALUES(?,?,?,?,?,?,?,'PENDING',?,?,1)`).run(`ACCEPTANCE:${row.publication_id}`,`ACCEPTANCE:${row.publication_id}`,row.contract_code,c.direction,wave,'OBSERVE','v3',Date.now(),Date.now());
  dispatchSeeded++;
 }
 if(!process.exitCode&&assessments.some(x=>x.deliver))await sender.runBoundTelegramDeliverySidecar(remote,{enabled:true,relay_url:'https://transport-capture.invalid/no-network',relay_key:'ISOLATED_CAPTURE_ONLY',source_run_id:rows.at(-1)?.run_id,now_ts:Date.now(),fetch_impl:async(url,options)=>{captured.push(JSON.parse(options.body));return new Response(JSON.stringify({ok:false,error:'ISOLATED_DRY_RUN_NO_TELEGRAM'}),{status:503,headers:{'content-type':'application/json'}});}});
 const comparisons=globalThis.__report2AcceptanceComparisons;
 const passed=!process.exitCode&&rows.length>0&&comparisons.length>0&&comparisons.every(x=>x.strategy_unchanged)&&captured.length>0&&telegramNetworkCalls===0;
 const receipt={schema:'real-cloud-report-source-binding-acceptance-v1',status:passed?'PASS':process.exitCode?'REAL_REPORT_FAILED':'NO_CURRENT_PAYLOAD_PROVEN',head:process.env.GITHUB_SHA,worker_sha256:process.env.REPORT2_EXPECTED_WORKER_SHA,command_id,canonical_count:rows.length,comparisons,assessments,captured,telegram_network_calls:telegramNetworkCalls,telegram_sent:0,fabricated_ack:false,isolated_publication_rows:true,isolated_command:true,dispatch_seeded_for_transport_check:dispatchSeeded,automatic_scheduled_enqueue_proven:false,isolated_reads:isolatedReads,isolated_writes:isolatedWrites,production_replaced:false};
 fs.writeFileSync(path.join(output,'real-report-source-binding.json'),JSON.stringify(receipt,null,2));
 console.log('REAL_REPORT_SOURCE_BINDING_ACCEPTANCE',JSON.stringify(receipt));
 if(!passed)process.exitCode=process.exitCode||2;
});
