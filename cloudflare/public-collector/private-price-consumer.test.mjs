import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {encodeCanonicalPublicationRow} from '../../runner/canonical-cold-archive.mjs';
import {privateCanonicalHeader} from '../../current-generation/files/src/private-canonical-history.mjs';
import {nativeMeasuredD1} from '../free-history/native-measured-d1.mjs';
import {runPrivatePriceRechecks,reservePrivatePriceBudget,PRIVATE_PRICE_POLICY} from './private-price-consumer.mjs';
import {buildPrivatePriceRuntime,injectPrivatePriceRuntime} from './private-price-bundle.mjs';
import {patchWorker} from './patch-worker.mjs';
import {loadExactCollector} from './github-backup.mjs';
const tail=fs.readFileSync(new URL('./injected-worker-tail.js',import.meta.url),'utf8');
const api=Function('worker_default',tail+'\nreturn {check:__report2RunPriceRechecks,stable:__report2PriceStable};')({});
const T=Date.UTC(2026,9,14,4,0),now=T+300000,publication_id='PUB:'+'a'.repeat(40);
const ledger='CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,state TEXT,started_ts INTEGER,completed_ts INTEGER,source_run_id TEXT,measured_rows_read INTEGER,measured_rows_written INTEGER,measured_requests INTEGER,unknown_ops INTEGER);CREATE INDEX ledger_day ON report2_runner_budget_ledger_shadow(day_utc);';
class D1{
 constructor(privateOnly=false){this.raw=new DatabaseSync(':memory:');this.calls=[];this.fail=false;this.missingBilling=false;if(privateOnly)this.raw.exec(fs.readFileSync(new URL('../free-history/003_canonical_cold_archive.sql',import.meta.url),'utf8'));else{this.raw.exec(fs.readFileSync(new URL('../../post-v7-consolidated/post-v7/migrations.sql',import.meta.url),'utf8'));for(const file of ['004_market_snapshot_batch.sql','009_public_collector_runtime.sql'])this.raw.exec(fs.readFileSync(new URL('../../current-generation/migrations/'+file,import.meta.url),'utf8'));this.raw.exec(ledger+'CREATE TABLE v3_telegram_dispatch_shadow(idempotency_key TEXT PRIMARY KEY,contract TEXT,direction TEXT,wave_id TEXT,state TEXT,telegram_message_id TEXT);CREATE TABLE v3_user_lifecycle_shadow(contract TEXT,direction TEXT,wave_id TEXT,rules_version TEXT,status TEXT,observation_ts INTEGER,PRIMARY KEY(contract,direction,wave_id,rules_version));');}}
 prepare(sql){const db=this;let args=[];return{bind(...values){args=values;return this;},async first(){return(await this.all()).results[0]??null;},async all(){db.calls.push(sql);if(db.fail)throw Error('LOST_REPLY');const indices=[],query=sql.replace(/\?(\d+)/g,(_,n)=>{indices.push(+n-1);return '?';}),rows=db.raw.prepare(query).all(...(indices.length?indices.map(i=>args[i]):args));return{success:true,results:rows,...(db.missingBilling?{}:{meta:{rows_read:rows.length,rows_written:0}})};},async run(){db.calls.push(sql);if(db.fail)throw Error('LOST_REPLY');const indices=[],query=sql.replace(/\?(\d+)/g,(_,n)=>{indices.push(+n-1);return '?';}),changes=Number(db.raw.prepare(query).run(...(indices.length?indices.map(i=>args[i]):args)).changes);return{success:true,results:[],meta:{changes,rows_read:0,rows_written:changes}};}};}
 async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out;}
 close(){this.raw.close();}
}
function original(){const c={status:'CLOSED',state:'OBSERVE',run_id:'CONTROLLED_PRICE_RUN',snapshot_id:'CONTROLLED_PRICE_SNAPSHOT',observed_ts:T,direction:'LONG',metadata:{contract:'ADA-USDT'},trigger:{metric:'price',operator:'>=',value:.285132,unit:'USDT',cancel_condition:'price<0.261865',next_recheck_ts:now,expires_ts:T+1800000}};c.analytical_fingerprint=createHash('sha256').update(JSON.stringify(api.stable(c))).digest('hex');return{publication_id,contract_code:'ADA-USDT',direction:'LONG',run_id:c.run_id,snapshot_id:c.snapshot_id,wave_id:'W',observed_ts:T,canonical_state:'OBSERVE',analytical_fingerprint:c.analytical_fingerprint,canonical_json:JSON.stringify(c),presentation_inputs_json:'{}',created_ts:T};}
function seed(source,row){const columns=Object.keys(row);source.raw.prepare('INSERT INTO canonical_publication_shadow('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(row));source.raw.prepare("INSERT INTO v3_recheck_task_shadow(task_id,publication_id,contract_code,direction,wave_id,snapshot_id,run_id,due_ts,expires_ts,state,created_ts,updated_ts) VALUES('TASK',?,'ADA-USDT','LONG','W',?,?,?,?,'PENDING',?,?)").run(row.publication_id,row.snapshot_id,row.run_id,now,T+1800000,T,T);source.raw.prepare("INSERT INTO v3_dispatch_publication_binding_shadow(idempotency_key,publication_id,contract_code,direction,wave_id,lifecycle_event,rules_version,snapshot_id,run_id,observed_ts,analytical_fingerprint,presentation_hash,created_ts) VALUES('KEY',?,'ADA-USDT','LONG','W','OBSERVE','v3',?,?,?,?,?,?)").run(row.publication_id,row.snapshot_id,row.run_id,T,row.analytical_fingerprint,'CONTROLLED',T);source.raw.exec("INSERT INTO v3_telegram_dispatch_shadow VALUES('KEY','ADA-USDT','LONG','W','SENT','9001');INSERT INTO v3_user_lifecycle_shadow VALUES('ADA-USDT','LONG','W','v3','OBSERVE',"+T+")");}
function store(db,record){db.raw.prepare('INSERT INTO report2_canonical_cold_archive_v1 VALUES(?,?,?,?,?,?,?,?)').run(record.publication_id,record.raw_sha256,record.run_id,record.snapshot_id,record.contract_code,record.observed_ts,JSON.stringify(record),T+1);}
const args=(price=.28,ts=now)=>({rows:[{contract:'ADA-USDT',catalog_active:true,source_status:'CLOSED',price,observed_ts:ts}],market_source_ts:ts,bucket:Math.floor(ts/300000)*300000,now:ts});
const setup=()=>{const source=new D1(),archive=new D1(true);return{source,archive,close(){source.close();archive.close();}};};
const run=(s,a=args(),runtime=runPrivatePriceRechecks)=>runtime({source_db:s.source,private_db:s.archive,check:api.check,args:a});

