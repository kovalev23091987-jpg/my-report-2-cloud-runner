// Informational transport only. Legacy SQL categories do not denote trading signals.
// INFO_* source refs and info:* keys are the authoritative semantic namespace.
import crypto from 'node:crypto';

export const INFO_MIN_SCORE = 70;
export const INFO_LIMITS = Object.freeze({freshMs:720000, cooldownMs:1800000, rows:24, journalRows:1024, minScore:INFO_MIN_SCORE});
// Worst-case preaction envelope: the 1024-row namespace fuse plus bounded
// lifecycle/index lookups, reservation/readback and finalization/readback.
export const INFO_D1_BUDGET = Object.freeze({rowsRead:1536, rowsWritten:4});
export const INFO_CATEGORIES = Object.freeze({MORNING:'MORNING_REPORT', WAIT:'SHADOW_FINAL_DECISION'});
const INDEX_NAME = 'idx_report2_info_lifecycle_fresh';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const integer = x => typeof x === 'number' && Number.isSafeInteger(x) && x > 0;
const safeText = (x,max) => typeof x === 'string' && x.length > 0 && Buffer.byteLength(x,'utf8') <= max && x === x.normalize('NFKC') && !/[\p{Cc}\p{Cf}|]/u.test(x);
const direction = x => ['LONG','SHORT'].includes(x) ? x : null;
const ack = r => r?.success !== false && typeof r?.meta?.changes === 'number' && Number.isSafeInteger(r.meta.changes) && [0,1].includes(r.meta.changes) ? r.meta.changes : null;
const rows = r => { if (r?.success === false || !Array.isArray(r?.results)) throw new Error('INFO_DATA_RESULT_UNKNOWN'); return r.results; };

const EVIDENCE_TEXT = Object.freeze({
  OI_ACCELERATION:Object.freeze({BOTH:()=> 'открытый интерес ускоряется'}),
  FUNDING_TRAJECTORY:Object.freeze({
    LONG:()=> 'финансирование становится отрицательнее',
    SHORT:()=> 'финансирование становится положительнее',
  }),
  RELATIVE_STRENGTH:Object.freeze({
    LONG:()=> 'монета сильнее рынка',
    SHORT:()=> 'монета слабее рынка',
  }),
  VOLUME_ACCELERATION_PROXY:Object.freeze({BOTH:()=> 'торговая активность ускоряется'}),
  VOLUME_ACCELERATION:Object.freeze({BOTH:()=> 'торговая активность ускоряется'}),
  PRICE_STATE_TRANSITION:Object.freeze({
    LONG:()=> 'цена ускоряется вверх',
    SHORT:()=> 'цена теряет поддержку',
  }),
  ORDERFLOW_ABSORPTION:Object.freeze({
    LONG:()=> 'продажи поглощаются без падения цены',
    SHORT:()=> 'покупки поглощаются без роста цены',
  }),
  ORDERFLOW_EXHAUSTION:Object.freeze({
    LONG:()=> 'продавцы теряют силу',
    SHORT:()=> 'покупатели теряют силу',
  }),
  EXECUTION_BOOK_SUPPORT:Object.freeze({
    LONG:()=> 'стакан поддерживает покупателей',
    SHORT:()=> 'стакан поддерживает продавцов',
  }),
  POSITIONING_TRAJECTORY:Object.freeze({
    LONG:()=> 'участники смещаются к росту',
    SHORT:()=> 'участники смещаются к снижению',
  }),
  REALIZED_LIQUIDATION_PRESSURE:Object.freeze({
    LONG:()=> 'ликвидации продавцов поддерживают рост',
    SHORT:()=> 'ликвидации покупателей усиливают снижение',
  }),
});
const EVIDENCE_PRIORITY = Object.freeze([
  'RELATIVE_STRENGTH','OI_ACCELERATION','ORDERFLOW_ABSORPTION','ORDERFLOW_EXHAUSTION',
  'PRICE_STATE_TRANSITION','VOLUME_ACCELERATION','VOLUME_ACCELERATION_PROXY',
  'FUNDING_TRAJECTORY','EXECUTION_BOOK_SUPPORT','POSITIONING_TRAJECTORY','REALIZED_LIQUIDATION_PRESSURE',
]);

