// TEXT PROPOSAL. No acquisition, reader, scheduler, schema or sender.
import {capturedHtxAnomalyBasis} from './htx-signed-tape.mjs';
import {canonical,digest,DOMAIN_BOUNDS,opaqueHtxDescriptor,nativeRecordCompatibility,lockedOutcomePlan,prepareAnomalyCommit} from './anomaly-native-domain.mjs';
import {newMemory,observe,draftNotice,opaqueRecordInstrument,TIMEFRAMES,hash} from './anomaly-record-observer.mjs';
const need=(ok,reason)=>{if(!ok)throw Error(reason);},clone=structuredClone;
const clock=v=>Number.isSafeInteger(v)&&v>=1e12,hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const QUAL=Object.freeze({native_epoch_qualified:false,event_first_knowledge_qualified:false,native_admission_qualified:false,SENT_claimed:false});
const MIN=60000,CONFIRM={...TIMEFRAMES,'1m':MIN,'5m':5*MIN};
const REASONS=new Set(['DUE_REVISION_CHANGED','NO_SAME_COMPLETED_CAPTURE','CLOSED_WINDOW_UNAVAILABLE','CAPTURE_RECORD_MISMATCH','CLOSED_WINDOW_ALREADY_OBSERVED','WATCH_INACTIVE_PENDING_OUTCOMES']);
function terminal(origin,reason,detail){
  need(REASONS.has(reason),'DUE_DEFER_REASON_REQUIRED');
  return{status:'DUE_DEFERRED',logical_event_id:origin.logical_event_id,expected_revision:origin.revision,first_known_ts:origin.first_known_ts,...Object.fromEntries(['card','descriptor','plan'].map(n=>[n+'_sha256',origin[n+'_sha256']])),reason,detail,write_required:false,durable_new_observation:false,...QUAL};
}
function checkedOrigin(origin,id){
  need(origin?.schema==='VERIFIED_RETAINED_ANOMALY_ORIGIN_V1'&&origin.logical_event_id===id,'CURRENT_VERIFIED_ORIGIN_REQUIRED');
  for(const n of ['card','descriptor','plan','state']){
    need(typeof origin[n+'_json']==='string'&&Buffer.byteLength(origin[n+'_json'])<=DOMAIN_BOUNDS[n]&&hex(origin[n+'_sha256']),'ORIGIN_BOUND_REQUIRED');
    need(digest(origin[n+'_json'])===origin[n+'_sha256']&&canonical(origin[n])===origin[n+'_json'],'ORIGIN_PART_CONFLICT');
  }
  const rebuilt=prepareAnomalyCommit({logical_event_id:id,operation_id:origin.operation_id,expected_revision:origin.revision-1,card:origin.card,descriptor:origin.descriptor,plan:origin.plan,state:origin.state});
  need(rebuilt.request.request_sha256===origin.request_sha256&&origin.first_known_ts===origin.card.first_known_ts,'CURRENT_ORIGIN_REQUEST_CONFLICT');
  need(canonical(origin.plan)===canonical(lockedOutcomePlan(origin.card))&&canonical(origin.card.instrument)===canonical(opaqueRecordInstrument(origin.descriptor)),'ORIGINAL_PLAN_OR_INSTRUMENT_CONFLICT');
}
function lastClosedCapture(origin,now_ts){
  const basis=capturedHtxAnomalyBasis({contract:origin.descriptor.contract_code,now:now_ts});
  if(!basis)return{reason:'NO_SAME_COMPLETED_CAPTURE',detail:'MISSING_OR_EXPIRED_SAME_PROCESS_BASIS'};
  const p=basis.minutes,receipt=basis.body_receipt,k=receipt?.body_knowledge;
  need(receipt?.stage==='COMPLETED'&&k?.hash_status==='TEXT_HASH_RECORDED'&&hex(k.body_text_sha256)&&receipt.captured_payload_sha256===digest(JSON.stringify(p)),'CAPTURE_BODY_BINDING_REQUIRED');
  need([p.ts,basis.minutes_observed_ts,k.body_completed_ts,basis.material_available_ts].every(clock)&&p.ts<=k.body_completed_ts&&k.body_completed_ts<=basis.minutes_observed_ts&&basis.material_available_ts<=now_ts,'CAPTURE_CLOCK_ORDER_REQUIRED');
  const descriptor=opaqueHtxDescriptor({metadata:basis.metadata,contract:basis.contract,observed_ts:basis.metadata_observed_ts,source_ref:'SAME_HTX_DEEP_CAPTURE_METADATA_RECORD'});
  if(nativeRecordCompatibility(origin.descriptor,descriptor)!=='SAME_OPAQUE_RECORD_NOT_QUALIFIED_EPOCH')return{reason:'CAPTURE_RECORD_MISMATCH',detail:'CURRENT_NATIVE_RECORD_OR_MULTIPLIER_DIFFERS'};
  need(p.status==='ok'&&p.ch===`market.${basis.contract}.kline.1min`&&Array.isArray(p.data)&&p.data.length<=2000,'CAPTURE_NATIVE_MINUTES_REQUIRED');
  const tf=origin.card.conditions?.timeframe,d=CONFIRM[tf],eventDuration=TIMEFRAMES[origin.card.timeframe],offset=origin.card.alignment_offset_ms;
  if(!d||!eventDuration||eventDuration<d||eventDuration%d!==0||!Number.isSafeInteger(offset)||offset<0||offset>=eventDuration)return{reason:'CLOSED_WINDOW_UNAVAILABLE',detail:'CONFIRMATION_ALIGNMENT_NOT_DERIVABLE'};
  const alignment=offset%d,end=Math.floor((p.ts-alignment)/d)*d+alignment,start=end-d;
  if(d/MIN>2000||start<origin.first_known_ts||end>now_ts||now_ts-end>300000)return{reason:'CLOSED_WINDOW_UNAVAILABLE',detail:'WINDOW_BEFORE_FIRST_KNOWN_STALE_OR_OUTSIDE_CAPTURE_BOUND'};
  const by=new Map();
  for(const r of p.data){need(Number.isSafeInteger(r?.id)&&r.id>0&&!by.has(r.id*1000),'CAPTURE_DUPLICATE_OR_INVALID_MINUTE');by.set(r.id*1000,r);}
  const number=v=>{need((typeof v==='number'||typeof v==='string'&&/^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v))&&Number.isFinite(Number(v)),'CAPTURE_RAW_NUMBER_REQUIRED');return Number(v);};
  const parts=[];
  for(let t=start;t<end;t+=MIN){
    const r=by.get(t);if(!r)return{reason:'CLOSED_WINDOW_UNAVAILABLE',detail:'EXACT_MINUTE_GRID_HAS_GAP'};
    const b={open:number(r.open),high:number(r.high),low:number(r.low),close:number(r.close),volume:number(r.trade_turnover)};
    need([b.open,b.high,b.low,b.close].every(v=>v>0)&&b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close)&&b.low<=b.high&&b.volume>=0,'CAPTURE_OHLCV_GEOMETRY');parts.push(b);
  }
  const candle={timeframe:tf,start_ts:start,end_ts:end,open:parts[0].open,high:Math.max(...parts.map(x=>x.high)),low:Math.min(...parts.map(x=>x.low)),close:parts.at(-1).close,volume:parts.reduce((n,x)=>n+x.volume,0),raw_sha256:k.body_text_sha256};
  need(Number.isFinite(candle.volume),'CAPTURE_VOLUME_OVERFLOW');
  const fact_hash=hash(Object.fromEntries(['timeframe','start_ts','end_ts','open','high','low','close','volume'].map(n=>[n,candle[n]])));
  return{candle,fact_hash,alignment,source_as_of_ts:p.ts,received_ts:basis.minutes_observed_ts,body_completed_ts:k.body_completed_ts,raw_sha256:k.body_text_sha256,raw_ref:'HTX_CAPTURE_TEXT_SHA256:'+k.body_text_sha256,metadata_row_sha256:descriptor.parsed_metadata_row_sha256};
}
export function capturedOriginalOutcomeWindows({origin,now_ts}={}){
  let cells=[];
  const out={status:'CAPTURED_ORIGINAL_OUTCOME_WINDOWS_V1',logical_event_id:null,revision:null,card_sha256:null,descriptor_sha256:null,plan_sha256:null,first_known_ts:null,now_ts:clock(now_ts)?now_ts:null,source_as_of_ts:null,received_ts:null,body_completed_ts:null,body_text_sha256:null,raw_body_sha256:null,metadata_row_sha256:null,record_compatibility:null,quote:'USDT',price_unit:'HTX_NATIVE_LINEAR_PRICE',windows:[],summary_sha256:null,provenance_sha256:null,source_HTTP:0,SQL:0,...QUAL};
  const deferred=(c,reason)=>({key:c.key,direction:c.direction,horizon_ms:c.horizon_ms,target_ts:c.target_ts,start_ts:origin.card.event_end_ts,end_ts:c.target_ts,status:'DEFERRED',reason,minutes:null,expected_minutes:null,first_open:null,last_close:null,high:null,low:null,window_sha256:null});
  const finish=reason=>{
    if(reason){out.reason=reason;out.windows=cells.map(c=>deferred(c,reason));}
    out.summary_sha256=digest({logical_event_id:out.logical_event_id,revision:out.revision,card_sha256:out.card_sha256,descriptor_sha256:out.descriptor_sha256,plan_sha256:out.plan_sha256,windows:out.windows,quote:out.quote,price_unit:out.price_unit});
    if(Buffer.byteLength(canonical(out))>16384){out.reason='OUTCOME_WINDOW_DTO_BOUND';out.windows=cells.map(c=>deferred(c,out.reason));out.summary_sha256=digest({logical_event_id:out.logical_event_id,revision:out.revision,card_sha256:out.card_sha256,descriptor_sha256:out.descriptor_sha256,plan_sha256:out.plan_sha256,windows:out.windows,quote:out.quote,price_unit:out.price_unit});}
    return out;
  };
  try{checkedOrigin(origin,origin?.logical_event_id);}catch{return finish('ORIGIN_NOT_CLOSED');}
  cells=origin.plan.cells;
  Object.assign(out,{logical_event_id:origin.logical_event_id,revision:origin.revision,card_sha256:origin.card_sha256,descriptor_sha256:origin.descriptor_sha256,plan_sha256:origin.plan_sha256,first_known_ts:origin.first_known_ts});
  if(!clock(now_ts)||now_ts>Date.now()||now_ts<origin.state.evaluated_ts)return finish('EVALUATION_CLOCK_NOT_CLOSED');
  try{
    const basis=capturedHtxAnomalyBasis({contract:origin.descriptor.contract_code,now:now_ts});
    if(!basis)return finish('NO_SAME_COMPLETED_CAPTURE');
    const p=basis.minutes,r=basis.body_receipt,k=r?.body_knowledge;
    need(r?.stage==='COMPLETED'&&k?.hash_status==='TEXT_HASH_RECORDED'&&hex(k.body_text_sha256)&&r.captured_payload_sha256===digest(JSON.stringify(p)),'CAPTURE_BODY_BINDING_REQUIRED');
    need([p.ts,basis.minutes_observed_ts,k.body_completed_ts,basis.material_available_ts].every(clock)&&p.ts<=k.body_completed_ts&&k.body_completed_ts<=basis.minutes_observed_ts&&basis.material_available_ts<=now_ts,'CAPTURE_CLOCK_ORDER_REQUIRED');
    const descriptor=opaqueHtxDescriptor({metadata:basis.metadata,contract:basis.contract,observed_ts:basis.metadata_observed_ts,source_ref:'SAME_HTX_ORIGINAL_OUTCOME_CAPTURE'});
    const compatibility=nativeRecordCompatibility(origin.descriptor,descriptor);
    if(compatibility!=='SAME_OPAQUE_RECORD_NOT_QUALIFIED_EPOCH')return finish('CAPTURE_RECORD_MISMATCH');
    need(p.status==='ok'&&p.ch===`market.${basis.contract}.kline.1min`&&Array.isArray(p.data)&&p.data.length<=2000,'CAPTURE_NATIVE_MINUTES_REQUIRED');
    Object.assign(out,{source_as_of_ts:p.ts,received_ts:basis.minutes_observed_ts,body_completed_ts:k.body_completed_ts,body_text_sha256:k.body_text_sha256,metadata_row_sha256:descriptor.parsed_metadata_row_sha256,record_compatibility:compatibility});
    out.provenance_sha256=digest({source_as_of_ts:out.source_as_of_ts,received_ts:out.received_ts,body_completed_ts:out.body_completed_ts,body_text_sha256:out.body_text_sha256,metadata_row_sha256:out.metadata_row_sha256,record_compatibility:compatibility,captured_payload_sha256:r.captured_payload_sha256});
    const by=new Map();
    for(const row of p.data){const t=row?.id*1000;if(!Number.isSafeInteger(row?.id)||row.id<=0||!Number.isSafeInteger(t)||t%MIN!==0||by.has(t))return finish('CAPTURE_GRID_INVALID');by.set(t,row);}
    const number=v=>{need((typeof v==='number'||typeof v==='string'&&/^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v))&&Number.isFinite(Number(v)),'CAPTURE_RAW_NUMBER_REQUIRED');return Number(v);};
    const record=Object.fromEntries(['venue','market','contract_code','symbol','pair','business_type','contract_type','trade_partition','raw_native_listing_date','raw_contract_size'].map(n=>[n,origin.descriptor[n]])),cache=new Map();
    out.windows=cells.map(c=>{
      const start=origin.card.event_end_ts,end=c.target_ts,count=(end-start)/MIN;
      if(end>now_ts)return deferred(c,'NOT_MATURE');
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start%MIN!==0||end%MIN!==0||!Number.isSafeInteger(count)||count<1)return deferred(c,'UNSUPPORTED_MINUTE_ALIGNMENT');
      if(count>2000)return deferred(c,'WINDOW_EXCEEDS_CAPTURE_BOUND');
      if(end>p.ts)return deferred(c,'SOURCE_ASOF_BEFORE_TARGET');
      if(cache.has(end)){const x=cache.get(end);return x.reason?deferred(c,x.reason):{...x,key:c.key,direction:c.direction,horizon_ms:c.horizon_ms};}
      const parts=[];
      for(let t=start;t<end;t+=MIN){
        const row=by.get(t);if(!row){cache.set(end,{reason:'WINDOW_GRID_GAP'});return deferred(c,'WINDOW_GRID_GAP');}
        let b;try{b={start_ts:t,open:number(row.open),high:number(row.high),low:number(row.low),close:number(row.close),volume:number(row.trade_turnover)};need([b.open,b.high,b.low,b.close].every(v=>v>0)&&b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close)&&b.low<=b.high&&b.volume>=0,'CAPTURE_OHLCV_GEOMETRY');}catch{cache.set(end,{reason:'WINDOW_OHLCV_INVALID'});return deferred(c,'WINDOW_OHLCV_INVALID');}parts.push(b);
      }
      if(!Number.isFinite(parts.reduce((s,b)=>s+b.volume,0))){cache.set(end,{reason:'WINDOW_OHLCV_INVALID'});return deferred(c,'WINDOW_OHLCV_INVALID');}
      const fact={schema:'ORIGINAL_EVENT_END_CLOSED_MINUTE_WINDOW_FACT_V1',record,start_ts:start,end_ts:end,quote:out.quote,price_unit:out.price_unit,minutes:parts};
      const window={key:c.key,direction:c.direction,horizon_ms:c.horizon_ms,target_ts:end,start_ts:start,end_ts:end,status:'COMPLETE_CLOSED_MINUTE_WINDOW',reason:null,minutes:parts.length,expected_minutes:count,first_open:parts[0].open,last_close:parts.at(-1).close,high:Math.max(...parts.map(b=>b.high)),low:Math.min(...parts.map(b=>b.low)),window_sha256:digest(fact)};
      cache.set(end,window);return window;
    });
    return finish();
  }catch{return finish('CAPTURE_NOT_CLOSED');}
}

