import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {MemoryStore} from '../../runtime/store.mjs';
import {createRetainedCapsuleWriter} from '../../runtime/retained-capsules.mjs';
import {createOutcomeJournal} from '../../runtime/outcome-journal.mjs';
import {createDelivery} from '../../runtime/delivery.mjs';
import {analyzePump,evaluateOutcome} from '../../analytics/index.mjs';
import {auditSavedCapsules,SAVED_CAPSULE_AUDIT_BOUNDS as LIMITS} from '../../analytics/saved-capsule-audit.mjs';
import {capsuleDigest} from '../../analytics/feature-capsule.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {input,path,T} from './fixtures.mjs';

const H=3600000,out=new URL('../../handoffs/analytics/package-z/',import.meta.url),PRIVATE='ARTIFICIAL_PRIVATE_PAYLOAD_MUST_NOT_ESCAPE';
const options={as_of_ts:T+8*H,split_plan:{split_ts:T+6*H,declared_ts:T-H,plan_ref:'ARTIFICIAL_Z_SAVED_SPLIT'}};
const save=async(name,j)=>writeFile(new URL(name,out),JSON.stringify({evidence:'ARTIFICIAL_ACTUAL_RETAINED_WRITER_JOURNAL_MEMORYSTORE_NO_NATIVE',...j},null,2)+'\n');
async function fixture({publication='SENT',id='A'}={}){
  const store=new MemoryStore(),x=input();x.mode='MANUAL';x.run_purpose='PRODUCTION';x.run_id='ARTIFICIAL_Z_'+id;x.private_payload=PRIVATE;
  x.instrument.instrument_id='ARTIFICIAL:BINGX:Z-'+id+'-USDT';x.instrument.asset_id='ARTIFICIAL:Z-'+id;
  for(const f of Object.values(x.facts))f.instrument_id=x.instrument.instrument_id;
  for(const r of x.facts.candles.value.slice(-5))r.volume_base=3000;
  const analysis=analyzePump(x);assert.equal(analysis.ready,true,JSON.stringify(analysis.reasons));
  const analysis_key='pump:analysis:'+await capsuleDigest(analysis),implementation_sha256=await capsuleDigest({evidence:'ARTIFICIAL_Z_IMPLEMENTATION_NOT_NATIVE_BUILD_PROOF'});
  let now=T,sends=0;const writer=createRetainedCapsuleWriter({store,implementation_sha256,evidence_class:'OBSERVED'});
  await store.set(analysis_key,{analysis,input:x,saved_ts:T,implementation_sha256,evidence_class:'OBSERVED'});await writer.remember(analysis_key);
  const journal=createOutcomeJournal({store,profile:START_PROFILE,clock:()=>now,evidence_class:'OBSERVED',retained_features:writer});await journal.remember(analysis,x,analysis_key);
  const journalKey='pump:journal:'+analysis.instrument.instrument_id+':'+analysis.wave_id;
  let signal=null,card_id=null,first=null;
  const delivery=createDelivery({store,clock:()=>now,recipient:'123',revalidate:async()=>({valid:true}),send:async()=>{sends++;if(publication==='UNKNOWN')throw Error('ARTIFICIAL_UNKNOWN_ACK');return {ok:true,status:200,body:{ok:true,result:{message_id:770,chat:{id:123},date:Math.floor(now/1000)}}};}});
  async function readRow(s,outcome=null){const key='pump:summary-record:'+await capsuleDigest({origin:s.origin,publication:s.publication,outcome});const row=await store.get(key);assert.ok(row);return row;}
  if(publication!=='NONE'){
    const enqueued=await delivery.enqueue({...analysis,source_input_key:analysis_key},{mode:'MANUAL',expires_ts:T+60000});card_id=enqueued.card_id;
    const sent=await delivery.dispatch(card_id);assert.equal(sent.state,publication);const selected=await journal.publication(card_id);signal=await store.get(selected.summary_origin.signal_id);first=await readRow(signal);
  }
  return {store,x,analysis,analysis_key,writer,journal,journalKey,delivery,card_id,get first(){return first;},get signal(){return signal;},get sends(){return sends;},setTime(t){now=t;},
    async closeUnsent({implicit=false}={}){
      now=implicit?T+START_PROFILE.wave_max_age_ms+1:T+60000;
      if(!implicit)await journal.remember({...analysis,ready:false,wave_state:'CANCELLED',analysis_ts:now},x,analysis_key);
      const selected=await journal.sync(journalKey);assert.equal(selected.publication.state,'UNSENT');signal=await store.get(selected.summary_origin.signal_id);first=await readRow(signal);return first;
    },
    async label(low=95){
      now=T+START_PROFILE.horizon_ms+1000+Math.floor((100-low)*100);
      const outcome=evaluateOutcome({signal,as_of_ts:now,candles:path({high:127,low})});assert.equal(outcome.status,'HIT');
      const key=await journal.record(signal,outcome);return store.get(key);
    },
    async confirmLater(){
      now=T+10000;const c=await store.get('pump:card:'+card_id);c.state='SENT';c.message_id='770';c.updated_ts=now;c.receipt={message_id:'770',recipient:c.recipient,card_id:c.card_id,text_hash:c.text_hash,confirmed_ts:now,telegram_date:Math.floor(now/1000)};await store.set('pump:card:'+card_id,c);
      const selected=await journal.publication(card_id);signal=await store.get(selected.summary_origin.signal_id);return readRow(signal);
    }
  };
}
const run=(f,records,read=key=>f.store.get(key))=>auditSavedCapsules({records,read,...options});
const failureCodes=q=>q.saved_capsule_reader.reference_failures.map(x=>x.code);

