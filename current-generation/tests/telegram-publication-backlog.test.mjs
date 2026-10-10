import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const here=path.dirname(fileURLToPath(import.meta.url));
const generation=path.resolve(here,'..');
const repo=path.resolve(generation,'..');
const unified=path.join(repo,'post-v7-consolidated/liquidation/liquidation-extension/integration/unified-delivery');
const finalReconciliation=path.join(repo,'post-v7-consolidated/final-reconciliation/files/src');
const migrations=path.join(repo,'post-v7-consolidated/liquidation/unified-delivery-base/migrations.sql');
const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'report2-telegram-backlog-'));
for(const name of ['canonical-publication.mjs','recheck-scheduler.mjs','manual-report-formatter.mjs','canonical-display.mjs','reason-registry.mjs','native-liquidation-guard.mjs','v3-telegram-runtime.mjs','v3-telegram-delivery-sidecar.mjs','v3-pipeline-health-runtime.mjs','v3-telegram-lifecycle.mjs']){
 const source=['native-liquidation-guard.mjs','canonical-display.mjs'].includes(name)
  ? path.join(generation,'files/src',name)
  : ['canonical-publication.mjs','recheck-scheduler.mjs','manual-report-formatter.mjs','canonical-display.mjs','reason-registry.mjs'].includes(name)
    ? path.join(finalReconciliation,name)
    : path.join(unified,name);
 fs.copyFileSync(source,path.join(runtime,name));
}
for(const name of ['liquidation-source-acquisition-audit.mjs','htx-contract-key.mjs','publication-reconciler.mjs','bound-telegram-delivery-sidecar.mjs','original-idea-recheck.mjs','original-idea-terminal.mjs'])fs.copyFileSync(path.join(generation,'files/src',name),path.join(runtime,name));
test.after(()=>fs.rmSync(runtime,{recursive:true,force:true}));

const publication=await import(pathToFileURL(path.join(runtime,'canonical-publication.mjs')).href);
const reconciler=await import(pathToFileURL(path.join(runtime,'publication-reconciler.mjs')).href);
const sender=await import(pathToFileURL(path.join(runtime,'bound-telegram-delivery-sidecar.mjs')).href);

class Statement{
 constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}
 bind(...args){return new Statement(this.db,this.sql,args);}
 compile(){const order=[];const sql=this.sql.replace(/\?(\d+)/g,(_,n)=>{order.push(Number(n)-1);return '?';});return {sql,args:order.length?order.map(i=>this.args[i]):this.args};}
 async run(){const {sql,args}=this.compile();const r=this.db.raw.prepare(sql).run(...args);return {meta:{changes:Number(r.changes||0)}};}
 async first(){const {sql,args}=this.compile();return this.db.raw.prepare(sql).get(...args)??null;}
 async all(){const {sql,args}=this.compile();return {results:this.db.raw.prepare(sql).all(...args)};}
}
class DB{
 constructor(){
  this.raw=new DatabaseSync(':memory:');
  this.raw.exec(fs.readFileSync(migrations,'utf8'));
  this.raw.exec(`
   CREATE TABLE v3_user_lifecycle_shadow(contract TEXT,direction TEXT,wave_id TEXT,rules_version TEXT,status TEXT,reason TEXT,observation_ts INTEGER,valid_until_ts INTEGER,updated_ts INTEGER,shadow_only INTEGER,PRIMARY KEY(contract,direction,wave_id,rules_version));
   CREATE TABLE v3_telegram_dispatch_shadow(dispatch_id TEXT PRIMARY KEY,idempotency_key TEXT UNIQUE,contract TEXT,direction TEXT,wave_id TEXT,lifecycle_event TEXT,rules_version TEXT,state TEXT,decision_id TEXT,message_hash TEXT,telegram_message_id TEXT,last_error TEXT,created_ts INTEGER,updated_ts INTEGER,sent_ts INTEGER,shadow_only INTEGER);
   CREATE TABLE v3_pipeline_health_shadow(namespace TEXT PRIMARY KEY,status TEXT,reasons_json TEXT,changed_ts INTEGER,last_checked_ts INTEGER,shadow_only INTEGER);
   CREATE TABLE v3_pipeline_health_event_shadow(event_id TEXT PRIMARY KEY,transition TEXT,from_status TEXT,to_status TEXT,reasons_json TEXT,state TEXT,telegram_message_id TEXT,last_error TEXT,created_ts INTEGER,updated_ts INTEGER,sent_ts INTEGER,shadow_only INTEGER);
  `);
 }
 prepare(sql){return new Statement(this,sql);}
 close(){this.raw.close();}
}

