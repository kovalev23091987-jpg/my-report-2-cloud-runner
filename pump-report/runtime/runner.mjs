import {INPUT_SCHEMA,emptyMap,factUsable,positive,ownerInstrumentExcluded,ownerPublicationRefusal} from '../contracts/index.mjs';
import {START_PROFILE} from '../profile/start-v1.mjs';
import {automaticWindowOpen,textHash} from './delivery.mjs';
import {parseManualInput} from './manual-input.mjs';
import {createOutcomeJournal} from './outcome-journal.mjs';
import {productionRecord} from '../contracts/run-purpose.mjs';

const instrumentKey=instrument=>instrument.instrument_id;
const symbolKey=text=>String(text??'').trim().toUpperCase().replace(/\s+/g,'').replace(/(?:[-/]?USDT)$/,'');
const globalBudgetReason=result=>[...(result.analysis?.reasons??[]),result.source_coverage?.reason,...Object.values(result.source_coverage?.facts??{}).map(f=>f.reason)].some(reason=>/PROTECTED_DAY|MONTH_EXHAUSTED|RUN_HTTP|RUN_MANUAL|PROVIDER_SECOND|PROVIDER_MINUTE|PROVIDER_BACKOFF|NATIVE_SQL|AUTOMATIC_WINDOW_CLOSED/.test(typeof reason==='string'?reason:reason?.code??''));

