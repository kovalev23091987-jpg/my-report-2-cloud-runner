import fs from 'node:fs';
import assert from 'node:assert/strict';
import {measureBinanceColdPricePath} from '../runner/binance-delayed-price-history.mjs';
import {resolveBinanceColdBatchDirectories} from '../runner/binance-cold-batch-layout.mjs';
const root=process.argv[2],acquisition=JSON.parse(fs.readFileSync(root+'/acquisition.json')),results=[];
const directories=resolveBinanceColdBatchDirectories(acquisition),groups=new Map();
acquisition.archives.forEach((r,i)=>{const key=`${r.market}|${r.symbol}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({...r,directory:directories[i]});});
let closed_price_paths=0,rejected_controls=0;
for(const records of groups.values()){
 const {market,symbol}=records[0];records.sort((a,b)=>a.month.localeCompare(b.month));
 const archives=records.map(r=>({manifest:JSON.parse(fs.readFileSync(`${root}/${r.directory}/qualification.json`)),payload:fs.readFileSync(`${root}/${r.directory}/qualified-price.json.gz`)}));
 const args={archives,venue:'BINANCE',market,symbol,start_ts:Date.parse(records[0].month+'-01T00:00:00Z'),as_of:Date.now()};
 for(const days of [30,60,90]){const r=measureBinanceColdPricePath({...args,end_ts:args.start_ts+days*86400000});if(r.status==='CLOSED_PRICE_PATH'){assert.equal(r.minute_count,days*1440);closed_price_paths++;}results.push({market,symbol,...r,days});}
 const end_ts=args.start_ts+90*86400000;
 const controls=[['foreign_execution_venue',{...args,venue:'HTX',end_ts}],['other_market',{...args,market:market==='spot'?'usd_m_futures':'spot',end_ts}],['other_symbol',{...args,symbol:symbol==='ETHUSDT'?'BTCUSDT':'ETHUSDT',end_ts}],['historical_unavailable',{...args,as_of:Math.max(...archives.map(a=>a.manifest.available_at))-1,end_ts}],['missing_month',{...args,archives:[archives[0],...archives.slice(2)],end_ts}],['duplicate_month',{...args,archives:[archives[0],archives[0],...archives.slice(1)],end_ts}],['tampered_payload',{...args,archives:[{...archives[0],payload:Buffer.from('invalid')},...archives.slice(1)],end_ts}],['live_role',{...args,archives:[{...archives[0],manifest:{...archives[0].manifest,live_quote_eligible:true}},...archives.slice(1)],end_ts}]];
 for(const [name,input]of controls){const r=measureBinanceColdPricePath(input);assert.equal(r.status,'NOT_CLOSED',name);rejected_controls++;results.push({control:name,market,symbol,...r});}
}
fs.writeFileSync(root+'/current-consumer-results.json',JSON.stringify({schema:'BINANCE_MONTHLY_CONNECTED_CURRENT_CONSUMER_V1',results,groups:groups.size,closed_price_paths,rejected_controls,htx_asset_identity_qualified:false,actual_ENTRY:false,all102_history_complete:false,project_complete:false},null,2)+'\n');console.log(JSON.stringify({groups:groups.size,closed_price_paths,rejected_controls,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,actual_ENTRY:false,project_complete:false}));
