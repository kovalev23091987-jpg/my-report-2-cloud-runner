import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolvePublishedCalendarReference} from '../files/src/published-token-calendar.mjs';
import {collectEvidenceRouteBlock,orderEvidenceDependencyRoutes,evidenceRouteObservationNow} from '../files/src/candidate-evidence-v2-runtime.mjs';
const gz=fs.readFileSync(new URL('./fixtures/actual-n01-references-37401024554.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(gz).digest('hex'),'d2ad22eebcfc5e1be43684964f88e25bf3c9e9bfdf61f9a21e5e37528ed37cff');
const bytes=gunzipSync(gz);assert.equal(createHash('sha256').update(bytes).digest('hex'),'f0da0b8b79eb6436482d21efba7bb8cedefb1ff7ecd28702cf8e4317c36fdd56');
const actual=JSON.parse(bytes);
const identity=r=>({chain:r.contract==='OKB-USDT'?'ethereum':'bsc',contract_or_mint:r.url.split('/').at(-1)});
const dbFor=r=>({prepare:sql=>({bind:(...args)=>({first:async()=>args[0]==='COINGECKO_SECTOR'&&args[1]===r.asset_key&&r.expires_ts>=args[2]?{observed_ts:r.observed_ts,expires_ts:r.expires_ts,payload_json:JSON.stringify(r.payload)}:null})})});
test('actual same-run exact token metadata is unavailable before receipt and reusable afterward with original clock',async()=>{
 for(const r of actual.references){
  const base={db:dbFor(r),contract:r.contract,asset_identity:identity(r)};
  assert.equal(await resolvePublishedCalendarReference({...base,now:r.payload.received_ts-1}),null);
  const ref=await resolvePublishedCalendarReference({...base,now:r.decision_ts});
  assert.equal(ref.coin_id,r.contract==='OKB-USDT'?'okb':'niu-lai');
  assert.equal(ref.metadata_received_ts,r.payload.received_ts);assert.equal(ref.metadata_body_sha256,r.body_sha256);
  assert.equal(ref.method,'VALIDATED_ALREADY_RECEIVED_EXACT_COINGECKO_ADDRESS_METADATA');
  assert.equal(await resolvePublishedCalendarReference({...base,asset_identity:{...identity(r),contract_or_mint:'0x'+'1'.repeat(40)},now:r.decision_ts}),null);
  assert.equal(await resolvePublishedCalendarReference({...base,now:r.payload.received_ts+21600000}),null);
 }
});
test('only token metadata dependency changes route order; native routes and every original route remain',()=>{
 const input=[{name:'LARGE_TRADES'},{name:'TOKEN_CALENDAR'},{name:'CHAIN_SUPPLY'},{name:'SECTOR_COINGECKO'},{name:'BLUESKY'}];
 assert.deepEqual(orderEvidenceDependencyRoutes(input,{asset_kind:'NATIVE'}),input);
 const out=orderEvidenceDependencyRoutes(input,identity(actual.references[0]));
 assert.deepEqual(out.map(r=>r.name),['LARGE_TRADES','CHAIN_SUPPLY','SECTOR_COINGECKO','TOKEN_CALENDAR','BLUESKY']);
 assert.equal(out.length,input.length);assert.deepEqual(input.map(r=>r.name),['LARGE_TRADES','TOKEN_CALENDAR','CHAIN_SUPPLY','SECTOR_COINGECKO','BLUESKY']);
 assert.deepEqual(orderEvidenceDependencyRoutes(out,identity(actual.references[0])),out);
});
test('existing dispatcher can resolve actual newly received metadata once inside same unchanged HTTP envelope without inventing calendar facts',async()=>{
 for(const r of actual.references){
  const order=[],params={contract:r.contract,asset_identity:identity(r),db:dbFor(r),now:r.payload.received_ts-1,clock:()=>r.decision_ts,request_admit:()=>({allowed:true}),fetch_impl:()=>{throw Error('NO_HTTP_ALLOWED');}};
  const routes=orderEvidenceDependencyRoutes([{name:'TOKEN_CALENDAR'},{name:'SECTOR_COINGECKO'}],params.asset_identity);
  const result=await collectEvidenceRouteBlock({routes,params,max_requests:1,collectors:{
   SECTOR_COINGECKO:async p=>{order.push('SECTOR_COINGECKO');assert.equal(p.now,params.now);return {status:'ACTUAL_SAVED_METADATA_AVAILABLE',evidence:[],network_calls:0};},
   TOKEN_CALENDAR:async p=>{order.push('TOKEN_CALENDAR');assert.equal(p.now,r.decision_ts);const reference=await resolvePublishedCalendarReference(p);assert.ok(reference);return{status:'EXACT_REFERENCE_ONLY_CALENDAR_FACT_NOT_ASSERTED',reference,evidence:[],network_calls:0};}
  }});
  assert.deepEqual(order,['SECTOR_COINGECKO']);assert.equal(result.results.TOKEN_CALENDAR.status,'BLOCK_PAUSED_BY_OWNER');assert.equal(result.network_calls,0);assert.equal(result.reserved_requests,0);
  assert.equal(result.results.TOKEN_CALENDAR.evidence.length,0);assert.equal(result.max_requests,1);
 }
});
test('calendar clock cannot move backward or turn known-after-cutoff into a historical fact',()=>{
 assert.throws(()=>evidenceRouteObservationNow({name:'TOKEN_CALENDAR'},{now:100,clock:()=>99}),/SOURCE_ROUTE_CLOCK_NOT_MONOTONIC/);
 assert.throws(()=>evidenceRouteObservationNow({name:'TOKEN_CALENDAR'},{now:100,clock:()=>NaN}),/SOURCE_ROUTE_CLOCK_NOT_MONOTONIC/);
 assert.equal(evidenceRouteObservationNow({name:'CHAIN_SUPPLY'},{now:100,clock:()=>200}),100);
});
