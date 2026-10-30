// Prepared only. Execute with F696 in the single frozen ROOT qualification.
// MemoryStore below generates public artificial raw fixtures; all guarded work
// and injected ACK faults subsequently execute actual D1Store on SQLite.
export async function runProjectionConnectedCase({modulesRoot,openControlledD1,fixtureFactory,onFixtures=null}) {
  const assert=(await import('node:assert/strict')).default;
  const {pathToFileURL}=await import('node:url'),{resolve}=await import('node:path');
  const root=modulesRoot instanceof URL?modulesRoot:pathToFileURL(resolve(modulesRoot)+'/');
  const [S,N,G,J,D,W,F,V,A,U,P]=await Promise.all([
    'runtime/store.mjs','runtime/native-budget.mjs','runtime/native-tail-guard.mjs',
    'runtime/outcome-journal.mjs','runtime/delivery.mjs','runtime/retained-capsules.mjs',
    'analytics/feature-capsule.mjs','analytics/capsule-version-reader.mjs',
    'analytics/index.mjs','analytics/saved-capsule-audit.mjs','profile/start-v1.mjs'
  ].map(p=>import(new URL(p,root).href)));
  const pinA='a'.repeat(64),pinB='b'.repeat(64),producer='c'.repeat(64);
  const originals=[],rawRows=new Map();let fixtureTransport=0;
  for(const [index,published] of [true,false].entries()) {
    const {analysis,input}=fixtureFactory('base'),memory=new S.MemoryStore();
    const instrument={...input.instrument,instrument_id:'ARTIFICIAL:BINGX:BZ70:'+index,asset_id:'ARTIFICIAL:BZ70:'+index};
    input.instrument=instrument;input.run_id='ROOT_BIG_PROJECTION_FIXTURE_'+index;input.run_purpose='PRODUCTION';
    for(const fact of Object.values(input.facts))fact.instrument_id=instrument.instrument_id;
    Object.assign(analysis,{instrument:structuredClone(instrument),run_id:input.run_id,run_purpose:'PRODUCTION',wave_id:'ROOT_BIG_PROJECTION_WAVE_'+index,
      analysis_ts:Math.ceil(analysis.analysis_ts/60000)*60000,card_text:'ARTIFICIAL_SAVED_PROJECTION_'+index});
    input.analysis_ts=analysis.analysis_ts;
    let fixtureNow=analysis.analysis_ts;
    const analysis_key='pump:analysis:'+await F.capsuleDigest(analysis);
    const saved={analysis,input,saved_ts:fixtureNow,implementation_sha256:producer,evidence_class:'OBSERVED'};
    await memory.set(analysis_key,saved);
    const journal=J.createOutcomeJournal({store:memory,profile:P.START_PROFILE,clock:()=>fixtureNow,evidence_class:'OBSERVED'});
    await journal.remember(analysis,input,analysis_key);
    let card=null,signal,summary=null,later=null,unknown=null;
    if(published) {
      const delivery=D.createDelivery({store:memory,clock:()=>fixtureNow,recipient:'CONTROLLED_PROJECTION_RECIPIENT',revalidate:async()=>({valid:true}),
        send:async()=>{fixtureTransport++;return {ok:true,status:200,body:{ok:true,result:{message_id:9701,chat:{id:'CONTROLLED_PROJECTION_RECIPIENT'},date:Math.floor(fixtureNow/1000)}}};}});
      card=await delivery.enqueue({...analysis,source_input_key:analysis_key},{mode:analysis.mode,expires_ts:fixtureNow+60000});
      assert.equal((await delivery.dispatch(card.card_id)).state,'SENT');
      const selected=await journal.publication(card.card_id);
      signal=await memory.get(selected.summary_origin.signal_id);
      fixtureNow=signal.deadline_ts+1000;
      const p0=signal.reference_price;
      const candles=Array.from({length:240},(_,i)=>({open_ts:signal.t0+i*60000,close_ts:signal.t0+(i+1)*60000,closed:true,
        open:p0,high:p0*(i===10?1.12:1.05),low:p0*0.99,close:p0}));
      const outcome=A.evaluateOutcome({signal,candles,price_points:[],as_of_ts:fixtureNow});assert.equal(outcome.status,'HIT');
      await memory.set('pump:outcome:'+signal.signal_id,outcome);
      summary=await memory.get(await journal.record(signal,outcome));
      fixtureNow=signal.t0+6*3600000+1000;
      later=await memory.get(await journal.record(signal,{...outcome,reasons:[...(outcome.reasons??[]),'CONTROLLED_LATER_SAVED_REVIEW']}));
      fixtureNow+=1000;
      const unknownOutcome=A.evaluateOutcome({signal,candles:[],price_points:[],as_of_ts:fixtureNow});assert.equal(unknownOutcome.status,'UNKNOWN');
      unknown=await memory.get(await journal.record(signal,unknownOutcome));
      card=await memory.get('pump:card:'+card.card_id);
    } else {
      fixtureNow=analysis.analysis_ts+P.START_PROFILE.wave_max_age_ms+1000;
      const selected=await journal.sync('pump:journal:'+instrument.instrument_id+':'+analysis.wave_id);
      assert(selected?.signal_id);signal=await memory.get(selected.signal_id);assert.equal(signal.original_card_id,null);
    }
    const retainedKeys=[analysis_key,signal.signal_id,'pump:journal:'+instrument.instrument_id+':'+analysis.wave_id,
      card&&'pump:card:'+card.card_id,summary?.record_id,later?.record_id,unknown?.record_id,
      published&&'pump:outcome:'+signal.signal_id].filter(Boolean);
    for(const key of retainedKeys){const value=await memory.get(key);assert(value);rawRows.set(key,value);}
    originals.push({analysis_key,saved,signal,card,summary,later,unknown});
  }
  assert.equal(fixtureTransport,1,'Only the explicit raw-fixture transport constructor is called');
  const [sent,unsent]=originals,db=await openControlledD1();
  if(onFixtures)await onFixtures(structuredClone({sent,unsent,rawRows:[...rawRows],profile:P.START_PROFILE}));
  let now=sent.signal.t0+12*3600000,sequence=0;const clock=()=>now;
  for(const [key,value]of rawRows)db.seed(key,value,now);
  const immutableKeys=[sent.analysis_key,unsent.analysis_key,sent.signal.signal_id,unsent.signal.signal_id,
    'pump:card:'+sent.card.card_id,sent.summary.record_id,sent.later.record_id,sent.unknown.record_id];
  const immutableBefore=JSON.stringify(immutableKeys.map(k=>[k,db.peek(k)]));
  const orphan=await F.prepareFeatureCapsule({analysis:sent.saved.analysis,input:sent.saved.input,analysis_key:sent.analysis_key,
    implementation_sha256:producer,projection_writer_implementation_sha256:pinA,recorded_ts:sent.saved.saved_ts,evidence_class:'OBSERVED'});
  db.seed(orphan.key,orphan,now);const orphanBytes=JSON.stringify(orphan);
  const pointerKey=V.projectionPointerKey(orphan.capsule);assert.equal(db.peek(pointerKey),null);
  let guardHooks=0,projectionCalls=0;const runs=[];
  const begin=async phase=>{
    now+=1000;const run_id='ROOT_BIG_PROJECTION_'+phase+'_'+(++sequence);
    const native=await N.reserveNativeRun({db,run_id,mode:'AUTO',clock,policy:{...N.NATIVE_POLICY,evidence_ref:'CONTROLLED:ROOT_BIG:NOT_NATIVE_PERMISSION'}});
    await native.store.install();const guard=G.createNativeTailGuard({store:native.store,run_id,mode:'AUTO',clock});guard.beginRun({operation_mode:'AUTO'});
    const projectionStore=new Proxy(guard.projectionStore,{get(target,key){const value=target[key];if(typeof value!=='function')return value;
      return (...args)=>{projectionCalls++;return value(...args);};}});
    const writer=W.createRetainedCapsuleWriter({store:projectionStore,implementation_sha256:pinB,evidence_class:'OBSERVED',
      projection_budget:{run:(descriptor,work)=>{guardHooks++;return guard.projection_budget.run(descriptor,work);}}});
    const raw=J.createOutcomeJournal({store:native.store,profile:P.START_PROFILE,clock,evidence_class:'OBSERVED',retained_features:null});
    return {native,store:native.store,guard,writer,raw,run_id};
  };
  const required=async(ctx,row)=>ctx.guard.persistReady({analysis_key:row.analysis_key,analysis:row.saved.analysis,input:row.saved.input,
    remember:options=>ctx.raw.remember(row.saved.analysis,row.saved.input,row.analysis_key,options)});
  const finish=async ctx=>{
    const end=ctx.guard.endStore();await end.set('pump:run:'+ctx.run_id,{run_id:ctx.run_id,status:'COMPLETE_CONTROLLED_REQUIRED_TAIL'});
    await end.set('pump:executor',{owner:null,last_completed_run:ctx.run_id});ctx.guard.endRun();
    const result=await N.finalizeNativeRun(ctx.native,{clock});assert.equal(result.state,'FINALIZED');assert.equal(result.usage.unknown_ops,0);
    assert.equal(db.peek('pump:run:'+ctx.run_id).run_id,ctx.run_id);assert.equal(db.peek('pump:executor').last_completed_run,ctx.run_id);
    runs.push({run_id:ctx.run_id,...result});return result;
  };
  // One READY per guarded invocation; the two denominators are never obtained
  // by borrowing a second candidate's RUN_AUTO hold.
  const first=await begin('REGISTER_SENT');await required(first,sent);await finish(first);
  const low=await begin('REGISTER_UNSENT_AND_YIELD');await required(low,unsent);
  const usage=low.store.usage(),totals=low.store.stageTotals();
  const free=low.store.admission.max_rows_written-usage.rows_written-totals.held.rows_written-totals.pending.rows_written-low.store.finalization_reserve.rows_written;
  assert(free>10);
  const blocker=low.store.reserveStage({run_id:low.run_id,phase:'CONTROLLED_OTHER_OPTIONAL',workload_id:'LOW_PROJECTION_ONLY',
    envelope:{requests:0,rows_read:0,rows_written:free-10},expires_ts:low.store.admission.expires_ts});
  const callsBefore=projectionCalls,hooksBefore=guardHooks;
  assert.equal((await low.writer.remember(unsent.analysis_key)).status,'DEFERRED_NATIVE_PROJECTION');
  assert.equal((await low.writer.record(sent.signal,sent.summary)).status,'DEFERRED_NATIVE_PROJECTION');
  assert.equal(projectionCalls-callsBefore,0);assert.equal(guardHooks-hooksBefore,2);
  low.store.releaseStage(blocker);await finish(low);
  const refs=()=>db.inspect('SELECT state_key,value_json FROM pump_report_state_v1 WHERE state_key LIKE ?1 ORDER BY state_key',[G.NATIVE_RECOVERY_PREFIX+'%']);
  const readyDenominators=()=>originals.filter(row=>{
    const journal=db.peek('pump:journal:'+row.saved.analysis.instrument.instrument_id+':'+row.saved.analysis.wave_id),signal=db.peek(row.signal.signal_id);
    return journal?.analyses.some(a=>a.analysis_id===row.analysis_key&&a.origin.ready===true)
      &&journal.frozen_anchor?.analysis_id===row.analysis_key&&signal?.analysis_key===row.analysis_key&&signal.origin.ready===true;
  }).length;
  const denominatorBeforeRepair=readyDenominators();assert.equal(denominatorBeforeRepair,2);
  assert.equal(db.peek(unsent.signal.signal_id).original_card_id,null);
  assert.equal(refs().length,2);assert.equal(db.peek(pointerKey),null);assert.equal(JSON.stringify(db.peek(orphan.key)),orphanBytes);
  // Exactly one real recovery reference per separately admitted controlled run.
  let recoveredReferences=0;
  for(let i=0;i<2;i++) {
    const ctx=await begin('SAVED_ONLY_REPAIR');
    const result=await ctx.guard.repairOne(async(ref,requiredStore)=>{
      const saved=await requiredStore.get(ref.analysis_key);assert(saved);assert.equal(JSON.stringify(saved),JSON.stringify(originals.find(x=>x.analysis_key===ref.analysis_key).saved));
      assert.equal((await ctx.writer.remember(ref.analysis_key)).status,'SAVED');
      if(ref.analysis_key===sent.analysis_key)assert.equal((await ctx.writer.record(sent.signal,sent.summary)).status,'SAVED');
      return true;
    });assert.equal(result.status,'RECOVERY_REGISTERED');recoveredReferences+=result.processed;await finish(ctx);
  }
  assert.equal(refs().length,0);assert.equal(JSON.stringify(db.peek(orphan.key)),orphanBytes);
  assert.equal(readyDenominators(),denominatorBeforeRepair);assert.equal(recoveredReferences,2);
  const pointer=db.peek(pointerKey);assert.equal(pointer.feature_sha256,orphan.sha256);
  const view=await V.readFeatureForAudit(db.peek(orphan.key),{key:pointerKey,pointer});assert.equal(view.implementation_sha256,producer);
  assert.equal(orphan.capsule.projection_writer_implementation_sha256,pinA);
  const split_plan={split_ts:sent.signal.t0+6*3600000,declared_ts:sent.signal.t0-3600000,plan_ref:'CONTROLLED_BIG_PREDECLARED_SPLIT'};
  const audit=records=>U.auditSavedCapsules({records,read:async key=>db.peek(key),as_of_ts:now,split_plan});
  const initial=await audit([sent.summary]);assert.equal(initial.invalid_records,0);
  const later=await begin('LATER_SAVED_SUMMARY');await required(later,sent);
  assert.equal((await later.guard.repairOne(async()=>{assert.equal((await later.writer.record(sent.signal,sent.later)).status,'SAVED');return true;})).status,'RECOVERY_REGISTERED');
  await finish(later);
  const final=await audit([sent.summary,sent.later]);assert.equal(final.invalid_records,0);
  const firstLabel=initial.waves.find(w=>w.first_resolved_label?.status==='HIT'),lastLabel=final.waves.find(w=>w.first_resolved_label?.status==='HIT');
  assert(firstLabel&&lastLabel);assert.deepEqual(lastLabel.first_resolved_label,firstLabel.first_resolved_label);assert.equal(lastLabel.partition,firstLabel.partition);
  assert.equal(final.user_profit,null);assert.equal(final.probability_pct,null);
  const fault=await begin('UNKNOWN_PROJECTION_ACK');await required(fault,sent);
  const preparedOutcome=await F.prepareOutcomeCapsule({feature_capsule:orphan.capsule,feature_sha256:orphan.sha256,
    outcome:sent.unknown.outcome,publication:sent.unknown.publication,recorded_ts:sent.unknown.recorded_ts,summary_record_id:sent.unknown.record_id});
  const expected=Object.assign(Error('ROOT_BIG_INJECTED_PROJECTION_ACK_UNKNOWN'),{code:'ROOT_BIG_INJECTED_PROJECTION_ACK_UNKNOWN'});
  db.ackUnknownNext((sql,args)=>/^INSERT\b/i.test(sql.trim())&&args.includes(preparedOutcome.key),expected);
  await assert.rejects(fault.guard.repairOne(async()=>{await fault.writer.record(sent.signal,sent.unknown);return true;}),e=>e===expected);
  assert.equal(fault.store.usage().unknown_ops,1);
  await assert.rejects(N.finalizeNativeRun(fault.native,{clock}),e=>e.code==='UNKNOWN_NATIVE_RUN_REMAINS_RESERVED');
  assert.equal(db.inspect('SELECT state FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1',[fault.native.reservation_id])[0].state,'RESERVED');
  assert.equal(refs().length,1);assert.equal(JSON.stringify(immutableKeys.map(k=>[k,db.peek(k)])),immutableBefore);
  assert.equal(db.peek('pump:card:'+sent.card.card_id).state,'SENT');assert.equal(JSON.stringify(db.peek(orphan.key)),orphanBytes);
  const snapshot=db.snapshot();
  return {schema:'ROOT_BIG_CONNECTED_PROJECTION_RESULT_V1',status:'PASS_CONTROLLED_ONLY',
    low_budget_callbacks_deferred_before_IO:true,raw_first_READY_denominators:denominatorBeforeRepair,known_ACK_orphan_PA_retained:true,
    bounded_saved_recovery_refs:recoveredReferences,later_summary_first_label_and_split_frozen:true,unknown_ACKs:fault.store.usage().unknown_ops,
    unknown_keeps_RESERVATION_and_work_ref:true,immutable_originals_unchanged:true,
    projection_calls:projectionCalls,guard_hooks:guardHooks,finalized_runs:runs,
    controlled_SQL_counters:snapshot.counters,real_Telegram:0,native_IO:0,source_IO:0,
    fixture_transport_calls:fixtureTransport,physical_capacity_proven:false};
}
