import test from 'node:test';import assert from 'node:assert/strict';
import {ownerPublicationRefusal} from '../../contracts/index.mjs';
test('queued market-comparison cards require recomputation while a standalone plan remains eligible',()=>{
  const base={instrument:{base:'SOL',native_symbol:'SOL-USDT'},plan:{potential_pct:{minimum:10,basis:'GROSS_ENTRY_TO_EXIT_NOT_EXECUTED_PROFIT'}},findings:[{code:'ACTIVE_WAVE'}],user_narrative:{reasons:[{code:'ACTIVE_WAVE'}]}};
  assert.equal(ownerPublicationRefusal(base),null);
  for(const delta of [{findings:[{code:'RELATIVE_RETURN'}]},{user_narrative:{reasons:[{code:'RELATIVE_RETURN'}]}},{optional_context:{market_context:{returns:[]}}},{relative_context_diagnostic:{valid:true}}])assert.equal(ownerPublicationRefusal({...base,...delta}),'OWNER_REMOVED_MARKET_COMPARISON');
  assert.equal(ownerPublicationRefusal({...base,plan:{potential_pct:{minimum:9.99,basis:'GROSS_ENTRY_TO_EXIT_NOT_EXECUTED_PROFIT'}}}),'PLAN_POTENTIAL_BELOW_OWNER_MINIMUM');
});
