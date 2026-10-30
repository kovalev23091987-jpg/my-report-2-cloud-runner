import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {detectClosed,TIMEFRAMES,hash,newMemory,capture,admitWatch,upgradeLegacyMemory,observe,dueEvents,serialize,restore,protectedReferences} from './observer.mjs';
import {fixture,instrument,snapshot} from './fixtures.mjs';
import {commitOutcomePlan,evaluateOutcome} from '../statistics/outcomes.mjs';
const card=(asset,live=false)=>fixture({asset:'CONTROLLED:'+asset,mode:live?'LIVE_CAPTURE':'REPLAY'}).result.events[0];
const observeAt=(state,c,price,hours)=>{const s=snapshot(c,{ts:c.event_end_ts+hours*3600000,price,closed:true,id:'CLOSED'+hours});return observe(state,{event_id:c.event_id,snapshot:s,now_ts:s.received_ts+1}).state;};

test('CONTROLLED proven160-event input records159 backfills and admits the sole timely event under unchanged128/512',()=>{
 const d=TIMEFRAMES['15m'],start=Math.ceil(1700000000000/d)*d,bars=Array.from({length:180},(_,n)=>({start_ts:start+n*d,end_ts:start+(n+1)*d,open:100,high:101,low:99,close:100,volume:100*1.2**n})),end=bars.at(-1).end_ts;
 const detected=detectClosed({instrument,timeframe:'15m',alignment_offset_ms:0,bars,known_ts:end+1000,mode:'LIVE_CAPTURE',provenance:{raw_sha256:hash(bars),raw_ref:'CONTROLLED:STARVATION',source_as_of_ts:end,received_ts:end+500,evidence_class:'PROSPECTIVE'}}).events;
 assert.equal(detected.length,160);assert.equal(detected.filter(c=>c.discovery==='PROSPECTIVE').length,1);
 let state=newMemory();const results=[];for(const c of detected){const r=capture(state,c);state=r.state;results.push(r.status);assert.deepEqual(state.cards[c.event_id],c);}
 const live=detected.at(-1),due=dueEvents(state,live.first_known_ts);
 assert.equal(state.limits.max_active,128);assert.equal(state.limits.max_cards,512);assert.equal(state.admission_policy.backfill_card_limit,384);assert.equal(Object.keys(state.cards).length,160);assert.equal(Object.values(state.watch).filter(w=>w.active).length,1);assert.deepEqual(due.events,[live.event_id]);assert.deepEqual(due.lanes.prospective,[live.event_id]);assert.deepEqual(due.lanes.historical,[]);assert.equal(results.filter(s=>s==='RECORDED_BACKFILL').length,159);assert.equal(results.at(-1),'CAPTURED');assert.equal(protectedReferences(state).length,160);
 if(process.env.REPORT2_BACKFILL_PROOF)writeFileSync(process.env.REPORT2_BACKFILL_PROOF,JSON.stringify({schema:'CONTROLLED_BACKFILL_WATCH_REPAIR_V1',input_class:'CONTROLLED_SYNTHETIC_NOT_MARKET_DATA',bars:180,events:160,retained_backfilled:159,retained_prospective:1,active:1,active_event:live.event_id,first_known_ts:live.first_known_ts,retained_cards_hash:hash(state.cards),max_active:128,max_cards:512,backfill_card_limit:384,deferred:0,production_activation:false,native_admission_qualified:false,network:0,SQL:0},null,2)+'\n');
});
test('backfill card saturation reserves existing card space without eviction or a raised limit',()=>{
 let state=newMemory({max_active:2,max_cards:4});const h1=card('H1'),h2=card('H2'),h3=card('H3'),p1=card('P1',true),p2=card('P2',true);
 state=capture(state,h1).state;state=capture(state,h2).state;const old=serialize(state),defer=capture(state,h3);
 assert.equal(defer.status,'DEFERRED_BACKFILL_CARD_CAPACITY');assert.equal(defer.state,state);assert.equal(serialize(state),old);assert.equal(defer.card_retained_by_model,false);assert.equal(defer.durable_ingress_required,true);assert.deepEqual(defer.caller_owned_card,h3);
 state=capture(state,p1).state;state=capture(state,p2).state;assert.equal(Object.keys(state.cards).length,4);assert.equal(Object.values(state.watch).filter(w=>w.active).length,2);for(const c of[h1,h2,p1,p2])assert.deepEqual(state.cards[c.event_id],c);
});
test('full global card capacity returns caller-owned complete payload and original clocks, not durable admission',()=>{
 const p=card('FULL',true),next=card('NEXT',true),state=capture(newMemory({max_active:1,max_cards:1}),p).state,r=capture(state,next);
 assert.equal(r.status,'DEFERRED_CARD_CAPACITY');assert.equal(r.state,state);assert.deepEqual(r.caller_owned_card,next);assert.equal(r.first_known_ts,next.first_known_ts);assert.equal(r.raw_ref,next.provenance.raw_ref);assert.equal(r.card_hash,next.card_hash);assert.equal(r.card_retained_by_model,false);assert.equal(r.durable_ingress_required,true);assert.equal(r.native_admission_qualified,false);assert(!state.cards[next.event_id]);
});
test('full active queue records a pending prospective card and explicit retry preserves firstknown, old outbox and closed watch',()=>{
 const a=card('ACTIVE',true),b=card('PENDING',true);let state=capture(newMemory({max_active:1,max_cards:4}),a).state;
 const r=capture(state,b);state=r.state;assert.equal(r.status,'RECORDED_WATCH_DEFERRED');assert.equal(state.cards[b.event_id].card_hash,b.card_hash);assert.equal(state.watch[a.event_id].active,true);assert.equal(dueEvents(state,b.first_known_ts).pending_watch_count,1);
 const s=snapshot(b);assert.equal(observe(state,{event_id:b.event_id,snapshot:s,now_ts:s.received_ts+1}).status,'WATCH_NOT_ADMITTED');
 state=observeAt(state,a,110,1);state=observeAt(state,a,90,2);assert.equal(state.watch[a.event_id].active,false);const before=structuredClone(state),admitted=admitWatch(state,b.event_id,{mode:'PROSPECTIVE_RETRY'});state=admitted.state;
 assert.equal(admitted.status,'WATCH_ADMITTED');assert.deepEqual(state.watch[a.event_id],before.watch[a.event_id]);assert.deepEqual(state.outbox,before.outbox);assert.equal(state.cards[b.event_id].first_known_ts,b.first_known_ts);assert.equal(state.watch[b.event_id].next_check_ts,b.first_known_ts);assert.equal(admitWatch(state,a.event_id,{mode:'PROSPECTIVE_RETRY'}).status,'CLOSED_OR_UNRECONCILED_WATCH_NOT_REOPENED');
});
test('historical review is explicit, cannot relabel a backfill as prospective or expire it at7days',()=>{
 const c=card('HIST');let state=capture(newMemory(),c).state;assert.equal(dueEvents(state,c.first_known_ts+90*86400000).events.length,0);assert.deepEqual(state.cards[c.event_id],c);
 assert.throws(()=>admitWatch(state,c.event_id,{mode:'PROSPECTIVE_RETRY'}),/EXPLICIT_WATCH_MODE/);const r=admitWatch(state,c.event_id,{mode:'HISTORICAL_REVIEW'});state=r.state;
 assert.equal(r.status,'WATCH_ADMITTED');assert.equal(r.native_admission_qualified,false);assert.equal(state.cards[c.event_id].discovery,'BACKFILLED');assert.equal(state.cards[c.event_id].first_known_ts,c.first_known_ts);assert.deepEqual(dueEvents(state,c.first_known_ts).lanes.historical,[c.event_id]);
});
test('a later live replay cannot rewrite a retained historical card or silently start its watch',()=>{
 const old=card('REPLAY'),live=card('REPLAY',true),one=capture(newMemory(),old).state,before=serialize(one),r=capture(one,live);
 assert.equal(old.event_id,live.event_id);assert(['DUPLICATE','CONFLICTING_REPLAY'].includes(r.status));assert.equal(serialize(r.state),before);assert.equal(r.state.cards[old.event_id].discovery,'BACKFILLED');assert.equal(r.state.watch[old.event_id].active,false);
});
test('restart retains inactive history, deferred watch, firstknown anchors and caller outcome links',()=>{
 const h=card('LINK'),a=card('LIVE1',true),p=card('LIVE2',true);let state=capture(newMemory({max_active:1,max_cards:4}),h).state;state=capture(state,a).state;state=capture(state,p).state;
 const plan=commitOutcomePlan(h,{committed_ts:h.first_known_ts,anchor:{instrument:h.instrument,price:100,source_ts:h.first_known_ts-1,received_ts:h.first_known_ts,raw_sha256:hash('KNOWN'),raw_ref:'CONTROLLED:KNOWN'},horizons:['90d']});
 state.caller_outcome_links={[h.event_id]:{plan_hash:plan.plan_hash,card_hash:h.card_hash,status:'PENDING'}};const restored=restore(serialize(state));assert.deepEqual(restored,state);assert.deepEqual(restored.cards[h.event_id],h);assert.equal(protectedReferences(restored).length,3);assert.equal(evaluateOutcome(plan,{direction:'LONG',horizon:'90d',as_of_ts:h.first_known_ts+91*86400000,points:[]}).status,'INCOMPLETELY_OBSERVED');assert.equal(restored.caller_outcome_links[h.event_id].status,'PENDING');
});
function legacyPair({fullCards=false}={}){
 const a=card('OLD1'),b=card('OLD2');let old=newMemory({max_active:2,max_cards:4});old=capture(old,a,{watch_mode:'HISTORICAL_REVIEW'}).state;old=capture(old,b,{watch_mode:'HISTORICAL_REVIEW'}).state;delete old.admission_policy;for(const w of Object.values(old.watch))delete w.admission_kind;
 old.caller_outcome_links={[a.event_id]:{status:'PENDING90D',card_hash:a.card_hash}};old.unknown_legacy_metadata={keep:true};if(fullCards)old.limits.max_cards=2;return{old,a,b};
}
test('legacy active history requires explicit upgrade and remains active while new prospective watch defers',()=>{
 const {old,a,b}=legacyPair(),p=card('NEW',true),saved=restore(serialize(old));assert.throws(()=>capture(saved,p),/EXPLICIT_LEGACY_MEMORY_UPGRADE/);
 const u=upgradeLegacyMemory(saved);assert.equal(u.legacy_active_backfilled,2);assert.deepEqual(u.state.cards,old.cards);assert.deepEqual(u.state.outbox,old.outbox);assert.deepEqual(u.state.caller_outcome_links,old.caller_outcome_links);assert.deepEqual(u.state.unknown_legacy_metadata,old.unknown_legacy_metadata);
 const r=capture(u.state,p);assert.equal(r.status,'RECORDED_WATCH_DEFERRED');assert.equal(r.state.watch[a.event_id].active,true);assert.equal(r.state.watch[b.event_id].active,true);assert.equal(r.state.watch[p.event_id].active,false);assert.equal(dueEvents(r.state,p.first_known_ts).legacy_active_backfilled,2);assert.equal(protectedReferences(r.state).length,3);
});
test('legacy card debt is preserved, not silently evicted to create a new timely slot',()=>{
 const {old}=legacyPair({fullCards:true}),p=card('NO_ROOM',true),u=upgradeLegacyMemory(old);assert.equal(u.legacy_backfill_card_overage,2);assert.equal(u.state.limits.max_cards,2);assert.deepEqual(u.state.cards,old.cards);
 const r=capture(u.state,p);assert.equal(r.status,'DEFERRED_CARD_CAPACITY');assert.equal(r.state,u.state);assert.equal(r.durable_ingress_required,true);assert.deepEqual(r.caller_owned_card,p);assert.equal(protectedReferences(u.state).length,2);
});
test('legacy invalid global occupancy and false prospective class reject without truncating protected history',()=>{
 const {old}=legacyPair(),before=JSON.stringify(old);assert.throws(()=>upgradeLegacyMemory({...old,limits:{...old.limits,max_active:1}}),/LEGACY_MEMORY_OVER/);assert.equal(JSON.stringify(old),before);
 const c=card('FORGED'),{card_hash,...body}=c,wrong={...body,discovery:'PROSPECTIVE'};assert.throws(()=>capture(newMemory(),{...wrong,card_hash:hash(wrong)}),/PROSPECTIVE_CAPTURE_CLASS/);
});
test('legacy missing limits cannot silently acquire larger default limits during explicit upgrade',()=>{
 const {old}=legacyPair(),before=JSON.stringify(old),missing={...old};delete missing.limits;assert.throws(()=>upgradeLegacyMemory(missing),/LEGACY_LIMITS_REQUIRED/);
 const partial={...old,limits:{...old.limits}};delete partial.limits.max_cards;assert.throws(()=>upgradeLegacyMemory(partial),/LEGACY_LIMITS_REQUIRED/);assert.equal(JSON.stringify(old),before);
});
