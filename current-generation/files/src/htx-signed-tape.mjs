import crypto from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {isExactHtxUsdtSwapKey} from './htx-contract-key.mjs';
import {installEvidenceSourceStore,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';
import {buildEvidenceV2} from './evidence-source-adapters.mjs';
export const HTX_SIGNED_TAPE_VERSION='htx-signed-tape-v1-exact-minute-raw-20261004';
const MIN=60000,DAY=1440*MIN,TTL=120000,SOURCE='HTX_SIGNED_RAW_TAPE',captured=new Map(),verifiedRings=new Map(),acquisitionReceipts=new Map(),ringReadbacks=new Map();
const n=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const close=(a,b)=>Math.abs(a-b)<=Math.max(1,Math.abs(a),Math.abs(b))*1e-9;
const STORAGE_CAP=1500000,DECODE_CAP=8000000,PACKED_VERSION='htx-signed-tape-storage-gzip-v1';
const byteHash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// Lossless storage only: the decoded ring, minute clocks, fill IDs and hashes
// are unchanged. The existing durable byte cap and DB operations stay fixed.
export function encodeSignedTapeStorage(ring){
 const bytes=Buffer.from(JSON.stringify(ring));
 if(bytes.length>DECODE_CAP)return{status:'RAW_TAPE_STORAGE_BOUND_REACHED',payload:null};
 if(bytes.length<=STORAGE_CAP)return{status:'RAW_TAPE_STORAGE_CLOSED',payload:ring,storage_bytes:bytes.length,uncompressed_bytes:bytes.length,encoding:'JSON'};
 const payload={version:PACKED_VERSION,contract:ring.contract,encoding:'GZIP_BASE64',uncompressed_bytes:bytes.length,sha256:byteHash(bytes),data:gzipSync(bytes,{mtime:0}).toString('base64')},storage_bytes=Buffer.byteLength(JSON.stringify(payload));
 return storage_bytes<=STORAGE_CAP?{status:'RAW_TAPE_STORAGE_CLOSED',payload,storage_bytes,uncompressed_bytes:bytes.length,encoding:'GZIP_BASE64'}:{status:'RAW_TAPE_STORAGE_BOUND_REACHED',payload:null};
}
export function decodeSignedTapeStorage(payload){
 if(payload?.version!==PACKED_VERSION)return payload;
 if(payload.encoding!=='GZIP_BASE64'||!Number.isSafeInteger(payload.uncompressed_bytes)||payload.uncompressed_bytes<1||payload.uncompressed_bytes>DECODE_CAP||typeof payload.sha256!=='string'||!/^[a-f0-9]{64}$/.test(payload.sha256)||typeof payload.data!=='string'||!payload.data||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload.data)||Buffer.byteLength(JSON.stringify(payload))>STORAGE_CAP)return null;
 try{
  const bytes=gunzipSync(Buffer.from(payload.data,'base64'),{maxOutputLength:DECODE_CAP});
  if(bytes.length!==payload.uncompressed_bytes||byteHash(bytes)!==payload.sha256)return null;
  const ring=JSON.parse(bytes.toString('utf8'));
  return ring?.version===HTX_SIGNED_TAPE_VERSION&&ring.contract===payload.contract?ring:null;
 }catch{return null;}
}
export function clearHtxSignedTapeSnapshots(){captured.clear();verifiedRings.clear();acquisitionReceipts.clear();ringReadbacks.clear();}
export function observeHtxSignedTape(payload,url,observed_ts=Date.now()){
 const u=new URL(url),contract=u.searchParams.get('contract_code');if(u.hostname!=='api.hbdm.com'||!isExactHtxUsdtSwapKey(contract)||payload?.status!=='ok')return;
 let type=null;
 if(u.pathname==='/linear-swap-ex/market/history/trade'&&payload.ch===`market.${contract}.trade.detail`)type='trades';
 if(u.pathname==='/linear-swap-ex/market/history/kline'&&u.searchParams.get('period')==='1min'&&payload.ch===`market.${contract}.kline.1min`)type='minutes';
 if(u.pathname==='/linear-swap-api/v1/swap_contract_info')type='metadata';if(!type)return;
 if(!captured.has(contract)&&captured.size>=8)captured.delete(captured.keys().next().value);
 const row=captured.get(contract)||{};row[type]={payload,observed_ts};captured.set(contract,row);
}
export function validateSignedMinute(minute,{contract,contract_size}={}){
 if(minute?.contract!==contract||minute.contract_size!==contract_size||!Number.isSafeInteger(minute.start_ts)||minute.start_ts%MIN||!Number.isSafeInteger(minute.factual_count)||minute.factual_count<0||!Array.isArray(minute.fills)||minute.fills.length!==minute.factual_count||new Set(minute.fills.map(r=>r.id)).size!==minute.fills.length)return false;
 const fills=minute.fills;if(fills.some(r=>typeof r.id!=='string'||!/^\d+$/.test(r.id)||!r.id||!Number.isSafeInteger(r.ts)||r.ts<minute.start_ts||r.ts>=minute.start_ts+MIN||!['buy','sell'].includes(r.side)||n(r.price)===null||r.price<=0||n(r.contracts)===null||r.contracts<=0||n(r.quote_usdt)===null||r.quote_usdt<=0||!close(r.quote_usdt,r.price*r.contracts*contract_size)))return false;
 return minute.raw_sha256===hash(fills)&&Number.isSafeInteger(minute.source_ts)&&minute.source_ts>=minute.start_ts+MIN&&Number.isSafeInteger(minute.observed_ts)&&minute.observed_ts>=minute.source_ts;
}
export function verifiedSignedMinutes({snapshot,contract,now}={}){
 const blank={status:'SOURCE_NOT_CLOSED',minutes:[],gaps:[],network_calls:0};if(!snapshot||!isExactHtxUsdtSwapKey(contract)||!Number.isSafeInteger(now))return blank;
 for(const type of ['trades','minutes','metadata']){const s=snapshot[type];if(!s||!Number.isSafeInteger(s.payload.ts)||!Number.isSafeInteger(s.observed_ts)||s.payload.ts>s.observed_ts||s.observed_ts>now||now-s.payload.ts>TTL)return blank;}
 const metadata=snapshot.metadata.payload.data?.filter(r=>r.contract_code===contract);if(metadata?.length!==1||metadata[0].business_type!=='swap'||metadata[0].trade_partition!=='USDT'||metadata[0].contract_status!==1||!(n(metadata[0].contract_size)>0))return blank;
 const size=metadata[0].contract_size,trades=snapshot.trades.payload.data,klines=snapshot.minutes.payload.data;if(!Array.isArray(trades)||!Array.isArray(klines)||trades.length>2000||!trades.every(r=>Array.isArray(r.data)))return blank;
 const rows=trades.flatMap(r=>r.data);if(rows.length>20000)return blank;
 const fills=rows.map(r=>({id:typeof r.id==='string'?r.id:typeof r.id==='number'&&Number.isSafeInteger(r.id)&&r.id>0?String(r.id):null,ts:r.ts,side:r.direction,price:r.price,contracts:r.amount,quote_usdt:r.trade_turnover??(r.price*r.amount*size)}));
 // A repeated exact provider fill ID invalidates the transport, rather than being silently removed.
 if(fills.some(r=>r.id===null)||new Set(fills.map(r=>r.id)).size!==fills.length)return{...blank,status:'RAW_FILL_ID_INTEGRITY_NOT_CLOSED'};
 // Reuse all factual closed minutes already returned by the existing deep
 // request, rather than discarding everything older than 45 minutes.
 // No extra endpoint, pagination, request or invented fill is introduced.
 const windowMinutes=Math.min(1440,klines.length),end=Math.floor(now/MIN)*MIN-MIN,start=end-windowMinutes*MIN,minutes=[],gaps=[];
 const bars=klines.filter(r=>Number.isSafeInteger(r.id)&&r.id*1000>=start&&r.id*1000<end);if(new Set(bars.map(b=>b.id)).size!==bars.length)return{...blank,status:'DUPLICATE_FACTUAL_MINUTE'};
 for(let ts=start;ts<end;ts+=MIN){const bar=bars.find(b=>b.id*1000===ts),raw=fills.filter(r=>r.ts>=ts&&r.ts<ts+MIN).sort((a,b)=>a.ts-b.ts||a.id.localeCompare(b.id));
  if(!bar||!Number.isSafeInteger(bar.count)||bar.count<0||bar.count!==raw.length){gaps.push({start_ts:ts,status:'EXACT_MINUTE_COUNT_NOT_CLOSED'});continue;}
  const minute={contract,contract_size:size,start_ts:ts,factual_count:bar.count,source_ts:Math.max(snapshot.trades.payload.ts,snapshot.minutes.payload.ts),observed_ts:Math.max(snapshot.trades.observed_ts,snapshot.minutes.observed_ts),fills:raw,raw_sha256:hash(raw)};
  if(validateSignedMinute(minute,{contract,contract_size:size}))minutes.push(minute);else gaps.push({start_ts:ts,status:'RAW_MINUTE_PAYLOAD_NOT_CLOSED'});
 }
 return{status:minutes.length?'VERIFIED_RAW_MINUTES':'NO_VERIFIED_RAW_MINUTE',contract,contract_size:size,minutes,gaps,network_calls:0};
}
export function mergeSignedTape({previous,acquisition,now}={}){
 if(!acquisition?.minutes?.length)return{status:acquisition?.status||'NO_VERIFIED_RAW_MINUTE',ring:null};
 const contract=acquisition.contract,size=acquisition.contract_size,byMinute=new Map();
 if(!Number.isSafeInteger(now)||!isExactHtxUsdtSwapKey(contract)||!(n(size)>0)||acquisition.minutes.length>1440||new Set(acquisition.minutes.map(m=>m.start_ts)).size!==acquisition.minutes.length||!acquisition.minutes.every(m=>m.observed_ts<=now&&m.source_ts<=now&&validateSignedMinute(m,{contract,contract_size:size})))return{status:'ACQUIRED_RAW_TAPE_INTEGRITY_NOT_CLOSED',ring:null};
 if(previous){if(previous.version!==HTX_SIGNED_TAPE_VERSION||previous.contract!==contract||previous.contract_size!==size||!Array.isArray(previous.minutes)||previous.minutes.length>1620||new Set(previous.minutes.map(m=>m.start_ts)).size!==previous.minutes.length||!previous.minutes.every(m=>m.observed_ts<=now&&m.source_ts<=now&&validateSignedMinute(m,{contract,contract_size:size})))return{status:'SAVED_RAW_TAPE_INTEGRITY_NOT_CLOSED',ring:null};for(const m of previous.minutes)if(m.start_ts>=now-27*60*MIN)byMinute.set(m.start_ts,m);}
 for(const m of acquisition.minutes){const old=byMinute.get(m.start_ts);if(old&&old.raw_sha256!==m.raw_sha256)return{status:'CONFLICTING_COMPLETE_RAW_MINUTE',ring:null,conflict_ts:m.start_ts};byMinute.set(m.start_ts,old||m);}
 const ring={version:HTX_SIGNED_TAPE_VERSION,contract,contract_size:size,observed_ts:now,minutes:[...byMinute.values()].sort((a,b)=>a.start_ts-b.start_ts),source:'HTX_OFFICIAL_EXACT_RAW_FILLS',price_quote:'USDT',entry_authorized:false};
 let storage=encodeSignedTapeStorage(ring),discarded_minutes=0;
 if(!storage.payload){
  // The deferred 24h archive must not crowd out the required exact 4h
  // window. Drop whole older minutes only; never shorten that window or
  // replace missing minutes with a partial aggregate.
  const requiredStart=ring.minutes.at(-1).start_ts+MIN-240*MIN;
  const older=ring.minutes.filter(m=>m.start_ts<requiredStart),required=ring.minutes.filter(m=>m.start_ts>=requiredStart);
  const core={...ring,minutes:required};let best=encodeSignedTapeStorage(core);
  if(!best.payload)return{status:storage.status,ring:null};
  let low=0,high=older.length,bestMinutes=required;
  while(low<high){const count=Math.ceil((low+high)/2),candidate=[...older.slice(older.length-count),...required],encoded=encodeSignedTapeStorage({...ring,minutes:candidate});if(encoded.payload){low=count;best=encoded;bestMinutes=candidate;}else high=count-1;}
  discarded_minutes=ring.minutes.length-bestMinutes.length;ring.minutes=bestMinutes;storage=best;
 }
 return{status:'DURABLE_RAW_TAPE_WARMING',ring,storage,discarded_minutes};
}
export function signedTape24hEvidence({ring,now}={}){
 if(!ring||ring.version!==HTX_SIGNED_TAPE_VERSION||!isExactHtxUsdtSwapKey(ring.contract)||!(n(ring.contract_size)>0)||!Array.isArray(ring.minutes)||new Set(ring.minutes.map(m=>m.start_ts)).size!==ring.minutes.length||!Number.isSafeInteger(now))return{status:'NO_VERIFIED_RAW_TAPE',evidence:[]};
 const end=Math.floor(now/MIN)*MIN-MIN,start=end-DAY,rows=ring.minutes.filter(m=>m.start_ts>=start&&m.start_ts<end);
 if(rows.length!==1440||!rows.every((m,i)=>m.start_ts===start+i*MIN&&m.observed_ts<=now&&m.source_ts<=now&&validateSignedMinute(m,{contract:ring.contract,contract_size:ring.contract_size})))return{status:'WARMING_OR_GAPPED_RAW_24H',verified_minutes:rows.length,required_minutes:1440,evidence:[]};
 const fills=rows.flatMap(m=>m.fills);if(new Set(fills.map(r=>r.id)).size!==fills.length)return{status:'CROSS_MINUTE_FILL_ID_CONFLICT',evidence:[]};
 const buy=fills.filter(r=>r.side==='buy').reduce((a,r)=>a+r.quote_usdt,0),sell=fills.filter(r=>r.side==='sell').reduce((a,r)=>a+r.quote_usdt,0);
 const root=hash(rows.map(m=>({start_ts:m.start_ts,count:m.factual_count,raw_sha256:m.raw_sha256}))),evidence=buildEvidenceV2({provider_id:'HTX_SIGNED_RAW_TAPE',upstream_id:'HTX_OFFICIAL_RAW_FILLS',asset_id:`htx-futures:${ring.contract}`,htx_contract:ring.contract,block_id:'N12',metric_family:'EXACT_SIGNED_RAW_24H',origin_event_id:`${ring.contract}:${start}:${end}:${root}`,dependency_group:`HTX_RAW_24H:${ring.contract}:${end}`,source_ts:end,observed_ts:now,expires_at:end+180000,unit:'USDT',value:buy-sell,coverage_status:'EXACT_1440_RAW_MINUTES',coverage_fraction:1,extra:{window_start:start,window_end:end,raw_trade_count:fills.length,factual_trade_count:rows.reduce((a,m)=>a+m.factual_count,0),verified_minutes:1440,raw_minute_root_sha256:root,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,source_clock_policy:'IMMUTABLE_EXACT_RAW_MINUTES',not_candle_signed_estimate:true,entry_authorized:false}});
 return{status:'CLOSED_EXACT_SIGNED_RAW_24H',verified_minutes:1440,raw_trade_count:fills.length,evidence:[evidence]};
}
function retainBounded(map,contract,value){
 if(!map.has(contract)&&map.size>=8)map.delete(map.keys().next().value);
 map.set(contract,value);
}
function acquisitionClockDiagnostic(snapshot,now){
 return Object.fromEntries(['trades','minutes','metadata'].map(type=>{
  const s=snapshot?.[type],source_ts=Number.isSafeInteger(s?.payload?.ts)?s.payload.ts:null,received_ts=Number.isSafeInteger(s?.observed_ts)?s.observed_ts:null;
  const status=!s?'MISSING_CAPTURE':source_ts===null||received_ts===null?'SOURCE_CLOCK_REQUIRED':source_ts>received_ts||received_ts>now?'SOURCE_CLOCK_ORDER_NOT_CLOSED':now-source_ts>TTL?'SOURCE_CAPTURE_NOT_FRESH':'CLOCK_CLOSED';
  return[type,{status,source_ts,received_ts,age_ms:source_ts===null?null:now-source_ts}];
 }));
}
export async function persistCapturedHtxSignedTape({db,contract,now=Date.now(),db_admit,publish_verified_24h=false}={}){
 const snapshot=captured.get(contract),acquisition=verifiedSignedMinutes({snapshot,contract,now});
 const finish=result=>{
  if(isExactHtxUsdtSwapKey(contract)&&Number.isSafeInteger(now))retainBounded(acquisitionReceipts,contract,{status:result.status,failure_stage:result.failure_stage??null,observed_ts:now,new_verified_minutes:acquisition.minutes.length,unverified_recent_minutes:acquisition.gaps.length,persisted_minutes:result.persisted_minutes??null,storage_bytes:result.storage_bytes??null,storage_encoding:result.storage_encoding??null,uncompressed_bytes:result.uncompressed_bytes??null,discarded_older_minutes:result.discarded_older_minutes??0,source_clocks:acquisitionClockDiagnostic(snapshot,now),network_calls:0,internal_only:true});
  return result;
 };
 if(!acquisition.minutes.length)return finish({...acquisition,evidence:[]});
 let stage='ADMISSION';try{
 const grant=db_admit?.({rows_read:16,rows_written:4});if(grant?.allowed!==true)return finish({status:grant?.status||'RAW_TAPE_DB_ADMISSION_REQUIRED',evidence:[],network_calls:0});
 stage='INSTALL';await installEvidenceSourceStore(db);stage='READ';const cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:contract,now}),previous=decodeSignedTapeStorage(cached);
 if(cached&&!previous)return finish({status:'SAVED_RAW_TAPE_STORAGE_INTEGRITY_NOT_CLOSED',evidence:[],network_calls:0});
 stage='MERGE';const merged=mergeSignedTape({previous,acquisition,now});if(!merged.ring)return finish({...merged,evidence:[],network_calls:0});
 stage='WRITE';await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:contract,observed_ts:now,expires_ts:now+30*60*MIN,payload:merged.storage.payload});
 stage='READBACK';const saved=decodeSignedTapeStorage(await readEvidenceSourceCache(db,{source:SOURCE,asset_key:contract,now}));if(!saved||hash(saved.minutes)!==hash(merged.ring.minutes))return finish({status:'RAW_TAPE_READBACK_NOT_CLOSED',evidence:[],network_calls:0});
 retainBounded(verifiedRings,contract,saved);
 const checked=signedTape24hEvidence({ring:saved,now});
 return finish({...checked,evidence:publish_verified_24h===true?checked.evidence:[],publication_deferred:publish_verified_24h!==true,deferred_metric:'EXACT_SIGNED_RAW_24H',persisted_minutes:saved.minutes.length,new_verified_minutes:acquisition.minutes.length,unverified_recent_minutes:acquisition.gaps.length,storage_bytes:merged.storage.storage_bytes,storage_encoding:merged.storage.encoding,uncompressed_bytes:merged.storage.uncompressed_bytes,discarded_older_minutes:merged.discarded_minutes,network_calls:0,db_admission:grant,internal_only:true});
 }catch{return finish({status:'RAW_TAPE_PERSISTENCE_NOT_CLOSED',failure_stage:stage,evidence:[],network_calls:0,internal_only:true});}
}