function parseEvidence(r) {
  if(r?.evidence_observed_ts!==r?.early_last_seen_ts || !integer(r?.evidence_observed_ts) || typeof r?.current_evidence_json!=='string' || Buffer.byteLength(r.current_evidence_json,'utf8')>16384)return [];
  let input;try{input=JSON.parse(r.current_evidence_json);}catch{return [];}
  if(!Array.isArray(input) || input.length>32)return [];
  const positions=new Map(),out=[];
  for(const item of input) {
    const domain=typeof item?.domain==='string'?item.domain:'';
    const side=typeof item?.side==='string'?item.side:'';
    if(item?.status!=='CLOSED' || !EVIDENCE_TEXT[domain] || ![r.direction,'BOTH'].includes(side))continue;
    const make=EVIDENCE_TEXT[domain][r.direction]??EVIDENCE_TEXT[domain].BOTH;
    if(typeof make!=='function')continue;
    const value={domain,phrase:make(item),side,detail_count:Object.keys(item).length};
    if(positions.has(domain)){
      const index=positions.get(domain);if(value.detail_count>out[index].detail_count)out[index]=value;
    }else{positions.set(domain,out.length);out.push(value);}
  }
  return out;
}

export function normalizeInfoRow(r,now) {
  if (!integer(now) || !safeText(r?.contract,120) || !/^[\p{L}\p{N}][\p{L}\p{N}._-]*-USDT$/u.test(r.contract) || !safeText(r?.wave_id,256) || !direction(r?.direction)) return null;
  if (!['OBSERVE','WAIT'].includes(r.status)) return null;
  if (![r.observation_ts,r.updated_ts,r.valid_until_ts].every(integer)) return null;
  if (r.observation_ts > r.updated_ts || r.updated_ts > now || r.observation_ts > now || now-r.observation_ts > INFO_LIMITS.freshMs || now-r.updated_ts > INFO_LIMITS.freshMs || r.valid_until_ts <= now) return null;
  if (!integer(r.early_last_seen_ts) || r.early_last_seen_ts>now || now-r.early_last_seen_ts>INFO_LIMITS.freshMs) return null;
  if (['HARD_VETO','EDGE_SPENT','INVALIDATED','STRUCTURE_BROKEN','DATA_UNUSABLE','DIRECTION_DESTROYED'].includes(r.reason)) return null;
  const raw = r.early_detection_quality_0_100 ?? r.score_0_100;
  const score = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : null;
  if(score===null || score<INFO_MIN_SCORE)return null;
  const evidence=parseEvidence({...r,score_0_100:score});
  if(!evidence.length)return null;
  return {...r,score_0_100:score,evidence};
}

export async function loadInformationalRows(db,now) {
  // Each status range uses an explicitly verified index and stops before the join.
  const sql = `SELECT l.*,e.lifecycle_stage,e.direction_state,e.early_detection_quality_0_100,e.last_seen_ts AS early_last_seen_ts,
      f.observed_ts AS evidence_observed_ts,f.evidence_json AS current_evidence_json
    FROM (SELECT * FROM (SELECT contract,direction,wave_id,status,reason,observation_ts,valid_until_ts,updated_ts
      FROM v3_user_lifecycle_shadow INDEXED BY ${INDEX_NAME}
      WHERE shadow_only=1 AND status='WAIT' AND updated_ts BETWEEN ?1 AND ?2 ORDER BY updated_ts DESC LIMIT 24)
    UNION ALL SELECT * FROM (SELECT contract,direction,wave_id,status,reason,observation_ts,valid_until_ts,updated_ts
      FROM v3_user_lifecycle_shadow INDEXED BY ${INDEX_NAME}
      WHERE shadow_only=1 AND status='OBSERVE' AND updated_ts BETWEEN ?1 AND ?2 ORDER BY updated_ts DESC LIMIT 24)) l
    LEFT JOIN v3_early_candidate_wave e ON e.wave_id=l.wave_id AND e.contract_code=l.contract
    LEFT JOIN v3_early_feature_snapshot f ON f.contract_code=e.contract_code AND f.ts_bucket=CAST(e.last_seen_ts/300000 AS INTEGER)*300000`;
  const raw = rows(await db.prepare(sql).bind(now-INFO_LIMITS.freshMs,now).all());
  if (raw.length > INFO_LIMITS.rows*2) throw new Error('INFO_ROW_BOUND_EXCEEDED');
  const seen = new Set();
  return raw.map(r=>normalizeInfoRow(r,now)).filter(r=>{if(!r)return false;const k=JSON.stringify([r.contract,r.direction,r.wave_id]);if(seen.has(k))return false;seen.add(k);return true;});
}

