// UNEXECUTED. One future central common only. No test registration or auto-run.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const sha=b=>createHash('sha256').update(b).digest('hex');
const T=Date.UTC(2026,9,20,12,0,0);
const PREFIX='checkpoints/source-worker-provider-latency-contract-20261020';

// Existing LocalSQLite/D1 adapter pattern; records SQL, never native billing.
class LocalD1 {
 constructor(){this.sqlite=new DatabaseSync(':memory:');this.log=[];this.executed=[];this.unknown=0;this.beforeRun=null;}
 prepare(sql){const db=this;const bind=params=>({
  bind:(...xs)=>bind(xs),
  async run(){const e={op:'run',sql,params:[...params]};db.log.push(e);if(db.beforeRun)await db.beforeRun(e);const r=db.sqlite.prepare(sql).run(...params);db.executed.push(e);return{success:true,meta:{changes:Number(r.changes)}};},
  async first(){const e={op:'first',sql,params:[...params]};db.log.push(e);db.executed.push(e);return db.sqlite.prepare(sql).get(...params)??null;}
 });return bind([]);}
 async batch(statements){this.sqlite.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());this.sqlite.exec('COMMIT');return rows;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
 usageSnapshot(){return{unknown_ops:this.unknown};}
 seed(provider,id,units,at){this.sqlite.prepare('INSERT INTO report2_provider_minute_ledger_v1(provider,minute_bucket,reservation_id,units,created_ts) VALUES(?,?,?,?,?)').run(provider,Math.floor(T/60000)*60000,id,units,at);}
 rows(){return this.sqlite.prepare('SELECT provider,reservation_id,units,created_ts FROM report2_provider_minute_ledger_v1 ORDER BY provider,reservation_id').all();}
 close(){this.sqlite.close();}
}
async function modules(root){const get=n=>import(pathToFileURL(resolve(root,n)).href);const [minute,reference,store,http,policy]=await Promise.all(['provider-minute-ledger.mjs','provider-reference-cache.mjs','evidence-source-store.mjs','unified-budget.mjs','evidence-source-adapters.mjs'].map(get));return{minute,reference,store,http,policy};}
async function dbFor(m){const db=new LocalD1();await m.minute.installProviderMinuteLedger(db);db.log=[];db.executed=[];return db;}
const request=(provider,id,cap,now=T,units=1)=>({provider,reservation_id:id,cap,now,units});
const signatures=rows=>rows.map(({op,params})=>({op,params}));

async function shortRace(m,provider,cap){
 const db=await dbFor(m);let release=()=>{};
 try{
  db.seed(provider,'SEED',cap-1,T-10000);
  let reached;const ready=new Promise(r=>reached=r),paused=new Promise(r=>release=r);
  db.beforeRun=async e=>{if(e.sql.startsWith('INSERT INTO report2_provider_minute_ledger_v1')&&e.params[2]==='A'){reached();await paused;}};
  const pending=m.minute.reserveProviderMinuteUnits(db,request(provider,'A',cap));
  await Promise.race([ready,pending.then(()=>{throw Error('CONTROLLED_A_DID_NOT_REACH_ATOMIC_INSERT');})]);
  const b=await m.minute.reserveProviderMinuteUnits(db,request(provider,'B',cap,T+1000));
  release();const a=await pending;
  return{a,b,rows:db.rows(),log:db.log,executed:db.executed,logical_schedule:'CONTROLLED seed dispatch T-10s; B dispatch T+1s; A dispatch T+2s only if allowed; NOT native wall duration'};
 }finally{release();db.close();}
}

async function prestate(m,{rows=[],req=request('COINPAPRIKA_IDENTITY','NEW',2),unknown=0}={}){
 const db=await dbFor(m);
 try{for(const r of rows)db.seed(...r);db.unknown=unknown;const result=await m.minute.reserveProviderMinuteUnits(db,req);return{result,log:db.log,rows:db.rows()};}finally{db.close();}
}

async function readerCut(m){
 const db=await dbFor(m);
 try{
  await m.store.installEvidenceSourceStore(db);
  db.seed('COINPAPRIKA_IDENTITY','SEED',1,T-10000);db.seed('COINPAPRIKA_IDENTITY','B',1,T+1000);
  const budget=m.http.createUnifiedHttpBudget();let transports=0;
  const reader=m.reference.createProviderReferenceReader({db,source:'COINPAPRIKA_HTX_IDENTITY',run_id:'CONTROLLED_SHORT_VISIBILITY',now:T,clock:()=>T,daily_cap:12,minute_provider:'COINPAPRIKA_IDENTITY',minute_cap:2,request_admit:budget.reserve,fetch_impl:async()=>{transports++;return new Response('{}',{status:200});}});
  const value=await reader.get('EXACT_COIN_METADATA','https://api.coinpaprika.com/v1/coins/pepe-pepe',{shape:p=>p&&typeof p==='object'});
  return{value,summary:reader.summary(),transports,whole:budget.summary(),daily:db.sqlite.prepare('SELECT source,day_utc,attempts FROM report2_evidence_source_daily').all(),reservations:db.sqlite.prepare('SELECT source,day_utc,attempts FROM report2_evidence_source_reservation').all()};
 }finally{db.close();}
}

