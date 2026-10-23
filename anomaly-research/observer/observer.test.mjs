import test from 'node:test';
import assert from 'node:assert/strict';
import {detectClosed,features,TIMEFRAMES,newMemory,capture as record,observe,dueEvents,serialize,restore,protectedReferences,draftNotice,hash} from './observer.mjs';
import {fixture,snapshot} from './fixtures.mjs';
const event=opts=>fixture(opts).result.events[0];
// These historical CONTROLLED fixtures explicitly request model observation.
// Default replay is now record-only; its admission boundaries have new tests.
const capture=(memory,card)=>record(memory,card,{watch_mode:'HISTORICAL_REVIEW'});
function seen(state,c,args){const s=snapshot(c,args);return observe(state,{event_id:c.event_id,snapshot:s,now_ts:s.received_ts+1});}
for(const timeframe of Object.keys(TIMEFRAMES))test(`CONTROLLED closed ${timeframe}, native baseline and no direction`,()=>{
 const c=event({timeframe,offset:timeframe==='1w'?345600000:timeframe==='1d'?57600000:0});
 assert.ok(c);assert.equal(c.features.volume_ratio,10);assert.equal(c.background.length,20);assert.equal(c.direction,'UNASSIGNED');assert.equal(c.discovery,'BACKFILLED');assert.equal(c.entry_authorized,false);assert.equal(c.main_score_effect,0);
});
test('red and green have symmetric hypotheses, no intent claim',()=>{
 const red=event(),green=event({direction:'GREEN'});assert.deepEqual(red.conditions,green.conditions);assert.deepEqual(red.hypotheses,green.hypotheses);assert.equal(red.features.body_ratio,green.features.body_ratio);
});
test('future bars cannot alter earlier detection',()=>{
 const f=fixture(),a=detectClosed({...f,bars:[...f.bars,{...f.bars.at(-1),start_ts:f.bars.at(-1).end_ts,end_ts:f.bars.at(-1).end_ts+900000,volume:1e9}]});assert.deepEqual(a.events,f.result.events);assert.equal(a.diagnostic.open_bars_excluded,1);
});
test('wrong geometry, duplicate time, unknown units and native alignment rejected',()=>{
 const f=fixture();assert.throws(()=>detectClosed({...f,bars:[...f.bars,f.bars[0]]}),/DUPLICATE/);
 assert.throws(()=>detectClosed({...f,instrument:{...f.instrument,identity_verified:false}}),/INSTRUMENT/);
 assert.throws(()=>detectClosed({...f,instrument:{...f.instrument,volume_unit:''}}),/INSTRUMENT/);
 assert.throws(()=>detectClosed({...f,alignment_offset_ms:undefined}),/ALIGNMENT/);
 assert.throws(()=>detectClosed({...f,bars:f.bars.map((b,n)=>n===20?{...b,low:110}:b)}),/OHLCV/);
});
test('gapped history and insufficient same-scale background emit no event',()=>{
 const f=fixture();assert.equal(detectClosed({...f,bars:f.bars.slice(1)}).events.length,0);
 const b=f.bars.map(x=>({...x}));b[5].start_ts+=900000;b[5].end_ts+=900000;assert.throws(()=>detectClosed({...f,bars:b}),/DUPLICATE/);
 const gap=f.bars.map((b,n)=>({...b,start_ts:b.start_ts+(n>5?900000:0),end_ts:b.end_ts+(n>5?900000:0)}));
 assert.equal(detectClosed({...f,bars:gap,known_ts:f.known_ts+900000,provenance:{...f.provenance,source_as_of_ts:f.provenance.source_as_of_ts+900000,received_ts:f.provenance.received_ts+900000}}).diagnostic.gapped_backgrounds,1);
});
test('zero median and zero MAD stay unknown rather than infinity',()=>{
 const f=fixture(),zero=f.bars.map((b,n)=>({...b,volume:n===20?1000:0}));assert.equal(detectClosed({...f,bars:zero}).events.length,0);assert.equal(f.result.events[0].features.volume_robust_z,null);
});
test('actual receipt clocks needed, live/backfill/late labels explicit',()=>{
 const f=fixture({mode:'LIVE_CAPTURE'});assert.equal(f.result.events[0].discovery,'PROSPECTIVE');
 assert.equal(detectClosed({...f,known_ts:f.known_ts+86400000}).events[0].discovery,'BACKFILLED');
 assert.equal(event().evidence_class,'CONTROLLED');assert.throws(()=>detectClosed({...f,known_ts:f.known_ts-2000}),/PROVENANCE/);
});
test('idempotent capture freezes firstknown, conflicting body does not overwrite',()=>{
 const f=fixture(),c=f.result.events[0],one=capture(newMemory(),c),later=detectClosed({...f,known_ts:f.known_ts+86400000}).events[0];
 const two=capture(one.state,later);assert.equal(two.status,'DUPLICATE');assert.equal(two.state.cards[c.event_id].first_known_ts,c.first_known_ts);
 const change={...f,bars:f.bars.map((b,n)=>n===20?{...b,volume:2000}:b)};const altered=detectClosed(change).events[0];assert.equal(capture(one.state,altered).status,'CONFLICTING_REPLAY');assert.equal(one.state.cards[c.event_id].candle.volume,1000);
});
test('same coin multiple timeframes and events retained outside main selection',()=>{
 let m=newMemory();const a=event(),b=event({timeframe:'30m'});m=capture(m,a).state;m=capture(m,b).state;assert.equal(Object.keys(m.cards).length,2);assert.equal(dueEvents(m,Math.max(a.first_known_ts,b.first_known_ts)+1).events.length,2);assert.equal(dueEvents(m,a.first_known_ts).main_selection_used,false);
});
test('new watch is deferred but its card is recorded without evicting active event',()=>{
 const a=event(),b=event({asset:'CONTROLLED:OTHER'}),m=capture(newMemory({max_active:1}),a).state,r=capture(m,b);assert.equal(r.status,'RECORDED_WATCH_DEFERRED');assert.deepEqual(r.state.watch[a.event_id],m.watch[a.event_id]);assert.equal(r.state.cards[b.event_id].first_known_ts,b.first_known_ts);assert.equal(r.state.watch[b.event_id].active,false);assert.equal(protectedReferences(r.state).length,2);
});
test('price touch is not a closed candle confirmation',()=>{
 const c=event(),m=capture(newMemory(),c).state,r=seen(m,c,{price:110});assert.equal(r.new_transitions,0);assert.equal(r.state.watch[c.event_id].hypotheses.LONG,'WAITING');assert.equal(r.state.watch[c.event_id].sampled_high,110);
});
for(const [direction,price] of [['LONG',110],['SHORT',90]])test(`CONTROLLED ${direction} confirmed and opposite refuted with original anchor after month`,()=>{
 const c=event({timeframe:'1d'}),m=capture(newMemory(),c).state,ts=c.event_end_ts+32*86400000,r=seen(m,c,{ts,price,closed:true});
 const w=r.state.watch[c.event_id];assert.equal(w.hypotheses[direction],'CONFIRMED');assert.equal(w.hypotheses[direction==='LONG'?'SHORT':'LONG'],'REFUTED');assert.equal(w.active,true);assert.equal(w.gaps.length,1);assert.equal(r.state.cards[c.event_id].anchor.price,99.9);
 assert.equal(r.state.transitions[0].timeliness,'GAPPED_CURRENT_CONFIRMATION');const d=draftNotice(r.state,r.state.transitions[0].transition_id);assert.equal(d.send_enabled,false);assert.match(d.text,/Блок аномалий/);assert.equal(protectedReferences(r.state)[0].production_retention_hook_installed,false);
});
test('7d and 90d no-move do not delete or expire active episode',()=>{
 const c=event({timeframe:'1w'});let m=capture(newMemory(),c).state;m=seen(m,c,{ts:c.first_known_ts+90*86400000,price:100}).state;assert.equal(m.watch[c.event_id].active,true);assert.equal(m.watch[c.event_id].status,'WATCHING');assert.equal(Object.keys(m.cards).length,1);
});
test('restart recovers original card/watch/outbox and repeated snapshot has no duplicate notice',()=>{
 const c=event(),m=capture(newMemory(),c).state,s=snapshot(c,{ts:c.event_end_ts+3600000,price:110,closed:true}),r=observe(m,{event_id:c.event_id,snapshot:s,now_ts:s.received_ts+1});
 const back=restore(serialize(r.state));assert.deepEqual(back,r.state);assert.equal(observe(back,{event_id:c.event_id,snapshot:s,now_ts:s.received_ts+2}).status,'DUPLICATE');assert.equal(Object.keys(back.outbox).length,2);
 const changed={...s,price:111};assert.equal(observe(back,{event_id:c.event_id,snapshot:changed,now_ts:s.received_ts+3}).status,'CONFLICTING_SNAPSHOT');
});
test('future, preknown and wrong-asset snapshots rejected',()=>{
 const c=event(),m=capture(newMemory(),c).state,s=snapshot(c);assert.throws(()=>observe(m,{event_id:c.event_id,snapshot:s,now_ts:s.source_ts-1}),/SNAPSHOT/);
 assert.throws(()=>observe(m,{event_id:c.event_id,snapshot:{...s,instrument:{...s.instrument,market:'SPOT'}},now_ts:s.received_ts+1}),/SNAPSHOT/);
 assert.throws(()=>observe(m,{event_id:c.event_id,snapshot:snapshot(c,{ts:c.event_end_ts}),now_ts:c.first_known_ts+1}),/SNAPSHOT/);
 assert.throws(()=>observe(m,{event_id:c.event_id,snapshot:s,now_ts:s.source_ts+600000}),/SNAPSHOT/);
});
test('stale snapshots, malformed confirmation and integrity tampering do not mutate input',()=>{
 const c=event(),m=capture(newMemory(),c).state,r=seen(m,c,{}),old=serialize(r.state);assert.equal(seen(r.state,c,{ts:c.first_known_ts+1000,id:'old'}).status,'STALE_OR_REPLAYED_SOURCE_TIME');assert.equal(serialize(r.state),old);
 const s=snapshot(c,{closed:true,ts:c.event_end_ts+3600000});s.closed_candle.timeframe='1w';assert.throws(()=>observe(m,{event_id:c.event_id,snapshot:s,now_ts:s.received_ts+1}),/WINDOW/);assert.deepEqual(m.watch[c.event_id].hypotheses,{LONG:'WAITING',SHORT:'WAITING'});
 const bad=JSON.parse(serialize(m));bad.state.cards[c.event_id].anchor.price=1;bad.sha256=hash(bad.state);assert.throws(()=>restore(JSON.stringify(bad)),/CARD_INTEGRITY/);
});
test('gap cap preserves old evidence while current observation advances with explicit incomplete detail',()=>{
 const c=event(),m=capture(newMemory({max_gap_spans:1}),c).state,a=seen(m,c,{ts:c.first_known_ts+3600000}),b=seen(a.state,c,{ts:c.first_known_ts+7200000,id:'new'});assert.equal(b.status,'OBSERVED');assert.deepEqual(b.state.watch[c.event_id].gaps,a.state.watch[c.event_id].gaps);assert.equal(b.state.watch[c.event_id].observed_count,2);assert.equal(b.gap_details_complete,false);assert.equal(b.unretained_gap.durable_ingress_required,true);
});
test('bounded due queue reports deferred count without silently dropping work',()=>{
 let m=newMemory();const a=event(),b=event({asset:'CONTROLLED:OTHER'});m=capture(m,a).state;m=capture(m,b).state;const q=dueEvents(m,a.first_known_ts,{limit:1});assert.equal(q.events.length,1);assert.equal(q.deferred,1);assert.equal(Object.values(m.watch).filter(x=>x.active).length,2);
});
