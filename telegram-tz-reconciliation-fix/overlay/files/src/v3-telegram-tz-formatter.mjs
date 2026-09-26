export const V3_TELEGRAM_TZ_FORMATTER_VERSION='v3-telegram-tz-formatter-v1-20260926';

const RU_REASON=Object.freeze({
  USEFUL_LIVE_OBSERVATION:'появилось новое существенное наблюдение по текущему рыночному циклу',
  DATA_UNUSABLE:'данные для идеи перестали быть достаточно надёжными',
  HARD_VETO:'обязательный защитный фильтр запретил продолжение идеи',
  STRUCTURE_BROKEN:'рыночная структура идеи нарушена',
  DIRECTION_DESTROYED:'направление идеи больше не подтверждается',
  EDGE_SPENT:'основная часть ожидаемого движения уже исчерпана',
  INVALIDATED:'условия идеи больше не выполняются',
  DIRECTION_CLOSED_ENTRY_WINDOW_NOT_READY:'направление подтверждено, но точное условие входа ещё не закрыто',
  STRICT_FINAL_CHAIN_CLOSED:'все обязательные проверки входа закрыты',
});

function text(v){return v==null?'':String(v).trim();}
function upper(v){return text(v).toUpperCase();}
function finite(v){if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function parse(v,fb=null){try{return typeof v==='string'?JSON.parse(v):(v??fb);}catch{return fb;}}
function clamp(v,lo=0,hi=100){const n=finite(v);return n==null?null:Math.max(lo,Math.min(hi,n));}
function ticker(v){return text(v).replace(/-USDT$/i,'');}
function fmtScore(v){const n=clamp(v);return n==null?'не подтверждена':`${Math.round(n)} из 100`;}
function fmtPct(v,d=2){const n=finite(v);if(n==null)return null;const x=Math.abs(n).toFixed(d).replace('.',',');return `${n>0?'+':n<0?'-':''}${x}%`;}
function fmtNum(v,d=2){const n=finite(v);if(n==null)return null;return Number(n.toFixed(d)).toString().replace('.',',');}
function fmtPrice(v){const n=finite(v);if(n==null||n<=0)return null;return Number(n.toPrecision(10)).toString().replace('.',',');}
function fmtMsk(ts){const n=finite(ts);if(n==null||n<=0)return null;return new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(n)).replace(',','');}
function safeReason(v){const key=upper(v);return RU_REASON[key]||'';}
function firstFinite(...xs){for(const x of xs){const n=finite(x);if(n!=null)return n;}return null;}
function bool(v){return v===true||v===1||v==='1';}

function directionRu(v){const d=upper(v);return d==='LONG'?'🟢 ПОКУПКА':d==='SHORT'?'🔴 ПРОДАЖА':'⚪️ НАПРАВЛЕНИЕ ЕЩЁ НЕ ЗАКРЫТО';}

function scoreLines({final,shadow,early,status}={}){
  const dir=upper(final?.direction||shadow?.direction_hint);
  const contextLo=finite(final?.score_lower_bound), contextHi=finite(final?.score_upper_bound);
  const shadowScore=dir==='SHORT'?finite(shadow?.dc_short):dir==='LONG'?finite(shadow?.dc_long):Math.max(finite(shadow?.dc_long)??-Infinity,finite(shadow?.dc_short)??-Infinity);
  const overall=contextLo!=null?(contextHi!=null&&Math.abs(contextHi-contextLo)>1e-9?`${Math.round(contextLo)}–${Math.round(contextHi)} из 100`:`${Math.round(contextLo)} из 100`):fmtScore(shadowScore);
  const interest=fmtScore(early?.early_detection_quality_0_100);
  let readiness='не подтверждена';
  if(upper(status)==='ENTRY')readiness='подтверждена обязательными проверками';
  else if(upper(status)==='WAIT')readiness='условие входа сформировано, но ещё не выполнено';
  return [`Общая оценка: ${overall}`,`Монета интересна: ${interest}`,`Готовность ко входу: ${readiness}`];
}