const NOW=1790449000000;
function canonical({contract='AAVE-USDT',run='RUN-A',snapshot='SNAP-A',observed=NOW-5000}={}){
 const c={status:'CLOSED',snapshot_id:snapshot,run_id:run,observed_ts:observed,snapshot_time_utc:new Date(observed).toISOString(),state:'WAIT_FOR_TRIGGER',direction:'SHORT',scores:{overall_0_100:72,coin_interest_0_100:72,entry_readiness_0_100:null,is_probability:false},candidates:[{contract,ticker:contract}],universe:[{contract}],metadata:{contract,source_role_view:{status:'CLOSED',classified:[{source_key:'HTX_OFFICIAL',source_family:'HTX_OFFICIAL',assigned_roles:['EXECUTION_TRUTH'],registry_known:true},{source_key:'BINANCE_OFFICIAL',source_family:'BINANCE_OFFICIAL',assigned_roles:['OI_CROSS_VENUE'],registry_known:true}]}},hard_gates:[{status:'CLOSED'},{status:'CLEAR'}],trigger:{metric:'price',operator:'<=',value:250,unit:'USDT',timeframe:'5m',expires_ts:NOW+600000,cancel_condition:'price>270',next_recheck_ts:NOW+60000},entry:{min_price:249,max_price:251,area:'249–251 USDT'},invalidation:'price>270',targets:[{price:235}],source_receipts:[],reasons:[],liquidations:{status:'CLOSED',pump:{is_pump:false},above:[{price:275,distance_pct:10,strength_label_ru:'средняя',kind:'CALCULATED'}],below:[{price:225,distance_pct:-10,strength_label_ru:'крупная',kind:'CALCULATED'}]}};
 c.analytical_fingerprint=publication.canonicalFingerprint(c);return c;
}
async function seedFresh(db,{key='FRESH',created=NOW-2000,run='RUN-A',snapshot='SNAP-A',publicationCreated=NOW-4000}={}){
 const c=canonical({run,snapshot});
 const p=await publication.persistCanonicalSnapshot(db,{canonical:c,wave_id:'W-AAVE',now_ts:publicationCreated});
 assert.equal(p.persisted,true,JSON.stringify(p));
 db.raw.prepare(`INSERT INTO v3_user_lifecycle_shadow VALUES(?,?,?,?,?,?,?,?,?,1)`).run('AAVE-USDT','SHORT','W-AAVE','v3','WAIT','DIRECTION_CLOSED_ENTRY_WINDOW_NOT_READY',NOW-3000,NOW+600000,created);
 db.raw.prepare(`INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts,shadow_only) VALUES(?,?,?,?,?,?,?,'PENDING',?,?,1)`).run(`D-${key}`,key,'AAVE-USDT','SHORT','W-AAVE','WAIT','v3',created,created);
 return {c,p};
}
function seedExpiredBacklog(db,{key='OLD',age=20*60_000}={}){
 const created=NOW-age;
 db.raw.prepare(`INSERT INTO v3_user_lifecycle_shadow VALUES(?,?,?,?,?,?,?,?,?,1)`).run('OLD-USDT','LONG','W-OLD','v3','OBSERVE','USEFUL_LIVE_OBSERVATION',created,created+5*60_000,created);
 db.raw.prepare(`INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts,shadow_only) VALUES(?,?,?,?,?,?,?,'FAILED_RETRYABLE',?,?,1)`).run(`D-${key}`,key,'OLD-USDT','LONG','W-OLD','OBSERVE','v3',created,created);
}

