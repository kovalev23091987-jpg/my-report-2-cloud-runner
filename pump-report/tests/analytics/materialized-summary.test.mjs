import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaterializedSummary,foldOutcomeRecord,prepareOutcomeRecordEvent,foldPreparedOutcomeRecord,advanceWaveMaturity,dueMaturityWaves,readMaterializedSummary} from '../../analytics/materialized-summary.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {summarizeOutcomes} from '../../analytics/summary.mjs';
import {T,MINUTE} from './fixtures.mjs';

const H=4*60*MINUTE;
const scalar=['independent_waves','mature_waves','pending_waves','pending_known_hits','gapped_mature_waves','coverage_unknown_mature_waves','enclosing_no_hit_proof_mature_waves','origin_conflict_waves','outcome_conflict_waves','identity_conflict_waves'];
const objects=['outcomes','mature_outcomes','denominators','publication_counts','reason_counts'];
const projection=x=>Object.fromEntries([...scalar,...objects].map(k=>[k,x[k]]));
function record(id,{wave='W',status='UNKNOWN',recorded_ts=T+MINUTE,t0=T,pub='UNKNOWN',mode='AUTO',map_mode='NO_MAP',rules='R1',profile='P1',evidence='ARTIFICIAL',...other}={}){
  const origin={instrument_id:'ARTIFICIAL:H:I',asset_id:'ARTIFICIAL:H:A',wave_id:wave,signal_id:'SIGNAL:'+wave,t0,reference_price:100,rules_version:rules,profile_version:profile,mode,map_mode,evidence_class:evidence,ready:true};
  const outcome={signal_id:origin.signal_id,wave_id:wave,t0,reference_price:100,rules_version:rules,mode,map_mode:map_mode==='NO_MAP'?'WITHOUT_MAP':'WITH_MAP',target_price:110,deadline_ts:t0+H,status,
    hit_ts:status==='HIT'?t0+MINUTE:null,hit_interval:null,coverage:{complete:status==='MISS'},reasons:status==='UNKNOWN'?['HISTORY_PENDING']:[],drawdown_total_pct:null,drawdown_before_hit_pct:null,hit_after_invalidation:null};
  return {record_id:id,recorded_ts,origin,publication:{state:pub,message_id:pub==='SENT'?'123':null,receipt_ref:pub==='SENT'?'ARTIFICIAL_RECEIPT':null},outcome,...other};
}
function fixture(){
  let aggregate=createMaterializedSummary({materialization_id:'ARTIFICIAL_H',as_of_ts:T}),waves=new Map(),rows=[];
  return {get aggregate(){return aggregate;},get waves(){return waves;},get rows(){return rows;},
    async apply(r,at=r.recorded_ts){const k=JSON.stringify([r.origin.instrument_id,r.origin.wave_id]),wave=waves.get(k),result=await foldOutcomeRecord({aggregate,wave,event:{kind:'OUTCOME_RECORD',event_id:r.record_id,revision:(wave?.event_revision??0)+1,record:r},as_of_ts:at});
      if(result.write_required){aggregate=result.aggregate;waves.set(k,result.wave);}rows.push(structuredClone(r));return result;},
    mature(at){for(const [key,wave] of waves){const result=advanceWaveMaturity({aggregate,wave,as_of_ts:at});if(result.write_required){aggregate=result.aggregate;waves.set(key,result.wave);}}},
    verify(at){const a=readMaterializedSummary(aggregate,{as_of_ts:at}),b=summarizeOutcomes(rows,{as_of_ts:at});assert.equal(a.maturity_current,true);assert.deepEqual(projection(a),projection(b));
      const cohorts=x=>x.cohorts.map(c=>({key:c.cohort_key,...projection(c)}));assert.deepEqual(cohorts(a),cohorts(b));assert.equal(a.probability.value_pct,null);return a;}};
}

