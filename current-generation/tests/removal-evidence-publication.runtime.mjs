import vm from 'node:vm';
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
const runtime=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime')+'/src';
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
 async batch(stmts){return Promise.all(stmts.map(s=>s.run()));}
 close(){this.raw.close();}
}

const sidecar=await import(pathToFileURL(path.join(runtime,'v3-telegram-lifecycle-sidecar.mjs')).href);

const original=JSON.parse(fs.readFileSync(new URL('./fixtures/original-zec-removal-20261009.json',import.meta.url)));
const NOW=Date.parse('2026-10-10T08:00:00Z'),obs=NOW-1000;
function receipt(){return {schema:'LIFECYCLE_REMOVAL_RECEIPT_V1',contract:'ZEC-USDT',direction:'LONG',wave_id:'W-ZEC',reason:'DATA_UNUSABLE',source_run_id:'CURRENT-REMOVAL',observed_ts:obs,market_snapshot:false,conditions:[{source:'shadow_decision_log',row_id:obs+':ZEC-USDT',field:'dq_status',value:'INSUFFICIENT',observed_ts:obs}],failed_checks:['futures.htx_futures_order_flow_sample'],sufficiency:'PARTIAL',detail_status:'ORIGINAL_DQ_PREDICATES'};}
async function seed(db){
 const priorTs=NOW-5*3600000,c={status:'CLOSED',state:'WAIT_FOR_TRIGGER',direction:'LONG',run_id:'ORIGINAL',snapshot_id:'ORIGINAL-SNAPSHOT',observed_ts:priorTs,metadata:{contract:'ZEC-USDT'},scores:{overall_0_100:91,coin_interest_0_100:91,entry_readiness_0_100:null,is_probability:false},entry:{min_price:1190,max_price:1200},trigger:{metric:'price',operator:'>=',value:1208.64,unit:'USDT',timeframe:'5m',expires_ts:priorTs+1800000,cancel_condition:'price<1162',next_recheck_ts:priorTs+300000},targets:[{price:1250}],invalidation:'price<1162',source_receipts:[],reasons:[],hard_gates:[],liquidations:{status:'CLOSED',above:[{price:2023,distance_pct:70,kind:'CALCULATED'}],below:[{price:889,distance_pct:-25,kind:'CALCULATED'}]}};
 c.analytical_fingerprint=publication.canonicalFingerprint(c);
 const p=await publication.persistCanonicalSnapshot(db,{canonical:c,wave_id:'W-ZEC',now_ts:priorTs});assert.equal(p.persisted,true);
 const tg=publication.renderCanonicalTelegram({canonical:c,lifecycle_event:'WAIT'}),man=publication.renderCanonicalManual({canonical:c});
 const f=await publication.finalizePublication(db,{publication_id:p.publication_id,lifecycle_event:'WAIT',direction:'LONG',manual_text:man.text,telegram_text:tg.text,now_ts:priorTs});assert.equal(f.deliver,true,JSON.stringify(f));
 db.raw.prepare("INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,telegram_message_id,created_ts,updated_ts,sent_ts,shadow_only) VALUES('D-OLD','OLD','ZEC-USDT','LONG','W-ZEC','WAIT','v3','SENT','165',?,?,?,1)").run(priorTs,priorTs,priorTs);
 assert.equal((await publication.bindDispatchToPublication(db,{idempotency_key:'OLD',publication_id:p.publication_id,contract:'ZEC-USDT',direction:'LONG',wave_id:'W-ZEC',lifecycle_event:'WAIT',rules_version:'v3',now_ts:priorTs})).bound,true);
 db.raw.prepare("INSERT INTO v3_user_lifecycle_shadow VALUES('ZEC-USDT','LONG','W-ZEC','v3','IDEA_REMOVED','DATA_UNUSABLE',?,NULL,?,1)").run(obs,obs);
 db.raw.prepare("INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,message_hash,created_ts,updated_ts,shadow_only) VALUES('D-REMOVE','REMOVE','ZEC-USDT','LONG','W-ZEC','IDEA_REMOVED','v3','PENDING',?,?,?,1)").run(JSON.stringify(receipt()),obs,obs);
 return db.raw.prepare('SELECT * FROM canonical_publication_shadow WHERE publication_id=?').get(p.publication_id);
}
test('original ZEC167 removal predicate is retained without inventing missing historical subchecks',()=>{
 assert.equal(original.original_dispatch.state,'SENT');assert.equal(original.original_dispatch.telegram_message_id,'167');assert.equal(original.original_final_rows.length,0);
 const shadow=original.original_shadow_rows[0],r=sidecar.lifecycleRemovalReceipt({contract:'ZEC-USDT',direction:'LONG',wave_id:original.original_dispatch.wave_id,reason:'DATA_UNUSABLE',handoff:{...original.original_deep,source_run_id:original.original_deep.run_id},shadow,observed_ts:shadow.observed_ts});
 assert.deepEqual(r.conditions,[{source:'shadow_decision_log',row_id:shadow.shadow_id,field:'dq_status',value:'INSUFFICIENT',observed_ts:shadow.observed_ts}]);assert.equal(r.detail_status,'ORIGINAL_PREDICATES_NOT_RETAINED');assert.deepEqual(r.failed_checks,[]);assert.equal(r.market_snapshot,false);
});
test('new cancellation binds a separate decision publication and preserves every byte of prior SENT',async t=>{
 const db=new DB();t.after(()=>db.close());const before=await seed(db),result=await reconciler.reconcilePendingPublications(db,{now_ts:NOW,source_run_id:'CURRENT-REMOVAL'});
 assert.equal(result.results[0].status,'BOUND_ACTIONABLE',JSON.stringify(result));assert.notEqual(result.results[0].publication_id,before.publication_id);
 assert.deepEqual(db.raw.prepare('SELECT * FROM canonical_publication_shadow WHERE publication_id=?').get(before.publication_id),before);
 const bound=await publication.loadBoundTelegram(db,{idempotency_key:'REMOVE',now_ts:NOW});assert.equal(bound.ok,true,JSON.stringify(bound));assert.equal(bound.canonical.run_id,'CURRENT-REMOVAL');assert.equal(bound.canonical.metadata.publication_kind,'LIFECYCLE_ADMINISTRATIVE');assert.equal(bound.canonical.observed_ts,obs);assert.equal(bound.canonical.metadata.lifecycle_removal.prior_publication_id,before.publication_id);
 assert.match(bound.text,/проверенная выборка сделок фьючерса HTX/);assert.doesNotMatch(bound.text,/91|2023|889|Оценка|Уровни|Ликвидации/);assert.deepEqual(bound.canonical.targets,[]);assert.equal(bound.canonical.metadata.lifecycle_removal.market_snapshot,false);
 const wrongEvent=publication.assessActionability({canonical:bound.canonical,lifecycle_event:'ENTRY',prior_sent:true});assert.equal(wrongEvent.deliver,false);
 const again=await reconciler.reconcilePendingPublications(db,{now_ts:NOW+1000,source_run_id:'ANOTHER-RUN'});assert.equal(again.processed,0);
});
test('wrong contract, wave, decision clock or predicate cannot bind a removal receipt',async t=>{
 for(const change of [{contract:'NEAR-USDT'},{wave_id:'FOREIGN'},{observed_ts:obs-1},{conditions:[{source:'shadow_decision_log',row_id:'X',field:'dq_status',value:'CLOSED',observed_ts:obs}]}]){
  const db=new DB();t.after(()=>db.close());const before=await seed(db);db.raw.prepare("UPDATE v3_telegram_dispatch_shadow SET message_hash=? WHERE idempotency_key='REMOVE'").run(JSON.stringify({...receipt(),...change}));
  const r=await reconciler.reconcilePendingPublications(db,{now_ts:NOW});assert.equal(r.results[0].status,'REMOVAL_RECEIPT_NOT_CLOSED');assert.deepEqual(db.raw.prepare('SELECT * FROM canonical_publication_shadow WHERE publication_id=?').get(before.publication_id),before);
 }
});
test('unconfirmed prior delivery and absent new receipt fail closed without replaying old levels',async t=>{
 for(const mutate of [db=>db.raw.exec("UPDATE v3_telegram_dispatch_shadow SET telegram_message_id=NULL WHERE idempotency_key='OLD'"),db=>db.raw.exec("UPDATE v3_telegram_dispatch_shadow SET message_hash=NULL WHERE idempotency_key='REMOVE'")]){
  const db=new DB();t.after(()=>db.close());await seed(db);mutate(db);const r=await reconciler.reconcilePendingPublications(db,{now_ts:NOW});assert.ok(['REMOVAL_WITHOUT_PRIOR_DELIVERY','REMOVAL_RECEIPT_NOT_CLOSED'].includes(r.results[0].status));assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM v3_dispatch_publication_binding_shadow WHERE idempotency_key='REMOVE'").get().n,0);
 }
});

