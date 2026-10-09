import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {readBinanceColdCandles} from '../runner/binance-delayed-price-history.mjs';
const root=process.argv[2],output=process.argv[3];fs.mkdirSync(output,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),results=[],controls=[];
for(const market of ['spot','usd_m_futures']){
 const archives=['2026-06','2026-07','2026-08'].map(month=>({manifest:JSON.parse(fs.readFileSync(`${root}/${market}/${month}/qualification.json`)),payload:fs.readFileSync(`${root}/${market}/${month}/qualified-price.json.gz`)}));
 const args={archives,venue:'BINANCE',market,symbol:'BTCUSDT',start_ts:Date.UTC(2026,5,1),as_of:Date.now()};
 for(const days of [30,60,90])for(const interval_ms of [180000,300000]){
  const r=readBinanceColdCandles({...args,end_ts:args.start_ts+days*86400000,interval_ms});assert.equal(r.status,'CLOSED_COLD_CANDLES',r.reason);assert.equal(r.candle_count,days*86400000/interval_ms);assert.equal(r.minute_count,days*1440);assert.equal(r.source_ts,null);assert.equal(r.live_quote_eligible,false);assert.equal(r.entry_authorized,false);
  const file=`${market}-${days}d-${interval_ms/60000}m.json.gz`,bytes=gzipSync(JSON.stringify(r),{mtime:0});fs.writeFileSync(path.join(output,file),bytes);const summary={...r,file,payload_sha256:hash(bytes),days};delete summary.candles;results.push(summary);
 }
 const input={...args,end_ts:args.start_ts+90*86400000,interval_ms:180000};
 const brokenRows=JSON.parse(gunzipSync(archives[0].payload));brokenRows.splice(3,1);const bad=gzipSync(JSON.stringify(brokenRows));
 const cases=[['unsupported_timeframe',{...input,interval_ms:60000}],['string_timeframe',{...input,interval_ms:'180000'}],['off_grid_start',{...input,start_ts:input.start_ts+60000}],['incomplete_last_candle',{...input,end_ts:input.end_ts-60000}],['future_availability',{...input,as_of:Math.max(...archives.map(x=>x.manifest.qualified_at))-1}],['over_90_days',{...input,end_ts:input.start_ts+91*86400000}],['missing_native_minute',{...input,archives:[{manifest:{...archives[0].manifest,qualified_price_payload_sha256:hash(bad)},payload:bad},...archives.slice(1)]}],['foreign_execution_venue',{...input,venue:'HTX'}],['mixed_market',{...input,archives:[{...archives[0],manifest:{...archives[0].manifest,market:market==='spot'?'usd_m_futures':'spot'}},...archives.slice(1)]}]];
 for(const [name,args]of cases){const r=readBinanceColdCandles(args);assert.equal(r.status,'NOT_CLOSED',name);controls.push({market,name,...r});}
}
const proof={schema:'BINANCE_DERIVED_COLD_CANDLES_CURRENT_CONSUMER_V1',head:process.env.GITHUB_SHA??null,cloud_run:Number(process.env.GITHUB_RUN_ID)||null,results,controls,closed_price_paths:results.length,rejected_controls:controls.length,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,actual_ENTRY:false,all102_history_complete:false,project_complete:false};
fs.writeFileSync(path.join(output,'derived-candles-results.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({closed_price_paths:results.length,rejected_controls:controls.length,sourceHTTP:0,D1:0,actual_ENTRY:false}));
