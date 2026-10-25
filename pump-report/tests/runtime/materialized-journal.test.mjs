import test from 'node:test';
import assert from 'node:assert/strict';
import {createOutcomeJournal} from '../../runtime/outcome-journal.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {textHash} from '../../runtime/delivery.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {T,MINUTE} from '../analytics/fixtures.mjs';

const H=14400000;
function signal(wave='W',publication='UNKNOWN'){
  const origin={instrument_id:'ARTIFICIAL:ROOT:I',asset_id:'ARTIFICIAL:ROOT:A',wave_id:wave,signal_id:'SIGNAL:'+wave,t0:T,reference_price:100,rules_version:'R1',profile_version:'P1',mode:'MANUAL',map_mode:'NO_MAP',evidence_class:'ARTIFICIAL',ready:true};
  return {origin,publication:{state:publication,message_id:publication==='SENT'?'123':null,receipt_ref:publication==='SENT'?'ARTIFICIAL_RECEIPT':null}};
}
function outcome(s,status='UNKNOWN'){
  const o=s.origin;return {signal_id:o.signal_id,wave_id:o.wave_id,t0:o.t0,reference_price:o.reference_price,rules_version:o.rules_version,mode:o.mode,map_mode:'WITHOUT_MAP',target_price:110,deadline_ts:T+H,status,hit_ts:status==='HIT'?T+MINUTE:null,hit_interval:null,coverage:{complete:status==='MISS'},reasons:status==='UNKNOWN'?['HISTORY_PENDING']:[],drawdown_total_pct:null,drawdown_before_hit_pct:null,hit_after_invalidation:null};
}
async function seed(store,s,o,at){
  const payload={origin:s.origin,publication:s.publication,outcome:o},key='pump:summary-record:'+await textHash(JSON.stringify(payload));
  await store.set(key,{record_id:key,recorded_ts:at,...payload});
  const ids=await store.get('pump:summary-record-index')??[];await store.set('pump:summary-record-index',[...ids,key]);return key;
}
class TracedStore extends MemoryStore{
  constructor(){super();this.reads=[];}
  async get(key){this.reads.push(key);return super.get(key);}
}
const journal=(store,clock)=>createOutcomeJournal({store,clock,profile:START_PROFILE,evidence_class:'ARTIFICIAL'});

test('42 historical waves catch up in bounded restartable pages and current queries do not reread historical records',async()=>{
  const store=new TracedStore();for(let i=0;i<42;i++){const s=signal('W'+i,'SENT');await seed(store,s,outcome(s,i%2?'HIT':'MISS'),T+H);}
  let j=journal(store,()=>T+H),q=await j.summary({max_records:5});assert.equal(q.status,'SUMMARY_CATCHUP_REQUIRED');assert.equal(q.independent_waves,5);assert.equal(q.source_cursor,5);assert.match(q.status_text_ru,/неполны/);
  for(let i=0;i<8;i++){j=journal(store,()=>T+H);q=await j.summary({max_records:5});}
  assert.equal(q.status,'CURRENT');assert.equal(q.independent_waves,42);assert.deepEqual(q.mature_outcomes,{hit:21,miss:21,unknown:0});assert.equal(q.source_cursor,42);
  store.reads=[];q=await journal(store,()=>T+H).summary({max_records:1});assert.equal(q.independent_waves,42);assert.equal(q.processed_records,0);assert.equal(store.reads.filter(k=>k.startsWith('pump:summary-record:')).length,0);assert.equal(q.probability.value_pct,null);
});
test('journal replay, late receipt and maturity update one frozen wave without changing its origin',async()=>{
  let now=T+MINUTE;const store=new MemoryStore(),j=journal(store,()=>now),s=signal();await j.record(s,null);await j.record(s,null);
  let q=await j.summary();assert.equal(q.independent_waves,1);assert.equal(q.source_cursor,1);assert.equal(q.publication_counts.unknown,1);
  now=T+2*MINUTE;await j.record(s,outcome(s,'HIT'));q=await j.summary();assert.equal(q.pending_known_hits,1);assert.equal(q.mature_outcomes.hit,0);
  now=T+3*MINUTE;const sent=signal('W','SENT');await j.record(sent,outcome(sent,'HIT'));q=await j.summary();assert.equal(q.independent_waves,1);assert.deepEqual(q.publication_counts,{sent:1,unsent:0,unknown:0});assert.equal(q.cohorts.length,1);
  now=T+H;q=await journal(store,()=>now).summary();assert.equal(q.status,'CURRENT');assert.equal(q.mature_outcomes.hit,1);assert.equal(q.pending_known_hits,0);
  const wave=await store.get('pump:materialized-wave:'+JSON.stringify([s.origin.instrument_id,s.origin.wave_id]));assert.deepEqual(wave.origin,s.origin);
});
test('maturity is paged honestly and budget interruption preserves the committed source cursor',async()=>{
  const store=new MemoryStore();for(let i=0;i<7;i++){const s=signal('P'+i);await seed(store,s,null,T+MINUTE);}
  store.admission={max_rows_read:100,max_rows_written:20};store.usage=()=>({rows_read:100,rows_written:20});
  let q=await journal(store,()=>T+MINUTE).summary({max_records:3});assert.equal(q.status,'SUMMARY_CATCHUP_REQUIRED');assert.equal(q.source_cursor,0);assert.equal(q.independent_waves,0);
  store.usage=()=>({rows_read:0,rows_written:0});const j=journal(store,()=>T+MINUTE);q=await j.catchUp({max_records:3,maturity_limit:0});assert.equal(q.source_cursor,3);assert.equal(q.source_caught_up,false);
  q=await journal(store,()=>T+MINUTE).summary();assert.equal(q.independent_waves,7);assert.equal(q.pending_waves,7);
  q=await journal(store,()=>T+H).summary();assert.equal(q.status,'MATURITY_UPDATES_REQUIRED');assert.equal(q.pending_clock_transitions,2);assert.match(q.status_text_ru,/неполны/);
  q=await journal(store,()=>T+H).summary();assert.equal(q.status,'CURRENT');assert.equal(q.mature_waves,7);assert.equal(q.mature_outcomes.unknown,7);
});
test('a changed immutable record stops catchup before advancing its atomic cursor or counting a replacement',async()=>{
  const store=new MemoryStore(),s=signal(),key=await seed(store,s,null,T+MINUTE),row=await store.get(key);row.origin.reference_price=99;await store.set(key,row);
  await assert.rejects(journal(store,()=>T+MINUTE).summary(),/CONTENT_HASH_MISMATCH/);assert.equal(await store.get('pump:materialized-summary:v1'),null);
});