test('actual Worker DQ producer retains mandatory failed predicates while optional raw24h and spot remain separate',()=>{
 const source=fs.readFileSync(path.join(runtime,'worker.js'),'utf8'),start=source.indexOf('const buildShadowDecisionTelemetry = (() => {'),end=source.indexOf('return buildShadowDecisionTelemetry;',start),close=source.indexOf('})();',end)+5;
 const build=vm.runInNewContext(source.slice(start,close)+';buildShadowDecisionTelemetry',{buildHtxOiWindowReceipt:()=>null});
 const fc={htx_futures_liquidity:'closed',htx_futures_order_flow_sample:'closed',htx_futures_order_flow:'partial',htx_open_interest:'closed',htx_funding:'closed'},tc=Object.fromEntries(['price_1h','price_4h','oi_1h','oi_4h','funding_current','funding_history','price_5m','price_15m'].map(k=>[k,'closed']));
 const opts={contract:'ZEC-USDT',now:obs,futures:{coverage:fc},trajectory:{coverage:tc},spot:{quality_status:'YELLOW'},dataSufficiency:{classification:'PARTIAL'}};
 const partial=build(opts);assert.equal(partial.dq.status,'PARTIAL');assert.equal(partial.evidence_flags.dq_failure_receipt.mandatory_checks.filter(c=>!c.closed).length,0);
 const failed=build({...opts,futures:{coverage:{...fc,htx_futures_order_flow_sample:'partial'}}});assert.equal(failed.dq.status,'INSUFFICIENT');assert.equal(failed.stage,'OBSERVE_DATA_INSUFFICIENT');assert.deepEqual(JSON.parse(JSON.stringify(failed.evidence_flags.dq_failure_receipt.mandatory_checks.filter(c=>!c.closed))),[{key:'futures.htx_futures_order_flow_sample',closed:false}]);
 const sh={shadow_id:'S',observed_ts:obs,dq_status:'INSUFFICIENT',evidence_flags_json:JSON.stringify(failed.evidence_flags)},r=sidecar.lifecycleRemovalReceipt({contract:'ZEC-USDT',direction:'LONG',wave_id:'W-ZEC',reason:'DATA_UNUSABLE',handoff:{source_run_id:'CURRENT-REMOVAL'},shadow:sh,observed_ts:obs});assert.deepEqual(r.failed_checks,['futures.htx_futures_order_flow_sample']);assert.equal(r.sufficiency,'PARTIAL');
});