test('exact hot and archived revisions produce identical waiting, reached, cancellation and expiry receipts',async()=>{
 for(const [price,ts,status] of [[.28,now,'WAITING_FOR_PRICE'],[.286,now,'TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED'],[.26,now,'CANCELLED'],[.28,T+1800000,'EXPIRED']]){
  const hot=setup(),cold=setup(),row=original(),record=encodeCanonicalPublicationRow(row);
  try{seed(hot.source,row);seed(cold.source,await privateCanonicalHeader(row,record));store(cold.archive,record);const a=await run(hot,args(price,ts)),b=await run(cold,args(price,ts));assert.equal(a.results[0].status,status);assert.deepEqual(a.results,b.results);assert.equal(b.results[0].entry_authorized,false);assert.equal(b.private_D1.requests,1);assert.equal(b.D1.unknown_ops,0);assert.equal(b.source_http,0);assert.deepEqual(cold.source.raw.prepare('SELECT state,last_result,expires_ts FROM v3_recheck_task_shadow').get(),hot.source.raw.prepare('SELECT state,last_result,expires_ts FROM v3_recheck_task_shadow').get());assert.equal(cold.source.raw.prepare('SELECT canonical_json FROM canonical_publication_shadow').get().canonical_json,(await privateCanonicalHeader(row,record)).canonical_json);}finally{hot.close();cold.close();}
 }
});

test('additional private archive is consumed by the bundled price reader with exact original clocks and measured cost',async()=>{
 for(const bundled of [false,true]){
  const s=setup(),extra=new D1(true),row=original(),record=encodeCanonicalPublicationRow(row);
  try{
   seed(s.source,await privateCanonicalHeader(row,record,{archive_slot:'A1'}));store(extra,record);
   const runtime=bundled?Function(buildPrivatePriceRuntime().source+'return __report2InjectedPrivatePriceRuntime;')().runPrivatePriceRechecks:runPrivatePriceRechecks;
   const r=await runtime({source_db:s.source,private_db:s.archive,private_dbs:{A1:extra},check:api.check,args:args()});
   assert.equal(r.checked,1);assert.equal(r.private_D1.requests,1);assert.equal(r.D1.unknown_ops,0);assert.equal(extra.calls.length,1);assert.equal(s.archive.calls.length,0);assert.equal(r.results[0].snapshot_id,row.snapshot_id);assert.equal(r.entry_authorized,false);
   assert.equal(s.source.raw.prepare('SELECT reserve_rows_read FROM report2_runner_budget_ledger_shadow').get().reserve_rows_read,800);
  }finally{s.close();extra.close();}
 }
});

