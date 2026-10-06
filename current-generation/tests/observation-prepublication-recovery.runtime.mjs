import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {SQLiteDB} from '../../telegram-repair-tests/sqlite-db.mjs';
const runtime=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const imp=p=>import(pathToFileURL(path.join(runtime,'src',p)));
const {prepareLifecycleTransition}=await imp('v3-telegram-runtime.mjs');
const {deriveLifecycleContext}=await imp('v3-telegram-lifecycle-sidecar.mjs');
const {assessActionability,canonicalFingerprint}=await imp('canonical-publication.mjs');
const {buildRoleEvidenceView}=await imp('source-role-consumer.mjs');
const {qualifiedObservationRecovery}=await imp('observation-prepublication-recovery.mjs');
const {reconcilePendingPublications}=await imp('publication-reconciler.mjs');
const exact=JSON.parse(gunzipSync(fs.readFileSync('original-source/exact-current-data.json.gz')));
assert.equal(exact.source_cloud_run,37436004948);
const retained=exact.rows.find(r=>r.contract_code==='BR-USDT'),original=retained.canonical;
const old=exact.dispatch.results[0];assert.equal(old.last_error,'OBSERVE_SOURCE_ROLES_NOT_CLOSED');
const clone=x=>structuredClone(x);

function controlledCurrent(contract='BR-USDT'){
 // Explicitly controlled later qualification around retained real failure.
 // This is not a new market observation and never sends Telegram.
 const c=clone(original),ts=c.observed_ts+40*60000;
 c.run_id='CONTROLLED-NEW-QUALIFIED-RUN';c.observed_ts=ts;c.snapshot_id=`S392:${contract}:${ts}`;c.snapshot_time_utc=new Date(ts).toISOString();
 c.metadata.contract=contract;c.trigger.expires_ts=ts+1800000;c.trigger.next_recheck_ts=ts+300000;
 for(const r of c.source_receipts){r.contract_code=contract;r.identity.contract_code=contract;r.event_ts=ts-2000;r.received_ts=ts-1000;r.freshness_status='CURRENT_AT_OBSERVATION';r.run_id=c.run_id;r.snapshot_id=c.snapshot_id;}
 const g=c.source_receipts.find(r=>r.provider==='Gate Public Futures'&&r.metric==='price_change_4h');
 g.identity_status='CLOSED';g.identity.status='CLOSED';g.fact_contract_status='CLOSED';g.decision_usable=true;g.identity.asset_identity_verified=true;g.identity.asset_identity_verification_method='CONTROLLED_TEST_ONLY';
 c.metadata.source_role_view=buildRoleEvidenceView(c.source_receipts,{contract,observed_ts:ts});
 c.analytical_fingerprint=canonicalFingerprint(c);
 const wave=contract===old.contract?old.wave_id:`CONTROLLED-WAVE:${contract}`;
 const row={publication_id:`CONTROLLED-PUB:${contract}`,contract_code:contract,run_id:c.run_id,snapshot_id:c.snapshot_id,wave_id:wave,direction:c.direction,canonical_state:c.state,observed_ts:ts,created_ts:ts+10,analytical_fingerprint:c.analytical_fingerprint,canonical_json:JSON.stringify(c)};
 const handoff={contract_code:contract,source_run_id:c.run_id,wave_id:wave,scan_ts:ts-1000,deep_started_ts:ts-500,deep_completed_ts:ts+100,state:'COMPLETED',execution_status:'COMPLETED',data_sufficiency:'PARTIAL',handoff_direction:'LONG'};
 const early={contract_code:contract,wave_id:wave,last_seen_ts:ts,first_seen_ts:ts-10000,lifecycle_stage:'DISCOVERY',direction_hint:'LONG',early_detection_quality_0_100:100};
 const shadow={contract_code:contract,observed_ts:ts,created_ts:ts,direction_hint:'LONG',stage:'SHADOW_OBSERVE_LONG_BIAS',dq_status:'PARTIAL',eq_status:'SHADOW_MEASURABLE',data_sufficiency:'PARTIAL'};
 const now=ts+1000,derived=deriveLifecycleContext({handoff,early,shadow,now_ts:now,canonical:row,canonical_required:true,dispatch_enabled:true});
 assert.equal(derived.status,'CLOSED');assert.equal(assessActionability({canonical:c,lifecycle_event:'OBSERVE'}).deliver,true);
 return{canonical:c,row,ctx:derived.ctx,now};
}
function database(input,override={}){
 const db=new SQLiteDB();db.sqlite.exec(fs.readFileSync('post-v7-consolidated/liquidation/unified-delivery-base/migrations.sql','utf8'));
 const prepare=db.prepare.bind(db);db.prepare=sql=>{const s=prepare(sql);s.sql=sql;return s;};
 db.batch=async stmts=>{db.sqlite.exec('BEGIN IMMEDIATE');try{const out=stmts.map(s=>({success:true,meta:{changes:Number(db.sqlite.prepare(s.sql).run(...(s.args||[])).changes)}}));db.sqlite.exec('COMMIT');return out;}catch(e){db.sqlite.exec('ROLLBACK');throw e;}};
 const contract=input.ctx.contract,wave=input.ctx.wave_id,rules=input.ctx.rules_version,key=`${contract}|LONG|${wave}|OBSERVE|${rules}`;
 const legacy={...old,contract,wave_id:wave,rules_version:rules,idempotency_key:key,dispatch_id:`V3TG:${key}`,...override};
 db.sqlite.prepare(`INSERT INTO v3_user_lifecycle_shadow(contract,direction,wave_id,rules_version,status,reason,observation_ts,valid_until_ts,updated_ts,shadow_only) VALUES(?,?,?,?, 'OBSERVE','USEFUL_LIVE_OBSERVATION',?,?,?,1)`).run(contract,'LONG',wave,rules,original.observed_ts,original.trigger.expires_ts,old.created_ts);
 db.sqlite.prepare(`INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts,sent_ts,telegram_message_id,last_error,shadow_only) VALUES(?,?,?,?,?,'OBSERVE',?,?,?,?,?,?,?,1)`).run(legacy.dispatch_id,key,contract,'LONG',wave,rules,legacy.state,legacy.created_ts,legacy.updated_ts,legacy.sent_ts,legacy.telegram_message_id,legacy.last_error);
 return{db,key,legacy};
}

