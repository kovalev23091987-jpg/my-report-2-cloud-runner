import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const moduleURL=name=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${name}`):new URL(`../files/src/${name}`,import.meta.url);
const {loadN10ReusedVenuePaths}=await import(moduleURL('htx-technical-structure.mjs'));
const {consumeBlockResultContext}=await import(moduleURL('block-result-context.mjs'));
const sample=JSON.parse(fs.readFileSync(new URL('./fixtures/n10-reused-original-15m-samples.json',import.meta.url))).find(row=>row.venue==='BITGET');
const h=sample.htx_window,first=sample.bars[0].split('|').map(Number),start=h.window_end_ts-240*60000;
const make=(ts,o,hi,lo,cl,activity)=>[String(ts),String(o),String(hi),String(lo),String(cl),String(activity),'0','0'];
const raw=Array.from({length:225},(_,i)=>make(start+i*60000,first[1],first[1],first[1],first[1],0));
raw.push(...sample.bars.map(line=>make(...line.split('|').map(Number))));
const payload={observed_ts:sample.cache_observed_ts,payloads:{candles:{code:'00000',data:raw}}};
// Component queue changes are explicit controls. The final useful RLC
// component and its retained fifteen price bars/clocks are unchanged.
function fixture(components,options={}){
 const reads=[];let unknown=options.unknown_before?1:0;
 const db={usageSnapshot:()=>({unknown_ops:unknown}),prepare(sql){return{bind(...args){return{async first(){reads.push({sql,args});if(options.fail_read)throw Error('CONTROLLED_CACHE_READ');if(options.unknown_after)unknown=1;return{observed_ts:sample.cache_observed_ts,expires_ts:sample.cache_expires_ts,payload_json:JSON.stringify(payload)};}};}};}};
 return{reads,db,params:{db,contract:sample.contract,flow_result:{components},primary_receipt:{check_completed:true,receipts:[{contract:sample.contract,actual_price_windows:[h]}]},now:sample.now}};
}
const copy=()=>structuredClone(sample.component);
const useful=r=>{assert.equal(r.provider_http,0);assert.equal(r.evidence.length,1);assert.equal(r.evidence[0].htx_contract,sample.contract);assert.equal(r.evidence[0].first_known_ts,sample.cache_observed_ts);assert.equal(r.evidence[0].source_ts,h.window_end_ts);assert.equal(r.evidence[0].directional_strength,null);const facts=consumeBlockResultContext({contract:sample.contract,evidence:r.evidence,now:sample.now}).facts;assert.equal(facts.length,1);assert.equal(facts[0].block_id,'N10');};
for(const [name,change] of Object.entries({
 'futures market':c=>({...c,market:'FUTURES'}),
 'unusable USDC quote':c=>({...c,quote:'USDC'}),
 'incomplete 239-minute window':c=>({...c,verified_minutes:239}),
 'wrong four-hour start':c=>({...c,window_start_ts:c.window_start_ts+60000}),
}))test(`four ${name} components cannot spend the cache-read ceiling before the retained useful RLC spot path`,async()=>{
 const x=fixture([...Array.from({length:4},()=>change(copy())),copy()]),r=await loadN10ReusedVenuePaths(x.params);
 useful(r);assert.equal(x.reads.length,1);assert.equal(r.cache_reads,1);assert.equal(r.receipts.length,1);assert.equal(x.reads[0].args[1],`FLOW:${sample.contract}:SPOT:${h.window_end_ts}`);
});
test('duplicate exact source components cost one indexed cache read and supply one original fact',async()=>{
 const x=fixture(Array.from({length:6},copy)),r=await loadN10ReusedVenuePaths(x.params);useful(r);assert.equal(r.cache_reads,1);assert.equal(x.reads.length,1);assert.equal(r.receipts.length,1);
});
test('one source read selects the component matching the unchanged cached observation clock',async()=>{
 const x=fixture([{...copy(),observed_ts:sample.cache_observed_ts-1},copy()]),r=await loadN10ReusedVenuePaths(x.params);useful(r);assert.equal(r.cache_reads,1);assert.equal(x.reads.length,1);
});
test('duplicate candidates cannot cause repeated cache reads after a measured cache-read failure',async()=>{
 const x=fixture(Array.from({length:6},copy),{fail_read:true}),r=await loadN10ReusedVenuePaths(x.params);assert.equal(r.cache_reads,1);assert.equal(x.reads.length,1);assert.equal(r.evidence.length,0);assert.equal(r.provider_http,0);
});
test('already unknown native usage refuses before the first cache query',async()=>{
 const x=fixture([copy()],{unknown_before:true}),r=await loadN10ReusedVenuePaths(x.params);assert.equal(x.reads.length,0);assert.equal(r.cache_reads,0);assert.equal(r.evidence.length,0);assert.equal(r.status,'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE');
});
test('an original fact survives newly unknown read cost and no further query follows',async()=>{
 const x=fixture(Array.from({length:6},copy),{unknown_after:true}),r=await loadN10ReusedVenuePaths(x.params);useful(r);assert.equal(r.cache_reads,1);assert.equal(x.reads.length,1);assert.equal(r.status,'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE');assert.equal(x.db.usageSnapshot().unknown_ops,1);
});
test('an inapplicable-only queue spends zero source cache reads rather than implying provider absence',async()=>{
 const x=fixture(Array.from({length:4},()=>({...copy(),market:'FUTURES'}))),r=await loadN10ReusedVenuePaths(x.params);assert.equal(r.evidence.length,0);assert.equal(r.cache_reads,0);assert.equal(x.reads.length,0);assert.equal(r.provider_http,0);assert.equal(r.status,'NO_USEFUL_EXISTING_VENUE_PATH');
});
