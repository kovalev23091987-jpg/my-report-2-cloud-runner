import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SQLiteDB } from './sqlite-db.mjs';
import { runTelegramOutputLayer, reserveDispatch, buildBudgetBlockedTelegramOutput, buildMorningInformationalMessage, buildWaitInformationalMessage } from '../telegram-output.mjs';
import { reserveInformational, normalizeInfoRow, loadInformationalRows, INFO_D1_BUDGET, INFO_LIMITS, INFO_MIN_SCORE } from '../telegram-info-runtime.mjs';
const NOW=Date.UTC(2026,8,20,12),ID='a'.repeat(64);
const evidence=direction=>JSON.stringify([{domain:'OI_ACCELERATION',side:'BOTH',status:'CLOSED'},{domain:'RELATIVE_STRENGTH',side:direction,status:'CLOSED'},{domain:'FUNDING_TRAJECTORY',side:direction,status:'CLOSED'}]);
const candidate=(direction='LONG',extra={})=>{const r={contract:'RAY-USDT',direction,wave_id:'W1',status:'WAIT',reason:'DIRECTION_CLOSED_ENTRY_WINDOW_NOT_READY',observation_ts:NOW-30000,updated_ts:NOW-10000,valid_until_ts:NOW+240000,early_detection_quality_0_100:73,evidence_refs_json:evidence(direction),...extra};return {...r,early_last_seen_ts:r.updated_ts,evidence_observed_ts:r.updated_ts,current_evidence_json:r.evidence_refs_json};};
const okFetch=calls=>async(_url,init)=>{calls.push(JSON.parse(init.body));return {ok:true,status:200,json:async()=>({ok:true,status:'SENT',message_id:77})};};
async function run(db,extra={}) {const calls=[];const out=await runTelegramOutputLayer({db,startedTs:NOW,source:'schedule',enabled:true,infoEnabled:true,shadowDecisionAuto:false,relayUrl:'https://relay.invalid',relayKey:'TEST_FIXTURE_ONLY',clock:()=>NOW,fetchImpl:okFetch(calls),...extra});return {out,calls};}
const reserveArgs=(extra={})=>({dispatchKey:'info:wait:one',category:'SHADOW_FINAL_DECISION',sourceRef:'INFO_WAIT|RAY-USDT|LONG',text:'НЕ ТОРГОВЫЙ СИГНАЛ',now:NOW,wait:true,...extra});

