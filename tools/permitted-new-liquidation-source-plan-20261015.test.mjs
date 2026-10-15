import test from 'node:test';
import assert from 'node:assert/strict';
import {permittedResearchPlan as plan,selectVikeResearchAsset as select,vikeResearchTargets as targets} from './permitted-new-liquidation-source-plan-20261015.mjs';
const approved=new Set(['BTC','ETH','SOL','BANK','龙虾',...Array.from({length:100},(_,i)=>'A'+i)]);
const row=(coin,count=4)=>({coin,count,total_value:count*1000});
test('blocked and unconfigured routes refuse before provider/D1, even with a key',()=>{
 assert.equal(plan('pumpglass',{vike_key:'vk_'+'a'.repeat(30)}).allowed,false);
 for(const key of ['',undefined,'vk_short','"vk_abc"','vk_abc\n'+'a'.repeat(30)])assert.equal(plan('vike',{vike_key:key}).allowed,false);
 assert.equal(plan('unknown').allowed,false);assert.equal(plan('vike',{vike_key:'vk_'+'a'.repeat(30)}).maximum_provider_HTTP,3);
 const h=plan('hyperperps');assert.equal(h.targets.length,1);assert.equal(h.targets[0].requested,'SOL');assert.equal(h.independent_of_existing_Hyperliquid,false);
});
test('catalog selects an exact approved gap before SOL; rejects aliases, scaled symbols and BTC/ETH levels',()=>{
 const s=select([row('BTC'),row('ETH'),row('kBANK'),row('SOL'),row('BANK')],{approved_assets:approved,gap_contracts:['BANK-USDT','龙虾-USDT']});
 assert.equal(s.asset,'BANK');assert.equal(s.selected_for_historical_gap,true);assert.equal(s.numeric_future_coverage_claimed,false);
 assert.deepEqual(s.exact_unscaled_approved_catalog_assets,['BANK','SOL']);assert.equal(targets(s).length,2);
 assert.ok(targets(s).every(t=>t.requested==='BANK'&&!/BTC|ETH/.test(t.url)));
});
test('empty positions do not establish availability; duplicate catalogs and foreign gaps stop selection',()=>{
 assert.equal(select([row('BANK',0),row('kBANK')],{approved_assets:approved,gap_contracts:['BANK-USDT']}).asset,null);
 const fallback=select([row('SOL'),row('BANK',0)],{approved_assets:approved,gap_contracts:['BANK-USDT']});assert.equal(fallback.asset,'SOL');assert.equal(fallback.selected_for_historical_gap,false);
 assert.throws(()=>select([row('BANK'),row('BANK')],{approved_assets:approved,gap_contracts:[]}));
 assert.throws(()=>select([row('SOL')],{approved_assets:approved,gap_contracts:['ETH-USDT']}));
 assert.throws(()=>targets({...fallback,asset:'BTC'}));
});