function actionText(){return '🟡 ЖДЁМ';}
function directionText(r){return r.direction==='LONG'?'🟢 ЛОНГ':'🔴 ШОРТ';}
function briefReason(r) {
  const byDomain=new Map(r.evidence.map(x=>[x.domain,x.phrase]));
  const clauses=EVIDENCE_PRIORITY.map(domain=>byDomain.get(domain)).filter(Boolean).slice(0,2);
  if(!clauses.length)return null;
  const wait=clauses.length===1?'вход по текущей цене ещё требует подтверждения':'вход ещё требует подтверждения';
  return `Почему интересно: ${clauses.join(', ')}; ${wait}.`;
}
function validRows(input,now) { return (Array.isArray(input)?input:[]).map(r=>normalizeInfoRow(r,now)).filter(Boolean); }
export function buildMorningInformationalMessage(input,{now=Date.now(),test=false}={}) {
  const list=validRows(input,now);
  const best=d=>list.filter(r=>r.direction===d).sort((a,b)=>(a.status==='WAIT'?-1:0)-(b.status==='WAIT'?-1:0) || (b.score_0_100??-1)-(a.score_0_100??-1) || b.updated_ts-a.updated_ts).slice(0,3);
  const longs=best('LONG'),shorts=best('SHORT');
  const out=[test?'Проверка Telegram — информационный отчёт':'Мой отчёт 2 — утро','Информационный обзор. НЕ ТОРГОВЫЙ СИГНАЛ.'];
  for(const [label,items] of [['ЛОНГ',longs],['ШОРТ',shorts]]) {
    out.push('',label);
    if(!items.length)out.push('Свежих допустимых наблюдений нет. Это не подтверждение отсутствия возможностей на рынке.');
    for(const r of items)out.push(`${r.contract.slice(0,-5)}\n${directionText(r)}\n${actionText(r)}\n${briefReason(r)}`);
  }
  out.push('','Подтверждённые торговые сигналы остаются выключены до статистической проверки.');
  const message=out.join('\n');
  return {ok:message.length<=4096,status:message.length<=4096?'READY':'MESSAGE_TOO_LONG',message:message.length<=4096?message:null,long_count:longs.length,short_count:shorts.length};
}
export function buildWaitInformationalMessage(row,{now=Date.now()}={}) {
  const r=normalizeInfoRow(row,now);
  if(!r || r.status!=='WAIT')return {ok:false,status:'NOT_CURRENT_WAIT',message:null};
  const message=['Раннее наблюдение — НЕ ТОРГОВЫЙ СИГНАЛ','',r.contract.slice(0,-5),directionText(r),actionText(r),'',briefReason(r)].join('\n');
  return {ok:message.length<=4096,status:'READY',message};
}

export function buildObserveInformationalMessage(row,{now=Date.now()}={}) {
  const r=normalizeInfoRow(row,now);
  if(!r || r.status!=='OBSERVE')return {ok:false,status:'NOT_CURRENT_OBSERVATION',message:null};
  const message=['Раннее наблюдение — НЕ ТОРГОВЫЙ СИГНАЛ','',r.contract.slice(0,-5),directionText(r),actionText(r),'',briefReason(r)].join('\n');
  return {ok:message.length<=4096,status:'READY',message};
}

