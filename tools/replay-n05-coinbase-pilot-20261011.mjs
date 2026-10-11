import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const dir='checkpoints/n05-coinbase-pilot-38136755764',digest=b=>createHash('sha256').update(b).digest('hex');
const summary=JSON.parse(fs.readFileSync(dir+'/batch-summary.json'));
if(summary.run!=='38136755764'||summary.sourceHTTP!==11||summary.D1.unknown_ops!==0)throw Error('SOURCE_BATCH_ID_OR_ACCOUNTING_MISMATCH');
function original(name){const r=summary.sources.find(x=>x.name===name);if(!r||r.http_status!==200||r.status!=='RECEIVED_NOT_QUALIFIED')throw Error('MISSING_ORIGINAL:'+name);const gz=fs.readFileSync(dir+'/'+r.file),body=gunzipSync(gz);if(digest(gz)!==r.gzip_sha256||digest(body)!==r.body_sha256)throw Error('ORIGINAL_HASH:'+name);return JSON.parse(body);}
const originalHTX=fs.readFileSync('checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz');
if(digest(originalHTX)!=='f662bdb1562bce5c19a3b7df96978b2fe27264ff271121d12d0f44b5ee94497c')throw Error('HTX_ORIGINAL_HASH');
const htx=JSON.parse(gunzipSync(originalHTX)).data,products=original('COINBASE-CURRENT-PRODUCTS'),currencies=original('COINBASE-CURRENT-CURRENCIES');
const fixed=x=>{let s=String(x);if(/^\d+(?:\.\d+)?e-\d+$/i.test(s))s=Number(s).toFixed(18).replace(/0+$/,'').replace(/\.$/,'');if(!/^\d+(?:\.\d+)?$/.test(s))throw Error('INVALID_DECIMAL:'+s);const [a,b='']=s.split('.');if(b.length>18)throw Error('PRECISION_TOO_HIGH');return BigInt(a+b.padEnd(18,'0'));};
const abs=x=>x<0n?-x:x;
const expected={DASH:{alias:'dash1',network:'dash',name:'Dash'},FIL:{alias:'fil',network:'filecoin',name:'Filecoin'},TAO:{alias:'bitao',network:'bittensor',name:'Bittensor'}};
const results=[];
for(const row of summary.candidates){
 const symbol=row.symbol,x=expected[symbol];if(!x||!row.exact_primary_identity)throw Error('EXACT_PRIMARY_NOT_PROVEN:'+symbol);
 const product=products.filter(z=>z.id===symbol+'-USD'&&z.base_currency===symbol&&z.quote_currency==='USD'&&z.status==='online'&&z.trading_disabled===false);
 const currency=currencies.filter(z=>z.id===symbol&&z.name===x.name&&z.status==='online'&&z.default_network===x.network&&z.supported_networks?.some(n=>n.id===x.network&&n.status==='online'&&!n.contract_address));
 const native=htx.filter(z=>String(z.currency).toUpperCase()===symbol).flatMap(z=>z.chains||[]).filter(z=>z.chainType===0&&z.chain===x.alias);
 if(product.length!==1||currency.length!==1||native.length!==1)throw Error('CURRENT_EXACT_PRIMARY_MISMATCH:'+symbol);
 const candles=original('COINBASE-'+symbol+'-CANDLES240'),pages=row.pages.map((_,i)=>original('COINBASE-'+symbol+'-TRADES-'+(i+1)));
 if(!Array.isArray(candles)||!pages.length)throw Error('NO_ORIGINAL_WINDOW:'+symbol);
 let prior=Infinity,priorPageLast=Infinity;const all=[];
 for(const page of pages){if(!Array.isArray(page)||!page.length||page.length>1000||page[0].trade_id>=priorPageLast)throw Error('INVALID_PAGE_BOUNDARY:'+symbol);for(const t of page){if(!Number.isSafeInteger(t.trade_id)||t.trade_id>=prior||!Number.isSafeInteger(Date.parse(t.time))||!['buy','sell'].includes(t.side)||fixed(t.price)<=0n||fixed(t.size)<=0n)throw Error('INVALID_RAW_TRADE:'+symbol);prior=t.trade_id;all.push(t);}priorPageLast=page.at(-1).trade_id;}
 const start=summary.window_start_ts,end=summary.window_end_ts;if(Date.parse(all.at(-1).time)>=start)throw Error('PAGES_DO_NOT_REACH_START:'+symbol);
 const bar=new Map();for(const c of candles){if(!Array.isArray(c)||c.length!==6||!Number.isSafeInteger(c[0])||c[0]%60)throw Error('INVALID_CANDLE:'+symbol);const ts=c[0]*1000;if(ts>=start&&ts<end){if(bar.has(ts))throw Error('DUPLICATE_CANDLE:'+symbol);bar.set(ts,c);}}
 const minutes=new Map();let buy=0n,sell=0n,count=0;for(const t of all){const ts=Date.parse(t.time);if(ts<start||ts>=end)continue;const minute=Math.floor(ts/60000)*60000,b=fixed(t.size),q=b*fixed(t.price)/10n**18n,m=minutes.get(minute)||{base:0n,count:0,high:0n,low:null};m.base+=b;m.count++;const price=fixed(t.price);m.high=price>m.high?price:m.high;m.low=m.low==null||price<m.low?price:m.low;minutes.set(minute,m);if(t.side==='sell')buy+=q;else sell+=q;count++;}
 let checked=0,occupied=0,maxVolumeDifference=0n;for(let i=0;i<240;i++){const ts=start+i*60000,c=bar.get(ts),m=minutes.get(ts);if(Boolean(c)!==Boolean(m))throw Error('CANDLE_RAW_PRESENCE_MISMATCH:'+symbol+':'+ts);if(c){occupied++;const source=fixed(c[5]),difference=abs(source-m.base);if(difference>maxVolumeDifference)maxVolumeDifference=difference;if(difference>10000000000n)throw Error('CANDLE_BASE_VOLUME_MISMATCH:'+symbol+':'+ts+':'+difference);if(fixed(c[1])!==m.low||fixed(c[2])!==m.high)throw Error('CANDLE_PRICE_RANGE_MISMATCH:'+symbol+':'+ts);}checked++;}
 if(count===0||buy+sell<=0n)throw Error('NO_USEFUL_TRADE_FLOW:'+symbol);
 const total=buy+sell,component={version:'coinbase-usd-reconciled-flow-v1-20261011',contract:symbol+'-USDT',coinbase_product:symbol+'-USD',venue:'COINBASE',market:'SPOT',quote:'USD',physical_root:'COINBASE_EXCHANGE_OFFICIAL_PUBLIC_TRADES',status:'CLOSED_COINBASE_CANDLE_BASE_VOLUME_RECONCILED_FOUR_HOURS',check_completed:true,exact_asset_binding:true,identity:{chain:x.network,asset_kind:'NATIVE',native_asset_id:x.network+':mainnet',contract_or_mint:null},window_start_ts:start,window_end_ts:end,observed_ts:summary.sources.find(z=>z.name==='COINBASE-'+symbol+'-TRADES-'+row.pages.length).received_ts,verified_minutes:checked,occupied_minutes:occupied,trade_count:count,buy_quote:Number(buy)/1e18,sell_quote:Number(sell)/1e18,imbalance:Number(buy-sell)/Number(total),maker_side_inverted_to_taker:true,raw_candle_base_volume_max_difference:Number(maxVolumeDifference)/1e18,score_contribution:0,entry_authorized:false,absolute_cross_quote_turnover_summed:false,not_onchain_exchange_flows:true,raw_files:['COINBASE-'+symbol+'-CANDLES240.json.gz',...row.pages.map((_,i)=>'COINBASE-'+symbol+'-TRADES-'+(i+1)+'.json.gz')]};results.push(component);
}
const proof={schema:'N05_COINBASE_NEW_INDEPENDENT_VENUE_REPLAY_20261011_V1',source_run:38136755764,source_main:summary.main,sourceHTTP_replay:0,D1_replay:0,MAIN:0,Telegram:0,original_source_bodies_verified:summary.sources.filter(x=>x.status==='RECEIVED_NOT_QUALIFIED').length,components:results,full_240min_assets:results.map(x=>x.contract),new_venue_verified_for_use:true,production_connected:false,same_run_actual_report_or_telegram_proven:false,N05_complete:false};
fs.writeFileSync('checkpoints/N05_COINBASE_PILOT_CONSUMER_REPLAY_20261011.json',JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({status:'ORIGINAL_COINBASE_REPLAY_VERIFIED',assets:proof.full_240min_assets,original_source_bodies_verified:proof.original_source_bodies_verified,trade_counts:results.map(x=>x.trade_count)}));
