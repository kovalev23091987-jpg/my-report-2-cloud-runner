import test from 'node:test';import assert from 'node:assert/strict';import{DatabaseSync}from'node:sqlite';
import{MemoryStore,D1Store}from'../../runtime/store.mjs';
import{createSummaryRecordIndex}from'../../runtime/summary-index.mjs';
import{createOutcomeJournal}from'../../runtime/outcome-journal.mjs';
import{textHash}from'../../runtime/delivery.mjs';import{START_PROFILE}from'../../profile/start-v1.mjs';
const T=Date.parse('2026-10-25T12:00:00Z'),HEAD='pump:summary-ordered-head:v1',PREFIX='pump:summary-ordered:v1:',LEGACY='pump:summary-record-index';
const id=n=>'pump:summary-record:'+n.toString(16).padStart(64,'0');
async function saved(store,n){const key=id(n);await store.set(key,{record_id:key,recorded_ts:T,proof:'ARTIFICIAL_INDEX_ONLY'});return key;}
test('55 modern records page across restarts without rereading the frozen legacy array',async()=>{
  const store=new MemoryStore();let legacyReads=0;const original=store.boundedArray.bind(store);store.boundedArray=(...args)=>{legacyReads++;return original(...args);};
  for(let n=1;n<=55;n++){await saved(store,n);assert.equal(await createSummaryRecordIndex({store}).append(id(n)),n);}
  assert.equal(legacyReads,1);const seen=[];let cursor=0;
  while(cursor<55){const p=await createSummaryRecordIndex({store}).page({after:cursor,limit:7});assert.ok(p.items.length<=7);seen.push(...p.items.map(r=>r.id));cursor=p.items.at(-1).seq;}
  assert.equal(seen.length,55);assert.equal(new Set(seen).size,55);assert.equal(legacyReads,1);assert.equal(await store.get(LEGACY),null);
  await assert.rejects(createSummaryRecordIndex({store}).page({after:0,limit:41}),/PAGE_BOUND/);
});
test('an acknowledged allocation interrupted before pointer commit recovers once and preserves original bytes',async()=>{
  class Interrupted extends MemoryStore{async atomicPair(keys,change){if(this.stop&&keys[1].startsWith(PREFIX)){this.stop=false;throw Error('PROCESS_STOP_AFTER_ACKNOWLEDGED_ALLOCATION');}return super.atomicPair(keys,change);}}
  const store=new Interrupted(),key=await saved(store,1),before=await store.get(key);await createSummaryRecordIndex({store}).initialize();store.stop=true;
  await assert.rejects(createSummaryRecordIndex({store}).append(key),/PROCESS_STOP/);assert.equal((await store.get(HEAD)).pending.id,key);
  const index=createSummaryRecordIndex({store});assert.equal(await index.append(key),1);assert.equal((await index.page()).items.length,1);assert.equal((await store.get(HEAD)).pending,null);assert.deepEqual(await store.get(key),before);
  await saved(store,2);const positions=await Promise.all([index.append(key),index.append(id(2)),createSummaryRecordIndex({store}).append(id(2))]);assert.deepEqual(positions,[1,2,2]);assert.equal((await index.page()).items.length,2);
});
test('bounded legacy migration retains exact order and originals and stops on a changed or oversized source',async()=>{
  const store=new MemoryStore(),ids=[];for(let n=1;n<=8;n++)ids.push(await saved(store,n));await store.set(LEGACY,ids);
  let r=await createSummaryRecordIndex({store}).initialize();assert.equal(r.ready,false);assert.equal(r.head.count,4);assert.deepEqual(await store.get(LEGACY),ids);
  r=await createSummaryRecordIndex({store}).initialize();assert.equal(r.ready,true);const page=await createSummaryRecordIndex({store}).page({after:3,limit:3});assert.deepEqual(page.items.map(r=>r.id),ids.slice(3,6));assert.deepEqual(await store.get(LEGACY),ids);
  const changed=new MemoryStore();for(let n=1;n<=8;n++)await saved(changed,n);await changed.set(LEGACY,ids);await createSummaryRecordIndex({store:changed}).initialize();await changed.set(LEGACY,[...ids,id(9)]);await assert.rejects(createSummaryRecordIndex({store:changed}).initialize(),/LEGACY_SUMMARY_INDEX_CHANGED/);assert.equal((await changed.get(HEAD)).count,4);
  const oversized=new MemoryStore();await oversized.set(LEGACY,Array.from({length:41},(_,n)=>id(n+1)));await assert.rejects(createSummaryRecordIndex({store:oversized}).initialize(),{code:'LEGACY_INDEX_BOUNDED_MIGRATION_REQUIRED'});
});
test('actual SQLite runs bounded PK range reads and two-key index commits without schema expansion',async()=>{
  const sql=new DatabaseSync(':memory:'),queries=[];
  const db={prepare(query){queries.push(query);let args=[];return{bind(...v){args=v;return this;},async all(){const results=sql.prepare(query).all(...args),write=/^(WITH|INSERT|UPDATE|CREATE)/.test(query.trim()),changes=write?Number(sql.prepare('SELECT changes() AS n').get().n):0;return{success:true,results,meta:{rows_read:write?1:results.length,rows_written:changes,changes}};}};}};
  const store=new D1Store({db,clock:()=>T,admission:{evidence_ref:'ARTIFICIAL_SQLITE_ONLY',expires_ts:T+10000,max_rows_read:5000,max_rows_written:300}});await store.install();const legacy=[];for(let n=1;n<=3;n++)legacy.push(await saved(store,n));await store.set(LEGACY,legacy);const index=createSummaryRecordIndex({store});assert.equal((await index.initialize()).ready,true);await saved(store,4);assert.equal(await index.append(id(4)),4);
  const p=await index.page({after:1,limit:2});assert.deepEqual(p.items.map(r=>r.id),[id(2),id(3)]);assert.deepEqual(await store.get(LEGACY),legacy);
  const range=queries.find(q=>q.includes('ORDER BY state_key LIMIT ?4'));assert.ok(range);const plan=sql.prepare('EXPLAIN QUERY PLAN '+range).all(PREFIX,PREFIX+'\uffff',PREFIX,2);assert.ok(plan.some(p=>/SEARCH.*INDEX/.test(p.detail)),JSON.stringify(plan));assert.ok(queries.filter(q=>/CREATE TABLE/.test(q)).length===1);sql.close();
});
test('the production journal consumes ordered pages and a current summary does not reread old records',async()=>{
  const store=new MemoryStore(),index=createSummaryRecordIndex({store});
  for(let n=1;n<=45;n++){
    const origin={instrument_id:'ARTIFICIAL:ROOT:I',asset_id:'ARTIFICIAL:ROOT:A',wave_id:'ARTIFICIAL_W'+n,signal_id:'ARTIFICIAL_SIGNAL'+n,t0:T,reference_price:100,rules_version:'ARTIFICIAL_R1',profile_version:'ARTIFICIAL_P1',mode:'MANUAL',map_mode:'NO_MAP',evidence_class:'OBSERVED',run_purpose:'PRODUCTION',ready:true};
    const payload={origin,publication:{state:'SENT',message_id:'ARTIFICIAL_'+n,receipt_ref:'ARTIFICIAL_RECEIPT'},outcome:null},key='pump:summary-record:'+await textHash(JSON.stringify(payload));await store.set(key,{record_id:key,recorded_ts:T,...payload});await index.append(key);
  }
  const journal=()=>createOutcomeJournal({store,clock:()=>T+60000,profile:START_PROFILE,evidence_class:'OBSERVED'});let q=await journal().summary({max_records:7});assert.equal(q.independent_waves,7);assert.equal(q.source_caught_up,false);
  for(let n=0;n<6;n++)q=await journal().summary({max_records:7});assert.equal(q.independent_waves,45);assert.equal(q.source_cursor,45);assert.equal(q.source_caught_up,true);assert.equal(q.source_index_bounded,true);
  const original=store.get.bind(store),read=[];store.get=async key=>{read.push(key);return original(key);};q=await journal().summary({max_records:4});assert.equal(q.processed_records,0);assert.equal(read.filter(k=>k.startsWith('pump:summary-record:')).length,0);assert.equal(q.probability.value_pct,null);
});
