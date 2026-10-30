import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MemoryStore} from '../../runtime/store.mjs';
import {readSavedAutoObservation} from '../../operator/saved-auto-observation.mjs';
const sha=text=>createHash('sha256').update(text).digest('hex');

test('ARTIFICIAL saved AUTO observer binds one original/receipt and leaves incomplete read scopes explicit',async()=>{
  const store=new MemoryStore(),pin='a'.repeat(64),text='ARTIFICIAL ONLY: 测试币',id='PUMP:'+'c'.repeat(64);
  const analysis={mode:'AUTO',run_purpose:'PRODUCTION',run_id:'fixture-auto',ready:true,automatic_eligible:true,analysis_ts:1000,
    instrument:{instrument_id:'FIXTURE:测试币',base:'测试币',native_symbol:'测试币-USDT'},card_text:text};
  const key='pump:analysis:'+sha(JSON.stringify(analysis));
  const original={analysis,implementation_sha256:pin,evidence_class:'OBSERVED',saved_ts:1050,
    input:{mode:'AUTO',run_purpose:'PRODUCTION',run_id:analysis.run_id,analysis_ts:1000,instrument:analysis.instrument,
      facts:Object.fromEntries(['price','candles','orderbook'].map(k=>[k,{expires_ts:5000}]))}};
  const card={card_id:id,state:'SENT',mode:'AUTO',analysis:{...analysis,source_input_key:key},text,text_hash:sha(text),recipient:'FIXTURE_RECIPIENT',
    created_ts:1100,send_started_ts:1200,expires_ts:5000,message_id:'123',
    receipt:{card_id:id,text_hash:sha(text),recipient:'FIXTURE_RECIPIENT',message_id:'123',http_started_ts:1300,http_ack_received_ts:6000,confirmed_ts:6100,http_clock_basis:'CALL_TO_FETCH_AND_PARSED_ACK_NOT_WIRE_TIMESTAMP'}};
  await store.set('pump:executor',{owner:null,run_id:'fixture-auto'});await store.set('pump:run:fixture-auto',{status:'INCOMPLETE',errors:['SOURCE_EVIDENCE_PENDING']});
  await store.set(key,original);await store.set('pump:card:'+id,card);
  const read=()=>readSavedAutoObservation({store,implementation_sha256:pin,expected_recipient_sha256:sha('FIXTURE_RECIPIENT'),clock:()=>7000});
  const positive=await read();assert.equal(positive.status,'OBSERVED_SAME_ORIGINAL_PRODUCTION_AUTO_SENT');assert.equal(positive.first_genuine_same_original_SENT_observed,true);
  assert.equal(positive.latest_run_status,'INCOMPLETE');assert.equal(positive.scope.whole_market_claimed,false);assert.equal(positive.scope.whole_history_claimed,false);
  assert.equal(positive.Telegram,0);assert.equal(positive.market_HTTP,0);
  const wrongTarget=await readSavedAutoObservation({store,implementation_sha256:pin,expected_recipient_sha256:sha('ANOTHER_RECIPIENT'),clock:()=>7000});
  assert.equal(wrongTarget.first_genuine_same_original_SENT_observed,false);
  await store.set('pump:card:'+id,{...card,text:'DIFFERENT'});
  assert.equal((await read()).status,'SAVED_SENT_BINDING_MISMATCH');
  await store.set('pump:card:'+id,{...card,mode:'MANUAL',analysis:{...card.analysis,run_purpose:'ACCEPTANCE_TEST'}});
  const excluded=await read();assert.equal(excluded.status,'NO_PRODUCTION_AUTO_SENT_IN_READ_SCOPE');assert.equal(excluded.private_evidence.original,null);
  await store.set('pump:card:'+id,{...card,receipt:{...card.receipt,http_started_ts:5000}});
  assert.equal((await read()).first_genuine_same_original_SENT_observed,false);
  const crowded=new MemoryStore();for(let n=0;n<20;n++)await crowded.set('pump:card:PUMP:'+String(n).padStart(64,'0'),{state:'READY'});
  const partial=await readSavedAutoObservation({store:crowded,implementation_sha256:pin,expected_recipient_sha256:sha('FIXTURE_RECIPIENT'),clock:()=>7000});
  assert.equal(partial.scope.page_exhausted,false);assert.equal(partial.scope.cards_read,20);assert.equal(partial.first_genuine_same_original_SENT_observed,false);
});

test('AO regression: a changed card identity at the exact PK read never proves the page-selected delivery',async()=>{
  const idA='PUMP:'+'a'.repeat(64),idB='PUMP:'+'b'.repeat(64);let originalReads=0;
  const store={
    async get(key){if(key==='pump:executor')return null;if(key==='pump:card:'+idA)return{card_id:idB,state:'SENT',mode:'AUTO',analysis:{source_input_key:'pump:analysis:'+'d'.repeat(64)}};originalReads++;throw Error('ORIGINAL_MUST_NOT_BE_READ');},
    async scanPrefix(){return[{key:'pump:card:'+idA,value:{card_id:idA,state:'SENT',mode:'AUTO',analysis:{run_purpose:'PRODUCTION'}}}];}
  };
  await assert.rejects(readSavedAutoObservation({store,implementation_sha256:'c'.repeat(64),expected_recipient_sha256:'e'.repeat(64),clock:()=>7000}),/SENT_CARD_ID_CHANGED_AFTER_PAGE_READ/);
  assert.equal(originalReads,0);
});
