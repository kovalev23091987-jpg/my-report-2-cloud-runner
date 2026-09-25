export const ENTRY_SIGNAL_ROUTER_VERSION='entry-signal-router-v1-20260924';
export const ANALYTICAL_STATE=Object.freeze({
  ENTRY_NOW_ANALYTICAL:'ENTRY_NOW_ANALYTICAL',
  ENTRY_NOW_VALIDATED:'ENTRY_NOW_VALIDATED',
  WAIT_FOR_TRIGGER:'WAIT_FOR_TRIGGER',
  OBSERVE:'OBSERVE',
  REJECTED:'REJECTED',
});
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const stamp=v=>Number.isSafeInteger(v)&&v>=1_000_000_000_000;
const text=v=>typeof v==='string'&&v.trim()?v.trim():null;
const closed=v=>String(v||'').toUpperCase()==='CLOSED';
const bool=v=>v===true;

function fail(state,reason,extra={}){
  return {version:ENTRY_SIGNAL_ROUTER_VERSION,state,reason,automatic_trade:false,validated_probability:null,...extra};
}
function exactWaitTrigger({direction,current_price,scenario_plan,observed_ts,snapshot_id=null,recheck_ms=300000}){
  const d=String(direction||'').toUpperCase();
  const px=Number(current_price);
  const min=Number(scenario_plan?.entry_area_min_price);
  const max=Number(scenario_plan?.entry_area_max_price);
  const until=Number(scenario_plan?.valid_until_ts);
  const recheck=Number(recheck_ms);
  if(!['LONG','SHORT'].includes(d)||![px,min,max].every(Number.isFinite)||min<=0||max<min||!stamp(until)||until<observed_ts||!Number.isFinite(recheck)||recheck<=0) return null;
  const common={
    trigger_type:'PRICE_ENTRY_AREA',metric:'price',unit:'USDT',timeframe:'5m',
    confirming_metrics:['HTX_FUTURES_TURNOVER','HTX_EXECUTION','HARD_GATES_RECHECK'],
    evidence_snapshot_ids:text(snapshot_id)?[text(snapshot_id)]:[],
    expires_ts:until,next_recheck_ts:Math.min(until,observed_ts+Math.round(recheck)),
  };
  if(px<min) return {...common,operator:'>=',value:min,crossing_semantics:'CROSS_UP_INTO_ENTRY_AREA',cancel_condition:`price>${max}`};
  if(px>max) return {...common,operator:'<=',value:max,crossing_semantics:'CROSS_DOWN_INTO_ENTRY_AREA',cancel_condition:`price<${min}`};
  return null;
}