test('H01 forty-two independent waves have exact materialized counters without passing old records to the query',async()=>{
  const f=fixture();for(let i=0;i<42;i++)await f.apply(record('R'+i,{wave:'W'+i,status:i%2?'HIT':'MISS',recorded_ts:T+H,pub:'SENT'}));
  const q=f.verify(T+H);assert.equal(q.independent_waves,42);assert.equal(f.aggregate.pending_deadlines&&Object.keys(f.aggregate.pending_deadlines).length,0);assert.equal(Object.hasOwn(f.aggregate,'records'),false);assert.equal(q.publication_allowed,false);
});
test('H02 exact event replay is a no-op and cannot increment counters or revisions twice',async()=>{
  const f=fixture(),r=record('A');await f.apply(r);const revision=f.aggregate.revision,result=await f.apply(r);assert.equal(result.status,'DUPLICATE_EVENT');assert.equal(result.write_required,false);assert.equal(f.aggregate.revision,revision);f.verify(T+MINUTE);
});
test('H03 UNKNOWN becomes HIT and a later UNKNOWN cannot erase confirmed hit or re-count its wave',async()=>{
  const f=fixture();await f.apply(record('U'));await f.apply(record('H',{status:'HIT',recorded_ts:T+2*MINUTE}));await f.apply(record('LATE_U',{recorded_ts:T+3*MINUTE}));const q=f.verify(T+3*MINUTE);assert.equal(q.independent_waves,1);assert.equal(q.outcomes.hit,1);assert.equal(q.pending_known_hits,1);
});
test('H04 early HIT stays pending until explicit due transition; query flags stale maturity honestly',async()=>{
  const f=fixture();await f.apply(record('H',{status:'HIT',recorded_ts:T+MINUTE}));const stale=readMaterializedSummary(f.aggregate,{as_of_ts:T+H});assert.equal(stale.status,'MATURITY_UPDATES_REQUIRED');assert.equal(stale.pending_clock_transitions,1);assert.equal(stale.mature_waves,0);
  assert.equal(dueMaturityWaves(f.aggregate,{as_of_ts:T+H}).length,1);f.mature(T+H);const q=f.verify(T+H);assert.equal(q.mature_outcomes.hit,1);assert.equal(q.pending_known_hits,0);assert.equal(dueMaturityWaves(f.aggregate,{as_of_ts:T+H}).length,0);
});
test('H05 late receipt moves exactly one original wave from UNKNOWN to SENT cohort',async()=>{
  const f=fixture();await f.apply(record('U'));const r=record('S',{pub:'SENT',recorded_ts:T+2*MINUTE});await f.apply(r);const q=f.verify(T+2*MINUTE);assert.deepEqual(q.publication_counts,{sent:1,unsent:0,unknown:0});assert.equal(q.cohorts.length,1);assert.equal(q.cohorts[0].publication,'SENT');
});
test('H06 a later UNKNOWN receipt state cannot downgrade a receipt-backed SENT',async()=>{
  const f=fixture();await f.apply(record('S',{pub:'SENT'}));await f.apply(record('U',{recorded_ts:T+2*MINUTE}));assert.equal(f.verify(T+2*MINUTE).publication_counts.sent,1);
});
test('H07 two raw cards of one wave retain the selected original map/mode instead of becoming two successes',async()=>{
  const f=fixture();await f.apply(record('CARD_A',{pub:'SENT',card_id:'A'}));await f.apply(record('CARD_B',{pub:'SENT',recorded_ts:T+2*MINUTE,card_id:'B',raw_card_map_mode:'MAP'}));const q=f.verify(T+2*MINUTE);assert.equal(q.independent_waves,1);assert.equal(q.cohorts[0].map_mode,'NO_MAP');
});
test('H08 all mode/delivery/map/rules/profile/evidence cohorts match batch counts',async()=>{
  const f=fixture();let i=0;for(const mode of ['AUTO','MANUAL'])for(const pub of ['SENT','UNSENT','UNKNOWN'])for(const map_mode of ['NO_MAP','PARTIAL_MAP','MAP'])for(const version of [1,2]){
    const id='C'+i++;await f.apply(record(id,{wave:id,mode,pub,map_mode,rules:'R'+version,profile:'P'+version,evidence:version===1?'ARTIFICIAL':'BACKFILLED',status:i%3?'MISS':'UNKNOWN',recorded_ts:T+H}));}
  const q=f.verify(T+H);assert.equal(q.cohorts.length,36);assert.equal(q.independent_waves,36);
});
test('H09 gapped HIT and enclosing-bar MISS preserve distinct coverage and unknown adverse data',async()=>{
  const f=fixture(),hit=record('H',{wave:'H',status:'HIT',recorded_ts:T+H});hit.outcome.coverage.complete=false;
  const miss=record('M',{wave:'M',status:'MISS',recorded_ts:T+H});miss.outcome.coverage={complete:false,no_hit_period_covered:true,no_hit_basis:'ENCLOSING_CLOSED_MINUTE_BARS_ALL_HIGHS_BELOW_TARGET'};
  await f.apply(hit);await f.apply(miss);const q=f.verify(T+H);assert.equal(q.gapped_mature_waves,1);assert.equal(q.enclosing_no_hit_proof_mature_waves,1);assert.equal(q.adverse.total_drawdown_unknown,2);
});
test('H10 contradictory HIT/MISS censors the original wave just like the batch oracle',async()=>{
  const f=fixture();await f.apply(record('M',{status:'MISS',recorded_ts:T+H}));await f.apply(record('H',{status:'HIT',recorded_ts:T+H+1}));const q=f.verify(T+H+1);assert.equal(q.outcomes.unknown,1);assert.equal(q.outcome_conflict_waves,1);assert.equal(q.reason_counts.HIT_MISS_CONFLICT,1);
});
test('H11 invalid later targets retain issues without erasing an earlier valid HIT',async()=>{
  const f=fixture();await f.apply(record('H',{status:'HIT'}));const bad=record('BAD',{status:'HIT',recorded_ts:T+2*MINUTE});bad.outcome.target_price=120;await f.apply(bad);
  const bad2=record('BAD2',{recorded_ts:T+3*MINUTE});bad2.outcome.map_mode='WITH_MAP';await f.apply(bad2);const q=f.verify(T+3*MINUTE);assert.equal(q.outcomes.hit,1);assert.equal(q.reason_counts.OUTCOME_TARGET_OR_HORIZON_MISMATCH,1);assert.equal(q.reason_counts.OUTCOME_MAP_MODE_MISMATCH,1);
});
test('H12 P0, t0 and original map cannot be rewritten; rejected protocol events leave state untouched',async()=>{
  const f=fixture();await f.apply(record('A'));const before=structuredClone(f.aggregate),r=record('B',{recorded_ts:T+2*MINUTE});r.origin.reference_price=99;
  await assert.rejects(()=>f.apply(r),/IMMUTABLE_WAVE_ORIGIN/);assert.deepEqual(f.aggregate,before);
  const changed=record('C',{recorded_ts:T+2*MINUTE,map_mode:'MAP'});await assert.rejects(()=>f.apply(changed),/IMMUTABLE_WAVE_ORIGIN/);
});
test('H13 verified instrument-to-asset conflicts stop reconciliation before applying any delta',async()=>{
  const f=fixture();await f.apply(record('A'));const r=record('B',{wave:'B'});r.origin.asset_id='OTHER';const before=structuredClone(f.aggregate);await assert.rejects(()=>f.apply(r),/INSTRUMENT_ASSET_CONFLICT/);assert.deepEqual(f.aggregate,before);
});
test('H14 replaying a record ID with changed bytes is rejected rather than silently replaced',async()=>{
  const f=fixture();await f.apply(record('A'));const r=record('A');r.outcome.reasons=['CHANGED'];const before=structuredClone(f.aggregate);await assert.rejects(()=>f.apply(r),/IMMUTABLE_RECORD_ID_CONFLICT/);assert.deepEqual(f.aggregate,before);
});
test('H15 sequence gaps, backwards clocks and mixed materializations cannot corrupt counters',async()=>{
  const f=fixture();await f.apply(record('A'));const wave=[...f.waves.values()][0],r=record('B',{recorded_ts:T+2*MINUTE});
  await assert.rejects(()=>foldOutcomeRecord({aggregate:f.aggregate,wave,event:{kind:'OUTCOME_RECORD',event_id:'B',revision:4,record:r},as_of_ts:T+2*MINUTE}),/REVISION_OR_CLOCK/);
  assert.throws(()=>readMaterializedSummary(f.aggregate,{as_of_ts:T}),/CLOCK/);const wrong=structuredClone(wave);wrong.materialization_id='OTHER';assert.throws(()=>advanceWaveMaturity({aggregate:f.aggregate,wave:wrong,as_of_ts:T+H}),/MATERIALIZATION_OR_CLOCK/);
});
test('H16 DELIVERY_DIAGNOSTIC SENT239 is ignored with no origin, wave, outcome or counter',async()=>{
  const aggregate=createMaterializedSummary({materialization_id:'DIAGNOSTIC_TEST',as_of_ts:T});const result=await foldOutcomeRecord({aggregate,event:{kind:'DELIVERY_DIAGNOSTIC',message_id:239},as_of_ts:T});
  assert.equal(result.status,'IGNORED_DELIVERY_DIAGNOSTIC');assert.equal(result.wave,null);assert.equal(result.write_required,false);assert.equal(readMaterializedSummary(result.aggregate,{as_of_ts:T}).independent_waves,0);
});
test('H17 serialize/restore aggregate and a single compact wave then continue without prior observations',async()=>{
  const f=fixture();await f.apply(record('U'));const aggregate=JSON.parse(JSON.stringify(f.aggregate)),wave=JSON.parse(JSON.stringify([...f.waves.values()][0])),r=record('H',{status:'HIT',recorded_ts:T+2*MINUTE});
  const result=await foldOutcomeRecord({aggregate,wave,event:{kind:'OUTCOME_RECORD',event_id:'H',revision:2,record:r},as_of_ts:T+2*MINUTE});assert.equal(readMaterializedSummary(result.aggregate,{as_of_ts:T+2*MINUTE}).outcomes.hit,1);assert.equal(result.expected.aggregate_revision,1);assert.equal(result.expected.wave_state_revision,1);
});
test('H18 adverse values remain null for gaps and materialize known drawdown/cancellation facts without profit claims',async()=>{
  const f=fixture();await f.apply(record('U'));const r=record('H',{status:'HIT',recorded_ts:T+H});r.outcome.coverage.complete=true;r.outcome.drawdown_total_pct=12;r.outcome.drawdown_before_hit_pct=4;r.outcome.hit_after_invalidation=true;
  await f.apply(r);const q=f.verify(T+H),wave=[...f.waves.values()][0];assert.equal(q.adverse.total_drawdown_known,1);assert.equal(q.adverse.total_drawdown_unknown,0);assert.equal(q.adverse.hit_after_invalidation_yes,1);assert.equal(wave.contribution.adverse.drawdown_total_pct,12);assert.equal(wave.contribution.adverse.user_profit,null);
});
test('H19 due transitions page explicitly and repeated mature clock ticks are idempotent',async()=>{
  const f=fixture();for(let i=0;i<7;i++)await f.apply(record('P'+i,{wave:'P'+i}));assert.equal(dueMaturityWaves(f.aggregate,{as_of_ts:T+H,limit:5}).length,5);
  f.mature(T+H);const revision=f.aggregate.revision;f.mature(T+H+MINUTE);assert.equal(f.aggregate.revision,revision);assert.equal(f.verify(T+H+MINUTE).mature_waves,7);
});
test('H20 a hundred updates need only compact representative observations for the next fold',async()=>{
  const f=fixture();for(let i=0;i<100;i++)await f.apply(record('U'+i,{recorded_ts:T+MINUTE+i}));const wave=[...f.waves.values()][0];assert.equal(Object.keys(wave.record_digests).length,100);assert.equal(Object.hasOwn(wave,'records'),false);assert.equal(Object.keys(wave.invalid).length,0);assert.equal(f.verify(T+MINUTE+99).independent_waves,1);
});
test('H21 immutable input objects remain detached from the returned derived state',async()=>{
  const f=fixture(),r=record('U'),before=structuredClone(r),result=await f.apply(r);assert.deepEqual(r,before);r.origin.reference_price=999;r.outcome.reasons.push('MUTATED_CALLER');assert.equal(result.wave.origin.reference_price,100);assert.deepEqual(result.wave.last.outcome.reasons,['HISTORY_PENDING']);
});
test('H22 incomplete path cannot materialize precise total drawdown or intrabar pre-hit drawdown from a stray scalar',async()=>{
  const f=fixture(),r=record('GAP',{status:'HIT',recorded_ts:T+H});r.outcome.drawdown_total_pct=12;r.outcome.drawdown_before_hit_pct=4;r.outcome.hit_ts=null;r.outcome.hit_interval={start_ts:T,end_ts:T+MINUTE};
  await f.apply(r);const q=f.verify(T+H),wave=[...f.waves.values()][0];assert.equal(q.adverse.total_drawdown_known,0);assert.equal(q.adverse.total_drawdown_unknown,1);assert.equal(wave.contribution.adverse.drawdown_before_hit_pct,null);assert.equal(wave.hit.outcome.drawdown_total_pct,12,'original evidence retained, not overwritten');
});
test('H23 pre-send ERROR/FAILED is not a normalized statistical UNKNOWN signal',async()=>{
  const f=fixture(),r=record('FAILED');r.publication={state:'FAILED'};await assert.rejects(()=>f.apply(r),/NORMALIZED_PUBLICATION_STATE_REQUIRED/);assert.equal(f.aggregate.counters.independent_waves,0);
});
test('H24 maturity state revision is separate from source journal event revision',async()=>{
  const f=fixture();await f.apply(record('U'));f.mature(T+H);const before=[...f.waves.values()][0];assert.equal(before.event_revision,1);assert.equal(before.state_revision,2);
  const r=record('LATE_HIT',{status:'HIT',recorded_ts:T+H+1,pub:'SENT'}),result=await f.apply(r);assert.equal(result.wave.event_revision,2);assert.equal(result.wave.state_revision,3);assert.equal(f.verify(T+H+1).mature_outcomes.hit,1);
});
test('H25 prepared event folds synchronously through the actual ROOT MemoryStore.atomicPair and repeats safely',async()=>{
  const store=new MemoryStore(),r=record('PAIR',{status:'HIT'}),prepared_event=await prepareOutcomeRecordEvent({kind:'OUTCOME_RECORD',event_id:r.record_id,revision:1,record:r});
  const apply=()=>store.atomicPair(['H:wave','H:aggregate'],([wave,aggregate])=>{
    const folded=foldPreparedOutcomeRecord({aggregate:aggregate??createMaterializedSummary({materialization_id:'H_PAIR',as_of_ts:T}),wave,prepared_event,as_of_ts:T+MINUTE});
    assert.equal(folded instanceof Promise,false);return {states:[folded.wave,folded.aggregate],result:folded.status};
  });
  assert.equal(await apply(),'APPLIED');assert.equal(await apply(),'DUPLICATE_EVENT');const aggregate=await store.get('H:aggregate');assert.equal(readMaterializedSummary(aggregate,{as_of_ts:T+MINUTE}).independent_waves,1);
});
test('H26 prepared hash envelope is immutable/transient and cannot be forged or persisted as an event authority',async()=>{
  const r=record('P'),prepared_event=await prepareOutcomeRecordEvent({kind:'OUTCOME_RECORD',event_id:'P',revision:1,record:r});r.origin.reference_price=999;
  const aggregate=createMaterializedSummary({materialization_id:'PREPARED',as_of_ts:T});const folded=foldPreparedOutcomeRecord({aggregate,prepared_event,as_of_ts:T+MINUTE});assert.equal(folded.wave.origin.reference_price,100);
  assert.throws(()=>foldPreparedOutcomeRecord({aggregate,prepared_event:JSON.parse(JSON.stringify(prepared_event)),as_of_ts:T+MINUTE}),/PREPARED_EVENT/);
});
test('H27 atomicPair may assign the next unique-event revision inside CAS without a new source sequence column',async()=>{
  const store=new MemoryStore();
  async function apply(record){const prepared_event=await prepareOutcomeRecordEvent({kind:'OUTCOME_RECORD',event_id:record.record_id,record});return store.atomicPair(['AUTO:wave','AUTO:aggregate'],([wave,aggregate])=>{
    const folded=foldPreparedOutcomeRecord({aggregate:aggregate??createMaterializedSummary({materialization_id:'AUTO_REVISION',as_of_ts:T}),wave,prepared_event,as_of_ts:record.recorded_ts});return {states:[folded.wave,folded.aggregate],result:folded};
  });}
  const a=record('A'),b=record('B',{status:'HIT',recorded_ts:T+2*MINUTE});await apply(a);await apply(b);const repeated=await apply(b);assert.equal(repeated.status,'DUPLICATE_EVENT');assert.equal(repeated.wave.event_revision,2);assert.equal(repeated.aggregate.records_applied,2);
});
