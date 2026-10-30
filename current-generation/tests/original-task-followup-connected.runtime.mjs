import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';

const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'current-generation/files');
const {canonicalFingerprint,loadBoundTelegram,assessActionability,renderCanonicalTelegram,renderCanonicalManual,sha256}=await import(pathToFileURL(path.join(root,'src/canonical-publication.mjs')));
const {prepareOriginalIdeaTerminal:current}=await import(pathToFileURL(path.join(root,'src/original-idea-terminal.mjs')));
const {reconcilePendingPublications}=await import(pathToFileURL(path.join(root,'src/publication-reconciler.mjs')));
const {runBoundTelegramDeliverySidecar}=await import(pathToFileURL(path.join(root,'src/bound-telegram-delivery-sidecar.mjs')));
const fixture='current-generation/tests/fixtures/original-idea-terminal-before-followup-20261019.mjs';
const bytes=fs.readFileSync(fixture),baselineFile=path.join(root,'src/.original-terminal-before-followup-test.mjs');
fs.writeFileSync(baselineFile,bytes);after(()=>fs.rmSync(baselineFile,{force:true}));
const {prepareOriginalIdeaTerminal:before}=await import(pathToFileURL(baselineFile));
const original=JSON.parse(gunzipSync(fs.readFileSync('checkpoints/actual-zec-sent150-original-input-20261007.json.gz'))).rows.find(r=>r.contract_code==='ZEC-USDT').canonical;
const now=Date.parse('2026-10-19T08:11:00Z'),task={task_id:'RCHK:CONTROLLED:FOLLOWUP',publication_id:'PUB:CONTROLLED:FOLLOWUP',
 contract_code:'ZEC-USDT',direction:'LONG',wave_id:'CONTROLLED:WAVE',run_id:original.run_id,snapshot_id:original.snapshot_id,
 due_ts:original.trigger.next_recheck_ts,expires_ts:original.trigger.expires_ts,telegram_message_id:'150'};
function light(extra={}){return {schema:'LIGHT_PRICE_RECHECK_V1',task_id:task.task_id,publication_id:task.publication_id,
 run_id:task.run_id,snapshot_id:task.snapshot_id,analytical_fingerprint:original.analytical_fingerprint,telegram_message_id:'150',
 checked_ts:original.observed_ts+3000,source_ts:original.observed_ts+1000,observed_ts:original.observed_ts+2000,
 source:'HTX_OFFICIAL_COLLECTOR',price:1390,status:'TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED',
 settlement_confirmed:false,entry_authorized:false,full_analysis_completed:false,...extra};}
