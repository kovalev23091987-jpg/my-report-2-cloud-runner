import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeChainSupply,collectChainSupplyEvidence} from '../files/src/chain-supply-evidence.mjs';
import {DatabaseSync} from 'node:sqlite';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';
import {SOLANA_MAINNET_GENESIS} from '../files/src/solana-native-supply.mjs';
const T=1791176000000,address='0x0000000000000000000000000000000000000001',mint='So11111111111111111111111111111111111111112';
function sample(chain,delta=0,native=false){
 const identity=native?{chain,asset_kind:'NATIVE',native_asset_id:`${chain}:mainnet`,contract_or_mint:null}:{chain,contract_or_mint:chain==='solana'?mint:address};
 const contract=native?({near:'NEAR-USDT',solana:'SOL-USDT'}[chain]):'龙虾-USDT',decimals=native?(chain==='near'?24:9):18;
 const current={supply:String(1000000000000000000000n+BigInt(delta)),decimals,block_ref:'102',source_ts:T-1000,finalized:true,...(native&&chain==='solana'?{genesis_hash:SOLANA_MAINNET_GENESIS,commitment:'finalized'}:{})},previous={chain,address:native?'native:mainnet':identity.contract_or_mint,supply:'1000000000000000000000',decimals,block_ref:'100',source_ts:T-60000,finalized:true};
 return{contract,identity,current,previous,observed_ts:T};
}
test('one general producer/consumer admits bounded N03 checks across all existing supported chains, Unicode and native identities',()=>{
 for(const [chain,native] of [...['ethereum','bsc','arbitrum','base','polygon','optimism','avalanche','solana'].map(x=>[x,false]),['near',true],['solana',true]]){
  const p=sample(chain,0,native),r=normalizeChainSupply(p),facts=consumeBlockResultContext({evidence:r.evidence,contract:p.contract,now:T}).facts;
  const f=facts.find(x=>x.block_id==='N03');assert.ok(f,`${chain}/${native}`);assert.match(f.value,/изменения предложения нет/);assert.match(f.value,/только интервал/);assert.match(f.value,/выкуп не подтверждены/);assert.equal(f.directional_vote,false);assert.equal(f.score_contribution,0);assert.equal(consumeEvidenceV2(r.evidence,{decision_ts:T,base_interest:70}).adjustment,0);
 }
});
test('increases yield a bounded non-decrease check; decreases keep the original N03 fact without duplicating it',()=>{
 for(const delta of [5,-5]){const p=sample('ethereum',delta),r=normalizeChainSupply(p),facts=consumeBlockResultContext({evidence:r.evidence,contract:p.contract,now:T}).facts.filter(x=>x.block_id==='N03');assert.equal(facts.length,1);assert.match(facts[0].value,delta>0?/снижения нет, рост/:/изменение на −/);}
});
test('same block, foreign identity/decimals, missing history and unfinalized history never establish a comparison',()=>{
 for(const mutate of [p=>p.previous=null,p=>p.previous.block_ref=p.current.block_ref,p=>p.previous.address=address.replace(/1$/,'2'),p=>p.previous.decimals=17,p=>p.previous.finalized=false,p=>p.previous.source_ts=p.current.source_ts]){const p=sample('ethereum');mutate(p);const r=normalizeChainSupply(p);assert.equal(r.evidence.some(x=>x.block_id==='N03'),false);}
});
test('consumer rejects corrupt comparison proofs, causal claims and stale/foreign facts',()=>{
 const p=sample('ethereum'),r=normalizeChainSupply(p),row=r.evidence.find(x=>x.block_id==='N03');
 for(const mutate of [x=>x.burn_verified=true,x=>x.buyback_verified=true,x=>x.change_cause_verified=true,x=>x.supply_delta_base_units='1',x=>x.previous_block_ref=x.block_ref,x=>x.previous_source_ts=x.source_ts,x=>x.upstream_id='FOREIGN',x=>x.asset_id='foreign',x=>x.htx_contract='FOREIGN-USDT',x=>x.expires_at=0]){const x=structuredClone(row);mutate(x);assert.equal(consumeBlockResultContext({evidence:[x],contract:p.contract,now:T}).facts.length,0);}
});
test('migration retains the actual v6 finalized baseline instead of silently resetting comparison history',async()=>{
 const sql=new DatabaseSync(':memory:'),db={prepare(q){return{args:[],bind(...a){this.args=a;return this;},async run(){return sql.prepare(q).run(...this.args);},async first(){return sql.prepare(q).get(...this.args)||null;}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};
 const {installEvidenceSourceStore,writeEvidenceSourceCache}=await import('../files/src/evidence-source-store.mjs');await installEvidenceSourceStore(db);
 const p=sample('ethereum');p.current.block_ref='0x66';p.previous.block_ref='0x64';const prior={version:'chain-supply-evidence-v6-native-solana-20261004',status:'CLOSED',summary:{finalized:true},current_observation:p.previous};
 await writeEvidenceSourceCache(db,{source:'CHAIN_RPC',asset_key:`ethereum:${address}`,observed_ts:T-60000,expires_ts:T+100000,payload:prior});
 let calls=0;const fetch_impl=async(url,opts)=>{calls++;const b=JSON.parse(opts.body);return new Response(JSON.stringify(Array.isArray(b)?[{id:2,result:'0x12'},{id:1,result:'0x'+BigInt(p.current.supply).toString(16)}]:{result:b.method==='eth_chainId'?'0x1':{number:p.current.block_ref,timestamp:'0x'+Math.floor(p.current.source_ts/1000).toString(16)}}));};
 const r=await collectChainSupplyEvidence({db,fetch_impl,request_admit:()=>({allowed:true}),asset_identity:p.identity,contract:p.contract,run_id:'MIGRATION',now:T,clock:()=>T,strict_fresh_manual:true});assert.equal(r.status,'CLOSED');assert.equal(calls,3);assert.ok(r.evidence.some(x=>x.block_id==='N03'&&x.previous_block_ref===p.previous.block_ref));sql.close();
});
