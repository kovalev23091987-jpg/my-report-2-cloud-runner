// Presentation only: never computes direction, scores, gates or targets.
const text=v=>v==null?'':String(v).trim();
export const LIQUIDATION_DISPLAY_MIN_SEPARATION_PCT=5;
export const LIQUIDATION_DISPLAY_MAX_PER_SIDE=4;
export const LIQUIDATION_PRESENTATION_CUTOVER=Date.parse('2026-10-07T21:54:00Z');
export const RELEVANT_LIQUIDATION_PRESENTATION='OWNER_RELEVANT_LEVELS_20261008';
// An intentionally generous display bound, not a forecast, trade threshold or
// calibrated horizon. Raw positions, source clocks and decision inputs remain intact.
export const LIQUIDATION_PRESENTATION_MAX_DISTANCE_PCT=100;
export function liquidationPresentationPolicy(observed_ts){return Number.isSafeInteger(observed_ts)&&observed_ts>=LIQUIDATION_PRESENTATION_CUTOVER?RELEVANT_LIQUIDATION_PRESENTATION:'ORIGINAL';}
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const displayTier=n=>n===null||n<=0?null:n>=1000000?'огромная':n>=100000?'крупная':n>=10000?'средняя':'небольшая';
export function displayScore(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100?`${Math.round(v)} из 100`:'не подтверждена';}
export function displayNumber(v){return typeof v==='number'&&Number.isFinite(v)?String(Number(v.toPrecision(10))).replace('.',','):null;}
export function displayTime(ts){return typeof ts==='number'&&Number.isSafeInteger(ts)&&ts>=1e12?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ts)).replace(',',''):null;}
export function displayWindow(v){return text(v).replace(/^(\d+)m$/,'$1 мин').replace(/^(\d+)h$/,'$1 ч').replace(/^(\d+)d$/,'$1 д');}
export function displayUnit(v){return ({CONTRACTS:'контракты',CONTRACT:'контракты',PERCENT:'%',BASE:'базовый актив'})[text(v).toUpperCase()]||text(v);}
export function displaySnapshotChange(v){
 const value=text(v);if(!value)return null;
 return value
  .replace(/\baverage_percentage_points\b/giu,'среднего процентного пункта')
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
// Presentation only. Never change the original analysis map, weights or source clocks.
// Farthest-first, bounded diameter: 100/104/108 must not chain into one 8% band.
export function mergeLiquidationDisplayZones(rows,side){
 const candidates=(Array.isArray(rows)?rows:[]).filter(z=>z?.side===side&&finite(z?.price)>0)
  .map(z=>({...z})).sort((a,b)=>side==='ABOVE'?b.price-a.price:a.price-b.price);
 const clusters=[];
 for(const row of candidates){
  const quote=text(row.price_quote),basis=text(row.distance_reference_basis),distance=finite(row.distance_pct);
  const comparable=['USD','USDC','USDT'].includes(quote)&&basis&&basis!=='UNKNOWN'&&distance!==null;
  const ts=finite(row.source_ts),ref=finite(row.distance_reference_price??row.native_reference_price),reportedState=text(row.display_source_state_id);
  // Unknown source age is a limitation, never a shared state identifier.
  // A receipt-only state may be compared only inside the same authenticated
  // provider response cohort, preserving its original receipt clock.
  const state=row.source_clock_closed===false?(reportedState||null):Number.isSafeInteger(ts)&&ts>=1e12?`SOURCE:${ts}`:null;
  const reference=ref;
  const referenceClosed=basis!=='ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE'||reference>0;
  const methodClosed=row.estimated!==true||Boolean(text(row.price_semantics));
  const method=[text(row.price_semantics),text(row.model_version),text(row.sdk_version)].join(':');
  const key=[quote,basis,text(row.native_symbol),state,reference===null?'':Number(reference.toPrecision(12)),method,text(row.notional_unit),text(row.margin_mode),row.conditional_cross===true||row.conditional_on_other_positions===true?'PORTFOLIO_CONDITIONAL':'SINGLE_POSITION'].join('|');
  let cluster=comparable&&state&&referenceClosed&&methodClosed?clusters.find(c=>c.key===key&&(Math.max(c.max_price,row.price)/Math.min(c.min_price,row.price)-1)*100<=LIQUIDATION_DISPLAY_MIN_SEPARATION_PCT+1e-10):null;
  if(!cluster){cluster={key:comparable&&state&&referenceClosed&&methodClosed?key:null,rows:[],min_price:row.price,max_price:row.price};clusters.push(cluster);}
  cluster.rows.push(row);cluster.min_price=Math.min(cluster.min_price,row.price);cluster.max_price=Math.max(cluster.max_price,row.price);
 }
 return clusters.map(c=>{
  const primary=c.rows[0],sources=[...new Set(c.rows.map(z=>text(z.source)).filter(Boolean))];
  // Amount belongs to the displayed original level; overlapping samples are never summed.
  return {...primary,source:sources.join(' + '),display_cluster:true,display_component_count:c.rows.length,
   display_price_min:c.min_price,display_price_max:c.max_price,display_distance_min:primary.distance_pct,display_distance_max:primary.distance_pct,
   display_minimum_separation_pct:LIQUIDATION_DISPLAY_MIN_SEPARATION_PCT,display_representative:'FARTHEST_ORIGINAL_LEVEL',
   display_contains_estimates:c.rows.some(z=>z.estimated===true),notional_summed_across_providers:false,
   display_components:c.rows.map(z=>({...z}))};
 });
}
export function auditLiquidationPresentation(liq,{policy='ORIGINAL'}={}){
 const all=Array.isArray(liq?.display_source_zones)&&liq.display_source_zones.length?liq.display_source_zones:Array.isArray(liq?.all_zones)&&liq.all_zones.length?liq.all_zones:[...(Array.isArray(liq?.above)?liq.above:[]),...(Array.isArray(liq?.below)?liq.below:[])];
 const rows=all.map(z=>{
  const d=finite(z?.distance_pct),ref=finite(z?.distance_reference_price??z?.native_reference_price??(z?.distance_reference_basis==='ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE'?null:liq?.current_price)),px=finite(z?.price),recomputed=ref>0&&px>0?(px/ref-1)*100:null;
  const status=policy!==RELEVANT_LIQUIDATION_PRESENTATION?'ORIGINAL':d===null?'DISTANCE_NOT_CLOSED':z?.distance_reference_basis==='ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE'&&recomputed===null?'SOURCE_REFERENCE_NOT_CLOSED':recomputed!==null&&Math.abs(recomputed-d)>.01?'DISTANCE_SOURCE_REFERENCE_MISMATCH':Math.abs(d)>LIQUIDATION_PRESENTATION_MAX_DISTANCE_PCT?'OUTSIDE_PRESENTATION_DISTANCE_BOUND':'DISPLAY_ELIGIBLE';
  return {zone:z,status,recomputed_distance_pct:recomputed};
 });
 return {policy,maximum_distance_pct:policy===RELEVANT_LIQUIDATION_PRESENTATION?LIQUIDATION_PRESENTATION_MAX_DISTANCE_PCT:null,raw_level_count:rows.length,omitted_level_count:rows.filter(r=>!['ORIGINAL','DISPLAY_ELIGIBLE'].includes(r.status)).length,rows,analysis_recomputed:false,source_clocks_refreshed:false};
}
export function selectLiquidationDisplayZones(liq,side,{limit=LIQUIDATION_DISPLAY_MAX_PER_SIDE,policy='ORIGINAL'}={}){
 const fallback=side==='ABOVE'?liq?.above:liq?.below,all=Array.isArray(liq?.display_source_zones)&&liq.display_source_zones.length?liq.display_source_zones:Array.isArray(liq?.all_zones)&&liq.all_zones.length?liq.all_zones:fallback;
 const eligible=policy===RELEVANT_LIQUIDATION_PRESENTATION?auditLiquidationPresentation({...liq,display_source_zones:all},{policy}).rows.filter(r=>r.status==='DISPLAY_ELIGIBLE').map(r=>r.zone):all;
 return mergeLiquidationDisplayZones(eligible,side).sort((a,b)=>(finite(b.notional)??-1)-(finite(a.notional)??-1)||Math.abs(finite(a.distance_pct)??Infinity)-Math.abs(finite(b.distance_pct)??Infinity)).slice(0,limit).sort((a,b)=>Math.abs(finite(a.display_distance_min)??finite(a.distance_pct)??Infinity)-Math.abs(finite(b.display_distance_min)??finite(b.distance_pct)??Infinity));
}
function displayPriceRange(z){return displayNumber(z?.price);}
function displayDistanceRange(z){const d=finite(z?.distance_pct);return d===null?null:`${d>0?'+':d<0?'−':''}${displayNumber(Math.abs(Number(d.toFixed(2))))}%`;}
export function displayFutureLiquidations(liq,{compact=false,policy='ORIGINAL'}={}){
 const lines=[];
 const current=policy===RELEVANT_LIQUIDATION_PRESENTATION;
 for(const [side,label] of [['ABOVE',current?'Ликвидационные уровни выше':'Сильные ликвидации выше'],['BELOW',current?'Ликвидационные уровни ниже':'Сильные ликвидации ниже']]){
  const available=selectLiquidationDisplayZones(liq,side,{policy}),shown=compact?available.slice(0,2):available;
  const parts=shown.filter(Boolean).map(z=>{
   const px=displayPriceRange(z),d=displayDistanceRange(z),n=displayNumber(z.notional);
   return `${z.estimated?(compact?'≈':'расчётный уровень ≈'):/NATIVE.*BUCKET_CENTER/.test(z.price_semantics||'')?'≈':''}${px} ${z.price_quote||'USD'} (${d===null?'расстояние неизвестно':`${d}${z.distance_reference_basis==='ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE'?' к цене источника':''}`}) — ${z.strength_label_ru||'размер неизвестен'}; ${n!==null?`${z.amount_semantics==='REPORTED_OPEN_POSITION_NOTIONAL'&&z.estimated?'открытые позиции':z.estimated?'оценка':'позиция'} ${n} ${z.notional_unit}`:'объём неизвестен'}${!compact&&z.display_component_count>1?`; объединено ${z.display_component_count} близких уровней, показан дальний${z.display_contains_estimates?'; есть расчётные уровни':''}`:''}${compact?'':`; ${z.source}${z.conditional_cross?'; зависит от других позиций счёта':''}`}`;
  });lines.push(`${label}: ${parts.length?parts.join('; '):current?'подходящие уровни не подтверждены':'уровни будущих ликвидаций не получены'}.`);
 }
 if(compact&&[...selectLiquidationDisplayZones(liq,'ABOVE',{policy}),...selectLiquidationDisplayZones(liq,'BELOW',{policy})].some(z=>z.estimated||z.display_contains_estimates))lines.push('≈ — расчётный уровень.');
 const sample=(liq?.source_receipts||[]).find(r=>r.coverage?.kind==='TRACKED_ACCOUNT_SAMPLE_ONLY')?.coverage;
 if(sample)lines.push(`Hyperliquid: выборка до ${sample.account_population_limit} аккаунтов${compact?'':`; проверено ${sample.provider_coverage?.scanned??'не указано'}; без цены ликвидации ${sample.provider_totals?.without_liq_px??'не указано'} позиций`}.`);
 if(!compact&&liq?.provider_zone_count){
  lines.push('Размер по объёму: небольшая <10 тыс., средняя 10–100 тыс., крупная 100 тыс.–1 млн, огромная ≥1 млн; шкала отчёта.');
  lines.push(`Покрытие: только доступные площадки и диапазон источника; время снимка ${displayTime(Math.min(...[...liq.above,...liq.below].map(z=>z.source_ts)))} МСК.`);
 }
 return lines;
}
// Owner's brief Telegram view. Exact prices, quotes, amounts, source clocks and
// the full manual view are untouched; use the existing admitted-zone selection.
export function displayBriefTelegramLiquidations(liq,formatPrice,{policy='ORIGINAL'}={}){
 const lines=[],used=[];
 const current=policy===RELEVANT_LIQUIDATION_PRESENTATION;
 for(const [side,label] of [['ABOVE',current?'Ликвидационные уровни выше':'Сильные ликвидации выше'],['BELOW',current?'Ликвидационные уровни ниже':'Сильные ликвидации ниже']]){
  const rows=selectLiquidationDisplayZones(liq,side,{policy}).filter(z=>['NATIVE_FUTURE_LEVEL','PROVIDER_ESTIMATE','PROJECTED'].includes(z.kind)).slice(0,2);
  const parts=rows.map(z=>{
   used.push(z);
   const estimated=z.estimated===true||z.display_contains_estimates===true||z.kind!=='NATIVE_FUTURE_LEVEL'||/BUCKET_CENTER|MODEL_PRICE_BIN|SDK_ESTIMATE/.test(z.price_semantics||'');
   const d=finite(z.distance_pct),rounded=d===null?null:Math.round(Math.abs(d));
   const distance=d===null?'':` (${d>0?'+':d<0?'−':''}${rounded===0&&d!==0?'<1':rounded}%)`;
   const account=current&&!estimated&&(/ACCOUNT_LIQUIDATION_PRICE/.test(z.price_semantics||'')||z.amount_semantics==='REPORTED_OPEN_POSITION_NOTIONAL'||/ACCOUNT_SAMPLE/.test(z.coverage||''));
   const kind=estimated?'расчётный':account?(z.conditional_cross||z.conditional_on_other_positions?'порог счёта':'порог позиции'):current?'уровень источника':'фактический';
   return `${formatPrice(z.price,{zone:true})}${distance} — ${z.strength_label_ru||'размер неизвестен'}${account?' позиция':''} (${kind})`;
  });
  lines.push(`${label}: ${parts.length?parts.join('; '):current?'подходящие уровни не подтверждены':'уровни не получены'}.`);
 }
 if(used.length){
  const sources=[...new Set(used.map(z=>text(z.source).replace(/ official(?: SDK)?/i,'')).filter(Boolean))];
  lines.push(`Уровни ${sources.join(', ')||'других площадок'}; ограниченная выборка${used.some(z=>z.distance_reference_basis==='ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE')?'; проценты от цены источника':''}.`);
  if(used.some(z=>z.conditional_cross||z.conditional_on_other_positions))lines.push('Зависят от других позиций счёта.');
  if(used.some(z=>z.source_clock_closed===false))lines.push('Время исходного состояния неизвестно.');
 }
 return lines;
}
export function displayLegacyLiquidations(liq,{policy='ORIGINAL'}={}){
 if(liq?.future_only===true)return displayFutureLiquidations(liq,{policy});
 const lines=[];
 for(const [rows,label] of [[liq?.above,'Сильные ликвидации выше'],[liq?.below,'Сильные ликвидации ниже']]){
  const parts=(Array.isArray(rows)?rows:[]).filter(z=>liq?.future_levels_required!==true||['NATIVE_FUTURE_LEVEL','PROVIDER_ESTIMATE','PROJECTED'].includes(z?.kind)).slice(0,4).map(z=>{
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