test('Z01 real retained writer and OutcomeJournal originals resolve into W v2 with SENT HIT split and no raw output or invented forecast',async()=>{
  const f=await fixture(),hit=await f.label(),before=JSON.stringify(await f.store.get(f.analysis_key)),q=await run(f,[f.first,hit]);
  assert.equal(q.version,'pump-cohort-capsule-audit-v2-20261025');assert.equal(q.invalid_records,0,JSON.stringify(q.invalid_record_details));assert.equal(q.partitions.TRAIN,1);assert.equal(q.waves[0].structurally_usable,true,JSON.stringify(q.waves));
  assert.equal(q.status,'NOT_CALIBRATED');assert.equal(q.probability_pct,null);assert.equal(q.empirical_success_rate_pct,null);assert.equal(q.feature_usefulness_proven,false);assert.equal(q.publication_allowed,false);assert.ok(q.waves[0].calibration_blockers.includes('NO_PRECOMMITTED_FORECAST'));
  assert.equal(q.saved_capsule_reader.required_references_resolved,true);assert.equal(q.saved_capsule_reader.records_resolved,2);assert.ok(q.saved_capsule_reader.cache_hits>0);assert.ok(q.saved_capsule_reader.read_calls<=18);assert.equal(q.saved_capsule_reader.source_history_complete,false);
  assert.doesNotMatch(JSON.stringify(q),new RegExp(PRIVATE));assert.equal(JSON.stringify(await f.store.get(f.analysis_key)),before);assert.equal(f.sends,1);assert.equal(q.retention.delete_allowed,false);
  await save('connected-sent-summary.json',{audit_version:q.version,partitions:q.partitions,invalid_records:q.invalid_records,status:q.status,probability_pct:q.probability_pct,loading:q.saved_capsule_reader,raw_private_not_exported:true,actual_fake_delivery_callbacks:f.sends});
});

test('Z02 historical UNKNOWN uses actual possible-send ref even after a later stored receipt and never rewrites its saved capsule',async()=>{
  const f=await fixture({publication:'UNKNOWN',id:'UNKNOWN'}),link=await f.store.get('pump:summary-capsule-link:v2:'+f.first.record_id.slice(-64)),old=await f.store.get(link.outcome_key),q=await run(f,[f.first]);
  assert.equal(q.saved_capsule_reader.required_references_resolved,true);assert.equal(q.invalid_records,0);assert.ok(q.waves[0].issues.includes('PUBLICATION_STATUS_UNRESOLVED'));assert.equal(q.probability_pct,null);
  const sent=await f.confirmLater(),resolved=await run(f,[f.first,sent]);assert.equal(resolved.invalid_records,0,JSON.stringify(resolved.invalid_record_details));assert.equal(resolved.saved_capsule_reader.required_references_resolved,true);assert.deepEqual(await f.store.get(link.outcome_key),old);assert.equal(old.capsule.publication.state,'UNKNOWN');assert.equal(f.first.publication.state,'UNKNOWN');assert.equal(sent.publication.state,'SENT');assert.equal(f.sends,1);
  await save('historical-unknown-readback.json',{unknown_invalid_records:q.invalid_records,unknown_issues:q.waves[0].issues,late_receipt_invalid_records:resolved.invalid_records,old_capsule_unchanged:true,delivery_callbacks:f.sends,probability_pct:resolved.probability_pct});
});