export function routeEntrySignal({
  final_decision,
  publication_gate,
  scenario_plan,
  current_price,
  observed_ts=Date.now(),
  validation_status='OPEN',
  structure_interesting=false,
  useful_observation=false,
}={}){
  if(!stamp(observed_ts)) return fail(ANALYTICAL_STATE.REJECTED,'OBSERVED_TS_INVALID');
  const fd=final_decision, pg=publication_gate, sp=scenario_plan;
  if(!obj(fd)) return fail(ANALYTICAL_STATE.REJECTED,'FINAL_DECISION_MISSING');
  if(fd.hard_veto===true || String(fd.hard_veto_state||'').toUpperCase()!=='CLEAR') return fail(ANALYTICAL_STATE.REJECTED,'HARD_VETO');
  if(!['LONG','SHORT'].includes(String(fd.direction||'').toUpperCase())) return fail(ANALYTICAL_STATE.REJECTED,'DIRECTION_NOT_CLOSED');
  if(fd.entry_action==='REJECT') return fail(ANALYTICAL_STATE.REJECTED,'FINAL_DECISION_REJECT');

  const qualityClosed=closed(fd.entry_quality)&&closed(fd.data_quality)&&closed(fd.execution_quality)&&closed(fd.independence_state);
  const timing=String(fd.timing_state||'').toUpperCase();
  const entryBase=fd.entry_action==='SHADOW_ENTRY_ELIGIBLE' && qualityClosed && timing==='ENTRY_WINDOW' && fd.risk_state==='CLEAR';
  const publicationClosed=obj(pg)&&pg.status==='CLOSED'&&obj(pg.telegram_context);
  const scenarioClosed=obj(sp)&&sp.status==='CLOSED'&&sp.current_price_in_entry_area===true&&stamp(sp.valid_until_ts)&&sp.valid_until_ts>=observed_ts;

  if(entryBase && publicationClosed && scenarioClosed){
    if(String(validation_status||'').toUpperCase()==='CLOSED'){
      return fail(ANALYTICAL_STATE.ENTRY_NOW_VALIDATED,'STRICT_VALIDATED_ENTRY_CLOSED',{
        direction:fd.direction,valid_until_ts:sp.valid_until_ts,telegram_context:pg.telegram_context,
      });
    }
    return fail(ANALYTICAL_STATE.ENTRY_NOW_ANALYTICAL,'STRICT_ANALYTICAL_ENTRY_CLOSED',{
      direction:fd.direction,valid_until_ts:sp.valid_until_ts,telegram_context:pg.telegram_context,
    });
  }

  if(fd.entry_action==='SHADOW_ENTRY_ELIGIBLE' || qualityClosed){
    const trigger=exactWaitTrigger({direction:fd.direction,current_price,scenario_plan:sp,observed_ts,snapshot_id:fd.snapshot_id??sp?.snapshot_id??null});
    if(trigger) return fail(ANALYTICAL_STATE.WAIT_FOR_TRIGGER,'PRICE_OUTSIDE_ENTRY_AREA',{direction:fd.direction,trigger});
    if(timing!=='ENTRY_WINDOW' && obj(sp)&&stamp(sp.valid_until_ts)&&sp.valid_until_ts>=observed_ts){
      const triggerPrice=Number(sp.entry_trigger_price);
      if(Number.isFinite(triggerPrice)&&triggerPrice>0){
        return fail(ANALYTICAL_STATE.WAIT_FOR_TRIGGER,'ENTRY_WINDOW_NOT_OPEN',{
          direction:fd.direction,
          trigger:{
            trigger_type:'PRICE_ENTRY_WINDOW',metric:'price',operator:fd.direction==='LONG'?'>=':'<=',value:triggerPrice,unit:'USDT',
            crossing_semantics:fd.direction==='LONG'?'CROSS_UP_TO_ENTRY_TRIGGER':'CROSS_DOWN_TO_ENTRY_TRIGGER',timeframe:'5m',
            confirming_metrics:['HTX_FUTURES_TURNOVER','HTX_EXECUTION','HARD_GATES_RECHECK'],
            evidence_snapshot_ids:text(fd.snapshot_id??sp?.snapshot_id)?[text(fd.snapshot_id??sp?.snapshot_id)]:[],
            expires_ts:sp.valid_until_ts,next_recheck_ts:Math.min(sp.valid_until_ts,observed_ts+300000),
            cancel_condition:`scenario_invalidated_at_${sp.invalidation_price}`
          },
        });
      }
    }
  }

  if(bool(structure_interesting)&&bool(useful_observation)) return fail(ANALYTICAL_STATE.OBSERVE,'USEFUL_OBSERVATION_ONLY',{direction:fd.direction});
  return fail(ANALYTICAL_STATE.REJECTED,'ENTRY_REQUIREMENTS_NOT_CLOSED',{direction:fd.direction});
}

