export const MANUAL_RUN_SUMMARY_VERSION='manual-run-summary-ru-v1-20260929';
const finite=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const price=value=>{const n=finite(value);return n!==null&&n>0?String(Number(n.toPrecision(8))):null;};
const contract=value=>typeof value==='string'&&/^[^\s]{1,40}-USDT$/u.test(value)?value:null;
const actionable=new Set(['OBSERVE','WAIT_FOR_TRIGGER','ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED']);

function proven(row,generatedAt){
 const c=row?.canonical;
 if(c?.status!=='CLOSED'||!actionable.has(c?.state)||c?.direction!==row?.direction||!contract(row?.contract)||
  !['LONG','SHORT'].includes(row?.direction)||!c?.entry||!c?.trigger||!c?.invalidation||!Array.isArray(c?.targets)||!c.targets.length)return false;
 if(c.state==='OBSERVE'&&finite(c.scores?.coin_interest_0_100)<70)return false;
 if(!price(c.trigger.value)||!price(c.invalidation.price))return false;
 const deadline=finite(row.valid_until_ts??c.trigger.expires_ts);
 if(deadline!==null&&Number.isFinite(Date.parse(generatedAt))&&deadline<Date.parse(generatedAt))return false;
 const entry=finite(c.entry.min_price??c.entry.max_price),target=finite(c.targets[0]?.price);
 if(entry===null||entry<=0||target===null||target<=0)return false;
 return (c.direction==='LONG'?(target/entry-1)*100:(1-target/entry)*100)>=5;
}

function idea(row){
 const c=row.canonical,entry=price(c.entry.min_price??c.entry.max_price),target=price(c.targets[0].price);
 const trigger=price(c.trigger.value),cancel=price(c.invalidation.price),score=finite(c.scores?.coin_interest_0_100);
 const state=c.state==='OBSERVE'?'Наблюдение':c.state==='WAIT_FOR_TRIGGER'?'Ждём условие':'Вход подтверждён';
 const lines=[`${row.contract} — ${state}${score!==null?`; оценка ${Math.round(score)} из 100`:''}.`];
 if(trigger)lines.push(`Условие: цена ${c.direction==='LONG'?'выше':'ниже'} ${trigger} USDT.`);
 lines.push(`Уровень входа: ${entry} USDT.`);
 if(cancel)lines.push(`Отмена идеи: цена ${c.direction==='LONG'?'ниже':'выше'} ${cancel} USDT.`);
 lines.push(`Первая цель: ${target} USDT.`);
 return lines;
}

export function formatManualRunSummary({status,candidates=[],generated_at}={}){
 if(!['CLOSED','CLOSED_NO_CANONICAL_CANDIDATE'].includes(status)||!Array.isArray(candidates))return null;
 const stamp=Number.isFinite(Date.parse(generated_at))?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(generated_at)):null;
 const lines=['МОЙ ОТЧЁТ 2',...(stamp?[`${stamp} МСК`]:[]),''];
 let found=0;
 for(const direction of ['LONG','SHORT']){
  lines.push(direction==='LONG'?'ПОКУПКА':'ПРОДАЖА');
  const ideas=candidates.filter(row=>row?.direction===direction&&proven(row,generated_at));
  if(!ideas.length)lines.push('Подтверждённых идей сейчас нет.');
  else for(const row of ideas){lines.push(...idea(row));found++;}
  lines.push('');
 }
 if(!found){
  const rejected=candidates.filter(row=>row?.canonical_state==='REJECTED'&&contract(row?.contract));
  if(rejected.length){
   const row=rejected[0],score=finite(row.canonical?.scores?.coin_interest_0_100);
   lines.push(`${row.contract} ${row.direction==='LONG'?'на покупку':row.direction==='SHORT'?'на продажу':''}${score!==null?` получила оценку ${Math.round(score)} из 100,`:''} но подтверждённого плана входа нет. Идея отклонена.`);
  }
  lines.push('Действие сейчас: не входить.');
 }
 return lines.join('\n').trim();
}
export default {MANUAL_RUN_SUMMARY_VERSION,formatManualRunSummary};
