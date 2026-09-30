// Presentation only: never computes direction, scores, gates or targets.
const text=v=>v==null?'':String(v).trim();
export function displayScore(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100?`${Math.round(v)} из 100`:'не подтверждена';}
export function displayNumber(v){return typeof v==='number'&&Number.isFinite(v)?String(Number(v.toPrecision(10))).replace('.',','):null;}
export function displayTime(ts){return typeof ts==='number'&&Number.isSafeInteger(ts)&&ts>=1e12?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ts)).replace(',',''):null;}
export function displayWindow(v){return text(v).replace(/^(\d+)m$/,'$1 мин').replace(/^(\d+)h$/,'$1 ч').replace(/^(\d+)d$/,'$1 д');}
export function displayUnit(v){return ({CONTRACTS:'контракты',CONTRACT:'контракты',PERCENT:'%',BASE:'базовый актив'})[text(v).toUpperCase()]||text(v);}
export function displaySnapshotChange(v){
 const value=text(v);if(!value)return null;
 return value
  .replace(/\brate_per_settlement\b/giu,'ставка за расчётный период')
  .replace(/\bpct_long_minus_short_of_total\b/giu,'% перевеса покупателей над продавцами')
  .replace(/\bpercentage_points\b/giu,'процентного пункта')
  .replace(/\bGate Public Futures\b/giu,'Гейт срочный рынок')
  .replace(/\bOKX Spot Public V5\b/giu,'ОКХ спотовый рынок')
  .replace(/\bCONTRACTS?\b/gu,'контракты')
  .replace(/\bPERCENT\b/gu,'%');
}
export function displayCondition(v){return text(v).replace(/\b(?:price|close_price)\b/gi,'цена').replace(/\bmark_price\b/gi,'цена маркировки').replace(/\bvolume\b/gi,'объём').replace(/\boi_contracts\b/gi,'открытый интерес в контрактах');}
export function displayTrigger(t){
 const metric=({price:'цена',close:'цена закрытия',close_price:'цена закрытия',mark_price:'цена маркировки',volume:'объём',oi_contracts:'открытый интерес'})[text(t?.metric).toLowerCase()];
 const n=displayNumber(t?.value),unit=displayUnit(t?.unit),tf=displayWindow(t?.timeframe);
 return metric&&['>=','<=','>','<'].includes(t?.operator)&&n!==null&&unit?`${metric} ${t.operator} ${n} ${unit}${tf?` (${tf})`:''}`:null;
}
export function displayInvalidation(v){if(typeof v==='string')return displayCondition(v);if(v&&typeof v==='object'&&text(v.condition))return displayCondition(v.condition);return null;}
export function displayReadiness(state){return /^ENTRY_NOW_/.test(state)?'подтверждена обязательными проверками':state==='WAIT_FOR_TRIGGER'?'условие входа сформировано, но ещё не выполнено':state==='OBSERVE'?'сильный ранний сценарий, вход ещё не подтверждён':'не подтверждена';}
export function hasInternalTerminology(s){return /\b(?:LONG|SHORT|OI|Funding|Spot flow|Spread|Slippage|Data Quality|Source receipts|hard gates|CONTRACTS|projected|canonical result|receipt|shadow)\b|\b[A-Z]{2,}_[A-Z0-9_]{2,}\b/iu.test(s);}
export function displayReceiptFact(r){
 if(r?.status!=='CLOSED'||r?.fact_contract_status==='NOT_CLOSED'||typeof r.value!=='number'||!Number.isFinite(r.value)||!text(r.unit))return null;
 const metric=text(r.metric).toUpperCase(),venue=text(r.venue||r.source),window=displayWindow(r.window||r.interval);
 const label=/OPEN_INTEREST|OI_/.test(metric)?'Открытый интерес':/FUNDING/.test(metric)?'Ставка финансирования':/RELATIVE/.test(metric)?'Относительная сила':/SPOT/.test(metric)?'Спотовый поток':/FUTURES|CVD/.test(metric)?'Поток срочного рынка':null;
 if(!label)return null;
 const rawUnit=text(r.unit).toUpperCase(),unit=displayUnit(rawUnit);
 const value=['%','PERCENT','PCT'].includes(rawUnit)?`${r.value>0?'+':''}${displayNumber(r.value)}%`:`${displayNumber(r.value)} ${unit}`;
 return `${label}${venue?' '+venue:''}${window?' ('+window+')':''}: ${value}.`;
}
export function displayMarketFacts(c){
 const facts=[...new Set((Array.isArray(c?.source_receipts)?c.source_receipts:[]).map(displayReceiptFact).filter(Boolean))];
 for(const key of ['1h','4h']){
  const r=c?.metadata?.oi_window_receipts?.[key];if(r?.status!=='CLOSED'||typeof r.change_pct!=='number'||!Number.isFinite(r.change_pct))continue;
  facts.push(`Открытый интерес HTX: ${r.change_pct>0?'+':''}${displayNumber(r.change_pct)}% за ${displayWindow(key)}; ${displayUnit(r.unit)}, окно ${displayTime(r.window_start_ts)}–${displayTime(r.window_end_ts)} МСК.`);
 }
 return facts;
}
export function displayFutureLiquidations(liq,{compact=false}={}){
 const lines=[];
 for(const [rows,label] of [[liq?.above,'Сильные ликвидации выше'],[liq?.below,'Сильные ликвидации ниже']]){
  const parts=(Array.isArray(rows)?rows:[]).slice(0,compact?2:6).map(z=>{
   const px=displayNumber(z.price),d=typeof z.distance_pct==='number'?displayNumber(Number(z.distance_pct.toFixed(2))):null,n=displayNumber(z.notional);
   return `${px} ${z.price_quote||'USD'} (${d===null?'расстояние неизвестно':`${z.distance_pct>0?'+':''}${d}%${z.distance_reference_basis==='ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE'?' к цене источника':''}`}) — ${z.strength_label_ru||'размер неизвестен'}; ${n!==null?`${z.estimated?'оценка':'позиция'} ${n} ${z.notional_unit}`:'объём неизвестен'}${compact?'':`; ${z.source}${z.conditional_cross?'; зависит от других позиций счёта':''}`}`;
  });lines.push(`${label}: ${parts.length?parts.join('; '):'уровни будущих ликвидаций не получены'}.`);
 }
 if(!compact&&liq?.provider_zone_count){
  lines.push('Размер по объёму: небольшая <10 тыс., средняя 10–100 тыс., крупная 100 тыс.–1 млн, огромная ≥1 млн; шкала отчёта.');
  lines.push(`Покрытие: только доступные площадки и диапазон источника; время снимка ${displayTime(Math.min(...[...liq.above,...liq.below].map(z=>z.source_ts)))} МСК.${liq.omitted_zone_count?` Ещё ${liq.omitted_zone_count} уровней сохранено в полной карте.`:''}`);
 }
 return lines;
}
export function displayLegacyLiquidations(liq){
 if(liq?.future_only===true)return displayFutureLiquidations(liq);
 const lines=[];
 for(const [rows,label] of [[liq?.above,'Сильные ликвидации выше'],[liq?.below,'Сильные ликвидации ниже']]){
  const parts=(Array.isArray(rows)?rows:[]).filter(z=>liq?.future_levels_required!==true||z?.kind==='PROJECTED').slice(0,4).map(z=>{
   const price=displayNumber(z?.price??z?.level_price);if(price===null)return null;
   const d=z?.distance_pct,strength=text(z?.strength_label_ru)||'сила не определена';
   const amount=typeof z?.exact_notional_usdt==='number'&&Number.isFinite(z.exact_notional_usdt)&&z.exact_notional_usdt>0?`; ${liq?.future_levels_required===true?'объём источника':'точная сумма'} ${displayNumber(z.exact_notional_usdt)} ${liq?.future_levels_required===true?text(z?.notional_quote)||'USDT':'USDT'}`:'';
   const kind=z?.kind==='CALCULATED'?'; расчётная вероятная зона':z?.raw?.price_semantics==='PROVIDER_MODEL_PRICE_BIN'?'; модельная оценка источника':'';
   const source=liq?.future_levels_required===true&&text(z?.source)?`; источник ${text(z.source)}`:'';
   return `${price} ${liq?.future_levels_required===true?text(z?.price_quote)||'USDT':'USDT'}${typeof d==='number'&&Number.isFinite(d)?` (${d>0?'+':''}${displayNumber(Number(d.toFixed(1)))}%)`:''} — ${strength}${amount}${kind}${source}`;
  }).filter(Boolean);if(parts.length)lines.push(`${label}: ${parts.join(', ')}.`);else if(liq?.future_levels_required===true)lines.push(`${label}: уровни будущих ликвидаций не получены.`);
 }
 return lines.length?lines:['Ликвидации: технический сбой получения или расчёта зон.'];
}

export function displayCoinLobsterHint(hint){
 if(!hint?.data_available)return [];
 const age=Math.ceil(hint.source_age_ms/60000),time=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'}).format(new Date(hint.source_ts));
 return[`CoinLobster (${time} МСК${age>5?`, задержка ${age} мин`:''}): крупнейшая модельная зона в пределах 15% ${hint.direction==='above'?'выше':'ниже'} цены; уровень и объём недоступны в бесплатном ответе.`];
}