test('backlog dispatch binds its own publication when delivery executes in a later run',async t=>{
 const db=new DB();t.after(()=>db.close());
 await seedFresh(db);
 const result=await reconciler.reconcilePendingPublications(db,{now_ts:NOW,source_run_id:'RUN-B'});
 assert.equal(result.results[0].status,'BOUND_ACTIONABLE',JSON.stringify(result));
 assert.equal(result.executor_run_id,'RUN-B');
 const binding=db.raw.prepare(`SELECT run_id,snapshot_id FROM v3_dispatch_publication_binding_shadow WHERE idempotency_key='FRESH'`).get();
 assert.equal(binding.run_id,'RUN-A');assert.equal(binding.snapshot_id,'SNAP-A');
});

test('manual refusal records its failing status when Telegram text is READY and leaves no binding',async t=>{
 const db=new DB();t.after(()=>db.close());
 const {c,p}=await seedFresh(db);
 c.free_sources={registry:{entries:[{id:'UNTRANSLATED_INTERNAL_SOURCE',decision_usable:true}]}};
 c.analytical_fingerprint=publication.canonicalFingerprint(c);
 db.raw.prepare('UPDATE canonical_publication_shadow SET canonical_json=?,analytical_fingerprint=? WHERE publication_id=?').run(JSON.stringify(c),c.analytical_fingerprint,p.publication_id);
 assert.equal(publication.renderCanonicalTelegram({canonical:c,lifecycle_event:'WAIT'}).status,'READY');
 assert.equal(publication.renderCanonicalManual({canonical:c}).status,'FORBIDDEN_USER_TERMINOLOGY');
 const result=await reconciler.reconcilePendingPublications(db,{now_ts:NOW,source_run_id:'RUN-B'});
 assert.equal(result.results[0].status,'PRESENTATION_FAILED');
 assert.equal(result.results[0].surface,'MANUAL');
 assert.equal(result.results[0].reason,'FORBIDDEN_USER_TERMINOLOGY');
 const row=db.raw.prepare("SELECT state,last_error,telegram_message_id,sent_ts FROM v3_telegram_dispatch_shadow WHERE idempotency_key='FRESH'").get();
 assert.equal(row.state,'FAILED_FINAL');assert.equal(row.last_error,'FORBIDDEN_USER_TERMINOLOGY');
 assert.equal(row.telegram_message_id,null);assert.equal(row.sent_ts,null);
 assert.equal(db.raw.prepare("SELECT count(*) n FROM v3_dispatch_publication_binding_shadow WHERE idempotency_key='FRESH'").get().n,0);
});

test('legacy early publication repairs its wave id from canonical evidence and binds',async t=>{
 const db=new DB();t.after(()=>db.close());
 const c=canonical({run:'RUN-LEGACY',snapshot:'SNAP-LEGACY'});
 c.early_candidate={items:[{contract:'AAVE-USDT',wave_id:'W-EARLY'}]};
 c.analytical_fingerprint=publication.canonicalFingerprint(c);
 const p=await publication.persistCanonicalSnapshot(db,{canonical:c,wave_id:null,now_ts:NOW-4000});
 assert.equal(p.persisted,true,JSON.stringify(p));
 const created=NOW-2000;
 db.raw.prepare(`INSERT INTO v3_user_lifecycle_shadow VALUES(?,?,?,?,?,?,?,?,?,1)`).run('AAVE-USDT','SHORT','W-EARLY','v3','WAIT','DIRECTION_CLOSED_ENTRY_WINDOW_NOT_READY',NOW-3000,NOW+600000,created);
 db.raw.prepare(`INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts,shadow_only) VALUES('D-LEGACY','LEGACY','AAVE-USDT','SHORT','W-EARLY','WAIT','v3','PENDING',?,?,1)`).run(created,created);
 const result=await reconciler.reconcilePendingPublications(db,{now_ts:NOW,source_run_id:'RUN-NEXT'});
 assert.equal(result.results[0].status,'BOUND_ACTIONABLE',JSON.stringify(result));
 assert.equal(db.raw.prepare(`SELECT wave_id FROM canonical_publication_shadow WHERE publication_id=?`).get(p.publication_id).wave_id,'W-EARLY');
 assert.equal(db.raw.prepare(`SELECT count(*) n FROM v3_dispatch_publication_binding_shadow WHERE idempotency_key='LEGACY'`).get().n,1);
});

