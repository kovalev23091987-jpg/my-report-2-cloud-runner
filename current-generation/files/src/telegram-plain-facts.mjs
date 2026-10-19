import {verifyBitfinexN10MemoryEvidence} from './bitfinex-n10-memory-context.mjs';
import {validateJointFlowEvidence,validateAvailableFlowEvidence} from './joint-spot-futures-flow.mjs';
import {validateGateFuturesTradeSample} from './gate-futures-trade-sample.mjs';
import {validateBitfinexN12BoundedTradeSample} from './bitfinex-n12-bounded-trade-sample.mjs';
import {validateGateN12BoundedTradeSample} from './gate-n12-bounded-trade-sample.mjs';
import {validateBitgetN12BoundedTradeSample} from './bitget-n12-bounded-trade-sample.mjs';
import {validateN12NativePublicTrade} from './n12-native-public-trade-sample.mjs';
import {validateN12KucoinTokenTrade} from './n12-kucoin-token-trade-sample.mjs';
// Owner-approved presentation only. Receipts and analysis values remain unchanged.
const validN12PublicTrade=(row,now)=>validateN12NativePublicTrade(row,now)||validateN12KucoinTokenTrade(row,now);
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const pct=v=>Math.abs(v).toFixed(1).replace('.',',');
const money=v=>v.toFixed(2).replace('.',',');
export const omitTelegramCurrencies=s=>String(s).replace(/\s*\bUSD(?:T|C)?\b/gi,'');
export function plainSpotFuturesJointConclusion(c){
 const m=c?.metadata,context=m?.supporting_context?.blocks?.spot_futures_market;
 if(m?.canonical_runtime_adapter!=='canonical-runtime-adapter-v18-spot-futures-joint-output-20261012'||context?.schema!=='htx-spot-futures-shared-market-context-v1'||context.contract!==m.contract||context.observed_ts!==c.observed_ts||context.independent_venue_count!==1||context.network_calls!==0||context.score_contribution!==0||context.entry_authorized!==false)return null;
 const facts=Array.isArray(m?.supporting_context?.facts)?m.supporting_context.facts:[];
 const f=facts.find(row=>row?.field==='SPOT_FUTURES_JOINT_CONCLUSION'&&row.contract===m.contract&&row.market_pair_status===context.status&&row.source==='HTX'&&row.label==='Сводный вывод по споту и фьючерсам'&&row.score_contribution===0&&row.entry_authorized===false&&row.directional_vote===false&&row.observed_ts===c.observed_ts&&Number.isSafeInteger(row.source_ts)&&row.source_ts<=c.observed_ts&&c.observed_ts-row.source_ts<=300000&&typeof row.value==='string'&&row.value.length<240&&!/[\r\n]/u.test(row.value));
 return f?`${f.label}: ${f.value} — ХТХ.`:null;
}
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
 if(f?.block_id==='N12'&&['Направление последних сделок OKX','Направление последних сделок KuCoin'].includes(f.label)){
  const row=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(r=>r.evidence_id===f.evidence_id);
  if(!validN12PublicTrade(row,c.observed_ts))return `${f.label}: ${f.value} — ${f.source}.`;
  const pair=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(r=>r.evidence_id!==row.evidence_id&&f.evidence_ids?.includes(r.evidence_id)&&validN12PublicTrade(r,c.observed_ts)&&r.venue===row.venue&&r.market!==row.market);
  if(pair){const same=Math.abs(row.taker_imbalance)>=.05&&Math.abs(pair.taker_imbalance)>=.05&&Math.sign(row.taker_imbalance)===Math.sign(pair.taker_imbalance),part=r=>`${r.market==='SPOT'?'спот':'фьючерсы'}: ${r.valid_recent_rows} сделок, покупки ${money(r.buy_quote_turnover_usdt)}, продажи ${money(r.sell_quote_turnover_usdt)} USDT`;return `Последние сделки ${row.venue==='OKX'?'OKX':'KuCoin'}: ${part(row)}; ${part(pair)}. Выборки неполные. ${same?'Направления двух рынков совпадают только в этих выборках.':'Общего направления по двум рынкам нет.'} Это одна биржа.`;}
  return `Последние сделки ${row.venue==='OKX'?'OKX':'KuCoin'} на ${row.market==='SPOT'?'споте':'фьючерсах'}: ${row.valid_recent_rows} сделок, покупки ${money(row.buy_quote_turnover_usdt)}, продажи ${money(row.sell_quote_turnover_usdt)} USDT. Выборка неполная, общее направление не подтверждено.`;
 }
 if(f?.block_id==='N12'&&f.label==='Направление последних сделок Bitfinex'){
  const row=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(r=>r.evidence_id===f.evidence_id);
  return validateBitfinexN12BoundedTradeSample(row,c.observed_ts)?`Последние сделки Bitfinex на споте: ${row.valid_recent_rows} сделок, покупки ${money(row.buy_quote_turnover_usd)}, продажи ${money(row.sell_quote_turnover_usd)} USD. Выборка неполная, общее направление не подтверждено.`:`${f.label}: ${f.value} — ${f.source}.`;
 }
 if(f?.block_id==='N12'&&f.label==='Направление последних сделок Bitget'){
  const row=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(r=>r.evidence_id===f.evidence_id);
  return validateBitgetN12BoundedTradeSample(row,c.observed_ts)?`Последние сделки Bitget на ${row.market==='SPOT'?'споте':'фьючерсах'}: ${row.valid_recent_rows} сделок, покупки ${money(row.buy_quote_turnover_usdt)}, продажи ${money(row.sell_quote_turnover_usdt)} USDT. Выборка неполная, общее направление не подтверждено.`:`${f.label}: ${f.value} — ${f.source}.`;
 }
 if(f?.block_id==='N12'&&f.label==='Направление последних сделок Gate'){
  const g=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(r=>r.evidence_id===f.evidence_id);
  if(validateGateN12BoundedTradeSample(g,c.observed_ts))return `Последние сделки Gate на споте: ${g.valid_recent_rows} сделок, покупки ${money(g.buy_quote_turnover_usdt)}, продажи ${money(g.sell_quote_turnover_usdt)} USDT. Это неполная выборка одной биржи, общее направление не подтверждено.`;
  return validateGateFuturesTradeSample(g,c.observed_ts)?`Последние сделки Gate на фьючерсах: ${g.valid_recent_rows} сделок, покупки ${money(g.buy_quote_turnover_usdt)}, продажи ${money(g.sell_quote_turnover_usdt)} USDT. Это неполная выборка одной биржи, общее направление не подтверждено.`:`${f.label}: ${f.value} — ${f.source}.`;
 }
 if(f?.block_id!=='N12'||f.label!=='Направление последних сделок HTX')return `${f.label}: ${f.value} — ${f.source}.`;
 // Only a previously confirmed same-snapshot fact reaches this helper.
 const r=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(r=>r.evidence_id===f.evidence_id);
 const gate=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(row=>Array.isArray(f.evidence_ids)&&f.evidence_ids.includes(row.evidence_id)&&validateGateFuturesTradeSample(row,c.observed_ts));
 const bitget=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.filter(row=>Array.isArray(f.evidence_ids)&&f.evidence_ids.includes(row.evidence_id)&&validateBitgetN12BoundedTradeSample(row,c.observed_ts))||[];
 const nativePublic=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.filter(row=>Array.isArray(f.evidence_ids)&&f.evidence_ids.includes(row.evidence_id)&&validN12PublicTrade(row,c.observed_ts))||[];
 const gateText=gate?` Gate фьючерсы: ${gate.valid_recent_rows} сделок, покупки ${money(gate.buy_quote_turnover_usdt)}, продажи ${money(gate.sell_quote_turnover_usdt)} USDT. ${bitget.length||nativePublic.length?'Общий вывод по всем площадкам ниже.':r?.directional_strength!==null&&Math.abs(r.directional_strength)>=.05&&Math.abs(gate.taker_imbalance)>=.05&&Math.sign(r.directional_strength)===Math.sign(gate.taker_imbalance)?'Направления двух бирж совпадают только в неполных выборках.':'Общего межбиржевого направления по этим выборкам нет.'}`:'';
 const all=[r,...(gate?[gate]:[]),...bitget],signs=all.map(row=>number(row?.directional_strength)??number(row?.taker_imbalance)),allAgree=signs.length===all.length&&signs.every(x=>x!==null&&Math.abs(x)>=.05&&Math.sign(x)===Math.sign(signs[0]));
 const bitgetText=bitget.length?` ${bitget.map(row=>`Bitget ${row.market==='SPOT'?'спот':'фьючерсы'}: ${row.valid_recent_rows} сделок, покупки ${money(row.buy_quote_turnover_usdt)}, продажи ${money(row.sell_quote_turnover_usdt)} USDT`).join('; ')}. ${nativePublic.length?'Общий вывод по всем площадкам ниже.':allAgree?'Направления площадок совпадают только в этих неполных выборках.':'Общего направления по всем доступным неполным выборкам нет.'} Спот и фьючерсы Bitget относятся к одной бирже.`:'';
 const allWithNative=[...all,...nativePublic],nativeSigns=allWithNative.map(row=>number(row?.directional_strength)??number(row?.taker_imbalance)),nativeAgree=nativeSigns.every(x=>x!==null&&Math.abs(x)>=.05&&Math.sign(x)===Math.sign(nativeSigns[0]));
 const nativeText=nativePublic.length?` ${nativePublic.map(row=>`${row.venue==='OKX'?'OKX':'KuCoin'} ${row.market==='SPOT'?'спот':'фьючерсы'}: ${row.valid_recent_rows} сделок, покупки ${money(row.buy_quote_turnover_usdt)}, продажи ${money(row.sell_quote_turnover_usdt)} USDT`).join('; ')}. ${nativeAgree?'Направления всех доступных площадок совпадают только в этих неполных выборках.':'Общего направления по всем доступным неполным выборкам нет.'} Спот и фьючерсы одной биржи относятся к одному источнику.`:'';
 if(r?.metric_family==='ACTUAL_TAKER_TRADES_BOUNDED_MULTI_MARKET'&&Array.isArray(r.components)&&r.components.length===2){
  const [future,spot]=r.components,market=p=>`${p.market==='SPOT'?'спот':'фьючерсы'}: ${p.valid_recent_rows} ${p.valid_recent_rows===1?'сделка':p.valid_recent_rows%10>=2&&p.valid_recent_rows%10<=4&&(p.valid_recent_rows%100<12||p.valid_recent_rows%100>14)?'сделки':'сделок'}, покупки ${money(p.buy_quote_turnover_usdt)}, продажи ${money(p.sell_quote_turnover_usdt)} USDT`;
  const n05=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(row=>Array.isArray(f.evidence_ids)&&f.evidence_ids.includes(row.evidence_id)&&row.block_id==='N05');
  const cross=n05&&((n05.metric_family==='JOINT_SPOT_FUTURES_AGREEMENT_4H'&&validateJointFlowEvidence(n05,c.observed_ts))||(n05.metric_family==='AVAILABLE_VENUE_TAKER_FLOW_4H'&&validateAvailableFlowEvidence(n05,c.observed_ts)))?` За отдельные четыре часа: ${[...new Set(n05.components.map(x=>x.venue))].join(' и ')} — ${n05.metric_family==='JOINT_SPOT_FUTURES_AGREEMENT_4H'?'направление в споте и фьючерсах согласуется':'общего подтверждения направления нет'}.`:'';
  return `Последние сделки HTX: ${market(future)}; ${market(spot)}. ${r.coverage_status==='BOUNDED_MULTIMARKET_AGREEMENT'?'Оба рынка показывают сходный перевес':'Общего направления по двум рынкам нет'}; выборки неполные.${cross}${gateText}${bitgetText}${nativeText}`;
 }
 const n=r?.valid_recent_rows,buy=number(r?.buy_quote_turnover_usdt),sell=number(r?.sell_quote_turnover_usdt);
 if(!Number.isSafeInteger(n)||n<=0||buy===null||sell===null||buy<0||sell<0)return `${f.label}: ${f.value} — ${f.source}.`;
 const count=n===4?'четырёх':String(n);
 return `В последних ${count} полученных сделках покупки составили ${money(buy)} USDT, продажи — ${money(sell)} USDT. Выборка маленькая, по ней нельзя судить обо всём рынке.${gateText}${bitgetText}${nativeText}`;
}
// Only the explanatory facts in the owner's approved brief form belong in
// Telegram. Historical supply and other raw diagnostic context stay in the
// canonical analysis and manual report; they cannot occupy a spare bullet.
export function isApprovedTelegramContextFact(f,c){
 if(f?.block_id==='N10'&&f.field==='CLOSED_15M_BITFINEX_USD_PRICE_CONTEXT'&&f.label==='Цена за 15 минут на Bitfinex'){const row=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(r=>r.evidence_id===f.evidence_id);return verifyBitfinexN10MemoryEvidence(row,c.observed_ts);}
 if(f?.block_id==='N12'&&['Направление последних сделок OKX','Направление последних сделок KuCoin'].includes(f.label)){const row=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(r=>r.evidence_id===f.evidence_id);return validN12PublicTrade(row,c.observed_ts);}
 if(f?.block_id==='N12'&&f.label==='Направление последних сделок Bitfinex'){const row=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(r=>r.evidence_id===f.evidence_id);return validateBitfinexN12BoundedTradeSample(row,c.observed_ts);}
 if(f?.block_id==='N12'&&f.label==='Направление последних сделок Bitget'){const row=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(r=>r.evidence_id===f.evidence_id);return validateBitgetN12BoundedTradeSample(row,c.observed_ts);}
 if(f?.block_id==='N12'&&f.label==='Направление последних сделок Gate'){const row=c?.metadata?.internal_market_context?.evidence_v2?.evidence?.find(r=>r.evidence_id===f.evidence_id);return validateGateFuturesTradeSample(row,c.observed_ts)||validateGateN12BoundedTradeSample(row,c.observed_ts);}
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
