import test from 'node:test';
import assert from 'node:assert/strict';
import {planN05NativeHeadroom} from '../../tools/n05-native-headroom-plan.mjs';
const candidates=Array.from({length:12},(_,i)=>`ASSET${i}-USDT`);
test('observed seven used units select six complete windows instead of rejecting fifteen calls',()=>{
 const p=planN05NativeHeadroom({candidates,poloniex_used:7,htx_identity_used:0});
 assert.equal(p.allowed,true);assert.equal(p.Poloniex_required,9);assert.equal(p.maximum_source_HTTP,10);
 assert.deepEqual(p.selected_contracts,candidates.slice(0,6));assert.deepEqual(p.deferred_contracts,candidates.slice(6));
 assert.equal(p.Poloniex_cap,16);assert.equal(p.HTX_identity_cap,8);
});
test('full allowance preserves the saved twelve and one shared metadata batch',()=>{
 const p=planN05NativeHeadroom({candidates,poloniex_used:0,htx_identity_used:7});
 assert.equal(p.allowed,true);assert.equal(p.Poloniex_required,15);assert.equal(p.maximum_source_HTTP,16);assert.deepEqual(p.selected_contracts,candidates);assert.deepEqual(p.deferred_contracts,[]);
});
test('metadata without one affordable complete window and exhausted identity fail before HTTP',()=>{
 for(const poloniex_used of [13,16,17])assert.equal(planN05NativeHeadroom({candidates,poloniex_used,htx_identity_used:0}).allowed,false);
 assert.equal(planN05NativeHeadroom({candidates,poloniex_used:12,htx_identity_used:0}).selected_contracts.length,1);
 assert.equal(planN05NativeHeadroom({candidates,poloniex_used:0,htx_identity_used:8}).reason,'PRIMARY_IDENTITY_HEADROOM_REQUIRED');
});
test('unknown counters and ambiguous candidates never become assumed allowance',()=>{
 for(const poloniex_used of [undefined,null,-1,NaN,7.5,'7'])assert.equal(planN05NativeHeadroom({candidates,poloniex_used,htx_identity_used:0}).allowed,false);
 for(const bad of [[],['A-USDT','A-USDT'],['A-BTC'],[null]])assert.equal(planN05NativeHeadroom({candidates:bad,poloniex_used:0,htx_identity_used:0}).allowed,false);
 const before=JSON.stringify(candidates);planN05NativeHeadroom({candidates,poloniex_used:7,htx_identity_used:0});assert.equal(JSON.stringify(candidates),before);
});
