import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {checkState,acquireIteration,finishPhase,releaseIteration,PHASES,REQUIREMENTS} from './continuation-stage-gate.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../checkpoints/CLOUD_PHASE_STATE_20261004.json',import.meta.url)));
const now=1791136800000,owner='HTX:CONTROLLED_TEST:1',receipt={path:'controlled-completion-proof.json',sha256:'a'.repeat(64)};
test('another scheduled iteration stays on the unfinished core phase and cannot acquire a parallel lease',()=>{
 const leased=acquireIteration({...state,lease:null},{owner,now});assert.equal(checkState(leased).id,'CORE_BLOCKS');
 assert.throws(()=>acquireIteration(leased,{owner:'HTX:CONTROLLED_TEST:2',now:now+1000}),/ANOTHER_ITERATION_ACTIVE/);
 const recovered=acquireIteration(leased,{owner:'HTX:CONTROLLED_TEST:2',now:now+7200001});assert.equal(recovered.current_phase,'CORE_BLOCKS');assert.equal(recovered.phases[1].status,'PENDING');
});
test('a successful partial source probe cannot complete the core phase',()=>{
 const leased=acquireIteration({...state,lease:null},{owner,now});
 const realPartial=JSON.parse(fs.readFileSync(new URL('../checkpoints/technical-native-release-evidence-20261004.json',import.meta.url)));
 assert.equal(realPartial.all_15_live_accepted,false);assert.throws(()=>finishPhase(leased,{owner,now:now+1,proof:{...realPartial,phase:'CORE_BLOCKS',status:'CLOSED',actual_evidence_verified:true},receipt}),/ACTUAL_PHASE_ACCEPTANCE_REQUIRED/);
});
test('only the current phase and saved actual acceptance can open the next phase',()=>{
 const leased=acquireIteration({...state,lease:null},{owner,now}),proof={phase:'CORE_BLOCKS',status:'CLOSED',actual_evidence_verified:true,...Object.fromEntries(REQUIREMENTS.CORE_BLOCKS.map(k=>[k,true]))};
 assert.throws(()=>finishPhase(leased,{owner,now:now+1,proof:{...proof,phase:'TELEGRAM'},receipt}),/ACTUAL_PHASE_ACCEPTANCE_REQUIRED/);
 assert.throws(()=>finishPhase(leased,{owner,now:now+1,proof,receipt:null}),/EXACT_SAVED_COMPLETION_RECEIPT_REQUIRED/);
 const advanced=finishPhase(leased,{owner,now:now+1,proof,receipt});assert.equal(advanced.current_phase,'LIQUIDATION_COVERAGE');assert.deepEqual(advanced.phases.map(r=>r.status),['VERIFIED','IN_PROGRESS','PENDING','PENDING']);
});
test('unverified predecessor and foreign release are refused',()=>{
 const broken=structuredClone({...state,lease:null});broken.phases[2].status='IN_PROGRESS';assert.throws(()=>checkState(broken),/PREDECESSOR_NOT_VERIFIED/);
 const leased=acquireIteration({...state,lease:null},{owner,now});assert.throws(()=>releaseIteration(leased,{owner:'HTX:OTHER',now}),/ONLY_CURRENT_OWNER_MAY_RELEASE/);
 assert.equal(releaseIteration(leased,{owner,now}).current_phase,PHASES[0]);
});
