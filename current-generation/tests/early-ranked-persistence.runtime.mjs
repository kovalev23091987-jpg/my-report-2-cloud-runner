import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {fixtureDb,NOW} from './early-evidence-repair/fixture-db.mjs';
const runtime=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const {rankedEarlyPersistenceContracts,bindSelectedEarlyEvidence}=await import(pathToFileURL(path.join(runtime,'src/selected-early-evidence.mjs')));
const {runV3EarlyPersistenceSidecar:run}=await import(pathToFileURL(path.join(runtime,'src/v3-early-sidecar.mjs')));
const real=JSON.parse(fs.readFileSync('original-report/report2-run-result.json'));
test('exact retained 12:27 ranking prioritizes its actual Top2 without moving leaders',()=>{
 assert.equal(real.head,'592fc18f6c8702414c8f5a60a091d5c800e4387a');
 assert.equal(real.run_id,'1791278745801-1791278753533');
 const a=real.candidate_selection_audit;
 const rows=a.qualified_candidates.map(r=>({...r,priority_rank:r.queue_priority_rank}));
 const before=JSON.stringify(rows);
 assert.deepEqual(rankedEarlyPersistenceContracts({shortlist:rows}),a.top_two_contracts);
 assert.equal(JSON.stringify(rows),before);
 assert.equal(real.candidates.every(c=>c.canonical_state==='REJECTED'),true);
});
test('absent shortlist consumes no priority and no fabricated contract',()=>assert.deepEqual(rankedEarlyPersistenceContracts(null),[]));
test('same comparator retains score direction tie rules and works for arbitrary identities',()=>{
 const rows=[{contract:'X',selection_score_0_100:80,priority_rank:1},{contract:'Y',selection_score_0_100:90,priority_rank:3},{contract:'Z',selection_score_0_100:90,priority_rank:2}];
 assert.deepEqual(rankedEarlyPersistenceContracts({shortlist:rows}),['Z','Y']);
});
test('retained historical market history supports two selected exact wave receipts within original two attempts',async()=>{
 const db=fixtureDb(),context={},env={DATA_DB:db,REPORT2_CURRENT_CYCLE_EARLY_PERSIST:a=>run(db,{...a,cycle_context:context})};
 const args={current_scan_ts:NOW,now_ts:NOW,source_run_id:'HISTORICAL_PRIORITY_REPLAY'};
 // Scheduling order is controlled; all market observations and history retain original values and clocks.
 const priority=['ADA-USDT','QNT-USDT'];
 await run(db,{...args,cycle_context:context,preferred_contracts:priority});
 const initial=db.sql.prepare('SELECT contract_code FROM v3_early_candidate_wave').all();
 assert.deepEqual(initial.map(r=>r.contract_code),['ADA-USDT']);
 const scan={timestamp:NOW};
 for(const contract of priority){
  const r=await bindSelectedEarlyEvidence({target:{contract},env,scan,run_id:args.source_run_id,now_ts:NOW+2000});
  assert.equal(r.status,'CLOSED');
  assert.equal(r.candidate.early_candidate_receipt.contract,contract);
  assert.equal(r.candidate.early_candidate_receipt.source_ts,NOW);
 }
 assert.equal(context.attempted.size,2);
 const writes=db.usageSnapshot().rows_written;
 for(const contract of priority)await bindSelectedEarlyEvidence({target:{contract},env,scan,run_id:args.source_run_id,now_ts:NOW+2000});
 assert.equal(db.usageSnapshot().rows_written,writes);
 const third=await run(db,{...args,cycle_context:context,preferred_contracts:['GPS-USDT'],selected_only:true});
 assert.equal(third.status,'CYCLE_EARLY_WRITE_LIMIT');
 assert.equal(db.sql.prepare('SELECT count(*) n FROM v3_early_candidate_wave').get().n,2);
 assert.ok(writes<=12);
});
test('scheduled caller persists after existing rank and passes its priority before loading early bridge',()=>{
 const w=fs.readFileSync(path.join(runtime,'src/worker.js'),'utf8');
 const start=w.indexOf('const baseDiscoveryPrefilter =');
 const persist=w.indexOf('await env.REPORT2_CURRENT_CYCLE_EARLY_PERSIST',start);
 const load=w.indexOf('const earlyBridgeInputs =',start);
 assert.ok(start>0&&persist>start&&load>persist);
 assert.match(w.slice(start,load),/preferred_contracts: rankedEarlyPersistenceContracts\(baseDiscoveryPrefilter\)/);
 assert.match(fs.readFileSync(path.join(runtime,'src/v3-early-sidecar.mjs'),'utf8'),/cache\.attempted\.size>=2/);
});