export async function readSavedHtxSignedTape({db,contract,now=Date.now(),db_admit}={}){
 if(!db?.prepare||!isExactHtxUsdtSwapKey(contract)||!Number.isSafeInteger(now))return null;
 if(db_admit?.({rows_read:16,rows_written:0})?.allowed!==true)return null;
 // The established cache may not exist on a first run. This optional history
 // never creates tables or marks a missing window complete.
 try{
  const saved=decodeSignedTapeStorage(await readEvidenceSourceCache(db,{source:SOURCE,asset_key:contract,now}));
  // A valid immutable window already in the durable cache remains usable if
  // this deep check cannot add new complete minutes. Validation retains the
  // original per-minute clocks, IDs and counters; reading never refreshes them.
  const savedFlow=signedTapeFourHourFlow({ring:saved,contract,now});retainBounded(ringReadbacks,contract,ringClockDiagnostic(saved,contract,now,savedFlow.status));
  if(savedFlow.check_completed===true)retainBounded(verifiedRings,contract,saved);
  return saved;
 }catch{return null;}
}

export function mergeHtxSignedHistoryTrades({ring,current_trades=[],contract,contract_size,now}={}){
 const fallback=status=>({status,trades:current_trades,reused_minutes:0,reused_fills:0,source_http:0});
 if(!ring)return fallback('NO_SAVED_VERIFIED_RAW_HISTORY');
 if(current_trades?._source_truncated===true||Number(current_trades?._source_rows_dropped||0)>0)return fallback('CURRENT_RAW_TRANSPORT_NOT_COMPLETE');
 if(ring.version!==HTX_SIGNED_TAPE_VERSION||ring.contract!==contract||ring.contract_size!==contract_size||!isExactHtxUsdtSwapKey(contract)||!Number.isSafeInteger(now)||!Array.isArray(current_trades)||!Array.isArray(ring.minutes)||ring.minutes.length>1620||new Set(ring.minutes.map(m=>m.start_ts)).size!==ring.minutes.length||!ring.minutes.every(m=>m.observed_ts<=now&&m.source_ts<=now&&validateSignedMinute(m,{contract,contract_size})))return fallback('SAVED_RAW_HISTORY_NOT_CLOSED');
 const minutes=ring.minutes.filter(m=>m.start_ts>=now-27*60*MIN),fills=minutes.flatMap(m=>m.fills);
 if(fills.length>20000||new Set(fills.map(r=>r.id)).size!==fills.length)return fallback('SAVED_RAW_HISTORY_ID_OR_SIZE_NOT_CLOSED');
 const currentIds=current_trades.map(r=>typeof r.id==='string'?r.id:Number.isSafeInteger(r.id)?String(r.id):null);
 if(currentIds.some(id=>!id||!/^\d+$/.test(id))||new Set(currentIds).size!==currentIds.length)return fallback('CURRENT_RAW_HISTORY_ID_NOT_CLOSED');
 const byId=new Map(current_trades.map((r,i)=>[currentIds[i],r]));let reused=0;
 for(const f of fills){
  const current=byId.get(f.id);
  if(current){if(current.ts!==f.ts||current.direction!==f.side||!close(current.price,f.price)||!close(current.amount,f.contracts)||(current.trade_turnover!==undefined&&!close(current.trade_turnover,f.quote_usdt)))return fallback('CONFLICTING_SAVED_AND_CURRENT_FILL');continue;}
  byId.set(f.id,{id:f.id,ts:f.ts,direction:f.side,price:f.price,amount:f.contracts,trade_turnover:f.quote_usdt});reused++;
 }
 // Preserve the worker's existing 10,000-record bound and transport flags.
 if(byId.size>10000)return fallback('MERGED_RAW_HISTORY_SIZE_NOT_CLOSED');
 const trades=[...byId.values()].sort((a,b)=>a.ts-b.ts);
 Object.defineProperties(trades,{_source_truncated:{value:false},_source_rows_dropped:{value:0},_containers_scanned:{value:Number(current_trades._containers_scanned||0)},_raw_rows_scanned:{value:trades.length}});
 return{status:'VERIFIED_RAW_HISTORY_REUSED',trades,reused_minutes:minutes.length,reused_fills:reused,overlapping_equal_fills:fills.length-reused,source_http:0,source_clock_unchanged:true,full_window_completion_claimed:false};
}

