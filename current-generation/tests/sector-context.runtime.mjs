import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'runtime');
const {buildRuntimeCanonicalBundle}=await import(pathToFileURL(path.join(root,'src/canonical-runtime-adapter.mjs')));
const {auditRenderedBlockResults,confirmedBlockContextFacts}=await import(pathToFileURL(path.join(root,'src/block-result-context.mjs')));
const {formatManualRunSummary}=await import(pathToFileURL(path.join(root,'src/manual-run-summary.mjs')));
const {normalizeCoingeckoSector}=await import(pathToFileURL(path.join(root,'src/coingecko-sector-evidence.mjs')));
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/ready-sector-36745185948.json',import.meta.url)));
const now=fixture.provenance.observed_ts,identity={chain:'ethereum',contract_or_mint:'0x514910771af9ca656af840dff83e8264ecf986ca'};
const sector=normalizeCoingeckoSector({...fixture.coingecko,identity,contract:'LINK-USDT',coin_id:'chainlink',category_id:'oracle',category_name:'Oracle',observed_ts:now});
const input={contract:'LINK-USDT',run_id:'sector-fixture',snapshot_id:'sector-fixture',observed_ts:now,discovery_row:{current_price:10},publication_shadow:{entry_signal:{state:'REJECTED',direction:'LONG'}}};
const before=buildRuntimeCanonicalBundle(input),after=buildRuntimeCanonicalBundle({...input,internal_market_context:{internal_only:true,evidence_v2:sector,candidate_context:{asset_identity:identity}}});
assert.equal(after.canonical.metadata.supporting_context.blocks.sector_comparison.status,'CLOSED');
assert.match(after.manual.text,/CoinGecko/);assert.match(after.manual.text,/Сектор/);assert.match(after.manual.text,/оракулы/);assert.deepEqual(after.canonical.scores,before.canonical.scores);assert.equal(after.canonical.state,before.canonical.state);
assert.doesNotMatch(buildRuntimeCanonicalBundle({...input,observed_ts:now+900001,internal_market_context:{evidence_v2:sector,candidate_context:{asset_identity:identity}}}).manual.text,/CoinGecko/);
console.log(JSON.stringify({status:'SECTOR_RUNTIME_PASS',ready_proof_run:36745185948,consumer:'MANUAL_REPORT',live_calls:0,new_history:0,scores_unchanged:true,sector:sector.summary}));

const proof=after.block_rendered_results,fact=after.canonical.metadata.supporting_context.facts.find(f=>f.block_id==='N15');
assert.ok(fact.evidence_id);assert.ok(fact.physical_root_key);assert.equal(fact.observed_ts,now);
assert.ok(proof.used_context_block_ids.includes('N15'));
const row={contract:input.contract,run_id:input.run_id,snapshot_id:input.snapshot_id,observed_ts:now,canonical:after.canonical,manual_text:after.manual.text,block_rendered_results:proof};
assert.ok(formatManualRunSummary({status:'PARTIAL_DATA_UNAVAILABLE',run_id:input.run_id,candidates:[row]}).includes(fact.value));
for(const mutate of [c=>c.metadata.internal_market_context.candidate_context.asset_identity.contract_or_mint='0x'+'2'.repeat(40),c=>c.observed_ts=now+900001,c=>c.metadata.supporting_context.facts.find(f=>f.block_id==='N15').physical_root_key='foreign',c=>c.metadata.supporting_context.facts.find(f=>f.block_id==='N15').value+=' fabricated']){
 const changed=structuredClone(after.canonical);mutate(changed);
 assert.ok(!confirmedBlockContextFacts(changed).some(f=>f.block_id==='N15'));
 assert.ok(!auditRenderedBlockResults({canonical:changed,manual:after.manual}).used_context_block_ids.includes('N15'));
}
const foreignRun={...row,run_id:'other'};
assert.ok(!formatManualRunSummary({status:'PARTIAL_DATA_UNAVAILABLE',run_id:input.run_id,candidates:[foreignRun]}).includes(fact.value));
console.log(JSON.stringify({status:'SECTOR_JOINT_RECEIPT_PASS',shared_consumer:true,negative_bindings:5,source_http:0}));
