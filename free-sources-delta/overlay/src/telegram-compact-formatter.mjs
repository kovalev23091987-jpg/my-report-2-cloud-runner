export const TELEGRAM_COMPACT_FORMATTER_VERSION='telegram-compact-formatter-v2-free-sources-20260925';
const text=v=>v===null||v===undefined?'':String(v).trim();
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const venueName=(v)=>({HTX:'ХТХ',BINANCE:'Бинанс',BYBIT:'Байбит',OKX:'ОКХ',GATE:'Гейт',HYPERLIQUID:'Гиперликвид'}[text(v).toUpperCase()]||text(v));
const fmtScore=v=>finite(v)===null?'не проверено':`${Math.round(finite(v))} из 100`;
const fmtPx=v=>finite(v)===null?'не проверено':String(Number(finite(v).toPrecision(8)));
const stateTitle=(r)=>{
 const side=r.direction==='LONG'?'ПОКУПКА':r.direction==='SHORT'?'ПРОДАЖА':'';
 if(r.state==='ENTRY_NOW_ANALYTICAL'||r.state==='ENTRY_NOW_VALIDATED')return `✅ ${side||'ВХОД'} СЕЙЧАС`;
 if(r.state==='WAIT_FOR_TRIGGER')return `🟡 ${side||'ИДЕЯ'} — ЖДЁМ УСЛОВИЕ`;
 if(r.state==='OBSERVE')return '⚪️ НАБЛЮДЕНИЕ';return '⛔️ НЕ ГОТОВО';
};
function factLine(f){
 if(typeof f==='string')return f;
 const label=text(f?.label||f?.metric),value=f?.value,unit=text(f?.unit),venue=venueName(f?.venue||f?.source),event=text(f?.event);
 if(!label)return null;
 const measured=value!==null&&value!==undefined&&value!==''?`${value}${unit?` ${unit}`:''}`:event;
 if(!measured)return null;
 return `• ${label}: ${measured}${venue?` — ${venue}`:''}`;
}
function liqSide(rows,label){
 if(!Array.isArray(rows)||!rows.length)return `${label}: сильные зоны не подтверждены`;
 return `${label}: `+rows.slice(0,3).map(z=>`${fmtPx(z.price)} (${z.distance_pct>=0?'+':''}${z.distance_pct.toFixed(1)}%) — ${z.selection_role==='LARGEST_DISTANT'?'крупнейшая':'сильная'}, ${z.liquidated_side==='SELLERS'?'ликвидации продавцов':'ликвидации покупателей'}`).join('; ');
}
export function formatTelegramCompact(result,{facts=[]}={}){
 if(result?.status!=='CLOSED')return{ok:false,status:'CANONICAL_NOT_CLOSED',message:null};
 const ticker=text(result?.candidates?.[0]?.ticker||result?.candidates?.[0]?.contract||result?.metadata?.contract||'').replace(/-USDT$/i,'');
 const lines=[`${ticker||'Монета'} — ${stateTitle(result)}`,`Снимок: ${result.snapshot_time_utc}`,
   `Общая оценка: ${fmtScore(result.scores?.overall_0_100)}`,
   `Монета интересна: ${fmtScore(result.scores?.coin_interest_0_100)}`,
   `Готовность ко входу: ${fmtScore(result.scores?.entry_readiness_0_100)}`];
 const evidence=(Array.isArray(facts)&&facts.length?facts:result.reasons).map(factLine).filter(Boolean).slice(0,5);
 lines.push(...evidence);
 if(result.state==='ENTRY_NOW_ANALYTICAL'||result.state==='ENTRY_NOW_VALIDATED'){
   if(result.entry?.area)lines.push(`Вход: ${result.entry.area}`);else if(result.entry?.min_price!=null&&result.entry?.max_price!=null)lines.push(`Вход: ${fmtPx(result.entry.min_price)}–${fmtPx(result.entry.max_price)}`);
   if(result.invalidation)lines.push(`Отмена идеи: ${typeof result.invalidation==='string'?result.invalidation:JSON.stringify(result.invalidation)}`);
   if(result.targets?.length)lines.push(`Цели: ${result.targets.slice(0,3).map(x=>fmtPx(x?.price??x)).join(', ')}`);
 } else if(result.state==='WAIT_FOR_TRIGGER'){
   const t=result.trigger;if(t?.value!=null)lines.push(`Условие входа: цена ${text(t.operator)} ${fmtPx(t.value)}${t.timeframe?` на ${t.timeframe}`:''}`);
   if(t?.expires_ts)lines.push(`Действует до: ${new Date(t.expires_ts).toISOString()}`);
   if(t?.cancel_condition)lines.push(`Отмена ожидания: ${t.cancel_condition}`);
   if(t?.next_recheck_ts)lines.push(`Следующая проверка: ${new Date(t.next_recheck_ts).toISOString()}`);
 }
 if(result.liquidations?.pump?.is_pump===true){lines.push('Ликвидации:',liqSide(result.liquidations.above,'Выше — продавцы'),liqSide(result.liquidations.below,'Ниже — покупатели'));}
 const blockers=Array.isArray(result.free_sources?.entry_funnel?.blockers)?result.free_sources.entry_funnel.blockers:[];
 if(blockers.includes('FEE_RECEIPT_MISSING'))lines.push('Не хватает: подтверждённой комиссии ХТХ.');
 if(blockers.includes('FUTURE_FUNDING_OR_HOLDING_UNKNOWN'))lines.push('Не хватает: подтверждённых расходов до планового выхода.');
 if(blockers.includes('CROSS_VENUE_DIVERGENCE'))lines.push('Биржи расходятся: значения не усреднялись.');
 if(result.changes_from_previous?.length)lines.push(`Изменилось: ${result.changes_from_previous.slice(0,3).join('; ')}`);
 let message=lines.filter(Boolean).join('\n');
 const serious=Boolean(result?.metadata?.serious_risk_or_conflict);
 const max=result.state==='WAIT_FOR_TRIGGER'&&!serious?850:result.state.startsWith('ENTRY_NOW_')?1100:1600;
 if(message.length>max)return{ok:false,status:'MESSAGE_TOO_LONG',message:null,length:message.length,max_length:max};
 const forbidden=/\b(?:LONG|SHORT|OI|Funding|Spot flow|Spread|Slippage|Data Quality)\b|автоматическая торговля выключена|это не вероятность|не вероятность/i;
 if(forbidden.test(message))return{ok:false,status:'FORBIDDEN_USER_TERMINOLOGY',message:null};
 return{ok:true,status:'READY',message,length:message.length,max_length:max,formatter:TELEGRAM_COMPACT_FORMATTER_VERSION,analytical_fingerprint:result.analytical_fingerprint};
}
export default{TELEGRAM_COMPACT_FORMATTER_VERSION,formatTelegramCompact};