export function toTelegramLifecycleContext(route,{base={}}={}){
  const st=route?.state;
  return {
    ...base,
    final_row_exists:[ANALYTICAL_STATE.ENTRY_NOW_ANALYTICAL,ANALYTICAL_STATE.ENTRY_NOW_VALIDATED].includes(st),
    final_score_threshold_pass:[ANALYTICAL_STATE.ENTRY_NOW_ANALYTICAL,ANALYTICAL_STATE.ENTRY_NOW_VALIDATED].includes(st),
    timing_state:[ANALYTICAL_STATE.ENTRY_NOW_ANALYTICAL,ANALYTICAL_STATE.ENTRY_NOW_VALIDATED].includes(st)?'ENTRY_WINDOW':base.timing_state,
    structure_interesting:st===ANALYTICAL_STATE.OBSERVE||st===ANALYTICAL_STATE.WAIT_FOR_TRIGGER||Boolean(base.structure_interesting),
    useful_observation:st===ANALYTICAL_STATE.OBSERVE||st===ANALYTICAL_STATE.WAIT_FOR_TRIGGER||Boolean(base.useful_observation),
    direction_confirmed:Boolean(route?.direction)||Boolean(base.direction_confirmed),
  };
}

export function renderEvidenceDrivenAction({route,ticker,score_0_100,evidence=[]}={}){
  const state=route?.state; const t=text(ticker)?.replace(/-USDT$/i,'');
  if(!t) return {ok:false,status:'TICKER_REQUIRED',message:null};
  const side=String(route?.direction||'').toUpperCase()==='LONG'?'🟢 ЛОНГ':String(route?.direction||'').toUpperCase()==='SHORT'?'🔴 ШОРТ':'⚪️ НАПРАВЛЕНИЕ НЕ ЗАКРЫТО';
  const score=finite(score_0_100)?Math.max(0,Math.min(100,Math.round(score_0_100))):null;
  const lines=[t,side];
  if(state===ANALYTICAL_STATE.ENTRY_NOW_ANALYTICAL||state===ANALYTICAL_STATE.ENTRY_NOW_VALIDATED){
    lines.push(state===ANALYTICAL_STATE.ENTRY_NOW_VALIDATED?'✅ ВХОД ПОДТВЕРЖДЁН ВАЛИДИРОВАННОЙ МОДЕЛЬЮ':'✅ МОЖНО ВХОДИТЬ СЕЙЧАС');
    const c=route.telegram_context||{};
    if(c.entry?.area) lines.push(`Вход: ${c.entry.area}`);
    if(c.entry?.target) lines.push(`Цель: ${c.entry.target}`);
    if(c.entry?.invalidation) lines.push(`Отмена идеи: ${c.entry.invalidation}`);
    if(stamp(route.valid_until_ts)) lines.push(`Действительно до: ${new Date(route.valid_until_ts).toISOString()}`);
  }else if(state===ANALYTICAL_STATE.WAIT_FOR_TRIGGER){
    lines.push('🟡 ЖДЁМ ТОЧНЫЙ ТРИГГЕР');
    const x=route.trigger||{};
    if(text(x.metric)&&text(x.operator)&&finite(x.value)) lines.push(`Триггер: ${x.metric} ${x.operator} ${x.value} ${text(x.unit)||''}`.trim());
    if(stamp(x.expires_ts)) lines.push(`Истекает: ${new Date(x.expires_ts).toISOString()}`);
    if(text(x.cancel_condition)) lines.push(`Отмена ожидания: ${x.cancel_condition}`);
  }else if(state===ANALYTICAL_STATE.OBSERVE) lines.push('⚪️ НАБЛЮДАТЬ');
  else lines.push('⛔️ ИДЕЯ НЕ ГОТОВА');
  for(const r of (Array.isArray(evidence)?evidence:[]).slice(0,5)){
    const metric=text(r?.metric), value=r?.value, interval=text(r?.interval), source=text(r?.source), timestamp=text(r?.timestamp), interpretation=text(r?.interpretation);
    if(!metric||value===undefined||!source||!timestamp||!interpretation) continue;
    lines.push(`• ${metric}: ${value}${interval?` / ${interval}`:''} — ${source}, ${timestamp}. ${interpretation}`);
  }
  if(score!==null) lines.push(`Модельный балл: ${score}/100. Это не статистическая вероятность.`);
  lines.push('Автоматическая торговля выключена.');
  const message=lines.join('\n');
  return {ok:message.length<=4096,status:message.length<=4096?'READY':'MESSAGE_TOO_LONG',message:message.length<=4096?message:null};
}
