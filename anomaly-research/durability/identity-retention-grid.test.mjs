import test from 'node:test';
import assert from 'node:assert/strict';
import {detectClosed,newMemory,capture,observe,protectedReferences,hash,TIMEFRAMES} from '../observer/observer.mjs';
import {fixture,snapshot} from '../observer/fixtures.mjs';
import {nativeMarketKey,logicalEventIdentity,logicalCohortKey,newRegistry,registerRevision,confirmationVerdict,retentionDecision} from './identity-retention-grid.mjs';
const native=c=>({venue:c.instrument.venue,market:c.instrument.market,native_instrument_id:'CONTROLLED_NATIVE_1',instrument_epoch:'CONTROLLED_LISTING_2026',contract_code:c.instrument.contract,qualification_ref:'CONTROLLED:NATIVE:ACK',qualified:true});
test('COUNTEREXAMPLE actual frozen detector duplicates event_id when binding_ref changes; logical identity does not',()=>{
 const f=fixture(),a=f.result.events[0],b=detectClosed({...f,instrument:{...f.instrument,binding_ref:'CONTROLLED:new-qualification'},known_ts:f.known_ts+86400000}).events[0];
 assert.notEqual(a.event_id,b.event_id);assert.notEqual(a.group_key,b.group_key);
 const x=logicalEventIdentity(a,native(a)),y=logicalEventIdentity(b,native(b));assert.equal(x.logical_event_id,y.logical_event_id);assert.notEqual(x.provenance_revision,y.provenance_revision);
 let r=registerRevision(newRegistry(),a,native(a)).state;const next=registerRevision(r,b,native(b));assert.equal(next.status,'PROVENANCE_REVISION');assert.equal(next.independent_new_event,false);assert.equal(next.canonical_first_known_ts,a.first_known_ts);assert.equal(next.state.events[x.logical_event_id].canonical_card.card_hash,a.card_hash);
});
test('rule revisions do not create another logical event or outcome cell',()=>{
 const f=fixture(),a=f.result.events[0],b=detectClosed({...f,rules:{volume_ratio:4}}).events[0];assert.notEqual(a.event_id,b.event_id);
 const x=logicalEventIdentity(a,native(a)),y=logicalEventIdentity(b,native(b));assert.equal(x.logical_event_id,y.logical_event_id);assert.equal(logicalCohortKey(x.logical_event_id,'90d','LONG'),logicalCohortKey(y.logical_event_id,'90d','LONG'));
});
test('distinct native instrument epochs/venues/timeframes remain separate',()=>{
 const a=fixture().result.events[0],b=fixture({timeframe:'30m'}).result.events[0],x=logicalEventIdentity(a,native(a));
 assert.notEqual(x.logical_event_id,logicalEventIdentity(a,{...native(a),instrument_epoch:'NEXT_LISTING'}).logical_event_id);assert.notEqual(x.logical_event_id,logicalEventIdentity(b,native(b)).logical_event_id);
 assert.throws(()=>logicalEventIdentity(a,{...native(a),venue:'OTHER'}),/NATIVE_ID/);assert.throws(()=>logicalEventIdentity(a,{...native(a),qualified:false}),/NATIVE_ID/);
});
test('changed material units remain a conflict, not another independent sample',()=>{
 const f=fixture(),a=f.result.events[0],b=detectClosed({...f,instrument:{...f.instrument,volume_unit:'QUOTE_USDT'}}).events[0];const r=registerRevision(newRegistry(),a,native(a)),s=registerRevision(r.state,b,native(b));assert.equal(s.status,'CONFLICTING_NATIVE_FACTS');assert.equal(s.independent_new_event,false);assert.equal(Object.keys(s.state.events).length,1);assert.equal(s.state.events[s.logical_event_id].conflicting_native_facts,true);
});
test('repeated revision idempotent, bounded revision history explicitly deferred',()=>{
 const f=fixture(),c=f.result.events[0],a=registerRevision(newRegistry({max_revisions:1}),c,native(c));assert.equal(registerRevision(a.state,c,native(c)).status,'DUPLICATE_REVISION');
 const b=detectClosed({...f,instrument:{...f.instrument,binding_ref:'new'}}).events[0];assert.equal(registerRevision(a.state,b,native(b)).status,'DEFERRED_REGISTRY_CAPACITY');
});
function eventRecord(){const c=fixture().result.events[0],r=registerRevision(newRegistry(),c,native(c));return r.state.events[r.logical_event_id];}
const retentionArgs=e=>({logical_event:e,active:false,latest_source:false,detail_age_ms:90*86400000,reference_graph_complete:true,planned_outcome_keys:['LONG:30d','LONG:90d'],outcomes:[{key:'LONG:30d',status:'UNWORKED'},{key:'LONG:90d',status:'PENDING'}],outbox:[{key:'O1',status:'SENT',message_id:'CONTROLLED:101'}]});
test('closed historical watch and simulated SENT keep pending90d references after separate admission repair',()=>{
 const c=fixture().result.events[0];let m=capture(newMemory(),c,{watch_mode:'HISTORICAL_REVIEW'}).state;
 for(const [n,price] of [[1,110],[2,90]]){const s=snapshot(c,{ts:c.event_end_ts+n*3600000,price,closed:true,id:'S'+n});m=observe(m,{event_id:c.event_id,snapshot:s,now_ts:s.received_ts+1}).state;}
 assert.equal(m.watch[c.event_id].active,false);for(const o of Object.values(m.outbox)){o.status='SENT';o.message_id='CONTROLLED:101';}
 assert.equal(protectedReferences(m).length,1);assert.equal(protectedReferences(m)[0].card_hash,c.card_hash);assert.equal(protectedReferences(m)[0].retention_eligibility_qualified,false);
 const e=eventRecord(),p=retentionDecision(retentionArgs(e));assert.equal(p.eligible_detail_expiry,false);assert.ok(p.reasons.includes('UNFINISHED_OUTCOME:LONG:90d'));assert.equal(p.protected_proof_refs[0].raw_sha256,e.canonical_card.provenance.raw_sha256);assert.equal(p.production_retention_hook_installed,false);
});
test('missing outcome ledger, UNKNOWN_SEND, latest source and incomplete reference graph each protect details',()=>{
 const a=retentionArgs(eventRecord());
 assert.ok(retentionDecision({...a,outcomes:[]}).reasons.some(x=>x.includes('UNFINISHED_OUTCOME')));
 assert.ok(retentionDecision({...a,outbox:[{key:'O1',status:'UNKNOWN_SEND'}]}).reasons.includes('UNRESOLVED_OUTBOX:O1'));
 assert.ok(retentionDecision({...a,latest_source:true}).reasons.includes('LATEST_NEEDED_SOURCE'));
 assert.ok(retentionDecision({...a,reference_graph_complete:false}).reasons.includes('REFERENCE_GRAPH_NOT_QUALIFIED'));
});
test('fully closed old nonlatest event only proposes detail expiry after all explicit final outcomes',()=>{
 const a=retentionArgs(eventRecord()),p=retentionDecision({...a,outcomes:a.outcomes.map(x=>({...x,status:'CENSORED_FINAL'}))});assert.equal(p.eligible_detail_expiry,true);assert.equal(p.protect_cards_anchors_statistics,true);assert.equal(p.SQL_executed,0);assert.equal(p.production_retention_hook_installed,false);
});
function weeklyCase(){
 const f=fixture({timeframe:'1d',offset:57600000}),c=detectClosed({...f,rules:{confirmation_timeframe:'1w'}}).events[0],d=TIMEFRAMES['1w'],offset=345600000,end=Math.ceil((c.first_known_ts+2*d-offset)/d)*d+offset;
 const b={start_ts:end-d,end_ts:end,timeframe:'1w',open:100,high:111,low:99,close:110,volume:100,raw_sha256:hash('CONTROLLED_WEEKLY')};
 const s={instrument:c.instrument,snapshot_id:'CONTROLLED:MONDAY',source_ts:end+10,received_ts:end+20,price:110,raw_sha256:b.raw_sha256,closed_candle:b};
 const grid={timeframe:'1w',alignment_offset_ms:offset,market_key:nativeMarketKey(c.instrument,native(c)),qualified:true,native_grid_ref:'CONTROLLED_WEEKLY_MONDAY_UTC'};
 return {c,s,grid,now:end+30};
}
test('COUNTEREXAMPLE dayoffset%week rejects valid separate Monday grid; explicit confirmation grid passes',()=>{
 const {c,s,grid,now}=weeklyCase(),m=capture(newMemory(),c,{watch_mode:'HISTORICAL_REVIEW'}).state;
 assert.throws(()=>observe(m,{event_id:c.event_id,snapshot:s,now_ts:now}),/CANDLE_GRID_INVALID/);
 const q=confirmationVerdict({event:c,native:native(c),snapshot:s,snapshot_native:native(c),grid,now_ts:now});assert.equal(q.status,'CLOSED_ABOVE');assert.equal(q.LONG,'CONFIRMED');assert.equal(q.SHORT,'REFUTED');assert.equal(q.native_alignment_offset_ms,345600000);assert.equal(q.entry_authorized,false);
});
test('no fallback from absent or wrong confirmation grid to event offset',()=>{
 const {c,s,grid,now}=weeklyCase(),args={event:c,native:native(c),snapshot:s,snapshot_native:native(c),grid,now_ts:now};
 assert.throws(()=>confirmationVerdict({...args,grid:undefined}),/NATIVE_CONFIRMATION_GRID/);assert.throws(()=>confirmationVerdict({...args,grid:{...grid,alignment_offset_ms:57600000}}),/CLOSED_NATIVE/);assert.throws(()=>confirmationVerdict({...args,grid:{...grid,qualified:false}}),/NATIVE_CONFIRMATION_GRID/);
});
test('late, future, wrong native price units and rawhash mismatch cannot confirm',()=>{
 const {c,s,grid,now}=weeklyCase(),a={event:c,native:native(c),snapshot:s,snapshot_native:native(c),grid,now_ts:now};
 assert.throws(()=>confirmationVerdict({...a,now_ts:now+600000}),/FRESH_CONFIRMATION/);
 assert.throws(()=>confirmationVerdict({...a,now_ts:s.source_ts-1}),/FRESH_CONFIRMATION/);
 assert.throws(()=>confirmationVerdict({...a,snapshot:{...s,instrument:{...s.instrument,price_unit:'OTHER'}}}),/NATIVE_PRICE/);
 assert.throws(()=>confirmationVerdict({...a,snapshot:{...s,raw_sha256:hash('DIFFERENT')}}),/CLOSED_NATIVE/);
});
