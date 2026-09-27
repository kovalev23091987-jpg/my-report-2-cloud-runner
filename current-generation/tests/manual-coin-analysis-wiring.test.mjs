import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('manual coin analysis is exact-scope, one-contract and uses the same deep chain',()=>{
 const worker=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');
 assert.match(worker,/REPORT2_MANUAL_COIN_CONTRACT/);
 assert.match(worker,/confirmedScopeContracts\.includes\(manualRequestedContract\)/);
 assert.match(worker,/lane:'MANUAL_COIN_ANALYSIS',require_exact_contract:true/);
 assert.match(worker,/max_per_run:\s*1/);
});
test('scheduled runs can never inherit a manual coin request',()=>{
 const worker=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');
 assert.match(worker,/REPORT2_RUN_SOURCE\|\|'\'\)!=='schedule'/);
});
