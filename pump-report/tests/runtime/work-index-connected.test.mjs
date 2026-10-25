import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {MemoryStore,D1Store} from '../../runtime/store.mjs';
import {createWorkIndex} from '../../runtime/work-index.mjs';
import {createDelivery,textHash} from '../../runtime/delivery.mjs';
import {createOutcomeJournal,createOutcomeWorkIndex} from '../../runtime/outcome-journal.mjs';
import {createPumpRunner} from '../../runtime/runner.mjs';
import {evaluateOutcome} from '../../analytics/index.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {input,T,path,instrument} from '../analytics/fixtures.mjs';

// Controlled local state-transition fixtures only. No provider, native D1,
// Telegram, physical capacity exercise or actual production sample is created.
const legacy={manual:'pump:manual-queue',delivery:'pump:delivery-queue',journal:'pump:journal-index',outcomes:'pump:outcomes-pending'};
const factory=(store,kind='manual')=>createWorkIndex({store,kind,targetKey:id=>id,completed:target=>target.done===true});
class Interrupted extends MemoryStore{
  async atomicPair(keys,change){if(this.stopAllocation&&keys[1].includes(':ready:')){this.stopAllocation=false;throw Error('CONTROLLED_STOP_AFTER_ALLOCATION_ACK');}return super.atomicPair(keys,change);}
  async removeWorkPointer(key){if(this.stopCleanup){this.stopCleanup=false;throw Error('CONTROLLED_STOP_AFTER_DONE_ACK');}return super.removeWorkPointer(key);}
}
test('four work kinds recover acknowledged allocation and completion, and page only active work after completed history',async()=>{
  for(const kind of Object.keys(legacy)){
    const store=new Interrupted();let oldReads=0;const old=store.boundedArray.bind(store);store.boundedArray=(...args)=>{oldReads++;return old(...args);};
    const index=factory(store,kind);await index.ensureReady();await store.set('ORIGINAL',{done:false,value:'KEEP'});store.stopAllocation=true;
    await assert.rejects(index.add('ORIGINAL'),/CONTROLLED_STOP_AFTER_ALLOCATION_ACK/);
    const recovered=factory(store,kind);await recovered.add('ORIGINAL');assert.deepEqual((await recovered.page()).items.map(x=>x.id),['ORIGINAL']);
    await assert.rejects(recovered.complete('ORIGINAL'),/DURABLE_WORK_COMPLETION/);
    await store.set('ORIGINAL',{done:true,value:'KEEP'});store.stopCleanup=true;await assert.rejects(recovered.complete('ORIGINAL'),/CONTROLLED_STOP_AFTER_DONE_ACK/);
    assert.equal((await factory(store,kind).page()).items.length,0);assert.deepEqual(await store.get('ORIGINAL'),{done:true,value:'KEEP'});
    for(let n=0;n<60;n++){const id='CLOSED_'+n;await store.set(id,{done:true,n});await recovered.add(id);await recovered.complete(id);}
    for(let n=0;n<9;n++){const id='ACTIVE_'+n;await store.set(id,{done:false,n});await recovered.add(id);}
    const seen=new Set();for(let n=0;n<3;n++){const page=await recovered.page({limit:4});assert.ok(page.scanned<=4);for(const row of page.items)seen.add(row.id);}
    assert.equal(seen.size,9);assert.equal(oldReads,1);assert.equal(await store.get(legacy[kind]),null);
    assert.equal((await recovered.add('ORIGINAL')).status,'DONE','completed identity never rearms');
    assert.ok(![...store.rows.keys()].some(k=>k.includes(':ready:')&&store.rows.get(k)?.id==='ORIGINAL'));
    await assert.rejects(store.removeWorkPointer('ORIGINAL'),{code:'DERIVED_WORK_POINTER_REQUIRED'});
  }
});
test('bounded legacy migration keeps original bytes, resumes in pages and refuses a changed or oversized source',async()=>{
  const store=new MemoryStore(),ids=Array.from({length:7},(_,n)=>'LEGACY_'+n);for(const id of ids)await store.set(id,{done:false});await store.set(legacy.manual,ids);
  assert.equal((await factory(store).initialize()).ready,false);assert.equal((await factory(store).initialize()).ready,true);
  assert.deepEqual((await factory(store).page()).items.map(x=>x.id),ids);assert.deepEqual(await store.get(legacy.manual),ids);
  const changed=new MemoryStore();for(const id of ids)await changed.set(id,{done:false});await changed.set(legacy.manual,ids);await factory(changed).initialize();await changed.set(legacy.manual,ids.slice().reverse());
  await assert.rejects(factory(changed).initialize(),/LEGACY_WORK_INDEX_CHANGED/);assert.deepEqual(await changed.get(legacy.manual),ids.slice().reverse());
  const oversized=new MemoryStore();await oversized.set(legacy.manual,Array.from({length:41},(_,n)=>'X'+n));await assert.rejects(factory(oversized).initialize(),{code:'LEGACY_INDEX_BOUNDED_MIGRATION_REQUIRED'});
});
test('a completed allocation racing an older head snapshot is not resurrected or treated as corrupt',async()=>{
  class Racing extends Interrupted{async get(key){const value=await super.get(key);if(this.race&&key==='pump:work-index:v1:manual:head'&&value?.pending){const action=this.race;this.race=null;await action();}return value;}}
  const store=new Racing(),index=factory(store);await index.ensureReady();await store.set('A',{done:false});await store.set('B',{done:false});store.stopAllocation=true;
  await assert.rejects(index.add('A'),/CONTROLLED_STOP_AFTER_ALLOCATION_ACK/);
  store.race=async()=>{const concurrent=factory(store);await concurrent.add('A');await store.set('A',{done:true});await concurrent.complete('A');};
  await factory(store).add('B');assert.deepEqual((await index.page()).items.map(r=>r.id),['B']);assert.equal((await index.add('A')).status,'DONE');assert.deepEqual(await store.get('A'),{done:true});
});
test('actual local SQLite uses the existing PK for active range and derived-only deletion, with no schema expansion',async()=>{
  const sql=new DatabaseSync(':memory:'),queries=[];
  const db={prepare(query){queries.push(query);let args=[];return {bind(...values){args=values;return this;},async all(){const results=sql.prepare(query).all(...args),write=/^(WITH|INSERT|UPDATE|CREATE|DELETE)/.test(query.trim()),changes=write?Number(sql.prepare('SELECT changes() AS n').get().n):0;return {success:true,results,meta:{rows_read:write?1:results.length,rows_written:changes,changes}};}};}};
  const store=new D1Store({db,clock:()=>T,admission:{evidence_ref:'CONTROLLED_LOCAL_SQLITE',expires_ts:T+10000,max_rows_read:5000,max_rows_written:500}});await store.install();const index=factory(store);await store.set('ORIGINAL',{done:false});await index.add('ORIGINAL');
  assert.deepEqual((await index.page()).items.map(x=>x.id),['ORIGINAL']);await store.set('ORIGINAL',{done:true});await index.complete('ORIGINAL');assert.equal((await index.page()).items.length,0);assert.deepEqual(await store.get('ORIGINAL'),{done:true});
  const prefix='pump:work-index:v1:manual:ready:',range=queries.find(q=>q.includes('ORDER BY state_key LIMIT ?4')),del=queries.find(q=>q.startsWith('DELETE'));
  for(const [query,args]of [[range,[prefix,prefix+'\uffff',prefix,4]],[del,[prefix+'0000000000000001']]]){const plan=sql.prepare('EXPLAIN QUERY PLAN '+query).all(...args);assert.ok(plan.some(row=>/SEARCH.*INDEX/.test(row.detail)),JSON.stringify(plan));}
  const before=queries.length;await assert.rejects(store.removeWorkPointer('pump:summary-record:KEEP'),{code:'DERIVED_WORK_POINTER_REQUIRED'});assert.equal(queries.length,before);assert.equal(queries.filter(q=>q.startsWith('CREATE')).length,1);sql.close();
});

