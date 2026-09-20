// Informational transport only. Legacy SQL categories do not denote trading signals.
// INFO_* source refs and info:* keys are the authoritative semantic namespace.
import crypto from 'node:crypto';

export const INFO_LIMITS = Object.freeze({freshMs:720000, cooldownMs:1800000, rows:24, journalRows:1024});
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

export function normalizeInfoRow(r,now) {
  if (!integer(now) || !safeText(r?.contract,120) || !/^[\p{L}\p{N}][\p{L}\p{N}._-]*-USDT$/u.test(r.contract) || !safeText(r?.wave_id,256) || !direction(r?.direction)) return null;
  if (!['OBSERVE','WAIT'].includes(r.status)) return null;
  if (![r.observation_ts,r.updated_ts,r.valid_until_ts].every(integer)) return null;
  if (r.observation_ts > r.updated_ts || r.updated_ts > now || r.observation_ts > now || now-r.observation_ts > INFO_LIMITS.freshMs || now-r.updated_ts > INFO_LIMITS.freshMs || r.valid_until_ts <= now) return null;
  if (['HARD_VETO','EDGE_SPENT','INVALIDATED','STRUCTURE_BROKEN','DATA_UNUSABLE','DIRECTION_DESTROYED'].includes(r.reason)) return null;
  const raw = r.early_detection_quality_0_100 ?? r.score_0_100;
  const score = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : null;
  return {...r,score_0_100:score};
}

export async function loadInformationalRows(db,now) {
  // Each status range uses an explicitly verified index and stops before the join.
  const sql = `SELECT l.*,e.lifecycle_stage,e.early_detection_quality_0_100
    FROM (SELECT * FROM (SELECT contract,direction,wave_id,status,reason,observation_ts,valid_until_ts,updated_ts
      FROM v3_user_lifecycle_shadow INDEXED BY ${INDEX_NAME}
      WHERE shadow_only=1 AND status='WAIT' AND updated_ts BETWEEN ?1 AND ?2 ORDER BY updated_ts DESC LIMIT 24)
    UNION ALL SELECT * FROM (SELECT contract,direction,wave_id,status,reason,observation_ts,valid_until_ts,updated_ts
      FROM v3_user_lifecycle_shadow INDEXED BY ${INDEX_NAME}
      WHERE shadow_only=1 AND status='OBSERVE' AND updated_ts BETWEEN ?1 AND ?2 ORDER BY updated_ts DESC LIMIT 24)) l
    LEFT JOIN v3_early_candidate_wave e ON e.wave_id=l.wave_id AND e.contract_code=l.contract`;
  const raw = rows(await db.prepare(sql).bind(now-INFO_LIMITS.freshMs,now).all());
  if (raw.length > INFO_LIMITS.rows*2) throw new Error('INFO_ROW_BOUND_EXCEEDED');
  const seen = new Set();
  return raw.map(r=>normalizeInfoRow(r,now)).filter(r=>{if(!r)return false;const k=JSON.stringify([r.contract,r.direction,r.wave_id]);if(seen.has(k))return false;seen.add(k);return true;});
}

function reason(r) {
  return r.status==='WAIT' ? 'Система наблюдает направление; вход пока не подтверждён.' : 'Кандидат требует дальнейшего наблюдения.';
}
function scoreText(r) { return r.score_0_100===null ? '' : ` — внутренняя оценка структуры ${Math.round(r.score_0_100)}/100`; }
function validRows(input,now) { return (Array.isArray(input)?input:[]).map(r=>normalizeInfoRow(r,now)).filter(Boolean); }
export function buildMorningInformationalMessage(input,{now=Date.now(),test=false}={}) {
  const list=validRows(input,now);
  const best=d=>list.filter(r=>r.direction===d).sort((a,b)=>(a.status==='WAIT'?-1:0)-(b.status==='WAIT'?-1:0) || (b.score_0_100??-1)-(a.score_0_100??-1) || b.updated_ts-a.updated_ts).slice(0,3);
  const longs=best('LONG'),shorts=best('SHORT');
  const out=[test?'Проверка Telegram — информационный отчёт':'Мой отчёт 2 — утро','Информационный обзор. НЕ ТОРГОВЫЙ СИГНАЛ.'];
  for(const [label,items] of [['ЛОНГ',longs],['ШОРТ',shorts]]) {
    out.push('',label);
    if(!items.length)out.push('Свежих допустимых наблюдений нет. Это не подтверждение отсутствия возможностей на рынке.');
    for(const r of items)out.push(`${r.contract.slice(0,-5)} — ${r.status==='WAIT'?'ЖДАТЬ':'НАБЛЮДАТЬ'}${scoreText(r)}`,reason(r));
  }
  out.push('','Подтверждённые торговые сигналы остаются выключены до статистической проверки.');
  const message=out.join('\n');
  return {ok:message.length<=4096,status:message.length<=4096?'READY':'MESSAGE_TOO_LONG',message:message.length<=4096?message:null,long_count:longs.length,short_count:shorts.length};
}
export function buildWaitInformationalMessage(row,{now=Date.now()}={}) {
  const r=normalizeInfoRow(row,now);
  if(!r || r.status!=='WAIT')return {ok:false,status:'NOT_CURRENT_WAIT',message:null};
  const message=[`Раннее наблюдение — НЕ ТОРГОВЫЙ СИГНАЛ`,`${r.contract.slice(0,-5)} • ${r.direction==='LONG'?'ЛОНГ':'ШОРТ'} • ЖДАТЬ${scoreText(r)}`,reason(r)].join('\n');
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

export async function runInformationalTelegram({db,now,source,relayUrl,relayKey,fetchImpl,reportTest=false,infoTestId=null,sendRelay,clock=Date.now}={}) {
  const out={morning:{status:'NOT_DUE',sent:false},early_info:{status:'NO_NEW_WAIT',sent:false,count:0}};
  if(!integer(now))throw new Error('INFO_CLOCK_INVALID');
  const test=reportTest===true || ['1','true','yes','on'].includes(String(reportTest).toLowerCase());
  const msk=new Date(now+10800000),date=msk.toISOString().slice(0,10);
  const morning=test || (source==='schedule' && msk.getUTCHours()===9);
  if(!morning && source!=='schedule')return out;
  if(test && !/^[a-f0-9]{64}$/.test(String(infoTestId))) {out.morning.status='INFO_TEST_ID_REQUIRED';return out;}
  const list=await loadInformationalRows(db,now);
  const jobs=[];
  if(morning) {
    jobs.push({built:buildMorningInformationalMessage(list,{now,test}),key:test?`info:test:${infoTestId}`:`info:morning:${date}`,ref:test?`INFO_TEST|${infoTestId}`:`INFO_MORNING|${date}`,category:INFO_CATEGORIES.MORNING,wait:false,row:null});
  } else {
    for(const row of list.filter(r=>r.status==='WAIT').sort((a,b)=>b.updated_ts-a.updated_ts).slice(0,8))
      jobs.push({row,built:buildWaitInformationalMessage(row,{now}),key:`info:wait:${sha(JSON.stringify([row.contract,row.direction,row.wave_id]))}`,ref:`INFO_WAIT|${row.contract}|${row.direction}`,category:INFO_CATEGORIES.WAIT,wait:true});
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
  else {out[field].count=out[field].sent?1:0;out[field].contract=row.contract;out[field].direction=row.direction;}
  return out;
  }
  return out;
}
