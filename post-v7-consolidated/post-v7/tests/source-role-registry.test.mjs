import test from 'node:test';import assert from 'node:assert/strict';import {sourceForRole,independentFamilies,canPromoteEarlyObservation} from '../src/source-role-registry.mjs';
test('HTX is execution truth',()=>assert.equal(sourceForRole('EXECUTION_TRUTH')[0].name,'HTX_OFFICIAL'));
test('projected liquidation has a primary free provider',()=>assert.equal(sourceForRole('PROJECTED_LIQUIDATION_MAP')[0].name,'BYKARANTELI'));
test('same aggregate family counts once',()=>assert.equal(independentFamilies([{source:'BYKARANTELI'},{source:'BYKARANTELI'}]).length,1));
test('early observation cannot promote without trigger',()=>assert.equal(canPromoteEarlyObservation({has_htx_facts:true,has_actionable_trigger:false,independent_sources:[{source:'HTX_OFFICIAL'},{source:'COINLOBSTER'}]}),false));
test('early observation can promote only with HTX, trigger, independent families',()=>assert.equal(canPromoteEarlyObservation({has_htx_facts:true,has_actionable_trigger:true,independent_sources:[{source:'HTX_OFFICIAL'},{source:'COINLOBSTER'}]}),true));
