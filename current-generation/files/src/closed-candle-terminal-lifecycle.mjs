import crypto from 'node:crypto';
import {canonicalFingerprint,assessActionability} from './canonical-publication.mjs';

export const CLOSED_CANDLE_TERMINAL_VERSION='owner-closed-candle-terminal-v1-20261010';
export const CLOSED_CANDLE_MAX_SOURCE_AGE_MS=180000;
const TIMEFRAME_MS=Object.freeze({'1m':60000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000});
const text=v=>v==null?'':String(v).trim();
const upper=v=>text(v).toUpperCase();
const stamp=v=>Number.isSafeInteger(Number(v))&&Number(v)>=1_000_000_000_000?Number(v):null;
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])])):v;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const compare=(price,operator,value)=>operator==='>='?price>=value:operator==='>'?price>value:operator==='<='?price<=value:operator==='<'?price<value:false;
const messageId=v=>/^[1-9][0-9]*$/.test(text(v))?text(v):null;
const fail=(status,extra={})=>({version:CLOSED_CANDLE_TERMINAL_VERSION,ok:false,status,entry_authorized:false,automatic_trading:false,exchange_order_filled:false,...extra});

function cancellation(trigger){
 const m=/^price\s*(>=|<=|>|<)\s*([0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)$/i.exec(text(trigger?.cancel_condition));
 return m?{operator:m[1],value:Number(m[2])}:null;
}
function exactOriginal({canonical,task,light_receipt}){
 const contract=text(canonical?.metadata?.contract),fingerprint=text(canonical?.analytical_fingerprint),trigger=canonical?.trigger;
 if(canonical?.status!=='CLOSED'||!['OBSERVE','WAIT_FOR_TRIGGER'].includes(canonical?.state)||!['LONG','SHORT'].includes(upper(canonical?.direction)))return fail('ORIGINAL_CANONICAL_NOT_WAITING');
 if(!contract||!text(canonical?.run_id)||!text(canonical?.snapshot_id)||stamp(canonical?.observed_ts)===null||canonicalFingerprint(canonical)!==fingerprint)return fail('ORIGINAL_CANONICAL_IDENTITY_NOT_CLOSED');
 if(!text(task?.task_id)||!text(task?.publication_id)||task?.contract_code!==contract||upper(task?.direction)!==upper(canonical.direction)||task?.run_id!==canonical.run_id||task?.snapshot_id!==canonical.snapshot_id||task?.analytical_fingerprint!==fingerprint)return fail('ORIGINAL_TASK_IDENTITY_MISMATCH');
 if(messageId(task?.telegram_message_id)===null||messageId(task.telegram_message_id)!==messageId(light_receipt?.telegram_message_id))return fail('ORIGINAL_SENT_MESSAGE_ID_REQUIRED');
 if(trigger?.trigger_type!=='PRICE_CONFIRMATION'||trigger?.metric!=='price'||trigger?.unit!=='USDT'||!Object.hasOwn(TIMEFRAME_MS,text(trigger?.timeframe))||finite(trigger?.value)===null||!['>=','<=','>','<'].includes(trigger?.operator)||!cancellation(trigger))return fail('ORIGINAL_CLOSED_CANDLE_TRIGGER_REQUIRED');
 if(stamp(trigger?.next_recheck_ts)!==Number(task?.due_ts)||stamp(trigger?.expires_ts)!==Number(task?.expires_ts)||trigger.expires_ts<=trigger.next_recheck_ts)return fail('ORIGINAL_TRIGGER_CLOCK_MISMATCH');
 const exact=['task_id','publication_id','run_id','snapshot_id','analytical_fingerprint'].every(k=>text(light_receipt?.[k])===text(k==='analytical_fingerprint'?fingerprint:task[k]));
 if(!exact||light_receipt?.schema!=='LIGHT_PRICE_RECHECK_V1'||light_receipt?.scope!=='PRICE_AND_CANCELLATION_ONLY'||light_receipt?.source!=='HTX_OFFICIAL_COLLECTOR'||light_receipt?.entry_authorized!==false||light_receipt?.full_analysis_completed!==false||light_receipt?.settlement_confirmed!==false)return fail('EXACT_LIGHT_PRICE_RECEIPT_REQUIRED');
 return {ok:true,contract,fingerprint,trigger,interval_ms:TIMEFRAME_MS[trigger.timeframe],cancel:cancellation(trigger)};
}

export function confirmOriginalClosedCandle({canonical,task,light_receipt,candle,now_ts}={}){
 const exact=exactOriginal({canonical,task,light_receipt});if(!exact.ok)return exact;
 const now=stamp(now_ts),checked=stamp(light_receipt?.checked_ts),source=stamp(light_receipt?.source_ts),observed=stamp(light_receipt?.observed_ts),price=finite(light_receipt?.price);
 if(now===null||checked===null||source===null||observed===null||checked>now||now-checked>CLOSED_CANDLE_MAX_SOURCE_AGE_MS||source>checked||observed>checked||checked<canonical.observed_ts)return fail('FRESH_LIGHT_PRICE_RECEIPT_REQUIRED');
 if(light_receipt.status!=='TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED'||price===null||price<=0||!compare(price,exact.trigger.operator,Number(exact.trigger.value))||compare(price,exact.cancel.operator,exact.cancel.value))return fail('LIGHT_PRICE_TRIGGER_NOT_REACHED');
 if(now>=Number(task.expires_ts))return fail('ORIGINAL_TRIGGER_EXPIRED',{terminal_disposition:'EXPIRED'});
 const open=stamp(candle?.open_ts),closeTs=stamp(candle?.close_ts),candleSource=stamp(candle?.source_ts),candleObserved=stamp(candle?.observed_ts),close=finite(candle?.close);
 const identity=candle?.schema==='HTX_CLOSED_CANDLE_V1'&&candle?.source==='HTX_OFFICIAL_KLINE'&&candle?.venue==='HTX'&&candle?.contract===exact.contract&&candle?.timeframe===exact.trigger.timeframe;
 if(!identity||candle?.closed!==true||open===null||closeTs===null||candleSource===null||candleObserved===null||close===null||close<=0)return fail('EXACT_HTX_CLOSED_CANDLE_REQUIRED');
 if(open%exact.interval_ms!==0||closeTs-open!==exact.interval_ms||checked<open||checked>=closeTs||closeTs>now||closeTs>Number(task.expires_ts))return fail('CANDLE_INTERVAL_OR_TRIGGER_WINDOW_MISMATCH');
 if(candleSource<closeTs||candleSource>now||candleObserved<candleSource||candleObserved>now||now-candleSource>CLOSED_CANDLE_MAX_SOURCE_AGE_MS)return fail('FRESH_CLOSED_CANDLE_SOURCE_CLOCK_REQUIRED');
 const base={version:CLOSED_CANDLE_TERMINAL_VERSION,ok:true,schema:'CLOSED_CANDLE_CONFIRMATION_V1',task_id:task.task_id,publication_id:task.publication_id,contract:exact.contract,direction:upper(task.direction),run_id:task.run_id,snapshot_id:task.snapshot_id,analytical_fingerprint:exact.fingerprint,original_telegram_message_id:messageId(task.telegram_message_id),timeframe:exact.trigger.timeframe,candle_open_ts:open,candle_close_ts:closeTs,candle_close:close,source_ts:candleSource,observed_ts:candleObserved,checked_ts:now,entry_authorized:false,full_analysis_required:false,automatic_trading:false,exchange_order_filled:false};
 if(compare(close,exact.cancel.operator,exact.cancel.value))return {...base,status:'CANCELLED_BY_CLOSED_CANDLE',terminal_disposition:'CANCELLED',reason:'ORIGINAL_CANCEL_CONDITION_CONFIRMED'};
 if(!compare(close,exact.trigger.operator,Number(exact.trigger.value)))return {...base,status:'CLOSED_CANDLE_DID_NOT_CONFIRM',terminal_disposition:null,reason:'PRICE_TOUCHED_BUT_CANDLE_CLOSED_OUTSIDE_TRIGGER'};
 return {...base,status:'CLOSED_CANDLE_CONFIRMED_FULL_ANALYSIS_REQUIRED',terminal_disposition:null,full_analysis_required:true,reason:'ORIGINAL_TIMEFRAME_CLOSE_CONFIRMED'};
}

function originalIdentity(original){
 const c=original?.canonical,t=original?.task;
 if(!c||!t)return fail('ORIGINAL_IDENTITY_REQUIRED');
 const exact=exactOriginal({canonical:c,task:t,light_receipt:original.light_receipt});
 if(!exact.ok)return exact;
 return {...exact,canonical:c,task:t,wave_id:text(t.wave_id||original.wave_id),original_message_id:messageId(t.telegram_message_id)};
}

export function prepareTerminalLifecycle({original,confirmation=null,disposition,fresh_publication=null,reason=null,now_ts}={}){
 const id=originalIdentity(original);if(!id.ok)return id;
 const now=stamp(now_ts),terminal=upper(disposition);
 if(now===null||!['ENTRY_APPROVED','CANCELLED','EXPIRED'].includes(terminal))return fail('TERMINAL_DISPOSITION_REQUIRED');
 if(!id.wave_id)return fail('ORIGINAL_WAVE_ID_REQUIRED');
 let event,newPublicationId=null,newRunId=null,newSnapshotId=null,newFingerprint=null,terminalReason=text(reason);
 if(terminal==='ENTRY_APPROVED'){
  if(confirmation?.schema!=='CLOSED_CANDLE_CONFIRMATION_V1'||confirmation?.status!=='CLOSED_CANDLE_CONFIRMED_FULL_ANALYSIS_REQUIRED'||confirmation?.task_id!==id.task.task_id||confirmation?.publication_id!==id.task.publication_id||confirmation?.analytical_fingerprint!==id.fingerprint)return fail('EXACT_CLOSED_CANDLE_CONFIRMATION_REQUIRED');
  const fresh=fresh_publication?.canonical,newObserved=stamp(fresh?.observed_ts);
  newPublicationId=text(fresh_publication?.publication_id);newRunId=text(fresh?.run_id);newSnapshotId=text(fresh?.snapshot_id);newFingerprint=text(fresh?.analytical_fingerprint);
  if(!newPublicationId||newPublicationId===id.task.publication_id||!newRunId||newRunId===id.task.run_id||!newSnapshotId||newSnapshotId===id.task.snapshot_id||canonicalFingerprint(fresh)!==newFingerprint)return fail('FRESH_FULL_ANALYSIS_IDENTITY_REQUIRED');
  if(text(fresh?.metadata?.contract)!==id.contract||upper(fresh?.direction)!==upper(id.task.direction)||text(fresh_publication?.wave_id)!==id.wave_id||newObserved===null||newObserved<Number(confirmation.candle_close_ts)||newObserved>now||now>=Number(id.task.expires_ts))return fail('FRESH_SAME_IDEA_ANALYSIS_REQUIRED');
  const action=assessActionability({canonical:fresh,lifecycle_event:'ENTRY',prior_sent:true});
  if(action.deliver!==true||action.status!=='ACTIONABLE')return fail('FRESH_ENTRY_ACTIONABILITY_REQUIRED',{actionability_reason:action.reason});
  event='ENTRY';terminalReason='FRESH_FULL_ANALYSIS_STRATEGY_APPROVED';
 }else if(terminal==='CANCELLED'){
  if(confirmation?.schema!=='CLOSED_CANDLE_CONFIRMATION_V1'||confirmation?.status!=='CANCELLED_BY_CLOSED_CANDLE'||confirmation?.task_id!==id.task.task_id||confirmation?.publication_id!==id.task.publication_id)return fail('EXACT_CANCELLATION_EVIDENCE_REQUIRED');
  if(now>=Number(id.task.expires_ts))return fail('CANCELLATION_AFTER_EXPIRY_NOT_ALLOWED');
  event='IDEA_REMOVED';terminalReason=terminalReason||text(confirmation.reason)||'ORIGINAL_CANCEL_CONDITION_CONFIRMED';
 }else{
  if(now<Number(id.task.expires_ts))return fail('ORIGINAL_TTL_NOT_EXPIRED');
  event='IDEA_REMOVED';terminalReason=terminalReason||'ORIGINAL_TRIGGER_TTL_EXPIRED';
 }
 const identity={original_publication_id:id.task.publication_id,original_task_id:id.task.task_id,contract:id.contract,direction:upper(id.task.direction),wave_id:id.wave_id,original_run_id:id.task.run_id,original_snapshot_id:id.task.snapshot_id,original_analytical_fingerprint:id.fingerprint,original_telegram_message_id:id.original_message_id,original_due_ts:Number(id.task.due_ts),original_expires_ts:Number(id.task.expires_ts),disposition:terminal,new_publication_id:newPublicationId,new_run_id:newRunId,new_snapshot_id:newSnapshotId,new_analytical_fingerprint:newFingerprint};
 const key='TERMINAL:'+digest(identity).slice(0,48);
 return {version:CLOSED_CANDLE_TERMINAL_VERSION,ok:true,status:'TERMINAL_DISPATCH_READY',schema:'TERMINAL_LIFECYCLE_DISPATCH_V1',event,disposition:terminal,reason:terminalReason,idempotency_key:key,...identity,prepared_ts:now,telegram_message_id:null,entry_authorized:terminal==='ENTRY_APPROVED',strategy_approved:terminal==='ENTRY_APPROVED',automatic_trading:false,exchange_order_filled:false};
}

export function confirmTerminalDelivery({terminal,network_result,telegram_message_id,task_at_delivery,sent_ts}={}){
 const sent=stamp(sent_ts),id=messageId(telegram_message_id),before=task_at_delivery;
 if(terminal?.schema!=='TERMINAL_LIFECYCLE_DISPATCH_V1'||terminal?.status!=='TERMINAL_DISPATCH_READY'||!text(terminal?.idempotency_key))return fail('TERMINAL_DISPATCH_NOT_READY');
 if(network_result!=='CONFIRMED_SENT'||id===null||id===messageId(terminal.original_telegram_message_id))return fail('DISTINCT_CONFIRMED_TERMINAL_MESSAGE_ID_REQUIRED');
 if(sent===null||sent<Number(terminal.prepared_ts)||text(before?.task_id)!==text(terminal.original_task_id)||stamp(before?.read_ts)===null||before.read_ts>sent||upper(before?.disposition)!==upper(terminal.disposition))return fail('EXACT_TASK_AT_DELIVERY_REQUIRED');
 return {version:CLOSED_CANDLE_TERMINAL_VERSION,ok:true,status:'TERMINAL_DELIVERY_CONFIRMED',schema:'TERMINAL_LIFECYCLE_DELIVERY_V1',idempotency_key:terminal.idempotency_key,disposition:terminal.disposition,original_publication_id:terminal.original_publication_id,original_task_id:terminal.original_task_id,original_telegram_message_id:terminal.original_telegram_message_id,telegram_message_id:id,task_at_delivery:{task_id:before.task_id,state:text(before.state),disposition:upper(before.disposition),read_ts:Number(before.read_ts)},sent_ts:sent,entry_authorized:terminal.disposition==='ENTRY_APPROVED',automatic_trading:false,exchange_order_filled:false};
}

export default {CLOSED_CANDLE_TERMINAL_VERSION,confirmOriginalClosedCandle,prepareTerminalLifecycle,confirmTerminalDelivery};
