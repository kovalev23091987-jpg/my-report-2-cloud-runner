import fs from 'node:fs';
import assert from 'node:assert/strict';
import {measureBinanceColdPricePath} from '../runner/binance-delayed-price-history.mjs';
const root=process.argv[2],acquisition=JSON.parse(fs.readFileSync(root+'/acquisition.json')),results=[];
for(const market of ['spot','usd_m_futures']){
 const archives=['2026-06','2026-07','2026-08'].map(month=>({manifest:JSON.parse(fs.readFileSync(`${root}/${market}/${month}/qualification.json`)),payload:fs.readFileSync(`${root}/${market}/${month}/qualified-price.json.gz`)}));
 const args={archives,venue:'BINANCE',market,symbol:'BTCUSDT',start_ts:Date.UTC(2026,5,1),as_of:Date.now()};
 for(const days of [30,60,90]){const r=measureBinanceColdPricePath({...args,end_ts:args.start_ts+days*86400000});assert.equal(r.status,'CLOSED_PRICE_PATH',r.reason);assert.equal(r.minute_count,days*1440);results.push({...r,days});}
 const end_ts=args.start_ts+90*86400000;
 const controls=[['foreign_execution_venue',{...args,venue:'HTX',end_ts}],['other_market',{...args,market:market==='spot'?'usd_m_futures':'spot',end_ts}],['other_symbol',{...args,symbol:'ETHUSDT',end_ts}],['historical_unavailable',{...args,as_of:Date.UTC(2026,8,1),end_ts}],['missing_month',{...args,archives:[archives[0],archives[2]],end_ts}],['duplicate_month',{...args,archives:[archives[0],archives[0],archives[1]],end_ts}],['tampered_payload',{...args,archives:[{...archives[0],payload:Buffer.from('invalid')},...archives.slice(1)],end_ts}],['live_role',{...args,archives:[{...archives[0],manifest:{...archives[0].manifest,live_quote_eligible:true}},...archives.slice(1)],end_ts}]];
 for(const [name,input]of controls){const r=measureBinanceColdPricePath(input);assert.equal(r.status,'NOT_CLOSED',name);results.push({control:name,market,...r});}
}
fs.writeFileSync(root+'/current-consumer-results.json',JSON.stringify({schema:'BINANCE_MONTHLY_CONNECTED_CURRENT_CONSUMER_V1',results,actual_ENTRY:false,all102_history_complete:false,project_complete:false},null,2)+'\n');console.log(JSON.stringify({closed_price_paths:6,rejected_controls:16,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,actual_ENTRY:false,project_complete:false}));
