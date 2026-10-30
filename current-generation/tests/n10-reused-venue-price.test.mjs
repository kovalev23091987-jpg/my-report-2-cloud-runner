import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveN10ReusedVenuePathEvidence,loadN10ReusedVenuePaths,verifyN10ReusedVenuePathEvidence} from '../files/src/htx-technical-structure.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
import {finalizeCandidateBlockCoverage} from '../files/src/candidate-evidence-v2-runtime.mjs';

import {activeSourceSamples,sampleParams} from './n10-full-cache-inputs.mjs';
const samples=activeSourceSamples.filter(s=>s.venue!=='GATE').map(s=>{const p=sampleParams(s);return{...s,htx_window:p.htx_window,now:p.now,cache_observed_ts:p.cache.observed_ts,cache_expires_ts:p.cache.expires_ts};});
// Full original caches for BTC/AAVE; Bitget uses an explicit controlled
// retained-page event clock. No padded225bar cache is treated as complete.
const fixture=sample=>sampleParams(sample);
for(const sample of samples)test(`N10 reuses independently qualified ${sample.venue} complete cached candles for ${sample.contract}`,()=>{
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