class DB{
 constructor(result,state='EXPIRED'){this.sql=new DatabaseSync(':memory:');this.calls=[];
  this.sql.exec(`CREATE TABLE v3_recheck_task_shadow(task_id TEXT PRIMARY KEY,publication_id TEXT,contract_code TEXT,direction TEXT,wave_id TEXT,run_id TEXT,snapshot_id TEXT,due_ts INTEGER,expires_ts INTEGER,state TEXT,last_result TEXT,updated_ts INTEGER,attempt_count INTEGER);
   CREATE INDEX idx_v3_recheck_due ON v3_recheck_task_shadow(state,due_ts,expires_ts);
   CREATE TABLE canonical_publication_shadow(publication_id TEXT PRIMARY KEY,canonical_json TEXT);
   CREATE TABLE v3_dispatch_publication_binding_shadow(idempotency_key TEXT,publication_id TEXT,contract_code TEXT,direction TEXT,wave_id TEXT,run_id TEXT,snapshot_id TEXT,rules_version TEXT,lifecycle_event TEXT,observed_ts INTEGER);
   CREATE TABLE v3_user_lifecycle_shadow(contract TEXT,direction TEXT,wave_id TEXT,rules_version TEXT,status TEXT,reason TEXT,observation_ts INTEGER,updated_ts INTEGER);
   CREATE TABLE v3_telegram_dispatch_shadow(dispatch_id TEXT PRIMARY KEY,idempotency_key TEXT UNIQUE,contract TEXT,direction TEXT,wave_id TEXT,lifecycle_event TEXT,rules_version TEXT,state TEXT,decision_id TEXT,message_hash TEXT,created_ts INTEGER,updated_ts INTEGER,shadow_only INTEGER,telegram_message_id TEXT,last_error TEXT,sent_ts INTEGER);`);
  this.sql.prepare('INSERT INTO v3_recheck_task_shadow VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(task.task_id,task.publication_id,task.contract_code,task.direction,task.wave_id,task.run_id,task.snapshot_id,task.due_ts,task.expires_ts,state,result,now-1000,2);
  this.sql.prepare('INSERT INTO canonical_publication_shadow VALUES(?,?)').run(task.publication_id,JSON.stringify(original));
  this.sql.prepare('INSERT INTO v3_dispatch_publication_binding_shadow VALUES(?,?,?,?,?,?,?,?,?,?)').run('ORIGINAL',task.publication_id,task.contract_code,task.direction,task.wave_id,task.run_id,task.snapshot_id,'R','OBSERVE',original.observed_ts);
  this.sql.prepare('INSERT INTO v3_user_lifecycle_shadow VALUES(?,?,?,?,?,?,?,?)').run(task.contract_code,task.direction,task.wave_id,'R','OBSERVE',null,original.observed_ts,now-1000);
  this.sql.prepare('INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,telegram_message_id) VALUES(?,?,?,?,?,?,?,?,?)').run('ORIGINAL','ORIGINAL',task.contract_code,task.direction,task.wave_id,'OBSERVE','R','SENT','150');
  this.sql.exec('ALTER TABLE v3_user_lifecycle_shadow ADD COLUMN valid_until_ts INTEGER');
 }
 prepare(q){const db=this;let args=[];return {bind(...a){args=a;return this;},
  async first(){db.calls.push({q,args,method:'first'});return db.sql.prepare(q).get(...args)||null;},
  async all(){db.calls.push({q,args,method:'all'});return {results:db.sql.prepare(q).all(...args)};},
  async run(){db.calls.push({q,args,method:'run'});return {meta:db.sql.prepare(q).run(...args)};}};}
 async batch(ss){this.sql.exec('BEGIN');try{const rs=[];for(const s of ss)rs.push(await s.run());this.sql.exec('COMMIT');return rs;}catch(e){this.sql.exec('ROLLBACK');throw e;}}
 snapshot(){return ['v3_recheck_task_shadow','v3_user_lifecycle_shadow','v3_telegram_dispatch_shadow'].map(t=>this.sql.prepare(`SELECT * FROM ${t} ORDER BY 1`).all());}
}
for(const [name,last] of [
 ['retained first-trigger receipt',JSON.stringify({schema:'RECHECK_COMPLETION_V1',status:'EXPIRED',reason:'TTL_EXPIRED_BEFORE_RECHECK',completed_ts:now-1000,original_light_price_receipt:light()})],
 ['missing retained price history',JSON.stringify({schema:'RECHECK_COMPLETION_V1',status:'EXPIRED',reason:'TTL_EXPIRED_BEFORE_RECHECK',completed_ts:now-1000})],
 ['foreign retained light identity',JSON.stringify({schema:'RECHECK_COMPLETION_V1',status:'EXPIRED',original_light_price_receipt:light({task_id:'FOREIGN'})})]
])test(`owner silent expiry closes lifecycle with no queued Telegram and retains internal history: ${name}`,async()=>{
 const a=new DB(last),b=new DB(last);
 try{
  const old=await before(a,{now_ts:now}),next=await current(b,{now_ts:now});
  assert.equal(old.queued,true);assert.equal(next.queued,false);assert.equal(next.status,'ORIGINAL_EXPIRY_CLOSED_SILENTLY');assert.equal(next.lifecycle_closed,true);
  const {task_followup}=next;assert.equal(b.calls.length,a.calls.length-1);assert.deepEqual(b.calls.slice(0,2),a.calls.slice(0,2));assert.deepEqual(b.calls[2].args,a.calls[2].args);assert.equal(b.calls[2].q,a.calls[2].q.replace("NOT EXISTS(SELECT 1 FROM v3_telegram_dispatch_shadow WHERE contract=?1 AND direction=?2 AND wave_id=?3 AND rules_version=?4 AND lifecycle_event='IDEA_REMOVED')",'1=1'));
  assert.deepEqual(b.snapshot().slice(0,2),a.snapshot().slice(0,2));
  assert.equal(b.sql.prepare("SELECT COUNT(*) AS n FROM v3_telegram_dispatch_shadow WHERE lifecycle_event='IDEA_REMOVED'").get().n,0);
  assert.equal(b.sql.prepare("SELECT telegram_message_id FROM v3_telegram_dispatch_shadow WHERE idempotency_key='ORIGINAL'").get().telegram_message_id,'150');
  assert.equal(task_followup.task.state,'EXPIRED');assert.equal(task_followup.task.attempt_count,2);
  assert.equal(task_followup.entry_authorized,false);assert.equal(task_followup.actual_ENTRY,null);
  assert.equal(task_followup.retained_light_history_complete,false);
  if(name.startsWith('retained'))assert.equal(task_followup.retained_light_checks[0].status,'TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED');
  else assert.equal(task_followup.retained_light_checks.length,0);
  assert.equal(original.analytical_fingerprint,canonicalFingerprint(original));
  assert.ok(Buffer.byteLength(JSON.stringify(task_followup))<8192);
 }finally{a.sql.close();b.sql.close();}
});
test('baseline source and assembled helper are explicit immutable qualification inputs',()=>{
 assert.equal(createHash('sha256').update(bytes).digest('hex'),process.env.REPORT2_ORIGINAL_TERMINAL_BASELINE_SHA);
 assert.equal(fs.readFileSync(path.join(root,'src/original-task-followup-audit.mjs'),'utf8'),fs.readFileSync('current-generation/files/src/original-task-followup-audit.mjs','utf8'));
});
test('price cancellation keeps the existing SQL and removal message while expiry policy stays separate',async()=>{
 const match=/price\s*(>=|<=|>|<)\s*([0-9.]+)/i.exec(original.trigger.cancel_condition);
 assert.ok(match);const price=Number(match[2])*(match[1].startsWith('<')?.9:1.1);
 const last=JSON.stringify(light({status:'CANCELLED',price})),a=new DB(last,'CANCELLED'),b=new DB(last,'CANCELLED');
 try{
  const old=await before(a,{now_ts:now}),next=await current(b,{now_ts:now});
  assert.equal(old.queued,true);const {task_followup,...same}=next;assert.deepEqual(same,old);
  assert.equal(next.reason,'ORIGINAL_PRICE_CANCELLED');assert.deepEqual(b.calls,a.calls);
  assert.deepEqual(b.snapshot(),a.snapshot());assert.equal(task_followup.entry_authorized,false);
 }finally{a.sql.close();b.sql.close();}
});
test('a previously queued unbound expiry is finalized once without a new canonical publication',async()=>{
 const db=new DB(JSON.stringify({schema:'RECHECK_COMPLETION_V1',status:'EXPIRED'}));
 try{
  assert.equal((await before(db,{now_ts:now})).queued,true);db.calls.length=0;
  const result=await reconcilePendingPublications(db,{now_ts:now+1000,limit:4,source_run_id:'CONTROLLED:CURRENT'});
  assert.equal(result.results[0].status,'OWNER_TTL_NOTICE_DISABLED');
  const row=db.sql.prepare("SELECT * FROM v3_telegram_dispatch_shadow WHERE lifecycle_event='IDEA_REMOVED'").get();
  assert.equal(row.state,'FAILED_FINAL');assert.equal(row.last_error,'OWNER_TTL_NOTICE_DISABLED');
  assert.equal(db.calls.some(c=>c.q.includes('INSERT INTO canonical_publication_shadow')),false);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM canonical_publication_shadow').get().n,1);
  assert.equal((await reconcilePendingPublications(db,{now_ts:now+2000,limit:4})).processed,0);
 }finally{db.sql.close();}
});
test('a previously bound expiry cannot reach Telegram or occupy a retry slot on the next call',async()=>{
 const seeded=new DB(JSON.stringify({schema:'RECHECK_COMPLETION_V1',status:'EXPIRED'}));
 let receipt;try{await before(seeded,{now_ts:now});receipt=JSON.parse(seeded.sql.prepare("SELECT message_hash FROM v3_telegram_dispatch_shadow WHERE lifecycle_event='IDEA_REMOVED'").get().message_hash);}finally{seeded.sql.close();}
 const c={status:'CLOSED',state:'REJECTED',direction:'LONG',run_id:receipt.source_run_id,
  snapshot_id:'CONTROLLED:REMOVAL',observed_ts:now,
  metadata:{contract:task.contract_code,publication_kind:'LIFECYCLE_ADMINISTRATIVE',lifecycle_removal:{...receipt,prior_publication_id:task.publication_id,prior_idempotency_key:'ORIGINAL'}},
  scores:{overall_0_100:null,coin_interest_0_100:null,entry_readiness_0_100:null,is_probability:false},
  trigger:null,entry:null,targets:[],source_receipts:[],hard_gates:[],reasons:[],liquidations:{status:'NOT_EVALUATED',above:[],below:[]}};
 c.analytical_fingerprint=canonicalFingerprint(c);
 const tg=renderCanonicalTelegram({canonical:c,lifecycle_event:'IDEA_REMOVED'}),manual=renderCanonicalManual({canonical:c});assert.equal(tg.ok,true);assert.equal(manual.ok,true);
 const hash=sha256({manual_text:manual.text,telegram_text:tg.text,analytical_fingerprint:c.analytical_fingerprint});
 const b={idempotency_key:'CONTROLLED:TTL',publication_id:'PUB:CONTROLLED:TTL',contract_code:task.contract_code,direction:'LONG',wave_id:task.wave_id,lifecycle_event:'IDEA_REMOVED',rules_version:'R',run_id:c.run_id,snapshot_id:c.snapshot_id,observed_ts:now,analytical_fingerprint:c.analytical_fingerprint,presentation_hash:hash};
 const p={...b,canonical_json:JSON.stringify(c),actionability_status:'ACTIONABLE',telegram_text:tg.text,manual_text:manual.text};
 let state='PENDING',networkCalls=0;
 const db={prepare(q){let args=[];return {bind(...a){args=a;return this;},async all(){
  if(q.includes('FROM v3_recheck_task_shadow')||q.includes('b.idempotency_key IS NULL'))return {results:[]};
  if(q.includes('SELECT d.dispatch_id'))return {results:['PENDING','FAILED_RETRYABLE'].includes(state)?[{...b,contract:task.contract_code,state,created_ts:now,updated_ts:now,message_hash:JSON.stringify(receipt)}]:[]};
  throw Error('UNEXPECTED_SQL:'+q);
 },async first(){if(q.includes('FROM v3_dispatch_publication_binding_shadow'))return b;if(q.includes('FROM canonical_publication_shadow'))return p;throw Error('UNEXPECTED_SQL:'+q);},async run(){assert.match(q,/UPDATE v3_telegram_dispatch_shadow SET state=/);state=args[1];return {meta:{changes:1}};}};}};
 const opts={enabled:true,now_ts:now+1000,fetch_impl:async()=>{networkCalls++;throw Error('UNEXPECTED_TELEGRAM');}};
 assert.equal((await loadBoundTelegram(db,{idempotency_key:b.idempotency_key,now_ts:now+1000})).status,'OWNER_TTL_NOTICE_DISABLED');
 const result=await runBoundTelegramDeliverySidecar(db,opts);assert.equal(result.sent,0);assert.equal(result.lifecycle[0].reason,'OWNER_TTL_NOTICE_DISABLED');
 assert.equal(state,'FAILED_FINAL');assert.equal((await runBoundTelegramDeliverySidecar(db,{...opts,now_ts:now+2000})).lifecycle.length,0);assert.equal(networkCalls,0);
 assert.equal(assessActionability({canonical:c,lifecycle_event:'IDEA_REMOVED',prior_sent:true}).reason,'OWNER_TTL_NOTICE_DISABLED');
 c.metadata.lifecycle_removal.reason='ORIGINAL_PRICE_CANCELLED';assert.equal(assessActionability({canonical:c,lifecycle_event:'IDEA_REMOVED',prior_sent:true}).deliver,true);
});
test('known unbound TTL with missing lifecycle cannot monopolize reconciliation before another pending row',async()=>{
 const db=new DB(JSON.stringify({schema:'RECHECK_COMPLETION_V1',status:'EXPIRED'}));
 try{
  await before(db,{now_ts:now});db.sql.exec('DELETE FROM v3_user_lifecycle_shadow');
  db.sql.prepare("INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts) VALUES(?,?,?,?,?,?,?,?,?,?)").run('ENTRY','ENTRY',task.contract_code,'LONG','OTHER:WAVE','ENTRY','R','PENDING',now,now);
  const result=await reconcilePendingPublications(db,{now_ts:now+1000,limit:4});
  assert.equal(result.processed,2);assert.equal(result.results[0].status,'OWNER_TTL_NOTICE_DISABLED');
  // Missing ENTRY lifecycle is a deliberate negative input. It is now reached,
  // rather than being indefinitely hidden by the unrelated TTL row.
  assert.equal(result.results[1].key,'ENTRY');assert.equal(result.results[1].status,'LIFECYCLE_NOT_FOUND');
  assert.equal(db.sql.prepare("SELECT state FROM v3_telegram_dispatch_shadow WHERE lifecycle_event='IDEA_REMOVED'").get().state,'FAILED_FINAL');
 }finally{db.sql.close();}
});
test('silent expiry closes a live lifecycle even if an old removal is already queued',async()=>{
 const db=new DB(JSON.stringify({schema:'RECHECK_COMPLETION_V1',status:'EXPIRED'}));
 try{
  await before(db,{now_ts:now});db.sql.exec("UPDATE v3_user_lifecycle_shadow SET status='OBSERVE'");
  const result=await current(db,{now_ts:now+1000});assert.equal(result.lifecycle_closed,true);assert.equal(result.queued,false);
  assert.equal(db.sql.prepare('SELECT status FROM v3_user_lifecycle_shadow').get().status,'IDEA_REMOVED');
  assert.equal((await current(db,{now_ts:now+2000})).status,'NO_ELIGIBLE_ORIGINAL_TERMINAL');
  assert.equal(db.sql.prepare("SELECT COUNT(*) AS n FROM v3_telegram_dispatch_shadow WHERE lifecycle_event='IDEA_REMOVED'").get().n,1);
 }finally{db.sql.close();}
});
test('a known zero closure acknowledgement continues to the next eligible cancellation rather than claiming silent success',async()=>{
 const match=/price\s*(>=|<=|>|<)\s*([0-9.]+)/i.exec(original.trigger.cancel_condition),price=Number(match[2])*(match[1].startsWith('<')?.9:1.1);
 const first={...task,state:'EXPIRED',rules_version:'R',last_result:JSON.stringify({schema:'RECHECK_COMPLETION_V1',status:'EXPIRED'})};
 const second={...task,task_id:'RCHK:CONTROLLED:SECOND',state:'CANCELLED',rules_version:'R',last_result:JSON.stringify(light({task_id:'RCHK:CONTROLLED:SECOND',status:'CANCELLED',price}))};
 let batches=0;
 const db={prepare(q){return {bind(){return this;},async all(){return {results:[first,second]};},async first(){return {canonical_json:JSON.stringify(original)};}};},async batch(){batches++;return batches===1?[{meta:{changes:0}}]:[{meta:{changes:1}},{meta:{changes:1}}];}};
 const result=await current(db,{now_ts:now});assert.equal(result.queued,true);assert.equal(result.task_id,second.task_id);assert.equal(result.reason,'ORIGINAL_PRICE_CANCELLED');assert.equal(batches,2);
});
test('unknown native cost after terminal writes stops before reconciliation and transport',async()=>{
 const db=new DB(JSON.stringify({schema:'RECHECK_COMPLETION_V1',status:'EXPIRED'}));
 let unknown=0,network=0;const batch=db.batch.bind(db);
 db.usageSnapshot=()=>({rows_read:0,rows_written:0,requests:db.calls.length,unknown_ops:unknown});
 db.batch=async ss=>{const r=await batch(ss);unknown=1;return r;};
 try{
  const result=await runBoundTelegramDeliverySidecar(db,{enabled:true,now_ts:now,fetch_impl:async()=>{network++;throw Error('NO_NETWORK');}});
  assert.equal(result.phase,'ORIGINAL_TERMINAL');assert.equal(result.status,'BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED');
  assert.equal(db.calls.length,3);assert.equal(network,0);assert.equal(result.sent,0);
 }finally{db.sql.close();}
});
