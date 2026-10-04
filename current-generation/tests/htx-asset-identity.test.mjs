import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {normalizeHtxAssetReferences,collectHtxAssetIdentity,collectHtxBoundSupplementalContext} from '../files/src/htx-asset-identity.mjs';
import {createUnifiedHttpBudget} from '../files/src/unified-budget.mjs';
const address='0x'+'1'.repeat(40),secondAddress='0x'+'2'.repeat(40),mint='pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn';
class D1{
 constructor(){this.sql=new DatabaseSync(':memory:');}
 prepare(sql){const db=this;const stmt=args=>({bind:(...next)=>stmt(next),async run(){const r=db.sql.prepare(sql).run(...args);return{meta:{changes:r.changes}};},async first(){return db.sql.prepare(sql).get(...args)||null;}});return stmt([]);}
 async batch(rows){const out=[];for(const row of rows)out.push(await row.run());return out;}
}
const token=(currency,baseChain,contractAddress)=>({currency,chains:[{baseChain,contractAddress}]});
const response={code:200,data:[token('pump','SOLANA',mint),token('pepe','ETH',address),token('near','NEAR','')]};
test('official HTX exact currency and chain address are required; duplicate, native and ambiguous mappings stay closed',()=>{
 const r=normalizeHtxAssetReferences(response);assert.equal(r.entries.PUMP.status,'CLOSED');assert.equal(r.entries.PUMP.identities[0].contract_or_mint,mint);assert.equal(r.entries.NEAR.status,'NATIVE_OR_UNSUPPORTED_HTX_ASSET');
 const duplicate=normalizeHtxAssetReferences({code:200,data:[token('abc','ETH',address),token('abc','ETH',secondAddress)]});assert.equal(duplicate.entries.ABC.status,'DUPLICATE_HTX_CURRENCY');
 for(const chains of [[{baseChain:'ETH',contractAddress:address},{baseChain:'BSC',contractAddress:secondAddress}],[{baseChain:'NEAR',contractAddress:''},{baseChain:'ETH',contractAddress:address}]]){
  assert.notEqual(normalizeHtxAssetReferences({code:200,data:[{currency:'abc',chains}]}).entries.ABC.status,'CLOSED');
 }
 assert.equal(normalizeHtxAssetReferences({code:400,data:response.data}).status,'INVALID_HTX_REFERENCE_RESPONSE');
});
test('one bounded HTX reference fetch serves both exact candidates and preserves Solana case',async()=>{
 const db=new D1(),budget=createUnifiedHttpBudget();let calls=0;
 const params={db,request_admit:budget.reserve,run_id:'RUN',now:1000,clock:()=>1100,fetch_impl:async()=>{calls++;return{ok:true,status:200,json:async()=>response};}};
 const a=await collectHtxAssetIdentity({...params,contract:'PUMP-USDT'}),b=await collectHtxAssetIdentity({...params,contract:'PEPE-USDT',now:1200});
 assert.equal(a.status,'CLOSED');assert.equal(a.identity.chain,'solana');assert.equal(a.identity.contract_or_mint,mint);
 assert.equal(b.status,'CLOSED');assert.equal(b.identity.chain,'ethereum');assert.equal(b.network_calls,0);assert.equal(calls,1);assert.equal(budget.summary().total,1);
 assert.equal(db.sql.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='HTX_ASSET_REFERENCE'").get().attempts,1);
 const missing=await collectHtxAssetIdentity({...params,contract:'OTHER-USDT',now:1200});assert.equal(missing.status,'HTX_CURRENCY_NOT_FOUND');assert.equal(missing.identity,null);
});
test('reference admission and provider failure never emit a verified identity',async()=>{
 const db=new D1();let calls=0;
 const none=await collectHtxAssetIdentity({db,contract:'PUMP-USDT',run_id:'NO_ADMISSION',fetch_impl:async()=>{calls++;}});assert.equal(none.identity,null);assert.equal(calls,0);
 const invalid=await collectHtxAssetIdentity({db,contract:'PUMP-USDT',run_id:'INVALID',request_admit:createUnifiedHttpBudget().reserve,fetch_impl:async()=>{calls++;return{ok:true,status:200,json:async()=>({code:200,data:[token('pump','UNKNOWN',mint)]})};}});
 assert.notEqual(invalid.status,'CLOSED');assert.equal(invalid.identity,null);assert.equal(calls,1);
});
test('main supplemental collector receives only authoritative fallback identity and preserves registry metadata',async()=>{
 const db=new D1(),registry={PUMP:{official_name:'Pump.fun',official_domains:['pump.fun']}},budget=createUnifiedHttpBudget();let captured;
 const result=await collectHtxBoundSupplementalContext({db,registry,contract:'PUMP-USDT',run_id:'MAIN',now:1000,clock:()=>1100,request_admit:budget.reserve,fetch_impl:async()=>({ok:true,status:200,json:async()=>response}),supplemental_collect:async p=>{captured=p;return{network_calls:2,asset_identity:p.registry.PUMP,asset_metadata:{official_feeds:[]}};}});
 assert.equal(captured.allow_identity_discovery,false);assert.equal(captured.registry.PUMP.contract_or_mint,mint);assert.deepEqual(captured.registry.PUMP.official_domains,['pump.fun']);assert.equal(registry.PUMP.contract_or_mint,undefined);
 assert.equal(result.identity_method,'HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS');assert.equal(result.total_network_calls,3);assert.deepEqual(result.asset_metadata.official_feeds,[]);
});
test('configured exact bindings and postponed liquidation-only mode do not spend reference requests',async()=>{
 for(const options of [{registry:{PUMP:{chain:'solana',contract_or_mint:mint}}},{registry:{},reference_enabled:false}]){
  const r=await collectHtxBoundSupplementalContext({...options,contract:'PUMP-USDT',run_id:'SKIP',fetch_impl:async()=>{throw Error('must not fetch');},supplemental_collect:async()=>({status:'UNCHANGED'})});assert.equal(r.status,'UNCHANGED');assert.equal(r.asset_reference,undefined);
 }
 const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');assert.match(runner,/reference_enabled:expectedManualMode!=='LIQUIDATION_ONLY'/);
});
