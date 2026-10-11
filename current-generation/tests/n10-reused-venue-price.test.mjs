import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveN10ReusedVenuePathEvidence,loadN10ReusedVenuePaths,verifyN10ReusedVenuePathEvidence} from '../files/src/htx-technical-structure.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
import {finalizeCandidateBlockCoverage} from '../files/src/candidate-evidence-v2-runtime.mjs';

const samples=JSON.parse(readFileSync(new URL('./fixtures/n10-reused-original-15m-samples.json',import.meta.url)));
function fixture(sample){
 const {venue,htx_window:h,component:c}=sample,first=sample.bars[0].split('|').map(Number),start=h.window_end_ts-240*60000;
 const make=(ts,o,hi,lo,cl,activity,end)=>venue==='BINANCE'?[ts,String(o),String(hi),String(lo),String(cl),String(activity),end,'0',activity]:venue==='POLONIEX'?[String(lo),String(hi),String(o),String(cl),'0',String(activity),'0','0',activity,ts,String(cl),'MINUTE_1',ts,end]:[String(ts),String(o),String(hi),String(lo),String(cl),String(activity),'0','0'];
 const raw=Array.from({length:225},(_,i)=>{const ts=start+i*60000;return make(ts,first[1],first[1],first[1],first[1],0,ts+59999);});
 raw.push(...sample.bars.map(line=>make(...line.split('|').map(Number))));
 const payload=venue==='BITGET'?{observed_ts:sample.cache_observed_ts,payloads:{candles:{code:'00000',data:raw}}}:{observed_ts:sample.cache_observed_ts,candles:raw};
 return{contract:sample.contract,venue,component:c,htx_window:h,now:sample.now,cache:{observed_ts:sample.cache_observed_ts,expires_ts:sample.cache_expires_ts,payload}};
}
for(const sample of samples)test(`N10 reuses independently qualified ${sample.venue} original candles for ${sample.contract}`,()=>{
 const x=fixture(sample),rows=deriveN10ReusedVenuePathEvidence(x);
 assert.equal(rows.length,1);const row=rows[0];
 assert.equal(row.window_end,x.htx_window.window_end_ts);assert.equal(row.candle_count,15);assert.ok(row.active_minute_count>0);
 assert.equal(row.coverage_fraction,0);assert.equal(row.directional_strength,null);assert.equal(row.risk_strength,null);assert.equal(row.entry_authorized_by_context,false);
 assert.equal(verifyN10ReusedVenuePathEvidence(row,{now:x.now}),true);
 const context=consumeBlockResultContext({evidence:rows,contract:x.contract,now:x.now});
 assert.equal(context.facts.length,1);assert.match(context.facts[0].value,/15 закрытых минутных свечей/);
 assert.match(context.facts[0].value,/Цель, баллы и разрешение входа этим не меняются/);
 assert.equal(verifyN10ReusedVenuePathEvidence({...row,path_close:row.path_close*1.1},{now:x.now}),false);
 assert.equal(deriveN10ReusedVenuePathEvidence({...x,cache:{...x.cache,expires_ts:x.now-1}}).length,0);
});
test('N10 skips a cached venue window without any traded minute',()=>{
 const x=fixture(samples[0]);for(const row of x.cache.payload.candles)row[8]=0;
 assert.equal(deriveN10ReusedVenuePathEvidence(x).length,0);
});
test('N10 keeps a conflicting venue price separate from the common conclusion',()=>{
 const x=fixture(samples[0]);x.htx_window={...x.htx_window,open:1400,high:1410,low:1390,close:1405};
 const row=deriveN10ReusedVenuePathEvidence(x)[0];
 assert.equal(row.comparison_status,'DISJOINT_PRICE_RANGES');
 const text=consumeBlockResultContext({evidence:[row],contract:x.contract,now:x.now}).facts[0].value;
 assert.match(text,/общий вывод по двум рынкам не сформирован/);
 assert.equal(row.coverage_fraction,0);
});
test('N10 uses one indexed cache read and zero provider HTTP',async()=>{
 const x=fixture(samples[0]),key=`NATIVE_FLOW:${x.contract}:${x.htx_window.window_end_ts}`,calls=[];
 const db={prepare(sql){return{bind(...args){calls.push({sql,args});return{first:async()=>({observed_ts:x.cache.observed_ts,expires_ts:x.cache.expires_ts,payload_json:JSON.stringify(x.cache.payload)})};}}}};
 const out=await loadN10ReusedVenuePaths({db,contract:x.contract,flow_result:{components:[x.component]},primary_receipt:{check_completed:true,receipts:[{actual_price_windows:[{...x.htx_window,label:'15m'}]}]},now:x.now});
 assert.equal(out.evidence.length,1);assert.equal(out.provider_http,0);assert.equal(out.cache_reads,1);assert.equal(calls.length,1);assert.equal(calls[0].args[1],key);
});
test('N10 producer, block audit and report consumer use the same synchronized row',()=>{
 const x=fixture(samples[0]),row=deriveN10ReusedVenuePathEvidence(x)[0];
 const primary={status:'CLOSED',check_completed:true,network_calls:0,receipts:[{check_completed:true,status:'CLOSED'}],evidence:[row]};
 const result=finalizeCandidateBlockCoverage({evidence_result:{contract:x.contract,evidence:[],sources:{}},primary_sources:{PRIMARY_TECHNICAL_CONTEXT:primary},contract:x.contract,decision_ts:x.now});
 assert.equal(result.evidence.filter(v=>v.evidence_id===row.evidence_id).length,1);
 assert.equal(result.sources.PRIMARY_TECHNICAL_CONTEXT.evidence[0].evidence_id,row.evidence_id);
 assert.equal(result.block_coverage.blocks.N10.valid_context_facts,1);
 assert.equal(result.block_coverage.blocks.N10.usable_facts,0);
 const report=consumeBlockResultContext({evidence:result.evidence,contract:x.contract,now:x.now});
 assert.equal(report.facts.length,1);
 assert.match(report.facts[0].value,/закрытие относительно HTX/);
});