test('Z03 actual persisted terminal supports UNSENT while an implicit expiry without terminal is explicitly unbound',async()=>{
  const explicit=await fixture({publication:'NONE',id:'TERMINAL'}),row=await explicit.closeUnsent(),q=await run(explicit,[row]);assert.equal(q.invalid_records,0,JSON.stringify(q.invalid_record_details));assert.equal(q.saved_capsule_reader.required_references_resolved,true);assert.equal(q.waves[0].structurally_usable,true);assert.equal(explicit.sends,0);
  const implicit=await fixture({publication:'NONE',id:'IMPLICIT'}),expired=await implicit.closeUnsent({implicit:true}),unbound=await run(implicit,[expired]);assert.ok(failureCodes(unbound).includes('SAVED_CAPSULE_UNSENT_TERMINAL_RECORD_REQUIRED'));assert.equal(unbound.waves[0].structurally_usable,false);assert.equal(unbound.saved_capsule_reader.required_references_resolved,false);assert.equal(unbound.probability_pct,null);
  await save('actual-terminal-format-gap.json',{explicit_terminal_resolved:q.saved_capsule_reader.required_references_resolved,implicit_expiry_failures:unbound.saved_capsule_reader.reference_failures,ROOT_patch_proposal_required:true,implicit_terminal_fabricated:false});
});

test('Z04 missing and tampered selected refs or future receipt remain explicit W failures without private data leakage',async()=>{
  const f=await fixture({id:'REFS'}),link=await f.store.get('pump:summary-capsule-link:v2:'+f.first.record_id.slice(-64)),cardKey='pump:card:'+f.card_id,variants=[];
  const changes=[['missing-link','pump:summary-capsule-link:v2:'+f.first.record_id.slice(-64),()=>null],['missing-original',f.analysis_key,()=>null],['missing-journal',f.journalKey,()=>null],['missing-card',cardKey,()=>null],['card-text',cardKey,v=>({...v,text:PRIVATE})],['future-receipt',cardKey,v=>({...v,receipt:{...v.receipt,confirmed_ts:f.first.recorded_ts+1}})],['protected-digest',link.protected_refs.key,v=>({...v,sha256:'0'.repeat(64)})]];
  for(const [name,key,mutate]of changes){const q=await run(f,[f.first],async k=>{const v=await f.store.get(k);return k===key?mutate(v):v;});assert.ok(q.invalid_records>0,name);assert.equal(q.waves[0].structurally_usable,false,name);assert.equal(q.saved_capsule_reader.required_references_resolved,false,name);assert.doesNotMatch(JSON.stringify(q),new RegExp(PRIVATE));variants.push({name,codes:failureCodes(q)});}
  await save('reference-failure-variants.json',{variants,private_payload_exported:false});
});

test('Z05 supplied record and key bounds reject extra history before reading and reject arbitrary link namespaces',async()=>{
  const f=await fixture({id:'BOUNDS'});let calls=0;const read=async k=>{calls++;return f.store.get(k);};
  await assert.rejects(run(f,Array(11).fill(f.first),read),/RECORD_BOUND_EXCEEDED/);assert.equal(calls,0);
  await assert.rejects(run(f,[{...f.first,padding:'X'.repeat(LIMITS.records_bytes+1)}],read),/RECORD_BYTES_EXCEEDED/);assert.equal(calls,0);
  await assert.rejects(run(f,[{...f.first,record_id:'GLOBAL_HISTORY'}],read),/SUMMARY_KEY_REQUIRED/);assert.equal(calls,0);
  const seen=[],linkKey='pump:summary-capsule-link:v2:'+f.first.record_id.slice(-64),q=await run(f,[f.first],async key=>{seen.push(key);const v=await f.store.get(key);return key===linkKey?{...v,feature_key:'private:global-history'}:v;});assert.deepEqual(seen,[linkKey]);assert.ok(failureCodes(q).includes('SAVED_CAPSULE_LINK_KEY_UNBOUND'));
  const future=await auditSavedCapsules({records:[f.first],read,as_of_ts:T-1,split_plan:{...options.split_plan,split_ts:T-1,declared_ts:T-2}});assert.equal(future.excluded_future_records,1);assert.equal(calls,0);assert.equal(future.saved_capsule_reader.records_resolved,0);assert.equal(future.saved_capsule_reader.source_history_complete,false);
  await save('record-key-bounds.json',{max_records:LIMITS.records,preflight_reads:calls,arbitrary_key_not_read:true,future_records_not_hydrated:true});
});

