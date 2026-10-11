import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const root=process.argv[2]||'.';
const files=[
 ['book','checkpoints/n05-lighter-pilot-38137955037/LIGHTER-DASH-BOOK.json.gz','4b98194b2fab4d88aedaa9ae1cc0ca19e65a865f64ac5029ada92511d4b5dbc6'],
 ['details','checkpoints/n05-lighter-pilot-38137955037/LIGHTER-DASH-DETAILS.json.gz','0c06f1ffaf6cc5803869d42d244918089ce48c73f2d8f858e8f572b990275bd6'],
 ['candles','checkpoints/n05-lighter-pilot-38137955037/LIGHTER-DASH-CANDLES1M.json.gz','b230a621a61a18e6d9df31cb609a2e26e46cb4e68e43459392e02b5a4e055906'],
 ['trades','checkpoints/n05-lighter-pilot-38138046656/LIGHTER-DASH-TRADES100.json.gz','9a83983a6df4de2327179628225bc81c9f016d40efc2d56d4b0d0373f9fdee4c']
];
const hash=b=>createHash('sha256').update(b).digest('hex'),data={};
for(const [key,path,sha] of files){const bytes=await fs.readFile(root+'/'+path);if(hash(bytes)!==sha)throw Error('ORIGINAL_GZIP_HASH_MISMATCH:'+key);data[key]=JSON.parse(gunzipSync(bytes));}
const book=data.book.order_books?.filter(x=>x.market_id===127&&x.symbol==='DASH'&&x.market_type==='perp'&&x.status==='active');
const detail=data.details.order_book_details?.filter(x=>x.market_id===127&&x.symbol==='DASH'&&x.market_type==='perp'&&x.status==='active');
if(data.book.code!==200||book?.length!==1||data.details.code!==200||detail?.length!==1||data.candles.code!==200||data.candles.r!=='1m'||data.trades.code!==200)throw Error('MARKET_OR_PAYLOAD_MISMATCH');
const candles=data.candles.c,trades=data.trades.trades;
if(!Array.isArray(candles)||candles.length!==240||!Array.isArray(trades)||trades.length>=100||trades.length===0)throw Error('WINDOW_OR_TRADE_BOUND_NOT_PROVEN');
const start=candles[0].t,end=candles.at(-1).t+60000;
if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end-start!==14400000)throw Error('NOT_240_CLOSED_MINUTES');
const byMinute=new Map(),ids=new Set();let buy=0,sell=0,base=0,quote=0;
for(const t of trades){if(t.market_id!==127||t.market_symbol!=='DASH'||t.market_kind!=='perps'||!Number.isSafeInteger(t.trade_id)||ids.has(t.trade_id)||!Number.isSafeInteger(t.timestamp)||t.timestamp<start||t.timestamp>=end||!['true','false'].includes(String(t.is_maker_ask)))throw Error('TRADE_IDENTITY_OR_WINDOW');ids.add(t.trade_id);
 const size=Number(t.size),price=Number(t.price),amount=Number(t.usd_amount);if(!Number.isFinite(size)||size<=0||!Number.isFinite(price)||price<=0||!Number.isFinite(amount)||Math.abs(size*price-amount)>1e-6)throw Error('TRADE_QUOTE_NOT_RECONCILED');
 const minute=Math.floor(t.timestamp/60000)*60000,r=byMinute.get(minute)||{base:0,quote:0,count:0};r.base+=size;r.quote+=amount;r.count++;byMinute.set(minute,r);base+=size;quote+=amount;if(t.is_maker_ask)sell+=amount;else buy+=amount;
}
let nonzero=0;for(let i=0;i<240;i++){const c=candles[i],ts=start+i*60000,r=byMinute.get(ts)||{base:0,quote:0,count:0};if(c.t!==ts||!Number.isFinite(c.v)||!Number.isFinite(c.V)||Math.abs(c.v-r.base)>1e-9||Math.abs(c.V-r.quote)>1e-6)throw Error('INDEPENDENT_MINUTE_BASE_QUOTE_NOT_RECONCILED:'+i);if(c.v>0)nonzero++;}
const result={schema:'N05_LIGHTER_DASH_ORIGINAL_240MIN_REPLAY_V1',source_runs:[38137955037,38138046656],original_gzip_sha256:Object.fromEntries(files.map(([key,,sha])=>[key,sha])),asset:'DASH',lighter_market_id:127,market:'PERP',start_ts:start,end_ts:end,closed_minutes:240,trade_count:trades.length,nonzero_minutes:nonzero,base_volume:Number(base.toFixed(9)),quote_volume:Number(quote.toFixed(6)),candidate_taker_buy_quote:Number(buy.toFixed(6)),candidate_taker_sell_quote:Number(sell.toFixed(6)),trade_candle_base_quote_reconciled:true,market_id_and_symbol_bound:true,chain_or_contract_binding_from_lighter_metadata:false,official_direction_semantics_independently_verified:true,direction_reference_url:'https://github.com/elliottech/lighter-agent-kit/blob/main/references/schemas-read.md',direction_semantics:'is_maker_ask_FALSE=AGGRESSIVE_BUY;TRUE=AGGRESSIVE_SELL',production_adapter_connected:false,report_or_Telegram_use:false,qualified_for_N05:false,reason:'PRIMARY_LIGHTER_METADATA_ONLY_HAS_MARKET_SYMBOL_AND_ID;NO_VERIFIED_DASH_NATIVE_IDENTITY_BINDING',sourceHTTP:0,score:0};
const path=root+'/checkpoints/N05_LIGHTER_DASH_ORIGINAL_REPLAY_20261011.json';await fs.writeFile(path,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