test('actual retained refusal remains a refusal; controlled new snapshot creates one separate pending observation',async t=>{
 assert.equal(assessActionability({canonical:original,lifecycle_event:'OBSERVE'}).reason,'OBSERVE_SOURCE_ROLES_NOT_CLOSED');
 const before=JSON.stringify(original),input=controlledCurrent(),{db,key}=database(input);t.after(()=>db.close());
 const oldBefore=db.sqlite.prepare('SELECT * FROM v3_telegram_dispatch_shadow WHERE idempotency_key=?').get(key);
 const result=await prepareLifecycleTransition(db,input.ctx,input.now);
 assert.equal(result.dispatch?.state,'PENDING');assert.equal(result.dispatch_decision.reason,'FRESH_QUALIFIED_OBSERVATION_AFTER_UNSENT_SOURCE_ROLE_REFUSAL');
 assert.equal(result.dispatch.idempotency_key,key+'|RECOVERY|'+input.row.snapshot_id);
 assert.deepEqual(db.sqlite.prepare('SELECT * FROM v3_telegram_dispatch_shadow WHERE idempotency_key=?').get(key),oldBefore);
 assert.equal(JSON.stringify(original),before);
 assert.equal((await prepareLifecycleTransition(db,input.ctx,input.now+1)).dispatch,null);
 assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM v3_telegram_dispatch_shadow WHERE state='PENDING'").get().n,1);
 fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/observation-recovery-component-proof.json',JSON.stringify({source_cloud_run:37436004948,original_snapshot:original.snapshot_id,original_fingerprint:original.analytical_fingerprint,original_failure:old.last_error,original_journal_unchanged:true,controlled_future_qualification_not_live_proof:true,controlled_new_pending_count:1,original_actual_report_still_rejected_for_send:true,sourceHTTP:0,MAIN:0,Telegram:0,production_D1:0},null,2));
});

