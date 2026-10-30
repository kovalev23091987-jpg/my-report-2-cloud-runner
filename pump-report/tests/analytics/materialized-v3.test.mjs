import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createMaterializedSummary,createMaterializedSummaryV3,MATERIALIZED_V3_VERSION,prepareOutcomeRecordEvent,prepareMaterializedRecordReceiptV3,foldPreparedOutcomeRecordV3,advanceWaveMaturityV3,acknowledgeMaterializedMaturityV3,readMaterializedSummaryV3} from '../../analytics/materialized-summary.mjs';
import {summarizeOutcomes} from '../../analytics/summary.mjs';
import {plusTenPrice} from '../../analytics/math.mjs';

const T=1800000000000,M=60000,H=3600000,output=new URL('../../handoffs/analytics/package-x2/',import.meta.url),clone=structuredClone;
const save=async(name,j)=>writeFile(new URL(name,output),JSON.stringify({evidence:'ARTIFICIAL_ANALYTIC_CONSUMER_NOT_RUNTIME_NATIVE_ACCEPTANCE',...j},null,2)+'\n');
const key=r=>JSON.stringify([r.origin.instrument_id,r.origin.wave_id]);
function row(id,{wave='A',instrument='I_'+wave,asset='ASSET_'+instrument,t0=T,recorded_ts=T+M,mode='AUTO',map_mode='NO_MAP',pub='UNSENT',status=null,complete=false}={}){
  const origin={instrument_id:'ARTIFICIAL:'+instrument,asset_id:'ARTIFICIAL:'+asset,wave_id:'ARTIFICIAL:W_'+wave,signal_id:'ARTIFICIAL:S_'+wave,t0,reference_price:100,rules_version:'ARTIFICIAL_RULES',profile_version:'ARTIFICIAL_PROFILE',mode,map_mode,evidence_class:'ARTIFICIAL',run_purpose:'PRODUCTION',ready:true};
  const outcome=status?{signal_id:origin.signal_id,wave_id:origin.wave_id,t0,reference_price:100,rules_version:origin.rules_version,mode,map_mode:map_mode==='NO_MAP'?'WITHOUT_MAP':'WITH_MAP',target_price:plusTenPrice(100),deadline_ts:t0+4*H,status,hit_ts:status==='HIT'?t0+M:null,hit_interval:null,drawdown_total_pct:complete?7:null,drawdown_before_hit_pct:status==='HIT'?5:null,hit_after_invalidation:status==='HIT'?false:null,coverage:{complete},reasons:status==='UNKNOWN'?['INSUFFICIENT_HISTORY_COVERAGE']:[]}:null;
  return {record_id:'ARTIFICIAL:R_'+id,recorded_ts,origin,publication:pub==='SENT'?{state:'SENT',message_id:'999',receipt_ref:'pump:card:ARTIFICIAL_'+wave+'#receipt'}:{state:pub},outcome};
}
function harness(id='ARTIFICIAL_X2'){
  return {a:createMaterializedSummaryV3({materialization_id:id,as_of_ts:T}),waves:new Map(),receipts:new Map(),bindings:new Map(),refs:new Map(),ordered:[],
    async prepare(r,source_seq=this.a.source_cursor+1){
      const prepared_event=await prepareOutcomeRecordEvent({kind:'OUTCOME_RECORD',event_id:r.record_id,record:r});
      const receipt=prepareMaterializedRecordReceiptV3({materialization_id:this.a.materialization_id,prepared_event,source_seq});
      if(!this.receipts.has(r.record_id))this.receipts.set(r.record_id,clone(receipt));
      if(!this.bindings.has(r.origin.instrument_id))this.bindings.set(r.origin.instrument_id,{schema:'pump-materialized-instrument-binding-v3-20261025',materialization_id:this.a.materialization_id,instrument_id:r.origin.instrument_id,asset_id:r.origin.asset_id});
      return {aggregate:this.a,wave:this.waves.get(key(r))??null,prepared_event,source_seq,record_receipt:clone(this.receipts.get(r.record_id)),instrument_binding:clone(this.bindings.get(r.origin.instrument_id))};
    },
    commit(result){if(result.write_required){this.a=result.aggregate;if(result.wave)this.waves.set(result.wave.wave_key,result.wave);}return result;},
    queueWrite(){const p=this.a.maturity_pending;if(!p)return null;const ref={schema:'pump-materialized-maturity-reference-v3-20261025',materialization_id:p.materialization_id,wave_key:p.wave_key,wave_state_revision:p.wave_state_revision,active:p.active,deadline_ts:p.deadline_ts,transition_id:p.transition_id};this.refs.set(p.wave_key,clone(ref));if(!this.ordered.some(x=>x.transition_id===ref.transition_id))this.ordered.push(clone(ref));return clone(this.refs.get(p.wave_key));},
    ack(at){const p=this.a.maturity_pending;if(!p)return this.commit(acknowledgeMaterializedMaturityV3({aggregate:this.a,as_of_ts:at}));return this.commit(acknowledgeMaterializedMaturityV3({aggregate:this.a,maturity_reference:clone(this.refs.get(p.wave_key)),as_of_ts:at}));},
    async apply(r,at=r.recorded_ts,{ack=true}={}){const args=await this.prepare(r),result=this.commit(foldPreparedOutcomeRecordV3({...args,as_of_ts:at}));if(result.write_required&&ack){this.queueWrite();this.ack(at);}return result;},
    boundary(at,due_count=0,extra={}){return {materialization_id:this.a.materialization_id,aggregate_revision:this.a.revision,as_of_ts:at,complete:true,has_more:false,due_count,source_ref:'ARTIFICIAL_CURRENT_QUEUE_READBACK',...extra};}
  };
}
const counterFields=['independent_waves','mature_waves','pending_waves','pending_known_hits','gapped_mature_waves','coverage_unknown_mature_waves','enclosing_no_hit_proof_mature_waves','origin_conflict_waves','outcome_conflict_waves','identity_conflict_waves','outcomes','mature_outcomes','denominators','publication_counts','reason_counts'];
function parity(h,rows,at){
  const due=[...h.waves.values()].filter(w=>w.contribution.counters.pending_waves&&w.origin.t0+4*H<=at).length;
  const view=readMaterializedSummaryV3(h.a,{as_of_ts:at,maturity_boundary:h.boundary(at,due)}),oracle=summarizeOutcomes(rows,{as_of_ts:at});
  for(const k of counterFields)assert.deepEqual(view[k],oracle[k],k);
  const choose=x=>Object.fromEntries(['cohort_key','mode','publication','map_mode','rules_version','profile_version','evidence_class',...counterFields].map(k=>[k,x[k]]));
  assert.deepEqual(view.cohorts.map(choose),oracle.cohorts.map(choose));return view;
}

