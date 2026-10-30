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
export function prepareCapturedDueWatch({due,origin,now_ts}={}){
  checkedOrigin(origin,due.logical_event_id);
  if(origin.revision!==due.revision||origin.state.watch.next_check_ts!==due.next_check_ts||Number(origin.state.watch.active)!==due.watch_active)return terminal(origin,'DUE_REVISION_CHANGED','QUEUE_HINT_IS_NOT_CURRENT_MUTATION_AUTHORITY');
  need(clock(now_ts)&&now_ts>=origin.state.evaluated_ts,'DUE_CUT_BEFORE_RETAINED_EVALUATION');
  if(!origin.state.watch.active)return terminal(origin,'WATCH_INACTIVE_PENDING_OUTCOMES',Object.values(origin.state.outcomes).some(x=>x.status==='PENDING')?'LOCKED_ORIGINAL_EVENT_END_PLAN_HAS_NO_COMPATIBLE_OUTCOME_EVALUATOR':'WATCH_INACTIVE_NO_NEW_PRICE_EVALUATION');
  const input=lastClosedCapture(origin,now_ts);if(input.reason)return terminal(origin,input.reason,input.detail);
  const w=origin.state.watch,prior=w.last_confirmation;
  if(prior&&input.candle.end_ts===prior.end_ts){
    if(input.fact_hash!==prior.fact_hash)return terminal(origin,'CLOSED_WINDOW_UNAVAILABLE','CONFLICTING_ALREADY_RETAINED_CLOSED_WINDOW');
    return terminal(origin,'CLOSED_WINDOW_ALREADY_OBSERVED','RECEIPT_BODY_FORMAT_AND_PROCESS_CLOCK_ARE_NOT_NEW_FACTS');
  }
  if(w.last_source_ts!==null&&input.candle.end_ts<=w.last_source_ts||input.candle.end_ts<origin.state.last_snapshot.ts)return terminal(origin,'CLOSED_WINDOW_ALREADY_OBSERVED','CLOSED_PRICE_TIME_DOES_NOT_ADVANCE_CURSOR');
  const fingerprint=digest({kind:'CLOSED_CAPTURE_WATCH_V1',logical_event_id:origin.logical_event_id,fact_hash:input.fact_hash});
  if(origin.state.revisions.some(x=>x.observation_kind==='CLOSED_CAPTURE_WATCH_V1'&&x.observation_fingerprint===fingerprint))return terminal(origin,'CLOSED_WINDOW_ALREADY_OBSERVED','SEMANTIC_CLOSED_FACT_ALREADY_RETAINED');
  const snapshot_id='ANOMALY_WATCH:'+fingerprint;
  const snapshot={instrument:clone(origin.card.instrument),snapshot_id,raw_sha256:input.raw_sha256,raw_ref:input.raw_ref,source_ts:input.candle.end_ts,received_ts:input.received_ts,price:input.candle.close,closed_candle:input.candle};
  const memory=newMemory({max_active:1,max_cards:2});memory.cards[origin.card.event_id]=clone(origin.card);memory.watch[origin.card.event_id]=clone(w);
  const observed=observe(memory,{event_id:origin.card.event_id,snapshot,now_ts,confirmation_alignment_offset_ms:input.alignment});
  if(observed.status!=='OBSERVED')return terminal(origin,'CLOSED_WINDOW_UNAVAILABLE','EXISTING_WATCH_DID_NOT_ACCEPT_SNAPSHOT');
  const newDrafts=Object.fromEntries(Object.entries(observed.state.outbox).map(([id,o])=>{
    const notice=draftNotice(observed.state,id);
    return['watch:'+id,{status:'DRAFT',form_status:'NOT_APPROVED',actual_send:false,source_snapshot_id:snapshot_id,message_ru:notice.text,transition:clone(o.transition)}];
  }));
  need(Object.values(newDrafts).every(x=>x.message_ru.length<=1600),'DRAFT_MESSAGE_BOUND');
  const capacity=reason=>({status:'DEFERRED_CAPACITY',reason,logical_event_id:origin.logical_event_id,observation_fingerprint:fingerprint,expected_revision:origin.revision,first_known_ts:origin.first_known_ts,...Object.fromEntries(['card','descriptor','plan'].map(n=>[n+'_sha256',origin[n+'_sha256']])),write_required:false,durable_new_observation:false,...QUAL});
  if(origin.state.revisions.length>=DOMAIN_BOUNDS.revisions||Object.keys(origin.state.outbox).length+Object.keys(newDrafts).length>DOMAIN_BOUNDS.outbox)return capacity('REVISIONS_OR_OUTBOX_CAPACITY_NO_DROP');
  need(Object.keys(newDrafts).every(id=>!Object.hasOwn(origin.state.outbox,id)),'DRAFT_TRANSITION_ID_CONFLICT');
  const state=clone(origin.state);state.evaluated_ts=now_ts;state.watch=observed.state.watch[origin.card.event_id];
  const pending=origin.plan.cells.filter(c=>state.outcomes[c.key].status==='PENDING').map(c=>c.target_ts);
  const dueTimes=[...(state.watch.active&&state.watch.next_check_ts!==null?[state.watch.next_check_ts]:[]),...pending];
  state.watch.next_check_ts=dueTimes.length?Math.min(...dueTimes):null;
  state.last_snapshot={...state.last_snapshot,ts:snapshot.source_ts,id:snapshot_id,sha256:input.raw_sha256};
  state.outbox={...state.outbox,...newDrafts};
  state.revisions.push({observation_kind:'CLOSED_CAPTURE_WATCH_V1',observation_fingerprint:fingerprint,source_snapshot_id:snapshot_id,closed_window:{...input.candle,fact_hash:input.fact_hash},price_source_ts:snapshot.source_ts,provider_source_as_of_ts:input.source_as_of_ts,received_ts:input.received_ts,body_completed_ts:input.body_completed_ts,raw_ref:input.raw_ref,raw_sha256:input.raw_sha256,metadata_row_sha256:input.metadata_row_sha256,recorded_by_worker_ts:now_ts,watch_status:state.watch.status,gap_detail_receipt:observed.unretained_gap?.interval??null,outcome_evaluation:'DEFERRED_LOCKED_PLAN_NOT_REPLACED',...QUAL});
  if(Buffer.byteLength(canonical(state))>DOMAIN_BOUNDS.state)return capacity('STATE_BYTES_CAPACITY_NO_DROP');
  const operation_id='ANOMALY_WATCH:'+digest({logical_event_id:origin.logical_event_id,expected_revision:origin.revision,observation_fingerprint:fingerprint});
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
  return{status:'BOUNDED_DUE_CYCLE_RETURNED',selected_rows:rows.length,events,more_may_exist:selected.more_may_exist,unprocessed_due_retained:true,source_HTTP:0,outcome_evaluation:'LOCKED16_PENDING_NOT_REPLACED',independent105_connected:false,...QUAL};
}
