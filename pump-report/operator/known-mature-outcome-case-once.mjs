import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MemoryStore} from '../runtime/store.mjs';
import {readKnownMatureOutcome} from './known-mature-outcome.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),own=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
assert.equal(a.status,'ADMITTED_ONE_KNOWN_MATURE_READER_CASE');assert.equal(a.maximum_Node_processes,1);
assert(Date.now()>=a.issued_ts&&Date.now()<a.expires_ts&&a.expires_ts<=own.expires_ts);assert.equal(own.owner,a.own_lease.owner);assert.notEqual(own.released,true);
for(const [path,hash]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(path)),hash,path);
fs.writeFileSync(a.attempt_file,JSON.stringify({started_ts:Date.now(),authority_main:a.authority_main}),{flag:'wx',mode:0o600});
const proof={schema:'ROOT_KNOWN_MATURE_READER_QUALIFICATION_V1',status:'ATTEMPTED_NO_RETRY',evidence_class:'CONTROLLED_MEMORY_NOT_NATIVE',affected_cases:1,Node_processes:1,vectors:0,operator_syntax_checks:0,engine_calls:0,native_SQL:0,market_HTTP:0,Cloudflare:0,Telegram:0};
const actualFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('REAL_NETWORK_FORBIDDEN');};
try{
  new vm.SourceTextModule(fs.readFileSync('pump-report/operator/known-mature-outcome-once.mjs','utf8'));proof.operator_syntax_checks++;
  const t0=Date.parse('2026-10-30T07:03:01.755Z'),producer='b'.repeat(64),recipient='CONTROLLED_ONLY';
  async function fixture(status='HIT'){
    const store=new MemoryStore(),i={instrument_id:'BINGX:USDT_M:1:MAGMA-USDT',asset_id:'CONTROLLED_MAGMA',native_symbol:'MAGMA-USDT',base:'MAGMA',venue:'BINGX',market_type:'PERPETUAL',quote:'USDT',settle:'USDT',classification_status:'VERIFIED_CRYPTO'};
    const wave='PUMP:'+i.instrument_id+':'+(t0-60000),analysis={instrument:i,run_id:'CONTROLLED_RUN',mode:'AUTO',run_purpose:'PRODUCTION',analysis_ts:t0,reference_price:100,ready:true,automatic_eligible:true,rules_version:'CONTROLLED_RULES',wave_id:wave,card_text:'CONTROLLED_MAGMA'};
    const analysisKey='pump:analysis:'+sha(JSON.stringify(analysis)),cardId='PUMP:'+sha('CONTROLLED_CARD'),signalKey='pump:signal:'+i.instrument_id+':'+wave;
    const input={instrument:i,run_id:analysis.run_id,mode:'AUTO',run_purpose:'PRODUCTION',analysis_ts:t0,facts:Object.fromEntries(['price','candles','orderbook'].map(k=>[k,{expires_ts:t0+15000}]))};
    const receipt={card_id:cardId,text_hash:sha(analysis.card_text),recipient,message_id:'243',http_started_ts:t0+4,http_ack_received_ts:t0+5,confirmed_ts:t0+6,http_clock_basis:'CALL_TO_FETCH_AND_PARSED_ACK_NOT_WIRE_TIMESTAMP'};
    const card={card_id:cardId,state:'SENT',mode:'AUTO',analysis:{...analysis,source_input_key:analysisKey},text:analysis.card_text,text_hash:receipt.text_hash,recipient,message_id:'243',created_ts:t0+2,send_started_ts:t0+3,expires_ts:t0+15000,receipt};
    const original={analysis,input,implementation_sha256:producer,evidence_class:'OBSERVED',saved_ts:t0+1};
    const origin={signal_id:signalKey,instrument_id:i.instrument_id,asset_id:i.asset_id,wave_id:wave,evidence_class:'OBSERVED',run_purpose:'PRODUCTION',ready:true,mode:'AUTO',t0,reference_price:100,rules_version:analysis.rules_version};
    const signal={signal_id:signalKey,analysis_key:analysisKey,original_card_id:cardId,origin,wave_id:wave,mode:'AUTO',instrument:i,t0,reference_price:100,rules_version:analysis.rules_version,map_mode:'WITHOUT_MAP',deadline_ts:t0+14400000};
    const journalKey='pump:journal:'+i.instrument_id+':'+wave,outcomeKey='pump:outcome:'+signalKey;
    await store.set('pump:card:'+cardId,card);await store.set(analysisKey,original);
    await store.set(journalKey,{frozen_anchor:{analysis_id:analysisKey,analysis_sha256:sha(JSON.stringify(analysis)),immutable:true,origin}});await store.set(signalKey,signal);
    if(status!==null)await store.set(outcomeKey,{signal_id:signalKey,wave_id:wave,t0,reference_price:100,rules_version:analysis.rules_version,mode:'AUTO',map_mode:'WITHOUT_MAP',deadline_ts:signal.deadline_ts,status});
    const target={card_id:cardId,analysis_key:analysisKey,producer_implementation_sha256:producer,instrument_id:i.instrument_id,native_symbol:'MAGMA-USDT',wave_id:wave,message_id:'243',deadline_ts:signal.deadline_ts};
    const keys=['pump:card:'+cardId,analysisKey,journalKey,signalKey,outcomeKey];let gets=0;
    const read=async()=>JSON.stringify(await Promise.all(keys.map(k=>store.get(k))));
    const view={get:async key=>{gets++;assert(keys.includes(key));return store.get(key);}};
    return {store,target,keys,view,read,gets:()=>gets,run:()=>readKnownMatureOutcome({store:view,target,expected_recipient_sha256:sha(recipient),clock:()=>signal.deadline_ts+1})};
  }
  for(const status of ['HIT','MISS','UNKNOWN',null]){
    const f=await fixture(status),before=await f.read(),r=await f.run();
    assert.equal(r.observation.first_genuine_same_original_SENT_observed,true);assert.equal(r.selected_producer_implementation_sha256,producer);assert.equal(r.historical_delivery_not_relabelled_current,true);
    assert.equal(r.saved_outcome.status,status===null?'NO_SAVED_OUTCOME_YET':'BOUND_SAVED_OUTCOME_'+status);assert.equal(r.saved_outcome.underlying_market_history_independently_verified,false);
    assert.equal(r.business_PK_reads,5);assert.equal(f.gets(),5);assert.equal(await f.read(),before);proof.vectors++;
  }
  const badAnchor=await fixture(),journal=await badAnchor.store.get(badAnchor.keys[2]);journal.frozen_anchor.analysis_sha256='c'.repeat(64);await badAnchor.store.set(badAnchor.keys[2],journal);
  const b=await badAnchor.run();assert.equal(b.saved_outcome.status,'SAVED_SIGNAL_ORIGINAL_BINDING_MISMATCH');assert.equal(b.business_PK_reads,4);proof.vectors++;
  const wrongProducer=await fixture();wrongProducer.target.producer_implementation_sha256='a'.repeat(64);
  const w=await wrongProducer.run();assert.equal(w.observation.status,'SENT_OTHER_IMPLEMENTATION_NOT_CURRENT_PROOF');assert.equal(w.saved_outcome.status,'DELIVERY_NOT_BOUND');assert.equal(w.business_PK_reads,2);proof.vectors++;
  const wrongKey=await fixture();wrongKey.target.analysis_key='pump:analysis:'+'d'.repeat(64);await assert.rejects(()=>wrongKey.run(),/KNOWN_CARD_TARGET_MISMATCH/);assert.equal(wrongKey.gets(),1);proof.vectors++;
  const early=await fixture();await assert.rejects(()=>readKnownMatureOutcome({store:early.view,target:early.target,expected_recipient_sha256:sha(recipient),clock:()=>early.target.deadline_ts-1}),/KNOWN_OUTCOME_NOT_DUE/);assert.equal(early.gets(),0);proof.vectors++;
  assert.equal(proof.vectors,8);proof.status='PASS';proof.maximum_business_PK_reads=5;proof.old_producer_not_relabelled_current=true;proof.original_card_signal_outcome_unchanged=true;proof.missing_is_not_MISS=true;
}catch(error){proof.status='FAILED_PRESERVED_NO_AUTO_RETRY';proof.error=String(error.stack??error).slice(0,2000);process.exitCode=1;}
finally{globalThis.fetch=actualFetch;proof.completed_ts=Date.now();fs.writeFileSync(a.output,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});}
console.log(JSON.stringify(proof));