test('X201 actual analytic V3 fold pins external receipts, preserves scalar contribution and blocks until queue readback ack',async()=>{
  const h=harness(),r=row('0001'),before=clone(r),args=await h.prepare(r);
  assert.equal(h.a.source_cursor,0);assert.equal(h.receipts.size,1);
  const result=h.commit(foldPreparedOutcomeRecordV3({...args,as_of_ts:T+M}));assert.equal(result.status,'APPLIED');assert.equal(h.a.source_cursor,1);assert.ok(h.a.maturity_pending);
  assert.equal(h.a.counters.independent_waves,1);assert.equal(readMaterializedSummaryV3(h.a,{as_of_ts:T+M}).status,'MATURITY_QUEUE_SYNC_REQUIRED');
  h.queueWrite();h.ack(T+M);assert.equal(h.a.maturity_pending,null);assert.equal(h.refs.get(key(r)).active,true);
  assert.equal(readMaterializedSummaryV3(h.a,{as_of_ts:T+M}).status,'MATURITY_BOUNDARY_REQUIRED');assert.equal(parity(h,[r],T+M).status,'CURRENT');
  for(const k of ['pending_deadlines','instrument_assets'])assert.equal(Object.hasOwn(h.a,k),false);assert.equal(Object.hasOwn(h.waves.get(key(r)),'record_digests'),false);assert.deepEqual(r,before);
  await save('single-record-consumer.json',{aggregate:h.a,wave:h.waves.get(key(r)),receipt:[...h.receipts.values()][0],queue_ref:h.refs.get(key(r))});
});

