import { normalizeTimestamp } from './asset-identity.mjs';
export const BINANCE_PUBLIC_DATA_HISTORY_VERSION='binance-public-data-history-v1-20260925';
const TYPES=new Set(['trades','aggTrades','klines']);
const INTERVALS=new Set(['1m','3m','5m']);
const MARKET_ROOT={spot:'spot',usd_m_futures:'futures/um'};
const clean=v=>String(v??'').trim();
const upper=v=>clean(v).toUpperCase();
const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const pad=n=>String(n).padStart(2,'0');
function day(d){return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;}
function month(d){return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}`;}
export function buildBinanceArchiveUrl({market='spot',frequency='daily',data_type='klines',symbol,interval='1m',date}={}){
  const root=MARKET_ROOT[market];const type=clean(data_type);const sym=upper(symbol);const d=date instanceof Date?date:new Date(date);
  if(!root||!['daily','monthly'].includes(frequency)||!TYPES.has(type)||!sym||Number.isNaN(d.getTime()))return {status:'NOT_CLOSED',reason:'ARCHIVE_REQUEST_INVALID',url:null,checksum_url:null};
  if(type==='klines'&&!INTERVALS.has(interval))return {status:'NOT_CLOSED',reason:'INTERVAL_NOT_ALLOWED',url:null,checksum_url:null};
  const suffix=frequency==='daily'?day(d):month(d);const mid=type==='klines'?`/${interval}`:'';
  const file=`${sym}-${type}${type==='klines'?`-${interval}`:''}-${suffix}.zip`;
  const url=`https://data.binance.vision/data/${root}/${frequency}/${type}/${sym}${mid}/${file}`;
  return {version:BINANCE_PUBLIC_DATA_HISTORY_VERSION,status:'CLOSED',market,frequency,data_type:type,symbol:sym,interval:type==='klines'?interval:null,url,checksum_url:`${url}.CHECKSUM`,archive_delayed:true,hot_cycle_eligible:false};
}
export function parseChecksumText(value){
  const m=String(value??'').trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+?)\s*$/);return m?{status:'CLOSED',sha256:m[1].toLowerCase(),filename:m[2]}:{status:'NOT_CLOSED',reason:'CHECKSUM_FORMAT_INVALID'};
}
export function normalizeBinanceTimestamp(value,{spot=false}={}){
  // Spot public archive switched to microsecond timestamps from 2025; auto detection is mandatory.
  return normalizeTimestamp(value,{unit:'auto'});
}
export function normalizeKlineRow(row,{now=Date.now()}={}){
  if(!Array.isArray(row)||row.length<7)return {status:'NOT_CLOSED',reason:'KLINE_ROW_INVALID'};
  const openTs=normalizeBinanceTimestamp(row[0]),closeTs=normalizeBinanceTimestamp(row[6]);
  const open=finite(row[1]),high=finite(row[2]),low=finite(row[3]),close=finite(row[4]),volume=finite(row[5]),takerBuyBase=finite(row[9]);
  if(openTs.status!=='CLOSED'||closeTs.status!=='CLOSED'||![open,high,low,close,volume].every(Number.isFinite))return {status:'NOT_CLOSED',reason:'KLINE_FIELDS_INVALID'};
  const closed=closeTs.ms<now;
  return {status:closed?'CLOSED':'INCOMPLETE_CANDLE',open_ts:openTs.ms,close_ts:closeTs.ms,open,high,low,close,volume,taker_buy_base:takerBuyBase,closed};
}
export function validateClosedMinuteSeries(rows,{interval_ms=60_000,now=Date.now()}={}){
  const parsed=(Array.isArray(rows)?rows:[]).map(r=>normalizeKlineRow(r,{now}));
  if(parsed.some(r=>r.status!=='CLOSED'))return {status:'NOT_CLOSED',reason:parsed.some(r=>r.status==='INCOMPLETE_CANDLE')?'INCOMPLETE_CANDLE':'INVALID_CANDLE',rows:parsed.filter(r=>r.status==='CLOSED')};
  const sorted=[...parsed].sort((a,b)=>a.open_ts-b.open_ts);const gaps=[];
  for(let i=1;i<sorted.length;i++)if(sorted[i].open_ts-sorted[i-1].open_ts!==interval_ms)gaps.push({from:sorted[i-1].open_ts,to:sorted[i].open_ts});
  return {status:gaps.length?'NOT_CLOSED':'CLOSED',reason:gaps.length?'MINUTE_GAP':null,rows:sorted,gaps};
}
export function classifyAggressorFromArchiveTrade(row,{kind='aggTrades'}={}){
  // Binance m/isBuyerMaker means buyer is maker; aggressor is SELL when true, BUY when false.
  const flag=kind==='trades'?row?.isBuyerMaker??row?.[5]:row?.m??row?.[6];
  const price=finite(row?.p??row?.price??row?.[1]);const qty=finite(row?.q??row?.qty??row?.[2]);
  if(typeof flag!=='boolean'||!(price>0)||!(qty>=0))return {status:'NOT_CLOSED',reason:'TRADE_FIELDS_INVALID'};
  return {status:'CLOSED',aggressor:flag?'SELL':'BUY',notional:price*qty,price,qty,heuristic_only:true,accumulation_proof:false};
}
export function archiveHistoryPlan({days=30,candidates=1,market_count=2}={}){
  const d=Math.max(1,Math.min(90,Number(days)||30));const c=Math.max(1,Number(candidates)||1);const m=Math.max(1,Number(market_count)||1);
  return {version:BINANCE_PUBLIC_DATA_HISTORY_VERSION,status:'CLOSED',days:d,candidates:c,market_count:m,hot_cycle:false,archive_requests_upper_bound:d*c*m*3,storage_policy:'AGGREGATES_FEATURES_EVENTS_ONLY',persist_every_trade:false};
}
