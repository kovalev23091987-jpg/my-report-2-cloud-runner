// PREPARED, NOT EXECUTED. Call only inside ROOT's one separately admitted case.
export async function runF696ConnectedCase({modulesRoot,openControlledD1,buildFixtures,clock}={}){
  const assert=(await import('node:assert/strict')).default;
  const {pathToFileURL}=await import('node:url'),{resolve}=await import('node:path');
  const root=modulesRoot instanceof URL?modulesRoot:pathToFileURL(resolve(modulesRoot)+'/');
  const load=p=>import(new URL(p,root).href);
  const [S,N,G,R,D,T,B,A,C,W]=await Promise.all([
    'runtime/store.mjs','runtime/native-budget.mjs','runtime/native-tail-guard.mjs',
    'runtime/runner.mjs','runtime/delivery.mjs','runtime/telegram-send.mjs',
    'runtime/budget.mjs','analytics/index.mjs','runtime/retained-capsules.mjs','runtime/worker.mjs'
  ].map(load));
  assert.equal(typeof openControlledD1,'function');
  assert.equal(typeof buildFixtures,'function');
  // SQLite-backed prepared/bind/all adapter must execute these real SQL strings
  // and emit actual meta. A Map/get-atomic surrogate is not this qualification.
  const db=await openControlledD1();
  const f=await buildFixtures({analytics:A,now:clock(),db});
  assert(f.input&&f.instrument&&f.policies&&f.protected_reserves&&f.provider_admission);
  assert.equal(A.analyzePump(f.input).ready,true,'Fixture must satisfy actual mandatory engine');
  let networkAttempts=0,blocker=null,storeForAck=null,runForAck=null;
  const make=async(run_id,{emptyCatalog=false,blockProjection=false,operationMode='AUTO'}={})=>{
    const native=await N.reserveNativeRun({db,run_id,mode:operationMode,run_purpose:'PRODUCTION',clock,
      policy:{...N.NATIVE_POLICY,evidence_ref:'CONTROLLED:F696:NOT_PRODUCTION_IO_ADMISSION'}});
    const store=native.store;await store.install();assert(store instanceof S.D1Store);
    const guard=G.createNativeTailGuard({store,run_id,mode:operationMode,clock});
    const budget=B.createUnifiedBudget({store,run_id,mode:operationMode,clock,policies:f.policies,
      protected_reserves:f.protected_reserves,admission:{...f.provider_admission,expires_ts:native.admission.expires_ts}});
    const selected=f.inputForRun?.(run_id)??{input:f.input,instrument:f.instrument};
    const sources=f.makeSources({...selected,run_id,clock,emptyCatalog});
    // This constructor seam uses actual analytics, sender, delivery, writer and runner.
    const retained=C.createRetainedCapsuleWriter({store:guard.projectionStore,projection_budget:guard.projection_budget,
      implementation_sha256:f.implementation_sha256,evidence_class:'OBSERVED'});
    const delivery=D.createDelivery({store,recipient:f.recipient,clock,
      prepare:x=>W.preparePumpPublication({...x,sources,clock}),
      revalidate:(card,context)=>W.revalidatePumpCard({card,store:context.native_stage?store.withStage(context.native_stage):store,
        sources,clock,prepared_input:context.prepared_input??null}),
      send:async({text,recipient,card_id,native_stage})=>{
        const card=await store.withStage(native_stage).get('pump:card:'+card_id);
        storeForAck=store;runForAck=run_id;
        return T.sendSavedTelegram({budget,token:'CONTROLLED_NOT_A_REAL_SECRET',recipient,text,card,clock,native_tail:guard,native_stage,
          fetch_impl:async()=>{
            networkAttempts++;assert.equal(networkAttempts,1,'No duplicate Telegram dispatch');
            assert(store.stageTotals().held.rows_written>0,'Mandatory/end-run hold survives until ACK');
            if(blockProjection){
              const u=store.usage(),h=store.stageTotals(),left=store.admission.max_rows_written-u.rows_written-h.held.rows_written-h.pending.rows_written-(store.finalization_reserve.rows_written??0);
              assert(left>10);
              blocker=store.reserveStage({run_id,phase:'CONTROLLED_OTHER_OPTIONAL',workload_id:'force-known-projection-deferral',
                envelope:{requests:0,rows_read:0,rows_written:left-10},expires_ts:store.admission.expires_ts});
              assert.throws(()=>store.check(0,left,0),/ENVELOPE/,'Optional work cannot borrow required holds');
            }
            return new Response(JSON.stringify({ok:true,result:{message_id:701,chat:{id:recipient},text,date:Math.floor(clock()/1000)}}),
              {status:200,headers:{'content-type':'application/json'}});
          }});
      }});
    const runner=R.createPumpRunner({store,sources,analyzePump:A.analyzePump,evaluateOutcome:A.evaluateOutcome,
      budget,delivery,clock,profile:f.profile,evidence_class:'OBSERVED',run_purpose:'PRODUCTION',
      retained_features:retained,native_tail:guard,assess_source_evidence:f.assess_source_evidence,
      await_source_window:async()=>{}});
    return {native,store,guard,runner};
  };
  const first=await make(f.run_ids[0],{blockProjection:true});
  const sent=await first.runner.execute({mode:'AUTO',run_id:f.run_ids[0],publish:true});
  const checked=sent.checked.find(x=>x.delivery?.state==='SENT');
  assert(checked?.analysis_key&&checked.delivery.receipt_readback);
  const original=await first.store.get(checked.analysis_key),originalBytes=JSON.stringify(original);
  const pointerKey=G.NATIVE_RECOVERY_PREFIX+checked.analysis_key.slice(-64);
  assert(await first.store.get(pointerKey),'Yield retains exact saved-original recovery');
  assert.notEqual((await first.store.get('pump:card:'+checked.delivery.card_id)).publication_registered,true);
  assert(sent.errors.length&&sent.status==='INCOMPLETE');
  assert.equal(networkAttempts,1);
  assert.equal(storeForAck,first.store);assert.equal(runForAck,f.run_ids[0]);
  assert.throws(()=>first.store.withStage({}),/NOT_OWNED/);
  assert.throws(()=>first.store.releaseStage({}),/RELEASE_NOT_KNOWN/);
  first.store.releaseStage(blocker);blocker=null;
  const finalized1=await N.finalizeNativeRun(first.native,{clock});
  assert.equal(finalized1.state,'FINALIZED');
  assert.equal(finalized1.usage.unknown_ops,0);

  // New run/admission, saved-only repair: no source refresh and no dispatch.
  const second=await make(f.run_ids[1],{emptyCatalog:true});
  const repaired=await second.runner.execute({mode:'AUTO',run_id:f.run_ids[1],publish:true});
  assert.equal(networkAttempts,1,'Saved SENT repair must never dispatch');
  assert.equal(JSON.stringify(await second.store.get(checked.analysis_key)),originalBytes);
  const card=await second.store.get('pump:card:'+checked.delivery.card_id);
  assert.equal(card.state,'SENT');assert.equal(card.message_id,'701');
  assert.equal(card.publication_registered,true,'ACK only after required raw registration and projections');
  assert.equal(await second.store.get(pointerKey),null);
  await N.finalizeNativeRun(second.native,{clock});

  // READY_UNSENT uses the same real engine/input but no card. Its original must
  // remain discoverable until terminal raw journal/denominator processing.
  const third=await make(f.run_ids[2]);
  const unsent=await third.runner.execute({mode:'AUTO',run_id:f.run_ids[2],publish:false});
  const ready=unsent.checked.find(x=>x.analysis?.ready);
  assert(ready?.analysis_key);
  const savedUnsent=await third.store.get(ready.analysis_key);
  const journalKey='pump:journal:'+savedUnsent.analysis.instrument.instrument_id+':'+savedUnsent.analysis.wave_id;
  assert((await third.store.get(journalKey)).analyses.some(x=>x.analysis_id===ready.analysis_key));
  assert(await third.store.get(G.NATIVE_RECOVERY_PREFIX+ready.analysis_key.slice(-64)));
  assert.equal(networkAttempts,1);
  await N.finalizeNativeRun(third.native,{clock});
  // ROOT adapter hook controls a separate fresh native invocation for faults,
  // not the already finalized runs or an old qualification receipt.
  const fourth=await make(f.run_ids[3],{operationMode:'MANUAL'});
  const manual=await fourth.runner.execute({mode:'MANUAL',symbol:f.manual_symbol,request_id:f.manual_request_id,run_id:f.run_ids[3],publish:false});
  assert(manual.manual_result||manual.manual?.length);
  assert.equal((await fourth.store.get('pump:manual:'+f.manual_request_id)).status,'COMPLETE');
  await N.finalizeNativeRun(fourth.native,{clock});
  assert.equal(typeof f.verifyConcurrentAndUnknown,'function','ROOT SQLite adapter must supply required controlled concurrent/unknown fault phases');
  const faults=await f.verifyConcurrentAndUnknown({D1Store:S.D1Store,createNativeTailGuard:G.createNativeTailGuard,db,clock});
  assert.equal(faults.concurrent_optional_borrow_denied,true);
  assert.equal(faults.unknown_blocks_finalize,true);
  assert.equal(faults.foreign_or_expired_stage_denied,true);
  return {schema:'F696_ONE_CONNECTED_NATIVE_TAIL_CASE_V1',status:'PASS_CONTROLLED_ONLY_AFTER_ACTUAL_ASSERTIONS',
    connected_cases:1,Node_processes:1,provider_HTTP:0,real_Telegram:0,controlled_Telegram_ACKs:networkAttempts,
    actual_SQL_adapter:'D1Store with SQLite prepare/bind/all and native meta',first_usage:finalized1.usage,
    original_unchanged:true,saved_only_recovery:true,READY_UNSENT_reference:true,
    physical_storage_capacity_proven:false,production_admission_granted:false,accepted9_26_35_replayed:false};
}