test('X202 exact replay is no-write while same-ID fingerprint ordinal origin and identity contradictions fail before counters change',async()=>{
  const h=harness(),r=row('REPLAY');await h.apply(r);const frozen=clone(h.a),args=await h.prepare(r,1),dup=foldPreparedOutcomeRecordV3({...args,as_of_ts:T+M+1});assert.equal(dup.status,'REPLAY_BEHIND_COMMITTED_CURSOR');assert.equal(dup.write_required,false);
  for(const mutate of [x=>x.recorded_ts++,x=>x.publication.state='UNKNOWN',x=>x.origin.reference_price++]){const changed=clone(r);mutate(changed);const p=await h.prepare(changed,1);assert.throws(()=>foldPreparedOutcomeRecordV3({...p,as_of_ts:T+M+2}),/RECEIPT_CONFLICT/);}
  const next=row('NEXT',{recorded_ts:T+2*M}),p=await h.prepare(next,2);assert.throws(()=>foldPreparedOutcomeRecordV3({...p,record_receipt:null,as_of_ts:T+2*M}),/RECEIPT_CONFLICT/);
  const gap=await h.prepare(row('GAP',{recorded_ts:T+2*M}),3);assert.throws(()=>foldPreparedOutcomeRecordV3({...gap,as_of_ts:T+2*M}),/SEQUENCE_GAP/);
  const origin=row('ORIGIN',{recorded_ts:T+2*M});origin.origin.reference_price=101;const op=await h.prepare(origin,2);assert.throws(()=>foldPreparedOutcomeRecordV3({...op,as_of_ts:T+2*M}),/ORIGIN_CONFLICT/);
  const identity=row('IDENTITY',{wave:'OTHER',instrument:'I_A',asset:'OTHER',recorded_ts:T+2*M}),ip=await h.prepare(identity,2);assert.throws(()=>foldPreparedOutcomeRecordV3({...ip,as_of_ts:T+2*M}),/INSTRUMENT_ASSET_CONFLICT/);
  assert.deepEqual(h.a,frozen);await save('replay-conflict-boundaries.json',{result:'PASS_NEW_X2_ONLY',cases:['exact-replay','changed-recorded-ts','changed-publication','changed-P0','missing-receipt','sequence-gap','immutable-origin','instrument-asset'],aggregate:h.a});
});

test('X203 simulated persisted restart before queue write and after queue write recovers the one exact intent without double fold',async()=>{
  const h=harness(),r=row('RECOVERY');await h.apply(r,T+M,{ack:false});const pending=clone(h.a.maturity_pending);
  h.a=clone(h.a);h.waves=new Map([...h.waves].map(([k,v])=>[k,clone(v)]));const next=await h.prepare(row('BLOCKED',{recorded_ts:T+2*M}));assert.throws(()=>foldPreparedOutcomeRecordV3({...next,as_of_ts:T+2*M}),/PENDING_QUEUE_INTENT/);
  assert.throws(()=>acknowledgeMaterializedMaturityV3({aggregate:h.a,maturity_reference:{transition_id:'WRONG'},as_of_ts:T+M}),/QUEUE_READBACK_MISMATCH/);
  const firstRef=h.queueWrite(),secondRef=h.queueWrite();assert.deepEqual(firstRef,secondRef);assert.equal(h.ordered.length,1);assert.deepEqual(h.a.maturity_pending,pending);
  h.a=clone(h.a);h.ack(T+M);assert.equal(h.a.maturity_pending,null);assert.equal(h.a.counters.independent_waves,1);assert.equal(h.ack(T+M).status,'NO_QUEUE_INTENT');
  const replay=await h.prepare(r,1);assert.equal(foldPreparedOutcomeRecordV3({...replay,as_of_ts:T+M}).write_required,false);await save('intent-recovery.json',{pending_before_recovery:pending,persisted_queue_ref:firstRef,aggregate_after_ack:h.a,actual_runtime_acceptance:false});
});

