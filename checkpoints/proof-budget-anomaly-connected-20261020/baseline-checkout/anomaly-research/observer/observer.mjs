// Offline research only. No production imports, I/O, clock reads or delivery.
import {createHash} from 'node:crypto';
export const VERSION='offline-anomaly-observer-v1';
export const TIMEFRAMES=Object.freeze({'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000,'1w':604800000});
const CONFIRM={...TIMEFRAMES,'1m':60000,'5m':300000};
export function canonical(x){
 if(x===null||typeof x!=='object')return JSON.stringify(x);
 if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
 return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
}
export const hash=x=>createHash('sha256').update(canonical(x)).digest('hex');
const clone=x=>structuredClone(x),str=x=>typeof x==='string'&&x.trim().length>0;
const ts=x=>Number.isSafeInteger(x)&&x>=1e12,num=x=>typeof x==='number'&&Number.isFinite(x);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function need(ok,reason){if(!ok)throw Error(reason);}
function exactInstrument(i){
 need(i&&['asset_id','venue','upstream','contract','quote','price_unit','volume_unit','binding_ref'].every(k=>str(i[k]))&&['FUTURES','SPOT'].includes(i.market)&&i.identity_verified===true&&num(i.multiplier)&&i.multiplier>0&&['VERIFIED_NATIVE','CHAIN_ADDRESS'].includes(i.binding_kind),'EXACT_INSTRUMENT_REQUIRED');
 if(i.binding_kind==='CHAIN_ADDRESS')need(str(i.chain)&&str(i.address),'CHAIN_ADDRESS_REQUIRED');
 return clone(i);
}
function rawEvidence(p,now){
 need(p&&hex(p.raw_sha256)&&str(p.raw_ref)&&ts(p.received_ts)&&p.received_ts<=now&&ts(p.source_as_of_ts)&&p.source_as_of_ts<=p.received_ts,'PROVENANCE_REQUIRED');
 need(['CONTROLLED','RETAINED','PROSPECTIVE'].includes(p.evidence_class),'EVIDENCE_CLASS_REQUIRED');
 return clone(p);
}
function validBar(b,d,offset,now){
 need(b&&ts(b.start_ts)&&b.end_ts===b.start_ts+d&&(b.start_ts-offset)%d===0,'CANDLE_GRID_INVALID');
 need(['open','high','low','close'].every(k=>num(b[k])&&b[k]>0)&&b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close)&&b.low<=b.high&&num(b.volume)&&b.volume>=0,'OHLCV_INVALID');
 need(b.end_ts<=now,'CANDLE_OPEN');
 return clone(b);
}
const median=a=>{const s=[...a].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
export function features(b,prior){
 const range=b.high-b.low,body=Math.abs(b.close-b.open),med=median(prior.map(x=>x.volume));
 const ranges=prior.map(x=>(x.high-x.low)/x.open),rm=median(ranges),mad=median(prior.map(x=>Math.abs(x.volume-med)));
 return {volume_ratio:med>0?b.volume/med:null,volume_median:med,volume_mad:mad,volume_robust_z:mad>0?0.6745*(b.volume-med)/mad:null,range,range_pct:100*range/b.open,range_relative_median:rm>0?(range/b.open)/rm:null,body,body_ratio:range>0?body/range:null,upper_wick:b.high-Math.max(b.open,b.close),lower_wick:Math.min(b.open,b.close)-b.low,upper_wick_ratio:range>0?(b.high-Math.max(b.open,b.close))/range:null,lower_wick_ratio:range>0?(Math.min(b.open,b.close)-b.low)/range:null,close_location:range>0?(b.close-b.low)/range:null,body_return_pct:100*(b.close/b.open-1),background_count:prior.length};
}
export function detectClosed({instrument,timeframe,alignment_offset_ms,bars,provenance,known_ts,mode='REPLAY',rules={}}={}){
 need(ts(known_ts),'KNOWN_TS_REQUIRED');const i=exactInstrument(instrument),p=rawEvidence(provenance,known_ts),d=TIMEFRAMES[timeframe];
 need(d&&Number.isSafeInteger(alignment_offset_ms)&&alignment_offset_ms>=0&&alignment_offset_ms<d,'EXPLICIT_NATIVE_ALIGNMENT_REQUIRED');
 need(Array.isArray(bars)&&bars.length<=2000,'BOUNDED_BARS_REQUIRED');need(['REPLAY','LIVE_CAPTURE'].includes(mode),'CAPTURE_MODE_INVALID');
 const r={version:VERSION,lookback:20,volume_ratio:3,extreme_ratio:5,small_body:0.35,large_wick:0.5,timely_lag_ms:600000,confirmation_timeframe:timeframe,...rules};
 need(r.version===VERSION&&Number.isInteger(r.lookback)&&r.lookback>=8&&r.lookback<=200&&num(r.volume_ratio)&&r.volume_ratio>1&&num(r.extreme_ratio)&&r.extreme_ratio>=r.volume_ratio&&num(r.small_body)&&r.small_body>=0&&r.small_body<=1&&num(r.large_wick)&&r.large_wick>=0&&r.large_wick<=1&&Number.isSafeInteger(r.timely_lag_ms)&&r.timely_lag_ms>=0&&r.timely_lag_ms<=600000&&CONFIRM[r.confirmation_timeframe],'RULES_INVALID');
 const xs=[...bars].sort((a,b)=>a.start_ts-b.start_ts),seen=new Set(),closed=[];let open=0;
 for(const b of xs){need(!seen.has(b.start_ts),'DUPLICATE_CANDLE');seen.add(b.start_ts);if(b.end_ts>p.source_as_of_ts){open++;continue;}closed.push(validBar(b,d,alignment_offset_ms,p.source_as_of_ts));}
 const events=[];let gap=0,zero=0;
 for(let n=r.lookback;n<closed.length;n++){
  const b=closed[n],prior=closed.slice(n-r.lookback,n);
  if([...prior,b].some((v,k,a)=>k>0&&v.start_ts!==a[k-1].end_ts)){gap++;continue;}
  const f=features(b,prior);if(f.volume_ratio===null){zero++;continue;}
  const geom=f.body_ratio!==null&&(f.body_ratio<=r.small_body||f.upper_wick_ratio>=r.large_wick||f.lower_wick_ratio>=r.large_wick);
  if(!(f.volume_ratio>=r.volume_ratio&&geom)&&f.volume_ratio<r.extreme_ratio)continue;
  const identity={instrument:i,timeframe,event_start_ts:b.start_ts,event_end_ts:b.end_ts,rules_hash:hash(r)};
  const factual={identity,candle:b,features:f,background:prior,provenance:p,alignment_offset_ms};
  const id='ANOM:'+hash(identity),timely=mode==='LIVE_CAPTURE'&&p.evidence_class==='PROSPECTIVE'&&known_ts-b.end_ts<=r.timely_lag_ms;
  const card={schema:VERSION,event_id:id,episode_id:id,group_key:hash({instrument:i,event_start_ts:b.start_ts}),...identity,alignment_offset_ms,first_known_ts:known_ts,discovery:timely?'PROSPECTIVE':'BACKFILLED',capture_mode:mode,evidence_class:p.evidence_class,provenance:p,candle:b,features:f,background:prior,anchor:{price:b.close,source_ts:b.end_ts},facts:['CLOSED_OHLCV','UNUSUAL_VOLUME_RELATIVE_TO_PRIOR_SAME_MARKET'],hypotheses:['ABSORPTION_POSSIBLE','DISTRIBUTION_POSSIBLE','TWO_SIDED_TURNOVER_POSSIBLE','DERIVATIVES_NOISE_POSSIBLE','INSUFFICIENT_CAUSAL_DATA'],rules:r,spot_context:{status:'SPOT_EVENT_WINDOW_MISSING',required:false},conditions:{LONG:{confirm_close_above:b.high,refute_close_below:b.low},SHORT:{confirm_close_below:b.low,refute_close_above:b.high},timeframe:r.confirmation_timeframe},direction:'UNASSIGNED',entry_authorized:false,main_score_effect:0,fact_fingerprint:hash({...factual,provenance:{...p,received_ts:null}})};
  events.push({...card,card_hash:hash(card)});
 }
 return {schema:VERSION,events,diagnostic:{closed_bars:closed.length,open_bars_excluded:open,gapped_backgrounds:gap,zero_median_backgrounds:zero,insufficient_history:closed.length<=r.lookback},empirical_accuracy:null,activated:false};
}
function checkedCard(c){const {card_hash,...body}=c;need(card_hash===hash(body),'CARD_INTEGRITY');return c;}
export const WATCH_ADMISSION_VERSION='SEPARATE_BACKFILL_WATCH_V1';
const admissionPolicy=limits=>({version:WATCH_ADMISSION_VERSION,backfill_card_limit:limits.max_cards-limits.max_active});
function checkedAdmission(memory){
 need(memory.admission_policy?.version===WATCH_ADMISSION_VERSION,'EXPLICIT_LEGACY_MEMORY_UPGRADE_REQUIRED');
 need(memory.admission_policy.backfill_card_limit===memory.limits.max_cards-memory.limits.max_active,'MEMORY_ADMISSION_POLICY_INVALID');
}
function captureClass(c){
 checkedCard(c);need(['PROSPECTIVE','BACKFILLED'].includes(c.discovery),'CAPTURE_CLASS_INVALID');
 if(c.discovery==='PROSPECTIVE')need(c.capture_mode==='LIVE_CAPTURE'&&c.evidence_class==='PROSPECTIVE'&&ts(c.first_known_ts)&&ts(c.event_end_ts)&&c.first_known_ts>=c.event_end_ts&&c.first_known_ts-c.event_end_ts<=c.rules.timely_lag_ms,'PROSPECTIVE_CAPTURE_CLASS_INVALID');
 return c.discovery;
}
const activeCount=memory=>Object.values(memory.watch).filter(w=>w.active).length;
const backfillCount=memory=>Object.values(memory.cards).filter(c=>c.discovery==='BACKFILLED').length;
function deferredCard(memory,c,status){
 // Nothing here persists outside this bounded model. The caller still owns
 // the entire original card, including first-known time and proof references.
 return {state:memory,status,event_id:c.event_id,card_hash:c.card_hash,first_known_ts:c.first_known_ts,raw_ref:c.provenance.raw_ref,raw_sha256:c.provenance.raw_sha256,caller_owned_card:clone(c),card_retained_by_model:false,durable_ingress_required:true,native_admission_qualified:false};
}
function initialWatch(c){return {active:false,status:'HISTORY_RECORDED',admission_kind:'HISTORICAL_RECORD_ONLY',hypotheses:{LONG:'WAITING',SHORT:'WAITING'},last_source_ts:null,last_snapshot_id:null,last_snapshot_hash:null,next_check_ts:c.first_known_ts,last_observed_ts:null,observed_count:0,gaps:[],sampled_high:c.anchor.price,sampled_low:c.anchor.price,transitions:0};}
export function newMemory({max_active=128,max_cards=512,max_gap_spans=128,expected_snapshot_ms=300000,max_source_age_ms=300000}={}){
 need(Number.isInteger(max_active)&&max_active>0&&max_active<=10000&&Number.isInteger(max_cards)&&max_cards>=max_active&&max_cards<=20000&&Number.isInteger(max_gap_spans)&&max_gap_spans>0&&Number.isSafeInteger(expected_snapshot_ms)&&expected_snapshot_ms>0&&Number.isSafeInteger(max_source_age_ms)&&max_source_age_ms>0,'MEMORY_LIMITS_INVALID');
 const limits={max_active,max_cards,max_gap_spans,expected_snapshot_ms,max_source_age_ms};
 return {schema:VERSION,limits,admission_policy:admissionPolicy(limits),cards:{},watch:{},transitions:[],outbox:{}};
}
export function capture(memory,card,{watch_mode}={}){
 checkedAdmission(memory);const kind=captureClass(card),old=memory.cards[card.event_id];
 need(watch_mode===undefined||watch_mode==='HISTORICAL_REVIEW'&&kind==='BACKFILLED','WATCH_MODE_INVALID');
 if(old){checkedCard(old);return {state:memory,status:old.fact_fingerprint===card.fact_fingerprint?'DUPLICATE':'CONFLICTING_REPLAY',event_id:old.event_id};}
 if(Object.keys(memory.cards).length>=memory.limits.max_cards)return deferredCard(memory,card,'DEFERRED_CARD_CAPACITY');
 if(kind==='BACKFILLED'&&backfillCount(memory)>=memory.admission_policy.backfill_card_limit)return deferredCard(memory,card,'DEFERRED_BACKFILL_CARD_CAPACITY');
 const state=clone(memory);state.cards[card.event_id]=clone(card);state.watch[card.event_id]=initialWatch(card);
 if(kind==='PROSPECTIVE'||watch_mode==='HISTORICAL_REVIEW'){
  const result=admitWatch(state,card.event_id,{mode:kind==='PROSPECTIVE'?'PROSPECTIVE_RETRY':'HISTORICAL_REVIEW'});
  return {...result,status:result.status==='WATCH_ADMITTED'?'CAPTURED':'RECORDED_WATCH_DEFERRED',card_retained_by_model:true,native_admission_qualified:false};
 }
 return {state,status:'RECORDED_BACKFILL',event_id:card.event_id,card_retained_by_model:true,watch_admitted:false,native_admission_qualified:false};
}
export function admitWatch(memory,event_id,{mode}={}){
 checkedAdmission(memory);const c=checkedCard(memory.cards[event_id]||{}),kind=captureClass(c),w=memory.watch[event_id];need(w,'WATCH_RECORD_MISSING');
 need(mode===(kind==='PROSPECTIVE'?'PROSPECTIVE_RETRY':'HISTORICAL_REVIEW'),'EXPLICIT_WATCH_MODE_REQUIRED');
 if(w.active)return {state:memory,status:'ALREADY_WATCH_ADMITTED',event_id,watch_admitted:true,native_admission_qualified:false};
 if(!['HISTORY_RECORDED','WATCH_DEFERRED_ACTIVE_CAPACITY','LEGACY_RECORD_ONLY'].includes(w.status))return {state:memory,status:'CLOSED_OR_UNRECONCILED_WATCH_NOT_REOPENED',event_id,watch_admitted:false,native_admission_qualified:false};
 const state=clone(memory),record=state.watch[event_id];
 if(activeCount(memory)>=memory.limits.max_active){record.status='WATCH_DEFERRED_ACTIVE_CAPACITY';return {state,status:'WATCH_DEFERRED_ACTIVE_CAPACITY',event_id,watch_admitted:false,native_admission_qualified:false};}
 record.active=true;record.status='WATCHING';record.admission_kind=kind==='PROSPECTIVE'?'PROSPECTIVE_CAPTURE':'HISTORICAL_EXPLICIT';
 return {state,status:'WATCH_ADMITTED',event_id,watch_admitted:true,native_admission_qualified:false};
}
export function upgradeLegacyMemory(memory){
 need(memory?.schema===VERSION,'MEMORY_SCHEMA_INVALID');
 if(memory.admission_policy){checkedAdmission(memory);return {state:memory,status:'ALREADY_UPGRADED'};}
 // Explicit in-memory migration only: preserve all existing active watches,
 // outcome links/unknown fields and outbox. Historical debt is not evicted.
 need(memory.limits&&['max_active','max_cards','max_gap_spans','expected_snapshot_ms','max_source_age_ms'].every(k=>Object.hasOwn(memory.limits,k)),'LEGACY_LIMITS_REQUIRED');
 const limits=newMemory(memory.limits).limits;
 need(Object.keys(memory.cards).length<=limits.max_cards&&activeCount(memory)<=limits.max_active,'LEGACY_MEMORY_OVER_GLOBAL_LIMITS');
 for(const c of Object.values(memory.cards))captureClass(c);
 for(const id of Object.keys(memory.watch))need(memory.cards[id],'LEGACY_WATCH_CARD_MISSING');
 for(const o of Object.values(memory.outbox))need(memory.cards[o.transition?.event_id],'LEGACY_OUTBOX_CARD_MISSING');
 const state=clone(memory);state.admission_policy=admissionPolicy(limits);
 for(const [id,c] of Object.entries(state.cards)){
  if(!state.watch[id])state.watch[id]={...initialWatch(c),status:'LEGACY_RECORD_ONLY'};
  else state.watch[id].admission_kind??='LEGACY_RETAINED';
 }
 return {state,status:'LEGACY_PRESERVED_EXPLICITLY',legacy_active_backfilled:Object.entries(state.watch).filter(([id,w])=>w.active&&state.cards[id].discovery==='BACKFILLED').length,legacy_backfill_card_overage:Math.max(0,backfillCount(state)-state.admission_policy.backfill_card_limit),native_migration_qualified:false};
}
function transition(state,c,w,direction,to,s,now){
 const from=w.hypotheses[direction];if(from===to)return;
 w.hypotheses[direction]=to;w.transitions++;
 const t={event_id:c.event_id,transition:w.transitions,direction,from,to,source_ts:s.source_ts,observed_ts:now,snapshot_id:s.snapshot_id,raw_sha256:s.raw_sha256,timeliness:w.gaps.length?'GAPPED_CURRENT_CONFIRMATION':'OBSERVED',...(w.gap_overflow?{gap_details_complete:false}:{}),entry_authorized:false};
 t.transition_id=hash(t);state.transitions.push(t);
 // Draft only. Exactly-once external delivery needs a real transactional store and ACK protocol.
 state.outbox[t.transition_id]={transition:t,status:'DRAFT',message_id:null,network_send_enabled:false};
}
export function observe(memory,{event_id,snapshot,now_ts}={}){
 checkedAdmission(memory);need(ts(now_ts),'NOW_REQUIRED');const c=checkedCard(memory.cards[event_id]||{}),before=memory.watch[event_id];need(before,'WATCH_MISSING');
 const s=snapshot;need(s&&hash(exactInstrument(s.instrument))===hash(c.instrument)&&str(s.snapshot_id)&&hex(s.raw_sha256)&&ts(s.source_ts)&&ts(s.received_ts)&&s.source_ts<=s.received_ts&&s.received_ts<=now_ts&&now_ts-s.source_ts<=memory.limits.max_source_age_ms&&s.source_ts>=c.first_known_ts&&num(s.price)&&s.price>0,'EXACT_SNAPSHOT_REQUIRED');
 const sh=hash(s);
 if(s.snapshot_id===before.last_snapshot_id)return {state:memory,status:sh===before.last_snapshot_hash?'DUPLICATE':'CONFLICTING_SNAPSHOT'};
 if(before.last_source_ts!==null&&s.source_ts<=before.last_source_ts)return {state:memory,status:'STALE_OR_REPLAYED_SOURCE_TIME'};
 if(!before.active)return {state:memory,status:['HISTORY_RECORDED','WATCH_DEFERRED_ACTIVE_CAPACITY','LEGACY_RECORD_ONLY'].includes(before.status)?'WATCH_NOT_ADMITTED':'ALREADY_CLOSED'};
 const state=clone(memory),w=state.watch[event_id],previous=w.last_source_ts??c.first_known_ts;let unretained_gap;
 if(s.source_ts-previous>state.limits.expected_snapshot_ms){
  const interval={start_ts:previous,end_ts:s.source_ts,kind:'UNOBSERVED_INTERVAL',interpolated:false};
  if(w.gaps.length<state.limits.max_gap_spans)w.gaps.push(interval);
  else{
   // Keep every retained interval. Exhausted detail capacity must not freeze
   // current observation; enclosing bounds do not reconstruct the lost path.
   const old=w.gap_overflow;
   need(!old||old.schema==='GAP_DETAIL_OVERFLOW_V1'&&Number.isSafeInteger(old.unretained_interval_count)&&old.unretained_interval_count>0&&old.unretained_interval_count<Number.MAX_SAFE_INTEGER&&ts(old.first_start_ts)&&ts(old.last_end_ts)&&old.first_start_ts<old.last_end_ts&&old.last_end_ts<=previous&&old.exact_intervals_retained===false&&old.bounds_scope==='ENCLOSING_NOT_CONTIGUOUS','GAP_OVERFLOW_STATE_INVALID');
   w.gap_overflow={schema:'GAP_DETAIL_OVERFLOW_V1',unretained_interval_count:(old?.unretained_interval_count??0)+1,first_start_ts:old?.first_start_ts??previous,last_end_ts:s.source_ts,exact_intervals_retained:false,bounds_scope:'ENCLOSING_NOT_CONTIGUOUS'};
   // This receipt belongs to the caller, not a durable store in this model.
   unretained_gap={event_id,interval,caller_owned_snapshot:clone(s),gap_detail_retained_by_model:false,durable_ingress_required:true,native_ingress_qualified:false};
  }
 }
 w.last_source_ts=s.source_ts;w.last_snapshot_id=s.snapshot_id;w.last_snapshot_hash=sh;w.last_observed_ts=now_ts;w.observed_count++;w.next_check_ts=s.source_ts+state.limits.expected_snapshot_ms;
 w.sampled_high=Math.max(w.sampled_high,s.price);w.sampled_low=Math.min(w.sampled_low,s.price);
 if(s.closed_candle){
  const b=s.closed_candle,d=CONFIRM[c.conditions.timeframe];
  need(b.timeframe===c.conditions.timeframe&&b.start_ts>=c.first_known_ts&&b.end_ts<=s.source_ts&&s.source_ts-b.end_ts<=memory.limits.max_source_age_ms&&b.raw_sha256===s.raw_sha256,'CONFIRMATION_WINDOW_REQUIRED');
  validBar(b,d,c.alignment_offset_ms%d,s.source_ts);
  if(b.close>c.candle.high){
   if(w.hypotheses.LONG==='WAITING')transition(state,c,w,'LONG','CONFIRMED',s,now_ts);
   if(w.hypotheses.SHORT!=='REFUTED')transition(state,c,w,'SHORT','REFUTED',s,now_ts);
  }else if(b.close<c.candle.low){
   if(w.hypotheses.SHORT==='WAITING')transition(state,c,w,'SHORT','CONFIRMED',s,now_ts);
   if(w.hypotheses.LONG!=='REFUTED')transition(state,c,w,'LONG','REFUTED',s,now_ts);
  }
 }
 w.active=!Object.values(w.hypotheses).every(x=>x==='REFUTED');
 w.status=w.active?(Object.values(w.hypotheses).includes('CONFIRMED')?'CONFIRMED_OBSERVATION':'WATCHING'):'REFUTED';
 return {state,status:'OBSERVED',new_transitions:state.transitions.length-memory.transitions.length,observed_extrema_scope:'SAMPLED_PRICES_ONLY',...(w.gap_overflow?{gap_details_complete:false,gap_overflow:clone(w.gap_overflow)}:{}),...(unretained_gap?{unretained_gap}:{})};
}
export function dueEvents(memory,now_ts,{limit=128}={}){
 checkedAdmission(memory);need(ts(now_ts)&&Number.isInteger(limit)&&limit>0,'DUE_ARGUMENTS');
 const all=Object.entries(memory.watch).filter(([,w])=>w.active&&w.next_check_ts<=now_ts).sort((a,b)=>a[1].next_check_ts-b[1].next_check_ts||a[0].localeCompare(b[0]));
 const events=all.slice(0,limit).map(([id])=>id);
 return {events,deferred:Math.max(0,all.length-limit),oldest_due_ts:all[0]?.[1].next_check_ts??null,lanes:{prospective:events.filter(id=>memory.cards[id].discovery==='PROSPECTIVE'),historical:events.filter(id=>memory.cards[id].discovery==='BACKFILLED')},pending_watch_count:Object.values(memory.watch).filter(w=>w.status==='WATCH_DEFERRED_ACTIVE_CAPACITY').length,backfill_record_count:backfillCount(memory),legacy_active_backfilled:Object.entries(memory.watch).filter(([id,w])=>w.active&&w.admission_kind==='LEGACY_RETAINED'&&memory.cards[id].discovery==='BACKFILLED').length,main_selection_used:false};
}
export function protectedReferences(memory){
 // Capture now includes inactive backfill and pending admission. Until an
 // external complete outcome/reference graph qualifies expiry, protect every
 // retained card; a closed watch or simulated SENT cannot erase its proof.
 return Object.keys(memory.cards).sort().map(id=>({event_id:id,card_hash:memory.cards[id].card_hash,raw_ref:memory.cards[id].provenance.raw_ref,raw_sha256:memory.cards[id].provenance.raw_sha256,protect:['CARD','ANCHOR','RAW_PROOF','UNFINISHED_OUTCOMES','OUTBOX'],retention_eligibility_qualified:false,production_retention_hook_installed:false}));
}
export function draftNotice(memory,transition_id){
 const t=memory.outbox[transition_id]?.transition;need(t,'TRANSITION_MISSING');const c=checkedCard(memory.cards[t.event_id]);
 const side=t.direction==='LONG'?'вверх':'вниз',state=t.to==='CONFIRMED'?'подтверждён выход':'гипотеза опровергнута';
 return {transition_id,text:`Блок аномалий · ${c.instrument.contract} · ${c.timeframe}\nСобытие ${new Date(c.event_end_ts).toISOString()}, впервые сохранено ${new Date(c.first_known_ts).toISOString()} (${c.discovery}). Объём ${c.features.volume_ratio.toFixed(2)}× прошлого фона. Сейчас ${state} ${side} по закрытой ${c.conditions.timeframe} свече. ${t.timeliness==='OBSERVED'?'':'В наблюдении есть пропуски. '}Спот: окно события отсутствует. Наблюдение, без разрешения входа.`,send_enabled:false};
}
export function serialize(memory){for(const c of Object.values(memory.cards))checkedCard(c);return canonical({state:memory,sha256:hash(memory)});}
export function restore(serialized){const x=JSON.parse(serialized);need(x?.state?.schema===VERSION&&x.sha256===hash(x.state),'MEMORY_CHECKSUM');for(const c of Object.values(x.state.cards))checkedCard(c);return clone(x.state);}
