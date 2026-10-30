// Offline proposal for the retained HTX linear-swap 4hour response format.
// No collector, runtime import, registry conversion, database, or wall clock.
import {createHash} from 'node:crypto';

export const FOUR_HOURS=14_400_000, DAY=86_400_000, WEEK=7*DAY;
const ENDPOINT='https://api.hbdm.com/linear-swap-ex/market/history/kline';
const FIELDS=['id','open','close','high','low','amount','vol','trade_turnover','count'];
const NUM='-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?';
const FIELD=new RegExp(`^\\s*"([a-z_]+)"\\s*:\\s*(${NUM})\\s*$`);
const HEADER=new RegExp(`^\\s*\\{\\s*"ch"\\s*:\\s*("[^"\\\\]*")\\s*,\\s*"ts"\\s*:\\s*(${NUM})\\s*,\\s*"status"\\s*:\\s*"ok"\\s*,\\s*"data"\\s*:\\s*\\[([\\s\\S]*)\\]\\s*\\}\\s*$`);
const fail=reason=>{throw Error(reason);};
export const sha256=s=>createHash('sha256').update(s).digest('hex');
const positiveClock=n=>Number.isSafeInteger(n)&&n>0;

// Exact bounded decimal arithmetic. Original lexemes remain unmodified in rows;
// only derived sums use canonical decimal strings. No IEEE754 volume rounding.
function decimal(s){
 if(typeof s!=='string'||s.length>80||!new RegExp(`^${NUM}$`).test(s))fail('DECIMAL_LEXEME_REQUIRED');
 const m=s.match(/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
 const exp=Number(m[4]||0);if(!Number.isSafeInteger(exp)||Math.abs(exp)>32||(m[2]+(m[3]||'')).length>64)fail('UNSAFE_DECIMAL');
 let scale=(m[3]||'').length-exp,n=BigInt(m[2]+(m[3]||''))*(m[1]?-1n:1n);
 if(scale<0){n*=10n**BigInt(-scale);scale=0;}
 if(scale>64||n<0n||m[1])fail('NEGATIVE_OR_UNSAFE_VALUE');
 if(n>BigInt(Number.MAX_SAFE_INTEGER)*10n**BigInt(scale))fail('UNSAFE_VALUE_MAGNITUDE');
 return {n,scale};
}
function cmp(a,b){const z=Math.max(a.scale,b.scale);return a.n*10n**BigInt(z-a.scale)-b.n*10n**BigInt(z-b.scale);}
function canonical({n,scale}){let s=n.toString().padStart(scale+1,'0');if(scale)s=s.slice(0,-scale)+'.'+s.slice(-scale);return s.includes('.')?s.replace(/0+$/,'').replace(/\.$/,''):s;}
function sum(values){const parts=values.map(decimal),scale=Math.max(...parts.map(x=>x.scale));return canonical({scale,n:parts.reduce((n,x)=>n+x.n*10n**BigInt(scale-x.scale),0n)});}
function integer(s,{positive=false}={}){const d=decimal(s),q=10n**BigInt(d.scale);if(d.n%q!==0n||(positive&&d.n===0n))fail('SAFE_INTEGER_REQUIRED');return Number(d.n/q);}

// The saved endpoint returns a fixed flat numeric row grammar. Reject all other
// shapes (including duplicate keys) instead of inventing a generic JSON parser.
function flatRows(body){
 const rows=[];let offset=0;
 for(const match of body.matchAll(/\{[^{}]*\}/g)){
  if(!new RegExp(rows.length?'^\\s*,\\s*$':'^\\s*$').test(body.slice(offset,match.index)))fail('UNSUPPORTED_NATIVE_ROW_SHAPE');
  const row={};for(const part of match[0].slice(1,-1).split(',')){
   const f=part.match(FIELD);if(!f||!FIELDS.includes(f[1])||Object.hasOwn(row,f[1]))fail('NATIVE_FIELD_SET_OR_DUPLICATE');row[f[1]]=f[2];
  }
  if(Object.keys(row).length!==FIELDS.length)fail('NATIVE_FIELD_MISSING');rows.push(row);offset=match.index+match[0].length;
 }
 if(!/^\s*$/.test(body.slice(offset))||!rows.length||rows.length>1200)fail('NATIVE_ROW_BOUND_OR_SHAPE');return rows;
}

export function qualifySavedHtx4hTurnover({contract,manifest,raw_utf8,expected_raw_sha256}={}){
 if(typeof contract!=='string'||!/^([A-Z][A-Z0-9]{0,31})-USDT$/.test(contract))fail('EXACT_USDT_LINEAR_SWAP_REQUIRED');
 const m=manifest,r=m?.receipt,url=`${ENDPOINT}?contract_code=${contract}&period=4hour&size=1200`;
 if(m?.schema!=='HTX_COMPACT_90D_4H_PRICE_ONLY_V1'||m.contract!==contract||m.venue!=='HTX_USDT_LINEAR_SWAP'||m.source!=='HTX_DELAYED_KLINE_ARCHIVE_QUALIFICATION'||m.period!=='4hour'||r?.contract!==contract||r.url!==url||r.http_status!==200)fail('EXACT_NATIVE_ENDPOINT_CONTRACT_PERIOD_RECEIPT_REQUIRED');
 if(typeof raw_utf8!=='string'||Buffer.byteLength(raw_utf8)>1_500_000||Buffer.byteLength(raw_utf8)!==r.bytes||!/^([a-f0-9]{64})$/.test(expected_raw_sha256||'')||sha256(raw_utf8)!==expected_raw_sha256||r.sha256!==expected_raw_sha256||m.raw_sha256!==expected_raw_sha256)fail('EXACT_ORIGINAL_BODY_HASH_AND_BYTES_REQUIRED');
 if(!positiveClock(r.requested_ts)||!positiveClock(r.received_ts)||r.requested_ts>r.received_ts||m.attempted_ts!==r.received_ts)fail('ORIGINAL_RECEIPT_CLOCK_REQUIRED');
 const h=raw_utf8.match(HEADER);if(!h)fail('SUPPORTED_NATIVE_ENVELOPE_REQUIRED');
 if(JSON.parse(h[1])!==`market.${contract}.kline.4hour`)fail('EXACT_NATIVE_CHANNEL_REQUIRED');
 const source_ts=integer(h[2],{positive:true});if(source_ts!==m.source_ts||source_ts<r.requested_ts||source_ts>r.received_ts)fail('NATIVE_SOURCE_CLOCK_REQUIRED');
 const rawRows=flatRows(h[3]),rows=[],excluded=[],seen=new Set();let previous=-1;
 for(let i=0;i<rawRows.length;i++){
  const lex=rawRows[i],values=Object.fromEntries(FIELDS.map(k=>[k,decimal(lex[k])])),open_ts=integer(lex.id,{positive:true})*1000,end_ts=open_ts+FOUR_HOURS;
  if(!Number.isSafeInteger(end_ts)||open_ts%FOUR_HOURS!==0||open_ts>source_ts||seen.has(open_ts)||open_ts<previous)fail('NATIVE_BAR_CLOCK_GRID_ORDER_OR_DUPLICATE');
  seen.add(open_ts);previous=open_ts;integer(lex.count);
  if(['open','close','high','low'].some(k=>values[k].n===0n)||cmp(values.low,values.open)>0n||cmp(values.low,values.close)>0n||cmp(values.high,values.open)<0n||cmp(values.high,values.close)<0n||cmp(values.low,values.high)>0n)fail('NATIVE_POSITIVE_OHLC_GEOMETRY_REQUIRED');
  if(end_ts>source_ts){excluded.push({source_row_index:i,open_ts,end_ts,reason:'FORMING_AT_ORIGINAL_RESPONSE'});continue;}
  rows.push({source_row_index:i,open_ts,end_ts,native_lexemes:lex});
 }
 if(!rows.length||excluded.length>1)fail('CLOSED_NATIVE_BAR_REQUIRED');
 const gaps=[];for(let i=1;i<rows.length;i++)if(rows[i].open_ts!==rows[i-1].end_ts)gaps.push({start_ts:rows[i-1].end_ts,end_ts:rows[i].open_ts,missing_4h_bars:(rows[i].open_ts-rows[i-1].end_ts)/FOUR_HOURS});
 return {
  schema:'HTX_SAVED_NATIVE_4H_QUOTE_TURNOVER_V1',contract,venue:'HTX_USDT_LINEAR_SWAP',period:'4hour',quote_currency:'USDT',
  role:'ACTUAL_RETAINED_PROVIDER_BODY_BACKFILLED_NOT_PROSPECTIVE_EVENT',source_ts,first_known_ts:r.received_ts,
  first_known_basis:'ORIGINAL_RECORDED_RECEIPT_RECEIVED_TS_NOT_FULL_BODY_COMPLETION_ACK',
  original_receipt:{url:r.url,requested_ts:r.requested_ts,received_ts:r.received_ts,bytes:r.bytes,sha256:expected_raw_sha256},
  native_pointer_rule:'/data/{source_row_index}/{field}',native_4h_turnover_field:'trade_turnover',
  quote_turnover_semantics:'NATIVE_BOTH_SIDES_AGGREGATE_NOT_SIGNED_TAKER_FLOW',conversion_applied:false,
  original_price_only_manifest_status:m.status,original_volume_qualified:m.volume_qualified,
  saved_historical_4h_quote_turnover_qualified:true,raw_rows:rawRows.length,rows,excluded,gaps,
  live_quote_eligible:false,decision_replay_eligible:false,entry_authorized:false,score_contribution:0,production_imported:false,
 };
}

export function deriveCompleteUtcBuckets(qualified,period){
 if(qualified?.schema!=='HTX_SAVED_NATIVE_4H_QUOTE_TURNOVER_V1'||!['DAY','WEEK_MONDAY'].includes(period))fail('QUALIFIED_4H_AND_EXPLICIT_UTC_PERIOD_REQUIRED');
 const width=period==='DAY'?DAY:WEEK,anchor=period==='DAY'?0:4*DAY,groups=new Map();
 for(const r of qualified.rows){const start=Math.floor((r.open_ts-anchor)/width)*width+anchor;if(!groups.has(start))groups.set(start,[]);groups.get(start).push(r);}
 const complete=[],incomplete=[];
 for(const[start,bars]of groups){
  if(bars.length!==width/FOUR_HOURS||bars.some((r,i)=>r.open_ts!==start+i*FOUR_HOURS)||bars.at(-1).end_ts!==start+width){incomplete.push({start_ts:start,end_ts:start+width,observed_4h_bars:bars.length,expected_4h_bars:width/FOUR_HOURS,reason:'INCOMPLETE_BUCKET_NOT_ZERO_FILLED'});continue;}
  const lo=bars.reduce((a,b)=>cmp(decimal(a.native_lexemes.low),decimal(b.native_lexemes.low))<=0n?a:b),hi=bars.reduce((a,b)=>cmp(decimal(a.native_lexemes.high),decimal(b.native_lexemes.high))>=0n?a:b);
  complete.push({start_ts:start,end_ts:start+width,first_known_ts:qualified.first_known_ts,source_ts:qualified.source_ts,source_row_indices:bars.map(r=>r.source_row_index),
   open_lexeme:bars[0].native_lexemes.open,close_lexeme:bars.at(-1).native_lexemes.close,low_lexeme:lo.native_lexemes.low,high_lexeme:hi.native_lexemes.high,
   derived_quote_turnover_usdt_exact:sum(bars.map(r=>r.native_lexemes.trade_turnover)),derived_trade_count_exact:sum(bars.map(r=>r.native_lexemes.count))});
 }
 return {schema:'HTX_SAVED_4H_DERIVED_UTC_BUCKETS_V1',contract:qualified.contract,period,calendar:'UTC',origin:'DERIVED_FROM_CLOSED_NATIVE_4H_NOT_NATIVE_DAILY_OR_WEEKLY_ENDPOINT',first_known_rule:'MAX_ORIGINAL_FIRST_KNOWN_OF_ALL_REPRESENTED_ROWS_SINGLE_ORIGINAL_RECEIPT',complete,incomplete,live_quote_eligible:false,entry_authorized:false,score_contribution:0};
}
