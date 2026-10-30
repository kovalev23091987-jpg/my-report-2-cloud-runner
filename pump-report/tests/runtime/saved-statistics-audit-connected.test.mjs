import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../runtime/store.mjs';
import {createOutcomeJournal} from '../../runtime/outcome-journal.mjs';
import {createRetainedCapsuleWriter} from '../../runtime/retained-capsules.mjs';
import {createSavedStatisticsAudit,saveProspectiveAuditPlan,readAuditPoint} from '../../runtime/saved-statistics-audit.mjs';
import {createSummaryRecordIndex} from '../../runtime/summary-index.mjs';
import {analyzePump} from '../../analytics/index.mjs';
import {textHash} from '../../runtime/text-hash.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {input,T} from '../analytics/fixtures.mjs';

// New ROOT connected cases only. All market data, identities and implementation
// claims are artificial MemoryStore fixtures, with no native or provider IO.
async function fixture(Store=MemoryStore){
  const store=new Store(),x=input();x.mode='MANUAL';x.run_purpose='PRODUCTION';x.run_id='ARTIFICIAL_ROOT_Z_CONNECT';
  x.instrument.instrument_id='ARTIFICIAL:ROOT:Z-USDT';x.instrument.asset_id='ARTIFICIAL:ROOT:Z';
  for(const f of Object.values(x.facts))f.instrument_id=x.instrument.instrument_id;
  for(const row of x.facts.candles.value.slice(-5))row.volume_base=3000;
  const analysis=analyzePump(x);assert.equal(analysis.ready,true,JSON.stringify(analysis.reasons));
  let now=T;const clock=()=>now,analysis_key='pump:analysis:'+await textHash(JSON.stringify(analysis));
  const implementation_sha256=await textHash('ARTIFICIAL_ROOT_Z_IMPLEMENTATION');
  await store.set(analysis_key,{analysis,input:x,saved_ts:T,implementation_sha256,evidence_class:'OBSERVED'});
  const writer=createRetainedCapsuleWriter({store,implementation_sha256,evidence_class:'OBSERVED'});await writer.remember(analysis_key);
  const journal=createOutcomeJournal({store,profile:START_PROFILE,clock,evidence_class:'OBSERVED',retained_features:writer});await journal.remember(analysis,x,analysis_key);
  const key='pump:journal:'+analysis.instrument.instrument_id+':'+analysis.wave_id;
  return {store,analysis,analysis_key,journal,key,clock,setTime:ts=>{now=ts;}};
}

test('prospective expiry terminal shares first-anchor CAS and actual saved page resolves through Z without fabricating calibration',async()=>{
  const f=await fixture(),plan=await saveProspectiveAuditPlan({store:f.store,split_ts:T+86400000,clock:f.clock});
  const oldOriginal=JSON.stringify(await f.store.get(f.analysis_key));
  const expiry=(await f.store.get(f.key)).wave_expires_ts;f.setTime(expiry+17);
  const selected=await f.journal.sync(f.key);assert.equal(selected.publication.state,'UNSENT');
  const journal=await f.store.get(f.key);assert.equal(journal.terminal.state,'EXPIRED');assert.equal(journal.terminal.event_ts,expiry);assert.equal(journal.terminal.recorded_ts,expiry+17);assert.equal(journal.terminal.evidence_ref,f.key+'#terminal');assert.equal(journal.frozen_anchor.immutable,true);
  const before=JSON.stringify([...f.store.rows]),audit=createSavedStatisticsAudit({store:f.store,clock:f.clock});
  const q=await audit({after:0,limit:1,plan_id:plan.plan_id});assert.equal(q.status,'SAVED_PAGE_AUDITED_NOT_CALIBRATED');assert.equal(q.records_audited,1);assert.equal(q.source_cursor,1);assert.equal(q.has_more,false);assert.equal(q.source_history_complete,false);assert.equal(q.probability_pct,null);assert.equal(q.audit.invalid_records,0,JSON.stringify(q.audit.invalid_record_details));assert.equal(q.audit.saved_capsule_reader.required_references_resolved,true);assert.equal(q.audit.calibration_validated,false);assert.equal(q.audit.publication_allowed,false);
  assert.equal(JSON.stringify([...f.store.rows]),before,'read-only audit must not initialize or mutate state');assert.equal(JSON.stringify(await f.store.get(f.analysis_key)),oldOriginal);
  // Simulated historical frozen original with missing terminal remains unbound.
  await f.store.set(f.key,{...journal,terminal:null});await f.journal.sync(f.key);assert.equal((await f.store.get(f.key)).terminal,null);
  const legacy=await audit({after:0,limit:1,plan_id:plan.plan_id});assert.equal(legacy.audit.saved_capsule_reader.required_references_resolved,false);assert.ok(legacy.audit.saved_capsule_reader.reference_failures.some(v=>v.code==='SAVED_CAPSULE_UNSENT_TERMINAL_RECORD_REQUIRED'));
});

