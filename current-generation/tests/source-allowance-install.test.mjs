import test from 'node:test';
import assert from 'node:assert/strict';
import {installSourceAllowances,LIQUIDATION_ALLOWANCE_GENERATION} from '../files/src/liquidation-extension/install-source-allowances.mjs';
class DB{constructor(){this.statements=[];}prepare(sql){const self=this;return{bind(...args){self.statements.push({sql,args});return this;}}}async batch(items){return items.map(()=>({success:true,meta:{changes:1}}));}}
test('new generation receives isolated monthly scopes and time-bounded public LiqFlow pilot access',async()=>{
 const db=new DB(),out=await installSourceAllowances({db,now:Date.UTC(2026,8,27)});
 assert.equal(out.status,'CLOSED');assert.equal(out.generation,LIQUIDATION_ALLOWANCE_GENERATION);assert.ok(out.bindings.LIQFLOW);assert.equal(out.liqflow_access,'PUBLIC_PILOT_TIME_BOUNDED');
 for(const provider of ['HYPERLIQUID','GTRADE','LIGHTER','GMX']){assert.match(out.bindings[provider].scope_id,new RegExp(`${LIQUIDATION_ALLOWANCE_GENERATION}:202609:`));assert.equal(out.bindings[provider].config_fingerprint.length,64);}
 assert.deepEqual(out.provider_operational_caps,{HYPERLIQUID:10000,GTRADE:4000,LIGHTER:10000,GMX:8000,LIQFLOW:10000});
 assert.equal(out.combined_run_http_cap,5);assert.equal(out.automatic_topup,false);assert.equal(out.old_generation_scope_reuse,false);assert.equal(out.previous_generation_usage_reconciled,true);
 assert.ok(db.statements.some(x=>x.sql.includes('SUM(reserved_units)')));
});
test('LiqFlow gets a bounded reviewed scope only when its key is configured',async()=>{
 const out=await installSourceAllowances({db:new DB(),now:Date.UTC(2026,8,27),liqflow_key:'configured'});
 assert.ok(out.bindings.LIQFLOW);assert.equal(out.per_provider_operational_cap,10000);assert.equal(out.liqflow_access,'AUTHENTICATED');
});
test('after the public pilot LiqFlow is fail-closed until an API key is configured',async()=>{
 const out=await installSourceAllowances({db:new DB(),now:Date.UTC(2026,10,1),liqflow_key:''});
 assert.equal(out.bindings.LIQFLOW,undefined);assert.equal(out.liqflow_access,'DISABLED_API_KEY_REQUIRED');
});
test('0xArchive receives an exact request binding only when its existing key and credit scope are configured',async()=>{
 const off=await installSourceAllowances({db:new DB(),now:Date.UTC(2026,8,27)});assert.equal(off.bindings.OXARCHIVE,undefined);assert.equal(off.oxarchive_access,'DISABLED_API_KEY_REQUIRED');
 const on=await installSourceAllowances({db:new DB(),now:Date.UTC(2026,8,27),oxarchive_key:'configured'});assert.ok(on.bindings.OXARCHIVE);assert.equal(on.provider_operational_caps.OXARCHIVE,5000);assert.equal(on.oxarchive_access,'AUTHENTICATED_OWN_CREDIT_LEDGER');
});

test('alternative keyless discovery is explicit, capped and reconciles prior reservations without top-up',async()=>{
 const db=new DB(),out=await installSourceAllowances({db,now:Date.UTC(2026,9,7),enable_swole_discovery:true});assert.ok(out.bindings.SWOLE_DISCOVERY);assert.equal(out.provider_operational_caps.SWOLE_DISCOVERY,1000);assert.equal(out.swole_discovery_access,'PUBLIC_KEYLESS_NATIVE_REREAD_REQUIRED');assert.equal(out.automatic_topup,false);
 assert.ok(db.statements.some(x=>x.sql.includes('SUM(reserved_units)')&&x.args[1]==='SWOLE_DISCOVERY'));assert.equal((await installSourceAllowances({db:new DB(),now:Date.UTC(2026,9,7)})).bindings.SWOLE_DISCOVERY,undefined);
});
