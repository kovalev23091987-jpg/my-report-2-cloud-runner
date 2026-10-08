import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'current-generation/files');
const current=await import(pathToFileURL(path.join(root,'src/htx-signed-tape.mjs')));
const baseline=await import(pathToFileURL(path.join(root,'src/htx-signed-tape.baseline.mjs')));
const bytes=fs.readFileSync('current-generation/tests/fixtures/exact-current-37395903856.json.gz');
assert.equal(createHash('sha256').update(bytes).digest('hex'),'d3e6ac9394f57739a1ea7ffe89a4aade9ff52a52fd271f5612fdf17f575dc50f');
const fixture=JSON.parse(gunzipSync(bytes)),row=fixture.rows.find(r=>r.contract_code==='LSK-USDT'),ring=row.tape.ring,contract=row.contract_code,T=row.canonical.observed_ts,MIN=60000;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const received=Math.max(...ring.minutes.map(m=>m.observed_ts)),source=Math.max(...ring.minutes.map(m=>m.source_ts));
function snapshot(){
 const end=Math.max(...ring.minutes.map(m=>m.start_ts))+MIN;
 const minutes=ring.minutes.filter(m=>m.start_ts>=end-240*MIN&&m.start_ts<end);
 return {metadata:{status:'ok',ts:source,data:[{contract_code:contract,contract_status:1,business_type:'swap',trade_partition:'USDT',contract_size:ring.contract_size}]},
 trades:{status:'ok',ts:source,ch:`market.${contract}.trade.detail`,data:[{data:minutes.flatMap(m=>m.fills.map(f=>({id:f.id,ts:f.ts,direction:f.side,price:f.price,amount:f.contracts,trade_turnover:f.quote_usdt})))}]},
 minutes:{status:'ok',ts:source,ch:`market.${contract}.kline.1min`,data:minutes.map(m=>({id:m.start_ts/1000,count:m.factual_count}))}};
}
function capture(module,s){
 module.clearHtxSignedTapeSnapshots();
 for(const [kind,route] of [['metadata','/linear-swap-api/v1/swap_contract_info'],['trades','/linear-swap-ex/market/history/trade'],['minutes','/linear-swap-ex/market/history/kline']])
 module.observeHtxSignedTape(s[kind],'https://api.hbdm.com'+route+'?contract_code='+contract+(kind==='minutes'?'&period=1min':''),received);
}
class DB{
 constructor(failure){this.sqlite=new DatabaseSync(':memory:');this.failure=failure;this.ops=[];this.reads=0;}
 prepare(sql){const db=this;return{args:[],bind(...args){this.args=args;return this;},async run(){db.ops.push({kind:'WRITE',sql});if(sql.startsWith('INSERT INTO report2_evidence_source_cache')&&db.failure==='WRITE')throw Error('D1_BRIDGE_FAILURE:CONTROLLED_WRITE_FAILURE_DO_NOT_EXPORT_SECRET');return db.sqlite.prepare(sql).run(...this.args);},async first(){db.ops.push({kind:'READ',sql});db.reads++;if(db.reads===2&&db.failure==='READBACK')throw Object.assign(Error('DO_NOT_EXPORT_SECRET'),{code:'CONTROLLED_READBACK_FAILURE'});return db.sqlite.prepare(sql).get(...this.args)||null;}};}
 async batch(statements){return Promise.all(statements.map(s=>s.run()));}
}
async function run(module,failure,s=snapshot(),admit=true){
 capture(module,s);const db=new DB(failure),persist=await module.persistCapturedHtxSignedTape({db,contract,now:T,db_admit:()=>({allowed:admit,status:'CONTROLLED_DENIAL'})});
 return {db,persist,flow:module.capturedSignedTapeFourHourFlow({contract,now:T})};
}
test('actual retained raw fills at original clock survive an optional write failure; old assembled source loses the same complete window',async()=>{
 const original=baseline.signedTapeFourHourFlow({ring,contract,now:T});assert.equal(original.check_completed,true);
 const old=await run(baseline,'WRITE'),next=await run(current,'WRITE');
 assert.equal(old.flow.check_completed,false);assert.equal(next.persist.status,'RAW_TAPE_PERSISTENCE_NOT_CLOSED');assert.equal(next.persist.failure_stage,'WRITE_MERGED_RING');assert.equal(next.persist.evidence.length,0);
 assert.equal(next.flow.check_completed,true);assert.equal(next.flow.evidence[0].verified_minutes,240);
 for(const k of ['value','source_ts','observed_ts','raw_trade_count','buy_quote_turnover_usdt','sell_quote_turnover_usdt','raw_minute_root_sha256'])assert.equal(next.flow.evidence[0][k],original.evidence[0][k]);
 assert.equal(next.flow.evidence[0].entry_authorized,false);assert.equal(next.flow.evidence[0].score_contribution,0);
 assert.equal(next.flow.raw_acquisition_diagnostic.current_run_verified_flow_retained,true);assert.equal(next.flow.raw_acquisition_diagnostic.persisted_minutes,null);assert.equal(next.flow.raw_acquisition_diagnostic.error_code,'D1_BRIDGE_FAILURE');
 assert.ok(!JSON.stringify(next.flow).includes('DO_NOT_EXPORT_SECRET'));
 assert.equal(next.db.ops.filter(o=>o.kind==='WRITE'&&o.sql.startsWith('INSERT INTO report2_evidence_source_cache')).length,1);assert.equal(next.persist.network_calls,0);
 fs.mkdirSync('audit-output',{recursive:true});
 fs.writeFileSync('audit-output/current-run-flow-write-failure-proof.json',JSON.stringify({schema:'SAME_RUN_EXACT_FLOW_OPTIONAL_DURABILITY_FAILURE_V1',scope:'ACTUAL_RETAINED_FILLS_ORIGINAL_CLOCK_WITH_CONTROLLED_TRANSPORT_AND_STORAGE_FAILURE_NOT_NEW_LIVE_SENT',contract,original_fixture_gzip_sha256:createHash('sha256').update(bytes).digest('hex'),original_source_ts:original.evidence[0].source_ts,original_observed_ts:original.evidence[0].observed_ts,raw_minute_root_sha256:original.evidence[0].raw_minute_root_sha256,old_complete_flow:false,new_complete_flow:true,persistence_status:next.persist.status,persisted_minutes:null,exact_original_evidence_fields_equal:true,raw_fill_ids_clocks_hashes_unchanged:true,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,actual_ENTRY:false,new_fresh_SENT:false},null,2)+'\n');
});
test('readback failure preserves verified same-run raw data while durable acceptance remains failed',async()=>{
 const out=await run(current,'READBACK');assert.equal(out.persist.status,'RAW_TAPE_PERSISTENCE_NOT_CLOSED');assert.equal(out.persist.failure_stage,'READBACK_MERGED_RING');assert.equal(out.flow.check_completed,true);assert.equal(out.flow.raw_acquisition_diagnostic.persisted_minutes,null);assert.equal(out.db.reads,2);
});
test('successful durable path has identical evidence and no extra SQL versus old source',async()=>{
 const old=await run(baseline),next=await run(current);assert.deepEqual(next.flow.evidence,old.flow.evidence);assert.equal(next.persist.status,old.persist.status);assert.equal(next.persist.persisted_minutes,old.persist.persisted_minutes);assert.deepEqual(next.db.ops,old.db.ops);
});
test('missing exact minute, altered counters, stale source and admission denial never create current verified flow',async()=>{
 for(const change of [s=>s.minutes.data.splice(-2,1),s=>s.minutes.data.at(-2).count++,s=>s.trades.ts=T-120001]){
  const s=snapshot();change(s);const out=await run(current,'WRITE',s);assert.equal(out.flow.check_completed,false);assert.equal(out.flow.evidence.length,0);assert.equal(out.flow.raw_acquisition_diagnostic.current_run_verified_flow_retained,false);
 }
 const denied=await run(current,'WRITE',snapshot(),false);assert.equal(denied.db.ops.length,0);assert.equal(denied.flow.check_completed,false);
});
test('retaining same-run memory never renews original freshness or authorizes entry',async()=>{
 const out=await run(current,'WRITE');const expiry=out.flow.evidence[0].source_ts+300000;
 assert.equal(current.capturedSignedTapeFourHourFlow({contract,now:expiry+1}).check_completed,false);
 assert.equal(current.capturedSignedTapeFourHourFlow({contract:'FOREIGN-USDT',now:T}).check_completed,false);
 const acquired=current.verifiedSignedMinutes({snapshot:Object.fromEntries(Object.entries(snapshot()).map(([k,payload])=>[k,{payload,observed_ts:T}])),contract,now:T});
 assert.ok(acquired.minutes.length);assert.equal(hash(acquired.minutes.flatMap(m=>m.fills)),hash(current.decodeSignedTapeStorage(current.mergeSignedTape({acquisition:acquired,now:T}).storage.payload).minutes.flatMap(m=>m.fills)));
 current.clearHtxSignedTapeSnapshots();baseline.clearHtxSignedTapeSnapshots();
});

