import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {auditCanonicalCandidateSet,classifyCanonicalRunCompletion,enforceManualBlockCoverage,formatManualRunSummary} from '../files/src/manual-run-summary.mjs';
const gz=fs.readFileSync(new URL('./fixtures/actual-0625-completion-fixture.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(gz).digest('hex'),'f54383e1dc8c65a30384a6b0857327c09ebaf8e579e7bb1ae688c38e156c86df');
const actual=JSON.parse(gunzipSync(gz));
const report=actual.report,expected=actual.handoffs.map(h=>h.contract_code),rows=actual.canonical_row_receipts.filter(r=>r.publication_id);
const assess=present=>auditCanonicalCandidateSet({expected_contracts:expected,rows:present,run_id:report.run_id});
test('actual 0625 BR/QNT run with two completed deep checks and only one canonical cannot be healthy closed',()=>{
 assert.equal(actual.sourceHTTP,0);assert.equal(report.status,'CLOSED');
 assert.equal(actual.handoffs.length,2);assert.ok(actual.handoffs.every(h=>h.execution_status==='COMPLETED'));
 assert.deepEqual(report.candidates.map(c=>c.contract),['BR-USDT']);
 assert.equal(actual.canonical_row_receipts.find(r=>r.contract_code==='QNT-USDT').status,'NO_CANONICAL_ROW_FOR_EXACT_SOURCE_RUN');
 const audit=assess(rows);assert.equal(audit.status,'PARTIAL');assert.deepEqual(audit.missing_contracts,['QNT-USDT']);assert.equal(audit.present_candidate_count,1);
 const completion=classifyCanonicalRunCompletion({candidate_count:audit.present_candidate_count,expected_candidate_count:audit.expected_candidate_count,cron:{v3_live_deep_check_count:actual.handoffs.length,v3_pipeline_health_status:report.pipeline_health.status}});
 assert.deepEqual(completion,{status:'PARTIAL_DATA_UNAVAILABLE',reason:'CANONICAL_CANDIDATE_SET_INCOMPLETE'});
 const out=enforceManualBlockCoverage({...report,...completion,canonical_persistence_audit:audit});
 assert.equal(out.status,'PARTIAL_DATA_UNAVAILABLE');assert.deepEqual(out.candidates,report.candidates);
 assert.match(formatManualRunSummary(out),/Проверка не завершена/);
 assert.equal(report.candidates[0].canonical.direction,null);assert.equal(report.candidates[0].block_decision_use.participating_block_count,5);
});
test('duplicate BR revisions and a foreign-run QNT cannot replace the absent exact-run QNT',()=>{
 assert.deepEqual(assess([...rows,...rows]).missing_contracts,['QNT-USDT']);
 const foreign={...rows[0],contract_code:'QNT-USDT',run_id:'foreign-run'};
 assert.deepEqual(assess([...rows,foreign]).missing_contracts,['QNT-USDT']);
 assert.equal(classifyCanonicalRunCompletion({candidate_count:1,cron:{v3_live_deep_check_count:2}}).status,'PARTIAL_DATA_UNAVAILABLE');
});
test('a complete controlled candidate set and one requested saved candidate preserve previous behavior',()=>{
 // Identity-only controlled positive case, not a fabricated actual QNT result.
 const audit=assess([...rows,{...rows[0],contract_code:'QNT-USDT'}]);
 assert.equal(audit.status,'CLOSED');assert.equal(audit.present_candidate_count,2);
 assert.deepEqual(classifyCanonicalRunCompletion({candidate_count:2,expected_candidate_count:2,cron:{v3_live_deep_check_count:2}}),{status:'CLOSED',reason:null});
 const single=auditCanonicalCandidateSet({expected_contracts:['BR-USDT'],rows,run_id:report.run_id});
 assert.equal(single.status,'CLOSED');assert.deepEqual(classifyCanonicalRunCompletion({candidate_count:single.present_candidate_count,expected_candidate_count:single.expected_candidate_count}),{status:'CLOSED',reason:null});
 assert.deepEqual(classifyCanonicalRunCompletion({candidate_count:0,cron:{v3_live_deep_check_count:2}}),{status:'PARTIAL_DATA_UNAVAILABLE',reason:'CANONICAL_CANDIDATE_NOT_PERSISTED'});
 assert.equal(classifyCanonicalRunCompletion({candidate_count:0}).status,'CLOSED_NO_CANONICAL_CANDIDATE');
});