function budgetFixture({statisticsExhausted=false}={}){let mode='AUTO';return {setMode(value){mode=value;},summary(){return {mode,total:statisticsExhausted?164:0,lanes:{hot:0,statistics:statisticsExhausted?12:0},limits:{http_per_run:164,manual_http_run_reserve:24,lanes:{hot:96,statistics:12}}};}};}
function analysisFixture(i){return {ready:true,status:'READY',automatic_eligible:true,instrument:i.instrument,wave_id:'CONTROLLED_QUEUE_WAVE',wave_state:'ACTIVE',analysis_ts:i.analysis_ts,mode:i.mode,rules_version:'CONTROLLED_QUEUE_RULE',profile_version:START_PROFILE.version,reference_price:100,run_purpose:i.run_purpose,fact_ids:Object.values(i.facts).map(f=>f.fact_id),next_wave:{expires_ts:T+START_PROFILE.wave_max_age_ms},liquidations:{map_mode:'WITHOUT_MAP'},plan:{potential_pct:{minimum:10,maximum:20,basis:'GROSS_ENTRY_TO_EXIT_NOT_EXECUTED_PROFIT'}},card_text:'CONTROLLED QUEUE CARD; NO NATIVE SEND'};}
test('connected executor prioritizes concurrent manual work, preserves UNKNOWN without resending and returns durable duplicate results',async()=>{
  const raw=input(),store=new MemoryStore();let runner,sends=0,cores=0;const modes=[];
  const sources={getCatalog:async()=>({instruments:[instrument],unqualified:[],coverage:{status:'CURRENT'}}),getOverview:async()=>({observations:[{instrument,facts:{price:raw.facts.price},reported_change_pct:0}],coverage:{status:'CURRENT'}}),getCore:async()=>{cores++;if(cores===1)await runner.enqueueManual('TEST',{request_id:'SECOND'});return {facts:raw.facts,coverage:{status:'CURRENT'}};},getOptional:async()=>({facts:{}}),getLiquidations:async()=>raw.liquidations,getOutcomeHistory:async()=>{throw Error('NO_PROVIDER_FOR_TEST_OUTCOME');}};
  const delivery=createDelivery({store,clock:()=>T,recipient:'123',revalidate:async()=>({valid:true}),send:async()=>{sends++;throw Error('CONTROLLED_ACK_UNKNOWN');}});
  runner=createPumpRunner({store,sources,delivery,clock:()=>T,budget:budgetFixture(),evidence_class:'ARTIFICIAL',run_purpose:'ACCEPTANCE_TEST',analyzePump:i=>{modes.push(i.mode);return analysisFixture(i);},evaluateOutcome});
  await runner.enqueueManual('TEST',{request_id:'FIRST'});const result=await runner.execute({mode:'AUTO',run_id:'CONTROLLED_ONLY'});
  assert.deepEqual(result.manual.map(r=>r.request_id),['FIRST','SECOND']);assert.equal(result.checked.length,0);assert.ok(modes.every(mode=>mode==='MANUAL'));assert.equal(cores,2);assert.equal(sends,1);
  const id=result.manual[0].result.delivery.card_id,card=await store.get('pump:card:'+id);assert.equal(card.state,'UNKNOWN');assert.equal(card.message_id,null);assert.equal(card.publication_registered,true);assert.equal((await delivery.pending()).length,0);
  const duplicate=await runner.execute({mode:'MANUAL',symbol:'TEST',request_id:'FIRST'});assert.equal(duplicate.status,'COMPLETE');assert.equal(cores,2);assert.equal(sends,1);
  assert.equal((await runner.getManualResult('FIRST')).delivery.state,'UNKNOWN');assert.equal((await store.get('pump:manual:SECOND')).status,'COMPLETE');
  for(const key of Object.values(legacy))assert.equal(await store.get(key),null,'old array not rewritten');
  assert.ok([...store.rows.keys()].some(k=>k.startsWith('pump:signal:')),'UNKNOWN original retained for audit');assert.equal((await createOutcomeWorkIndex({store}).page()).items.length,0,'test-origin pending closed with retained exclusion evidence');
});
test('frozen-anchor restart repairs durable signal and a saved terminal outcome repairs summary before closing work',async()=>{
  class StopSignal extends MemoryStore{async atomic(key,change){if(this.stop&&key.startsWith('pump:signal:')){this.stop=false;throw Error('CONTROLLED_STOP_AFTER_FROZEN_ANCHOR');}return super.atomic(key,change);}}
  let now=T;const raw={...input(),mode:'MANUAL',run_purpose:'PRODUCTION'},a=analysisFixture(raw),store=new StopSignal(),make=()=>createOutcomeJournal({store,clock:()=>now,profile:START_PROFILE,evidence_class:'OBSERVED'}),key='pump:analysis:'+await textHash(JSON.stringify(a));
  await store.set(key,{analysis:a,input:raw,saved_ts:now});await make().remember(a,raw,key);const before=JSON.stringify(await store.get(key));
  await store.set('pump:card:CONTROLLED',{card_id:'CONTROLLED',analysis:{...a,source_input_key:key},created_ts:T,updated_ts:T,state:'SENT',message_id:'111',receipt:{confirmed_ts:T,message_id:'111'}});store.stop=true;
  await assert.rejects(make().publication('CONTROLLED'),/CONTROLLED_STOP_AFTER_FROZEN_ANCHOR/);
  const journalKey='pump:journal:'+instrument.instrument_id+':'+a.wave_id;assert.ok((await store.get(journalKey)).frozen_anchor);assert.equal([...store.rows.keys()].filter(k=>k.startsWith('pump:signal:')).length,0);
  const repaired=await make().syncTerminal();assert.equal(repaired.length,1);assert.equal(repaired[0].summary_origin.t0,T);assert.equal(repaired[0].summary_origin.reference_price,100);
  const work=createOutcomeWorkIndex({store}),signalKey=(await work.page()).items[0].id,signal=await store.get(signalKey);assert.equal(signal.publication.state,'SENT');assert.equal((await make().syncTerminal()).length,0);
  now=signal.deadline_ts+1;const outcome=evaluateOutcome({signal,candles:path({high:113}),as_of_ts:now});assert.equal(outcome.status,'HIT');await store.set('pump:outcome:'+signal.signal_id,outcome);
  let historyCalls=0;const runner=createPumpRunner({store,sources:{getCore(){},getOutcomeHistory(){historyCalls++;throw Error('NO_REPEAT_HISTORY_AFTER_SAVED_TERMINAL');}},delivery:{},clock:()=>now,budget:budgetFixture({statisticsExhausted:true}),analyzePump(){},evaluateOutcome});
  await runner.checkOutcomes({run_id:'CONTROLLED_RESTART'});assert.equal(historyCalls,0);assert.equal((await work.page()).items.length,0);assert.equal((await make().summary()).mature_outcomes.hit,1);assert.equal(JSON.stringify(await store.get(key)),before);assert.deepEqual(await store.get('pump:outcome:'+signal.signal_id),outcome);assert.ok(await store.get('pump:card:CONTROLLED'));
});
test('duplicate request repairs COMPLETE-with-result work after a stop before closure, without any source or send',async()=>{
  const store=new MemoryStore(),request_id='SAVED_COMPLETE',result={status:'CONTROLLED_SAVED_RESULT'};
  await store.set('pump:manual:'+request_id,{request_id,symbol:'TEST',publish:true,status:'COMPLETE'});await store.set('pump:manual-result:'+request_id,result);
  const work=createWorkIndex({store,kind:'manual',targetKey:id=>'pump:manual:'+id,completed:async target=>target.status==='COMPLETE'&&await store.get('pump:manual-result:'+target.request_id)!==null});await work.add(request_id);
  const runner=createPumpRunner({store,sources:{getCore(){throw Error('NO_SOURCE_AFTER_DURABLE_RESULT');}},delivery:{},budget:budgetFixture(),analyzePump(){throw Error('NO_RECOMPUTE_AFTER_DURABLE_RESULT');},evaluateOutcome});
  const replay=await runner.execute({mode:'MANUAL',symbol:'TEST',request_id});assert.equal(replay.status,'COMPLETE');assert.deepEqual(replay.result,result);assert.equal((await work.page()).items.length,0);assert.deepEqual(await runner.getManualResult(request_id),result);
});
