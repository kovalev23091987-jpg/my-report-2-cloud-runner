// Read-only additions. These receipts never authorize an HTX trade or alter score.
export const SPECIALIST_CONTEXT_VERSION='specialist-context-v1-20260930';
// Consumers recheck time and market binding at publication, not merely at fetch.
export function consumeSpecialistContext({sources={},contract,now,primary_price}={}){
 const base=String(contract||'').replace(/-USDT$/,''),facts=[],blocks={};
 const common={advisory_only:true,directional_vote:false,hard_gate:false,score_contribution:0};
 const v=sources.VYX,n=sources.NANSEN,ref=num(primary_price);
 const validVyx=v?.version===SPECIALIST_CONTEXT_VERSION&&v.status==='CLOSED'&&v.venue==='HYPERLIQUID'&&v.symbol===base&&num(now)!==null&&num(v.source_ts)!==null&&v.source_ts+60000<=now&&now-v.source_ts<=180000&&num(v.observed_ts)!==null&&v.source_ts<=v.observed_ts&&v.observed_ts<=now&&v.valid_until_ts>=now&&ref>0&&num(v.price)>0&&Math.abs(v.price/ref-1)<=0.03;
 if(validVyx){
  const local=[];
  if(num(v.microprice)>0)local.push({...common,source:'VYX',decision_block:'MARKET_STRENGTH_SPOT',field:'HL_MICROPRICE',label:'Расчётная цена по заявкам Hyperliquid, не цена входа HTX',value:v.microprice,unit:'USD',source_ts:v.source_ts});
  if(num(v.depth_imbalance_10_levels_pct)!==null&&Math.abs(v.depth_imbalance_10_levels_pct)<=100)local.push({...common,source:'VYX',decision_block:'MARKET_STRENGTH_SPOT',field:'HL_DEPTH_10_LEVELS',label:'Перевес заявок Hyperliquid на десяти уровнях',value:v.depth_imbalance_10_levels_pct,unit:'%',source_ts:v.source_ts});
  blocks.order_flow={status:local.length?'CLOSED':'NOT_CLOSED',decision_block:'MARKET_STRENGTH_SPOT',facts:local,ofi_raw:num(v.ofi_raw),ofi_unit:v.ofi_unit,source_ts:v.source_ts,not_htx_execution:true,...common};facts.push(...local);
 }else if(v)blocks.order_flow={status:'NOT_CLOSED',reason:'SPECIALIST_TIME_OR_MARKET_NOT_VERIFIED',...common};
 const validNansen=n?.version===SPECIALIST_CONTEXT_VERSION&&n.status==='CONTEXT_UNTIMED'&&n.source_ts===null&&n.venue==='HYPERLIQUID'&&n.symbol===base&&n.request_bound_symbol===true&&num(n.observed_ts)!==null&&num(now)!==null&&n.observed_ts<=now&&now-n.observed_ts<=21600000;
 if(validNansen){
  const retained={},parts=[],labels={smart_trader:'успешные трейдеры',whale:'крупные держатели',public_figure:'публичные лица'};
  for(const [name,label] of Object.entries(labels)){
   const c=n.cohorts?.[name],l=num(c?.long_usd),s=num(c?.short_usd),t=num(c?.total_usd);
   if(l===null||s===null||t===null||Math.min(l,s,t)<0||Math.abs(l+s-t)>Math.max(.01,t*1e-6))continue;
   retained[name]={long_usd:l,short_usd:s,total_usd:t};parts.push(`${label}: длинные ${Math.round(l)}, короткие ${Math.round(s)} USD`);
  }
  if(parts.length){
   const f={...common,source:'NANSEN',decision_block:'SMART_MONEY_ONCHAIN',field:'HL_COHORT_POSITIONS_UNTIMED',label:'Позиции групп Hyperliquid; время состояния неизвестно, не сигнал входа',value:parts.join('; '),unit:null,source_ts:null,observed_ts:n.observed_ts,context_only:true,freshness_unverified:true};
   // The approved visible section promises confirmed context. Untimed data
   // remains in its assigned block and never enters that visible fact list.
   blocks.cohort_positions={status:'CONTEXT_UNTIMED',decision_block:'SMART_MONEY_ONCHAIN',cohorts:retained,facts:[f],cohorts_summed:false,not_exchange_netflows:true,...common};
  }
 }else if(n)blocks.cohort_positions={status:'NOT_CLOSED',reason:'COHORT_REQUEST_BINDING_OR_RETENTION_INVALID',...common};
 return {status:facts.length?'CONTEXT_AVAILABLE':'NOT_CLOSED',blocks,facts,no_new_hard_gate:true,no_directional_vote:true,score_contribution:0};
}
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'?null:Number.isFinite(Number(v))?Number(v):null;
const spec={VYX:{cap:144,ttl:120000},NANSEN:{cap:5,ttl:21600000}};
export function normalizeVyx(p,{base,now,primary_price}){
 const root={source:'VYX',venue:'HYPERLIQUID',observed_ts:now,advisory_only:true,decision_usable:false,version:SPECIALIST_CONTEXT_VERSION};
 if(p?.symbol_name!==base||!Number.isSafeInteger(p?.symbol_id)||!Array.isArray(p?.candles))return {...root,status:'NOT_CLOSED',reason:'MARKET_IDENTITY_MISSING'};
 const rows=p.candles.filter(x=>x.interval==='1m'&&Number.isFinite(Date.parse(x.timestamp))&&Date.parse(x.timestamp)+60000<=now).sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
 const c=rows[0],ts=c?Date.parse(c.timestamp):null,price=num(c?.close),ref=num(primary_price);
 if(ts===null||now-ts>180000)return {...root,status:'NOT_CLOSED',reason:'CLOSED_MINUTE_MISSING_OR_STALE'};
 if(!price||!ref||Math.abs(price/ref-1)>0.03)return {...root,status:'NOT_CLOSED',reason:'HTX_PRICE_CROSSCHECK_FAILED'};
 const ofi=num(c.ofi),microprice=num(c.microprice),imbalance=num(c.imb_cum_l10);
 if(ofi===null||microprice===null||microprice<=0||imbalance===null||Math.abs(imbalance)>100)return {...root,status:'NOT_CLOSED',reason:'SPECIALIST_FIELDS_MISSING'};
 return {...root,status:'CLOSED',symbol:base,symbol_id:p.symbol_id,source_ts:ts,valid_until_ts:ts+180000,identity_method:'EXACT_PROVIDER_SYMBOL_AND_HTX_PRICE_CROSSCHECK',chain_identity_verified:false,price,ofi_raw:ofi,ofi_unit:'PROVIDER_NATIVE_NOT_CROSS_VENUE_COMPARABLE',microprice,microprice_unit:'USD',depth_imbalance_10_levels_pct:imbalance,scope:'ONE_CLOSED_MINUTE_ON_HYPERLIQUID',additional_fields_only:true};
}
export function normalizeNansen(p,{base,now}){
 const root={source:'NANSEN',venue:'HYPERLIQUID',symbol:base,observed_ts:now,source_ts:null,advisory_only:true,decision_usable:false,version:SPECIALIST_CONTEXT_VERSION};
 if(!Array.isArray(p?.data)||p.data.length!==1)return {...root,status:'NOT_CLOSED',reason:'COHORT_RECORD_MISSING_OR_AMBIGUOUS'};
 const row=p.data[0],cohorts={};
 for(const name of ['smart_trader','whale','public_figure']){
  const long=num(row[name+'_longs_usd']),short=num(row[name+'_shorts_usd']),total=num(row[name+'_total_usd']);
  if(long===null||short===null||total===null||Math.min(long,short,total)<0||Math.abs(long+short-total)>Math.max(0.01,total*1e-6))continue;
  cohorts[name]={long_usd:long,short_usd:short,total_usd:total};
 }
 return {...root,status:Object.keys(cohorts).length?'CONTEXT_UNTIMED':'NOT_CLOSED',reason:'SOURCE_STATE_TIMESTAMP_NOT_PROVIDED',request_bound_symbol:true,cohorts,cohorts_may_overlap:true,cohorts_summed:false};
}
async function reserve(db,source,now){
 const day=new Date(now).toISOString().slice(0,10);
 // Reserve atomically BEFORE network access; failures consume the local attempt.
 const row=await db.prepare(`INSERT INTO report2_specialist_budget(source,day,attempts,blocked_until) VALUES(?1,?2,1,0) ON CONFLICT(source) DO UPDATE SET day=excluded.day, attempts=CASE WHEN report2_specialist_budget.day=excluded.day THEN report2_specialist_budget.attempts+1 ELSE 1 END WHERE report2_specialist_budget.blocked_until<=?3 AND (report2_specialist_budget.day<>excluded.day OR report2_specialist_budget.attempts<?4) RETURNING attempts`).bind(source,day,now,spec[source].cap).first();
 return !!row;
}
export async function collectSpecialistContext({db,fetch_impl,base,now,primary_price,cached={},remaining=0,vyx_api_key='',nansen_api_key=''}={}){
 const payloads=[],receipts=[];let network_calls=0;
 if(remaining<1||(!vyx_api_key&&!nansen_api_key)||!/^[A-Z0-9]{1,24}$/.test(base))return {payloads,receipts,network_calls};
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_specialist_budget(source TEXT PRIMARY KEY,day TEXT NOT NULL,attempts INTEGER NOT NULL,blocked_until INTEGER NOT NULL)`).run();
 let vyx=cached.VYX;
 for(const source of ['VYX','NANSEN']){
  const key=source==='VYX'?vyx_api_key:nansen_api_key;
  if(!key||cached[source]||network_calls>=remaining)continue;
  // Nansen's symbol-only request is limited to a just-verified HL context.
  if(source==='NANSEN'&&!(vyx?.status==='CLOSED'&&vyx.symbol===base&&vyx.valid_until_ts>=now&&num(primary_price)>0&&Math.abs(vyx.price/primary_price-1)<=0.03))continue;
  if(!await reserve(db,source,now)){receipts.push({source,status:'LOCAL_BUDGET_OR_BACKOFF',actual_http:0});continue;}
  network_calls++;
  let payload,ttl=spec[source].ttl;
  try{
   const url=source==='VYX'?`https://api.vyx.app/v1/symbols/${encodeURIComponent(base)}/candles?interval=1m&limit=2`:'https://api.nansen.ai/api/v1/tgm/position-intelligence';
   const response=await fetch_impl(url,{method:source==='VYX'?'GET':'POST',headers:source==='VYX'?{Authorization:'Bearer '+key,Accept:'application/json'}:{apikey:key,'Content-Type':'application/json'},...(source==='NANSEN'?{body:JSON.stringify({token_address:base})}:{}),redirect:'error',signal:AbortSignal.timeout(12000)});
   let body;try{body=await response.json();}catch{}
   if(response.ok){payload=source==='VYX'?normalizeVyx(body,{base,now,primary_price}):normalizeNansen(body,{base,now});}
   else{
    const quota=response.status===429||body?.code==='insufficient_credits';
    const retry=num(response.headers?.get?.('Retry-After'));
    ttl=quota?Math.max(60000,Math.min(86400000,(retry??3600)*1000)):[401,403].includes(response.status)?21600000:300000;
    payload={source,status:quota?'PROVIDER_QUOTA':[401,403].includes(response.status)?'ACCESS_DENIED':'SOURCE_ERROR',http_status:response.status,observed_ts:now,decision_usable:false};
    if(quota||[401,403].includes(response.status))await db.prepare('UPDATE report2_specialist_budget SET blocked_until=?2 WHERE source=?1').bind(source,now+ttl).run();
   }
  }catch{payload={source,status:'TRANSPORT_ERROR',observed_ts:now,decision_usable:false};ttl=300000;}
  payloads.push({source,payload,ttl});receipts.push({source,status:payload.status,actual_http:1});
  if(source==='VYX')vyx=payload;
 }
 return {payloads,receipts,network_calls};
}