test('same-run N05 source and assembled canonical remain equal to successful storage despite write failure',async()=>{
 const {buildHtxFuturesFlowPrimary,finalizeCandidateBlockCoverage}=await import(pathToFileURL(path.join(root,'src/candidate-evidence-v2-runtime.mjs')));
 const {buildRuntimeCanonicalBundle}=await import(pathToFileURL(path.join(root,'src/canonical-runtime-adapter.mjs')));
 const make=flow=>buildRuntimeCanonicalBundle({contract,run_id:row.canonical.run_id,snapshot_id:row.canonical.snapshot_id,observed_ts:T,discovery_row:{current_price:row.canonical.current_price||1},publication_shadow:{entry_signal:{state:'REJECTED',direction:null}},internal_market_context:{internal_only:true,evidence_v2:{...flow,block_coverage:finalizeCandidateBlockCoverage({evidence_result:flow,decision_ts:T,primary_sources:{PRIMARY_HTX_FUTURES_FLOW:flow}}).block_coverage}}});
 await run(current);const success=buildHtxFuturesFlowPrimary({contract,now:T}),before=make(success);
 await run(current,'WRITE');const source=buildHtxFuturesFlowPrimary({contract,now:T}),after=make(source);
 assert.equal(source.check_completed,true);assert.deepEqual(source.evidence,success.evidence);
 assert.equal(source.closure_diagnostic.acquisition.status,'RAW_TAPE_PERSISTENCE_NOT_CLOSED');assert.equal(source.closure_diagnostic.acquisition.current_run_verified_flow_retained,true);
 assert.deepEqual(after.canonical.scores,before.canonical.scores);assert.equal(after.canonical.state,before.canonical.state);assert.equal(after.canonical.direction,before.canonical.direction);assert.equal(after.manual.text,before.manual.text);
 assert.ok(after.block_rendered_results.used_context_block_ids.includes('N05'));assert.equal(source.network_calls,0);
 const proof=JSON.parse(fs.readFileSync('audit-output/current-run-flow-write-failure-proof.json'));
 Object.assign(proof,{N05_consumer_complete:true,N05_rendered:true,successful_storage_and_failed_storage_canonical_equal:true,entry_gates_changed:false});
 fs.writeFileSync('audit-output/current-run-flow-write-failure-proof.json',JSON.stringify(proof,null,2)+'\n');
 current.clearHtxSignedTapeSnapshots();
});