test('administrative cancellation uses one reconciliation slot without increasing delivery limits or joining statistical decisions',async t=>{
 const db=new DB();t.after(()=>db.close());await seed(db);
 db.raw.exec("UPDATE v3_telegram_dispatch_shadow SET decision_id='FINAL-DIAGNOSTIC' WHERE idempotency_key='REMOVE'");
 db.raw.prepare("INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,message_hash,created_ts,updated_ts,shadow_only) VALUES('D-DEFER','DEFER','ZEC-USDT','LONG','W-ZEC','IDEA_REMOVED','v3','PENDING',?,?,?,1)").run(JSON.stringify(receipt()),obs-1,obs-1);
 const result=await reconciler.reconcilePendingPublications(db,{now_ts:NOW});assert.equal(result.processed,1);assert.equal(result.capacity_deferred,1);assert.equal(result.results[0].key,'REMOVE');assert.equal(db.raw.prepare("SELECT state FROM v3_telegram_dispatch_shadow WHERE idempotency_key='DEFER'").get().state,'PENDING');
 const p=db.raw.prepare('SELECT decision_id FROM canonical_publication_shadow WHERE publication_id=?').get(result.results[0].publication_id);assert.equal(p.decision_id,null);
});

test('assembled delivery sends only the separate removal with confirmed prior receipt and retains the original SENT',async t=>{
 const db=new DB();t.after(()=>db.close());const before=await seed(db);let calls=0,payload;
 const result=await sender.runBoundTelegramDeliverySidecar(db,{enabled:true,relay_url:'https://relay.invalid',relay_key:'CONTROLLED',now_ts:NOW,source_run_id:'CURRENT-REMOVAL',fetch_impl:async(_url,options)=>{calls++;payload=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({ok:true,status:'SENT',message_id:7777})};}});
 assert.equal(result.status,'CLOSED',JSON.stringify(result));assert.equal(result.sent,1);assert.equal(calls,1);assert.match(payload.text,/ИДЕЯ СНЯТА/);assert.doesNotMatch(payload.text,/2023|889|91|Оценка/);assert.deepEqual(db.raw.prepare('SELECT * FROM canonical_publication_shadow WHERE publication_id=?').get(before.publication_id),before);
 assert.equal(db.raw.prepare("SELECT state FROM v3_telegram_dispatch_shadow WHERE idempotency_key='OLD'").get().state,'SENT');assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM v3_recheck_task_shadow').get().n,0);
});

test('foreign or retimed DQ predicate detail cannot supply a specific cancellation cause',()=>{
 for(const change of [{contract:'NEAR-USDT'},{evaluated_ts:obs-1},{status:'PARTIAL'}]){
  const shadow={shadow_id:'ZEC',observed_ts:obs,dq_status:'INSUFFICIENT',evidence_flags_json:JSON.stringify({dq_failure_receipt:{schema:'HTX_DQ_PREDICATES_V1',contract:'ZEC-USDT',evaluated_ts:obs,status:'INSUFFICIENT',sufficiency:'INSUFFICIENT',mandatory_checks:[{key:'futures.htx_futures_order_flow_sample',closed:false}],...change}})};
  const r=sidecar.lifecycleRemovalReceipt({contract:'ZEC-USDT',direction:'LONG',wave_id:'W-ZEC',reason:'DATA_UNUSABLE',handoff:{source_run_id:'CURRENT'},shadow,observed_ts:obs});assert.equal(r.sufficiency,null);assert.deepEqual(r.failed_checks,[]);assert.equal(r.detail_status,'ORIGINAL_PREDICATES_NOT_RETAINED');
 }
});