function marketFacts(shadow){
  const f=parse(shadow?.evidence_flags_json,{})||{};const out=[];
  const funding=finite(f.funding_pct), interval=finite(f.funding_interval_hours);
  if(funding!=null)out.push(`Ставка финансирования: ${fmtPct(funding,3)}${interval!=null?` за ${fmtNum(interval,0)} ч`:''}.`);
  const oi1=finite(f.oi_1h_change_pct),oi4=finite(f.oi_4h_change_pct);
  if(oi1!=null||oi4!=null)out.push(`Открытый интерес: ${oi1!=null?`${fmtPct(oi1)} за 1 ч`:''}${oi1!=null&&oi4!=null?', ':''}${oi4!=null?`${fmtPct(oi4)} за 4 ч`:''}.`);
  const spot=finite(f.spot_flow_delta_pct);if(spot!=null)out.push(`Спотовый поток: ${fmtPct(spot)}.`);
  const fut1=finite(f.futures_flow_1h_delta_pct);if(fut1!=null)out.push(`Поток срочного рынка за 1 ч: ${fmtPct(fut1)}.`);
  const p1=finite(f.price_1h_pct),p4=finite(f.price_4h_pct),p24=finite(f.price_24h_pct);
  if(p1!=null||p4!=null||p24!=null)out.push(`Цена: ${p1!=null?`${fmtPct(p1)} за 1 ч`:''}${p1!=null&&p4!=null?', ':''}${p4!=null?`${fmtPct(p4)} за 4 ч`:''}${(p1!=null||p4!=null)&&p24!=null?', ':''}${p24!=null?`${fmtPct(p24)} за 24 ч`:''}.`);
  return out;
}

function relativeStrength(feature,direction){
  const rows=parse(feature?.evidence_json,[])||[];const dir=upper(direction);
  const row=rows.find(x=>upper(x?.domain)==='RELATIVE_STRENGTH'&&(upper(x?.side)===dir||upper(x?.side)==='BOTH'))||rows.find(x=>upper(x?.domain)==='RELATIVE_STRENGTH');
  if(!row)return null;
  const b1=finite(row.btc_1h_pct_points),e1=finite(row.eth_1h_pct_points),b4=finite(row.btc_4h_pct_points),e4=finite(row.eth_4h_pct_points);
  if([b1,e1,b4,e4].every(x=>x==null))return null;
  const a=[];if(b1!=null||e1!=null)a.push(`за 1 ч к BTC/ETH: ${b1!=null?fmtPct(b1):'нет данных'} / ${e1!=null?fmtPct(e1):'нет данных'}`);
  if(b4!=null||e4!=null)a.push(`за 4 ч: ${b4!=null?fmtPct(b4):'нет данных'} / ${e4!=null?fmtPct(e4):'нет данных'}`);
  return `Относительная сила ${a.join('; ')}.`;
}

function candleFact(opportunity){
  const ev=parse(opportunity?.event_json,{})||{};const md=ev.minute_decomposition||{};
  if(md.classification_allowed!==true){
    if(ev.event_type)return 'Свечной разбор: событие найдено, но полное разложение по закрытым 1/3/5-минутным свечам ещё не подтверждено.';
    return null;
  }
  const cls=ev.early_anomaly_classification||{};
  const candidates=[
    ['accumulation','возможное накопление и поглощение продаж'],
    ['distribution','возможное распределение'],
    ['two_sided_transfer','двусторонний перенос крупного объёма'],
    ['liquidation_futures_noise','ликвидационный или фьючерсный шум'],
  ].map(([k,label])=>({k,label,score:finite(cls?.[k]?.evidence_score)})).filter(x=>x.score!=null).sort((a,b)=>b.score-a.score);
  const top=candidates[0];
  const bars1=finite(md.one_minute_bars),bars3=finite(md.three_minute_bars),bars5=finite(md.five_minute_bars);
  const ratio=finite(ev.volume_ratio_median);
  const pieces=[];
  if(bars1!=null&&bars3!=null&&bars5!=null)pieces.push(`${fmtNum(bars1,0)}×1м, ${fmtNum(bars3,0)}×3м и ${fmtNum(bars5,0)}×5м закрыты`);
  if(ratio!=null)pieces.push(`объём события ${fmtNum(ratio,1)}× медианы`);
  if(top)pieces.push(`сильнее всего похоже на ${top.label} (${Math.round(top.score)}/100 по внутреннему признаку)`);
  return pieces.length?`Свечной разбор: ${pieces.join('; ')}.`:null;
}

function triggerContext({status,campaign,final,lifecycle,now}={}){
  const st=upper(status);const cjson=parse(final?.context_json,{})||{};
  const entry=cjson.entry||{};
  const triggerPrice=firstFinite(cjson?.trigger?.value,campaign?.entry_trigger_price);
  const invalidation=text(cjson?.trigger?.cancel_condition)||text(entry?.invalidation)||null;
  const expires=firstFinite(cjson?.trigger?.expires_ts,final?.context_valid_until,lifecycle?.valid_until_ts);
  const next=firstFinite(cjson?.trigger?.next_recheck_ts);
  const area=text(entry?.area);
  const target=text(entry?.target);
  const baseLo=finite(campaign?.base_low),baseHi=finite(campaign?.base_high);
  const freshCampaign=finite(campaign?.last_observed_ts)!=null&&now-finite(campaign.last_observed_ts)<=30*60_000&&now>=finite(campaign.last_observed_ts);
  const hasClosedWait=st==='WAIT'&&triggerPrice!=null&&invalidation&&expires!=null&&expires>=now;
  return {triggerPrice,invalidation,expires,next,area,target,baseLo,baseHi,freshCampaign,hasClosedWait};
}

