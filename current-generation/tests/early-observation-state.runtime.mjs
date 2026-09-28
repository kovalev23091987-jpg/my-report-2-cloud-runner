import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const runtime=path.resolve(process.argv[2]||'runtime');
const {selectCanonicalPublicationState}=await import(pathToFileURL(path.join(runtime,'src/canonical-runtime-adapter.mjs')).href);

assert.equal(selectCanonicalPublicationState({route_state:'REJECTED',early_candidate:true,early_quality:82,direction:'LONG'}),'OBSERVE');
assert.equal(selectCanonicalPublicationState({route_state:'REJECTED',early_candidate:true,early_quality:82,direction:'SHORT'}),'OBSERVE');
assert.equal(selectCanonicalPublicationState({route_state:'REJECTED',route_hard_veto:true,early_candidate:true,early_quality:82,direction:'LONG'}),'REJECTED');
assert.equal(selectCanonicalPublicationState({route_state:'REJECTED',early_candidate:true,early_quality:69,direction:'LONG'}),'REJECTED');
assert.equal(selectCanonicalPublicationState({route_state:'REJECTED',early_candidate:true,early_quality:82,direction:null}),'REJECTED');
assert.equal(selectCanonicalPublicationState({route_state:'ENTRY_NOW_VALIDATED',route_hard_veto:false,early_candidate:true,early_quality:82,direction:'LONG'}),'ENTRY_NOW_VALIDATED');
assert.equal(selectCanonicalPublicationState({route_state:'UNKNOWN',route_hard_veto:false,early_candidate:true,early_quality:82,direction:'LONG'}),'OBSERVE');

console.log(JSON.stringify({status:'EARLY_OBSERVATION_STATE_POLICY_PASS'}));
