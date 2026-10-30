import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newMemory,capture,observe,dueEvents,serialize,restore,protectedReferences,draftNotice,hash} from './observer.mjs';
import {fixture,snapshot} from './fixtures.mjs';
const original=JSON.parse(fs.readFileSync(new URL('./gap-overflow-before.json',import.meta.url),'utf8'));
const card=()=>structuredClone(original.card);
const watch=(state,c)=>state.watch[c.event_id];
function seen(state,c,{ts,price=100,closed=false,id='POINT-'+ts}={}){
 const s=snapshot(c,{ts,price,closed,id});return observe(state,{event_id:c.event_id,snapshot:s,now_ts:s.received_ts+1});
}
function full({count=1,c=card()}={}){
 let state=capture(newMemory({max_gap_spans:count}),c).state;
 for(let n=1;n<=count;n++)state=seen(state,c,{ts:c.first_known_ts+n*3600000,id:'GAP-'+n}).state;
 return {c,state};
}
function overflow(f,extra={}){return seen(f.state,f.c,{ts:watch(f.state,f.c).last_source_ts+3600000,...extra});}

test('saved default128 before-fixture:129/130 fresh closed snapshots now progress without erasing128 intervals',()=>{
 assert.equal(original.input_class,'CONTROLLED_PROTOTYPE_NOT_NATIVE');assert.equal(original.after129.status,'DEFERRED_GAP_CAPACITY');assert.equal(original.after130.state_unchanged,true);
 const c=card(),f=full({count:128,c}),old=serialize(f.state),gaps=structuredClone(watch(f.state,c).gaps),refs=protectedReferences(f.state);
 assert.equal(hash(f.state),original.after128.state_sha256);
 const a=observe(f.state,{event_id:c.event_id,snapshot:original.snapshot129,now_ts:original.snapshot129.received_ts+1});
 const b=observe(a.state,{event_id:c.event_id,snapshot:original.snapshot130,now_ts:original.snapshot130.received_ts+1}),w=watch(b.state,c);
 assert.equal(a.status,'OBSERVED');assert.equal(b.status,'OBSERVED');assert.equal(w.observed_count,130);assert.equal(w.last_source_ts,original.snapshot130.source_ts);assert.equal(w.next_check_ts,original.snapshot130.source_ts+300000);
 assert.deepEqual(dueEvents(b.state,original.snapshot130.received_ts+1).events,[]);assert.equal(w.hypotheses.LONG,'CONFIRMED');assert.equal(a.new_transitions,2);assert.equal(b.new_transitions,0);
 assert.deepEqual(w.gaps,gaps);assert.equal(w.gaps.length,128);assert.equal(w.gap_overflow.unretained_interval_count,2);assert.equal(b.gap_details_complete,false);assert.deepEqual(protectedReferences(b.state),refs);
 assert.deepEqual(b.state.cards[c.event_id],c);assert.deepEqual(b.state.limits,original.parameters.defaults);assert.equal(serialize(f.state),old);
});

test('overflow receipt preserves the exact caller snapshot/interval and never claims durable ingress',()=>{
 const f=full(),previous=watch(f.state,f.c).last_source_ts,a=overflow(f,{price:110,closed:true}),receipt=a.unretained_gap;
 assert.deepEqual(receipt.interval,{start_ts:previous,end_ts:previous+3600000,kind:'UNOBSERVED_INTERVAL',interpolated:false});
 assert.equal(hash(receipt.caller_owned_snapshot),watch(a.state,f.c).last_snapshot_hash);assert.equal(receipt.gap_detail_retained_by_model,false);assert.equal(receipt.durable_ingress_required,true);assert.equal(receipt.native_ingress_qualified,false);
 assert.equal(a.gap_overflow.exact_intervals_retained,false);assert.equal(a.gap_overflow.bounds_scope,'ENCLOSING_NOT_CONTIGUOUS');
 const saved=serialize(a.state);receipt.caller_owned_snapshot.instrument.contract='CHANGED';receipt.interval.start_ts=0;a.gap_overflow.unretained_interval_count=999;
 assert.equal(serialize(a.state),saved);
});

