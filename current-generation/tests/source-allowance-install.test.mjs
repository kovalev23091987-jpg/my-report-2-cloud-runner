import test from 'node:test';
import assert from 'node:assert/strict';
import {installSourceAllowances,LIQUIDATION_ALLOWANCE_GENERATION} from '../files/src/liquidation-extension/install-source-allowances.mjs';
class DB{constructor(){this.statements=[];}prepare(sql){const self=this;return{bind(...args){self.statements.push({sql,args});return this;}}}async batch(items){return items.map(()=>({success:true,meta:{changes:1}}));}}
test('new generation receives isolated monthly scopes and time-bounded public LiqFlow pilot access',async()=>{
 const db=new DB(),out=await installSourceAllowances({db,now:Date.UTC(2026,8,27)});
 assert.equal(out.status,'CLOSED');assert.equal(out.generation,LIQUIDATION_ALLOWANCE_GENERATION);assert.ok(out.bindings.LIQFLOW);assert.equal(out.liqflow_access,'PUBLIC_PILOT_TIME_BOUNDED');
 for(const provider of ['HYPERLIQUID','GTRADE','LIGHTER','GMX']){assert.match(out.bindings[provider].scope_id,new RegExp(`${LIQUIDATION_ALLOWANCE_GENERATION}:202609:`));assert.equal(out.bindings[provider].config_fingerprint.length,64);}
 assert.deepEqual(out.provider_operational_caps,{HYPERLIQUID:10000,GTRADE:4000,LIGHTER:10000,GMX:8000,LIQFLOW:10000});
 assert.equal(out.combined_run_http_cap,5);assert.equal(out.automatic_topup,false);assert.equal(out.old_generation_scope_reuse,false);
});
test('LiqFlow gets a bounded reviewed scope only when its key is configured',async()=>{
 const out=await installSourceAllowances({db:new DB(),now:Date.UTC(2026,8,27),liqflow_key:'configured'});
 assert.ok(out.bindings.LIQFLOW);assert.equal(out.per_provider_operational_cap,10000);assert.equal(out.liqflow_access,'AUTHENTICATED');
});
test('after the public pilot LiqFlow is fail-closed until an API key is configured',async()=>{
 const out=await installSourceAllowances({db:new DB(),now:Date.UTC(2026,10,1),liqflow_key:''});
 assert.equal(out.bindings.LIQFLOW,undefined);assert.equal(out.liqflow_access,'DISABLED_API_KEY_REQUIRED');
});
