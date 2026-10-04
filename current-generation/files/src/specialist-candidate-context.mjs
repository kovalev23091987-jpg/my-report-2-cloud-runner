import {isExactHtxUsdtSwapKey} from './htx-contract-key.mjs';
// Read-only additions. These receipts never authorize an HTX trade or alter score.
export const SPECIALIST_CONTEXT_VERSION='specialist-context-v1-20260930';
// Consumers recheck time and market binding at publication, not merely at fetch.
export function consumeSpecialistContext({sources={},contract,now,primary_price,asset_identity}={}){
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
 const flow=sources.NANSEN_FLOWS,id=flowIdentity(asset_identity,base);
 if(flow){
  const checked=normalizeNansenFlows({data:flow.buckets,pagination:{is_last_page:flow.pagination_complete}},{base,now,identity:asset_identity,window_end:flow.window_end_ts});
  const valid=flow.version===SPECIALIST_CONTEXT_VERSION&&flow.status==='CLOSED'&&flow.symbol===base&&id&&JSON.stringify(id)===JSON.stringify(flow.identity)&&flow.observed_ts<=now&&flow.observed_ts>=flow.window_end_ts&&now-flow.observed_ts<=3600000&&checked.status==='CLOSED';
  if(valid){
   const f={...common,source:'NANSEN',decision_block:'SMART_MONEY_ONCHAIN',field:'CEX_NET_FLOW_TOKENS_2H',label:'Чистый приток на CEX по меткам Nansen за два полных часа (не сигнал продажи)',value:checked.net_cex_tokens,unit:base,source_ts:checked.source_ts,window_start_ts:checked.window_start_ts,window_end_ts:checked.window_end_ts};
   blocks.exchange_flows={status:'CLOSED',decision_block:'SMART_MONEY_ONCHAIN',facts:[f],inflow_tokens:checked.inflow_cex_tokens,outflow_tokens:checked.outflow_cex_tokens,identity:id,label_authority:'NANSEN',individual_addresses_verified:false,data_may_be_revised:true,...common};facts.push(f);
  }else blocks.exchange_flows={status:'NOT_CLOSED',reason:'EXCHANGE_FLOW_IDENTITY_OR_WINDOW_INVALID',...common};
 }
 return {status:facts.length?'CONTEXT_AVAILABLE':'NOT_CLOSED',blocks,facts,no_new_hard_gate:true,no_directional_vote:true,score_contribution:0};
}
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'?null:Number.isFinite(Number(v))?Number(v):null;
// Five daily Nansen attempts were lower than the approved manual-report
// envelope and allowed repeated validation runs to starve mandatory block N05.
// Eight keeps the bounded daily ceiling aligned with REPORT2_MANUAL_RUNS_PER_DAY.
const spec={VYX:{cap:144,ttl:120000},NANSEN:{cap:8,ttl:21600000},NANSEN_FLOWS:{ttl:3600000}};
const providerFor=source=>source==='NANSEN_FLOWS'?'NANSEN':source;
function flowIdentity(identity,base){
 const aliases={bsc:'bnb',bnb:'bnb',ethereum:'ethereum',arbitrum:'arbitrum',base:'base',polygon:'polygon',optimism:'optimism',avalanche:'avalanche',solana:'solana'};
 const chain=aliases[identity?.chain],address=String(identity?.contract_or_mint||'');
 // Native tickers must not be silently replaced by wrapped contracts.
 if(!chain||['ETH','SOL','BNB','AVAX','POL','MATIC'].includes(base))return null;
 if(chain==='solana'?!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address):!/^0x[0-9a-f]{40}$/i.test(address)||/^0x(?:0{40}|e{40})$/i.test(address))return null;
 return {chain,contract_or_mint:chain==='solana'?address:address.toLowerCase()};
}
export function normalizeNansenFlows(p,{base,now,identity,window_end}={}){
 const id=flowIdentity(identity,base),end=num(window_end),root={source:'NANSEN_FLOWS',symbol:base,identity:id,observed_ts:now,source_ts:null,version:SPECIALIST_CONTEXT_VERSION,advisory_only:true,decision_usable:false};
 const fail=reason=>({...root,status:'NOT_CLOSED',reason});
 if(!id||end===null||end%3600000!==0||!Number.isFinite(now)||end>now||now-end>7200000)return fail('EXACT_CONTRACT_OR_RECENT_WINDOW_REQUIRED');
 if(!Array.isArray(p?.data)||p?.pagination?.is_last_page!==true)return fail('COMPLETE_RESPONSE_REQUIRED');
 const start=end-7200000,rows=p.data.filter(r=>Date.parse(r?.date)>=start&&Date.parse(r?.date)<end).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 if(rows.length!==2)return fail('TWO_COMPLETE_HOURS_REQUIRED');
 let incoming=0,outgoing=0;
 for(let i=0;i<2;i++){
  const r=rows[i],a=num(r.total_inflows_cex),b=num(r.total_outflows_cex);
  if(Date.parse(r.date)!==start+i*3600000||Date.parse(r.bucket_end)!==start+(i+1)*3600000||r.is_complete!==true||a===null||b===null||a<0)return fail('INCOMPLETE_OR_INVALID_HOURLY_BUCKET');
  // The live Nansen response uses negative outflows. Retain its raw sign
  // below, but represent outgoing quantity as magnitude for net=in-out.
  incoming+=a;outgoing+=Math.abs(b);
 }
 if(!Number.isFinite(incoming)||!Number.isFinite(outgoing))return fail('FLOW_AMOUNT_OVERFLOW');
 return {...root,status:'CLOSED',source_ts:end,window_start_ts:start,window_end_ts:end,inflow_cex_tokens:incoming,outflow_cex_tokens:outgoing,net_cex_tokens:incoming-outgoing,outflow_normalization:'ABSOLUTE_OUTGOING_QUANTITY_RAW_SIGN_RETAINED',unit:'TOKEN_AMOUNT',label:'exchange',label_authority:'NANSEN',pagination_complete:true,buckets:rows.map(r=>({date:r.date,bucket_end:r.bucket_end,is_complete:true,total_inflows_cex:num(r.total_inflows_cex),total_outflows_cex:num(r.total_outflows_cex)})),individual_addresses_verified:false,data_may_be_revised:true};
}
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
export async function collectSpecialistContext({db,fetch_impl,base,now,primary_price,asset_identity,cached={},remaining=0,vyx_api_key='',nansen_api_key=''}={}){
 const payloads=[],receipts=[];let network_calls=0;
 if(remaining<1||(!vyx_api_key&&!nansen_api_key)||!isExactHtxUsdtSwapKey(String(base||'')+'-USDT'))return {payloads,receipts,network_calls};
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_specialist_budget(source TEXT PRIMARY KEY,day TEXT NOT NULL,attempts INTEGER NOT NULL,blocked_until INTEGER NOT NULL)`).run();
 let vyx=cached.VYX;
 const identity=flowIdentity(asset_identity,base),windowEnd=Math.floor(now/3600000)*3600000;
 for(const source of ['NANSEN_FLOWS','VYX','NANSEN']){
  const provider=providerFor(source);
  const key=source==='VYX'?vyx_api_key:nansen_api_key;
  if(!key||cached[source]||network_calls>=remaining)continue;
  if(source==='NANSEN_FLOWS'&&!identity)continue;
  // Nansen's symbol-only request is limited to a just-verified HL context.
  if(source==='NANSEN'&&!(vyx?.status==='CLOSED'&&vyx.symbol===base&&vyx.valid_until_ts>=now&&num(primary_price)>0&&Math.abs(vyx.price/primary_price-1)<=0.03))continue;
  if(!await reserve(db,provider,now)){receipts.push({source,status:'LOCAL_BUDGET_OR_BACKOFF',actual_http:0});continue;}
  network_calls++;
  let payload,ttl=spec[source].ttl;
  try{
   const url=source==='VYX'?`https://api.vyx.app/v1/symbols/${encodeURIComponent(base)}/candles?interval=1m&limit=2`:`https://api.nansen.ai/api/v1/tgm/${source==='NANSEN_FLOWS'?'flows':'position-intelligence'}`;
   // One extra boundary bucket is requested in the SAME call. Only the
   // exact final two completed hours are admitted by the normalizer.
   const requestBody=source==='NANSEN_FLOWS'?{chain:identity.chain,token_address:identity.contract_or_mint,label:'exchange',date:{from:new Date(windowEnd-10800000).toISOString(),to:new Date(windowEnd).toISOString()},pagination:{page:1,per_page:10},order_by:[{field:'date',direction:'ASC'}]}:{token_address:base};
   const response=await fetch_impl(url,{method:source==='VYX'?'GET':'POST',headers:source==='VYX'?{Authorization:'Bearer '+key,Accept:'application/json'}:{apikey:key,'Content-Type':'application/json'},...(source!=='VYX'?{body:JSON.stringify(requestBody)}:{}),redirect:'error',signal:AbortSignal.timeout(12000)});
   let body;try{body=await response.json();}catch{}
   if(response.ok){payload=source==='VYX'?normalizeVyx(body,{base,now,primary_price}):source==='NANSEN_FLOWS'?normalizeNansenFlows(body,{base,now,identity:asset_identity,window_end:windowEnd}):normalizeNansen(body,{base,now});}
   else{
    const quota=response.status===429||['insufficient_credits','rate_limit_exceeded'].includes(body?.code);
    const header=response.headers?.get?.('Retry-After'),retry=num(header)??num(body?.retry_after)??(Number.isFinite(Date.parse(header))?Math.max(0,(Date.parse(header)-now)/1000):null);
    ttl=quota?Math.max(60000,Math.min(86400000,(retry??3600)*1000)):[401,403].includes(response.status)?21600000:300000;
    payload={source,status:quota?'PROVIDER_QUOTA':[401,403].includes(response.status)?'ACCESS_DENIED':'SOURCE_ERROR',http_status:response.status,observed_ts:now,decision_usable:false};
    if(quota||[401,403].includes(response.status))await db.prepare('UPDATE report2_specialist_budget SET blocked_until=?2 WHERE source=?1').bind(provider,now+ttl).run();
   }
  }catch{payload={source,status:'TRANSPORT_ERROR',observed_ts:now,decision_usable:false};ttl=300000;}
  payloads.push({source,payload,ttl});receipts.push({source,status:payload.status,actual_http:1});
  if(source==='VYX')vyx=payload;
 }
 return {payloads,receipts,network_calls};
}