test('lost additional-archive replies remain unknown in the existing ledger and keep the task pending',async()=>{
 const s=setup(),extra=new D1(true),row=original(),record=encodeCanonicalPublicationRow(row);
 try{
  seed(s.source,await privateCanonicalHeader(row,record,{archive_slot:'A1'}));extra.fail=true;
  const r=await runPrivatePriceRechecks({source_db:s.source,private_db:s.archive,private_dbs:{A1:extra},check:api.check,args:args()});
  assert.equal(r.checked,0);assert.equal(r.D1.unknown_ops,1);assert.equal(r.private_D1.unknown_ops,1);assert.equal(s.archive.calls.length,0);
  assert.equal(s.source.raw.prepare('SELECT unknown_ops FROM report2_runner_budget_ledger_shadow').get().unknown_ops,1);assert.equal(s.source.raw.prepare('SELECT last_result FROM v3_recheck_task_shadow').get().last_result,null);
 }finally{s.close();extra.close();}
});
test('missing revision remains pending and retries next slot with its original snapshot, clocks and expiry',async()=>{
 const s=setup(),row=original(),record=encodeCanonicalPublicationRow(row);
 try{seed(s.source,await privateCanonicalHeader(row,record));const a=await run(s);assert.equal(a.results[0].status,'PRIVATE_CANONICAL_RETRY_REQUIRED');assert.equal(s.source.raw.prepare('SELECT last_result FROM v3_recheck_task_shadow').get().last_result,null);store(s.archive,record);const b=await run(s,args(.28,now+300000));assert.equal(b.checked,1);assert.equal(b.results[0].snapshot_id,row.snapshot_id);assert.equal(s.source.raw.prepare('SELECT observed_ts FROM canonical_publication_shadow').get().observed_ts,T);assert.equal(s.source.raw.prepare('SELECT expires_ts FROM v3_recheck_task_shadow').get().expires_ts,T+1800000);}finally{s.close();}
});
test('foreign or corrupt private revision cannot produce a price/cancellation acknowledgement',async()=>{
 for(const mutate of [r=>({...r,gzip_sha256:'0'.repeat(64)}),r=>({...r,snapshot_id:'FOREIGN'})]){const s=setup(),row=original(),record=encodeCanonicalPublicationRow(row);try{seed(s.source,await privateCanonicalHeader(row,record));store(s.archive,mutate(record));const r=await run(s);assert.equal(r.checked,0);assert.equal(r.results[0].status,'PRIVATE_CANONICAL_RETRY_REQUIRED');assert.equal(s.source.raw.prepare('SELECT updated_ts,last_result FROM v3_recheck_task_shadow').get().updated_ts,T);}finally{s.close();}}
});
test('shared atomic caps refuse a duplicate primary/backup slot and retain failed attempts',async()=>{
 const s=setup();try{seed(s.source,original());const a=await run(s),b=await run(s);assert.equal(a.checked,1);assert.equal(b.admission.allowed,false);assert.equal(b.checked,0);assert.equal(s.source.raw.prepare('SELECT COUNT(*) AS n FROM report2_runner_budget_ledger_shadow').get().n,1);assert.equal(s.source.raw.prepare('SELECT reserve_rows_read,state FROM report2_runner_budget_ledger_shadow').get().reserve_rows_read,800);}finally{s.close();}
 for(const patch of [{reads:3500000,writes:0,unknown:0},{reads:0,writes:70000,unknown:0},{reads:0,writes:0,unknown:1},{reads:0,writes:0,unknown:null}]){const d=new D1();try{d.raw.prepare("INSERT INTO report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts,unknown_ops) VALUES('prior',?,?,?,'FINALIZED',?,?)").run(new Date(now).toISOString().slice(0,10),patch.reads,patch.writes,T,patch.unknown);const r=await reservePrivatePriceBudget(nativeMeasuredD1(d),{bucket:now,now});assert.equal(r.allowed,false);}finally{d.close();}}
 assert.equal(PRIVATE_PRICE_POLICY.max_runs_day*PRIVATE_PRICE_POLICY.rows_read,230400);
 assert.equal(PRIVATE_PRICE_POLICY.max_runs_day*PRIVATE_PRICE_POLICY.rows_written,9216);
});
test('lost or unmeasured archive reply is recorded as unknown and never advances the pending task',async()=>{
 for(const mode of ['fail','missingBilling']){const s=setup(),row=original(),record=encodeCanonicalPublicationRow(row);try{seed(s.source,await privateCanonicalHeader(row,record));s.archive[mode]=true;const r=await run(s);assert.equal(r.checked,0);assert.equal(r.D1.unknown_ops,1);assert.equal(s.source.raw.prepare('SELECT unknown_ops FROM report2_runner_budget_ledger_shadow').get().unknown_ops,1);assert.equal(s.source.raw.prepare('SELECT last_result FROM v3_recheck_task_shadow').get().last_result,null);}finally{s.close();}}
});
test('deployed no-bundle Worker and backup execute the same shared decoder and guard bytes',async()=>{
 const bundle=buildPrivatePriceRuntime(),bundled=Function(bundle.source+'return __report2InjectedPrivatePriceRuntime;')();
 for(const file of bundle.manifest)assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../../'+file.path,import.meta.url))).digest('hex'),file.sha256);
 const prefix='const worker_default={};\n',base=prefix+'var __REPORT2_PUBLIC_COLLECTOR_VERSION = "report2-public-collector-v9-retained-price-checks-20261009";\nexport {\n  __REPORT2_PUBLIC_COLLECTOR_HANDLER as default\n};';
 const patched=patchWorker(base,injectPrivatePriceRuntime(tail).source);assert.equal(patched.source.slice(0,prefix.length),prefix);assert.equal(patched.source.match(/__REPORT2_PUBLIC_COLLECTOR_HANDLER as default/g).length,1);
 const a=setup(),b=setup(),row=original(),record=encodeCanonicalPublicationRow(row);
 try{for(const s of [a,b]){seed(s.source,await privateCanonicalHeader(row,record));store(s.archive,record);}assert.deepEqual((await run(a)).results,(await run(b,args(),bundled.runPrivatePriceRechecks)).results);}finally{a.close();b.close();}
});
test('full primary and backup collectors consume an archived SENT trigger with the same four HTX requests',async()=>{
 const oldFetch=globalThis.fetch,oldNow=Date.now,logs=[],oldLog=console.log;let calls=0;Date.now=()=>now;console.log=(...v)=>logs.push(v);
 const fetcher=async url=>{calls++;const s=String(url),contract_code='ADA-USDT',data=s.includes('batch_merged')?{ticks:[{contract_code,close:.286,trade_turnover:1e6,ts:now}]}:s.includes('swap_open_interest')?{data:[{contract_code,volume:10,value:1000}]}:s.includes('swap_batch_funding_rate')?{data:[{contract_code,funding_rate:0}]}:s.includes('swap_contract_info')?{data:[{contract_code,contract_status:1,business_type:'swap',contract_size:1}]}:null;assert(data,'NO_EXTRA_PROVIDER_OR_TELEGRAM_CALL');return Response.json({status:'ok',ts:now,...data});};globalThis.fetch=fetcher;
 try{const injected=injectPrivatePriceRuntime(tail).source,primary=Function('worker_default',injected+'return __report2PublicCollectorScheduled;')({}),backup=loadExactCollector(tail,fetcher,{runPrivatePriceRechecks}),receipts=[];
  for(const collector of [primary,backup]){const s=setup(),row=original(),record=encodeCanonicalPublicationRow(row);try{seed(s.source,await privateCanonicalHeader(row,record));store(s.archive,record);await collector({scheduledTime:now},{DATA_DB:s.source,CANONICAL_ARCHIVE_DB:s.archive,PRICE_RECHECK_ENABLED:'1',PUBLIC_COLLECTOR_ENABLED:'1',ANALYTICS_ENABLED:'0',DELIVERY_ENABLED:'0',REPORT2_CURRENT_GENERATION:'MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V12_CONTRACT_INTEGRITY_20M'});receipts.push(JSON.parse(s.source.raw.prepare('SELECT last_result FROM v3_recheck_task_shadow').get().last_result));assert.equal(s.source.raw.prepare('SELECT state FROM report2_public_collector_usage_v1').get().state,'CLOSED');}finally{s.close();}}
  assert.equal(calls,8);assert.deepEqual(receipts[0],receipts[1]);assert.equal(receipts[0].status,'TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED');assert.equal(receipts[0].entry_authorized,false);assert.equal(logs.filter(v=>v[0]==='REPORT2_LIGHT_PRICE_RECHECK').length,2);
 }finally{globalThis.fetch=oldFetch;Date.now=oldNow;console.log=oldLog;}
});