export function createPumpRunner({store,sources,analyzePump,evaluateOutcome,budget,delivery,profile=START_PROFILE,clock=Date.now,evidence_class='UNCLASSIFIED',run_purpose='UNCLASSIFIED'}){
  if(!store?.atomic||!sources?.getCore||!analyzePump||!evaluateOutcome||!budget||!delivery)throw Error('PUMP_RUNNER_DEPENDENCIES_REQUIRED');
  const manualResultKey=id=>'pump:manual-result:'+id;
  const observations=createOutcomeJournal({store,profile,clock,evidence_class});
  async function enqueueManual(symbol,{request_id=crypto.randomUUID(),publish=true,context_symbol=null}={}){
    const parsed=parseManualInput(symbol,{context_symbol});if(parsed.status!=='PARSED')return parsed;
    const normalized=parsed.symbol;
    if(ownerInstrumentExcluded(normalized))return {status:'OWNER_ASSET_DELIVERY_EXCLUDED',symbol:normalized};
    const job={request_id,symbol:normalized,publish,created_ts:clock(),status:'PENDING'};
    const accepted=await store.atomic('pump:manual:'+request_id,current=>({state:current??job,result:!current||current.symbol===normalized&&current.publish===publish}));
    if(!accepted)return {status:'REQUEST_ID_CONFLICT',request_id};
    await store.atomic('pump:manual-queue',queue=>({state:[...new Set([...(queue??[]),request_id])],result:true}));
    return {status:'QUEUED',request_id};
  }
  async function claimManual(executor_owner){
    const ids=await store.get('pump:manual-queue')??[];
    for(const id of ids){const job=await store.atomic('pump:manual:'+id,current=>{
      if(current?.status!=='PENDING'&&!(current?.status==='PROCESSING'&&current.executor_owner!==executor_owner))return {state:current,result:null};
      return {state:{...current,status:'PROCESSING',executor_owner,started_ts:clock()},result:current};
    });if(job)return job;}return null;
  }
  async function finishManual(job,result){await store.set(manualResultKey(job.request_id),result);await store.atomic('pump:manual:'+job.request_id,current=>({state:{...current,status:'COMPLETE',completed_ts:clock()},result:true}));await store.atomic('pump:manual-queue',ids=>({state:(ids??[]).filter(id=>id!==job.request_id),result:true}));}
  async function getManualResult(id){return store.get(manualResultKey(id));}

  async function updateDiscovery(catalog,run_id){
    const overview=await sources.getOverview({run_id,instruments:catalog.instruments});
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
        const near=(typeof row.reported_change_pct==='number'&&row.reported_change_pct>=profile.automatic_growth.day_pct*profile.prequeue_threshold_fraction)||(change!==null&&change>=profile.automatic_growth.short_pct*profile.prequeue_threshold_fraction);
        if(!near&&!active.includes(row.id)&&!queue[row.id])continue;
        queue[row.id]={...(queue[row.id]??{}),instrument_id:row.id,first_seen:queue[row.id]?.first_seen??now,last_seen:now,preliminary_growth:change,reported_day_growth:row.reported_change_pct,active_wave:active.includes(row.id),next_check_ts:queue[row.id]?.next_check_ts??now};
      }
      return {state:queue,result:true};
    });
    return overview.coverage;
  }
  async function selectAutomatic(catalog){
    const queue=await store.get('pump:candidate-queue')??{},now=clock();
    const candidates=Object.values(queue).filter(r=>(r.next_check_ts??0)<=now);
    const score=r=>(r.active_wave?100:0)+Math.max(0,(now-(r.last_checked_ts??r.first_seen))/60000)+Math.max(0,r.preliminary_growth??0);
    candidates.sort((a,b)=>score(b)-score(a)||a.first_seen-b.first_seen);
    const picked=candidates.find(r=>catalog.instruments.some(i=>i.instrument_id===r.instrument_id&&!ownerInstrumentExcluded(i)));
    return picked?catalog.instruments.find(i=>i.instrument_id===picked.instrument_id):null;
  }
  async function rememberAnalysis(analysis,input){
    const fingerprint=await textHash(JSON.stringify(analysis)),key='pump:analysis:'+fingerprint;
    await store.atomic(key,current=>({state:current??{analysis,input,saved_ts:clock()},result:true}));
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
      queue[id]={...(queue[id]??{first_seen:clock(),instrument_id:id}),last_checked_ts:clock(),next_check_ts:clock()+profile.candidate_recheck_ms,last_status:analysis.status,active_wave:Boolean(wave&&(wave.expires_ts??0)>clock())};
      return {state:queue,result:true};
    });
    await observations.remember(analysis,input,key);
    return key;
  }
  async function checkInstrument(instrument,{run_id,mode,publish=true,assert_execution=async()=>{}}){
    if(ownerInstrumentExcluded(instrument))return {status:'OWNER_ASSET_DELIVERY_EXCLUDED',symbol:instrument.base,delivery:null};
    budget.setMode(mode);
    await assert_execution();
    const overview=await sources.getOverview({run_id,instruments:[instrument]});
    const overviewFacts=overview.observations?.[0]?.facts??{};
    const day=typeof sources.getDayGrowth==='function'?await sources.getDayGrowth({instrument,run_id,mode}):null;
    const core=await sources.getCore({instrument,run_id,mode,existing_facts:overviewFacts}),previous_wave=await store.get('pump:wave:'+instrumentKey(instrument));
    let input={schema_version:INPUT_SCHEMA,run_id,mode,run_purpose,analysis_ts:clock(),instrument,facts:{...overviewFacts,...core.facts,...(day?.facts??{})},liquidations:emptyMap(),previous_wave};
    let analysis=analyzePump(input,profile);
    if(analysis.ready){
      await assert_execution();
      const optional=await sources.getOptional({instrument,run_id,mode,facts:core.facts});
      input.facts={...input.facts,...optional.facts};
      try{input.liquidations=await sources.getLiquidations({instrument,run_id,reference_price:analysis.reference_price,deadline_ts:clock()+profile.liquidation_deadline_ms});}
      catch(error){input.liquidations=emptyMap(/BUDGET|RESERVE|QUOTA/.test(error.code??'')?'NOT_CHECKED_BUDGET':'ERROR',error.code??'OPTIONAL_MAP_ERROR');}
      input.analysis_ts=clock();analysis=analyzePump(input,profile);
    }
    const analysis_key=await rememberAnalysis(analysis,input);let delivered=null;
    const publicationRefusal=ownerPublicationRefusal(analysis);
    if(publish&&analysis.ready&&publicationRefusal)delivered={state:'SUPPRESSED',reason:publicationRefusal};
    if(publish&&analysis.ready&&!publicationRefusal&&(mode==='MANUAL'||analysis.automatic_eligible)){
      await assert_execution();
      const expires=Math.min(...['price','orderbook','candles'].map(key=>input.facts[key]?.expires_ts??0));
      if(expires>clock()){
        const card=await delivery.enqueue({...analysis,source_input_key:analysis_key},{mode,expires_ts:expires,update_kind:analysis.update_kind??null});
        delivered=await delivery.dispatch(card.card_id);
        await recordPublished(card.card_id);
      }else delivered={state:'STALE',reason:'MANDATORY_FACT_EXPIRED_BEFORE_PUBLICATION'};
    }
    return {analysis_key,analysis,delivery:delivered,source_coverage:core.coverage};
  }
  async function recordPublished(card_id){
    const card=await store.get('pump:card:'+card_id);if(!card)return;
    if(['SENT','UNKNOWN','ERROR','STALE'].includes(card.state))await observations.publication(card_id);
    if(['SENT','UNKNOWN','ERROR','STALE','SUPPRESSED'].includes(card.state))await store.atomic('pump:delivery-queue',ids=>({state:(ids??[]).filter(id=>id!==card_id),result:true}));
  }
  async function checkOutcomes({run_id}){
    if(!automaticWindowOpen(clock()))return [];
    budget.setMode('STATISTICS');
    const pending=await store.get('pump:outcomes-pending')??[],results=[];
    for(const key of pending){
      const summary=budget.summary();if(summary.lanes.statistics>=summary.limits.lanes.statistics||summary.total>=summary.limits.http_per_run){results.push({status:'DEFERRED',reason:'STATISTICS_HTTP_BUDGET_EXHAUSTED'});break;}
      if(store.admission&&typeof store.usage==='function'){const used=store.usage();if(used.rows_read+500>store.admission.max_rows_read||used.rows_written+30>store.admission.max_rows_written){results.push({status:'DEFERRED',reason:'STATISTICS_NATIVE_ENVELOPE_PROTECTED'});break;}}
      const signal=await store.get(key);if(!signal||signal.deadline_ts>clock())continue;
      if(!productionRecord({origin:signal.origin})){results.push({signal_id:signal.signal_id,status:'SKIPPED_NON_PRODUCTION',reason:'TEST_OR_UNCLASSIFIED_ORIGIN_RETAINED_FOR_AUDIT'});continue;}
      const saved=await store.get('pump:outcome:'+signal.signal_id);if(saved?.status==='HIT'||saved?.status==='MISS'){await store.atomic('pump:outcomes-pending',ids=>({state:(ids??[]).filter(id=>id!==key),result:true}));continue;}
      if(typeof sources.getOutcomeHistory!=='function'){results.push({signal_id:signal.signal_id,status:'UNKNOWN',reason:'OUTCOME_HISTORY_ROUTE_NOT_CONNECTED'});continue;}
      const history=await sources.getOutcomeHistory({instrument:signal.instrument,run_id,start_ts:signal.t0,end_ts:signal.deadline_ts});
      if(/BUDGET|RESERVE|EXHAUSTED|BACKOFF/.test(history.coverage?.reason??history.facts?.candles?.reason??'')){results.push({signal_id:signal.signal_id,status:'DEFERRED',reason:history.coverage?.reason??history.facts.candles.reason});break;}
      const outcome=evaluateOutcome({signal,candles:history.facts?.candles?.value??[],price_points:[],as_of_ts:clock()});
      await store.set('pump:outcome:'+signal.signal_id,outcome);await observations.record(signal,outcome);results.push(outcome);
      await store.atomic('pump:outcomes-pending',ids=>{const rest=(ids??[]).filter(id=>id!==key);return {state:['HIT','MISS'].includes(outcome.status)?rest:[...rest,key],result:true};});
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
    const result={run_id,status:'COMPLETE',checked:[],manual:[],coverage:null,outcomes:[],delivery:[],errors:[]};
    try{
      const sourceCatalog=await sources.getCatalog({run_id}),catalog={...sourceCatalog,instruments:sourceCatalog.instruments.filter(i=>!ownerInstrumentExcluded(i))};result.catalog_coverage={...catalog.coverage,owner_delivery_excluded:sourceCatalog.instruments.filter(ownerInstrumentExcluded).map(i=>i.instrument_id),verified_crypto_count:sourceCatalog.instruments.length,delivery_eligible_verified_count:catalog.instruments.length};
      if(!catalog.instruments.length){result.status='INCOMPLETE';result.errors.push(catalog.coverage.reason??'NO_VERIFIED_INSTRUMENTS');}
      const unresolved=(catalog.unqualified??[]).filter(row=>['CRYPTO_ASSET_IDENTITY_UNQUALIFIED','CATALOG_REGISTRY_IDENTITY_MISMATCH','MISSING_OR_DUPLICATE_NATIVE_SYMBOL','INVALID_CATALOG_ROW'].includes(row.reason));
      if(unresolved.length){result.status='INCOMPLETE';result.errors.push({reason:'UNIVERSE_QUALIFICATION_INCOMPLETE',unqualified:unresolved.length});}
      if(mode==='AUTO'&&catalog.instruments.length)result.coverage=await updateDiscovery(catalog,run_id);
      let job;
      for(;;){
        try{await assert_execution();}catch{result.status='INCOMPLETE';result.errors.push('EXECUTOR_LEASE_EXPIRED');break;}
        const pending=await store.get('pump:manual-queue')??[];
        let hasManual=false;for(const id of pending){if(['PENDING','PROCESSING'].includes((await store.get('pump:manual:'+id))?.status)){hasManual=true;break;}}
        budget.setMode(hasManual?'MANUAL':mode);
        if(!capacity()){result.status='INCOMPLETE';result.errors.push('RUN_RESOURCES_DEFERRED');break;}
        job=await claimManual(owner);
        if(job){
          const matches=catalog.instruments.filter(i=>symbolKey(i.native_symbol)===job.symbol||i.base.toUpperCase()===job.symbol);
          let answer;
          if(ownerInstrumentExcluded(job.symbol))answer={status:'OWNER_ASSET_DELIVERY_EXCLUDED',symbol:job.symbol};
          else if(matches.length!==1)answer={status:matches.length?'AMBIGUOUS_SYMBOL':'INSTRUMENT_NOT_QUALIFIED',symbol:job.symbol,candidates:matches.map(i=>i.native_symbol)};
          else try{answer=await checkInstrument(matches[0],{run_id,mode:'MANUAL',publish:job.publish,assert_execution});}catch(error){answer={status:'ERROR',reason:error.code??'MANUAL_ANALYSIS_ERROR'};}
          await finishManual(job,answer);result.manual.push({request_id:job.request_id,result:answer});continue;
        }
        if(mode!=='AUTO'||!automaticWindowOpen(clock()))break;
        budget.setMode('AUTO');const instrument=await selectAutomatic(catalog);if(!instrument)break;
        try{const checked=await checkInstrument(instrument,{run_id,mode:'AUTO',publish,assert_execution});result.checked.push(checked);if(globalBudgetReason(checked)){result.status='INCOMPLETE';result.errors.push('SOURCE_BUDGET_DEFERRED');break;}}
        catch(error){result.errors.push({instrument_id:instrument.instrument_id,reason:error.code??'CANDIDATE_ERROR'});await store.atomic('pump:candidate-queue',queue=>{if(queue?.[instrument.instrument_id])queue[instrument.instrument_id].next_check_ts=clock()+profile.candidate_recheck_ms;return {state:queue,result:true};});}
      }
      // Repair a receipt-backed signal after a prior process stopped between
      // the durable SENT acknowledgement and outcome registration.
      const deliveryIds=await store.get('pump:delivery-queue')??[];for(const id of deliveryIds)await recordPublished(id);
      await assert_execution();
      result.delivery=await delivery.drain();
      for(const item of result.delivery)await recordPublished(item.card_id);
      if(automaticWindowOpen(clock())){await observations.syncTerminal();result.outcomes=await checkOutcomes({run_id});}
      if(result.coverage?.status==='INCOMPLETE'||result.errors.length)result.status='INCOMPLETE';
      const ready=result.checked.filter(r=>r.analysis.ready&&r.analysis.automatic_eligible).length;
      result.discovery_result=result.status==='INCOMPLETE'?'INCOMPLETE_COVERAGE_OR_RESOURCES':ready?'READY_IDEAS_FOUND':'NO_READY_IDEAS_IN_CHECKED_SCOPE';
      result.resources=budget.summary();await store.set('pump:run:'+run_id,result);return manual?{...result,request_id:manual.request_id,manual_result:await getManualResult(manual.request_id)}:result;
    }finally{await store.atomic('pump:executor',current=>({state:current?.owner===owner?{owner:null,run_id,released_ts:clock()}:current,result:true}));}
  }
  return {execute,enqueueManual,getManualResult,checkInstrument,checkOutcomes,getSummary:observations.summary};
}
