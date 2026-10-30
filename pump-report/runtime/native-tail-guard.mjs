import {BudgetRefusal} from './budget.mjs';
export const NATIVE_TAIL_PLANS=Object.freeze({
  RUN_AUTO:{requests:41,rows_read:42,rows_written:42},
  RUN_MANUAL:{requests:120,rows_read:180,rows_written:120},
  QUEUED_MANUAL:{requests:51,rows_read:72,rows_written:54},
  CANDIDATE_SEND:{requests:94,rows_read:115,rows_written:102},
  CANDIDATE_UNSENT:{requests:41,rows_read:62,rows_written:52},
  REMEMBER:{requests:36,rows_read:36,rows_written:30},
  RECORD:{requests:59,rows_read:59,rows_written:50},
  RECOVER_ONE:{requests:211,rows_read:711,rows_written:120},
  OUTCOME_ONE:{requests:160,rows_read:600,rows_written:100}
});
export const NATIVE_RECOVERY_PREFIX='pump:native-tail-recovery:v1:ready:';
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const beforeWorkRefusal=e=>['NATIVE_SQL_QUERY_COUNT_PROTECTED','NATIVE_SQL_RUN_ENVELOPE_EXHAUSTED','NATIVE_STAGE_ACTUAL_ADMISSION_REQUIRED'].includes(e?.code);
const deferred=(kind,info,reason)=>({status:'DEFERRED_NATIVE_PROJECTION',kind,...info,reason,original_retained:true,recovery_required:true});
export function createNativeTailGuard({store,run_id,mode,clock=Date.now}={}){
  if(!store?.reserveStage||!store?.withStage||!store.admission?.evidence_ref?.endsWith(':'+run_id)||
    store.usage?.().unknown_ops!==0||store.admission.expires_ts<=clock())throw new BudgetRefusal('ACTUAL_NATIVE_TAIL_ADMISSION_REQUIRED');
  const owned=new WeakMap(),queuedManual=new WeakMap();let queuedManualClaims=0,runToken=null,projectionToken=null,projectionBusy=false,checked=0,repairCount=0,outcomeCount=0;
  const expiry=()=>store.admission.expires_ts;
  const claim=(phase,id,plan,min_time_ms=0)=>store.reserveStage({run_id,phase,workload_id:id,envelope:plan,expires_ts:expiry(),min_time_ms});
  const release=t=>{
    if(!t||store.usage().unknown_ops>0)return;
    // Keep a known failed stage closed; do not replace its actual metadata
    // failure with a secondary RELEASE_NOT_KNOWN from finally.
    const state=store.stageStatus(t);if(state.failed||state.pending)return;
    store.releaseStage(t);
  };
  const runStore=()=>{if(!runToken)throw new BudgetRefusal('NATIVE_RUN_TAIL_NOT_OWNED');return store.withStage(runToken);};
  const projectionStore=new Proxy(Object.create(null),{get(_target,key){
    if(['admission','max_requests','finalization_reserve'].includes(key))return store[key];
    if(key==='usage')return ()=>store.usage();
    if(typeof store[key]!=='function')return undefined;
    return (...args)=>{if(!projectionToken)throw new BudgetRefusal('OPAQUE_PROJECTION_STAGE_REQUIRED');return store.withStage(projectionToken)[key](...args);};
  }});
  const projection_budget=Object.freeze({async run(info,work){
    if(!info||!['REMEMBER','RECORD'].includes(info.kind)||typeof info.analysis_key!=='string'||typeof work!=='function')throw new BudgetRefusal('BOUNDED_PROJECTION_WORKLOAD_REQUIRED');
    if(projectionBusy)return deferred(info.kind,info,'PROJECTION_STAGE_ALREADY_BUSY');
    let token;
    try{token=claim('PROJECTION_'+info.kind,JSON.stringify(info),NATIVE_TAIL_PLANS[info.kind],2000);}
    catch(e){if(beforeWorkRefusal(e)&&store.usage().unknown_ops===0)return deferred(info.kind,info,e.code);throw e;}
    projectionBusy=true;projectionToken=token;
    try{return await work();} // Corrupt/readback/unknown/partial-write errors are never converted into deferral.
    finally{projectionToken=null;projectionBusy=false;release(token);}
  }});
  return Object.freeze({
    projectionStore,projection_budget,
    beginRun({operation_mode=mode}={}){
      if(runToken)throw new BudgetRefusal('NATIVE_RUN_TAIL_ALREADY_OWNED');
      runToken=claim('RUN_REQUIRED',run_id,operation_mode==='MANUAL'?NATIVE_TAIL_PLANS.RUN_MANUAL:NATIVE_TAIL_PLANS.RUN_AUTO,2000);
    },
    endStore:runStore,
    endToken:()=>runToken,
    async persistReady({analysis_key,analysis,input,remember}){
      if(!digest(analysis_key?.slice('pump:analysis:'.length))||!analysis?.ready||typeof remember!=='function')throw new BudgetRefusal('READY_ORIGINAL_REQUIRED');
      // Even UNSENT/refused publications keep the first READY original in a
      // durable, boundedly discoverable reference before optional projection.
      const key=NATIVE_RECOVERY_PREFIX+analysis_key.slice(-64),db=runStore();
      const reference=await db.atomic(key,current=>{
        if(current&&(current.analysis_key!==analysis_key||current.producer_run_id!==analysis.run_id))
          throw new BudgetRefusal('NATIVE_RECOVERY_ORIGINAL_CONFLICT');
        const retained=current??{schema:'PUMP_NATIVE_TAIL_RECOVERY_V1',analysis_key,
          producer_run_id:analysis.run_id,created_ts:clock(),card_id:null};
        return {state:retained,result:retained};
      });
      // A known journal ACK must already have a discoverable saved-original
      // reference. If this remember is interrupted, repair can reconstruct it.
      await remember({defer_index:true,native_stage:runToken,ready_reference:reference});
      return key;
    },
    claimQueuedManual({request_id}={}){
      if(mode!=='AUTO'||!runToken||queuedManualClaims>=1||typeof request_id!=='string'||!request_id||request_id.length>512)
        throw new BudgetRefusal('BOUNDED_QUEUED_MANUAL_STAGE_REQUIRED');
      const token=claim('QUEUED_MANUAL_REQUIRED',request_id,NATIVE_TAIL_PLANS.QUEUED_MANUAL,2000);
      const ticket=Object.freeze({});queuedManual.set(ticket,{token,request_id});queuedManualClaims++;
      return ticket;
    },
    queuedManualStore(ticket){
      const row=queuedManual.get(ticket);if(!row)throw new BudgetRefusal('QUEUED_MANUAL_STAGE_NOT_OWNED');
      return store.withStage(row.token);
    },
    releaseQueuedManual(ticket){
      const row=queuedManual.get(ticket);if(!row)throw new BudgetRefusal('QUEUED_MANUAL_STAGE_NOT_OWNED');
      const status=store.stageStatus(row.token);
      // Retain failed/pending/unknown obligations and the primary exception.
      if(status.failed||status.pending||store.usage().unknown_ops>0)return {status:'QUEUED_MANUAL_HOLD_RETAINED'};
      store.releaseStage(row.token);queuedManual.delete(ticket);return {status:'QUEUED_MANUAL_STAGE_CLOSED'};
    },
    claimCandidate({analysis_key,may_send}){
      const token=claim('CANDIDATE_REQUIRED',analysis_key,may_send?NATIVE_TAIL_PLANS.CANDIDATE_SEND:NATIVE_TAIL_PLANS.CANDIDATE_UNSENT,may_send?20000:2000);
      const ticket=Object.freeze({});owned.set(ticket,{token,analysis_key});return ticket;
    },
    requiredToken(ticket){const row=owned.get(ticket);if(!row)throw new BudgetRefusal('NATIVE_CANDIDATE_STAGE_NOT_OWNED');return row.token;},
    requiredStore(ticket){const row=owned.get(ticket);if(!row)throw new BudgetRefusal('NATIVE_CANDIDATE_STAGE_NOT_OWNED');return store.withStage(row.token);},
    beforeTelegram(native_stage){
      const s=store.stageStatus(native_stage);
      if(s.run_id!==run_id||s.phase!=='CANDIDATE_REQUIRED'||s.expires_ts-clock()<20000)throw new BudgetRefusal('NATIVE_TELEGRAM_TAIL_REQUIRED');
      // Remaining listed ACK/index/close path; RUN_REQUIRED and native finalize
      // are separately held. This check adds no reservation and no double count.
      if(s.remaining.requests<62||s.remaining.rows_read<83||s.remaining.rows_written<72)throw new BudgetRefusal('NATIVE_ACK_TAIL_HEADROOM_REQUIRED');
      store.check(0,0,0);
    },
    async finishCandidate(ticket,{card_id=null,delivery_state=null}={}){
      const row=owned.get(ticket);if(!row)return;
      const db=store.withStage(row.token);
      await db.atomic(NATIVE_RECOVERY_PREFIX+row.analysis_key.slice(-64),current=>{
        if(!current||current.analysis_key!==row.analysis_key)throw new BudgetRefusal('NATIVE_RECOVERY_REFERENCE_REQUIRED');
        return {state:{...current,card_id,delivery_state,updated_ts:clock()},result:true};
      });release(row.token);owned.delete(ticket);
    },
    async repairOne(work){
      if(repairCount++)return {status:'DEFERRED_NATIVE_WORK',reason:'FINITE_RECOVERY_ONE_PER_RUN'};
      let token;try{token=claim('RECOVERY','one',NATIVE_TAIL_PLANS.RECOVER_ONE,2000);}
      catch(e){if(beforeWorkRefusal(e)&&store.usage().unknown_ops===0)return {status:'DEFERRED_NATIVE_WORK',reason:e.code};throw e;}
      try{
        const db=store.withStage(token),cursorKey='pump:native-tail-recovery:v1:cursor',cursor=await db.get(cursorKey);
        let rows=await db.scanPrefix(NATIVE_RECOVERY_PREFIX,{after_key:typeof cursor?.after_key==='string'&&cursor.after_key.startsWith(NATIVE_RECOVERY_PREFIX)?cursor.after_key:NATIVE_RECOVERY_PREFIX,limit:1});
        if(!rows.length&&cursor?.after_key)rows=await db.scanPrefix(NATIVE_RECOVERY_PREFIX,{limit:1});
        if(!rows.length)return {status:'NO_RECOVERY_REFERENCE'};
        const item=rows[0],done=await work(item.value,db,token);
        await db.set(cursorKey,{after_key:item.key,recorded_ts:clock()});
        if(done===true)await db.removeWorkPointer(item.key);
        return {status:done===true?'RECOVERY_REGISTERED':'DEFERRED_NATIVE_WORK',processed:1};
      }finally{release(token);}
    },
    async outcomeOne(work){
      if(outcomeCount++)return {status:'DEFERRED_NATIVE_WORK',reason:'FINITE_OUTCOME_ONE_PER_RUN'};
      let token;try{token=claim('OUTCOME','one',NATIVE_TAIL_PLANS.OUTCOME_ONE,2000);}
      catch(e){if(beforeWorkRefusal(e)&&store.usage().unknown_ops===0)return {status:'DEFERRED_NATIVE_WORK',reason:e.code};throw e;}
      try{return await work(token);}finally{release(token);}
    },
    noteCandidate(){if(checked>=1)throw new BudgetRefusal('FINITE_NATIVE_CANDIDATE_WORKLOAD_REACHED');checked++;},
    canCheckCandidate:()=>checked<1,
    endRun(){if(runToken){release(runToken);runToken=null;}},
    usage:()=>({actual:store.usage(),stages:store.stageTotals(),checked,repairCount,outcomeCount})
  });
}
