import {INPUT_SCHEMA,emptyMap,factUsable,positive,ownerInstrumentExcluded,ownerPublicationRefusal} from '../contracts/index.mjs';
import {START_PROFILE} from '../profile/start-v1.mjs';
import {automaticWindowOpen,textHash} from './delivery.mjs';
import {parseManualInput} from './manual-input.mjs';
import {createOutcomeJournal,createOutcomeWorkIndex} from './outcome-journal.mjs';
import {createWorkIndex} from './work-index.mjs';
import {productionRecord} from '../contracts/run-purpose.mjs';
import {candidatePriority,analysisQueueEvidence} from './candidate-priority.mjs';
import {captureDecision} from './candidate-diagnostics.mjs';
import {PRODUCTION_PLAN} from './production-policy.mjs';

const instrumentKey=instrument=>instrument.instrument_id;
const symbolKey=text=>String(text??'').trim().toUpperCase().replace(/\s+/g,'').replace(/(?:[-/]?USDT)$/,'');
const globalBudgetReason=result=>[...(result.analysis?.reasons??[]),result.source_coverage?.reason,...Object.values(result.source_coverage?.facts??{}).map(f=>f.reason)].some(reason=>/PROTECTED_DAY|MONTH_EXHAUSTED|RUN_HTTP|RUN_MANUAL|PROVIDER_SECOND|PROVIDER_MINUTE|PROVIDER_BACKOFF|NATIVE_SQL|AUTOMATIC_WINDOW_CLOSED/.test(typeof reason==='string'?reason:reason?.code??''));