test('fresh LTC OBSERVE repairs only a missing wave from the same exact production run and binds',async t=>{
 const db=new DB();t.after(()=>db.close());
 const c=canonical({contract:'LTC-USDT',run:'RUN-LTC',snapshot:'SNAP-LTC',observed:NOW-5000});
 c.direction='LONG';c.state='OBSERVE';c.entry={min_price:99,max_price:101,area:'99–101 USDT'};
 c.trigger={metric:'price',operator:'>=',value:101,unit:'USDT',timeframe:'5m',expires_ts:NOW+600000,cancel_condition:'price<97',next_recheck_ts:NOW+60000};
 c.analytical_fingerprint=publication.canonicalFingerprint(c);
 const p=await publication.persistCanonicalSnapshot(db,{canonical:c,wave_id:null,now_ts:NOW-4000});
 assert.equal(p.persisted,true,JSON.stringify(p));
 const created=NOW-2000;
 db.raw.prepare(`INSERT INTO v3_user_lifecycle_shadow VALUES(?,?,?,?,?,?,?,?,?,1)`).run('LTC-USDT','LONG','W-LTC','v3','OBSERVE','USEFUL_LIVE_OBSERVATION',NOW-5000,NOW+600000,created);
 db.raw.prepare(`INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts,shadow_only) VALUES('D-LTC','LTC','LTC-USDT','LONG','W-LTC','OBSERVE','v3','PENDING',?,?,1)`).run(created,created);
 const result=await reconciler.reconcilePendingPublications(db,{now_ts:NOW,source_run_id:'RUN-LTC'});
 assert.equal(result.results[0].status,'BOUND_ACTIONABLE',JSON.stringify(result));
 assert.equal(db.raw.prepare(`SELECT wave_id FROM canonical_publication_shadow WHERE publication_id=?`).get(p.publication_id).wave_id,'W-LTC');
 assert.equal(db.raw.prepare(`SELECT count(*) n FROM v3_dispatch_publication_binding_shadow WHERE idempotency_key='LTC'`).get().n,1);
});

test('missing publication wave is never repaired across executor runs',async t=>{
 const db=new DB();t.after(()=>db.close());
 const c=canonical({contract:'LTC-USDT',run:'RUN-OLD',snapshot:'SNAP-OLD',observed:NOW-5000});
 c.direction='LONG';c.state='OBSERVE';c.entry={min_price:99,max_price:101,area:'99–101 USDT'};
 c.trigger={metric:'price',operator:'>=',value:101,unit:'USDT',timeframe:'5m',expires_ts:NOW+600000,cancel_condition:'price<97',next_recheck_ts:NOW+60000};
 c.analytical_fingerprint=publication.canonicalFingerprint(c);
 await publication.persistCanonicalSnapshot(db,{canonical:c,wave_id:null,now_ts:NOW-4000});
 const created=NOW-2000;
 db.raw.prepare(`INSERT INTO v3_user_lifecycle_shadow VALUES(?,?,?,?,?,?,?,?,?,1)`).run('LTC-USDT','LONG','W-LTC','v3','OBSERVE','USEFUL_LIVE_OBSERVATION',NOW-5000,NOW+600000,created);
 db.raw.prepare(`INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts,shadow_only) VALUES('D-LTC-OLD','LTC-OLD','LTC-USDT','LONG','W-LTC','OBSERVE','v3','PENDING',?,?,1)`).run(created,created);
 const result=await reconciler.reconcilePendingPublications(db,{now_ts:NOW,source_run_id:'RUN-NEW'});
 assert.equal(result.results[0].status,'CANONICAL_SNAPSHOT_NOT_FOUND',JSON.stringify(result));
 assert.equal(db.raw.prepare(`SELECT count(*) n FROM v3_dispatch_publication_binding_shadow`).get().n,0);
});