function liqLines(liquidation,shadow){
  const out=[];const l=liquidation||{};const derived=parse(l.derived_json,{})||{};const realized=parse(l.realized_json,{})||{};
  const current24=finite(parse(shadow?.evidence_flags_json,{})?.price_24h_pct);const pump=current24!=null&&current24>=20;
  const one=(z)=>{
    if(z==null)return null;if(typeof z==='number')return `${fmtPrice(z)} USDT`;
    const px=firstFinite(z.level_price,z.price,z.level);if(px==null)return null;const dist=finite(z.distance_pct);return `${fmtPrice(px)} USDT${dist!=null?` (${dist>0?'+':''}${fmtNum(dist,1)}%)`:''}`;
  };
  const above=[derived.nearest_major_cluster_above,derived.largest_cluster_above,derived.strongest_cluster_above].map(one).filter(Boolean);
  const below=[derived.nearest_major_cluster_below,derived.largest_cluster_below,derived.strongest_cluster_below].map(one).filter(Boolean);
  if(above.length)out.push(`Сильные ликвидации выше: ${[...new Set(above)].slice(0,3).join(', ')}.`);
  if(below.length)out.push(`Сильные ликвидации ниже: ${[...new Set(below)].slice(0,3).join(', ')}.`);
  const htx=realized?.htx||{};const ln=finite(htx.long_notional_usdt),sn=finite(htx.short_notional_usdt),events=finite(htx.total_events);
  if(events!=null&&events>0)out.push(`Фактические ликвидации HTX: покупателей ${ln!=null?fmtNum(ln,0):'нет данных'} USDT, продавцов ${sn!=null?fmtNum(sn,0):'нет данных'} USDT.`);
  if(pump&&(!above.length||!below.length))out.push('Для памповой монеты сильные ликвидационные зоны с обеих сторон пока не подтверждены — уровни не выдумываются.');
  else if(!out.length)out.push('Ликвидации: подтверждённых сильных зон для текущей идеи пока нет.');
  return out;
}

function statusTitle(status,waitClosed){
  const st=upper(status);
  if(st==='ENTRY')return '✅ МОЖНО ВХОДИТЬ СЕЙЧАС';
  if(st==='WAIT'&&waitClosed)return '🟡 БЛИЗКО К ТОЧКЕ ВХОДА — ЖДЁМ УСЛОВИЕ';
  if(st==='WAIT')return '⚪️ НАБЛЮДЕНИЕ — ТОЧНЫЙ УРОВЕНЬ ВХОДА ЕЩЁ НЕ ПОДТВЕРЖДЁН';
  if(st==='OBSERVE')return '⚪️ РАННЕЕ НАБЛЮДЕНИЕ';
  if(st==='IDEA_REMOVED')return '⛔️ ИДЕЯ СНЯТА';
  if(st==='HOLD')return '🟡 УДЕРЖИВАТЬ';
  if(st==='EXIT')return '🔴 ВЫХОД';
  return null;
}

function forbidden(message){
  return /USEFUL_LIVE_OBSERVATION|DIRECTION_CLOSED_ENTRY_WINDOW_NOT_READY|STRICT_FINAL_CHAIN_CLOSED|ENTRY_NOW_|WAIT_FOR_TRIGGER|OBSERVE_DATA_|\b(?:OI|Funding|Spot flow|Hard Gate|Data Quality|receipt|shadow)\b|автоматическая торговля|не статистическая вероятность|не вероятность/iu.test(message);
}

