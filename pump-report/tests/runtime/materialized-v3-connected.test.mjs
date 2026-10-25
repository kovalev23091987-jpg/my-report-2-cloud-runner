import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../runtime/store.mjs';
import {createOutcomeJournal} from '../../runtime/outcome-journal.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {T} from '../analytics/fixtures.mjs';

// Production branch exercised only in isolated memory, with artificial IDs.
// No native metadata/SQL/HTTP/TG or physical capacity experiment.
const H=14400000,A='pump:materialized-summary:production-v3';
const signal=n=>({origin:{instrument_id:'CONTROLLED:I'+n,asset_id:'CONTROLLED:A'+n,wave_id:'CONTROLLED:W'+n,signal_id:'CONTROLLED:S'+n,t0:T,reference_price:100,rules_version:'CONTROLLED:R',profile_version:'CONTROLLED:P',mode:'MANUAL',map_mode:'NO_MAP',evidence_class:'OBSERVED',run_purpose:'PRODUCTION',ready:true},publication:{state:'UNKNOWN'}});
test('actual OutcomeJournal uses V3 receipts and bounded maturity pages without touching v2 originals',async()=>{
  let now=T+60000;const store=new MemoryStore(),old={historical_v2:'untouched',record_digests:['RETAINED']};await store.set('pump:materialized-summary:production-v2',old);
  const journal=()=>createOutcomeJournal({store,clock:()=>now,profile:START_PROFILE});
  for(let n=0;n<7;n++)await journal().record(signal(n),null);
  let view=await journal().summary();assert.equal(view.status,'CURRENT');assert.equal(view.source_cursor,7);assert.equal(view.independent_waves,7);assert.equal(view.pending_waves,7);
  const a=await store.get(A);assert.equal(Object.hasOwn(a,'pending_deadlines'),false);assert.equal(Object.hasOwn(a,'instrument_assets'),false);assert.equal(a.maturity_pending,null);
  const waves=[...store.rows.entries()].filter(([k])=>k.startsWith('pump:materialized-wave:production-v3:'));assert.equal(waves.length,7);assert.ok(waves.every(([,w])=>!Object.hasOwn(w,'record_digests')));
  assert.equal([...store.rows.keys()].filter(k=>k.startsWith('pump:materialized-record:production-v3:')).length,7);
  now=T+H;view=await journal().summary();assert.notEqual(view.status,'CURRENT');assert.equal(view.pending_waves,2);assert.equal(view.mature_waves,5);
  view=await journal().summary();assert.equal(view.status,'CURRENT');assert.equal(view.mature_outcomes.unknown,7);assert.equal(view.pending_waves,0);assert.equal(view.source_cursor,7);assert.equal(view.processed_records,0);assert.equal(view.probability.value_pct,null);
  assert.equal([...store.rows.keys()].filter(k=>k.startsWith('pump:materialized-maturity:production-v3:due:')).length,7);assert.equal([...store.rows.keys()].filter(k=>k.startsWith('pump:summary-record:')).length,7);assert.deepEqual(await store.get('pump:materialized-summary:production-v2'),old);
});

test('actual journal restart repairs queue intent after atomic source/wave commit, then advances excluded cursor once',async()=>{
  class InterruptedStore extends MemoryStore{async atomic(key,change){if(this.fail&&key.startsWith('pump:materialized-maturity:production-v3:current:')){this.fail=false;throw Error('CONTROLLED_STOP_BEFORE_QUEUE');}return super.atomic(key,change);}}
  const store=new InterruptedStore(),journal=()=>createOutcomeJournal({store,clock:()=>T+60000,profile:START_PROFILE});store.fail=true;
  await assert.rejects(journal().record(signal('RECOVER'),null),/CONTROLLED_STOP_BEFORE_QUEUE/);
  let a=await store.get(A);assert.equal(a.source_cursor,1);assert.ok(a.maturity_pending);assert.equal(a.counters.independent_waves,1);
  let view=await journal().summary();assert.equal(view.status,'CURRENT');assert.equal(view.source_cursor,1);assert.equal(view.independent_waves,1);assert.equal((await store.get(A)).maturity_pending,null);
  await journal().record(signal('RECOVER'),null);view=await journal().summary();assert.equal(view.source_cursor,1);assert.equal(view.independent_waves,1);
  const acceptance=signal('EXCLUDED');acceptance.origin.run_purpose='ACCEPTANCE_TEST';await journal().record(acceptance,null);
  view=await journal().summary();assert.equal(view.source_cursor,2);assert.equal(view.independent_waves,1);assert.equal(view.excluded_records_by_purpose.ACCEPTANCE_TEST,1);assert.equal(view.status,'CURRENT');
  assert.equal([...store.rows.keys()].filter(k=>k.startsWith('pump:materialized-record:production-v3:')).length,1);
});

test('concurrent append after rendered V3 snapshot never labels old counters caught up with a newer cursor',async()=>{
  class RacingStore extends MemoryStore{
    async atomicPair(keys,change){const result=await super.atomicPair(keys,change);if(keys.includes('pump:materialized-maturity:production-v3:scan'))this.arm=true;return result;}
    async get(key){if(key==='pump:summary-ordered-head:v1'&&this.arm&&this.hook){this.arm=false;const hook=this.hook;this.hook=null;await hook();}return super.get(key);}
  }
  const store=new RacingStore(),journal=()=>createOutcomeJournal({store,clock:()=>T+60000,profile:START_PROFILE});await journal().record(signal('FIRST'),null);
  store.arm=false;store.hook=()=>journal().record(signal('CONCURRENT'),null);
  let view=await journal().summary();assert.equal(view.independent_waves,1);assert.equal(view.source_cursor,1);assert.equal(view.source_records_at_boundary,2);assert.equal(view.source_caught_up,false);assert.equal(view.status,'SUMMARY_CATCHUP_REQUIRED');
  view=await journal().summary();assert.equal(view.independent_waves,2);assert.equal(view.source_cursor,2);assert.equal(view.source_caught_up,true);assert.equal(view.status,'CURRENT');
});