export async function reserveInformational(db,{dispatchKey,category,sourceRef,text,now,wait=false}) {
  if(!integer(now) || !safeText(dispatchKey,300) || !dispatchKey.startsWith('info:') || typeof sourceRef!=='string' || !sourceRef.startsWith('INFO_') || !safeText(sourceRef.replaceAll('|',':'),400) || !['MORNING_REPORT','SHADOW_FINAL_DECISION'].includes(category) || typeof text!=='string' || !text.length || text.length>4096) throw new Error('INFO_RESERVATION_INPUT_INVALID');
  const hash=sha(text);
  const prior=await db.prepare(`SELECT status,message_hash,telegram_message_id,source_ref,category,reserved_ts FROM telegram_output_dispatch_journal_v2 WHERE dispatch_key=?1 LIMIT 1`).bind(dispatchKey).first();
  if(prior) {
    if(prior.category!==category || prior.source_ref!==sourceRef) return {reserved:false,reason:'INFO_IDENTITY_COLLISION'};
    if(!['RESERVED','SENT','SEND_FAILED'].includes(prior.status) || !/^[a-f0-9]{64}$/.test(String(prior.message_hash)) || !integer(prior.reserved_ts) || prior.reserved_ts>now) return {reserved:false,reason:'INFO_CORRUPT_JOURNAL_STATE'};
    return {reserved:false,reason:prior.status==='SENT'?'ALREADY_SENT':'EXISTING_RESERVATION_NO_AUTORETRY',delivery_confirmed:prior.status==='SENT' && /^[1-9]\d*$/.test(String(prior.telegram_message_id||'')),message_id:prior.telegram_message_id??null};
  }
  if(wait) {
    const scope=await db.prepare(`SELECT 1 AS blocked FROM (SELECT 1 FROM telegram_output_dispatch_journal_v2
      WHERE category=?1 AND source_ref=?2 AND status='RESERVED' LIMIT 1)
      UNION ALL SELECT 1 FROM (SELECT 1 FROM telegram_output_dispatch_journal_v2
      WHERE category=?1 AND source_ref=?2 AND status='SENT' AND updated_ts>=?3 LIMIT 1)
      UNION ALL SELECT 1 FROM (SELECT 1 FROM telegram_output_dispatch_journal_v2
      WHERE category=?1 AND source_ref=?2 AND status='SEND_FAILED' AND updated_ts>=?3 LIMIT 1) LIMIT 1`).bind(category,sourceRef,now-INFO_LIMITS.cooldownMs).first();
    if(scope)return {reserved:false,reason:'INFO_COOLDOWN'};
  }
  // One atomic INSERT covers both identity uniqueness and cross-wave cooldown.
  // ON CONFLICT handles only the primary key; CHECK/trigger errors stay visible.
  const sql=`INSERT INTO telegram_output_dispatch_journal_v2
    (dispatch_key,category,source_ref,status,reserved_ts,updated_ts,message_hash,telegram_message_id,telegram_http_status,error_text)
    SELECT ?1,?2,?3,'RESERVED',?4,?4,?5,NULL,NULL,NULL
    WHERE (?6=0 OR NOT EXISTS (SELECT 1 FROM telegram_output_dispatch_journal_v2
      WHERE category=?2 AND source_ref=?3 AND status='RESERVED' LIMIT 1))
    AND (?6=0 OR NOT EXISTS (SELECT 1 FROM telegram_output_dispatch_journal_v2
      WHERE category=?2 AND source_ref=?3 AND status IN ('RESERVED','SENT','SEND_FAILED') AND updated_ts>=?7 LIMIT 1))
    AND (SELECT count(*) FROM (SELECT dispatch_key FROM telegram_output_dispatch_journal_v2
      WHERE dispatch_key>='info:' AND dispatch_key<'info;' LIMIT ${INFO_LIMITS.journalRows})) < ${INFO_LIMITS.journalRows}
    ON CONFLICT(dispatch_key) DO NOTHING`;
  const result=await db.prepare(sql).bind(dispatchKey,category,sourceRef,now,hash,wait?1:0,now-INFO_LIMITS.cooldownMs).run();
  if(ack(result)!==1)return {reserved:false,reason:ack(result)===0?'INFO_DUPLICATE_COOLDOWN_OR_CAPACITY':'INFO_ACK_UNKNOWN'};
  const stored=await db.prepare(`SELECT category,source_ref,status,reserved_ts,message_hash FROM telegram_output_dispatch_journal_v2 WHERE dispatch_key=?1 LIMIT 1`).bind(dispatchKey).first();
  if(!stored || stored.category!==category || stored.source_ref!==sourceRef || stored.status!=='RESERVED' || stored.reserved_ts!==now || stored.message_hash!==hash)return {reserved:false,reason:'INFO_RESERVATION_READBACK_FAILED'};
  return {reserved:true,hash,reserved_ts:now};
}