test('audit source pages are read-only bounded and reject unsaved plans, corrupt source hashes and large JSON before hydration',async()=>{
  const store=new MemoryStore(),plan=await saveProspectiveAuditPlan({store,split_ts:T+86400000,clock:()=>T});
  const audit=createSavedStatisticsAudit({store,clock:()=>T+1}),before=JSON.stringify([...store.rows]);
  const empty=await audit({plan_id:plan.plan_id});assert.equal(empty.status,'SUMMARY_INDEX_NOT_READY');assert.equal(JSON.stringify([...store.rows]),before);
  await assert.rejects(audit({limit:11,plan_id:plan.plan_id}),/BOUND_AND_PLAN/);await assert.rejects(audit({plan_id:'0'.repeat(64)}),/PRECOMMITTED_PLAN/);await assert.rejects(saveProspectiveAuditPlan({store,split_ts:T,clock:()=>T}),/PROSPECTIVE_SPLIT/);
  await store.set('pump:summary-ordered-head:v1',{version:1,count:1,pending:null,legacy_imported:true});const id='pump:summary-record:'+'a'.repeat(64);await store.set('pump:summary-ordered:v1:0000000000000001',{seq:1,id});await store.set(id,{record_id:id,origin:{altered:true},publication:null,outcome:null});
  await assert.rejects(audit({plan_id:plan.plan_id}),/SOURCE_RECORD_HASH_MISMATCH/);
  const sqlCalls=[];await assert.rejects(readAuditPoint({store:{query:async(sql,args)=>{sqlCalls.push({sql,args});return {results:[{bytes:524289,value_json:null}]};}},key:'pump:analysis:'+'b'.repeat(64),max_bytes:524288}),/POINT_BYTES_EXCEEDED/);assert.equal(sqlCalls.length,1);assert.match(sqlCalls[0].sql,/CASE WHEN length\(CAST\(value_json AS BLOB\)\)<=\?2/);assert.equal(sqlCalls[0].args[1],524288);
  const page=await createSummaryRecordIndex({store}).readPage({limit:1});assert.equal(page.items.length,1);assert.equal(page.total,1);
});

test('publication arriving before first-anchor CAS prevents an obsolete UNSENT freeze',async()=>{
  class Race extends MemoryStore{async atomic(key,change){if(key===this.target&&this.hook){const hook=this.hook;this.hook=null;await hook();}return super.atomic(key,change);}}
  const f=await fixture(Race),expiry=(await f.store.get(f.key)).wave_expires_ts;f.setTime(expiry+1);f.store.target=f.key;
  f.store.hook=async()=>{const j=await f.store.get(f.key);j.publications.push({event_id:'ARTIFICIAL_CONCURRENT_UNKNOWN',analysis_id:f.analysis_key,event_ts:expiry,recorded_ts:expiry,state:'UNKNOWN',possible_send:true,message_id:null,receipt_ref:null,card_id:'ARTIFICIAL_CARD_NOT_SENT'});await f.store.set(f.key,j);};
  await assert.rejects(f.journal.sync(f.key),/JOURNAL_SELECTION_CHANGED/);const j=await f.store.get(f.key);assert.equal(j.terminal,null);assert.equal(j.frozen_anchor,null);assert.equal(j.publications.length,1);assert.equal([...f.store.rows.keys()].filter(k=>k.startsWith('pump:summary-record:')).length,0);
});
