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
 assert.match(worker,/const decisionTs = Date\.now\(\)/);
 assert.match(worker,/fullEvidenceObservedTs = Number\(fullEvidenceShadow\?\.observed_ts\) \|\| decisionTs/);
 assert.ok((worker.match(/observed_ts: fullEvidenceObservedTs/g)||[]).length>=2);
 assert.match(worker,/FULL_EVIDENCE_PERSISTENCE_FAILED/);
 assert.match(worker,/outcome_classification/);
 assert.match(worker,/wave_id: params\?\.discovery_row\?\.early_candidate_wave_id \?\? params\?\.discovery_row\?\.wave_id/);
 assert.match(worker,/DEFERRED_FOR_TELEGRAM_BINDING_RECOVERY/);
 assert.match(worker,/lane:'TELEGRAM_BINDING_RECOVERY'/);
 assert.match(worker,/w\.early_detection_quality_0_100>=70/);
 assert.match(worker,/LIVE_DIRECTIONAL_DISCOVERY/);
 assert.match(worker,/directionless_fast_move_deferred/);
 assert.match(worker,/early_candidate_wave_id:early\.wave_id/);
 assert.match(worker,/const directionalCandidates=directionalRows\.map/);
 assert.match(worker,/lane:'LIVE_DIRECTIONAL_DISCOVERY',require_exact_contract:false,required_contract:null/);
 assert.match(worker,/READY_DIRECTIONAL_CANDIDATE_SELECTED_AFTER_COOLDOWN/);
});