async function finalizeInformational(db,key,claim,net,now) {
  const confirmed=net?.delivery_state==='SENT' && /^[1-9]\d*$/.test(String(net.message_id||''));
  const status=confirmed?'SENT':net?.delivery_state==='SEND_FAILED'?'SEND_FAILED':'RESERVED';
  const error=status==='RESERVED'?'DELIVERY_UNKNOWN_NO_AUTORETRY':status==='SEND_FAILED'?'DEFINITE_DELIVERY_FAILURE':null;
  const r=await db.prepare(`UPDATE telegram_output_dispatch_journal_v2
    SET status=?2,updated_ts=?3,telegram_message_id=?4,telegram_http_status=?5,error_text=?6
    WHERE dispatch_key=?1 AND status='RESERVED' AND message_hash=?7 AND reserved_ts=?8`).bind(key,status,now,confirmed?String(net.message_id):null,Number.isInteger(net?.http_status)?net.http_status:null,error,claim.hash,claim.reserved_ts).run();
  if(ack(r)!==1)return {status:'INFO_FINALIZE_ACK_UNKNOWN',sent:false,delivery_confirmed:false};
  const check=await db.prepare(`SELECT status,message_hash,telegram_message_id FROM telegram_output_dispatch_journal_v2 WHERE dispatch_key=?1 LIMIT 1`).bind(key).first();
  if(!check || check.status!==status || check.message_hash!==claim.hash || (confirmed && check.telegram_message_id!==String(net.message_id)))return {status:'INFO_FINALIZE_READBACK_FAILED',sent:false,delivery_confirmed:false};
  return {status:status==='RESERVED'?'DELIVERY_UNKNOWN_NO_AUTORETRY':status,sent:confirmed,delivery_confirmed:confirmed,message_id:confirmed?net.message_id:null};
}

