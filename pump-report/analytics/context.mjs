import {factUsable, finite, positive, validTime, TRADE_BASE_QUANTITY_UNIT, TRADE_QUOTE_NOTIONAL_UNIT} from '../contracts/index.mjs';
const clean=v=>{let out='';for(const p of String(v??'').replace(/[\r\n\p{C}]/gu,' ')){if(out.length+p.length>32)break;out+=p;}return out;};
const number=v=>Number(v.toPrecision(6)).toString();
const usable=(f,kind,at,ttl)=>f?.kind===kind&&factUsable(f,at)&&f.event_ts<=f.received_ts&&at-f.event_ts<=ttl;
const source=f=>clean(f.source)+' / '+clean(f.venue)+(f.origin==='ESTIMATED'?' (оценка)':'');

function summarizeTradeSample(f,at,ttl){
  const empty=()=>({first_price:null,last_price:null,min_price:null,max_price:null,first_to_last_return_pct:null});
  const provenance={fact_id:f.fact_id,instrument_id:f.instrument_id,source:f.source,venue:f.venue,origin:f.origin,unit:f.unit,
    event_ts:f.event_ts,received_ts:f.received_ts,expires_ts:f.expires_ts,evidence_ref:f.evidence_ref??null};
  const coverage={scope:'QUALIFIED_UNIQUE_RETURNED_TRADES_ONLY',returned_rows:Array.isArray(f.value)?f.value.length:0,qualified_unique_rows:0,
    duplicate_rows:0,conflicting_ids:0,excluded_returned_rows:0,exclusion_reasons:[],provider_coverage:structuredClone(f.coverage??null),full_market_coverage:false};
  const unavailable=reason=>({diagnostic:{status:'UNAVAILABLE',reason,buy_usdt:null,sell_usdt:null,netflow_usdt:null,price_response:empty(),coverage,provenance}});
  if(!usable(f,'trades',at,ttl))return unavailable('TRADE_FACT_NOT_USABLE');
  if(f.origin!=='OBSERVED')return unavailable('TRADE_ORIGIN_NOT_OBSERVED');
  if(![TRADE_BASE_QUANTITY_UNIT,TRADE_QUOTE_NOTIONAL_UNIT].includes(f.unit))return unavailable('TRADE_UNITS_UNQUALIFIED');
  const quoteNotional=f.unit===TRADE_QUOTE_NOTIONAL_UNIT,amountField=quoteNotional?'notional_quote':'quantity_base';
  const amount=row=>quoteNotional?row.notional_quote:row.price*row.quantity_base;
  if(!Array.isArray(f.value))return unavailable('TRADE_ROWS_REQUIRED');
  if(!f.value.length)return unavailable('EMPTY_RETURNED_SAMPLE');
  const ids=new Map(),reasons=new Set(),fields=['event_ts','price',amountField,'aggressor_side'];
  const exclude=(count,reason)=>{coverage.excluded_returned_rows+=count;reasons.add(reason);};
  // Resolve conflicts before filtering: an invalid second row cannot hide a
  // disagreement with a valid row bearing the same execution identifier.
  for(const row of f.value){
    if(typeof row?.trade_id!=='string'||!row.trade_id.trim()){exclude(1,'MISSING_STABLE_TRADE_ID');continue;}
    const prior=ids.get(row.trade_id);
    if(!prior){ids.set(row.trade_id,{row,count:1,conflict:false});continue;}
    prior.count++;
    if(fields.every(k=>prior.row[k]===row[k]))coverage.duplicate_rows++;
    else if(!prior.conflict){prior.conflict=true;coverage.conflicting_ids++;}
  }
  const rows=[];
  for(const {row,count,conflict}of ids.values()){
    if(conflict){exclude(count,'CONFLICTING_TRADE_ID');continue;}
    if(!validTime(row.event_ts)||row.event_ts>at||row.event_ts>f.event_ts||at-row.event_ts>ttl){exclude(count,'TRADE_ROW_CLOCK_UNQUALIFIED');continue;}
    if(!positive(row.price)||!positive(row[amountField])||!['BUY','SELL'].includes(row.aggressor_side)){exclude(count,quoteNotional?'TRADE_PRICE_NOTIONAL_OR_SIDE_UNQUALIFIED':'TRADE_PRICE_QUANTITY_OR_SIDE_UNQUALIFIED');continue;}
    if(!positive(amount(row))){exclude(count,'TRADE_NOTIONAL_NOT_FINITE');continue;}
    rows.push(row);
  }
  coverage.qualified_unique_rows=rows.length;coverage.exclusion_reasons=[...reasons];
  if(!rows.length)return unavailable('NO_QUALIFIED_UNIQUE_TRADES');
  let buy=0,sell=0,min=Infinity,max=-Infinity,start=Infinity,end=-Infinity;
  for(const r of rows){const notional=amount(r);if(r.aggressor_side==='BUY')buy+=notional;else sell+=notional;
    min=Math.min(min,r.price);max=Math.max(max,r.price);start=Math.min(start,r.event_ts);end=Math.max(end,r.event_ts);}
  if(!finite(buy)||!finite(sell))return unavailable('TRADE_SAMPLE_SUM_NOT_FINITE');
  const firstPrices=new Set(rows.filter(r=>r.event_ts===start).map(r=>r.price)),lastPrices=new Set(rows.filter(r=>r.event_ts===end).map(r=>r.price));
  const first=firstPrices.size===1?[...firstPrices][0]:null,last=lastPrices.size===1?[...lastPrices][0]:null;
  const response={first_price:first,last_price:last,min_price:min,max_price:max,first_to_last_return_pct:null};
  let reason=null;
  if(first===null||last===null)reason='ENDPOINT_ORDER_AMBIGUOUS';
  else if(start===end)reason='SAMPLE_HAS_NO_TIME_SPAN';
  else{const change=100*(last/first-1);if(finite(change))response.first_to_last_return_pct=change;else reason='PRICE_RETURN_NOT_FINITE';}
  return {context:{buy_usdt:buy,sell_usdt:sell,netflow_usdt:buy-sell,
    ...(quoteNotional?{amount_basis:'OBSERVED_USDT_QUOTE_NOTIONAL',base_quantity_qualified:false}:{}),
    direction_coverage:coverage.excluded_returned_rows?'PARTIAL_RETURNED_TRADES':'ALL_RETURNED_TRADES',sample_start_ts:start,sample_end_ts:end,unique_executions:rows.length,
    price_response:response,price_response_reason:reason,coverage,provenance,absorption_proven:false,market_path_proven:false,causation_proven:false}};
}

