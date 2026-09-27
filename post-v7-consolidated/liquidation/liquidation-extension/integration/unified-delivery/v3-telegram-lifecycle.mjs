export const TELEGRAM_LIFECYCLE_VERSION = 'v3-telegram-lifecycle-shadow-v1';
export const USER_STATE = Object.freeze({
  NONE: 'NONE',
  OBSERVE: 'OBSERVE',
  WAIT: 'WAIT',
  ENTRY: 'ENTRY',
  IDEA_REMOVED: 'IDEA_REMOVED',
  HOLD: 'HOLD',
  EXIT: 'EXIT',
});
export const DISPATCH_STATE = Object.freeze({
  PENDING: 'PENDING',
  SENDING: 'SENDING',
  SENT: 'SENT',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  FAILED_FINAL: 'FAILED_FINAL',
  EXPIRED_NOT_SENT: 'EXPIRED_NOT_SENT',
  SUPPRESSED_DEDUP: 'SUPPRESSED_DEDUP',
});

const CLOSED = 'CLOSED';
const TERMINAL = new Set(['EDGE_SPENT','EXIT','EXCLUDE']);
const IDEA_REMOVAL_REASONS = new Set([
  'INVALIDATED','EDGE_SPENT','HARD_VETO','STRUCTURE_BROKEN','DATA_UNUSABLE','DIRECTION_DESTROYED'
]);