export function createPumpRunner({store,sources,analyzePump,evaluateOutcome,budget,delivery,profile=START_PROFILE,clock=Date.now,evidence_class='UNCLASSIFIED',run_purpose='UNCLASSIFIED',retained_features=null,await_source_window=async()=>{},assess_source_evidence=()=>({eligible:true})}){
  if(!store?.atomic||!sources?.getCore||!analyzePump||!evaluateOutcome||!budget||!delivery)throw Error('PUMP_RUNNER_DEPENDENCIES_REQUIRED');
  const prequeueNear=(reported,change)=>(typeof reported==='number'&&reported>=profile.automatic_growth.day_pct*profile.prequeue_threshold_fraction)||(change!==null&&change>=profile.automatic_growth.short_pct*profile.prequeue_threshold_fraction);
  const manualResultKey=id=>'pump:manual-result:'+id;
  const observations=createOutcomeJournal({store,profile,clock,evidence_class,retained_features});
  const manualWork=createWorkIndex({store,kind:'manual',targetKey:id=>'pump:manual:'+id,completed:async job=>job.status==='COMPLETE'&&await store.get(manualResultKey(job.request_id))!==null});
  const outcomeWork=createOutcomeWorkIndex({store});
  async function enqueueManual(symbol,{request_id=crypto.randomUUID(),publish=true,context_symbol=null}={}){
    const parsed=parseManualInput(symbol,{context_symbol});if(parsed.status!=='PARSED')return parsed;
    const normalized=parsed.symbol;
    if(ownerInstrumentExcluded(normalized))return {status:'OWNER_ASSET_DELIVERY_EXCLUDED',symbol:normalized};
    if(typeof request_id!=='string'||!request_id||request_id.length>512||/[\u0000-\u001f]/.test(request_id))return {status:'REQUEST_ID_REQUIRED'};
    if(!(await manualWork.initialize()).ready)return {status:'QUEUE_MIGRATING',request_id};
    const job={request_id,symbol:normalized,publish,created_ts:clock(),status:'PENDING'};
    const accepted=await store.atomic('pump:manual:'+request_id,current=>({state:current??job,result:!current||current.symbol===normalized&&current.publish===publish}));
    if(!accepted)return {status:'REQUEST_ID_CONFLICT',request_id};
    const saved=await store.get('pump:manual:'+request_id);
    if(saved.status==='COMPLETE'){const result=await getManualResult(request_id);if(result===null)throw Error('SAVED_MANUAL_RESULT_MISSING');await manualWork.add(request_id);await manualWork.complete(request_id,{evidence_key:manualResultKey(request_id)});return {status:'COMPLETE',request_id,result};}
    await manualWork.add(request_id);
    return {status:'QUEUED',request_id};
  }
  async function claimManual(executor_owner){
    const page=await manualWork.page({limit:4});if(!page.ready)throw Error('WORK_INDEX_MIGRATING');
    for(const {id} of page.items){const existing=await store.get('pump:manual:'+id);if(existing?.status==='COMPLETE'){await manualWork.complete(id,{evidence_key:manualResultKey(id)});continue;}
      const job=await store.atomic('pump:manual:'+id,current=>{
      if(current?.status!=='PENDING'&&!(current?.status==='PROCESSING'&&current.executor_owner!==executor_owner))return {state:current,result:null};
      return {state:{...current,status:'PROCESSING',executor_owner,started_ts:clock()},result:current};
    });if(job)return job;}return null;
  }
  async function finishManual(job,result){await store.set(manualResultKey(job.request_id),result);await store.atomic('pump:manual:'+job.request_id,current=>({state:{...current,status:'COMPLETE',completed_ts:clock()},result:true}));await manualWork.complete(job.request_id,{evidence_key:manualResultKey(job.request_id)});}
  async function getManualResult(id){return store.get(manualResultKey(id));}

  async function updateDiscovery(catalog,run_id){
    const overview=await sources.getOverview({run_id,instruments:catalog.instruments,purpose:'DISCOVERY'});
    const now=clock(),slot=Math.floor(now/60000)*60000;
    const compact=overview.observations.map(o=>{const usable=factUsable(o.facts.price,now);return {id:o.instrument.instrument_id,last:usable?o.facts.price.value:null,event_ts:o.facts.price?.event_ts??null,reported_change_pct:usable?o.reported_change_pct??null:null,status:o.facts.price?.status??'ABSENT'};});
    const index=await store.get('pump:overview-index')??[],recent=index.filter(t=>t>=now-3600000&&t<slot),history=[];
    for(const ts of recent)history.push({ts,rows:await store.get('pump:overview:'+ts)??[]});
    await store.set('pump:overview:'+slot,compact);await store.set('pump:overview-index',[...recent,slot]);
    const active=await store.get('pump:active-instruments')??[];
    await store.atomic('pump:candidate-queue',queue=>{
      queue??={};
      for(const row of compact){
        const prior=history.flatMap(snapshot=>snapshot.rows.filter(r=>r.id===row.id).map(r=>({...r,snapshot_ts:snapshot.ts}))).filter(r=>positive(r.last));
        const change=positive(row.last)&&prior.length?Math.max(...prior.map(p=>(row.last/p.last-1)*100)):null;
        const near=prequeueNear(row.reported_change_pct,change);
        if(!near&&!active.includes(row.id)&&!queue[row.id])continue;
        const observed=overview.observations.find(o=>o.instrument.instrument_id===row.id)?.facts?.price;
        const priorQueue=queue[row.id]??{},zones=priorQueue.entry_zones??[],usable=factUsable(observed,now)&&positive(observed.value);
        const distance=usable&&zones.length?Math.min(...zones.map(z=>observed.value<z.lower?100*(z.lower-observed.value)/observed.value:observed.value>z.upper?100*(observed.value-z.upper)/observed.value:0)):null;
        queue[row.id]={...priorQueue,instrument_id:row.id,first_seen:priorQueue.first_seen??now,last_seen:now,preliminary_growth:change,reported_day_growth:row.reported_change_pct,active_wave:active.includes(row.id),next_check_ts:priorQueue.next_check_ts??now,
          price_expires_ts:usable?observed.expires_ts:null,entry_distance_pct:distance,
          movement_event_ts:priorQueue.movement_event_ts??(near&&usable?row.event_ts:null)};
      }
      return {state:queue,result:true};
    });
    return overview.coverage;
  }
  async function selectAutomatic(catalog,diagnostics){
    const queue=await store.get('pump:candidate-queue')??{},now=clock();
    const candidates=Object.values(queue).filter(r=>(r.next_check_ts??0)<=now&&(r.active_wave===true||prequeueNear(r.reported_day_growth,r.preliminary_growth)));
    const score=r=>candidatePriority(r,now,{profile}).score;
    candidates.sort((a,b)=>score(b)-score(a)||a.first_seen-b.first_seen);
    const picked=candidates.find(r=>catalog.instruments.some(i=>i.instrument_id===r.instrument_id&&!ownerInstrumentExcluded(i)&&assess_source_evidence(i).eligible));
    if(diagnostics){if(diagnostics.candidate_selection.length<4)diagnostics.candidate_selection.push(captureDecision(candidates,picked,now,profile));else diagnostics.candidate_selection_truncated=true;}
    return picked?catalog.instruments.find(i=>i.instrument_id===picked.instrument_id):null;
  }
  async function saveAnalysisOriginal(analysis,input){
    const fingerprint=await textHash(JSON.stringify(analysis)),key='pump:analysis:'+fingerprint;
    await store.atomic(key,current=>{if(retained_features&&current&&(JSON.stringify(current.analysis)!==JSON.stringify(analysis)||JSON.stringify(current.input)!==JSON.stringify(input)))throw Error('IMMUTABLE_ANALYSIS_INPUT_CONFLICT');return {state:current??{analysis,input,saved_ts:clock(),...(retained_features?{implementation_sha256:retained_features.implementation_sha256,evidence_class:retained_features.evidence_class}:{})},result:true};});
    return key;
  }
  async function indexAnalysis(analysis,input,key){
    if(retained_features&&analysis.ready)await retained_features.remember(key);
    await store.set('pump:latest-analysis:'+instrumentKey(input.instrument),{analysis_key:key,analysis});
    const wave=analysis.next_wave??analysis.previous_wave??null;
    if(wave)await store.set('pump:wave:'+instrumentKey(input.instrument),wave);
    await store.atomic('pump:active-instruments',current=>{
      const set=new Set(current??[]);if(wave&&analysis.wave_state!=='CANCELLED'&&(wave.expires_ts??0)>clock()){if(input.mode==='AUTO'||set.has(instrumentKey(input.instrument)))set.add(instrumentKey(input.instrument));}else set.delete(instrumentKey(input.instrument));
      return {state:[...set],result:true};
    });
    await store.atomic('pump:candidate-queue',queue=>{
      queue??={};const id=instrumentKey(input.instrument);
      if(input.mode==='MANUAL'&&!queue[id])return {state:queue,result:true};
      queue[id]={...(queue[id]??{first_seen:clock(),instrument_id:id}),last_checked_ts:clock(),next_check_ts:clock()+profile.candidate_recheck_ms,last_status:analysis.status,active_wave:Boolean(wave&&!['CANCELLED','EXPIRED'].includes(analysis.wave_state)&&(wave.expires_ts??0)>clock()),
        ...analysisQueueEvidence(analysis,input,profile),entry_zones:(analysis.plan?.entry_zones??[]).map(z=>({lower:z.lower,upper:z.upper}))};
      return {state:queue,result:true};
    });
    await observations.remember(analysis,input,key);
  }
  async function checkInstrument(instrument,{run_id,mode,publish=true,assert_execution=async()=>{}}){
    if(ownerInstrumentExcluded(instrument))return {status:'OWNER_ASSET_DELIVERY_EXCLUDED',symbol:instrument.base,delivery:null};
    const evidence=assess_source_evidence(instrument);
    if(!evidence.eligible)return {status:'DEFERRED_SOURCE_EVIDENCE',source_coverage:{status:'NOT_CHECKED',reason:evidence.reason,asset_remains_in_discovery:true},delivery:null};
    budget.setMode(mode);
    await assert_execution();
    const admitted=await budget.admitCandidate?.({http_upper_bound:PRODUCTION_PLAN.candidate_http_upper_bound,http_by_provider:PRODUCTION_PLAN.candidate_http_by_provider,candidate_id:instrument.instrument_id});
    if(admitted?.allowed===false)return {status:'DEFERRED',source_coverage:{status:'NOT_CHECKED',reason:admitted.reason,detail:admitted.detail},delivery:null};
    try {
    // After catalog/discovery, wait BEFORE the fresh phase. Cold upper bound:
    // overview1 + day1 + price(primary/fallback)2 + candles/book2 + optional2
    // + forced delivery price/book2 =10 BingX attempts. Map/TG are separate.
    await await_source_window({provider:'BINGX',cost:10,deadline_ts:clock()+60001,before_wait:assert_execution});
    await assert_execution();
    const overview=await sources.getOverview({run_id,instruments:[instrument]});
    const overviewFacts=overview.observations?.[0]?.facts??{};
    const day=typeof sources.getDayGrowth==='function'?await sources.getDayGrowth({instrument,run_id,mode}):null;
    const core=await sources.getCore({instrument,run_id,mode,existing_facts:overviewFacts}),previous_wave=await store.get('pump:wave:'+instrumentKey(instrument));
    let input={schema_version:INPUT_SCHEMA,run_id,mode,run_purpose,analysis_ts:clock(),instrument,facts:{...overviewFacts,...core.facts,...(day?.facts??{})},liquidations:emptyMap(),previous_wave};
    let analysis=analyzePump(input,profile);
    if(analysis.ready){
      await assert_execution();
      // One absolute deadline for all supplemental work. Retain half of the
      // shortest mandatory fact's remaining life for saving and the existing
      // publication recheck. Original fact clocks and HTTP reserves stay intact.
      const at=clock(),mandatoryUntil=Math.min(...['price','orderbook','candles'].map(key=>input.facts[key]?.expires_ts??0));
      const deadline_ts=Math.min(at+profile.liquidation_deadline_ms,at+Math.max(0,Math.floor((mandatoryUntil-at)/2)));
      // Future liquidation information has the owner's first priority within
      // the supplemental budget; its absence is still not a core refusal.
      try{input.liquidations=await sources.getLiquidations({instrument,run_id,reference_price:analysis.reference_price,deadline_ts});}
      catch(error){input.liquidations=emptyMap(/BUDGET|RESERVE|QUOTA/.test(error.code??'')?'NOT_CHECKED_BUDGET':'ERROR',error.code??'OPTIONAL_MAP_ERROR');}
      const optional=await sources.getOptional({instrument,run_id,mode,facts:core.facts,deadline_ts,requested_kinds:['trades','funding']});
      input.facts={...input.facts,...optional.facts};
      input.analysis_ts=clock();analysis=analyzePump(input,profile);
    }
    // The immutable facts and plan must exist before publication. Derived
    // features, journal and candidate bookkeeping must not spend their TTL.
    const analysis_key=await saveAnalysisOriginal(analysis,input);let delivered=null,card_id=null,bookkeeping_error=null;
    // The anchor's actual recorded_ts must precede the publication event.
    // Persist only its row now; derived work-index operations follow dispatch.
    if(analysis.ready)await observations.remember(analysis,input,analysis_key,{defer_index:true});
    try {
    const publicationRefusal=ownerPublicationRefusal(analysis);
    if(publish&&analysis.ready&&publicationRefusal)delivered={state:'SUPPRESSED',reason:publicationRefusal};
    if(publish&&analysis.ready&&!publicationRefusal&&(mode==='MANUAL'||analysis.automatic_eligible)){
      await assert_execution();
      const expires=Math.min(...['price','orderbook','candles'].map(key=>input.facts[key]?.expires_ts??0));
      if(expires>clock()){
        const card=await delivery.enqueue({...analysis,source_input_key:analysis_key},{mode,expires_ts:expires,update_kind:analysis.update_kind??null});
        card_id=card.card_id;
        delivered=await delivery.dispatch(card.card_id);
      }else delivered={state:'STALE',reason:'MANDATORY_FACT_EXPIRED_BEFORE_PUBLICATION'};
    }
    } finally {
      try{await indexAnalysis(analysis,input,analysis_key);}
      catch(error){if(!delivered)throw error;bookkeeping_error=error.code??'POST_PUBLICATION_INDEX_FAILED';}
    }
    if(card_id&&!bookkeeping_error){try{await recordPublished(card_id,{analysis_registered:true});}catch(error){bookkeeping_error=error.code??'POST_PUBLICATION_REGISTRATION_FAILED';}}
    return {analysis_key,analysis,delivery:delivered,source_coverage:core.coverage,...(bookkeeping_error?{bookkeeping_error}:{}),...(admitted?.candidate_quota?{candidate_quota:admitted.candidate_quota}:{})};
    } finally {
      if(admitted?.surplus_grant_id)await budget.closeCandidate({candidate_id:instrument.instrument_id,surplus_grant_id:admitted.surplus_grant_id});
    }
  }
  async function recordPublished(card_id,{analysis_registered=false}={}){
    const card=await store.get('pump:card:'+card_id);if(!card)return;
    // A prior executor may have stopped after the receipt and before indexing.
    // Recover only the journal from its original; never replace newer wave or
    // candidate state, retime facts, or send the terminal card again.
    if(!analysis_registered&&['SENT','UNKNOWN','ERROR','STALE'].includes(card.state)&&card.analysis?.source_input_key){
      const key=card.analysis.source_input_key,saved=await store.get(key);
      if(!saved?.analysis||!saved.input||key!=='pump:analysis:'+await textHash(JSON.stringify(saved.analysis)))throw Error('ORIGINAL_PUBLICATION_ANALYSIS_REQUIRED');
      const {source_input_key,...analysis}=card.analysis;
      if(JSON.stringify(analysis)!==JSON.stringify(saved.analysis))throw Error('ORIGINAL_PUBLICATION_ANALYSIS_CONFLICT');
      if(retained_features&&saved.analysis.ready)await retained_features.remember(key);
      await observations.remember(saved.analysis,saved.input,key);
    }
    if(['SENT','UNKNOWN','ERROR','STALE'].includes(card.state)){
      const registered=await observations.publication(card_id);
      if(registered?.status==='QUARANTINED')throw Object.assign(Error('PUBLICATION_JOURNAL_QUARANTINED'),{code:'PUBLICATION_JOURNAL_QUARANTINED'});
    }
    if(['SENT','UNKNOWN','ERROR','STALE','SUPPRESSED'].includes(card.state))await delivery.acknowledge(card_id);
  }
  async function checkOutcomes({run_id}){
    if(!automaticWindowOpen(clock()))return [];
    budget.setMode('STATISTICS');
    const page=await outcomeWork.page({limit:20}),results=[];if(!page.ready)return [{status:'DEFERRED',reason:'WORK_INDEX_MIGRATING'}];
    for(const {id:key} of page.items){
      if(store.admission&&typeof store.usage==='function'){const used=store.usage();if(used.rows_read+500>store.admission.max_rows_read||used.rows_written+30>store.admission.max_rows_written){results.push({status:'DEFERRED',reason:'STATISTICS_NATIVE_ENVELOPE_PROTECTED'});break;}}
      const signal=await store.get(key);if(!signal)throw Error('SAVED_OUTCOME_SIGNAL_MISSING');
      if(!productionRecord({origin:signal.origin})){
        const evidence_key='pump:work-exclusion:outcomes:'+await textHash(key);
        await store.set(evidence_key,{schema:'PUMP_OUTCOME_WORK_EXCLUSION_V1',signal_id:signal.signal_id,origin:signal.origin,reason:'TEST_OR_UNCLASSIFIED_ORIGIN_RETAINED_FOR_AUDIT'});
        await outcomeWork.complete(key,{evidence_key});results.push({signal_id:signal.signal_id,status:'SKIPPED_NON_PRODUCTION',reason:'TEST_OR_UNCLASSIFIED_ORIGIN_RETAINED_FOR_AUDIT'});continue;
      }
      if(signal.deadline_ts>clock())continue;
      const saved=await store.get('pump:outcome:'+signal.signal_id);if(saved?.status==='HIT'||saved?.status==='MISS'){const evidence_key=await observations.record(signal,saved);await outcomeWork.complete(key,{evidence_key});continue;}
      const summary=budget.summary();if(summary.lanes.statistics>=summary.limits.lanes.statistics||summary.total>=summary.limits.http_per_run){results.push({status:'DEFERRED',reason:'STATISTICS_HTTP_BUDGET_EXHAUSTED'});break;}
      if(typeof sources.getOutcomeHistory!=='function'){results.push({signal_id:signal.signal_id,status:'UNKNOWN',reason:'OUTCOME_HISTORY_ROUTE_NOT_CONNECTED'});continue;}
      const history=await sources.getOutcomeHistory({instrument:signal.instrument,run_id,start_ts:signal.t0,end_ts:signal.deadline_ts});
      if(/BUDGET|RESERVE|EXHAUSTED|BACKOFF/.test(history.coverage?.reason??history.facts?.candles?.reason??'')){results.push({signal_id:signal.signal_id,status:'DEFERRED',reason:history.coverage?.reason??history.facts.candles.reason});break;}
      const outcome=evaluateOutcome({signal,candles:history.facts?.candles?.value??[],price_points:[],as_of_ts:clock()});
      await store.set('pump:outcome:'+signal.signal_id,outcome);const evidence_key=await observations.record(signal,outcome);results.push(outcome);
      if(['HIT','MISS'].includes(outcome.status))await outcomeWork.complete(key,{evidence_key});
    }
    return results;
  }
  function capacity(){
    const summary=budget.summary(),manual=summary.mode==='AUTO'?summary.limits.manual_http_run_reserve:0;
    const candidate=profile.core_http_upper_bound+(profile.optional_http_upper_bound??2)+(profile.map_http_upper_bound??1)+profile.delivery_http_reserve;
    const http=summary.total+candidate+manual<=summary.limits.http_per_run&&summary.lanes.hot+candidate+manual<=summary.limits.lanes.hot;
    if(!http)return false;
    if(store.admission&&typeof store.usage==='function'){const used=store.usage();return used.rows_read+profile.core_sql_upper_bound.rows_read+profile.delivery_sql_reserve.rows_read<=store.admission.max_rows_read&&used.rows_written+profile.core_sql_upper_bound.rows_written+profile.delivery_sql_reserve.rows_written<=store.admission.max_rows_written;}
    return true;
  }

  async function execute({mode='AUTO',symbol=null,run_id=crypto.randomUUID(),publish=true,request_id=crypto.randomUUID(),context_symbol=null}={}){
    if(mode==='AUTO'&&!automaticWindowOpen(clock()))return {status:'OUTSIDE_AUTOMATIC_WINDOW',run_id};
    let manual;if(mode==='MANUAL'){manual=await enqueueManual(symbol,{request_id,publish,context_symbol});if(manual.status!=='QUEUED')return manual;}
    const owner=crypto.randomUUID(),claimed=await store.atomic('pump:executor',current=>{
      if(current?.owner&&current.expires_ts>clock())return {state:current,result:false};
      return {state:{owner,run_id,expires_ts:clock()+profile.executor_lease_ms},result:true};
    });
    if(!claimed)return manual??{status:'EXECUTOR_BUSY',run_id};
    const assert_execution=async()=>{
      const valid=await store.atomic('pump:executor',current=>{
        if(current?.owner!==owner||current.expires_ts<=clock())return {state:current,result:false};
        return {state:{...current,expires_ts:clock()+profile.executor_lease_ms},result:true};
      });
      if(!valid)throw Object.assign(Error('EXECUTOR_LEASE_EXPIRED'),{code:'EXECUTOR_LEASE_EXPIRED'});
    };
    const result={run_id,status:'COMPLETE',checked:[],manual:[],coverage:null,outcomes:[],delivery:[],errors:[],candidate_selection:[],candidate_selection_truncated:false};
    try{
      const sourceCatalog=await sources.getCatalog({run_id,purpose:mode==='AUTO'?'DISCOVERY':'CORE'}),catalog={...sourceCatalog,instruments:sourceCatalog.instruments.filter(i=>!ownerInstrumentExcluded(i))};result.catalog_coverage={...catalog.coverage,owner_delivery_excluded:sourceCatalog.instruments.filter(ownerInstrumentExcluded).map(i=>i.instrument_id),verified_crypto_count:sourceCatalog.instruments.length,delivery_eligible_verified_count:catalog.instruments.length};
      const evidence=catalog.instruments.map(assess_source_evidence),reasons={};
      for(const row of evidence)if(!row.eligible)reasons[row.reason]=(reasons[row.reason]??0)+1;
      result.source_evidence_coverage={eligible_for_deep_check:evidence.filter(r=>r.eligible).length,temporarily_deferred:evidence.filter(r=>!r.eligible).length,reason_counts:reasons,not_an_asset_exclusion:true,current_CORE_proven:false};
      if(result.source_evidence_coverage.temporarily_deferred){result.status='INCOMPLETE';result.errors.push({reason:'SOURCE_EVIDENCE_PENDING',count:result.source_evidence_coverage.temporarily_deferred});}
      if(!catalog.instruments.length){result.status='INCOMPLETE';result.errors.push(catalog.coverage.reason??'NO_VERIFIED_INSTRUMENTS');}
      const unresolved=(catalog.unqualified??[]).filter(row=>['CRYPTO_ASSET_IDENTITY_UNQUALIFIED','CATALOG_REGISTRY_IDENTITY_MISMATCH','MISSING_OR_DUPLICATE_NATIVE_SYMBOL','INVALID_CATALOG_ROW'].includes(row.reason));
      if(unresolved.length){result.status='INCOMPLETE';result.errors.push({reason:'UNIVERSE_QUALIFICATION_INCOMPLETE',unqualified:unresolved.length});}
      if(mode==='AUTO'&&catalog.instruments.length)result.coverage=await updateDiscovery(catalog,run_id);
      let job;
      for(;;){
        try{await assert_execution();}catch{result.status='INCOMPLETE';result.errors.push('EXECUTOR_LEASE_EXPIRED');break;}
        const pending=await manualWork.page({limit:1,advance:false});if(!pending.ready){result.status='INCOMPLETE';result.errors.push('WORK_INDEX_MIGRATING');break;}
        const hasManual=pending.scanned>0;
        budget.setMode(hasManual?'MANUAL':mode);
        if(!capacity()){result.status='INCOMPLETE';result.errors.push('RUN_RESOURCES_DEFERRED');break;}
        job=await claimManual(owner);
        if(job){
          const matches=catalog.instruments.filter(i=>symbolKey(i.native_symbol)===job.symbol||i.base.toUpperCase()===job.symbol);
          let answer;
          if(ownerInstrumentExcluded(job.symbol))answer={status:'OWNER_ASSET_DELIVERY_EXCLUDED',symbol:job.symbol};
          else if(matches.length!==1)answer={status:matches.length?'AMBIGUOUS_SYMBOL':'INSTRUMENT_NOT_QUALIFIED',symbol:job.symbol,candidates:matches.map(i=>i.native_symbol)};
          else try{answer=await checkInstrument(matches[0],{run_id,mode:'MANUAL',publish:job.publish,assert_execution});}catch(error){answer={status:'ERROR',reason:error.code??'MANUAL_ANALYSIS_ERROR'};}
          await finishManual(job,answer);result.manual.push({request_id:job.request_id,result:answer});if(answer.bookkeeping_error)break;continue;
        }
        if(mode!=='AUTO'||!automaticWindowOpen(clock()))break;
        budget.setMode('AUTO');const instrument=await selectAutomatic(catalog,result);if(!instrument)break;
        try{const checked=await checkInstrument(instrument,{run_id,mode:'AUTO',publish,assert_execution});if(checked.status==='DEFERRED'&&!checked.analysis){result.status='INCOMPLETE';(result.deferred??=[]).push({instrument_id:instrument.instrument_id,...checked});result.errors.push('SOURCE_BUDGET_DEFERRED');break;}result.checked.push(checked);if(checked.bookkeeping_error)break;if(globalBudgetReason(checked)){result.status='INCOMPLETE';result.errors.push('SOURCE_BUDGET_DEFERRED');break;}}
        catch(error){result.errors.push({instrument_id:instrument.instrument_id,reason:error.code??'CANDIDATE_ERROR'});await store.atomic('pump:candidate-queue',queue=>{if(queue?.[instrument.instrument_id])queue[instrument.instrument_id].next_check_ts=clock()+profile.candidate_recheck_ms;return {state:queue,result:true};});}
      }
      const bookkeeping_errors=[...result.checked,...result.manual.map(row=>row.result)].filter(row=>row.bookkeeping_error);
      if(bookkeeping_errors.length){result.status='INCOMPLETE';result.errors.push(...bookkeeping_errors.map(row=>({analysis_key:row.analysis_key,reason:row.bookkeeping_error,delivery_state:row.delivery?.state??null})));}
      else {
      // Repair a receipt-backed signal after a prior process stopped between
      // the durable SENT acknowledgement and outcome registration.
      const deliveryIds=await delivery.pending({limit:20});for(const id of deliveryIds)await recordPublished(id);
      await assert_execution();
      result.delivery=await delivery.drain();
      for(const item of result.delivery)await recordPublished(item.card_id);
      if(automaticWindowOpen(clock())){await observations.syncTerminal();result.outcomes=await checkOutcomes({run_id});}
      }
      if(result.coverage?.status==='INCOMPLETE'||result.errors.length)result.status='INCOMPLETE';
      const ready=result.checked.filter(r=>r.analysis?.ready&&r.analysis.automatic_eligible).length;
      result.discovery_result=result.status==='INCOMPLETE'?'INCOMPLETE_COVERAGE_OR_RESOURCES':ready?'READY_IDEAS_FOUND':'NO_READY_IDEAS_IN_CHECKED_SCOPE';
      result.resources=budget.summary();await store.set('pump:run:'+run_id,result);return manual?{...result,request_id:manual.request_id,manual_result:await getManualResult(manual.request_id)}:result;
    }finally{await store.atomic('pump:executor',current=>({state:current?.owner===owner?{owner:null,run_id,released_ts:clock()}:current,result:true}));}
  }
  return {execute,enqueueManual,getManualResult,checkInstrument,checkOutcomes,getSummary:observations.summary};
}