test('fresh bound signal is sent before stale unbound backlog and stale row is never delivered',async t=>{
 const db=new DB();t.after(()=>db.close());
 seedExpiredBacklog(db);
 await seedFresh(db);
 let calls=0,body=null;
 const result=await sender.runBoundTelegramDeliverySidecar(db,{enabled:true,relay_url:'https://relay.invalid',relay_key:'TEST_ONLY',now_ts:NOW,source_run_id:'RUN-B',fetch_impl:async(_url,options)=>{calls++;body=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({ok:true,status:'SENT',message_id:1701})};}});
 assert.equal(result.sent,1,JSON.stringify(result));
 assert.equal(calls,1);
 assert.match(body.text,/AAVE/i);
 assert.equal(db.raw.prepare(`SELECT state FROM v3_telegram_dispatch_shadow WHERE idempotency_key='FRESH'`).get().state,'SENT');
 assert.equal(db.raw.prepare(`SELECT state FROM v3_telegram_dispatch_shadow WHERE idempotency_key='OLD'`).get().state,'EXPIRED_NOT_SENT');
});

test('removal after the binding grace period uses only its previously delivered exact wave',async t=>{
 const db=new DB();t.after(()=>db.close());
 const priorCreated=NOW-30*60_000;
 await seedFresh(db,{key:'VISIBLE-WAIT',created:priorCreated+60_000,run:'RUN-VISIBLE',snapshot:'SNAP-VISIBLE',publicationCreated:priorCreated});
 const initial=await reconciler.reconcilePendingPublications(db,{now_ts:priorCreated+2*60_000,source_run_id:'RUN-VISIBLE'});
 assert.equal(initial.results[0].status,'BOUND_ACTIONABLE',JSON.stringify(initial));
 db.raw.prepare(`UPDATE v3_telegram_dispatch_shadow SET state='SENT',telegram_message_id='1700',sent_ts=?,updated_ts=? WHERE idempotency_key='VISIBLE-WAIT'`).run(priorCreated+3*60_000,priorCreated+3*60_000);
 db.raw.prepare(`UPDATE v3_user_lifecycle_shadow SET status='IDEA_REMOVED',reason='DATA_UNUSABLE',observation_ts=?,valid_until_ts=NULL,updated_ts=? WHERE contract='AAVE-USDT' AND direction='SHORT' AND wave_id='W-AAVE' AND rules_version='v3'`).run(NOW-1000,NOW-1000);
 db.raw.prepare(`INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts,shadow_only) VALUES('D-REMOVE','REMOVE','AAVE-USDT','SHORT','W-AAVE','IDEA_REMOVED','v3','PENDING',?,?,1)`).run(NOW-1000,NOW-1000);
 const recovered=await reconciler.reconcilePendingPublications(db,{now_ts:NOW,source_run_id:'RUN-REMOVE'});
 assert.equal(recovered.results[0].status,'BOUND_ACTIONABLE',JSON.stringify(recovered));
 const binding=db.raw.prepare(`SELECT publication_id,lifecycle_event,wave_id FROM v3_dispatch_publication_binding_shadow WHERE idempotency_key='REMOVE'`).get();
 assert.equal(binding.lifecycle_event,'IDEA_REMOVED');assert.equal(binding.wave_id,'W-AAVE');
 let calls=0;
 const delivered=await sender.runBoundTelegramDeliverySidecar(db,{enabled:true,relay_url:'https://relay.invalid',relay_key:'TEST_ONLY',now_ts:NOW+1,source_run_id:'RUN-REMOVE',fetch_impl:async()=>{calls++;return {ok:true,status:200,json:async()=>({ok:true,status:'SENT',message_id:1702})};}});
 assert.equal(delivered.sent,1,JSON.stringify(delivered));assert.equal(calls,1);
 assert.equal(db.raw.prepare(`SELECT state FROM v3_telegram_dispatch_shadow WHERE idempotency_key='REMOVE'`).get().state,'SENT');
});