function text(v){ return String(v ?? '').trim(); }
function upper(v){ return text(v).toUpperCase(); }
function bool(v){ return v === true || v === 1 || v === '1'; }
function finite(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function direction(v){ const d=upper(v); return d==='LONG'||d==='SHORT'?d:null; }
function qualityClosed(v){ return upper(v)===CLOSED; }

export function buildLifecycleKey({contract,direction:dir,wave_id,rules_version,event}={}){
  const c=text(contract), d=direction(dir), w=text(wave_id), r=text(rules_version), e=text(event);
  if(!c||!d||!w||!r||!e) return null;
  return `${c}|${d}|${w}|${e}|${r}`;
}

export function deriveUserLifecycleStatus(ctx={}){
  const previous=upper(ctx.previous_status||USER_STATE.NONE);
  const dir=direction(ctx.direction);
  const removal=upper(ctx.removal_reason);
  const lifecycle=upper(ctx.lifecycle_stage);

  if (bool(ctx.position_open)) {
    const action=upper(ctx.management_action);
    if(action==='EXIT') return {status:USER_STATE.EXIT, reason:'OPEN_POSITION_EXIT'};
    if(action==='HOLD') return {status:USER_STATE.HOLD, reason:'OPEN_POSITION_HOLD'};
    return {status:USER_STATE.NONE, reason:'OPEN_POSITION_MANAGEMENT_NOT_CLOSED'};
  }

  const previouslySurfaced = [USER_STATE.OBSERVE,USER_STATE.WAIT,USER_STATE.ENTRY].includes(previous);
  if (previouslySurfaced && (
    IDEA_REMOVAL_REASONS.has(removal) || TERMINAL.has(lifecycle) || bool(ctx.hard_veto) || bool(ctx.structure_broken) || bool(ctx.data_unusable) || bool(ctx.direction_destroyed)
  )) {
    return {status:USER_STATE.IDEA_REMOVED, reason: removal || lifecycle || (bool(ctx.hard_veto)?'HARD_VETO':'INVALIDATED')};
  }

  if (!bool(ctx.deep_check_completed)) return {status:USER_STATE.NONE, reason:'LIVE_DEEP_CHECK_NOT_COMPLETED'};
  if (!bool(ctx.identity_current)) return {status:USER_STATE.NONE, reason:'IDENTITY_NOT_CURRENT'};
  if (!bool(ctx.data_current)) return {status:USER_STATE.NONE, reason:'DATA_NOT_CURRENT'};
  if (bool(ctx.hard_veto)) return {status:previouslySurfaced?USER_STATE.IDEA_REMOVED:USER_STATE.NONE, reason:'HARD_VETO'};
  if (TERMINAL.has(lifecycle)) return {status:previouslySurfaced?USER_STATE.IDEA_REMOVED:USER_STATE.NONE, reason:lifecycle};

  const strictQuality = qualityClosed(ctx.data_quality) && qualityClosed(ctx.execution_quality) && qualityClosed(ctx.evidence_independence);
  const entryReady = bool(ctx.final_row_exists) && !!dir && strictQuality &&
    upper(ctx.timing_state)==='ENTRY_WINDOW' && bool(ctx.freshness_future_pass) &&
    bool(ctx.final_score_threshold_pass) && bool(ctx.d1_pretelegram_budget_closed) && bool(ctx.dedup_pass) &&
    bool(ctx.valid_until_active) && !bool(ctx.superseded);

  if(entryReady) return {status:USER_STATE.ENTRY, reason:'STRICT_FINAL_CHAIN_CLOSED'};

  const waitReady = !!dir && bool(ctx.direction_confirmed) && strictQuality &&
    !bool(ctx.edge_spent) && bool(ctx.evidence_independence_sufficient ?? true) &&
    !['ENTRY_WINDOW','EDGE_SPENT','EXIT','EXCLUDE'].includes(upper(ctx.timing_state));
  if(waitReady) return {status:USER_STATE.WAIT, reason:'DIRECTION_CLOSED_ENTRY_WINDOW_NOT_READY'};

  if(bool(ctx.structure_interesting) && bool(ctx.useful_observation) && bool(ctx.data_sufficient_for_observation)) {
    return {status:USER_STATE.OBSERVE, reason:'USEFUL_LIVE_OBSERVATION'};
  }
  return {status:USER_STATE.NONE, reason:'OBSERVATION_NOT_USEFUL_OR_INSUFFICIENT'};
}

export function decideLifecycleDispatch({previous_status,current_status,contract,direction:dir,wave_id,rules_version,cooldown_active=false}={}){
  const prev=upper(previous_status||USER_STATE.NONE), cur=upper(current_status||USER_STATE.NONE);
  if(!Object.values(USER_STATE).includes(cur)) return {dispatch:false,reason:'STATUS_UNSUPPORTED',key:null};
  if(cur===USER_STATE.NONE) return {dispatch:false,reason:'NOT_USER_VISIBLE',key:null};
  if(cur===prev) return {dispatch:false,reason:'NO_STATE_CHANGE',key:null};

  const allowed = new Set([
    `${USER_STATE.NONE}>${USER_STATE.OBSERVE}`,
    `${USER_STATE.NONE}>${USER_STATE.WAIT}`,
    `${USER_STATE.NONE}>${USER_STATE.ENTRY}`,
    `${USER_STATE.OBSERVE}>${USER_STATE.WAIT}`,
    `${USER_STATE.WAIT}>${USER_STATE.ENTRY}`,
    `${USER_STATE.OBSERVE}>${USER_STATE.ENTRY}`,
    `${USER_STATE.OBSERVE}>${USER_STATE.IDEA_REMOVED}`,
    `${USER_STATE.WAIT}>${USER_STATE.IDEA_REMOVED}`,
    `${USER_STATE.ENTRY}>${USER_STATE.HOLD}`,
    `${USER_STATE.ENTRY}>${USER_STATE.EXIT}`,
    `${USER_STATE.HOLD}>${USER_STATE.EXIT}`,
  ]);
  const transition=`${prev}>${cur}`;
  if(!allowed.has(transition)) return {dispatch:false,reason:'TRANSITION_NOT_ALLOWED',transition,key:null};

  const cooldownBypass = (prev===USER_STATE.WAIT && cur===USER_STATE.ENTRY) || cur===USER_STATE.EXIT || cur===USER_STATE.IDEA_REMOVED;
  if(bool(cooldown_active) && !cooldownBypass) return {dispatch:false,reason:'COOLDOWN_ACTIVE',transition,key:null};
  const key=buildLifecycleKey({contract,direction:dir,wave_id,rules_version,event:cur});
  if(!key) return {dispatch:false,reason:'DEDUP_KEY_NOT_CLOSED',transition,key:null};
  return {dispatch:true,reason:'STATE_TRANSITION',transition,key,cooldown_bypass:cooldownBypass};
}

export function revalidateBeforeSend({status,now=Date.now(),observation_ts,valid_until_ts,identity_current,data_current,lifecycle_stage,hard_veto,superseded,timing_state,cancellation_prior_delivery_verified=false}={}){
  const st=upper(status), nowTs=finite(now), obs=finite(observation_ts), until=finite(valid_until_ts);
  if(!Object.values(USER_STATE).includes(st) || st===USER_STATE.NONE) return {ok:false,status:'INVALID_USER_STATE'};
  if(nowTs===null || obs===null || obs>nowTs) return {ok:false,status:'OBSERVATION_TIME_INVALID'};
  if(!bool(identity_current)) return {ok:false,status:'IDENTITY_NOT_CURRENT'};
  if(!bool(data_current)) return {ok:false,status:'DATA_NOT_CURRENT'};
  if(bool(hard_veto)) return {ok:false,status:'HARD_VETO_PRESENT'};
  if(bool(superseded)) return {ok:false,status:'SUPERSEDED'};
  if(TERMINAL.has(upper(lifecycle_stage)) && ![USER_STATE.IDEA_REMOVED,USER_STATE.EXIT].includes(st)) return {ok:false,status:'LIFECYCLE_TERMINAL'};
  const factualCancellation=st===USER_STATE.IDEA_REMOVED&&cancellation_prior_delivery_verified===true;
  if((until===null || nowTs>until)&&!factualCancellation) return {ok:false,status:'EXPIRED_NOT_SENT'};
  if(st===USER_STATE.ENTRY && upper(timing_state)!=='ENTRY_WINDOW') return {ok:false,status:'ENTRY_WINDOW_EXPIRED'};
  return {ok:true,status:'CURRENT'};
}

export function nextDispatchState({current,network_result,revalidation}={}){
  const cur=upper(current);
  if(cur===DISPATCH_STATE.PENDING && revalidation?.ok===false) return revalidation.status==='EXPIRED_NOT_SENT'||revalidation.status==='ENTRY_WINDOW_EXPIRED'
    ? DISPATCH_STATE.EXPIRED_NOT_SENT : DISPATCH_STATE.FAILED_FINAL;
  if(cur===DISPATCH_STATE.PENDING && revalidation?.ok===true) return DISPATCH_STATE.SENDING;
  if(cur===DISPATCH_STATE.SENDING){
    const r=upper(network_result);
    if(r==='CONFIRMED_SENT') return DISPATCH_STATE.SENT;
    if(['TIMEOUT','5XX','NETWORK_ERROR','UNKNOWN'].includes(r)) return DISPATCH_STATE.FAILED_RETRYABLE;
    return DISPATCH_STATE.FAILED_FINAL;
  }
  return cur || DISPATCH_STATE.FAILED_FINAL;
}

export function renderRussianLifecycleMessage({status,ticker,direction:dir,score_0_100,why,risk}={}){
  const st=upper(status), t=text(ticker).replace(/-USDT$/i,''), d=direction(dir);
  if(!t) return {ok:false,status:'TICKER_REQUIRED',message:null};
  const score=finite(score_0_100);
  const scoreText=score===null?'':` — ${Math.max(0,Math.min(100,Math.round(score)))}/100`;
  const side=d==='LONG'?'🟢 ЛОНГ':d==='SHORT'?'🔴 ШОРТ':'⚪️ НАПРАВЛЕНИЕ НЕ ЗАКРЫТО';
  const labels={OBSERVE:'НАБЛЮДАТЬ',WAIT:'ЖДАТЬ',ENTRY:'ВХОД',IDEA_REMOVED:'ИДЕЯ СНЯТА',HOLD:'УДЕРЖИВАТЬ',EXIT:'ВЫХОД'};
  if(!labels[st]) return {ok:false,status:'STATUS_NOT_RENDERABLE',message:null};
  const lines=[side,`${t}${scoreText} — ${labels[st]}`];
  if(text(why)) lines.push(`Почему: ${text(why)}`);
  if(text(risk)) lines.push(`Риск: ${text(risk)}`);
  if(score!==null) lines.push('Оценка — внутренняя, не статистическая вероятность прибыли.');
  const message=lines.join('\n');
  return {ok:message.length<=4096,status:message.length<=4096?'READY':'MESSAGE_TOO_LONG',message:message.length<=4096?message:null};
}


export function renderGroupedEarlyLifecycleReport(candidates,{max_per_direction=3}={}){
  const limit=Math.max(1,Math.min(3,Math.trunc(Number(max_per_direction)||3)));
  const rows=(Array.isArray(candidates)?candidates:[])
    .map((x)=>({...x,status:upper(x?.status),direction:direction(x?.direction),score:finite(x?.score_0_100)}))
    .filter((x)=>['OBSERVE','WAIT'].includes(x.status) && ['LONG','SHORT'].includes(x.direction) && text(x.ticker));
  const pick=(dir)=>rows.filter((x)=>x.direction===dir)
    .sort((a,b)=>(b.score??-Infinity)-(a.score??-Infinity) || text(a.ticker).localeCompare(text(b.ticker)))
    .slice(0,limit);
  const longs=pick('LONG'),shorts=pick('SHORT');
  const labels={OBSERVE:'НАБЛЮДАТЬ',WAIT:'ЖДАТЬ'};
  const lines=[];
  const section=(title,list)=>{
    lines.push(title);
    if(!list.length){lines.push('Сильных идей сейчас нет.');return;}
    list.forEach((r,i)=>{
      const ticker=text(r.ticker).replace(/-USDT$/i,'');
      const score=r.score===null?'':` — ${Math.max(0,Math.min(100,Math.round(r.score)))}/100`;
      lines.push(`${i+1}. ${ticker}${score} — ${labels[r.status]}`);
      if(text(r.why)) lines.push(`Почему: ${text(r.why)}`);
      if(text(r.risk)) lines.push(`Риск: ${text(r.risk)}`);
    });
  };
  section('🟢 ЛОНГ',longs); lines.push(''); section('🔴 ШОРТ',shorts);
  if([...longs,...shorts].some((r)=>r.score!==null)) lines.push('','Оценка N/100 — внутренняя, не статистическая вероятность прибыли.');
  const message=lines.join('\n').trim();
  return {ok:message.length>0&&message.length<=4096,status:message.length<=4096?'READY':'MESSAGE_TOO_LONG',message:message.length<=4096?message:null,
    long_count:longs.length,short_count:shorts.length,max_per_direction:limit,entry_included:false,shadow_only:true};
}

export function renderImmediateEntryLifecycleMessage(candidate={}){
  if(upper(candidate?.status)!=='ENTRY') return {ok:false,status:'ENTRY_REQUIRED',message:null,separate_immediate:false};
  const rendered=renderRussianLifecycleMessage(candidate);
  return {...rendered,separate_immediate:rendered.ok===true,grouped_early:false};
}

export function assessPipelineHealth({stage0_closed,discovery_closed,eligible_live_count=0,live_deep_check_count=0,live_zero_reason,maintenance_starved_live=false,handoff_lost=false,technical_final_block=false,telegram_relay_ok=true,persistent_db_ok=true,critical_feed_state='OK'}={}){
  const reasons=[];
  if(!bool(stage0_closed)) reasons.push('STAGE0_NOT_CLOSED');
  if(!bool(discovery_closed)) reasons.push('DISCOVERY_NOT_CLOSED');
  const eligible=Math.max(0,Number(eligible_live_count)||0), deep=Math.max(0,Number(live_deep_check_count)||0);
  const allowedZero=new Set(['BUDGET_BLOCKED','SOURCE_BUDGET_BLOCKED','COOLDOWN_ACTIVE','SOURCE_UNAVAILABLE','DATA_STALE','EXECUTION_VETO','IDENTITY_UNRESOLVED','NO_TECHNICALLY_ELIGIBLE_CANDIDATE']);
  if(eligible>0 && deep===0 && !allowedZero.has(upper(live_zero_reason))) reasons.push('LIVE_DEEP_CHECK_SILENT_DROP');
  if(bool(maintenance_starved_live)) reasons.push('MAINTENANCE_STARVED_LIVE');
  if(bool(handoff_lost)) reasons.push('SOURCE_HANDOFF_LOST');
  if(bool(technical_final_block)) reasons.push('FINAL_DECISION_TECHNICAL_BLOCK');
  if(!bool(telegram_relay_ok)) reasons.push('TELEGRAM_RELAY_BROKEN');
  if(!bool(persistent_db_ok)) reasons.push('PERSISTENT_DB_FAILURE');
  if(['STALE','DISCONNECTED','UNAVAILABLE'].includes(upper(critical_feed_state))) reasons.push('CRITICAL_FEED_DEGRADED');
  return {status:reasons.length?'DEGRADED_PIPELINE':'HEALTHY_NO_IDEA',reasons};
}

export function decideHealthAlert({previous,current}={}){
  const p=upper(previous), c=upper(current);
  if(!['HEALTHY_NO_IDEA','DEGRADED_PIPELINE'].includes(c)) return {send:false,reason:'CURRENT_HEALTH_INVALID'};
  if(p===c) return {send:false,reason:'NO_HEALTH_TRANSITION'};
  if(p==='HEALTHY_NO_IDEA' && c==='DEGRADED_PIPELINE') return {send:true,event:'DEGRADED'};
  if(p==='DEGRADED_PIPELINE' && c==='HEALTHY_NO_IDEA') return {send:true,event:'RECOVERED'};
  return {send:false,reason:'INITIAL_STATE_NO_ALERT'};
}