// Both roots end in actual src; caller must supply a full assembled baseline.
export async function runProviderMinuteFutureVisibilityConnected({runtime_root,baseline_runtime_root,repo_root}={}){
 assert.ok(runtime_root&&baseline_runtime_root&&repo_root);
 assert.notEqual(resolve(runtime_root),resolve(baseline_runtime_root));
 const pins=JSON.parse(await readFile(resolve(repo_root,PREFIX,'target-bindings.json'),'utf8'));
 for(const [root,hash] of [[runtime_root,pins.target.after_sha256],[baseline_runtime_root,pins.target.before_sha256]])assert.equal(sha(await readFile(resolve(root,'provider-minute-ledger.mjs'))),hash);
 for(const p of pins.unchanged_dependencies)for(const root of [runtime_root,baseline_runtime_root])assert.equal(sha(await readFile(resolve(root,p.name))),p.sha256);
 const before=await modules(baseline_runtime_root),after=await modules(runtime_root),controls=[],witnesses=[];
 const check=(name,fn,witness)=>{fn();controls.push(name);witnesses.push({name,...witness});};
 assert.equal(after.policy.SOURCE_POLICIES.COINPAPRIKA_HTX_IDENTITY.internal_minute_cap,2);
 assert.deepEqual(after.policy.SOURCE_POLICIES,before.policy.SOURCE_POLICIES);

 for(const [provider,cap] of [['COINPAPRIKA_IDENTITY',2],['COINGECKO',9]]){
  const old=await shortRace(before,provider,cap),candidate=await shortRace(after,provider,cap);
  check(`${provider}:short-out-of-order-new-id`,()=>{
   assert.equal(old.a.allowed,true);assert.equal(old.b.allowed,true);
   assert.equal(candidate.a.allowed,false);assert.equal(candidate.b.allowed,true);
   assert.equal(old.rows.some(r=>r.reservation_id==='A'),true);assert.equal(candidate.rows.some(r=>r.reservation_id==='A'),false);
   assert.deepEqual(signatures(candidate.log),signatures(old.log));assert.equal(candidate.log.length,6);
   assert.deepEqual(candidate.executed.filter(r=>r.op==='run').map(r=>r.params[2]),['B','A']);
  },{baseline:old,candidate});
 }

 const cases=[
  {name:'empty-valid-prestate-unchanged',same:true,options:{}},
  {name:'same-provider-future-denies-new-id',allowed:false,options:{rows:[['COINPAPRIKA_IDENTITY','FUTURE',1,T+1]]}},
  {name:'other-provider-future-does-not-block',same:true,options:{rows:[['OTHER_PROVIDER','FUTURE',1,T+1]]}},
  {name:'future-legacy-real-unit-remains-conservative',allowed:false,options:{rows:[['COINPAPRIKA_IDENTITY','REAL',0.5,T+1]]}},
  {name:'future-legacy-text-clock-remains-conservative',allowed:false,options:{rows:[['COINPAPRIKA_IDENTITY','TEXT_CLOCK',1,'UNKNOWN_CLOCK']]}},
  {name:'identical-future-id-legacy-readback-is-explicitly-unfixed',same:true,options:{rows:[['COINPAPRIKA_IDENTITY','NEW',1,T+1]]}},
  {name:'weighted-preexisting-cap-denial-unchanged',same:true,options:{rows:[['BINANCE','WEIGHTED',5,T-1]],req:request('BINANCE','NEW',6,T,2)}},
  {name:'equal-timestamp-unit-boundary-unchanged',same:true,options:{rows:[['COINPAPRIKA_IDENTITY','EQUAL',1,T]]}}
 ];
 for(const c of cases){
  const old=await prestate(before,c.options),candidate=await prestate(after,c.options);
  check(c.name,()=>{
   assert.ok(!candidate.result.allowed||old.result.allowed,'Same-prestate no-new-grants');
   assert.deepEqual(signatures(candidate.log),signatures(old.log));assert.equal(candidate.log.length,3);
   if(c.same){assert.deepEqual(candidate.result,old.result);assert.deepEqual(candidate.rows,old.rows);}if(c.allowed===false)assert.equal(candidate.result.allowed,false);
  },{baseline:old,candidate});
 }
 const closed=[];
 for(const options of [{unknown:1},{req:request('COINGECKO','INVALID',9,T,0)}]){
  const old=await prestate(before,options),candidate=await prestate(after,options);assert.deepEqual(candidate,old);assert.equal(candidate.result.allowed,false);assert.equal(candidate.log.length,0);closed.push({baseline:old,candidate});
 }
 check('existing-native-unknown-and-invalid-input-refuse-before-SQL',()=>assert.equal(closed.length,2),{variants:closed});
 const oldReader=await readerCut(before),candidateReader=await readerCut(after);
 check('actual-CP-reference-chain-atomic-denial-keeps-day-and-whole-reservations',()=>{
  assert.equal(oldReader.transports,1);assert.equal(candidateReader.transports,0);assert.equal(candidateReader.summary.admission.allowed,false);
  assert.equal(oldReader.whole.total,1);assert.equal(candidateReader.whole.total,1);assert.deepEqual(candidateReader.daily,oldReader.daily);assert.deepEqual(candidateReader.reservations,oldReader.reservations);assert.equal(candidateReader.daily[0].attempts,1);
 },{baseline:oldReader,candidate:candidateReader});
 return{schema:'PROVIDER_MINUTE_FUTURE_VISIBILITY_CONTROLLED_RESULT_V1',status:'CONTROLLED_COMPONENT_COMPLETED',controls,control_count:controls.length,witnesses,fixture_provenance:'ALL_CONTROLLED_ACTUAL_MODULES_LOCAL_SQLITE_NOT_NATIVE_BILLING',scope:'NEW_INSERT_FUTURE_VISIBILITY_ONLY',legacy_identical_id_redispatch_fixed:false,complete_dispatch_holding_deadline_daymonth_cutover_closed:false,source_caps_namespaces_bindings_statement_count_preserved:true,provider_HTTP:0,native_SQL:0,native_rows_read_cost:null,native_savings:null,admission_authorized:false,Telegram:0,prior_accepted_component_replayed:false};
}