test('duplicate/conflicting/stale source points after overflow create no new gap, transition or notice',()=>{
 const f=full(),a=overflow(f,{price:110,closed:true}),s=a.unretained_gap.caller_owned_snapshot,before=serialize(a.state);
 const dup=observe(a.state,{event_id:f.c.event_id,snapshot:s,now_ts:s.received_ts+2});assert.equal(dup.status,'DUPLICATE');
 assert.equal(observe(a.state,{event_id:f.c.event_id,snapshot:{...s,price:111},now_ts:s.received_ts+2}).status,'CONFLICTING_SNAPSHOT');
 const stale=snapshot(f.c,{ts:s.source_ts-1,id:'OLD'});assert.equal(observe(a.state,{event_id:f.c.event_id,snapshot:stale,now_ts:stale.received_ts+1}).status,'STALE_OR_REPLAYED_SOURCE_TIME');
 assert.equal(serialize(a.state),before);assert.equal(Object.keys(a.state.outbox).length,2);assert.equal(watch(a.state,f.c).gap_overflow.unretained_interval_count,1);
});

test('continuous snapshots do not invent extra gaps; later enclosing bounds never claim contiguous missing history',()=>{
 const f=full(),a=overflow(f),t=watch(a.state,f.c).last_source_ts,b=seen(a.state,f.c,{ts:t+300000});
 assert.equal(watch(b.state,f.c).observed_count,3);assert.equal(watch(b.state,f.c).gap_overflow.unretained_interval_count,1);assert.equal(b.unretained_gap,undefined);assert.equal(b.gap_details_complete,false);
 const d=seen(b.state,f.c,{ts:t+3900000}),w=watch(d.state,f.c);
 assert.equal(d.unretained_gap.interval.start_ts,t+300000);assert.equal(w.gap_overflow.first_start_ts,f.c.first_known_ts+3600000);assert.equal(w.gap_overflow.last_end_ts,t+3900000);assert.equal(w.gap_overflow.unretained_interval_count,2);assert.equal(w.gap_overflow.bounds_scope,'ENCLOSING_NOT_CONTIGUOUS');
});

test('restart preserves overflow, firstknown, cohort, proof refs, existing outcome links and outbox IDs',()=>{
 const f=full();f.state.caller_outcome_links={[f.c.event_id]:{card_hash:f.c.card_hash,status:'PENDING',plan_ref:'controlled-predeclared-plan'}};
 const a=overflow(f,{price:110,closed:true}),back=restore(serialize(a.state)),ids=Object.keys(back.outbox),b=seen(back,f.c,{ts:watch(back,f.c).last_source_ts+3600000,price:110,closed:true});
 assert.deepEqual(back,a.state);assert.equal(watch(b.state,f.c).gap_overflow.unretained_interval_count,2);assert.deepEqual(Object.keys(b.state.outbox),ids);assert.deepEqual(b.state.caller_outcome_links,f.state.caller_outcome_links);
 assert.equal(b.state.cards[f.c.event_id].first_known_ts,f.c.first_known_ts);assert.equal(b.state.cards[f.c.event_id].discovery,'PROSPECTIVE');assert.deepEqual(protectedReferences(b.state),protectedReferences(f.state));
});

for(const [direction,price] of [['LONG',110],['SHORT',90]])test(`overflow current ${direction} confirmation stays explicitly gapped and non-trading`,()=>{
 const f=full(),a=overflow(f,{price,closed:true}),w=watch(a.state,f.c);
 assert.equal(w.hypotheses[direction],'CONFIRMED');assert.equal(w.hypotheses[direction==='LONG'?'SHORT':'LONG'],'REFUTED');assert.equal(w.active,true);
 assert.equal(a.new_transitions,2);for(const t of a.state.transitions){assert.equal(t.timeliness,'GAPPED_CURRENT_CONFIRMATION');assert.equal(t.gap_details_complete,false);assert.equal(t.entry_authorized,false);assert.equal(draftNotice(a.state,t.transition_id).send_enabled,false);assert.match(draftNotice(a.state,t.transition_id).text,/есть пропуски/);}
 assert.equal(a.state.cards[f.c.event_id].main_score_effect,0);
});