export async function runInformationalTelegram({db,now,source,relayUrl,relayKey,fetchImpl,reportTest=false,infoTestId=null,sendRelay,clock=Date.now,observeEnabled=false,currentLifecycle=null}={}) {
  const out={morning:{status:'NOT_DUE',sent:false},early_info:{status:'NO_NEW_WAIT',sent:false,count:0}};
  if(!integer(now))throw new Error('INFO_CLOCK_INVALID');
  const test=reportTest===true || ['1','true','yes','on'].includes(String(reportTest).toLowerCase());
  const msk=new Date(now+10800000),date=msk.toISOString().slice(0,10);
  const morning=test || (source==='schedule' && msk.getUTCHours()===9);
  if(!morning && source!=='schedule')return out;
  if(test && !/^[a-f0-9]{64}$/.test(String(infoTestId))) {out.morning.status='INFO_TEST_ID_REQUIRED';return out;}
  if(currentLifecycle && !['CLOSED','CLOSED_NO_TRANSITION','CLOSED_NO_COMPLETED_HANDOFF'].includes(currentLifecycle.status)) {
    out.early_info={status:'UPSTREAM_LIFECYCLE_NOT_CLOSED',source_status:currentLifecycle.status,sent:false,count:0};
    out.morning={status:'UPSTREAM_LIFECYCLE_NOT_CLOSED',sent:false};return out;
  }
  const list=await loadInformationalRows(db,now);
  out.early_info.valid_wait_count=list.filter(r=>r.status==='WAIT').length;
  out.early_info.valid_observe_count=list.filter(r=>r.status==='OBSERVE').length;
  const jobs=[];
  if(morning) {
    jobs.push({built:buildMorningInformationalMessage(list,{now,test}),key:test?`info:test:${infoTestId}`:`info:morning:${date}`,ref:test?`INFO_TEST|${infoTestId}`:`INFO_MORNING|${date}`,category:INFO_CATEGORIES.MORNING,wait:false,row:null});
  } else {
    const currentKeys=currentLifecycle?new Set((currentLifecycle.transitions||[])
      .filter(t=>t.status==='CLOSED'&&['OBSERVE','WAIT'].includes(t.current_status))
      .map(t=>JSON.stringify([t.contract,t.direction,t.wave_id,t.current_status]))):null;
    const eligible=list.filter(r=>(r.status==='WAIT'||(observeEnabled===true&&r.status==='OBSERVE'))&&
      (!currentKeys||currentKeys.has(JSON.stringify([r.contract,r.direction,r.wave_id,r.status]))));
    if(!eligible.length && observeEnabled===true)out.early_info.status='NO_CURRENT_EARLY_OBSERVATION';
    if(currentLifecycle)out.early_info.upstream_reasons=(currentLifecycle.transitions||[]).map(t=>({contract:t.contract,status:t.status,reason:t.reason??null}));
    for(const row of eligible.sort((a,b)=>(a.status==='WAIT'?-1:0)-(b.status==='WAIT'?-1:0)||b.updated_ts-a.updated_ts).slice(0,8)) {
      const observe=row.status==='OBSERVE';
      jobs.push({row,built:observe?buildObserveInformationalMessage(row,{now}):buildWaitInformationalMessage(row,{now}),
        key:`info:${observe?'observe':'wait'}:${sha(JSON.stringify([row.contract,row.direction,row.wave_id]))}`,
        // Share the pre-existing per-symbol/direction cooldown and uncertain-send
        // scope with WAIT, so enabling observations cannot bypass old reservations.
        ref:`INFO_WAIT|${row.contract}|${row.direction}`,category:INFO_CATEGORIES.WAIT,wait:true});
    }
  }
  for(const {row,built,key,ref,category,wait} of jobs) {
  const field=morning?'morning':'early_info';
  if(!built.ok){out[field]={status:built.status,sent:false};return out;}
  const freshNow=clock();
  if(!integer(freshNow) || freshNow<now || freshNow-now>60000 || (row && !normalizeInfoRow(row,freshNow))) {out[field]={status:'INFO_STALE_BEFORE_RESERVATION',sent:false};return out;}
  const claim=await reserveInformational(db,{dispatchKey:key,category,sourceRef:ref,text:built.message,now:freshNow,wait});
  if(!claim.reserved){out[field]={status:claim.reason,sent:false,delivery_confirmed:test && claim.delivery_confirmed===true,message_id:claim.message_id??null};if(!morning && ['ALREADY_SENT','INFO_COOLDOWN','EXISTING_RESERVATION_NO_AUTORETRY'].includes(claim.reason))continue;return out;}
  const sendNow=clock();
  if(!integer(sendNow) || sendNow<freshNow || sendNow-now>60000 || (row && !normalizeInfoRow(row,sendNow)) || (morning && list.some(r=>!normalizeInfoRow(r,sendNow)))) {
    await finalizeInformational(db,key,claim,{delivery_state:'SEND_FAILED'},Math.max(freshNow,Number.isSafeInteger(sendNow)?sendNow:freshNow));
    out[field]={status:'INFO_STALE_BEFORE_SEND',sent:false};return out;
  }
  const net=await sendRelay({relayUrl,relayKey,text:built.message,fetchImpl});
  out[field]=await finalizeInformational(db,key,claim,net,Math.max(sendNow,clock()));
  if(morning){out[field].long_count=built.long_count;out[field].short_count=built.short_count;}
  else {out[field].count=out[field].sent?1:0;out[field].contract=row.contract;out[field].direction=row.direction;out[field].lifecycle_status=row.status;}
  return out;
  }
  return out;
}
