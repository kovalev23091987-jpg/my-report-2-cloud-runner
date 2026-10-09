import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {claimDueRecheck,requeueExpiredLease} from '../../current-generation/files/src/recheck-scheduler.mjs';
const source=fs.readFileSync(new URL('./injected-worker-tail.js',import.meta.url),'utf8');
const api=Function('worker_default',source+'\nreturn {evaluate:__report2PriceCheck,run:__report2RunPriceRechecks,stable:__report2PriceStable,scheduled:__report2PublicCollectorScheduled};')({});
const T=1791285886589,now=T+300000,bucket=Math.floor(now/300000)*300000;
function canonical(direction='LONG') {const c={status:'CLOSED',state:'OBSERVE',run_id:'CONTROLLED_RUN',snapshot_id:'CONTROLLED_SNAPSHOT',observed_ts:T,direction,metadata:{contract:'ADA-USDT',price_recheck_policy:'LIGHT_PRICE_AND_CANCELLATION_5M'},trigger:{metric:'price',operator:direction==='LONG'?'>=':'<=',value:direction==='LONG'?.285132:.261865,unit:'USDT',cancel_condition:direction==='LONG'?'price<0.261865':'price>0.285132',next_recheck_ts:now,expires_ts:T+1800000}};c.analytical_fingerprint=createHash('sha256').update(JSON.stringify(api.stable(c))).digest('hex');return c;}
const market=(price=.28)=>({contract:'ADA-USDT',catalog_active:true,source_status:'CLOSED',price,observed_ts:now});
const args=(direction='LONG',price=.28)=>({canonical:canonical(direction),market:market(price),market_source_ts:now,now,expires_ts:T+1800000});
for(const direction of ['LONG','SHORT'])test(`${direction}: crossing the price never confirms entry, cancellation has priority`,()=>{
 const wait=api.evaluate(args(direction));assert.equal(wait.status,'WAITING_FOR_PRICE');
 const trigger=api.evaluate(args(direction,direction==='LONG'?.285132:.261865));assert.equal(trigger.status,'TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED');assert.equal(trigger.entry_authorized,false);assert.equal(trigger.full_analysis_completed,false);assert.equal(trigger.settlement_confirmed,false);
 assert.equal(api.evaluate(args(direction,direction==='LONG'?.26:.29)).status,'CANCELLED');
 assert.equal(api.evaluate({...args(direction),now:T+1800000}).status,'EXPIRED');
});
test('missing/old/future clocks, wrong contract, unsupported conditions remain unconfirmed',()=>{
 for(const patch of [{market_source_ts:null},{market_source_ts:now-180001},{market_source_ts:now+1},{market:{...market(),observed_ts:T-1}},{market:{...market(),contract:'OTHER-USDT'}},{market:{...market(),source_status:'PARTIAL'}},{market:{...market(),catalog_active:false}},{canonical:{...canonical(),trigger:{...canonical().trigger,metric:'oi'}}},{canonical:{...canonical(),trigger:{...canonical().trigger,cancel_condition:'unparsed qualitative cancellation'}}}])assert.equal(api.evaluate({...args(),...patch}).status,'NOT_CHECKED');
});
class DB{
 constructor(){this.raw=new DatabaseSync(':memory:');for(const path of ['../../post-v7-consolidated/post-v7/migrations.sql','../../current-generation/migrations/004_market_snapshot_batch.sql','../../current-generation/migrations/009_public_collector_runtime.sql'])this.raw.exec(fs.readFileSync(new URL(path,import.meta.url),'utf8'));this.raw.exec(`CREATE TABLE v3_telegram_dispatch_shadow(idempotency_key TEXT PRIMARY KEY,contract TEXT,direction TEXT,wave_id TEXT,state TEXT,telegram_message_id TEXT);CREATE TABLE v3_user_lifecycle_shadow(contract TEXT,direction TEXT,wave_id TEXT,rules_version TEXT,status TEXT,observation_ts INTEGER,PRIMARY KEY(contract,direction,wave_id,rules_version));`);this.calls=[];this.race=false;}
 prepare(sql){const db=this;return {args:[],bind(...a){this.args=a;return this;},query(){const ix=[],q=sql.replace(/\?(\d+)/g,(_,n)=>{ix.push(+n-1);return '?'});return [q,ix.length?ix.map(i=>this.args[i]):this.args];},async first(){const[q,a]=this.query();db.calls.push(sql);return db.raw.prepare(q).get(...a)||null;},async all(){const[q,a]=this.query();db.calls.push(sql);return {results:db.raw.prepare(q).all(...a)};},async run(){const[q,a]=this.query();db.calls.push(sql);if(db.race&&sql.includes('SET state=?2'))return {meta:{changes:0}};return {meta:{changes:Number(db.raw.prepare(q).run(...a).changes)}};}};}
 async batch(statements){const results=[];for(const s of statements)results.push(await s.run());return results;}
 close(){this.raw.close();}
}
function seed(db,id='TASK',c=canonical(),sent='SENT',message='9001'){
 const pub='PUB:'+id,key='KEY:'+id,wave='W:'+id;
 db.raw.prepare(`INSERT INTO canonical_publication_shadow(publication_id,contract_code,direction,run_id,snapshot_id,wave_id,observed_ts,canonical_state,analytical_fingerprint,canonical_json,created_ts) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(pub,c.metadata.contract,c.direction,c.run_id,c.snapshot_id,wave,T,c.state,c.analytical_fingerprint,JSON.stringify(c),T);
 db.raw.prepare(`INSERT INTO v3_recheck_task_shadow(task_id,publication_id,contract_code,direction,wave_id,snapshot_id,run_id,due_ts,expires_ts,state,created_ts,updated_ts) VALUES(?,?,?,?,?,?,?,?,?,'PENDING',?,?)`).run(id,pub,c.metadata.contract,c.direction,wave,c.snapshot_id,c.run_id,c.trigger.next_recheck_ts,c.trigger.expires_ts,T,T);
 db.raw.prepare(`INSERT INTO v3_dispatch_publication_binding_shadow(idempotency_key,publication_id,contract_code,direction,wave_id,lifecycle_event,rules_version,snapshot_id,run_id,observed_ts,analytical_fingerprint,presentation_hash,created_ts) VALUES(?,?,?,?,?,'OBSERVE','v3',?,?,?,?,?,?)`).run(key,pub,c.metadata.contract,c.direction,wave,c.snapshot_id,c.run_id,T,c.analytical_fingerprint,'CONTROLLED_APPROVED_BINDING',T);
 db.raw.prepare('INSERT INTO v3_telegram_dispatch_shadow VALUES(?,?,?,?,?,?)').run(key,c.metadata.contract,c.direction,wave,sent,message);
 db.raw.prepare("INSERT INTO v3_user_lifecycle_shadow VALUES(?,?,?,'v3','OBSERVE',?)").run(c.metadata.contract,c.direction,wave,T);
}
const runArgs={rows:[market()],market_source_ts:now,bucket,now};
test('reached trigger survives later waiting, unavailable price and original expiry without current authority',async()=>{
 const db=new DB();try{
  seed(db);let first;
  for(const [offset,price,status] of [[0,.285132,'TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED'],[300000,.28,'WAITING_FOR_PRICE'],[600000,null,'NOT_CHECKED'],[1500000,null,'EXPIRED']]){
   const ts=now+offset,r=await api.run(db,{rows:price===null?[]:[{...market(price),observed_ts:ts}],market_source_ts:ts,bucket:bucket+offset,now:ts});
   assert.equal(r.results[0].status,status);assert.equal(r.results[0].entry_authorized,false);if(!offset)first=r.results[0];
  }
  const row=db.raw.prepare('SELECT state,last_result,expires_ts FROM v3_recheck_task_shadow').get(),last=JSON.parse(row.last_result);
  assert.equal(row.state,'EXPIRED');assert.equal(row.expires_ts,T+1800000);assert.equal(last.price,undefined);
  assert.deepEqual(last.prior_checks.map(r=>r.status),['TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED','WAITING_FOR_PRICE','NOT_CHECKED']);
  assert.equal(last.first_trigger_receipt.checked_ts,first.checked_ts);assert.equal(last.first_trigger_receipt.source_ts,first.source_ts);assert.equal(last.first_trigger_receipt.price,first.price);
  assert.equal(last.first_trigger_receipt.entry_authorized,false);assert.equal(last.history_scope,'RETAINED_DIAGNOSTICS_NOT_CURRENT_AUTHORITY');
 }finally{db.close();}
});
test('foreign, corrupt or future previous checks cannot enter exact task history',async()=>{
 for(const mutate of [r=>r.task_id='FOREIGN',r=>r.publication_id='FOREIGN',r=>r.snapshot_id='FOREIGN',r=>r.analytical_fingerprint='CORRUPT',r=>r.checked_ts=now+600001,r=>r.entry_authorized=true]){
  const db=new DB();try{seed(db);await api.run(db,{...runArgs,rows:[market(.285132)]});const old=JSON.parse(db.raw.prepare('SELECT last_result FROM v3_recheck_task_shadow').get().last_result);mutate(old);db.raw.prepare('UPDATE v3_recheck_task_shadow SET last_result=?').run(JSON.stringify(old));
   const ts=now+300000;await api.run(db,{...runArgs,rows:[{...market(.28),observed_ts:ts}],market_source_ts:ts,now:ts,bucket:bucket+300000});const saved=JSON.parse(db.raw.prepare('SELECT last_result FROM v3_recheck_task_shadow').get().last_result);
   assert.equal(saved.first_trigger_receipt??null,null);assert.deepEqual(saved.prior_checks??[],[]);assert.equal(saved.status,'WAITING_FOR_PRICE');
  }finally{db.close();}
 }
});
test('analytics expiry and lease recovery preserve receipts; historical crossing cannot claim a current deep check',async()=>{
 const db=new DB();try{
  seed(db);await api.run(db,{...runArgs,rows:[market(.285132)]});const reached=JSON.parse(db.raw.prepare('SELECT last_result FROM v3_recheck_task_shadow').get().last_result);
  db.raw.exec(`UPDATE v3_recheck_task_shadow SET state='CLAIMED',lease_expires_ts=${now-1}`);
  assert.equal((await requeueExpiredLease(db,{now_ts:now})).requeued,1);const recovered=JSON.parse(db.raw.prepare('SELECT last_result FROM v3_recheck_task_shadow').get().last_result);
  assert.equal(recovered.checked_ts,reached.checked_ts);assert.equal(recovered.price,reached.price);assert.equal(recovered.lease_recovery.refreshes_price,false);
  const later=now+300000;await api.run(db,{...runArgs,rows:[{...market(.28),observed_ts:later}],market_source_ts:later,bucket:bucket+300000,now:later});
  assert.equal((await claimDueRecheck(db,{now_ts:later,task_id:'TASK'})).claimed,false);
  const before=db.raw.prepare('SELECT last_result FROM v3_recheck_task_shadow').get().last_result;
  assert.equal((await claimDueRecheck(db,{now_ts:T+1800001,task_id:'TASK'})).claimed,false);
  const end=db.raw.prepare('SELECT state,last_result,expires_ts FROM v3_recheck_task_shadow').get();assert.equal(end.state,'EXPIRED');assert.equal(end.expires_ts,T+1800000);
  assert.deepEqual(JSON.parse(end.last_result).original_light_price_receipt,JSON.parse(before));assert.equal(JSON.parse(end.last_result).reason,'TTL_EXPIRED_BEFORE_RECHECK');
 }finally{db.close();}
});
for(const direction of ['LONG','SHORT'])test(`${direction}: exact SENT task gets a durable price receipt, repeats next slot, never becomes full DONE`,async()=>{
 const db=new DB();try{seed(db,'TASK',canonical(direction));const r=await api.run(db,runArgs);assert.equal(r.checked,1);assert.equal(r.results[0].status,'WAITING_FOR_PRICE');assert.equal(r.results[0].telegram_message_id,'9001');assert.equal((await api.run(db,runArgs)).selected,0);
 const later=now+300000;assert.equal((await api.run(db,{...runArgs,rows:[{...market(),observed_ts:later}],market_source_ts:later,now:later,bucket:bucket+300000})).checked,1);
 assert.equal(db.raw.prepare('SELECT state FROM v3_recheck_task_shadow').get().state,'PENDING');assert(db.calls.every(s=>!s.includes('UPDATE canonical_publication_shadow')&&!s.includes('UPDATE v3_telegram_dispatch_shadow')));
 }finally{db.close();}
});
test('cancellation is durable; expired checks do not extend original TTL',async()=>{
 const db=new DB();try{seed(db);const r=await api.run(db,{...runArgs,rows:[market(.26)]});assert.equal(r.results[0].status,'CANCELLED');assert.equal(db.raw.prepare('SELECT state,expires_ts FROM v3_recheck_task_shadow').get().state,'CANCELLED');assert.equal((await api.run(db,{...runArgs,bucket:bucket+300000,now:now+300000})).selected,0);}finally{db.close();}
 const d=new DB();try{seed(d);const r=await api.run(d,{...runArgs,now:T+1800000,bucket:bucket+1800000});assert.equal(r.results[0].status,'EXPIRED');assert.equal(d.raw.prepare('SELECT expires_ts FROM v3_recheck_task_shadow').get().expires_ts,T+1800000);}finally{d.close();}
});
test('non-SENT/invalid id, corrupt fingerprint, wrong tuple or superseded lifecycle cannot be accepted',async()=>{
 const mutations=[db=>db.raw.exec("UPDATE v3_telegram_dispatch_shadow SET state='PENDING'"),db=>db.raw.exec("UPDATE v3_telegram_dispatch_shadow SET telegram_message_id='0'"),db=>db.raw.exec("UPDATE canonical_publication_shadow SET analytical_fingerprint='CORRUPT'"),db=>db.raw.exec("UPDATE v3_recheck_task_shadow SET snapshot_id='WRONG'"),db=>db.raw.exec("UPDATE v3_user_lifecycle_shadow SET status='ENTRY'")];
 for(const mutate of mutations){const db=new DB();try{seed(db);mutate(db);const r=await api.run(db,runArgs);assert.equal(r.checked,0);assert.equal(db.raw.prepare('SELECT last_result FROM v3_recheck_task_shadow').get().last_result,null);}finally{db.close();}}
});
test('CAS race does not invent a persisted price check, task claiming stays with analytics',async()=>{
 const db=new DB();try{seed(db);db.race=true;const r=await api.run(db,runArgs);assert.equal(r.checked,0);assert.equal(r.results[0].status,'TASK_CHANGED_NO_ACK');db.race=false;db.raw.exec("UPDATE v3_recheck_task_shadow SET state='CLAIMED'");assert.equal((await api.run(db,runArgs)).selected,0);}finally{db.close();}
});
test('two-per-slot bound rotates pending tasks without starvation',async()=>{
 const db=new DB();try{for(let i=0;i<4;i++){const c=canonical();c.snapshot_id+=':'+i;delete c.analytical_fingerprint;c.analytical_fingerprint=createHash('sha256').update(JSON.stringify(api.stable(c))).digest('hex');seed(db,'T'+i,c);}assert.equal((await api.run(db,runArgs)).checked,2);const later=now+300000;const next={...runArgs,rows:[{...market(),observed_ts:later}],market_source_ts:later,now:later,bucket:bucket+300000};assert.equal((await api.run(db,next)).checked,2);const checks=db.raw.prepare('SELECT last_result FROM v3_recheck_task_shadow').all();assert(checks.every(x=>JSON.parse(x.last_result).price===.28));}finally{db.close();}
});
test('full collector combines original public pack with a price check using only its original four requests',async()=>{
 const db=new DB();const realFetch=globalThis.fetch,realNow=Date.now;let calls=0;Date.now=()=>now;
 globalThis.fetch=async url=>{calls++;const v=String(url),contract_code='ADA-USDT',ts=now;const data=v.includes('batch_merged')?{ticks:[{contract_code,close:.28,trade_turnover:1e6,ts}]}:v.includes('swap_open_interest')?{data:[{contract_code,volume:1,value:10}]}:v.includes('swap_batch_funding_rate')?{data:[{contract_code,funding_rate:0}]}:v.includes('swap_contract_info')?{data:[{contract_code,contract_status:1,business_type:'swap',contract_size:1}]}:null;assert(data,'NO_NEW_SOURCE_OR_TELEGRAM_FETCH');return new Response(JSON.stringify({status:'ok',ts,...data}));};
 try{seed(db);await api.scheduled({scheduledTime:bucket},{DATA_DB:db,PRICE_RECHECK_ENABLED:'1',PUBLIC_COLLECTOR_ENABLED:'1',ANALYTICS_ENABLED:'0',DELIVERY_ENABLED:'0',REPORT2_CURRENT_GENERATION:'MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V12_CONTRACT_INTEGRITY_20M'});assert.equal(calls,4);assert.equal(JSON.parse(db.raw.prepare('SELECT last_result FROM v3_recheck_task_shadow').get().last_result).status,'WAITING_FOR_PRICE');assert.equal(db.raw.prepare('SELECT state FROM report2_public_collector_usage_v1').get().state,'CLOSED');assert(db.raw.prepare('SELECT rows_written FROM report2_public_collector_usage_v1').get().rows_written<=35);}finally{db.close();globalThis.fetch=realFetch;Date.now=realNow;}
});