test('invalid future, wrong-market or malformed closed snapshots cannot advance or damage a full gap journal',()=>{
 const f=full(),t=watch(f.state,f.c).last_source_ts+3600000,s=snapshot(f.c,{ts:t,closed:true,price:110}),old=serialize(f.state);
 assert.throws(()=>observe(f.state,{event_id:f.c.event_id,snapshot:s,now_ts:t-1}),/SNAPSHOT/);
 assert.throws(()=>observe(f.state,{event_id:f.c.event_id,snapshot:{...s,instrument:{...s.instrument,market:'SPOT'}},now_ts:s.received_ts+1}),/SNAPSHOT/);
 assert.throws(()=>observe(f.state,{event_id:f.c.event_id,snapshot:{...s,closed_candle:{...s.closed_candle,low:120}},now_ts:s.received_ts+1}),/OHLCV/);
 assert.equal(serialize(f.state),old);
});

test('overflow is bounded through long residence and does not touch a second event or pending historical card',()=>{
 const f=full(),other=fixture({mode:'LIVE_CAPTURE',asset:'CONTROLLED:OTHER'}).result.events[0],history=fixture({asset:'CONTROLLED:HISTORY'}).result.events[0];
 let state=capture(capture(f.state,other).state,history).state;const others=[structuredClone(state.watch[other.event_id]),structuredClone(state.watch[history.event_id])],gaps=structuredClone(watch(state,f.c).gaps),refs=protectedReferences(state);
 for(let n=1;n<=256;n++)state=seen(state,f.c,{ts:watch(state,f.c).last_source_ts+86400000,id:'LONG-RESIDENCE-'+n}).state;
 const w=watch(state,f.c);assert.equal(w.active,true);assert.equal(w.gap_overflow.unretained_interval_count,256);assert.equal(Object.keys(w.gap_overflow).length,6);assert.deepEqual(w.gaps,gaps);assert.equal(w.gaps.length,1);
 assert.deepEqual(state.watch[other.event_id],others[0]);assert.deepEqual(state.watch[history.event_id],others[1]);assert.deepEqual(protectedReferences(state),refs);assert.equal(Object.keys(state.cards).length,3);assert.equal(state.limits.max_active,128);assert.equal(state.limits.max_cards,512);assert.equal(state.limits.max_gap_spans,1);
});

test('a restored pre-overflow full journal needs no migration or raised capacity to resume',()=>{
 const f=full(),saved=serialize(f.state),back=restore(saved);assert.equal(watch(back,f.c).gap_overflow,undefined);
 const a=overflow({c:f.c,state:back});assert.equal(a.status,'OBSERVED');assert.equal(watch(a.state,f.c).gap_overflow.unretained_interval_count,1);assert.deepEqual(a.state.limits,f.state.limits);assert.deepEqual(watch(a.state,f.c).gaps,watch(f.state,f.c).gaps);
});

test('malformed overflow count or clocks reject without silently resetting missing-history evidence',()=>{
 const f=full(),a=overflow(f);
 for(const edit of [o=>o.unretained_interval_count=-1,o=>o.unretained_interval_count=Number.MAX_SAFE_INTEGER,o=>o.last_end_ts+=7200000,o=>o.exact_intervals_retained=true,o=>o.bounds_scope='CONTIGUOUS']){
  const state=structuredClone(a.state);edit(watch(state,f.c).gap_overflow);const old=serialize(state);
  assert.throws(()=>overflow({c:f.c,state}),/GAP_OVERFLOW_STATE_INVALID/);assert.equal(serialize(state),old);
 }
});