test('removal without a previously delivered exact wave is finalized without network retry',async t=>{
 const db=new DB();t.after(()=>db.close());
 db.raw.prepare(`INSERT INTO v3_user_lifecycle_shadow VALUES(?,?,?,?,?,?,?,?,?,1)`).run('AAVE-USDT','SHORT','W-NEVER-SENT','v3','IDEA_REMOVED','DATA_UNUSABLE',NOW-1000,null,NOW-1000);
 db.raw.prepare(`INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts,shadow_only) VALUES('D-NEVER-SENT','NEVER-SENT','AAVE-USDT','SHORT','W-NEVER-SENT','IDEA_REMOVED','v3','PENDING',?,?,1)`).run(NOW-1000,NOW-1000);
 const result=await reconciler.reconcilePendingPublications(db,{now_ts:NOW,source_run_id:'RUN-REMOVE'});
 assert.equal(result.results[0].status,'REMOVAL_WITHOUT_PRIOR_DELIVERY',JSON.stringify(result));
 const row=db.raw.prepare(`SELECT state,last_error FROM v3_telegram_dispatch_shadow WHERE idempotency_key='NEVER-SENT'`).get();
 assert.equal(row.state,'FAILED_FINAL');assert.equal(row.last_error,'REMOVAL_WITHOUT_PRIOR_DELIVERY');
});

test('two equally recent canonical publications fail closed instead of guessing',async t=>{
 const db=new DB();t.after(()=>db.close());
 const a=canonical({run:'RUN-A',snapshot:'SNAP-A',observed:NOW-5000});
 const b=canonical({run:'RUN-B',snapshot:'SNAP-B',observed:NOW-4500});
 assert.equal((await publication.persistCanonicalSnapshot(db,{canonical:a,wave_id:'W-AAVE',now_ts:NOW-4000})).persisted,true);
 assert.equal((await publication.persistCanonicalSnapshot(db,{canonical:b,wave_id:'W-AAVE',now_ts:NOW-4000})).persisted,true);
 const created=NOW-2000;
 db.raw.prepare(`INSERT INTO v3_user_lifecycle_shadow VALUES(?,?,?,?,?,?,?,?,?,1)`).run('AAVE-USDT','SHORT','W-AAVE','v3','WAIT','DIRECTION_CLOSED_ENTRY_WINDOW_NOT_READY',NOW-3000,NOW+600000,created);
 db.raw.prepare(`INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts,shadow_only) VALUES('D-AMB','AMB','AAVE-USDT','SHORT','W-AAVE','WAIT','v3','PENDING',?,?,1)`).run(created,created);
 const result=await reconciler.reconcilePendingPublications(db,{now_ts:NOW,source_run_id:'RUN-C'});
 assert.equal(result.results[0].status,'AMBIGUOUS_CANONICAL_SNAPSHOT');
 assert.equal(db.raw.prepare(`SELECT state FROM v3_telegram_dispatch_shadow WHERE idempotency_key='AMB'`).get().state,'FAILED_FINAL');
 assert.equal(db.raw.prepare(`SELECT count(*) n FROM v3_dispatch_publication_binding_shadow WHERE idempotency_key='AMB'`).get().n,0);
});

test('technical health remains in the journal and never reaches owner Telegram',async t=>{
 const db=new DB();t.after(()=>db.close());
 db.raw.prepare(`INSERT INTO v3_pipeline_health_shadow VALUES(?,?,?,?,?,1)`).run('PIPELINE','DEGRADED_PIPELINE','["CRITICAL_FEED_DEGRADED"]',NOW-3600000,NOW);
 db.raw.prepare(`INSERT INTO v3_pipeline_health_event_shadow VALUES(?,?,?,?,?,?,?,?,?,?,?,1)`).run('H-TECH','DEGRADED','HEALTHY_NO_IDEA','DEGRADED_PIPELINE','["CRITICAL_FEED_DEGRADED"]','PENDING',null,null,NOW-3600000,NOW-3600000,null);
 let calls=0;
 const result=await sender.runBoundTelegramDeliverySidecar(db,{enabled:true,relay_url:'https://relay.invalid',relay_key:'TEST_ONLY',now_ts:NOW,fetch_impl:async()=>{calls++;throw Error('TECHNICAL_NETWORK_FORBIDDEN');}});
 assert.equal(result.status,'CLOSED',JSON.stringify(result));
 assert.equal(result.sent,0);assert.equal(calls,0);
 assert.deepEqual(result.health,[]);
 assert.equal(db.raw.prepare(`SELECT state FROM v3_pipeline_health_event_shadow WHERE event_id='H-TECH'`).get().state,'PENDING');
});
