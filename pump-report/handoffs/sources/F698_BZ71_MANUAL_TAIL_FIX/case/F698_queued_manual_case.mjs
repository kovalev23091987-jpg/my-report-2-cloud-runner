// UNEXECUTED. Callable extension of ROOT's ONE admitted connected Node case.
// Uses configured F697 functions; does not create another adapter/context.
export async function runF698QueuedManualCase({modulesRoot,buildFixtures,openControlledD1,clock}={}) {
  const assert=(await import('node:assert/strict')).default;
  const {pathToFileURL}=await import('node:url'),{resolve}=await import('node:path');
  const root=modulesRoot instanceof URL?modulesRoot:pathToFileURL(resolve(modulesRoot)+'/');
  const load=p=>import(new URL(p,root).href);
  const [S,N,G,R,D,T,B,A,C,W]=await Promise.all(['runtime/store.mjs','runtime/native-budget.mjs','runtime/native-tail-guard.mjs',
    'runtime/runner.mjs','runtime/delivery.mjs','runtime/telegram-send.mjs','runtime/budget.mjs','analytics/index.mjs',
    'runtime/retained-capsules.mjs','runtime/worker.mjs'].map(load));
  assert.equal(typeof G.createNativeTailGuard,'function');const reports=[];
  for(const kind of ['READY_QUEUED','INSUFFICIENT_MANUAL_HOLD','UNQUALIFIED_CARRY','READY_QUEUED_SEND']){
    clock.advance(61000);const db=await openControlledD1();
    const f=await buildFixtures({analytics:A,now:clock(),db});
    const run_id='F698-AUTO-'+kind;
    const native=await N.reserveNativeRun({db,run_id,mode:'AUTO',clock,
      policy:{...N.NATIVE_POLICY,evidence_ref:'CONTROLLED:F698:NOT_PRODUCTION_IO_ADMISSION'}});
    const store=native.store;assert(store instanceof S.D1Store);await store.install();
    const actual=G.createNativeTailGuard({store,run_id,mode:'AUTO',clock});
    const holds=[],completion=[],sendFloors=[];let queuedStoreCalls=0,holdAttempts=0,currentQueuedTicket=null;
    // Observational delegates call the actual opaque guard. They grant nothing.
    const guard=Object.freeze({...actual,
      claimQueuedManual(args){holdAttempts++;const ticket=actual.claimQueuedManual(args);
        currentQueuedTicket=ticket;holds.push({before_claim_SQL:db.counters().attempted,remaining:actual.queuedManualStore(ticket).nativeRemaining(),request_id:args.request_id});return ticket;},
      queuedManualStore(ticket){queuedStoreCalls++;if(queuedStoreCalls===2)completion.push({before:actual.endStore().nativeRemaining()});return actual.queuedManualStore(ticket);},
      releaseQueuedManual(ticket){if(completion.length)completion.at(-1).after=actual.endStore().nativeRemaining();return actual.releaseQueuedManual(ticket);}
    });
    const budget=B.createUnifiedBudget({store,run_id,mode:'AUTO',clock,policies:f.policies,protected_reserves:f.protected_reserves,
      admission:{...f.provider_admission,expires_ts:native.admission.expires_ts}});
    const selected={instrument:f.instrument,input:{...structuredClone(f.input),run_id,mode:'MANUAL'}};
    const sources=f.makeSources({...selected,run_id,clock,store,budget,guard});
    const retained=C.createRetainedCapsuleWriter({store:guard.projectionStore,projection_budget:guard.projection_budget,
      implementation_sha256:f.implementation_sha256,evidence_class:'OBSERVED'});
    let sends=0;
    const delivery=D.createDelivery({store,recipient:f.recipient,clock,
      prepare:x=>W.preparePumpPublication({...x,sources,clock}),
      revalidate:(card,context)=>W.revalidatePumpCard({card,store:context.native_stage?store.withStage(context.native_stage):store,
        sources,clock,prepared_input:context.prepared_input??null}),
      send:async args=>{
        assert.equal(kind,'READY_QUEUED_SEND');
        const card=await store.withStage(args.native_stage).get('pump:card:'+args.card_id);
        return T.sendSavedTelegram({...args,card,budget,token:'CONTROLLED_NOT_SECRET',clock,native_tail:guard,
          fetch_impl:async()=>{
            sends++;assert.equal(sends,1);
            const end=actual.endStore().nativeRemaining(),queued=actual.queuedManualStore(currentQueuedTicket).nativeRemaining();
            assert(end.rows_written>=12);assert(queued.rows_written>=44);
            sendFloors.push({end,queued,held:store.stageTotals().held});
            return new Response(JSON.stringify({ok:true,result:{message_id:801,chat:{id:args.recipient},text:args.text,date:Math.floor(clock()/1000)}}),
              {status:200,headers:{'content-type':'application/json'}});
          }});
      }});
    const runner=R.createPumpRunner({store,sources,analyzePump:A.analyzePump,evaluateOutcome:A.evaluateOutcome,budget,delivery,
      clock,profile:f.profile,evidence_class:'OBSERVED',run_purpose:'PRODUCTION',retained_features:retained,native_tail:guard,
      assess_source_evidence:f.assess_source_evidence,await_source_window:async()=>{}});
    const request_id='F698-JOB-'+kind;
    const symbol=kind==='UNQUALIFIED_CARRY'?'F698UNKNOWN':f.instrument.base;
    assert.equal((await runner.enqueueManual(symbol,{request_id,publish:kind==='READY_QUEUED_SEND'})).status,'QUEUED');
    let second_id=null;
    if(kind==='UNQUALIFIED_CARRY'){
      second_id=request_id+'-SECOND';assert.equal((await runner.enqueueManual('F698OTHERUNKNOWN',{request_id:second_id,publish:false})).status,'QUEUED');
    }
    const beforeJob=db.peek('pump:manual:'+request_id),traceStart=db.counters().attempted;let blocker=null;
    if(kind==='INSUFFICIENT_MANUAL_HOLD'){
      const used=store.usage(),reserve=store.finalization_reserve;
      const available=store.admission.max_rows_written-used.rows_written-(reserve.rows_written??0);
      const keep=G.NATIVE_TAIL_PLANS.RUN_AUTO.rows_written+G.NATIVE_TAIL_PLANS.QUEUED_MANUAL.rows_written-1;
      assert(available>keep);blocker=store.reserveStage({run_id,phase:'CONTROLLED_OTHER_OPTIONAL',workload_id:'manual-before-claim-refusal',
        envelope:{requests:0,rows_read:0,rows_written:available-keep},expires_ts:store.admission.expires_ts});
    }
    const result=await runner.execute({mode:'AUTO',run_id,publish:false});
    const snapshot=db.snapshot(),processing=snapshot.trace.filter(row=>row.sequence>traceStart&&row.args.some(v=>typeof v==='string'&&v.includes('"status":"PROCESSING"')));
    if(kind==='INSUFFICIENT_MANUAL_HOLD'){
      assert.equal(holds.length,0);assert.equal(holdAttempts,1);assert.equal(processing.length,0);
      assert.deepEqual(db.peek('pump:manual:'+request_id),beforeJob);
      assert(result.errors.includes('QUEUED_MANUAL_TAIL_DEFERRED'));store.releaseStage(blocker);
    }else{
      assert.equal(holds.length,1);assert.equal(holdAttempts,1);
      assert.deepEqual(holds[0].remaining,G.NATIVE_TAIL_PLANS.QUEUED_MANUAL);
      assert(processing.length>0);assert(processing.every(row=>row.sequence>holds[0].before_claim_SQL));
      assert.equal(db.peek('pump:manual:'+request_id).status,'COMPLETE');
      assert.equal(completion.length,1);assert.deepEqual(completion[0].after,completion[0].before,'Manual completion cannot spend RUN_AUTO end floor');
      if(kind==='READY_QUEUED'||kind==='READY_QUEUED_SEND')assert.equal(result.manual.find(x=>x.request_id===request_id)?.result?.analysis?.ready,true);
      if(kind==='UNQUALIFIED_CARRY'){
        assert.equal(result.manual.length,1);assert.equal(db.peek('pump:manual:'+second_id).status,'PENDING');
        assert(result.errors.includes('QUEUED_MANUAL_CARRIED_ONE_PER_NATIVE_RUN'));
        const members=snapshot.state.filter(row=>row.state_key.startsWith('pump:work-index:v1:manual:member:')).map(row=>row.value);
        assert(members.some(row=>row.id===second_id&&row.status==='ACTIVE'));
      }
    }
    if(kind==='READY_QUEUED_SEND'){
      const checked=result.manual.find(x=>x.request_id===request_id)?.result;
      assert.equal(checked.delivery.state,'SENT');assert.equal(checked.delivery.receipt_readback,true);
      const card=db.peek('pump:card:'+checked.delivery.card_id);assert.equal(card.state,'SENT');assert.equal(card.message_id,'801');
      assert.equal(card.receipt.recipient,f.recipient);assert.equal(card.receipt.text_hash,card.text_hash);
      assert.equal(sends,1);assert.equal(sendFloors.length,1);
    }else assert.equal(sends,0);
    assert.equal(store.usage().unknown_ops,0);
    assert.deepEqual(store.stageTotals(),{held:{requests:0,rows_read:0,rows_written:0},pending:{requests:0,rows_read:0,rows_written:0}});
    assert.equal(db.peek('pump:executor').owner,null);assert(db.peek('pump:run:'+run_id));
    const finalized=await N.finalizeNativeRun(native,{clock});assert.equal(finalized.state,'FINALIZED');
    reports.push({kind,run_id,actual_holds:holds,completion_floor:completion,manual_claim_SQL:processing.length,
      controlled_ACKs:sends,sendFloors,usage:finalized.usage,source_trace:sources.controlledTrace(),native_ledger:db.snapshot().ledger,real_provider_HTTP:0,real_Telegram:0});
    db.close();
  }
  return {schema:'F698_QUEUED_MANUAL_CONTROLLED_WITNESSES_V1',status:'PASS_ONLY_AFTER_ACTUAL_ASSERTIONS',reports,
    manual_SEND_qualified:reports.some(r=>r.kind==='READY_QUEUED_SEND'&&r.controlled_ACKs===1),CAS_contention_qualified:false,pending_head_recovery_qualified:false,
    physical_native_capacity_proven:false,production_admission:false};
}
