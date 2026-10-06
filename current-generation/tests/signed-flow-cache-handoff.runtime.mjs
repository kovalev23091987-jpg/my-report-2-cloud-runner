import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=process.env.REPORT2_TEST_RUNTIME;
const load=rel=>import(root?pathToFileURL(root+'/src/'+rel):new URL('../files/src/'+rel,import.meta.url));
const tape=await load('htx-signed-tape.mjs');
const {buildHtxFuturesFlowPrimary}=await load('candidate-evidence-v2-runtime.mjs');
const {consumeBlockResultContext}=await load('block-result-context.mjs');
const raw=fs.readFileSync(new URL('./fixtures/actual-niulai-signed-cache-20261006.json.gz',import.meta.url));
const fixture=JSON.parse(gunzipSync(raw)),ring=fixture.ring,contract=ring.contract,now=fixture.original_decision_ts;
const digest=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
function database(value){
 const usage={reads:0,writes:0};
 return{usage,prepare(sql){assert.match(sql,/^SELECT observed_ts,expires_ts,payload_json FROM report2_evidence_source_cache/);return{bind(source,key,cutoff){assert.equal(source,'HTX_SIGNED_RAW_TAPE');assert.equal(key,contract);assert.equal(cutoff,now);return{async first(){usage.reads++;return{observed_ts:value.observed_ts,expires_ts:value.observed_ts+30*3600000,payload_json:JSON.stringify(value)};}};}};}};
}
test('actual immutable saved 240 minutes reach N05 even when the current acquisition returns no complete source',async()=>{
 assert.equal(fixture.new_live_acceptance,false);assert.equal(fixture.original_producer_replay,false);
 tape.clearHtxSignedTapeSnapshots();
 const bytes=digest(ring),expected=tape.signedTapeFourHourFlow({ring,contract,now});
 assert.equal(expected.check_completed,true);assert.equal(expected.evidence[0].verified_minutes,240);
 assert.equal(tape.capturedSignedTapeFourHourFlow({contract,now}).check_completed,false);
 const db=database(ring);await tape.readSavedHtxSignedTape({db,contract,now,db_admit:()=>({allowed:true})});
 const acquisition=await tape.persistCapturedHtxSignedTape({db,contract,now,db_admit:()=>{throw Error('no acquisition must not reserve new DB writes');}});
 assert.equal(acquisition.status,'SOURCE_NOT_CLOSED');
 const actual=buildHtxFuturesFlowPrimary({contract,now});
 assert.equal(actual.check_completed,true);assert.deepEqual(actual.evidence,expected.evidence);
 assert.equal(actual.raw_acquisition_diagnostic.source_clocks.trades.status,'MISSING_CAPTURE');
 assert.equal(actual.network_calls,0);assert.deepEqual(db.usage,{reads:1,writes:0});assert.equal(digest(ring),bytes);
 const context=consumeBlockResultContext({evidence:actual.evidence,contract,now});
 assert.equal(context.facts.length,1);assert.equal(context.facts[0].block_id,'N05');
 assert.equal(context.facts[0].score_contribution,0);assert.match(context.facts[0].value,/четыре часа|четыре|четырёх|четырех|исходных сделок/u);
});
test('fresh cache receipt cannot legitimize stale, future, corrupt, incomplete or foreign immutable minutes',async()=>{
 const cases=[
  r=>{for(const m of r.minutes)m.start_ts-=3600000;},
  r=>r.observed_ts=now+1,
  r=>{r.minutes.at(-1).observed_ts=now+1;},
  r=>{r.minutes.at(-1).raw_sha256='0'.repeat(64);},
  r=>{r.minutes.splice(-2,1);},
  r=>{r.contract='FOREIGN-USDT';},
 ];
 for(const change of cases){
  tape.clearHtxSignedTapeSnapshots();const bad=structuredClone(ring);change(bad);const db=database(bad);
  await tape.readSavedHtxSignedTape({db,contract,now,db_admit:()=>({allowed:true})});
  assert.equal(buildHtxFuturesFlowPrimary({contract,now}).check_completed,false);
  assert.equal(db.usage.writes,0);
 }
 tape.clearHtxSignedTapeSnapshots();const denied=database(ring);
 assert.equal(await tape.readSavedHtxSignedTape({db:denied,contract,now,db_admit:()=>({allowed:false})}),null);
 assert.equal(tape.capturedSignedTapeFourHourFlow({contract,now}).check_completed,false);assert.equal(denied.usage.reads,0);
});

test('a failed acquisition reports component clock failures without manufacturing a fact or requesting new sources',async()=>{
 tape.clearHtxSignedTapeSnapshots();
 tape.observeHtxSignedTape({status:'ok',ts:now-120001,data:[]},'https://api.hbdm.com/linear-swap-api/v1/swap_contract_info?contract_code='+encodeURIComponent(contract),now);
 const result=await tape.persistCapturedHtxSignedTape({contract,now,db_admit:()=>{throw Error('no complete acquisition');}});
 assert.equal(result.status,'SOURCE_NOT_CLOSED');
 const primary=buildHtxFuturesFlowPrimary({contract,now});
 assert.equal(primary.check_completed,false);assert.equal(primary.evidence.length,0);
 assert.equal(primary.signed_raw_flow_status,'SIGNED_FLOW_EXACT_RING_REQUIRED');
 assert.equal(primary.raw_acquisition_diagnostic.source_clocks.metadata.status,'SOURCE_CAPTURE_NOT_FRESH');
 assert.equal(primary.raw_acquisition_diagnostic.source_clocks.trades.status,'MISSING_CAPTURE');
 assert.equal(primary.network_calls,0);
});