export function renderTzCompliantLifecycleMessage(input={}){
  const now=finite(input.now)??Date.now();const lifecycle=input.lifecycle||{};const final=input.final||{};const shadow=input.shadow||{};const early=input.early||{};const feature=input.feature||{};const opp=input.opportunity||{};const campaign=input.campaign||{};const liquidation=input.liquidation||{};
  const status=upper(input.status||lifecycle.status);const symbol=ticker(input.ticker||lifecycle.contract||input.contract);const dir=upper(input.direction||lifecycle.direction||final.direction||shadow.direction_hint);
  if(!symbol)return{ok:false,status:'TICKER_REQUIRED',message:null};
  const trigger=triggerContext({status,campaign,final,lifecycle,now});
  if(status==='WAIT'&&!trigger.hasClosedWait)return{ok:false,status:'WAIT_TRIGGER_NOT_CLOSED',message:null,retryable:true};
  if(status==='ENTRY'){
    const c=parse(final.context_json,{})||{};const entry=c.entry||{};
    if(!text(entry.area)||!text(entry.target)||!text(entry.invalidation))return{ok:false,status:'ENTRY_CONTEXT_NOT_CLOSED',message:null,retryable:true};
  }
  const title=statusTitle(status,trigger.hasClosedWait);if(!title)return{ok:false,status:'STATUS_NOT_RENDERABLE',message:null};
  const lines=[symbol,directionRu(dir),title,'',...scoreLines({final,shadow,early,status})];
  const reason=safeReason(lifecycle.reason);if(reason)lines.push(`Почему сейчас: ${reason}.`);
  const facts=[];const rel=relativeStrength(feature,dir);if(rel)facts.push(rel);facts.push(...marketFacts(shadow));const candle=candleFact(opp);if(candle)facts.unshift(candle);
  for(const f of facts.slice(0,status==='WAIT'?1:4))lines.push(`• ${f}`);
  if(status==='OBSERVE'){
    if(trigger.freshCampaign&&trigger.baseLo!=null&&trigger.baseHi!=null)lines.push(`Рабочая зона наблюдения: ${fmtPrice(trigger.baseLo)}–${fmtPrice(trigger.baseHi)} USDT. Это ещё не точка входа.`);
    if(trigger.triggerPrice!=null)lines.push(`Контрольный уровень приближения: ${fmtPrice(trigger.triggerPrice)} USDT. После его достижения система заново проверит все обязательные условия.`);
    else lines.push('Точный уровень входа пока не подтверждён; система продолжает наблюдение.');
  }
  if(status==='WAIT'){
    lines.push(`Уровень приближения к входу: ${fmtPrice(trigger.triggerPrice)} USDT.`);
    lines.push('После достижения уровня система заново проверит рынок и защитные фильтры; только затем возможна команда «МОЖНО ВХОДИТЬ».');
    lines.push(`Отмена ожидания: ${trigger.invalidation}.`);
    lines.push(`Условие действительно до: ${fmtMsk(trigger.expires)} МСК.`);
    if(trigger.next!=null)lines.push(`Следующая автоматическая проверка: ${fmtMsk(trigger.next)} МСК.`);
  }
  if(status==='ENTRY'){
    const c=parse(final.context_json,{})||{};const e=c.entry||{};lines.push(`Вход: ${text(e.area)}.`);lines.push(`Выход: ${text(e.target)}.`);lines.push(`Отмена идеи: ${text(e.invalidation)}.`);
    const funding=c.funding||{};if(finite(funding.rate_pct)!=null)lines.push(`Ставка финансирования: ${fmtPct(funding.rate_pct,3)}${finite(funding.interval_hours)!=null?` за ${fmtNum(funding.interval_hours,0)} ч`:''}.`);
    if(firstFinite(final.context_valid_until,lifecycle.valid_until_ts)!=null)lines.push(`Условие действительно до: ${fmtMsk(firstFinite(final.context_valid_until,lifecycle.valid_until_ts))} МСК.`);
  }
  if(status==='IDEA_REMOVED')lines.push(`Причина: ${safeReason(lifecycle.reason)||'условия идеи больше не выполняются'}.`);
  if(status==='WAIT'){const ll=liqLines(liquidation,shadow);if(ll.some(x=>/сильные ликвидации/i.test(x)))lines.push(...ll.slice(0,2));}
  else lines.push(...liqLines(liquidation,shadow));
  const snapshot=firstFinite(lifecycle.observation_ts,shadow.observed_ts,feature.observed_ts,opp.observed_ts);if(snapshot!=null)lines.push(`Снимок рынка: ${fmtMsk(snapshot)} МСК.`);
  let message=lines.filter(Boolean).join('\n');
  const max=status==='ENTRY'?1100:status==='WAIT'?850:1200;
  if(message.length>max)return{ok:false,status:'MESSAGE_TOO_LONG',message:null,length:message.length,max_length:max};
  if(forbidden(message))return{ok:false,status:'FORBIDDEN_INTERNAL_TERMINOLOGY',message:null};
  return{ok:true,status:'READY',message,length:message.length,max_length:max,formatter:V3_TELEGRAM_TZ_FORMATTER_VERSION};
}

export default{V3_TELEGRAM_TZ_FORMATTER_VERSION,renderTzCompliantLifecycleMessage};
