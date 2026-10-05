// Presentation only: never computes direction, scores, gates or targets.
const text=v=>v==null?'':String(v).trim();
export const LIQUIDATION_DISPLAY_MIN_SEPARATION_PCT=3;
export const LIQUIDATION_DISPLAY_MAX_PER_SIDE=4;
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
function clusterDisplayZones(rows,side,{minimum_separation_pct=LIQUIDATION_DISPLAY_MIN_SEPARATION_PCT}={}){
 const candidates=(Array.isArray(rows)?rows:[]).filter(z=>z?.side===side&&finite(z?.price)>0);
 const comparable=candidates.filter(z=>finite(z?.distance_pct)!==null).sort((a,b)=>finite(a.distance_pct)-finite(b.distance_pct));
 const unknown=candidates.filter(z=>finite(z?.distance_pct)===null),clusters=[];
 for(const row of comparable){
  const distance=finite(row.distance_pct),key=[text(row.price_quote)||'USD',text(row.distance_reference_basis)||'UNKNOWN'].join('|');
  let cluster=clusters.find(c=>c.key===key&&Math.max(c.max_distance,distance)-Math.min(c.min_distance,distance)<=minimum_separation_pct);
  if(!cluster){cluster={key,rows:[],min_distance:distance,max_distance:distance};clusters.push(cluster);}
  cluster.rows.push(row);cluster.min_distance=Math.min(cluster.min_distance,distance);cluster.max_distance=Math.max(cluster.max_distance,distance);
 }
 for(const row of unknown)clusters.push({key:`UNKNOWN|${clusters.length}`,rows:[row],min_distance:null,max_distance:null});
 return clusters.map(cluster=>{
  const ordered=[...cluster.rows].sort((a,b)=>(finite(b.notional)??-1)-(finite(a.notional)??-1));
  const primary=ordered[0],prices=ordered.map(z=>finite(z.price)).filter(v=>v!==null),distances=ordered.map(z=>finite(z.distance_pct)).filter(v=>v!==null);
  const byGroup=new Map();
  for(const row of ordered){
   const group=text(row.independence_group)||text(row.venue)||text(row.source)||'UNKNOWN',amount=finite(row.notional),old=byGroup.get(group)||{rows:[],amount:null};old.rows.push(row);
   if(amount!==null){old.amount=group==='HTX_OFFICIAL_MODEL'?(old.amount??0)+amount:Math.max(old.amount??0,amount);}byGroup.set(group,old);
  }
  const strongest=[...byGroup.entries()].sort((a,b)=>(b[1].amount??-1)-(a[1].amount??-1))[0],notional=strongest?.[1]?.amount??null,notionalRow=strongest?.[1]?.rows?.find(z=>finite(z.notional)!==null)??primary;
  const sources=[...new Set(ordered.map(z=>text(z.source)).filter(Boolean))],minPrice=Math.min(...prices),maxPrice=Math.max(...prices),center=prices.reduce((sum,v)=>sum+v,0)/prices.length;
  return{...primary,price:center,native_price:center,notional,notional_usdt:notional,notional_unit:notionalRow?.notional_unit??primary.notional_unit,strength_label_ru:displayTier(notional),exact_amount_available:ordered.length===1&&primary.exact_amount_available===true,exact_notional_usdt:ordered.length===1?primary.exact_notional_usdt:null,estimated:ordered.length>1?true:primary.estimated,amount_semantics:ordered.length>1?'DISPLAY_CLUSTER_SAME_MODEL_SUM_CROSS_PROVIDER_MAX':primary.amount_semantics,source:sources.join(' + '),display_cluster:true,display_component_count:ordered.length,display_price_min:minPrice,display_price_max:maxPrice,display_distance_min:distances.length?Math.min(...distances):null,display_distance_max:distances.length?Math.max(...distances):null,display_minimum_separation_pct:minimum_separation_pct,display_components:ordered.map(z=>({price:z.price,distance_pct:z.distance_pct,notional:z.notional,notional_unit:z.notional_unit,source:z.source,independence_group:z.independence_group}))};
 });
}
export function selectLiquidationDisplayZones(liq,side,{limit=LIQUIDATION_DISPLAY_MAX_PER_SIDE}={}){
 const fallback=side==='ABOVE'?liq?.above:liq?.below,all=Array.isArray(liq?.all_zones)&&liq.all_zones.length?liq.all_zones:fallback;
 return clusterDisplayZones(all,side).sort((a,b)=>(finite(b.notional)??-1)-(finite(a.notional)??-1)||Math.abs(finite(a.distance_pct)??Infinity)-Math.abs(finite(b.distance_pct)??Infinity)).slice(0,limit).sort((a,b)=>Math.abs(finite(a.display_distance_min)??finite(a.distance_pct)??Infinity)-Math.abs(finite(b.display_distance_min)??finite(b.distance_pct)??Infinity));
}
function displayPriceRange(z){const min=finite(z?.display_price_min),max=finite(z?.display_price_max);return min!==null&&max!==null&&Math.abs(max-min)>Math.max(Math.abs(max),1)*1e-10?`${displayNumber(min)}–${displayNumber(max)}`:displayNumber(z?.price);}
function displayDistanceRange(z){const min=finite(z?.display_distance_min),max=finite(z?.display_distance_max);if(min===null||max===null)return null;const sign=value=>value>0?'+':value<0?'−':'';const abs=value=>displayNumber(Math.abs(Number(value.toFixed(2))));return Math.abs(max-min)<1e-9?`${sign(min)}${abs(min)}%`:`${sign(Math.abs(min)<=Math.abs(max)?min:max)}${abs(Math.abs(min)<=Math.abs(max)?min:max)}…${sign(Math.abs(min)>Math.abs(max)?min:max)}${abs(Math.abs(min)>Math.abs(max)?min:max)}%`;}
export function displayFutureLiquidations(liq,{compact=false}={}){
 const lines=[];
 for(const [side,label] of [['ABOVE','Сильные ликвидации выше'],['BELOW','Сильные ликвидации ниже']]){
  const available=selectLiquidationDisplayZones(liq,side),shown=compact?available.slice(0,2):available;
  const parts=shown.filter(Boolean).map(z=>{
   const px=displayPriceRange(z),d=displayDistanceRange(z),n=displayNumber(z.notional);
   return `${/NATIVE.*BUCKET_CENTER/.test(z.price_semantics||'')?'≈':''}${px} ${z.price_quote||'USD'} (${d===null?'расстояние неизвестно':`${d}${z.distance_reference_basis==='ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE'?' к цене источника':''}`}) — ${z.strength_label_ru||'размер неизвестен'}; ${n!==null?`${z.amount_semantics==='REPORTED_OPEN_POSITION_NOTIONAL'&&z.estimated?'открытые позиции':z.estimated?'оценка':'позиция'} ${n} ${z.notional_unit}`:'объём неизвестен'}${compact?'':`; ${z.source}${z.conditional_cross?'; зависит от других позиций счёта':''}`}`;
  });lines.push(`${label}: ${parts.length?parts.join('; '):'уровни будущих ликвидаций не получены'}.`);
 }
 const sample=(liq?.source_receipts||[]).find(r=>r.coverage?.kind==='TRACKED_ACCOUNT_SAMPLE_ONLY')?.coverage;
 if(sample)lines.push(`Hyperliquid: выборка до ${sample.account_population_limit} аккаунтов${compact?'':`; проверено ${sample.provider_coverage?.scanned??'не указано'}; без цены ликвидации ${sample.provider_totals?.without_liq_px??'не указано'} позиций`}.`);
 if(!compact&&liq?.provider_zone_count){
  lines.push('Размер по объёму: небольшая <10 тыс., средняя 10–100 тыс., крупная 100 тыс.–1 млн, огромная ≥1 млн; шкала отчёта.');
  lines.push(`Покрытие: только доступные площадки и диапазон источника; время снимка ${displayTime(Math.min(...[...liq.above,...liq.below].map(z=>z.source_ts)))} МСК.`);
 }
 return lines;
}
export function displayLegacyLiquidations(liq){
 if(liq?.future_only===true)return displayFutureLiquidations(liq);
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