test('X204 maturity reuses original four-hour anchor, rejects stale reference and requires deactivation ack before CURRENT',async()=>{
  const h=harness(),r=row('MATURE');await h.apply(r);const ref=clone(h.refs.get(key(r))),w=h.waves.get(key(r));
  const early=advanceWaveMaturityV3({aggregate:h.a,wave:w,as_of_ts:T+2*M,maturity_reference:ref});assert.equal(early.status,'NO_CLOCK_CHANGE');assert.equal(early.write_required,false);
  assert.throws(()=>advanceWaveMaturityV3({aggregate:h.a,wave:w,as_of_ts:T+4*H,maturity_reference:{...ref,wave_state_revision:ref.wave_state_revision+1}}),/STALE_MATURITY_REFERENCE/);
  const at=T+4*H+M;assert.equal(readMaterializedSummaryV3(h.a,{as_of_ts:at,maturity_boundary:h.boundary(at,1)}).status,'MATURITY_UPDATES_REQUIRED');
  const matured=h.commit(advanceWaveMaturityV3({aggregate:h.a,wave:w,as_of_ts:at,maturity_reference:ref}));assert.equal(matured.status,'MATURED');assert.equal(h.a.counters.pending_waves,0);assert.equal(h.a.maturity_pending.active,false);assert.equal(h.a.maturity_pending.deadline_ts,null);
  assert.equal(readMaterializedSummaryV3(h.a,{as_of_ts:at}).status,'MATURITY_QUEUE_SYNC_REQUIRED');h.queueWrite();h.ack(at);
  assert.equal(h.refs.get(key(r)).active,false);assert.equal(h.ordered.length,2);assert.equal(h.ordered[0].active,true);assert.equal(parity(h,[r],at).mature_outcomes.unknown,1);
  await save('maturity-transition.json',{aggregate:h.a,wave:h.waves.get(key(r)),ordered_references_retained:h.ordered});
});

test('X205 one new mixed corpus keeps AUTO MANUAL publication map cohorts and HIT MISS UNKNOWN scalar parity with raw summary',async()=>{
  const h=harness(),rows=[row('A0'),row('B0',{wave:'B',mode:'MANUAL',map_mode:'MAP',recorded_ts:T+2*M}),row('C0',{wave:'C',map_mode:'PARTIAL_MAP',recorded_ts:T+2*M}),row('A1',{status:'HIT',pub:'SENT',recorded_ts:T+3*M}),row('B1',{wave:'B',mode:'MANUAL',map_mode:'MAP',status:'MISS',complete:true,recorded_ts:T+4*H+5*M}),row('C1',{wave:'C',map_mode:'PARTIAL_MAP',status:'UNKNOWN',recorded_ts:T+4*H+6*M})];
  for(const r of rows)await h.apply(r);
  const at=T+4*H+7*M,w=h.waves.get(key(rows[0]));h.commit(advanceWaveMaturityV3({aggregate:h.a,wave:w,maturity_reference:clone(h.refs.get(w.wave_key)),as_of_ts:at}));h.queueWrite();h.ack(at);
  const view=parity(h,rows,at);assert.deepEqual(view.outcomes,{hit:1,miss:1,unknown:1});assert.equal(view.cohorts.length,3);assert.equal(h.waves.get(key(rows[4])).contribution.adverse.drawdown_total_pct,7);assert.equal(h.waves.get(key(rows[3])).contribution.adverse.drawdown_before_hit_pct,5);
  assert.equal(view.success_rate_pct,null);assert.equal(view.probability.value_pct,null);assert.equal(view.calibration_validated,false);assert.equal(view.delete_allowed,false);
  await save('mixed-corpus-parity.json',{view,raw_records:rows.length,scalar_cohorts:h.a.cohorts});
});

test('X206 contradictory HIT and MISS retain UNKNOWN conflict and immutable P0 t0 rules instead of selecting a win',async()=>{
  const h=harness(),a=row('HIT',{status:'HIT',pub:'SENT'}),b=row('MISS',{status:'MISS',pub:'SENT',complete:true,recorded_ts:T+4*H+M});await h.apply(a);await h.apply(b);
  const view=parity(h,[a,b],T+4*H+M);assert.equal(view.outcomes.unknown,1);assert.equal(view.outcome_conflict_waves,1);assert.equal(h.waves.get(key(a)).contribution.adverse.drawdown_total_pct,null);
  for(const [field,value]of [['t0',T+1],['rules_version','OTHER'],['reference_price',101]]){const r=row('CONFLICT_'+field,{pub:'SENT',recorded_ts:T+4*H+2*M});r.origin[field]=value;const p=await h.prepare(r,3);assert.throws(()=>foldPreparedOutcomeRecordV3({...p,as_of_ts:T+4*H+2*M}),/ORIGIN_CONFLICT/);}
  await save('contradictory-outcomes.json',{view,wave:h.waves.get(key(a))});
});

