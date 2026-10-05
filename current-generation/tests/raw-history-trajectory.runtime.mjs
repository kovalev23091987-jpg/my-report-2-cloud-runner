import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

// Controlled regression fixtures only. No live source or acceptance claim.
const runtime=path.resolve(process.argv[2]||'runtime');
const source=fs.readFileSync(path.join(runtime,'src/worker.js'),'utf8').replace(/from (['"])\.\/([^'"\n]+)\1/g,(_,q,name)=>`from ${JSON.stringify(pathToFileURL(path.join(runtime,'src',name)).href)}`);
const api=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport { buildTrajectoryWindow, sortedTrades };\n').toString('base64'));
const {HTX_SIGNED_TAPE_VERSION,mergeHtxSignedHistoryTrades}=await import(pathToFileURL(path.join(runtime,'src/htx-signed-tape.mjs')));
const MIN=60000,END=1791192000000,START=END-240*MIN,NOW=END+30000,contract='测试1000-USDT';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const minutes=Array.from({length:241},(_,i)=>{const start_ts=START-MIN+i*MIN,fills=[{id:String(100000+i),ts:start_ts+1000,side:i%2?'buy':'sell',price:100,contracts:1,quote_usdt:100}];return{contract,contract_size:1,start_ts,factual_count:1,fills,raw_sha256:hash(fills),source_ts:NOW,observed_ts:NOW};});
const ring={version:HTX_SIGNED_TAPE_VERSION,contract,contract_size:1,observed_ts:NOW,minutes};
const current=minutes.slice(-60).flatMap(m=>m.fills).map(f=>({id:f.id,ts:f.ts,direction:f.side,price:f.price,amount:f.contracts,trade_turnover:f.quote_usdt}));
const klines=minutes.slice(1).map(m=>({ts:m.start_ts,open:100,high:101,low:99,close:100,volume_contracts:1,volume_base:1,turnover_usdt:100,trade_count:1}));
const window=trades=>api.buildTrajectoryWindow({label:'4h',startMs:START,endMs:END,klines,orderedTrades:api.sortedTrades(trades),contractSize:1,minTrades:50,oi:null});
assert.equal(window(current).order_flow.usable,false);
const params={ring,current_trades:current,contract,contract_size:1,now:NOW},merged=mergeHtxSignedHistoryTrades(params),actual=window(merged.trades);
assert.equal(merged.source_http,0);
assert.equal(actual.order_flow.usable,true);
assert.equal(actual.order_flow.cvd_delta_quality.raw_trade_count,240);
assert.equal(actual.order_flow.cvd_delta_quality.factual_1m_trade_count,240);
assert.equal(actual.order_flow.cvd_delta_quality.raw_record_integrity_complete,true);
for(const change of [r=>r.contract='FOREIGN-USDT',r=>r.contract_size=100,r=>r.minutes[20].raw_sha256='0'.repeat(64),r=>r.minutes.splice(20,1)]){
 const changed=structuredClone(ring);change(changed);
 assert.equal(window(mergeHtxSignedHistoryTrades({...params,ring:changed}).trades).order_flow.usable,false);
}
const truncated=current.slice();Object.defineProperty(truncated,'_source_truncated',{value:true});
assert.equal(window(mergeHtxSignedHistoryTrades({...params,current_trades:truncated}).trades).order_flow.usable,false);
console.log(JSON.stringify({status:'EXACT_ASSEMBLED_RAW_HISTORY_TRAJECTORY_PASS',fixture_only:true,contract,window:'4h',verified_raw_count:240,rejected_negative_cases:5,source_http:0,d1_requests:0,MAIN:0,TG:0,live_flow_acceptance:false,entry_rules_changed:false}));
