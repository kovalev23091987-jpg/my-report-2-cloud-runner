import {validateJointFlowEvidence,validateAvailableFlowEvidence} from './joint-spot-futures-flow.mjs';
// Owner-approved presentation only. Receipts and analysis values remain unchanged.
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const pct=v=>Math.abs(v).toFixed(1).replace('.',',');
const money=v=>v.toFixed(2).replace('.',',');
export const omitTelegramCurrencies=s=>String(s).replace(/\s*\bUSD(?:T|C)?\b/gi,'');
export function telegramPrice(v,{zone=false}={}){
 const n=number(v);if(n===null)return null;
 if(n!==0&&Math.abs(n)<1)return n.toLocaleString('ru-RU',{maximumSignificantDigits:3,useGrouping:false});
 return n.toLocaleString('ru-RU',{maximumFractionDigits:zone&&Math.abs(n)>=100?0:2}).replace(/\u00a0/g,' ');
}
export function plainRelativeComparison(c){
 const rows=Array.isArray(c?.source_receipts)?c.source_receipts:[];
 const valid=r=>r?.contract_code===c?.metadata?.contract&&r.status==='CLOSED'&&r.fact_contract_status==='CLOSED'&&r.identity_status==='CLOSED'&&r.decision_usable===true&&r.freshness_status==='CURRENT_AT_OBSERVATION'&&r.coverage_pct===100&&r.unit==='percentage_points'&&number(r.normalized_value)!==null&&Number.isSafeInteger(r.event_ts)&&r.event_ts<=c.observed_ts&&number(r.max_age_sec)>0&&c.observed_ts-r.event_ts<=r.max_age_sec*1000;
 for(const [window,label] of [['4h','четыре часа'],['1h','час'],['24h','сутки']]){
  const a=rows.find(r=>r.metric===`rs_vs_btc_${window}`&&valid(r)),b=rows.find(r=>r.metric===`rs_vs_eth_${window}`&&valid(r));
  if(!a||!b||a.venue!==b.venue||a.event_ts!==b.event_ts||a.interval!==window||b.interval!==window)continue;
  const change=(r,name)=>`${r.normalized_value>0?`опережает ${name}`:r.normalized_value<0?`отстаёт от ${name}а`:`идёт наравне с ${name}ом`}${r.normalized_value===0?'':` на ${pct(r.normalized_value)} процентного пункта`}`;
  return `За ${label} монета ${change(a,'биткоин')} и ${change(b,'эфир')} (${a.venue}).`;
 }
 return null;
}
export function plainOpenInterest(c){
 const contract=c?.metadata?.contract,parts=[];
 for(const [key,window] of [['1h','час'],['4h','четыре часа']]){
  const r=c?.metadata?.oi_window_receipts?.[key],v=number(r?.change_pct);
  if(r?.status!=='CLOSED'||r.contract_code!==contract||r.unit!=='CONTRACTS'||v===null)continue;
  parts.push(`${v<0?'уменьшился':v>0?'увеличился':'не изменился'}${v===0?'':` на ${pct(v)}%`} за ${window}`);
 }
 if(!parts.length)return null;
 // Combine repeated verbs only when the signs agree; mixed signs stay explicit.
 if(parts.length===2&&parts[0].split(' ')[0]===parts[1].split(' ')[0])parts[1]=parts[1].replace(/^\S+ /,'');
 return `Открытые позиции — сделки, которые трейдеры ещё не закрыли. Их общий объём на HTX ${parts.join(' и ')}. Сам по себе этот показатель не определяет направление цены.`;
}
export function plainContextFact(f,c){
 if(f?.block_id!=='N12'||f.label!=='Направление последних сделок HTX')return `${f.label}: ${f.value} — ${f.source}.`;
 // Only a previously confirmed same-snapshot fact reaches this helper.
 const r=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(r=>r.evidence_id===f.evidence_id);
 if(r?.metric_family==='ACTUAL_TAKER_TRADES_BOUNDED_MULTI_MARKET'&&Array.isArray(r.components)&&r.components.length===2){
  const [future,spot]=r.components,market=p=>`${p.market==='SPOT'?'спот':'фьючерсы'}: ${p.valid_recent_rows} ${p.valid_recent_rows===1?'сделка':p.valid_recent_rows%10>=2&&p.valid_recent_rows%10<=4&&(p.valid_recent_rows%100<12||p.valid_recent_rows%100>14)?'сделки':'сделок'}, покупки ${money(p.buy_quote_turnover_usdt)}, продажи ${money(p.sell_quote_turnover_usdt)} USDT`;
  const n05=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(row=>Array.isArray(f.evidence_ids)&&f.evidence_ids.includes(row.evidence_id)&&row.block_id==='N05');
  const cross=n05&&((n05.metric_family==='JOINT_SPOT_FUTURES_AGREEMENT_4H'&&validateJointFlowEvidence(n05,c.observed_ts))||(n05.metric_family==='AVAILABLE_VENUE_TAKER_FLOW_4H'&&validateAvailableFlowEvidence(n05,c.observed_ts)))?` За отдельные четыре часа: ${[...new Set(n05.components.map(x=>x.venue))].join(' и ')} — ${n05.metric_family==='JOINT_SPOT_FUTURES_AGREEMENT_4H'?'направление в споте и фьючерсах согласуется':'общего подтверждения направления нет'}.`:'';
  return `Последние сделки HTX: ${market(future)}; ${market(spot)}. ${r.coverage_status==='BOUNDED_MULTIMARKET_AGREEMENT'?'Оба рынка показывают сходный перевес':'Общего направления по двум рынкам нет'}; выборки неполные.${cross}`;
 }
 const n=r?.valid_recent_rows,buy=number(r?.buy_quote_turnover_usdt),sell=number(r?.sell_quote_turnover_usdt);
 if(!Number.isSafeInteger(n)||n<=0||buy===null||sell===null||buy<0||sell<0)return `${f.label}: ${f.value} — ${f.source}.`;
 const count=n===4?'четырёх':String(n);
 return `В последних ${count} полученных сделках покупки составили ${money(buy)} USDT, продажи — ${money(sell)} USDT. Выборка маленькая, по ней нельзя судить обо всём рынке.`;
}
// Only the explanatory facts in the owner's approved brief form belong in
// Telegram. Historical supply and other raw diagnostic context stay in the
// canonical analysis and manual report; they cannot occupy a spare bullet.
export function isApprovedTelegramContextFact(f,c){
 if(f?.block_id==='N05'&&f.field==='AVAILABLE_VENUE_TAKER_FLOW_4H'){const row=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(r=>r.evidence_id===f.evidence_id);return validateAvailableFlowEvidence(row,c.observed_ts);}
 if(f?.block_id==='N05'&&f.field==='JOINT_SPOT_FUTURES_AGREEMENT_4H'){const row=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(r=>r.evidence_id===f.evidence_id);return validateJointFlowEvidence(row,c.observed_ts);}
 if(f?.block_id!=='N12'||f.label!=='Направление последних сделок HTX')return false;
 const r=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(r=>r.evidence_id===f.evidence_id);
 if(r?.metric_family==='ACTUAL_TAKER_TRADES_BOUNDED_MULTI_MARKET'){
  const parts=r.components;
  return Array.isArray(parts)&&parts.length===2&&r.independent_venue_count===1&&parts[0].venue==='HTX'&&parts[0].market==='FUTURES'&&parts[1].venue==='HTX'&&parts[1].market==='SPOT'&&parts.every(p=>Number.isSafeInteger(p.valid_recent_rows)&&p.valid_recent_rows>0&&number(p.buy_quote_turnover_usdt)!==null&&number(p.sell_quote_turnover_usdt)!==null&&p.buy_quote_turnover_usdt>=0&&p.sell_quote_turnover_usdt>=0);
 }
 const buy=number(r?.buy_quote_turnover_usdt),sell=number(r?.sell_quote_turnover_usdt);
 return Number.isSafeInteger(r?.valid_recent_rows)&&r.valid_recent_rows>0&&buy!==null&&sell!==null&&buy>=0&&sell>=0;
}
export function plainCancellation(condition,{brief=false}={}){
 const m=/^(?:price|цена)\s*([<>]=?)\s*(\d+(?:\.\d+)?)$/.exec(String(condition??'').trim());
 if(!m)return null;
 const op={'<':'ниже','>':'выше','<=':'не выше','>=':'не ниже'}[m[1]];
 return `цена ${op} ${brief?telegramPrice(Number(m[2])):m[2].replace('.',',')} USDT`;
}
