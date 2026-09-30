import {VOLUME_PROFILE_VERSION,readReadyHtxVolumeProfile,volumeProfileSignal} from './htx-volume-profile.mjs';
import {reserveProviderMinuteUnits} from './provider-minute-ledger.mjs';
const M=60000,TTL=180000,n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const near=(a,b)=>Math.abs(a-b)<=Math.max(1e-7,Math.max(Math.abs(a),Math.abs(b))*1e-6);
const missing=(venue,reason)=>({source:venue,status:'NOT_CLOSED',reason,profiles:[],new_history_accumulated:false});
export function normalizeVenueVolumeProfiles({venue,contract,symbol,catalog_entry,trades,candles,now,window_end}={}){
 const base=String(contract||'').replace('-USDT','');if(!['BINANCE','BYBIT'].includes(venue)||symbol!==`${base}USDT`||catalog_entry?.base!==base||catalog_entry?.[venue.toLowerCase()]!==symbol)return missing(venue,'EXACT_LISTED_USDT_PERPETUAL_REQUIRED');
 const end=window_end;if(!Number.isSafeInteger(end)||end%M||end>now||now-end>TTL)return missing(venue,'FRESH_CLOSED_WINDOW_REQUIRED');
 let raw,klines,sourceTs;
 if(venue==='BINANCE'){if(!Array.isArray(trades)||!Array.isArray(candles))return missing(venue,'BINANCE_SCHEMA_REQUIRED');raw=trades.map(r=>({id:r.a,ts:n(r.T),price:n(r.p),quantity:n(r.q)}));klines=candles.map(r=>({ts:n(r[0]),open:n(r[1]),high:n(r[2]),low:n(r[3]),close:n(r[4]),base:n(r[5]),quote:n(r[7]),closed:n(r[6])<now}));sourceTs=raw.length?Math.max(...raw.map(r=>r.ts??0)):null;}
 else{if(trades?.retCode!==0||candles?.retCode!==0||trades.result?.category!=='linear'||candles.result?.category!=='linear'||candles.result?.symbol!==symbol||!Array.isArray(trades.result?.list)||!Array.isArray(candles.result?.list)||trades.result.list.some(r=>r.symbol!==symbol))return missing(venue,'BYBIT_EXACT_LINEAR_SCHEMA_REQUIRED');raw=trades.result.list.map(r=>({id:r.execId,ts:n(r.time),price:n(r.price),quantity:n(r.size)}));klines=candles.result.list.map(r=>({ts:n(r[0]),open:n(r[1]),high:n(r[2]),low:n(r[3]),close:n(r[4]),base:n(r[5]),quote:n(r[6]),closed:n(r[0])+M<=now}));sourceTs=Math.min(n(trades.time)??0,n(candles.time)??0);}
 if(sourceTs===null||sourceTs>now||now-sourceTs>TTL||raw.some(r=>!Number.isSafeInteger(r.ts)))return missing(venue,'FRESH_SOURCE_TIME_REQUIRED');
 const profiles=[],failures=[];
 for(const duration of [240,60,15]){
  const start=end-duration*M,bars=klines.filter(r=>r.ts>=start&&r.ts<end).sort((a,b)=>a.ts-b.ts),rows=raw.filter(r=>r.ts>=start&&r.ts<end),ids=new Set(),minutes=new Map();let bad=false;
  if(bars.length!==duration||!bars.every((b,i)=>b.ts===start+i*M&&b.closed)){failures.push({duration,reason:'CONTIGUOUS_CLOSED_MINUTES_REQUIRED'});continue;}
  for(const r of rows){const id=typeof r.id==='string'?r.id:Number.isSafeInteger(r.id)?String(r.id):null;if(!id||ids.has(id)||!(r.price>0&&r.quantity>0)){bad=true;break;}ids.add(id);const t=Math.floor(r.ts/M)*M,a=minutes.get(t)||{base:0,quote:0,low:Infinity,high:-Infinity};a.base+=r.quantity;a.quote+=r.price*r.quantity;a.low=Math.min(a.low,r.price);a.high=Math.max(a.high,r.price);minutes.set(t,a);}
  for(const b of bars){const a=minutes.get(b.ts)||{base:0,quote:0};if(![b.open,b.high,b.low,b.close].every(v=>v>0)||b.low>b.high||b.open<b.low||b.open>b.high||b.close<b.low||b.close>b.high||b.base===null||b.quote===null||b.base<0||b.quote<0||!near(a.base,b.base)||!near(a.quote,b.quote)||(a.base>0&&(!near(a.low,b.low)||!near(a.high,b.high))))bad=true;}
  if(bad||rows.length<20){failures.push({duration,reason:'FULL_MINUTE_VOLUME_RECONCILIATION_REQUIRED'});continue;}
  const low=Math.min(...rows.map(r=>r.price)),high=Math.max(...rows.map(r=>r.price));if(!(high>low))continue;const width=(high-low)/60,volumes=Array(60).fill(0);for(const r of rows)volumes[Math.min(59,Math.floor((r.price-low)/width))]+=r.quantity;const total=volumes.reduce((a,b)=>a+b,0),pocIndex=volumes.indexOf(Math.max(...volumes));let left=pocIndex,right=pocIndex,area=volumes[pocIndex];while(area<total*.7&&(left>0||right<59))if(right<59&&(left===0||volumes[right+1]>=volumes[left-1]))area+=volumes[++right];else area+=volumes[--left];
  profiles.push({version:VOLUME_PROFILE_VERSION,status:'CLOSED',source:venue,market:`${venue}_LINEAR_USDT_PERPETUAL`,contract,symbol,decision_block:'MARKET_STRENGTH_SPOT',method:'EXACT_TRADES_MINUTE_RECONCILED',window_start:start,window_end:end,window_minutes:duration,observed_ts:now,source_ts:sourceTs,expires_at:Math.min(end+TTL,sourceTs+TTL),coverage_fraction:1,minutes_reconciled:duration,unique_trades:rows.length,volume_unit:base,total_base_volume:total,price_low:low,price_high:high,bin_count:60,bin_width:width,volume_by_price_bin:volumes,poc:low+(pocIndex+.5)*width,val:low+left*width,vah:low+(right+1)*width,value_area_fraction:area/total,last_closed_bars:bars.slice(-3).map(({base,quote,closed,...r})=>({...r,base_volume:base})),score_eligible:true,maximum_score_points:duration===240?1.5:duration===60?1:.5,trade_count_semantics:venue==='BINANCE'?'AGGREGATE_TRADES':'INDIVIDUAL_TRADES',coverage_proof:'PER_MINUTE_BASE_QUOTE_EXTREMA',profitability_proven:false,new_history_accumulated:false});
 }
 return {source:venue,status:profiles.length?'CLOSED':'NOT_CLOSED',reason:profiles.length?null:'NO_COMPLETE_READY_WINDOW',profiles,failures,new_history_accumulated:false};
}
export function compareVolumeProfiles({primary,peers=[],contract,now,reference_price,direction}={}){
 const baseline=volumeProfileSignal(primary,{contract,now,reference_price,direction});if(baseline.status!=='CLOSED')return {status:'NOT_CLOSED',factor:0,primary,confirmations:[],conflicts:[],skipped:[]};
 const confirmations=[],conflicts=[],skipped=[],seen=new Set(['HTX_OFFICIAL']);
 for(const p of peers){if(!['BINANCE','BYBIT'].includes(p?.source)||seen.has(p.source))continue;seen.add(p.source);const s=volumeProfileSignal(p,{contract,now,reference_price,direction});if(s.status!=='CLOSED'||p.window_start!==primary.window_start||p.window_end!==primary.window_end){skipped.push({source:p.source,reason:'NON_COMPARABLE_WINDOW_OR_PRICE'});continue;}
  // Compare raw price levels; do not align them by an invented basis shift.
  const tolerance=Math.min(.005,Math.max(.001,2*Math.max(primary.bin_width,p.bin_width)/reference_price));
  const pocMatch=Math.abs(p.poc/primary.poc-1)<=tolerance,overlap=Math.max(0,Math.min(p.vah,primary.vah)-Math.max(p.val,primary.val)),union=Math.max(p.vah,primary.vah)-Math.min(p.val,primary.val),areaMatch=union>0&&overlap/union>=.6;
  const detail={source:p.source,poc:p.poc,val:p.val,vah:p.vah,poc_match:pocMatch,value_area_overlap:union?overlap/union:0,signal:s.reason};
  if(pocMatch&&areaMatch&&s.bullish_strength===baseline.bullish_strength)confirmations.push(detail);else conflicts.push(detail);
 }
 // Single venue = half influence. All agreeing venues = full influence.
 // A conflicting comparable venue neutralizes this one family (not a veto).
 const factor=conflicts.length?0:confirmations.length>=2?1:confirmations.length===1?.8:.5;
 return {status:conflicts.length?'CONFLICT':confirmations.length?'MULTI_VENUE_CONFIRMED':'SINGLE_VENUE',factor,primary,confirmations,conflicts,skipped,independent_venues:1+confirmations.length+conflicts.length,volumes_summed:false,score_counted_once:true};
}
export function selectComparableVolumeProfiles({contract,now,reference_price,direction,peer_sources={}}={}){
 const peers=Object.values(peer_sources).flatMap(r=>r?.profiles||[]);
 for(const duration of [240,60,15])for(const end of [...new Set(peers.filter(p=>p.window_minutes===duration).map(p=>p.window_end))].sort((a,b)=>b-a)){
  const primary=readReadyHtxVolumeProfile({contract,now,window_minutes:duration,window_end:end});if(primary.status!=='CLOSED')continue;const matching=peers.filter(p=>p.window_minutes===duration&&p.window_end===end);const c=compareVolumeProfiles({primary,peers:matching,contract,now,reference_price,direction});if(c.confirmations.length||c.conflicts.length)return c;
 }
 return compareVolumeProfiles({primary:readReadyHtxVolumeProfile({contract,now}),contract,now,reference_price,direction});
}
export async function collectCrossVenueVolumeProfiles({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,clock=Date.now}={}){
 const now=clock(),base=String(contract||'').replace('-USDT',''),sources={},receipts=[];let network_calls=0;
 if(!db||!/^[A-Z0-9]{1,32}-USDT$/.test(contract||''))return {sources,network_calls,status:'EXACT_CONTRACT_DB_REQUIRED'};
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_volume_profile_cache(contract TEXT NOT NULL,source TEXT NOT NULL,expires_ts INTEGER NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(contract,source))`).run();
 let cat;try{cat=await db.prepare(`SELECT payload_json FROM report2_cross_exchange_catalog WHERE catalog_id='CEX_V2' AND expires_ts>=?1 LIMIT 1`).bind(now).first();}catch{}
 let entry;try{entry=JSON.parse(cat?.payload_json).entries?.[base];}catch{}
 for(const venue of ['BINANCE','BYBIT']){
  const cached=await db.prepare(`SELECT payload_json FROM report2_volume_profile_cache WHERE contract=?1 AND source=?2 AND expires_ts>?3 LIMIT 1`).bind(contract,venue,now).first();if(cached){try{sources[venue]=JSON.parse(cached.payload_json);continue;}catch{}}
  const symbol=entry?.[venue.toLowerCase()];if(symbol!==`${base}USDT`){sources[venue]=missing(venue,'EXACT_CACHED_MARKET_REQUIRED');continue;}
  const backoff=await db.prepare(`SELECT expires_ts FROM report2_volume_profile_cache WHERE contract='*' AND source=?1 AND expires_ts>?2 LIMIT 1`).bind(venue,now).first();if(backoff){sources[venue]=missing(venue,'TEMPORARY_RATE_LIMIT');continue;}
  const grant=request_admit?.({logical_request_id:`VOLUME_PEER:${run_id}:${contract}:${venue}`,lane:'background',attempts:2});if(!grant?.allowed||grant.duplicate){sources[venue]=missing(venue,'HTTP_ADMISSION_REQUIRED');continue;}
  const rate=await reserveProviderMinuteUnits(db,{provider:venue,reservation_id:`VOLUME_PEER:${run_id}:${contract}:${venue}`,units:venue==='BINANCE'?22:2,now,cap:venue==='BINANCE'?1200:100});if(!rate.allowed){sources[venue]=missing(venue,'TEMPORARY_RATE_LIMIT');continue;}
  const end=Math.floor(now/M)*M-M,q=encodeURIComponent(symbol),urls=venue==='BINANCE'?[`https://fapi.binance.com/fapi/v1/aggTrades?symbol=${q}&limit=1000`,`https://fapi.binance.com/fapi/v1/klines?symbol=${q}&interval=1m&limit=241&endTime=${end-1}`]:[`https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=${q}&limit=1000`,`https://api.bybit.com/v5/market/kline?category=linear&symbol=${q}&interval=1&limit=241&end=${end-1}`];
  const results=await Promise.all(urls.map(async url=>{network_calls++;const c=new AbortController(),t=setTimeout(()=>c.abort(),9000);try{const r=await fetch_impl(url,{signal:c.signal,headers:{accept:'application/json'},redirect:'error'});const raw=await r.text();return {ok:r.ok,status:r.status,payload:raw.length<=4*1024*1024?JSON.parse(raw):null,retry_after:r.headers?.get?.('retry-after')};}catch{return {ok:false,status:null};}finally{clearTimeout(t);}}));
  const limited=results.find(r=>r.status===429||r.payload?.retCode===10006);let result;
  if(limited){result=missing(venue,'TEMPORARY_RATE_LIMIT');const retry=Number(limited.retry_after),until=now+Math.max(300000,Number.isFinite(retry)?retry*1000:0);await db.prepare(`INSERT INTO report2_volume_profile_cache(contract,source,expires_ts,payload_json) VALUES('*',?1,?2,?3) ON CONFLICT(contract,source) DO UPDATE SET expires_ts=MAX(expires_ts,excluded.expires_ts),payload_json=excluded.payload_json`).bind(venue,until,JSON.stringify(result)).run();}
  else result=results.every(r=>r.ok)?normalizeVenueVolumeProfiles({venue,contract,symbol,catalog_entry:entry,trades:results[0].payload,candles:results[1].payload,now:clock(),window_end:end}):missing(venue,'TEMPORARY_SOURCE_UNAVAILABLE');
  sources[venue]=result;receipts.push({source:venue,status:result.status,reason:result.reason,network_calls:2,http_status:results.map(r=>r.status)});
  const expires=result.profiles.length?Math.min(...result.profiles.map(p=>p.expires_at)):clock()+60000;await db.prepare(`INSERT INTO report2_volume_profile_cache(contract,source,expires_ts,payload_json) VALUES(?1,?2,?3,?4) ON CONFLICT(contract,source) DO UPDATE SET expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`).bind(contract,venue,expires,JSON.stringify(result)).run();
 }
 return {status:Object.values(sources).some(r=>r.status==='CLOSED')?'CLOSED':'NOT_CLOSED',sources,receipts,network_calls,maximum_http:4,new_history_accumulated:false};
}