// Insert into the EXISTING due-watch module before prepareCapturedDueWatch.
export function evaluateOriginalEventOutcomes({origin,projection,now_ts}={}){
  checkedOrigin(origin,origin?.logical_event_id);
  const outcomes=clone(origin.state.outcomes),closed_keys=[],deferred=[];
  const pending=origin.plan.cells.filter(c=>outcomes[c.key].status==='PENDING');
  const refused=reason=>({outcomes,closed_keys:[],deferred:pending.map(c=>({key:c.key,reason})),closure_fingerprints:[],status:'ORIGINAL_OUTCOMES_DEFERRED'});
  const finite=v=>typeof v==='number'&&Number.isFinite(v),positive=v=>finite(v)&&v>0;
  const card=origin.card,A=card.anchor?.price;
  if(!clock(now_ts)||now_ts>Date.now()||now_ts<origin.state.evaluated_ts)return refused('EVALUATION_CLOCK_NOT_CLOSED');
  if(!positive(A)||A!==card.candle?.close||card.anchor?.source_ts!==card.event_end_ts||card.candle?.end_ts!==card.event_end_ts)return refused('ORIGINAL_ANCHOR_NOT_COHERENT');
  const q=projection;
  if(!q||q.status!=='CAPTURED_ORIGINAL_OUTCOME_WINDOWS_V1'||Buffer.byteLength(canonical(q))>16384||!Array.isArray(q.windows))return refused('OUTCOME_PROJECTION_NOT_CLOSED');
  if(q.logical_event_id!==origin.logical_event_id||q.revision!==origin.revision||q.first_known_ts!==origin.first_known_ts||q.now_ts!==now_ts||['card','descriptor','plan'].some(n=>q[n+'_sha256']!==origin[n+'_sha256'])||q.quote!=='USDT'||q.price_unit!=='HTX_NATIVE_LINEAR_PRICE'||Object.keys(QUAL).some(n=>q[n]!==false)||q.source_HTTP!==0||q.SQL!==0)return refused('OUTCOME_PROJECTION_BINDING_MISMATCH');
  if(q.windows.length!==origin.plan.cells.length)return refused('OUTCOME_PROJECTION_INCOMPLETE');
  const summary={logical_event_id:q.logical_event_id,revision:q.revision,card_sha256:q.card_sha256,descriptor_sha256:q.descriptor_sha256,plan_sha256:q.plan_sha256,windows:q.windows,quote:q.quote,price_unit:q.price_unit};
  if(q.summary_sha256!==digest(summary))return refused('OUTCOME_SUMMARY_MISMATCH');
  const by=new Map();
  for(const w of q.windows){if(!w||by.has(w.key))return refused('OUTCOME_CELL_DUPLICATE');by.set(w.key,w);}
  const complete=w=>w?.status==='COMPLETE_CLOSED_MINUTE_WINDOW';
  const physical=w=>Object.fromEntries(['start_ts','end_ts','minutes','expected_minutes','first_open','last_close','high','low','window_sha256'].map(n=>[n,w[n]]));
  for(const c of origin.plan.cells){
    const w=by.get(c.key);
    if(!w||w.direction!==c.direction||w.horizon_ms!==c.horizon_ms||w.target_ts!==c.target_ts||w.start_ts!==card.event_end_ts||w.end_ts!==c.target_ts)return refused('OUTCOME_CELL_PLAN_MISMATCH');
    if(!['DEFERRED','COMPLETE_CLOSED_MINUTE_WINDOW'].includes(w.status))return refused('OUTCOME_CELL_STATUS_INVALID');
    if(complete(w)){
      const count=c.horizon_ms/MIN;
      if(w.reason!==null||!Number.isInteger(count)||count<1||count>2000||w.minutes!==count||w.expected_minutes!==count||w.start_ts%MIN!==0||w.end_ts%MIN!==0||c.target_ts>now_ts||![q.source_as_of_ts,q.received_ts,q.body_completed_ts].every(clock)||q.source_as_of_ts<c.target_ts||q.source_as_of_ts>q.body_completed_ts||q.body_completed_ts>q.received_ts||q.received_ts>now_ts||now_ts-q.received_ts>120000||!hex(q.body_text_sha256)||q.raw_body_sha256!==null||!hex(q.metadata_row_sha256)||!hex(q.provenance_sha256)||q.record_compatibility!=='SAME_OPAQUE_RECORD_NOT_QUALIFIED_EPOCH'||!hex(w.window_sha256)||![w.first_open,w.last_close,w.high,w.low].every(positive)||w.low>Math.min(w.first_open,w.last_close)||w.high<Math.max(w.first_open,w.last_close)||w.low>w.high)return refused('OUTCOME_COMPLETE_FACTS_NOT_CLOSED');
      const sibling=origin.plan.cells.find(x=>x.horizon_ms===c.horizon_ms&&x.direction!==c.direction),other=by.get(sibling?.key);
      if(!complete(other)||canonical(physical(other))!==canonical(physical(w)))return refused('OUTCOME_DIRECTIONAL_WINDOW_CONFLICT');
    }else if(typeof w.reason!=='string'||!w.reason||['minutes','expected_minutes','first_open','last_close','high','low','window_sha256'].some(n=>w[n]!==null))return refused('OUTCOME_DEFERRED_FACTS_INVALID');
  }
  const closure_fingerprints=[];
  for(const c of pending){
    const w=by.get(c.key);
    if(!complete(w)){deferred.push({key:c.key,reason:w.reason});continue;}
    const retained=origin.plan.cells.filter(x=>x.horizon_ms===c.horizon_ms).map(x=>outcomes[x.key]).filter(x=>x.status==='CLOSED_FACTUAL');
    if(retained.some(x=>x.schema!=='ORIGINAL_EVENT_OUTCOME_FACTS_V1'||x.window_sha256!==w.window_sha256||x.anchor?.price!==A||x.anchor?.source_ts!==card.event_end_ts||canonical(x.window)!==canonical(physical(w)))){deferred.push({key:c.key,reason:'RETAINED_FACTUAL_WINDOW_CONFLICT_OR_UNPROVEN'});continue;}
    const sign=c.direction==='LONG'?1:-1,ret=sign*100*(w.last_close/A-1),up=sign*100*(w.high/A-1),down=sign*100*(w.low/A-1);
    if(![ret,up,down].every(Number.isFinite)){deferred.push({key:c.key,reason:'OUTCOME_ARITHMETIC_NOT_FINITE'});continue;}
    const zero=v=>Object.is(v,-0)?0:v,fp=digest({kind:'ORIGINAL_EVENT_OUTCOME_FACTS_V1',logical_event_id:origin.logical_event_id,key:c.key,window_sha256:w.window_sha256,anchor:{price:A,source_ts:card.event_end_ts}});
    outcomes[c.key]={schema:'ORIGINAL_EVENT_OUTCOME_FACTS_V1',status:'CLOSED_FACTUAL',target_ts:c.target_ts,direction:c.direction,horizon_ms:c.horizon_ms,anchor:clone(card.anchor),window:physical(w),window_sha256:w.window_sha256,closure_fingerprint:fp,directional_price_return_pct:zero(ret),mfe_pct:zero(Math.max(0,up,down)),mae_pct:zero(Math.min(0,up,down)),formula:'s=LONG:+1,SHORT:-1;return=s*100*(C/A-1);MFE=max(0,s*100*(H/A-1),s*100*(L/A-1));MAE=min(0,s*100*(H/A-1),s*100*(L/A-1))',quote:q.quote,price_unit:q.price_unit,intrabar_order:'UNKNOWN',classification:'NOT_CLASSIFIED',execution_or_PnL_claimed:false,price_source_ts:c.target_ts,first_known_ts:origin.first_known_ts,recorded_by_worker_ts:now_ts,source_as_of_ts:q.source_as_of_ts,received_ts:q.received_ts,body_completed_ts:q.body_completed_ts,body_text_sha256:q.body_text_sha256,raw_body_sha256:null,metadata_row_sha256:q.metadata_row_sha256,provenance_sha256:q.provenance_sha256,...QUAL};
    closed_keys.push(c.key);closure_fingerprints.push(fp);
  }
  return{status:closed_keys.length?'ORIGINAL_OUTCOMES_FACTUAL':'ORIGINAL_OUTCOMES_DEFERRED',outcomes,closed_keys,deferred,closure_fingerprints};
}
// ONE closed check => one new DRAFT. This is not delivery/READY/admission.
function groupClosedWatchDrafts({origin,snapshot_id,snapshot,observed,fingerprint}){
  const entries=Object.entries(observed.state.outbox);
  need(observed.status==='OBSERVED'&&entries.length<=2,'BOUNDED_CURRENT_WATCH_TRANSITIONS_REQUIRED');
  if(entries.length===0)return{};
  const directions=new Set();
  for(const [id,o] of entries){
    const t=o?.transition,{transition_id,...body}=t||{};
    need(o?.status==='DRAFT'&&o.message_id===null&&o.network_send_enabled===false&&transition_id===id&&hash(body)===id,'EXACT_OBSERVER_DRAFT_TRANSITION_REQUIRED');
    need(t.event_id===origin.card.event_id&&t.snapshot_id===snapshot_id&&t.source_ts===snapshot.source_ts&&t.raw_sha256===snapshot.raw_sha256&&t.entry_authorized===false&&['LONG','SHORT'].includes(t.direction)&&!directions.has(t.direction)&&['CONFIRMED','REFUTED'].includes(t.to),'SAME_CLOSED_CHECK_TRANSITION_REQUIRED');
    directions.add(t.direction);
  }
  entries.sort((a,b)=>a[1].transition.direction==='LONG'?-1:b[1].transition.direction==='LONG'?1:0);
  const [firstId,firstOutbox]=entries[0],first=firstOutbox.transition,firstNotice=draftNotice(observed.state,firstId).text;
  if(entries.length===1)return{['watch:'+firstId]:{status:'DRAFT',form_status:'NOT_APPROVED',actual_send:false,source_snapshot_id:snapshot_id,message_ru:firstNotice,transition:clone(first)}};
  const second=entries[1][1].transition;
  need(first.observed_ts===second.observed_ts&&first.timeliness===second.timeliness&&canonical(first.closed_window)===canonical(second.closed_window)&&canonical(first.gap_details_complete??null)===canonical(second.gap_details_complete??null),'MIXED_CHECK_TRANSITIONS_NOT_GROUPED');
  // Retain the current renderer's facts, clocks, gaps and caution, changing only
  // its one-state clause into the two factual transitions of this same check.
  const begin='Сейчас ',end=' по закрытой ',start=firstNotice.indexOf(begin),stop=firstNotice.indexOf(end,start+begin.length);
  need(start>=0&&stop>start&&firstNotice.lastIndexOf(begin)===start&&firstNotice.lastIndexOf(end)===stop,'EXACT_CURRENT_DRAFT_RENDERER_REQUIRED');
  const descriptions=entries.map(([,o])=>{const t=o.transition,side=t.direction==='LONG'?'вверх':'вниз';return t.to==='CONFIRMED'?`подтверждён выход ${side}`:`гипотеза движения ${side} опровергнута`;});
  const message_ru=firstNotice.slice(0,start)+begin+descriptions.join('; ')+firstNotice.slice(stop);
  need(message_ru.length<=1600,'DRAFT_MESSAGE_BOUND');
  const key='watch-group:'+digest({logical_event_id:origin.logical_event_id,watch_observation_fingerprint:fingerprint});
  return{[key]:{status:'DRAFT',form_status:'NOT_APPROVED',actual_send:false,source_snapshot_id:snapshot_id,message_ru,group_schema:'CLOSED_WATCH_CHECK_DRAFT_GROUP_V1',watch_observation_fingerprint:fingerprint,transition_ids:entries.map(([id])=>id),transition_group:entries.map(([,o])=>clone(o.transition))}};
}
function advanceCapturedWatch(origin,now_ts){
  if(!origin.state.watch.active)return{reason:'WATCH_INACTIVE_PENDING_OUTCOMES',detail:'WATCH_INACTIVE_OUTCOMES_EVALUATED_SEPARATELY'};
  const input=lastClosedCapture(origin,now_ts);if(input.reason)return input;
  const w=origin.state.watch,prior=w.last_confirmation;
  if(prior&&input.candle.end_ts===prior.end_ts)return input.fact_hash!==prior.fact_hash?{reason:'CLOSED_WINDOW_UNAVAILABLE',detail:'CONFLICTING_ALREADY_RETAINED_CLOSED_WINDOW'}:{reason:'CLOSED_WINDOW_ALREADY_OBSERVED',detail:'RECEIPT_BODY_FORMAT_AND_PROCESS_CLOCK_ARE_NOT_NEW_FACTS'};
  if(w.last_source_ts!==null&&input.candle.end_ts<=w.last_source_ts||input.candle.end_ts<origin.state.last_snapshot.ts)return{reason:'CLOSED_WINDOW_ALREADY_OBSERVED',detail:'CLOSED_PRICE_TIME_DOES_NOT_ADVANCE_CURSOR'};
  const fingerprint=digest({kind:'CLOSED_CAPTURE_WATCH_V1',logical_event_id:origin.logical_event_id,fact_hash:input.fact_hash});
  if(origin.state.revisions.some(x=>x.observation_kind==='CLOSED_CAPTURE_WATCH_V1'&&x.observation_fingerprint===fingerprint))return{reason:'CLOSED_WINDOW_ALREADY_OBSERVED',detail:'SEMANTIC_CLOSED_FACT_ALREADY_RETAINED'};
  const snapshot_id='ANOMALY_WATCH:'+fingerprint,snapshot={instrument:clone(origin.card.instrument),snapshot_id,raw_sha256:input.raw_sha256,raw_ref:input.raw_ref,source_ts:input.candle.end_ts,received_ts:input.received_ts,price:input.candle.close,closed_candle:input.candle};
  const memory=newMemory({max_active:1,max_cards:2});memory.cards[origin.card.event_id]=clone(origin.card);memory.watch[origin.card.event_id]=clone(w);
  const observed=observe(memory,{event_id:origin.card.event_id,snapshot,now_ts,confirmation_alignment_offset_ms:input.alignment});
  if(observed.status!=='OBSERVED')return{reason:'CLOSED_WINDOW_UNAVAILABLE',detail:'EXISTING_WATCH_DID_NOT_ACCEPT_SNAPSHOT'};
  const drafts=groupClosedWatchDrafts({origin,snapshot_id,snapshot,observed,fingerprint});
  need(Object.values(drafts).every(x=>x.message_ru.length<=1600),'DRAFT_MESSAGE_BOUND');
  return{input,fingerprint,snapshot_id,snapshot,observed,drafts};
}
export function prepareCapturedDueWatch({due,origin,now_ts}={}){
  checkedOrigin(origin,due.logical_event_id);
  if(origin.revision!==due.revision||origin.state.watch.next_check_ts!==due.next_check_ts||Number(origin.state.watch.active)!==due.watch_active)return terminal(origin,'DUE_REVISION_CHANGED','QUEUE_HINT_IS_NOT_CURRENT_MUTATION_AUTHORITY');
  need(clock(now_ts)&&now_ts>=origin.state.evaluated_ts,'DUE_CUT_BEFORE_RETAINED_EVALUATION');
  const evaluated=evaluateOriginalEventOutcomes({origin,projection:capturedOriginalOutcomeWindows({origin,now_ts}),now_ts});
  let watch;try{watch=advanceCapturedWatch(origin,now_ts);}catch{watch={reason:'CLOSED_WINDOW_UNAVAILABLE',detail:'CURRENT_WATCH_CAPTURE_NOT_CLOSED'};}
  if(!evaluated.closed_keys.length&&watch.reason){const result=terminal(origin,watch.reason,watch.detail);return{...result,outcome_evaluation:evaluated.status,outcome_deferred_reason:evaluated.deferred[0]?.reason??null};}
  const factual=evaluated.closed_keys.length>0,fingerprint=factual?digest({kind:'ORIGINAL_EVENT_OUTCOME_FACTS_V1',logical_event_id:origin.logical_event_id,closure_fingerprints:evaluated.closure_fingerprints,watch_fingerprint:watch.reason?null:watch.fingerprint}):watch.fingerprint;
  const drafts=watch.reason?{}:watch.drafts;
  const capacity=reason=>({status:'DEFERRED_CAPACITY',reason,logical_event_id:origin.logical_event_id,observation_fingerprint:fingerprint,expected_revision:origin.revision,first_known_ts:origin.first_known_ts,...Object.fromEntries(['card','descriptor','plan'].map(n=>[n+'_sha256',origin[n+'_sha256']])),write_required:false,durable_new_observation:false,...QUAL});
  if(origin.state.revisions.length>=DOMAIN_BOUNDS.revisions||Object.keys(origin.state.outbox).length+Object.keys(drafts).length>DOMAIN_BOUNDS.outbox)return capacity('REVISIONS_OR_OUTBOX_CAPACITY_NO_DROP');
  need(Object.keys(drafts).every(id=>!Object.hasOwn(origin.state.outbox,id)),'DRAFT_TRANSITION_ID_CONFLICT');
  const state=clone(origin.state);state.evaluated_ts=now_ts;state.outcomes=evaluated.outcomes;
  if(!watch.reason){state.watch=watch.observed.state.watch[origin.card.event_id];state.last_snapshot={...state.last_snapshot,ts:watch.snapshot.source_ts,id:watch.snapshot_id,sha256:watch.input.raw_sha256};state.outbox={...state.outbox,...drafts};}
  const pending=origin.plan.cells.filter(c=>state.outcomes[c.key].status==='PENDING').map(c=>c.target_ts),dueTimes=[...(state.watch.active&&state.watch.next_check_ts!==null?[state.watch.next_check_ts]:[]),...pending];
  state.watch.next_check_ts=dueTimes.length?Math.min(...dueTimes):null;
  state.revisions.push({observation_kind:factual?'ORIGINAL_EVENT_OUTCOME_FACTS_V1':'CLOSED_CAPTURE_WATCH_V1',observation_fingerprint:fingerprint,recorded_by_worker_ts:now_ts,watch_status:state.watch.status,outcome_evaluation:evaluated.status,outcome_closed_keys:clone(evaluated.closed_keys),outcome_deferred:clone(evaluated.deferred),watch_deferred_reason:watch.reason??null,...(!watch.reason?{watch_observation_fingerprint:watch.fingerprint,source_snapshot_id:watch.snapshot_id,closed_window:{...watch.input.candle,fact_hash:watch.input.fact_hash},price_source_ts:watch.snapshot.source_ts,provider_source_as_of_ts:watch.input.source_as_of_ts,received_ts:watch.input.received_ts,body_completed_ts:watch.input.body_completed_ts,raw_ref:watch.input.raw_ref,raw_sha256:watch.input.raw_sha256,metadata_row_sha256:watch.input.metadata_row_sha256,gap_detail_receipt:watch.observed.unretained_gap?.interval??null}:{}),...QUAL});
  if(Buffer.byteLength(canonical(state))>DOMAIN_BOUNDS.state)return capacity('STATE_BYTES_CAPACITY_NO_DROP');
  const operation_id=(factual?'ANOMALY_OUTCOME:':'ANOMALY_WATCH:')+digest({logical_event_id:origin.logical_event_id,expected_revision:origin.revision,observation_fingerprint:fingerprint});
  return prepareAnomalyCommit({logical_event_id:origin.logical_event_id,operation_id,expected_revision:origin.revision,card:clone(origin.card),descriptor:clone(origin.descriptor),plan:clone(origin.plan),state});
}
function checkedDueRows(result,now_ts,limit){
  need(result?.status==='DUE_BUNDLES_READ'&&result.current_parent_admitted===true&&result.cost_status==='WITHIN_CALLER_PROJECTION'&&Array.isArray(result.rows)&&result.rows.length<=limit&&typeof result.more_may_exist==='boolean'&&result.more_may_exist===(result.rows.length===limit),'DUE_RESULT_NOT_CLOSED');
  const seen=new Set();let prior=null;
  for(const row of result.rows){
    need(row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).sort().join('|')==='logical_event_id|next_check_ts|revision|watch_active'&&typeof row.logical_event_id==='string'&&/^OPAQUE_ANOM:[a-f0-9]{64}$/.test(row.logical_event_id)&&Number.isSafeInteger(row.revision)&&row.revision>=1&&clock(row.next_check_ts)&&row.next_check_ts<=now_ts&&[0,1].includes(row.watch_active),'DUE_ROW_INVALID');
    need(!seen.has(row.logical_event_id)&&(!prior||row.next_check_ts>prior.next_check_ts||row.next_check_ts===prior.next_check_ts&&row.logical_event_id>prior.logical_event_id),'DUE_ROWS_DUPLICATE_OR_UNORDERED');seen.add(row.logical_event_id);prior=row;
  }
  return result.rows.map(row=>clone(row));
}
export async function runCapturedAnomalyDueCycle({env,now_ts,logical_request_id,limit=2}={}){
  if(typeof env?.REPORT2_ANOMALY_DOMAIN_DUE!=='function'||typeof env?.REPORT2_ANOMALY_DOMAIN_COMMIT!=='function')return{status:'DUE_HOOK_NOT_AVAILABLE',source_HTTP:0,SQL_requested:0,...QUAL};
  need(clock(now_ts)&&Number.isInteger(limit)&&limit>=1&&limit<=2&&typeof logical_request_id==='string'&&/^[A-Za-z0-9:._-]{1,160}$/.test(logical_request_id),'DUE_CONSUMER_ARGUMENTS');
  let selected,rows;
  try{selected=await env.REPORT2_ANOMALY_DOMAIN_DUE({now_ts,limit,logical_request_id});rows=checkedDueRows(selected,now_ts,limit);}
  catch{return{status:'DUE_SELECTION_NOT_CLOSED',events:[],unprocessed_due_retained:true,source_HTTP:0,...QUAL};}
  const events=[];
  for(const due of rows){
    let result;
    try{result=await env.REPORT2_ANOMALY_DOMAIN_COMMIT({logical_event_id:due.logical_event_id,prepare_from_origin:origin=>prepareCapturedDueWatch({due,origin,now_ts})});}
    catch{events.push({logical_event_id:due.logical_event_id,status:'DUE_ORIGIN_OR_COMMIT_NOT_CLOSED',new_operation_not_created_by_consumer:true});break;}
    const status=result?.status??'DUE_ORIGIN_OR_COMMIT_NOT_CLOSED';
    events.push({logical_event_id:due.logical_event_id,status,reason:result?.reason??null,operation_id:result?.operation_id??null,effective_prepared_retained_by_source:!!result?.effective_prepared,committed_receipt_returned:status==='COMMITTED_RECEIPT_READBACK',native_admission_qualified:false});
    if(!['COMMITTED_RECEIPT_READBACK','DUE_DEFERRED','DEFERRED_CAPACITY'].includes(status)||result?.new_operation_id_allowed===false&&status==='COMMITTED_RECEIPT_READBACK'||result?.cost_status&&result.cost_status!=='WITHIN_CALLER_PROJECTION')break;
  }
  return{status:'BOUNDED_DUE_CYCLE_RETURNED',selected_rows:rows.length,events,more_may_exist:selected.more_may_exist,unprocessed_due_retained:true,source_HTTP:0,outcome_evaluation:'ORIGINAL16_FACTUAL_ONLY_NO_CLASSIFICATION',independent105_connected:false,...QUAL};
}
