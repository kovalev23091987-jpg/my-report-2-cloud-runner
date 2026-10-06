// Owner-approved presentation only. Receipts and analysis values remain unchanged.
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const pct=v=>Math.abs(v).toFixed(1).replace('.',',');
const money=v=>v.toFixed(2).replace('.',',');
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
 const n=r?.valid_recent_rows,buy=number(r?.buy_quote_turnover_usdt),sell=number(r?.sell_quote_turnover_usdt);
 if(!Number.isSafeInteger(n)||n<=0||buy===null||sell===null||buy<0||sell<0)return `${f.label}: ${f.value} — ${f.source}.`;
 const count=n===4?'четырёх':String(n);
 return `В последних ${count} полученных сделках покупки составили ${money(buy)} USDT, продажи — ${money(sell)} USDT. Выборка маленькая, по ней нельзя судить обо всём рынке.`;
}
export function plainCancellation(condition){
 const m=/^(?:price|цена)\s*([<>]=?)\s*(\d+(?:\.\d+)?)$/.exec(String(condition??'').trim());
 if(!m)return null;
 const op={'<':'ниже','>':'выше','<=':'не выше','>=':'не ниже'}[m[1]];
 return `цена ${op} ${m[2].replace('.',',')} USDT`;
}
