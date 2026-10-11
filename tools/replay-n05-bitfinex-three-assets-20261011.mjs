import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const root=process.argv[2]||'.',hash=b=>createHash('sha256').update(b).digest('hex');
const read=async(path,expected)=>{const b=await fs.readFile(root+'/'+path);if(hash(b)!==expected)throw Error('ORIGINAL_GZIP_HASH_MISMATCH:'+path);return JSON.parse(gunzipSync(b));};
const catalogPath='checkpoints/n05-bitfinex-pilot-38138499328/BITFINEX-CURRENT-CATALOG.json.gz';
const catalog=await read(catalogPath,'d67c9a7951a45edff51a770bac05f00efc6fc01b02a11d557d003ad04e8e3e53');
const htxPath='checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz';
const htx=await read(htxPath,'f662bdb1562bce5c19a3b7df96978b2fe27264ff271121d12d0f44b5ee94497c');
const pairs=new Set(catalog[0]),symbols=new Map(catalog[1]),labels=new Map(catalog[2]);
const start=1791706560000,end=1791720960000;
const assets=[
 {symbol:'DASH',api:'DSH',pair:'DSHUSD',label:'Dash',htx:'dash1',chain:'dash',candle_sha:'dca89cc323e3bcd7c78ec22d61bd340f6847659166e4d009ec4691a109ed850a',trade_sha:'8997947163d691ce6cdec3ea2c8aa0e894b8739ba185d444f25ffa7f740b2194'},
 {symbol:'ALGO',api:'ALG',pair:'ALGUSD',label:'Algorand',htx:'algo',chain:'algorand',candle_sha:'1ba0ebf81a0ed7ddf4f7e02b00cd1fae15b963a22c7e90739d49fb578cfb2b44',trade_sha:'b1633258d56b701419d614d1f725bd129d4a84bb73990aa1fb92ab975cd0cc90'},
 {symbol:'XMR',api:'XMR',pair:'XMRUSD',label:'Monero',htx:'xmr2',chain:'monero',candle_sha:'c2ea73a57e218c4fa2707b76293d2fff8583425ba71eb97109fc70e5d79801af',trade_sha:'deadc954682fb3ef3256c65e6d4e4f9f4accaa4457c0297b779541ebb5c99bcc'}
];
const result={schema:'N05_BITFINEX_THREE_ASSET_ORIGINAL_REPLAY_V1',source_runs:[38138499328,38138608166],window_start_ts:start,window_end_ts:end,official_market_and_alias_reference:'https://docs.bitfinex.com/reference/rest-public-conf',official_taker_side_reference:'https://docs.bitfinex.com/reference/rest-public-trades',official_candle_reference:'https://docs.bitfinex.com/reference/rest-public-candles',retained_catalog_sha256:'d67c9a7951a45edff51a770bac05f00efc6fc01b02a11d557d003ad04e8e3e53',retained_htx_identity_sha256:'f662bdb1562bce5c19a3b7df96978b2fe27264ff271121d12d0f44b5ee94497c',assets:[],sourceHTTP:0,production_adapter_connected:false,report_or_Telegram_use:false,score:0,N05_complete:false};
for(const a of assets){
 if(!pairs.has(a.pair)||a.api!==a.symbol&&symbols.get(a.api)!==a.symbol||labels.get(a.api)!==a.label)throw Error('CURRENT_OFFICIAL_ALIAS_OR_PAIR_MISMATCH:'+a.symbol);
 const row=htx.data.filter(x=>String(x.currency).toUpperCase()===a.symbol),native=row.flatMap(x=>x.chains||[]).filter(x=>x.chainType===0&&x.chain===a.htx),otherNative=row.flatMap(x=>x.chains||[]).filter(x=>x.chainType===0&&x.chain!==a.htx);
 if(row.length!==1||native.length!==1||otherNative.length)throw Error('HTX_NATIVE_ALIAS_NOT_EXACT:'+a.symbol);
 const prefix='checkpoints/n05-bitfinex-pilot-38138608166/BITFINEX-'+a.symbol+'-';
 const candles=await read(prefix+'CANDLES1M.json.gz',a.candle_sha),trades=await read(prefix+'TRADES10000.json.gz',a.trade_sha);
 if(!Array.isArray(candles)||!Array.isArray(trades)||trades.length===0||trades.length>=10000)throw Error('BOUNDED_COMPLETE_ORIGINAL_TRADES_REQUIRED:'+a.symbol);
 const map=new Map(),ids=new Set();let buy=0,sell=0,base=0;
 for(const t of trades){if(!Array.isArray(t)||t.length!==4||!Number.isSafeInteger(t[0])||ids.has(t[0])||!Number.isSafeInteger(t[1])||t[1]<start||t[1]>=end||!Number.isFinite(t[2])||t[2]===0||!Number.isFinite(t[3])||t[3]<=0)throw Error('INVALID_ORIGINAL_TRADE:'+a.symbol);ids.add(t[0]);const ts=Math.floor(t[1]/60000)*60000,v=Math.abs(t[2]),q=v*t[3],m=map.get(ts)||{volume:0,prices:[],count:0};m.volume+=v;m.prices.push(t[3]);m.count++;map.set(ts,m);base+=v;if(t[2]>0)buy+=q;else sell+=q;}
 const bars=new Map();for(const c of candles){if(!Array.isArray(c)||c.length!==6||!Number.isSafeInteger(c[0])||c[0]<start||c[0]>=end||c[0]%60000||bars.has(c[0])||!Number.isFinite(c[5])||c[5]<=0)throw Error('INVALID_ORIGINAL_CANDLE:'+a.symbol);bars.set(c[0],c);}
 let verified=0;for(let i=0;i<240;i++){const ts=start+i*60000,c=bars.get(ts),m=map.get(ts);if(Boolean(c)!==Boolean(m))throw Error('TRADE_CANDLE_MINUTE_PRESENCE_MISMATCH:'+a.symbol+':'+i);if(!c){verified++;continue;}if(Math.abs(c[5]-m.volume)>Math.max(1e-8,Math.abs(m.volume)*1e-10)||Math.abs(c[3]-Math.max(...m.prices))>1e-10||Math.abs(c[4]-Math.min(...m.prices))>1e-10)throw Error('NATIVE_MINUTE_VOLUME_OR_HIGH_LOW_MISMATCH:'+a.symbol+':'+i);verified++;}
 if(verified!==240||bars.size!==map.size)throw Error('CLOSED_WINDOW_NOT_RECONCILED:'+a.symbol);
 result.assets.push({symbol:a.symbol,contract:a.symbol+'-USDT',market:'SPOT',quote:'USD',bitfinex_pair:'t'+a.pair,official_api_symbol:a.api,official_alias:a.symbol,official_label:a.label,htx_native_alias:a.htx,htx_native_chain:a.chain,identity_source:'ORIGINAL_HTX_PRIMARY_NATIVE_ALIAS_AND_CURRENT_BITFINEX_OFFICIAL_ALIAS_LABEL_PAIR',window_start_ts:start,window_end_ts:end,verified_minutes:verified,nonzero_minutes:bars.size,trade_count:trades.length,base_volume:Number(base.toFixed(9)),buy_quote:Number(buy.toFixed(9)),sell_quote:Number(sell.toFixed(9)),candle_gzip_sha256:a.candle_sha,trade_gzip_sha256:a.trade_sha,trade_candle_base_high_low_reconciled:true,full_response_below_limit:true,production_consumer_connected:false});
}
const path=root+'/checkpoints/N05_BITFINEX_THREE_ASSET_ORIGINAL_REPLAY_20261011.json';await fs.writeFile(path,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.assets.map(a=>({symbol:a.symbol,minutes:a.verified_minutes,trades:a.trade_count,buy:a.buy_quote,sell:a.sell_quote}))));
