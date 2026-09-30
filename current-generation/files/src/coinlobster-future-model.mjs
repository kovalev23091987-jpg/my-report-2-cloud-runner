import {createHash} from 'node:crypto';
const TTL=30*60_000,DAY=24*60*60_000;
const clean=x=>String(x??'').trim(),num=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
export function parseCoinLobsterMcpResponse(body){
 const frames=clean(body).startsWith('{')?[body]:body.split('\n').filter(s=>s.startsWith('data:')).map(s=>s.slice(5).trim());
 for(const frame of frames){try{const data=JSON.parse(frame);if(data.error)return{available:false,error:data.error.message};const result=data.result;if(result?.structuredContent)return result.structuredContent;for(const row of result?.content??[])if(row.type==='text'){try{return JSON.parse(row.text);}catch{}}}catch{}}
 return{available:false,error:'MCP_RESPONSE_SCHEMA_NOT_CLOSED'};
}
export function normalizeCoinLobsterFuture(payload,{contract,now=Date.now()}={}){
 const base=clean(contract).replace(/-USDT$/,'').toUpperCase(),responseBase=clean(payload?.coin??payload?.pair).toUpperCase().split('/')[0];
 const timestamp=Date.parse(payload?.as_of??payload?.headline_as_of??''),clock=Number.isFinite(timestamp)&&timestamp<=now+60_000&&now-timestamp<=5*60_000;
 const common={source:'COINLOBSTER_FUTURE_MODEL',contract,role:'PROJECTED_PROVIDER_MODEL',observed_ts:now,source_ts:Number.isFinite(timestamp)?timestamp:null,source_age_ms:Number.isFinite(timestamp)?now-timestamp:null,source_clock_current:clock,delayed:payload?.delayed??null,access_note:payload?.access_note??null,network_calls:0,levels:[],provider_model_not_position_census:true,internal_only:true};
 if(responseBase!==base)return{...common,status:'IDENTITY_NOT_CLOSED',reason:'EXACT_RESPONSE_COIN_REQUIRED'};
 if(payload?.available===false)return{...common,status:'SOURCE_NOT_AVAILABLE',reason:payload.error??payload.note??'PROVIDER_DATA_UNAVAILABLE'};
 if(payload?.detail==='headline')return{...common,status:'PARTIAL_FUTURE_HEADLINE_ONLY',nearest_side:Number.isFinite(timestamp)&&timestamp<=now&&['above','below'].includes(payload?.headline?.nearest_liquidation_zone)?payload.headline.nearest_liquidation_zone:null,full_answer_in_seconds:num(payload?.full_answer_in_seconds),reason:'NO_NUMERIC_FORWARD_LEVELS_IN_CURRENT_ACCESS'};
 if(!clock)return{...common,status:'SOURCE_CLOCK_NOT_CURRENT',reason:'FORWARD_MODEL_TIMESTAMP_REQUIRED'};
 const projection=payload?.projection,reference=num(projection?.reference_price??projection?.current_price);
 if(!Array.isArray(projection?.levels)||projection.levels.length>500||!(reference>0))return{...common,status:payload?.warming?'WARMING':'SCHEMA_NOT_CLOSED',reason:'EXPLICIT_FORWARD_PRICE_SIDE_NOTIONAL_SCHEMA_REQUIRED'};
 const rows=projection.levels.filter(r=>num(r?.notional_usd)>0);
 if(!rows.every(r=>num(r.price)>0&&(r.side==='long'&&r.price<reference||r.side==='short'&&r.price>reference)))return{...common,status:'SCHEMA_NOT_CLOSED',reason:'FORWARD_SIDE_GEOMETRY_NOT_CLOSED'};
 return{...common,status:'CLOSED',reference_price:reference,levels:rows.map(r=>({price:Number(r.price),side:r.side,notional_usd:Number(r.notional_usd),distance_pct:(Number(r.price)/reference-1)*100,price_quote:'USD',price_semantics:'PROVIDER_MODEL_PRICE_BIN'}))};
}
export async function collectCoinLobsterFutureModel({db,fetch_impl=globalThis.fetch,contract,run_id,now=Date.now(),request_admit=null,max_http=1}={}){
 const normalized=clean(contract).normalize('NFC').toUpperCase(),base=normalized.replace(/-USDT$/,'');
 const no=(status,reason)=>({source:'COINLOBSTER_FUTURE_MODEL',contract:normalized,role:'PROJECTED_PROVIDER_MODEL',status,reason,network_calls:0,levels:[],internal_only:true});
 if(!/^[\p{L}\p{N}]+-USDT$/u.test(normalized)||['BTC','ETH'].includes(base))return no('EXCLUDED_BY_USER_POLICY','NO_FORWARD_MAP_FOR_BTC_ETH_OR_INVALID_CONTRACT');
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_coinlobster_future_cache(contract TEXT PRIMARY KEY,expires_ts INTEGER NOT NULL,payload_json TEXT NOT NULL)`).run();
 const cached=await db.prepare(`SELECT payload_json FROM report2_coinlobster_future_cache WHERE contract=?1 AND expires_ts>?2`).bind(normalized,now).first();
 if(cached){try{return{...JSON.parse(cached.payload_json),cache_status:'HIT',network_calls:0};}catch{}}
 if(!(Number(max_http)>0))return no('DEFERRED_HTTP_ENVELOPE','NATIVE_FUTURE_LEVELS_USED_PROTECTED_ENVELOPE');
 if(request_admit){const grant=request_admit({logical_request_id:`COINLOBSTER_FUTURE:${run_id}:${normalized}`,lane:'background',attempts:1});if(!grant.allowed||grant.duplicate)return no('DEFERRED_HTTP_ENVELOPE','UNIFIED_HTTP_NOT_ADMITTED');}
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_coinlobster_future_requests(request_id TEXT PRIMARY KEY,day_start_ts INTEGER NOT NULL,created_ts INTEGER NOT NULL)`).run();
 const day=Math.floor(now/DAY)*DAY,id=createHash('sha256').update(`${day}:${run_id}:${normalized}`).digest('hex');
 await db.prepare(`CREATE INDEX IF NOT EXISTS report2_coinlobster_future_day ON report2_coinlobster_future_requests(day_start_ts)`).run();
 const reserved=await db.prepare(`INSERT INTO report2_coinlobster_future_requests(request_id,day_start_ts,created_ts) SELECT ?1,?2,?3 WHERE (SELECT COUNT(*) FROM report2_coinlobster_future_requests WHERE day_start_ts=?2)<80 ON CONFLICT(request_id) DO NOTHING`).bind(id,day,now).run();
 if(Number(reserved?.meta?.changes??reserved?.changes??0)===0)return no('DEFERRED_PROVIDER_OR_DUPLICATE_LIMIT','PUBLIC_MCP_RESERVATION_NOT_NEW');
 const admission=await db.prepare(`SELECT request_id FROM report2_coinlobster_future_requests WHERE request_id=?1`).bind(id).first();if(!admission)return no('DEFERRED_PROVIDER_DAILY_LIMIT','PUBLIC_MCP_80_CALLS_PROJECT_CEILING_BELOW_100_PROVIDER_LIMIT');
 let result;
 try{const response=await fetch_impl('https://coinlobster.com/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-03-26'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'liq_zones',arguments:{pair:`${base}/USDT`}}}),signal:AbortSignal.timeout(8000)});
  const body=await response.text();if(body.length>512000)throw Error('MCP_RESPONSE_TOO_LARGE');result=response.ok?normalizeCoinLobsterFuture(parseCoinLobsterMcpResponse(body),{contract:normalized,now:Date.now()}):no('SOURCE_HTTP_ERROR',`HTTP_${response.status}`);result.http_status=response.status;
 }catch(e){result=no('SOURCE_ERROR',String(e.message).slice(0,160));}
 result.network_calls=1;result.cache_status='REFRESHED';const ttl=result.status==='CLOSED'?5*60_000:result.full_answer_in_seconds>0?Math.min(TTL,Math.max(60_000,result.full_answer_in_seconds*1000)):TTL;
 await db.prepare(`INSERT INTO report2_coinlobster_future_cache(contract,expires_ts,payload_json) VALUES(?1,?2,?3) ON CONFLICT(contract) DO UPDATE SET expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`).bind(normalized,now+ttl,JSON.stringify(result)).run();return result;
}
export function formatCoinLobsterFutureLines(context){
 if(!context)return[];
 if(context.status==='CLOSED'&&context.levels?.length)return['CoinLobster: модельные будущие уровни источника.',...['short','long'].map(side=>{const rows=context.levels.filter(r=>r.side===side).sort((a,b)=>b.notional_usd-a.notional_usd).slice(0,4);return `CoinLobster — ${side==='short'?'выше':'ниже'}: ${rows.length?rows.map(r=>`${Number(r.price.toPrecision(10))} USD (${r.distance_pct>0?'+':''}${r.distance_pct.toFixed(1)}%); модельный объём ${Number(r.notional_usd.toPrecision(6))} USD`).join(', '):'уровни не получены'}.`;})];
 if(context.status==='PARTIAL_FUTURE_HEADLINE_ONLY')return[`CoinLobster: ${context.source_clock_current===false?'устаревшая':'предварительная'} модельная подсказка${context.source_ts?` от ${new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(context.source_ts))} МСК`:''}${context.nearest_side?` — крупнейшая ближайшая зона ${context.nearest_side==='below'?'ниже':'выше'} цены`:''}; числовые уровни и объёмы не предоставлены.`];
 return['CoinLobster: числовая карта будущих ликвидаций не получена; причина сохранена в проверке источников.'];
}
