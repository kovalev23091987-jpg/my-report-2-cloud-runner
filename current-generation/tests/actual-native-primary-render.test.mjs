import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=process.env.REPORT2_ACTUAL_MODULE_ROOT?pathToFileURL(path.resolve(process.env.REPORT2_ACTUAL_MODULE_ROOT)+'/'):new URL('../files/src/',import.meta.url);
const {nativeLiquidationSources,nativeLiquidationLines,validateNativeLiquidationContext}=await import(new URL('native-liquidation-guard.mjs',root));
const {buildCanonicalExecutionEvidence,bindVerifiedPrimarySourceFacts}=await import(new URL('execution-report-context.mjs',root));
const {auditCandidateBlocks}=await import(new URL('candidate-evidence-v2-runtime.mjs',root));
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/actual-fil-37375551922.json',import.meta.url))),c=fixture.candidate;
test('actual same-run primary GMX receipt-only context validates and shows all three labelled levels',()=>{
 assert.equal(fixture.provenance.synthetic,false);const canonical={...c.canonical,metadata:{contract:c.contract}};
 const proof=validateNativeLiquidationContext(canonical);assert.equal(proof.ok,true,proof.status);
 const info=nativeLiquidationSources(c.canonical.liquidations);assert.equal(info.sources.length,1);assert.equal(info.sources[0].provider,'GMX public API');
 const lines=nativeLiquidationLines(c.canonical.liquidations,{manual:true}).join('\n');assert.match(lines,/время исходного состояния неизвестно/);for(const price of ['1,270784942','0,8709546931','0,5617503707'])assert.ok(lines.includes(price),lines);assert.match(lines,/расчётный уровень/);assert.equal(info.sources[0].entry_eligible,false);
 const broken=structuredClone(canonical);broken.liquidations.native_extension.binding.contract='OTHER-USDT';assert.equal(validateNativeLiquidationContext(broken).ok,false);
 const stale=validateNativeLiquidationContext(canonical,{checked_ts:c.observed_ts+300001,check_freshness:true});assert.equal(stale.ok,false);
});
test('primary exact execution receipt binds N11/N16 source counts without another HTTP or new vote',()=>{
 const identity={contract:c.contract,run_id:c.run_id,snapshot_id:c.snapshot_id,observed_ts:c.observed_ts,execution_context_source:c.execution_context_source};
 const evidence=buildCanonicalExecutionEvidence(identity);assert.deepEqual(evidence.map(r=>r.block_id),['N11','N16']);
 const before={PRIMARY_EXECUTION_STRESS:{status:'CHECKED_HTX_ORDERBOOK_STRESS',network_calls:0},PRIMARY_EXECUTION_COST:{status:'CHECKED_HTX_EXECUTION_COST',network_calls:0}};
 const sources=bindVerifiedPrimarySourceFacts({...identity,sources:before,evidence,decision_ts:c.observed_ts});const audit=auditCandidateBlocks({evidence,sources,decision_ts:c.observed_ts});
 for(const [block,name] of [['N11','PRIMARY_EXECUTION_STRESS'],['N16','PRIMARY_EXECUTION_COST']]){assert.equal(audit.blocks[block].source_checks[name].valid_evidence_ids.length,1);assert.equal(audit.blocks[block].source_checks[name].network_calls,0);assert.equal(audit.blocks[block].source_checks[name].declared_upstream_ids[0],'HTX_IMMUTABLE_EXECUTION_BOOK');assert.equal(sources[name].evidence[0].coverage_fraction,0);}
 assert.equal(before.PRIMARY_EXECUTION_STRESS.evidence,undefined);
 for(const patch of [{htx_contract:'OTHER-USDT'},{block_id:'N12'},{first_known_ts:c.observed_ts+1}]){const invalid=bindVerifiedPrimarySourceFacts({...identity,sources:before,evidence:evidence.map(r=>({...r,...patch})),decision_ts:c.observed_ts});assert.equal(invalid.PRIMARY_EXECUTION_STRESS.evidence,undefined);}
});