export function signedTapeFourHourFlow({ring,contract,now}={}){
 const blank=status=>({status,check_completed:false,evidence:[],network_calls:0,internal_only:true,blocking_checks:[status]});
 if(!ring||ring.version!==HTX_SIGNED_TAPE_VERSION||ring.contract!==contract||!isExactHtxUsdtSwapKey(contract)||!(n(ring.contract_size)>0)||!Number.isSafeInteger(now)||!Number.isSafeInteger(ring.observed_ts)||ring.observed_ts>now||!Array.isArray(ring.minutes)||ring.minutes.length>1620||new Set(ring.minutes.map(m=>m.start_ts)).size!==ring.minutes.length)return blank('SIGNED_FLOW_EXACT_RING_REQUIRED');
 const end=Math.max(...ring.minutes.map(m=>m.start_ts))+MIN,start=end-240*MIN;
 if(!Number.isSafeInteger(end)||end>now||now-end>5*MIN)return blank('SIGNED_FLOW_WINDOW_NOT_FRESH');
 const rows=ring.minutes.filter(m=>m.start_ts>=start&&m.start_ts<end).sort((a,b)=>a.start_ts-b.start_ts);
 if(rows.length!==240||!rows.every((m,i)=>m.start_ts===start+i*MIN&&m.observed_ts<=now&&m.source_ts<=now&&validateSignedMinute(m,{contract,contract_size:ring.contract_size})))return blank('SIGNED_FLOW_240_EXACT_MINUTES_REQUIRED');
 const fills=rows.flatMap(m=>m.fills),count=rows.reduce((a,m)=>a+m.factual_count,0);
 if(count!==fills.length||count<1||new Set(fills.map(f=>f.id)).size!==count)return blank('SIGNED_FLOW_FILL_COUNTERS_OR_IDS_NOT_CLOSED');
 const buy=fills.filter(f=>f.side==='buy').reduce((a,f)=>a+f.quote_usdt,0),sell=fills.filter(f=>f.side==='sell').reduce((a,f)=>a+f.quote_usdt,0);
 if(!Number.isFinite(buy)||!Number.isFinite(sell)||!(buy+sell>0))return blank('SIGNED_FLOW_TURNOVER_NOT_CLOSED');
 const observed=Math.max(...rows.map(m=>m.observed_ts)),root=hash(rows.map(m=>({start_ts:m.start_ts,count:m.factual_count,raw_sha256:m.raw_sha256}))),physical=`HTX_RAW_FILLS:${contract}:${start}:${end}`;
 const evidence=buildEvidenceV2({provider_id:'HTX_FUTURES_RAW_FLOW',upstream_id:'HTX_OFFICIAL_RAW_FILLS',asset_id:`HTX:USDT_M_PERPETUAL:${contract}`,htx_contract:contract,block_id:'N05',metric_family:'EXACT_FUTURES_TAKER_FLOW_4H',origin_event_id:`${contract}:${start}:${end}`,dependency_group:physical,source_ts:end,observed_ts:observed,expires_at:end+5*MIN,coverage_status:'EXACT_FOUR_HOURS',coverage_fraction:1/6,unit:'USDT',value:buy-sell,directional_strength:null,risk_strength:null,extra:{physical_root_key:physical,window_start_ts:start,window_end_ts:end,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,raw_trade_count:count,factual_1m_trade_count:count,verified_minutes:240,raw_minute_root_sha256:root,source_clock_policy:'IMMUTABLE_EXACT_RAW_MINUTES',publication_freshness_ms:5*MIN,window_alignment:'LATEST_VERIFIED_CLOSED_RAW_MINUTE_INDEPENDENT_OF_HOURLY_OI',not_candle_signed_estimate:true,common_upstream_not_independent_vote:true,score_contribution:0,entry_authorized:false,nansen_required:false}});
 return{status:'CLOSED_EXACT_FUTURES_FLOW_4H',check_completed:true,network_calls:0,evidence:[evidence],receipts:[{check_completed:true,status:'CLOSED',contract,window:'4h',verified_minutes:240,raw_trade_count:count,factual_1m_trade_count:count,raw_minute_root_sha256:root,window_start_ts:start,window_end_ts:end,source_http:0}],internal_only:true};
}
function ringClockDiagnostic(ring,contract,now,status){
 const starts=ring?.contract===contract&&Array.isArray(ring.minutes)&&ring.minutes.length<=1620?ring.minutes.map(m=>m?.start_ts).filter(Number.isSafeInteger):[],end=starts.length?Math.max(...starts)+MIN:null;
 return{status:String(status).slice(0,120),observed_ts:Number.isSafeInteger(ring?.observed_ts)?ring.observed_ts:null,reported_window_end_ts:end,reported_window_age_ms:end===null?null:now-end,reported_minute_rows:Array.isArray(ring?.minutes)?ring.minutes.length:null,diagnostic_only:true,source_clock_unchanged:true};
}
export function capturedSignedTapeFourHourFlow({contract,now}={}){
 const flow=signedTapeFourHourFlow({ring:verifiedRings.get(contract),contract,now}),diagnostic=acquisitionReceipts.get(contract);
 const ring=verifiedRings.get(contract),saved_ring_diagnostic=ring?ringClockDiagnostic(ring,contract,now,flow.status):ringReadbacks.get(contract)??null;
 return{...flow,saved_ring_diagnostic,...(diagnostic?.observed_ts<=now?{raw_acquisition_diagnostic:diagnostic}:{} )};
}
