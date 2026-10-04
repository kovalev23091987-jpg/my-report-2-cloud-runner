// Verified schema: cloud artifact11132482902, original coverage.scanned_at.
import {seal} from './liquidation-extension/core.mjs';
import {readJson} from './liquidation-extension/io.mjs';
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const sourceClock=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1e12?v:typeof v==='string'?Date.parse(v):null;
export function normalizeTrackedBands(payload,{contract,run_id,observed_ts=Date.now()}={}){
 const symbol=String(contract??'').replace(/-USDT$/,'').toUpperCase();
 const result={source:'BYK_TRACKED_HL_BANDS',contract,run_id,role:'NATIVE_POSITION_CONTEXT',upstream_family:'HYPERLIQUID',independent_of_other_hl_sources:false,entry_eligible:false,score_eligible:false,status:'SOURCE_SCHEMA_NOT_CLOSED',data_available:false,maps:[],network_calls:0};
 const reject=status=>({...result,status});
 if(!/^[\p{L}\p{N}_:.]{1,40}-USDT$/u.test(String(contract??'').toUpperCase()))return reject('INVALID_CONTRACT');
 if(String(payload?.coin??'').toUpperCase()!==symbol)return reject('EXACT_SYMBOL_MISMATCH');
 const mark=finite(payload?.mark);
 if(!(mark>0)||!payload?.coverage)return reject('NO_EXACT_TRACKED_MARKET_REFERENCE');
 if(!(finite(payload.coverage.scanned)>0&&finite(payload.coverage.universe)>0))return reject('TRACKED_ACCOUNT_COVERAGE_NOT_CLOSED');
 const source_ts=sourceClock(payload.coverage.scanned_at);
 const bucket=finite(payload.bucket_pct);
 if(!(bucket>0&&bucket<=5))return reject('SOURCE_BUCKET_SCHEMA_NOT_CLOSED');
 if(!Number.isSafeInteger(source_ts))return reject('SOURCE_TIMESTAMP_MISSING');
 if(source_ts>observed_ts)return reject('FUTURE_SOURCE_TIMESTAMP');
 if(observed_ts-source_ts>300000)return reject('STALE_SOURCE');
 if(!Array.isArray(payload?.long)||!Array.isArray(payload?.short))return reject('SOURCE_SCHEMA_NOT_CLOSED');
 const row_count=payload.long.length+payload.short.length;
 if(row_count>2000)return reject('SOURCE_ROWS_SIZE_LIMIT');
 const zones=[];
 let invalid_rows=0;
 for(const [side,rows] of [['LONG',payload.long],['SHORT',payload.short]])for(const row of rows){
  const price=finite(row?.price),notional=finite(row?.notional_usd),positions=finite(row?.positions);
  if(!(price>0&&notional>0&&Number.isSafeInteger(positions)&&positions>0)||side==='LONG'&&price>=mark||side==='SHORT'&&price<=mark){invalid_rows++;continue;}
  zones.push({native_price:price,native_reference_price:mark,price_quote:'USD',liquidated_side:side,notional,notional_unit:'USD',position_count:positions,price_semantics:'NATIVE_LIQUIDATION_PRICE_BUCKET_CENTER',conditional_cross:true,amount_semantics:'REPORTED_OPEN_POSITION_NOTIONAL',source_ts,venue:'HYPERLIQUID',status:'USABLE_SCOPED_CONTEXT'});
 }
 const coverage={kind:'TRACKED_ACCOUNT_SAMPLE_ONLY',account_population_limit:1000,provider_coverage:payload.coverage??null,provider_totals:payload.totals??null,bucket_width_pct_of_mark:bucket,returned_bands:row_count,accepted_bands:zones.length,rejected_bands:invalid_rows,full_market_census:false,distance_limit_pct:null};
 // Keep the provider clock, sample totals and band semantics. Do not use the
 // model_comparison or historical hourly rows as future open-position levels.
 const map=seal({provider:'ByKaranteli tracked Hyperliquid',venue:'HYPERLIQUID',native_symbol:symbol,run_id,source_ts,status:zones.length?'USABLE_SCOPED_CONTEXT':'NO_VALID_BANDS_IN_TRACKED_SAMPLE',usable_for_context:zones.length>0,evidence_class:'NATIVE_ACCOUNT_LIQUIDATION_PRICES',coverage,zones});
 if(Buffer.byteLength(JSON.stringify(map))>2000000)return reject('SOURCE_RESPONSE_SIZE_LIMIT');
 return{...result,status:map.status,data_available:zones.length>0,source_ts,zone_count:zones.length,coverage,maps:zones.length?[map]:[]};
}
const collected=new Map();
export function capturedTrackedBands({contract,run_id,observed_ts=Date.now()}={}){const value=collected.get(`${run_id}:${contract}`);if(!value)return{source:'BYK_TRACKED_HL_BANDS',contract,run_id,status:'NOT_REQUESTED',data_available:false,network_calls:0,maps:[]};if(value.source_ts&&observed_ts-value.source_ts>300000)return{...value,status:'STALE_SOURCE',data_available:false,maps:[]};return value;}
function remember(value){const key=`${value.run_id}:${value.contract}`;if(collected.size>=8&&!collected.has(key))collected.delete(collected.keys().next().value);collected.set(key,value);return value;}
export async function collectTrackedBands({contract,run_id,byk_admission,request_admit,fetch_impl=globalThis.fetch,now=Date.now()}={}){
 const symbol=String(contract??'').replace(/-USDT$/,'').toUpperCase(),base={source:'BYK_TRACKED_HL_BANDS',contract,run_id,data_available:false,network_calls:0,maps:[]};
 if(collected.has(`${run_id}:${contract}`))return{...capturedTrackedBands({contract,run_id,observed_ts:now}),network_calls:0,cache_hit:true};
 if(!/^[\p{L}\p{N}_:.]{1,40}-USDT$/u.test(String(contract??'').toUpperCase()))return{...base,status:'INVALID_CONTRACT'};
 // Reuse one unused unit of the existing protected monthly reservation.
 if(byk_admission?.allowed!==true||!(Number(byk_admission.reserved_units)>=4))return{...base,status:'EXISTING_BYK_MONTHLY_RESERVATION_NOT_GRANTED'};
 const grant=typeof request_admit==='function'?request_admit({logical_request_id:`BYK_TRACKED_HL:${run_id}:${contract}`,lane:'background',attempts:1}):null;
 if(!grant?.allowed||grant.duplicate)return{...base,status:'HTTP_BUDGET_NOT_GRANTED'};
 const r=await readJson(`https://bykaranteli.com/api/public/hyperliquid-positions?coin=${encodeURIComponent(symbol)}&hours=1`,{fetch_impl,max_bytes:8000000,timeout_ms:12000});
 if(!r.ok)return remember({...base,status:r.provider_error?.message==='URL_NOT_ALLOWED'?'CLOUD_PROXY_ROUTE_NOT_ALLOWED':r.reason,network_calls:1,http_status:r.receipt?.http_status??null,source_error:r.provider_error??null});
 return remember({...normalizeTrackedBands(r.payload,{contract,run_id,observed_ts:r.receipt?.received_ts??now}),network_calls:1,http_status:r.receipt?.http_status,receipt_sha256:r.receipt?.sha256});
}