test('sent, pending, sending, unknown network failure, binding and stale/future qualification cannot be recovered',async()=>{
 for(const override of [
  {state:'SENT',sent_ts:old.created_ts,telegram_message_id:'123'},
  {state:'PENDING'},{state:'SENDING'},{state:'FAILED_RETRYABLE'},
  {last_error:'RELAY_TIMEOUT'},{sent_ts:old.created_ts},{telegram_message_id:'123'},
 ]){const input=controlledCurrent(),{db}=database(input,override);try{assert.equal((await prepareLifecycleTransition(db,input.ctx,input.now)).dispatch,null);}finally{db.close();}}
 const input=controlledCurrent();
 for(const change of [
  {now:input.now+1800000},{now:input.row.observed_ts-1},
  {ctx:{...input.ctx,dispatch_enabled:false}},{ctx:{...input.ctx,cooldown_active:true}},
  {ctx:{...input.ctx,contract:'OTHER-USDT'}},
 ])assert.equal(qualifiedObservationRecovery({ctx:input.ctx,previous_status:'OBSERVE',current_status:'OBSERVE',dispatch:{dispatch:false,reason:'NO_STATE_CHANGE'},now:input.now,...change}),null);
 const {db,key}=database(input);try{
  db.sqlite.prepare(`INSERT INTO v3_dispatch_publication_binding_shadow(idempotency_key,publication_id,contract_code,direction,wave_id,lifecycle_event,rules_version,snapshot_id,run_id,observed_ts,analytical_fingerprint,presentation_hash,created_ts,shadow_only) VALUES(?,? ,?,'LONG',?,'OBSERVE',?,?,?,?,?,?,?,1)`).run(key,'OLD-BOUND',input.ctx.contract,input.ctx.wave_id,input.ctx.rules_version,original.snapshot_id,original.run_id,original.observed_ts,original.analytical_fingerprint,'CONTROLLED-HASH',old.created_ts);
  assert.equal((await prepareLifecycleTransition(db,input.ctx,input.now)).dispatch,null);
 }finally{db.close();}
});

test('new dispatch atomically binds its own fresh approved publication without reviving the old snapshot',async t=>{
 const input=controlledCurrent(),{db}=database(input);t.after(()=>db.close());
 const result=await prepareLifecycleTransition(db,input.ctx,input.now);
 db.sqlite.prepare(`INSERT INTO canonical_publication_shadow(publication_id,contract_code,direction,run_id,snapshot_id,wave_id,observed_ts,valid_until_ts,canonical_state,analytical_fingerprint,canonical_json,presentation_inputs_json,created_ts,shadow_only) VALUES(?,?,'LONG',?,?,?,?,?,'OBSERVE',?,?,'{}',?,1)`).run(input.row.publication_id,input.ctx.contract,input.row.run_id,input.row.snapshot_id,input.ctx.wave_id,input.row.observed_ts,input.canonical.trigger.expires_ts,input.canonical.analytical_fingerprint,JSON.stringify(input.canonical),input.row.created_ts);
 const bound=await reconcilePendingPublications(db,{now_ts:input.now+1,source_run_id:input.row.run_id});
 const saved=db.sqlite.prepare('SELECT * FROM v3_dispatch_publication_binding_shadow WHERE idempotency_key=?').get(result.dispatch.idempotency_key);
 assert.ok(saved,JSON.stringify(bound));assert.equal(saved.snapshot_id,input.row.snapshot_id);assert.equal(saved.run_id,input.row.run_id);
 assert.notEqual(saved.snapshot_id,original.snapshot_id);
 assert.equal(db.sqlite.prepare('SELECT state FROM v3_telegram_dispatch_shadow WHERE idempotency_key=?').get(result.dispatch.idempotency_key).state,'PENDING');
});

test('same mechanism handles another exact contract; races, existing sent ideas and bounded journal do not duplicate',async t=>{
 const input=controlledCurrent('TOKEN123-USDT'),{db,key}=database(input);t.after(()=>db.close());
 const results=await Promise.all([prepareLifecycleTransition(db,input.ctx,input.now),prepareLifecycleTransition(db,input.ctx,input.now)]);
 assert.equal(results.filter(r=>r.dispatch).length,1);
 assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM v3_telegram_dispatch_shadow WHERE state='PENDING'").get().n,1);
 db.sqlite.prepare("UPDATE v3_telegram_dispatch_shadow SET state='SENT',sent_ts=?,telegram_message_id='456' WHERE idempotency_key!=?").run(input.now,key);
 assert.equal((await prepareLifecycleTransition(db,input.ctx,input.now+2)).dispatch,null);
 const b=database(input);try{
  for(let i=0;i<8;i++)b.db.sqlite.prepare(`INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,last_error,created_ts,updated_ts,shadow_only) VALUES(?,?,?,'LONG',?,'OBSERVE',?,'FAILED_FINAL','UNKNOWN_FAILURE',?,?,1)`).run('x'+i,'key'+i,input.ctx.contract,input.ctx.wave_id,input.ctx.rules_version,input.now-i,input.now-i);
  assert.equal((await prepareLifecycleTransition(b.db,input.ctx,input.now)).dispatch,null);
 }finally{b.db.close();}
});