test('original R3 failure reproduced with actual archived migration, while known categories insert',async()=>{
 const db=new SQLiteDB();const old=await reserveDispatch(db,{dispatchKey:'final-chain:info-morning-test:1',category:'FINAL_CHAIN_CANDIDATE',sourceRef:'INFO_MORNING_TEST',text:'test',now:NOW});
 assert.equal(old.reason,'RESERVATION_CONFLICT_WITHOUT_ROW');assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM telegram_output_dispatch_journal_v2').get().n,0);
 const claim=await reserveInformational(db,reserveArgs());assert.equal(claim.reserved,true);db.close();
});
test('morning test uses compatible category and confirmed receipt, exactly one network call',async()=>{
 const db=new SQLiteDB();db.add(candidate());const {out,calls}=await run(db,{reportTest:true,infoTestId:ID,source:'workflow_dispatch'});
 assert.equal(out.morning.sent,true);assert.equal(calls.length,1);assert.match(calls[0].text,/НЕ ТОРГОВЫЙ СИГНАЛ/);assert.doesNotMatch(calls[0].text,/\d\s*%/);
 assert.equal(db.sqlite.prepare('SELECT category FROM telegram_output_dispatch_journal_v2').get().category,'MORNING_REPORT');
 const again=await run(db,{reportTest:true,infoTestId:ID,source:'workflow_dispatch'});assert.equal(again.calls.length,0);assert.equal(again.out.morning.delivery_confirmed,true);assert.equal(again.out.morning.sent,false);db.close();
});
test('LONG and SHORT WAIT symmetry, exact Unicode identity and no guessed alias',async()=>{
 for(const d of ['LONG','SHORT'])for(const contract of ['RAY-USDT','币安人生-USDT']) {const db=new SQLiteDB();db.add(candidate(d,{contract}));const {out,calls}=await run(db);assert.equal(out.early_info.sent,true);assert.equal(calls.length,1);assert.deepEqual(Object.keys(calls[0]),['text']);assert.match(calls[0].text,/🟡 ЖДЁМ/);assert.match(calls[0].text,/Оценка: 73 из 100/);assert.doesNotMatch(calls[0].text,/ПЕРЕЗАХОД/);assert.equal(out.early_info.contract,contract);db.close();}
 for(const contract of [' RAY-USDT','RAY\u202E-USDT','ＲＡＹ-USDT'])assert.equal(normalizeInfoRow(candidate('LONG',{contract}),NOW),null);
});
test('missing/null/stale/future/malformed facts never become valid rows in loader or builders',async()=>{
 for(const field of ['observation_ts','updated_ts','valid_until_ts'])for(const bad of [null,0,'123',NaN,NOW+1000000]) {
  if(field==='valid_until_ts'&&bad===NOW+1000000)continue;
  const row=candidate('LONG',{[field]:bad});assert.equal(normalizeInfoRow(row,NOW),null);assert.equal(buildWaitInformationalMessage(row,{now:NOW}).ok,false);assert.equal(buildMorningInformationalMessage([row],{now:NOW}).long_count,0);
 }
 assert.equal(normalizeInfoRow(candidate('LONG',{observation_ts:NOW-INFO_LIMITS.freshMs-1}),NOW),null);
 assert.equal(normalizeInfoRow(candidate('LONG',{reason:'HARD_VETO'}),NOW),null);
 const db=new SQLiteDB();db.add(candidate('LONG',{observation_ts:NOW-INFO_LIMITS.freshMs-1}));const {calls}=await run(db);assert.equal(calls.length,0);db.close();
});
test('source index is mandatory and query plan uses it; schema missing fails before network',async()=>{
 const db=new SQLiteDB();await loadInformationalRows(db,NOW);const sql=db.sql.at(-1);const plan=db.sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all(NOW-INFO_LIMITS.freshMs,NOW).map(x=>x.detail).join('\n');assert.match(plan,/idx_report2_info_lifecycle_fresh/);assert.match(plan,/v3_early_feature_snapshot/);
 db.sqlite.exec('DROP INDEX idx_report2_info_lifecycle_fresh');const {out,calls}=await run(db);assert.equal(calls.length,0);assert.equal(out.morning.status,'INFO_ERROR_FAIL_CLOSED');db.close();
});
test('same wave is durable dedup; different waves share atomic 30 minute cooldown',async()=>{
 const db=new SQLiteDB();db.add(candidate());assert.equal((await run(db)).calls.length,1);assert.equal((await run(db)).calls.length,0);
 db.add(candidate('LONG',{wave_id:'W2',updated_ts:NOW}));assert.equal((await run(db)).calls.length,0);
 db.sqlite.exec('DELETE FROM v3_user_lifecycle_shadow');const later=NOW+INFO_LIMITS.cooldownMs+1;db.add(candidate('LONG',{wave_id:'W2',observation_ts:later-10,updated_ts:later-5,valid_until_ts:later+60000}));assert.equal((await run(db,{startedTs:later,clock:()=>later})).calls.length,1);db.close();
});
test('two independent connections cannot acquire separate waves concurrently',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'info-race-')),file=path.join(dir,'db.sqlite');const a=new SQLiteDB(file),b=new SQLiteDB(file);
 const claims=await Promise.all([reserveInformational(a,reserveArgs()),reserveInformational(b,reserveArgs({dispatchKey:'info:wait:two'}))]);assert.equal(claims.filter(x=>x.reserved).length,1);a.close();b.close();fs.rmSync(dir,{recursive:true});
});
test('restart preserves sent identity and ambiguity never enables automatic retry',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'info-restart-')),file=path.join(dir,'db.sqlite');let db=new SQLiteDB(file);db.add(candidate());let r=await run(db,{fetchImpl:async()=>{throw new Error('NETWORK_AFTER_POSSIBLE_DELIVERY');}});assert.equal(r.out.early_info.sent,false);db.close();db=new SQLiteDB(file);r=await run(db);assert.equal(r.calls.length,0);
 db.sqlite.exec('DELETE FROM v3_user_lifecycle_shadow');const later=NOW+INFO_LIMITS.cooldownMs+1;db.add(candidate('LONG',{wave_id:'W2',observation_ts:later-10,updated_ts:later-5,valid_until_ts:later+60000}));assert.equal((await run(db,{startedTs:later,clock:()=>later})).calls.length,0);db.close();fs.rmSync(dir,{recursive:true});
});
test('ACK missing/null/string/rows_written and partial failures cannot authorize send',async()=>{
 for(const value of [{},{meta:{changes:null}},{meta:{changes:'1'}},{meta:{rows_written:1}},{success:false,meta:{changes:1}},{meta:{changes:2}}]) {const db=new SQLiteDB();db.add(candidate());db.ackOverride=value;const {out,calls}=await run(db);assert.equal(calls.length,0);assert.equal(out.early_info.sent,false);db.close();}
 for(const phase of ['prepare','read','write']){const db=new SQLiteDB();db.add(candidate());db.fail=phase;const {calls}=await run(db);assert.equal(calls.length,0);db.close();}
});
test('finalize lost ACK does not report SENT or retry automatically',async()=>{
 const db=new SQLiteDB();db.add(candidate());let calls=0;const {out}=await run(db,{fetchImpl:async()=>{calls++;db.ackOverride={};return {ok:true,status:200,json:async()=>({ok:true,message_id:91})};}});assert.equal(calls,1);assert.equal(out.early_info.sent,false);db.ackOverride=null;assert.equal((await run(db)).calls.length,0);db.close();
});
test('corrupted persisted reservation and absent receipt cannot create a confirmation',async()=>{
 const db=new SQLiteDB();db.add(candidate());const r=await run(db,{fetchImpl:async()=>({ok:true,status:200,json:async()=>({ok:true})})});assert.equal(r.out.early_info.sent,false);assert.equal((await run(db)).calls.length,0);db.close();
 const db2=new SQLiteDB();await reserveInformational(db2,reserveArgs());db2.sqlite.exec("UPDATE telegram_output_dispatch_journal_v2 SET message_hash='broken'");assert.equal((await reserveInformational(db2,reserveArgs())).reason,'INFO_CORRUPT_JOURNAL_STATE');db2.close();
});
test('late database response expires evidence before send',async()=>{
 const db=new SQLiteDB();db.add(candidate());let tick=0;const {calls,out}=await run(db,{clock:()=>NOW+(tick++?70000:0)});assert.equal(calls.length,0);assert.ok(['INFO_STALE_BEFORE_RESERVATION','INFO_STALE_BEFORE_SEND'].includes(out.early_info.status));db.close();
});
test('storage fuse bounds only the informational namespace and preserves legacy rows',async()=>{
 const db=new SQLiteDB();const st=db.sqlite.prepare("INSERT INTO telegram_output_dispatch_journal_v2(dispatch_key,category,source_ref,status,reserved_ts,updated_ts,message_hash) VALUES(?,'MORNING_REPORT','INFO_TEST','SENT',?,?,?)");
 db.sqlite.exec('BEGIN');for(let i=0;i<INFO_LIMITS.journalRows;i++)st.run('info:test:'+i,NOW,NOW,'b'.repeat(64));db.sqlite.exec('COMMIT');const r=await reserveInformational(db,reserveArgs());assert.equal(r.reserved,false);assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM telegram_output_dispatch_journal_v2').get().n,INFO_LIMITS.journalRows);db.close();
});
test('budget-block proof preserves actual gates and bounded envelope fits the run headroom observed remotely',()=>{
 const closed=buildBudgetBlockedTelegramOutput({enabled:'0',infoEnabled:'1',shadowDecisionAuto:'0'});assert.equal(closed.enabled,false);assert.equal(closed.info_enabled,false);assert.equal(closed.final_chain_auto,false);
 const open=buildBudgetBlockedTelegramOutput({enabled:'1',infoEnabled:'1',shadowDecisionAuto:'0'});assert.equal(open.enabled,true);assert.equal(open.info_enabled,true);assert.equal(open.final_chain_auto,false);
 assert.deepEqual(INFO_D1_BUDGET,{rowsRead:1536,rowsWritten:4});assert.equal(INFO_MIN_SCORE,70);assert.ok(6388+INFO_D1_BUDGET.rowsRead<=16000);assert.ok(13538+INFO_D1_BUDGET.rowsRead<=16000);assert.ok(156+INFO_D1_BUDGET.rowsWritten<=320);
});
test('output disabled, conflicting flags, and invalid test identity never send',async()=>{
 for(const extra of [{enabled:false},{shadowDecisionAuto:true},{reportTest:true,infoTestId:null}]){const db=new SQLiteDB();db.add(candidate());const {calls}=await run(db,extra);assert.equal(calls.length,0);db.close();}
});
test('already sent newest candidate does not starve another eligible symbol',async()=>{
 const db=new SQLiteDB();db.add(candidate());assert.equal((await run(db)).calls.length,1);db.add(candidate('SHORT',{contract:'AKE-USDT',wave_id:'AKE1',updated_ts:NOW-15000}));const r=await run(db);assert.equal(r.calls.length,1);assert.equal(r.out.early_info.contract,'AKE-USDT');db.close();
});
test('additive index is idempotent and existing journal constraints remain unchanged',()=>{
 const db=new SQLiteDB();const before=db.sqlite.prepare("SELECT sql FROM sqlite_master WHERE name='telegram_output_dispatch_journal_v2'").get().sql;db.sqlite.exec(fs.readFileSync(new URL('./fixtures/info-lifecycle-index.sql',import.meta.url),'utf8'));const after=db.sqlite.prepare("SELECT sql FROM sqlite_master WHERE name='telegram_output_dispatch_journal_v2'").get().sql;assert.equal(after,before);assert.throws(()=>db.sqlite.prepare("INSERT INTO telegram_output_dispatch_journal_v2(dispatch_key,category,status,reserved_ts,updated_ts,message_hash) VALUES('x','INVALID','RESERVED',1,1,'x')").run(),/CHECK/);db.close();
});
