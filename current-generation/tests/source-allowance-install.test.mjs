import test from 'node:test';
import assert from 'node:assert/strict';
import {installSourceAllowances,LIQUIDATION_ALLOWANCE_GENERATION} from '../files/src/liquidation-extension/install-source-allowances.mjs';
class DB{constructor(){this.statements=[];}prepare(sql){const self=this;return{bind(...args){self.statements.push({sql,args});return this;}}}async batch(items){return items.map(()=>({success:true,meta:{changes:1}}));}}
test('new generation receives isolated monthly scopes and no silent LiqFlow allowance without a key',async()=>{
 const db=new DB(),out=await installSourceAllowances({db,now:Date.UTC(2026,8,27)});
 assert.equal(out.status,'CLOSED');assert.equal(out.generation,LIQUIDATION_ALLOWANCE_GENERATION);assert.equal(out.bindings.LIQFLOW,undefined);
 for(const provider of ['HYPERLIQUID','GTRADE','LIGHTER','GMX']){assert.match(out.bindings[provider].scope_id,/DYNAMIC_PANEL_V3_20260927:202609:/);assert.equal(out.bindings[provider].config_fingerprint.length,64);}
 assert.equal(out.combined_run_http_cap,5);assert.equal(out.automatic_topup,false);assert.equal(out.old_generation_scope_reuse,false);
});
test('LiqFlow gets a bounded reviewed scope only when its key is configured',async()=>{
 const out=await installSourceAllowances({db:new DB(),now:Date.UTC(2026,8,27),liqflow_key:'configured'});
 assert.ok(out.bindings.LIQFLOW);assert.equal(out.per_provider_operational_cap,10000);
});
