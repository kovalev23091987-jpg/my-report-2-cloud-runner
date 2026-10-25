import {factUsable, finite, positive, validTime} from '../contracts/index.mjs';
const clean=v=>String(v??'').replace(/[\r\n\p{C}]/gu,' ').slice(0,32);
const number=v=>Number(v.toPrecision(6)).toString();
const usable=(f,kind,at,ttl)=>f?.kind===kind&&factUsable(f,at)&&f.event_ts<=f.received_ts&&at-f.event_ts<=ttl;
const source=f=>clean(f.source)+' / '+clean(f.venue)+(f.origin==='ESTIMATED'?' (оценка)':'');

export function explainOptionalFacts(facts,at,profile){
  const findings=[],used=[],optional_context={},out={findings,fact_ids:used,optional_context};
  const add=(code,text,f)=>{findings.push({code,text,fact_ids:[f.fact_id]});used.push(f.fact_id);};
  const retain=(kind,f,value)=>{optional_context[kind]={value:structuredClone(value),unit:f.unit,source:f.source,venue:f.venue,origin:f.origin,
    event_ts:f.event_ts,received_ts:f.received_ts,fact_id:f.fact_id};};
  const trades=facts.trades,ttl=profile.freshness_ms.trades;
  if(usable(trades,'trades',at,ttl)&&trades.origin==='OBSERVED'&&trades.unit==='USDT_PRICE_BASE_QUANTITY'&&Array.isArray(trades.value)){
    const known=trades.value.filter(r=>validTime(r.event_ts)&&r.event_ts<=at&&r.event_ts<=trades.event_ts&&at-r.event_ts<=ttl&&positive(r.price)&&positive(r.quantity_base)&&['BUY','SELL'].includes(r.aggressor_side));
    // Repeated stable IDs are one execution. Conflicting same-ID rows invalidate that ID.
    const ids=new Map(),anonymous=[];
    for(const row of known){if(typeof row.trade_id!=='string'||!row.trade_id){anonymous.push(row);continue;}const prior=ids.get(row.trade_id);
      if(prior===null)continue;if(prior&&(prior.event_ts!==row.event_ts||prior.price!==row.price||prior.quantity_base!==row.quantity_base||prior.aggressor_side!==row.aggressor_side))ids.set(row.trade_id,null);else ids.set(row.trade_id,row);}
    const rows=[...anonymous,...[...ids.values()].filter(Boolean)];
    if(rows.length){let buy=0,sell=0;for(const r of rows){const usd=r.price*r.quantity_base;if(r.aggressor_side==='BUY')buy+=usd;else sell+=usd;}
      if(finite(buy)&&finite(sell)){
        out.trade_context={buy_usdt:buy,sell_usdt:sell,direction_coverage:rows.length===trades.value.length?'ALL_RETURNED_TRADES':'PARTIAL_RETURNED_TRADES',
          sample_start_ts:Math.min(...rows.map(r=>r.event_ts)),sample_end_ts:Math.max(...rows.map(r=>r.event_ts)),unique_executions:rows.length,absorption_proven:false};
        add('TRADE_SAMPLE','В полученной выборке сделок '+source(trades)+': покупки '+number(buy)+' USDT, продажи '+number(sell)+' USDT; это не доказательство поглощения продаж.',trades);
      }
    }
  }
  for(const kind of ['open_interest','funding','market_context']){
    const f=facts[kind];if(!usable(f,kind,at,profile.freshness_ms[kind]??profile.freshness_ms.price))continue;
    // Keep only qualified feature values. Raw provider payloads belong in ROOT's
    // source store and must not smuggle future rows into the original features.
    if(kind==='open_interest'&&finite(f.value)&&f.value>=0&&['CONTRACTS','BASE_ASSET','USDT'].includes(f.unit)){
      retain(kind,f,f.value);add('OI_SNAPSHOT','Открытый интерес '+source(f)+': '+number(f.value)+' '+f.unit+'; один срез не показывает изменение или сторону позиций.',f);}
    if(kind==='funding'&&f.unit==='RATE_FRACTION_PER_ACTUAL_PERIOD'&&finite(f.value?.rate)&&finite(f.value.rate*100)&&positive(f.value?.period_ms)&&f.value.period_ms<=86400000){
      retain(kind,f,{rate:f.value.rate,period_ms:f.value.period_ms});add('FUNDING_SNAPSHOT','Фандинг '+source(f)+': '+number(f.value.rate*100)+'% за '+number(f.value.period_ms/3600000)+' ч; это контекст, а не направление будущей цены.',f);}
    // Proposed optional normalized context: same exact closed return window for
    // the candidate, BTC and/or ETH. Asynchronous windows are not comparable.
    if(kind==='market_context'&&f.unit==='RETURN_PERCENT_SAME_WINDOW'&&Array.isArray(f.value?.returns)){
      const rows=f.value.returns.filter(r=>['CANDIDATE','BTC','ETH'].includes(r.role)&&finite(r.return_pct)&&r.return_pct>=-100&&validTime(r.start_ts)&&validTime(r.end_ts)&&r.start_ts<r.end_ts&&r.end_ts<=f.event_ts&&at-r.end_ts<=(profile.freshness_ms.market_context??profile.freshness_ms.price));
      const candidate=rows.filter(r=>r.role==='CANDIDATE');
      if(candidate.length===1){const c=candidate[0],peers=['BTC','ETH'].flatMap(role=>{const r=rows.filter(x=>x.role===role);return r.length===1&&r[0].start_ts===c.start_ts&&r[0].end_ts===c.end_ts?r:[];});
        if(peers.length){retain(kind,f,{returns:[c,...peers].map(r=>({role:r.role,return_pct:r.return_pct,start_ts:r.start_ts,end_ts:r.end_ts}))});
          add('RELATIVE_RETURN','За одинаковое закрытое окно '+number((c.end_ts-c.start_ts)/60000)+' мин: монета '+number(c.return_pct)+'%, '+peers.map(r=>r.role+' '+number(r.return_pct)+'%').join(', ')+' ('+source(f)+').',f);}}
    }
  }
  return out;
}

export function explainMapPlan(plan,map){
  const up=map?.zones_up??[],down=map?.zones_down??[],overlap=(a,b)=>a.lower<=b.upper&&b.lower<=a.upper;
  const entries=plan.entry_zones.flatMap((entry,index)=>{const zones=down.filter(z=>overlap(entry,z));return zones.length?[{entry_index:index,zone_ids:zones.map(z=>z.zone_id)}]:[];});
  const exits=up.filter(z=>overlap(plan.exit_zone,z)),between=up.filter(z=>z.lower<plan.exit_zone.lower);
  if(!entries.length&&!exits.length&&!between.length)return null;
  const parts=[];
  if(entries.length)parts.push('Области входа '+entries.map(e=>e.entry_index+1).join(', ')+' пересекаются с показанными нижними зонами карты');
  if(exits.length)parts.push('область фиксации пересекается с верхней зоной карты');
  if(between.length)parts.push('до области фиксации есть верхняя зона карты; она не гарантирует остановку цены');
  return {liquidation_confluence:{entries,exit_zone_ids:exits.map(z=>z.zone_id),intervening_upper_zone_ids:between.map(z=>z.zone_id)},
    finding:{code:'MAP_PLAN_CONTEXT',text:parts.join('; ')+'. Структурные уровни плана сохранены.',fact_ids:[],zone_ids:[...new Set([...entries.flatMap(e=>e.zone_ids),...exits.map(z=>z.zone_id),...between.map(z=>z.zone_id)])]}};
}