test('Z06 byte journal and store-error limits stop the whole audit with sanitized errors and bounded reads',async()=>{
  const f=await fixture({id:'LIMITS'});let calls=0;
  await assert.rejects(run(f,[f.first],async()=>{calls++;throw Error(PRIVATE);}),e=>e.message==='SAVED_CAPSULE_STORE_READ_FAILED'&&!e.message.includes(PRIVATE));assert.equal(calls,1);
  await assert.rejects(run(f,[f.first],async key=>{const v=await f.store.get(key);return key===f.analysis_key?{...v,padding:PRIVATE.repeat(20000)}:v;}),/READ_VALUE_BYTES_EXCEEDED/);
  await assert.rejects(run(f,[f.first],async key=>{const v=await f.store.get(key);return ['pump:feature-capsule:','pump:outcome-capsule:','pump:analysis:','pump:protected-refs:','pump:journal:'].some(p=>key.startsWith(p))?{...v,padding:'X'.repeat(430000)}:v;}),/TOTAL_READ_BYTES_EXCEEDED/);
  await assert.rejects(run(f,[f.first],async key=>{const v=await f.store.get(key);return key===f.journalKey?{...v,analyses:Array(65).fill(v.analyses[0])}:v;}),/JOURNAL_ROW_BOUND_EXCEEDED/);
  const normal=await run(f,[f.first]);assert.ok(normal.saved_capsule_reader.read_calls<=9);assert.ok(normal.saved_capsule_reader.read_bytes<=LIMITS.read_bytes);
  await save('hard-read-limits.json',{limits:LIMITS,normal_read_calls:normal.saved_capsule_reader.read_calls,normal_read_bytes:normal.saved_capsule_reader.read_bytes,failed_store_calls_before_abort:calls,partial_audit_returned_on_overflow:false});
});

test('Z07 repeated-wave originals are cached but duplicated hydrated evidence remains bounded independently',async()=>{
  const f=await fixture({id:'CACHE'}),rows=[f.first];for(let i=0;i<4;i++)rows.push(await f.label(95-i));
  const q=await run(f,rows);assert.equal(q.invalid_records,0,JSON.stringify(q.invalid_record_details));assert.ok(q.saved_capsule_reader.cache_hits>0);assert.ok(q.saved_capsule_reader.read_calls<=rows.length*9);assert.equal(q.saved_capsule_reader.records_resolved,5);
  await assert.rejects(run(f,rows,async key=>{const v=await f.store.get(key);return key===f.analysis_key?{...v,padding:'X'.repeat(430000)}:v;}),/EVIDENCE_BYTES_EXCEEDED/);
  const duplicated=await run(f,Array(10).fill(f.first));assert.equal(duplicated.duplicate_record_replays,9);assert.equal(duplicated.saved_capsule_reader.records_resolved,1);assert.ok(duplicated.saved_capsule_reader.read_calls<=9);
  await save('cache-evidence-bound.json',{input_revisions:5,actual_reads:q.saved_capsule_reader.read_calls,cache_hits:q.saved_capsule_reader.cache_hits,hydrated_bytes:q.saved_capsule_reader.evidence_bytes,ten_exact_replays_hydrated_once:true,overflow_returns_partial:false});
});

test('Z08 original accepted W V T X2 manifests and analytic dependencies remain byte exact without old test imports',async()=>{
  const proof=JSON.parse(await readFile(new URL('before-proofs.json',out),'utf8')),files=[];
  for(const [path,p]of Object.entries(proof).filter(([path])=>path.startsWith('pump-report/analytics/')||path.startsWith('pump-report/handoffs/'))){const bytes=await readFile(path),actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');assert.equal(actual,p.sha256,path);files.push({path,sha256:actual});}
  await save('accepted-byte-integrity.json',{result:'PASS_NEW_Z_ONLY',files,old_test_batteries_imported:false,native_IO:0});
});
