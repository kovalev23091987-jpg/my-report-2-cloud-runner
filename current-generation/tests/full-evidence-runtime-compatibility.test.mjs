import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Full Evidence producer, envelope and exact ACK validator use production schema weights',()=>{
 const worker=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');
 assert.ok((worker.match(/CROSS_EXCHANGE_DERIVATIVES:\s*35/g)||[]).length>=2);
 assert.ok((worker.match(/SUPPORTING_RISK:\s*15/g)||[]).length>=2);
 assert.match(worker,/fixed_decision_weights\?\.CROSS_EXCHANGE_DERIVATIVES\) === 35/);
 assert.match(worker,/fixed_decision_weights\?\.SUPPORTING_RISK\) === 15/);
 assert.match(worker,/insertChanges !== 1/);
 assert.match(worker,/FULL_EVIDENCE_PERSISTENCE_FAILED/);
 assert.match(worker,/outcome_classification/);
});
