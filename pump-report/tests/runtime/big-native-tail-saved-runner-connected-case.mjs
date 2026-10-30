// Prepared extension of the same single affected qualification, not live IO.
export async function runSavedRunnerConnectedCase({modulesRoot,openControlledD1,fixtures,pin}) {
  const assert=(await import('node:assert/strict')).default;
  const {pathToFileURL}=await import('node:url'),{resolve}=await import('node:path');
  const root=modulesRoot instanceof URL?modulesRoot:pathToFileURL(resolve(modulesRoot)+'/');
  const [N,G,R,D,B,A,C,F,PP,PR,P]=await Promise.all(['runtime/native-budget.mjs','runtime/native-tail-guard.mjs',
    'runtime/runner.mjs','runtime/delivery.mjs','runtime/budget.mjs','analytics/index.mjs','runtime/retained-capsules.mjs',
    'analytics/feature-capsule.mjs','runtime/provider-policy.mjs','runtime/production-policy.mjs','profile/start-v1.mjs'
  ].map(p=>import(new URL(p,root).href)));
  const reports=[];let allDispatch=0,engineCalls=0;
  const immutableCard=c=>Object.fromEntries(['analysis','text','text_hash','recipient','created_ts','expires_ts','delivery_schema',
    'send_started_ts','card_id','message_id','receipt'].map(k=>[k,c[k]]));
  for(const kind of ['SENDING_POSSIBLE_SEND','SENDING_BEFORE_SEND','EXPIRED_READY','EXPIRED_RETRYABLE','LIVE_READY',
    'ORIGINAL_IMPLEMENTATION_PIN_UNBOUND','ORIGINAL_EVIDENCE_CLASS_UNBOUND']) {
    const unbound=kind.startsWith('ORIGINAL_'),base=structuredClone(fixtures.sent),db=await openControlledD1();
    const now=base.saved.analysis.analysis_ts+(unbound?14402000:2000),clock=()=>now;
    let analysis=base.saved.analysis,input=base.saved.input,key=base.analysis_key,card;
    if(unbound) {
      const rawKeys=new Set([key,base.signal.signal_id,'pump:journal:'+analysis.instrument.instrument_id+':'+analysis.wave_id,
        'pump:card:'+base.card.card_id,base.summary.record_id,'pump:outcome:'+base.signal.signal_id]);
      for(const [k,value]of fixtures.rawRows)if(rawKeys.has(k)) {
        const copy=structuredClone(value);if(k===key)delete copy[kind==='ORIGINAL_IMPLEMENTATION_PIN_UNBOUND'?'implementation_sha256':'evidence_class'];db.seed(k,copy,now);
      }
      card=db.peek('pump:card:'+base.card.card_id);
    } else {
      analysis.instrument.instrument_id+=':'+kind;analysis.instrument.asset_id+=':'+kind;
      input.instrument=structuredClone(analysis.instrument);analysis.wave_id+=':'+kind;analysis.run_id='CONTROLLED_R3:'+kind;
      input.run_id=analysis.run_id;analysis.card_text='CONTROLLED_R3_SAVED_'+kind;
      for(const fact of Object.values(input.facts))fact.instrument_id=analysis.instrument.instrument_id;
      key='pump:analysis:'+await F.capsuleDigest(analysis);
      const memory=(await import(new URL('runtime/store.mjs',root))).MemoryStore,fixtureStore=new memory();
      const generator=D.createDelivery({store:fixtureStore,recipient:'CONTROLLED_R3_RECIPIENT',clock:()=>analysis.analysis_ts,
        revalidate:async()=>{throw Error('NO_R3_REVALIDATION');},send:async()=>{throw Error('NO_R3_FIXTURE_SEND');}});
      card=await generator.enqueue({...analysis,source_input_key:key},{mode:analysis.mode,
        expires_ts:kind==='LIVE_READY'?now+60000:now-1});
      card=await fixtureStore.get('pump:card:'+card.card_id);assert(card?.analysis?.source_input_key===key);
      card={...card,state:kind.startsWith('SENDING')?'SENDING':kind==='EXPIRED_RETRYABLE'?'RETRYABLE':'READY',
        claim_until:kind.startsWith('SENDING')?now-1:null,owner:kind.startsWith('SENDING')?'CONTROLLED_INTERRUPTED':null,
        delivery_schema:'PUMP_DELIVERY_V2',send_started_ts:kind==='SENDING_POSSIBLE_SEND'?now-1000:null};
      db.seed(key,{analysis,input,saved_ts:analysis.analysis_ts,implementation_sha256:pin,evidence_class:'OBSERVED'},now);
      db.seed('pump:card:'+card.card_id,card,now);
    }
    const reference={schema:'PUMP_NATIVE_TAIL_RECOVERY_V1',analysis_key:key,producer_run_id:analysis.run_id,
      created_ts:analysis.analysis_ts,card_id:card.card_id};
    const pointer=G.NATIVE_RECOVERY_PREFIX+key.slice(-64);db.seed(pointer,reference,now);
    const immutableBefore=JSON.stringify(immutableCard(card)),originalBefore=JSON.stringify(db.peek(key));
    const summaryBefore=unbound?JSON.stringify(db.peek(base.summary.record_id)):null;
    const run_id='ROOT_BIG_SAVED_RUNNER:'+kind,native=await N.reserveNativeRun({db,run_id,mode:'AUTO',clock,
      policy:{...N.NATIVE_POLICY,evidence_ref:'CONTROLLED:SAVED_RUNNER:NOT_NATIVE_PERMISSION'}});
    const store=native.store;await store.install();const guard=G.createNativeTailGuard({store,run_id,mode:'AUTO',clock});
    const budget=B.createUnifiedBudget({store,run_id,mode:'AUTO',clock,policies:PR.productionPolicies(PP.PROVIDER_POLICIES),
      protected_reserves:PP.PROTECTED_HTTP,admission:PR.productionAdmission({evidence_ref:'CONTROLLED:SAVED_RUNNER:NO_PROVIDER_PERMISSION',
        expires_ts:native.admission.expires_ts},PP.PROVIDER_POLICY_VERSION,{mode:'AUTO'})});
    const writer=C.createRetainedCapsuleWriter({store:guard.projectionStore,projection_budget:guard.projection_budget,
      implementation_sha256:pin,evidence_class:'OBSERVED'}),writerStatuses=[];
    const retained={...writer,remember:async key=>{const result=await writer.remember(key);writerStatuses.push(result.status);return result;}};
    const delivery=D.createDelivery({store,recipient:card.recipient,clock,
      revalidate:async()=>{throw Error('SAVED_REPAIR_MUST_NOT_REVALIDATE');},send:async()=>{allDispatch++;throw Error('SAVED_REPAIR_MUST_NOT_DISPATCH');}});
    const sources={getCore:async()=>{throw Error('SAVED_REPAIR_MUST_NOT_COLLECT_CORE');},
      getCatalog:async()=>({instruments:[],coverage:{status:'USABLE',scope:'CONTROLLED_EMPTY_SAVED_REPAIR'}}),
      getOverview:async()=>({observations:[],coverage:{status:'USABLE'}})};
    const runner=R.createPumpRunner({store,sources,budget,delivery,clock,profile:P.START_PROFILE,evidence_class:'OBSERVED',
      run_purpose:'PRODUCTION',native_tail:guard,retained_features:retained,
      analyzePump:()=>{engineCalls++;throw Error('SAVED_REPAIR_MUST_NOT_REANALYZE');},evaluateOutcome:A.evaluateOutcome,
      assess_source_evidence:()=>{throw Error('NO_NEW_CANDIDATE_IN_SAVED_REPAIR');}});
    let result,executionError=null;
    try{result=await runner.execute({mode:'AUTO',run_id,publish:true});}
    catch(error){if(!unbound||error.code!=='RETAINED_PROJECTION_NOT_SAVED')throw error;
      executionError=error.code;result=db.peek('pump:run:'+run_id);}
    const after=db.peek('pump:card:'+card.card_id),expected=kind==='SENDING_POSSIBLE_SEND'?'UNKNOWN':kind==='SENDING_BEFORE_SEND'?'ERROR':
      ['EXPIRED_READY','EXPIRED_RETRYABLE'].includes(kind)?'STALE':kind==='LIVE_READY'?'READY':'SENT';
    assert.equal(after.state,expected);assert.equal(JSON.stringify(immutableCard(after)),immutableBefore);
    assert.equal(JSON.stringify(db.peek(key)),originalBefore);assert.equal(allDispatch,0);assert.equal(engineCalls,0);
    if(kind==='LIVE_READY')assert(db.peek(pointer));
    if(unbound){assert(writerStatuses.includes(kind));assert.notEqual(after.publication_registered,true);assert(db.peek(pointer));
      assert.equal(JSON.stringify(db.peek(base.summary.record_id)),summaryBefore);}
    assert.equal(db.peek('pump:executor').owner,null);assert(db.peek('pump:run:'+run_id));
    const finalized=await N.finalizeNativeRun(native,{clock});assert.equal(finalized.state,'FINALIZED');
    reports.push({kind,state:after.state,writerStatuses,executionError,native_recovery:result.native_recovery,
      reference_retained:!!db.peek(pointer),immutable_card_and_original:true,usage:finalized.usage});db.close();
  }
  return {schema:'ROOT_BIG_ACTUAL_SAVED_RUNNER_CASE_V1',status:'PASS_CONTROLLED_ONLY',reports,
    actual_provider_HTTP:0,actual_Telegram:allDispatch,engine_calls:engineCalls,physical_capacity_proven:false};
}