export function explainOptionalFacts(facts,at,profile){
  const findings=[],used=[],optional_context={},out={findings,fact_ids:used,optional_context};
  const add=(code,text,f)=>{findings.push({code,text,fact_ids:[f.fact_id]});used.push(f.fact_id);};
  const retain=(kind,f,value)=>{optional_context[kind]={value:structuredClone(value),unit:f.unit,source:f.source,venue:f.venue,origin:f.origin,
    event_ts:f.event_ts,received_ts:f.received_ts,fact_id:f.fact_id};};
  const trades=facts.trades,ttl=profile.freshness_ms.trades;
  if(trades){
    const sample=summarizeTradeSample(trades,at,ttl);if(sample.diagnostic)out.trade_diagnostic=sample.diagnostic;
    if(sample.context){const c=out.trade_context=sample.context;
      add('TRADE_SAMPLE','В полученной выборке сделок '+source(trades)+': покупки '+number(c.buy_usdt)+' USDT, продажи '+number(c.sell_usdt)+' USDT; это не доказательство поглощения продаж.',trades);
      const p=c.price_response;
      if(p.first_to_last_return_pct!==null)add('TRADE_PRICE_RESPONSE','В полученной выборке '+source(trades)+' за '+number((c.sample_end_ts-c.sample_start_ts)/1000)+' с от первой к последней сделке цена '+number(p.first_price)+'→'+number(p.last_price)+' USDT ('+(p.first_to_last_return_pct>=0?'+':'')+number(p.first_to_last_return_pct)+'%); покупки '+number(c.buy_usdt)+', продажи '+number(c.sell_usdt)+' USDT. Только выборка, не весь рынок'+(c.coverage.excluded_returned_rows?'; часть строк исключена':'')+'.',trades);
    }
  }
  for(const kind of ['open_interest','funding']){
    const f=facts[kind];if(!usable(f,kind,at,profile.freshness_ms[kind]??profile.freshness_ms.price))continue;
    // Keep only qualified feature values. Raw provider payloads belong in ROOT's
    // source store and must not smuggle future rows into the original features.
    if(kind==='open_interest'&&finite(f.value)&&f.value>=0&&['CONTRACTS','BASE_ASSET','USDT'].includes(f.unit)){
      retain(kind,f,f.value);add('OI_SNAPSHOT','Открытый интерес '+source(f)+': '+number(f.value)+' '+f.unit+'; один срез не показывает изменение или сторону позиций.',f);}
    if(kind==='funding'&&f.unit==='RATE_FRACTION_PER_ACTUAL_PERIOD'&&finite(f.value?.rate)&&finite(f.value.rate*100)&&positive(f.value?.period_ms)&&f.value.period_ms<=86400000){
      retain(kind,f,{rate:f.value.rate,period_ms:f.value.period_ms});
      Object.assign(optional_context.funding,{kind:f.kind,status:f.status,instrument_id:f.instrument_id,expires_ts:f.expires_ts,evidence_ref:f.evidence_ref});
      add('FUNDING_SNAPSHOT','Фандинг '+source(f)+': '+number(f.value.rate*100)+'% за '+number(f.value.period_ms/3600000)+' ч; это контекст, а не направление будущей цены.',f);}
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
