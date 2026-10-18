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
const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'report2-telegram-backlog-'));
for(const directory of [unified,finalReconciliation,(process.env.REPORT2_TEST_RUNTIME?path.join(process.env.REPORT2_TEST_RUNTIME,'src'):path.join(generation,'files/src'))])for(const name of fs.readdirSync(directory).filter(n=>n.endsWith('.mjs')))fs.copyFileSync(path.join(directory,name),path.join(runtime,name));
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
 prepare(sql){(this.queries??=[]).push(sql);return new Statement(this,sql);}
 async batch(stmts){return Promise.all(stmts.map(s=>s.run()));}
 close(){this.raw.close();}
}


// Controlled queue reproduction. Actual old UNI binding is not present in the
// saved projection; these fixtures do not claim to reconstruct it.
const T=Date.parse('2026-10-18T18:00:00Z');
async function seedBound(db,{key='EXPIRED',expires=T+60000}={}){
 const c={status:'CLOSED',state:'WAIT_FOR_TRIGGER',direction:'LONG',run_id:`CONTROL-${key}`,snapshot_id:`CONTROL-SNAP-${key}`,observed_ts:T,metadata:{contract:'SOL-USDT'},scores:{overall_0_100:72,coin_interest_0_100:72,is_probability:false},entry:{min_price:99,max_price:100},trigger:{metric:'price',operator:'>=',value:100,unit:'USDT',timeframe:'5m',expires_ts:expires,next_recheck_ts:T+1000,cancel_condition:'price<95'},targets:[{price:106}],invalidation:'price<95',source_receipts:[],reasons:[],hard_gates:[],liquidations:{status:'CLOSED',early_context_present:true,analysis_binding:{contract:'SOL-USDT',run_id:`CONTROL-${key}`,snapshot_id:`CONTROL-SNAP-${key}`,observed_ts:T},freshness_max_age_ms:120000,sources:[{venue:'Hyperliquid',native_symbol:'SOL',source_ts:T-1000,price_quote:'USDC',above:[{native_price:110,notional:1000,notional_unit:'USDC',distance_pct:10,side:'SHORT',source_ts:T-1000}],below:[{native_price:90,notional:1000,notional_unit:'USDC',distance_pct:-10,side:'LONG',source_ts:T-1000}]}],above:[],below:[]}};
 c.analytical_fingerprint=publication.canonicalFingerprint(c);
 const p=await publication.persistCanonicalSnapshot(db,{canonical:c,wave_id:key,now_ts:T});assert.equal(p.persisted,true,JSON.stringify(p));
 const tg=publication.renderCanonicalTelegram({canonical:c,lifecycle_event:'WAIT'}),man=publication.renderCanonicalManual({canonical:c});assert.equal(tg.ok,true,JSON.stringify(tg));assert.equal(man.ok,true,JSON.stringify(man));
 const f=await publication.finalizePublication(db,{publication_id:p.publication_id,lifecycle_event:'WAIT',direction:'LONG',manual_text:man.text,telegram_text:tg.text,now_ts:T});assert.equal(f.deliver,true,JSON.stringify(f));
 db.raw.prepare("INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts,shadow_only) VALUES(?,?,'SOL-USDT','LONG',?,'WAIT','v3','FAILED_RETRYABLE',?,?,1)").run('D-'+key,key,key,T,T);
 assert.equal((await publication.bindDispatchToPublication(db,{idempotency_key:key,publication_id:p.publication_id,contract:'SOL-USDT',direction:'LONG',wave_id:key,lifecycle_event:'WAIT',rules_version:'v3',now_ts:T})).bound,true);
 return {p,c};
}
function memory(t){const db=new DB();t.after(()=>db.close());return db;}
test('expired immutable publication terminates even after native context becomes stale',async t=>{
 const db=memory(t),{p}=await seedBound(db);const before=db.raw.prepare('SELECT * FROM canonical_publication_shadow WHERE publication_id=?').get(p.publication_id);
 const out=await publication.loadBoundTelegram(db,{idempotency_key:'EXPIRED',now_ts:T+180000});assert.deepEqual({ok:out.ok,status:out.status},{ok:false,status:'PUBLICATION_EXPIRED'});
 assert.deepEqual(db.raw.prepare('SELECT * FROM canonical_publication_shadow WHERE publication_id=?').get(p.publication_id),before);
});
test('sidecar retires expired bound retry and excludes it from the next delivery pass',async t=>{
 const db=memory(t);await seedBound(db);let calls=0;const args={enabled:true,now_ts:T+180000,source_run_id:'CONTROL-EXECUTOR',fetch_impl:async()=>{calls++;throw Error('No network for expired ideas');}};
 const first=await sender.runBoundTelegramDeliverySidecar(db,args);assert.equal(first.lifecycle[0]?.status,'EXPIRED_NOT_SENT',JSON.stringify(first));assert.equal(first.sent,0);assert.equal(calls,0);
 const row=db.raw.prepare("SELECT state,last_error FROM v3_telegram_dispatch_shadow WHERE idempotency_key='EXPIRED'").get();assert.equal(row.state,'EXPIRED_NOT_SENT');assert.equal(row.last_error,'PUBLICATION_EXPIRED');
 const next=await sender.runBoundTelegramDeliverySidecar(db,{...args,now_ts:args.now_ts+1000});assert.equal(next.lifecycle.some(x=>x.key==='EXPIRED'),false);assert.equal(calls,0);
});
test('unexpired stale native source still fails the existing freshness guard',async t=>{
 const db=memory(t);await seedBound(db,{expires:T+600000});const out=await publication.loadBoundTelegram(db,{idempotency_key:'EXPIRED',now_ts:T+180000});assert.equal(out.ok,false);assert.equal(out.status,'NATIVE_LIQUIDATION_SOURCE_STALE');
});
test('publication and source expiry equality preserve the original strict boundary',async t=>{
 const db=memory(t);await seedBound(db,{expires:T+119000});const exact=await publication.loadBoundTelegram(db,{idempotency_key:'EXPIRED',now_ts:T+119000});assert.equal(exact.ok,true,JSON.stringify(exact));
 const later=await publication.loadBoundTelegram(db,{idempotency_key:'EXPIRED',now_ts:T+119001});assert.equal(later.status,'PUBLICATION_EXPIRED');assert.equal(later.ok,false);
});
test('native source equality remains accepted and its next millisecond is rejected while publication is live',async t=>{
 const db=memory(t);await seedBound(db,{expires:T+600000});assert.equal((await publication.loadBoundTelegram(db,{idempotency_key:'EXPIRED',now_ts:T+119000})).ok,true);
 assert.equal((await publication.loadBoundTelegram(db,{idempotency_key:'EXPIRED',now_ts:T+119001})).status,'NATIVE_LIQUIDATION_SOURCE_STALE');
});
test('expired publication still requires exact binding and fingerprint integrity',async t=>{
 const db=memory(t),{p}=await seedBound(db);db.raw.prepare('UPDATE canonical_publication_shadow SET run_id=? WHERE publication_id=?').run('FOREIGN',p.publication_id);
 assert.equal((await publication.loadBoundTelegram(db,{idempotency_key:'EXPIRED',now_ts:T+180000})).status,'BOUND_PUBLICATION_MISMATCH');
});
test('expiry does not mask tampering with the stored presentation',async t=>{
 const db=memory(t),{p}=await seedBound(db);db.raw.prepare('UPDATE canonical_publication_shadow SET telegram_text=? WHERE publication_id=?').run('TAMPERED',p.publication_id);
 assert.equal((await publication.loadBoundTelegram(db,{idempotency_key:'EXPIRED',now_ts:T+180000})).status,'PRESENTATION_CONTENT_MISMATCH');
});