test('X207 partial inconsistent stale or overflowing maturity boundary never becomes CURRENT including empty aggregate',async()=>{
  const h=harness(),r=row('BOUNDARY');await h.apply(r);const at=T+2*M;
  for(const b of [h.boundary(at,0,{complete:false}),h.boundary(at,0,{has_more:true}),h.boundary(at,0,{aggregate_revision:h.a.revision-1}),h.boundary(at+1,0),h.boundary(at,0,{source_ref:''})]){const v=readMaterializedSummaryV3(h.a,{as_of_ts:at,maturity_boundary:b});assert.notEqual(v.status,'CURRENT');assert.equal(v.maturity_current,false);assert.equal(v.pending_clock_transitions,null);}
  assert.equal(readMaterializedSummaryV3(h.a,{as_of_ts:at,maturity_boundary:h.boundary(at,2)}).status,'MATURITY_BOUNDARY_CONFLICT');
  const empty=harness('EMPTY');assert.equal(readMaterializedSummaryV3(empty.a,{as_of_ts:T}).status,'CURRENT');
  const partial=readMaterializedSummaryV3(empty.a,{as_of_ts:T,maturity_boundary:empty.boundary(T,0,{complete:false})});assert.equal(partial.status,'MATURITY_BOUNDARY_REQUIRED');
  const conflict=readMaterializedSummaryV3(empty.a,{as_of_ts:T,maturity_boundary:empty.boundary(T,1)});assert.equal(conflict.status,'MATURITY_BOUNDARY_CONFLICT');await save('boundary-static-fix-proof.json',{partial_empty:partial,contradictory_empty:conflict,proposal_not_executed:true});
});

test('X208 one hundred immutable receipts leave fixed inline wave/global fields and keep all original references without TTL',async()=>{
  const h=harness(),rows=[];let firstWaveFields,firstAggregateFields;
  for(let i=0;i<100;i++){const r=row('GROW_'+String(i).padStart(4,'0'),{recorded_ts:T+M+i});rows.push(r);await h.apply(r);const w=h.waves.get(key(r));if(!i){firstWaveFields=Object.keys(w).sort();firstAggregateFields=Object.keys(h.a).sort();}assert.deepEqual(Object.keys(w).sort(),firstWaveFields);assert.deepEqual(Object.keys(h.a).sort(),firstAggregateFields);assert.equal(Object.hasOwn(w,'record_digests'),false);assert.equal(Object.hasOwn(h.a,'pending_deadlines'),false);assert.equal(Object.hasOwn(h.a,'instrument_assets'),false);for(const c of Object.values(h.a.cohorts))assert.equal(Object.hasOwn(c,'wave_keys'),false);}
  assert.equal(h.receipts.size,100);assert.equal(h.ordered.length,100);assert.equal(h.waves.size,1);assert.equal(h.a.source_cursor,100);assert.equal(h.a.counters.independent_waves,1);assert.equal(parity(h,rows,T+M+100).status,'CURRENT');
  const inlineIds=new Set(JSON.stringify(h.waves.get(key(rows[0]))).match(/ARTIFICIAL:R_GROW_[0-9]+/g));assert.ok(inlineIds.size<=2);
  await save('bounded-inline-state.json',{records:100,external_receipts:h.receipts.size,ordered_refs_retained:h.ordered.length,inline_distinct_witness_record_ids:[...inlineIds],wave_fields:firstWaveFields,aggregate_fields:firstAggregateFields,physical_capacity_proven:false,GC_or_TTL_applied:false});
});

test('X209 old exports prefix and frozen packages remain byte exact while cross-version state is refused by V3',async()=>{
  const before=await readFile(new URL('materialized-summary.before.mjs.txt',output),'utf8'),current=await readFile('pump-report/analytics/materialized-summary.mjs','utf8');assert.ok(current.startsWith(before));
  const old=createMaterializedSummary({materialization_id:'OLD_NOT_MIGRATED',as_of_ts:T});assert.throws(()=>readMaterializedSummaryV3(old,{as_of_ts:T}),/V3_CONTEXT_REQUIRED/);
  const v3=createMaterializedSummaryV3({materialization_id:'NEW_V3',as_of_ts:T});assert.equal(v3.version,MATERIALIZED_V3_VERSION);assert.equal(v3.source_cursor,0);
  const proofs=JSON.parse(await readFile(new URL('before-proofs.json',output),'utf8')),files=[];
  for(const [path,expected]of Object.entries(proofs)){const b=await readFile(path),actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(n=>n.toString(16).padStart(2,'0')).join('');assert.equal(actual,expected,path);files.push({path,sha256:actual});}
  await save('frozen-integrity.json',{legacy_prefix_unchanged:true,files,old_batteries_run:0,runtime_OutcomeJournal_checked:false});
});