test('terminal refusal retains its exact binding and original clocks without extra SQL',async t=>{
 const db=memory(t),{p}=await seedBound(db);db.queries=[];const out=await publication.loadBoundTelegram(db,{idempotency_key:'EXPIRED',now_ts:T+180000});
 assert.deepEqual(out.bound_refusal,{publication_id:p.publication_id,contract:'SOL-USDT',direction:'LONG',wave_id:'EXPIRED',lifecycle_event:'WAIT',run_id:'CONTROL-EXPIRED',snapshot_id:'CONTROL-SNAP-EXPIRED',observed_ts:T,checked_ts:T+180000,publication_valid_until_ts:T+60000,identity_verified:true,presentation_verified:true,native_freshness_evaluated:false,native_source_clocks:[{venue:'Hyperliquid',native_symbol:'SOL',source_ts:T-1000,received_ts:null,freshness_max_age_ms:120000}]});
 assert.equal(db.queries.length,2);assert.ok(db.queries.every(q=>q.startsWith('SELECT')));
});
test('live stale refusal records this attempt rather than claiming another current idea is stale',async t=>{
 const db=memory(t),{p}=await seedBound(db,{expires:T+600000});db.queries=[];const out=await publication.loadBoundTelegram(db,{idempotency_key:'EXPIRED',now_ts:T+180000});
 assert.equal(out.status,'NATIVE_LIQUIDATION_SOURCE_STALE');assert.equal(out.bound_refusal.publication_id,p.publication_id);assert.equal(out.bound_refusal.checked_ts,T+180000);assert.equal(out.bound_refusal.native_freshness_evaluated,true);assert.equal(out.bound_refusal.native_source_clocks[0].source_ts,T-1000);assert.equal(db.queries.length,2);
});
