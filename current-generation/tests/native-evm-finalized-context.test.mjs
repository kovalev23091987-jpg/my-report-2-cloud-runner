import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.REPORT2_NATIVE_MODULE_ROOT?pathToFileURL(path.resolve(process.env.REPORT2_NATIVE_MODULE_ROOT)+'/'):new URL('../files/src/',import.meta.url);
const native=await import(new URL('native-evm-finalized-context.mjs',root));
const {collectFinalizedChainEvents}=await import(new URL('finalized-chain-events.mjs',root));
const {consumeBlockResultContext}=await import(new URL('block-result-context.mjs',root));
const {consumeEvidenceV2}=await import(new URL('evidence-v2.mjs',root));
const {planCandidateEvidenceRoutes,auditCandidateBlocks,collectCandidateEvidenceV2}=await import(new URL('candidate-evidence-v2-runtime.mjs',root));
const NOW=Date.parse('2026-10-07T16:00:00Z'),word=n=>'0x'+n.repeat(64),address=n=>'0x'+n.repeat(40),clone=x=>structuredClone(x);
const id=chain=>({chain,asset_kind:'NATIVE',native_asset_id:chain+':mainnet',contract_or_mint:null});
function proof(chain='ethereum'){
 const block={hash:word('a'),number:'0x100',timestamp:'0x'+Math.floor((NOW-14*60000)/1000).toString(16),gasUsed:'0xa410',gasLimit:'0x1c9c380',baseFeePerGas:'0x2',transaction_count:2};
 const samples=[0,1].map(i=>{const tx={hash:word(String(i+1)),transactionIndex:'0x'+i,blockHash:block.hash,blockNumber:block.number,from:address('1'),to:address(String(i+2)),value:'0xde0b6b3a7640000',input:'0x'};return{transaction:tx,receipt:{transactionHash:tx.hash,transactionIndex:tx.transactionIndex,blockHash:block.hash,blockNumber:block.number,from:tx.from,to:tx.to,status:i?'0x0':'0x1'}};});
 return{schema:'NATIVE_EVM_FINALIZED_BLOCK_AND_RECEIPTS_V1',chain,chain_id:native.NATIVE_EVM_NETWORKS[chain].chain_id,requested_block_tag:'finalized',source_clock_policy:'ORIGINAL_FINALIZED_BLOCK_TIMESTAMP',block,samples};
}
const normalize=(p=proof(),extra={})=>native.deriveNativeEvmFacts({contract:native.NATIVE_EVM_NETWORKS[p.chain].symbol+'-USDT',asset_identity:id(p.chain),proof:p,observed_ts:NOW,...extra});
function db(){const sql=new DatabaseSync(':memory:');return{sql,prepare(query){return{args:[],bind(...args){this.args=args;return this;},async run(){return sql.prepare(query).run(...this.args);},async first(){return sql.prepare(query).get(...this.args)||null;},async all(){return{results:sql.prepare(query).all(...this.args)};}};},async batch(rows){return Promise.all(rows.map(x=>x.run()));}};}
function transport(p=proof(),mutate){const calls=[];return{calls,fetch:async(url,init)=>{const messages=JSON.parse(init.body);calls.push({url,messages});let result=messages.map(m=>({jsonrpc:'2.0',id:m.id,result:m.method==='eth_chainId'?p.chain_id:m.method==='eth_getBlockByNumber'?{...p.block,transactions:p.samples.map(s=>s.transaction)}:p.samples.find(s=>s.transaction.hash===m.params[0])?.receipt??null}));if(mutate)result=mutate(result,messages,calls);return new Response(JSON.stringify(result),{status:200});}};}
const args=store=>({db:store,contract:'ETH-USDT',asset_identity:id('ethereum'),run_id:'controlled-native',now:NOW,clock:()=>NOW,request_admit:()=>({allowed:true,status:'RESERVED'})});
test('exact native network candidates preserve binding and only source-approved networks enter production event routes',()=>{
 for(const [chain,c] of [['ethereum','ETH-USDT'],['bsc','BNB-USDT'],['avalanche','AVAX-USDT']]){assert.ok(native.exactNativeEvmNetwork({contract:c,asset_identity:id(chain)}));assert.equal(planCandidateEvidenceRoutes({contract:c,asset_identity:id(chain)}).routes.some(r=>r.name==='CHAIN_EVENTS'),chain!=='avalanche');}
 for(const x of [{contract:'BTC-USDT',asset_identity:id('ethereum')},{contract:'ETH-USDT',asset_identity:{...id('ethereum'),contract_or_mint:address('1')}},{contract:'ETH-USDT',asset_identity:{...id('ethereum'),native_asset_id:'ethereum:testnet'}},{contract:'ETH-USDT',asset_identity:id('bsc')}])assert.equal(native.exactNativeEvmNetwork(x),null);
});
test('Ethereum execution base fee and successful native value are distinct exact original-clock facts',()=>{
 const r=normalize();assert.equal(r.status,'CLOSED');assert.deepEqual(r.evidence.map(x=>x.block_id),['N03','N04']);assert.equal(r.evidence[0].burned_base_units,'84000');assert.equal(r.evidence[1].amount_base_units,'1000000000000000000');assert.equal(r.evidence[0].source_ts,NOW-14*60000);assert.equal(r.evidence[0].expires_at,NOW+6*60000);
 assert.equal(consumeEvidenceV2(r.evidence,{base_interest:70,decision_ts:NOW}).adjustment,0);const facts=consumeBlockResultContext({contract:r.contract,evidence:r.evidence,now:NOW}).facts;assert.equal(facts.length,2);assert.deepEqual(facts.map(f=>f.block_id),['N03','N04']);assert.match(facts[0].value,/blob-комиссии/);assert.match(facts[1].value,/успешной транзакции/);
 const audit=auditCandidateBlocks({sources:{CHAIN_EVENTS:{...r,network_calls:2,receipts:[{status:'RECEIVED',http_status:200}]}},evidence:r.evidence,decision_ts:NOW});assert.equal(audit.blocks.N03.checked,true);assert.equal(audit.blocks.N04.checked,true);assert.equal(audit.blocks.N02.checked,false);
});
test('BNB and AVAX receipts are transfers without importing Ethereum burn rules',()=>{
 for(const chain of ['bsc','avalanche']){const r=normalize(proof(chain));assert.equal(r.status,'CLOSED');assert.deepEqual(r.evidence.map(x=>x.block_id),['N04']);const f=consumeBlockResultContext({contract:r.contract,evidence:r.evidence,now:NOW}).facts;assert.equal(f.length,1);assert.match(f[0].label,new RegExp(native.NATIVE_EVM_NETWORKS[chain].symbol));}
});
test('foreign chain finality, hash, index, failed receipt and future/stale clocks cannot fabricate transfers',()=>{
 for(const mutate of [p=>p.chain_id='0x5',p=>p.requested_block_tag='latest',p=>p.block.timestamp='0x'+Math.floor((NOW+1000)/1000).toString(16),p=>p.block.timestamp='0x'+Math.floor((NOW-20*60000-1000)/1000).toString(16),p=>p.samples[0].receipt.blockHash=word('b'),p=>p.samples[0].receipt.transactionIndex='0x1',p=>p.samples[0].receipt.from=address('3'),p=>p.samples.push(clone(p.samples[0])),p=>p.block.baseFeePerGas=null,p=>p.block.gasUsed='0xffffffffff']){
  const p=proof();mutate(p);assert.notEqual(normalize(p).status,'CLOSED');assert.equal(normalize(p).evidence.length,0);
 }
 const p=proof();p.samples[0].receipt.status='0x0';assert.equal(normalize(p).evidence.some(r=>r.block_id==='N04'),false);
});
test('consumer rebuilds bounded proof and rejects forged totals, identity, hashes or claimed directional weight',()=>{
 for(const mutate of [r=>r.burned_base_units='90000',r=>r.native_evm_proof.block.gasUsed='0x1',r=>r.source_ts++,r=>r.native_asset_id='bsc:mainnet',r=>r.source_clock_policy='OBSERVATION_NOW',r=>r.upstream_id='OTHER',r=>r.coverage_fraction=1,r=>r.directional_strength=.5,r=>r.entry_authorized=true,r=>r.native_evm_proof_sha256='0'.repeat(64)]){
  const row=clone(normalize().evidence[0]);mutate(row);assert.equal(native.verifiedNativeEvmContextRow(row,{now:NOW}),null);assert.equal(consumeBlockResultContext({contract:'ETH-USDT',evidence:[row],now:NOW}).facts.length,0);
 }
});
test('collector uses two admitted HTTP transports and at most four RPC methods then original clock cache uses zero',async()=>{
 const store=db(),t=transport(),r=await collectFinalizedChainEvents({...args(store),fetch_impl:t.fetch});assert.equal(r.status,'CLOSED');assert.equal(r.network_calls,2);assert.equal(r.logical_rpc_methods,4);assert.equal(t.calls.length,2);assert.deepEqual(t.calls[0].messages[1].params,['finalized',true]);assert.equal(t.calls[1].messages.every(m=>m.method==='eth_getTransactionReceipt'),true);
 const cached=await collectFinalizedChainEvents({...args(store),run_id:'cache-read',fetch_impl:()=>{throw Error('UNEXPECTED_HTTP');}});assert.equal(cached.network_calls,0);assert.equal(cached.cache_status,'VALIDATED_ORIGINAL_CLOCK_CACHE');assert.equal(cached.evidence[0].source_ts,r.evidence[0].source_ts);assert.equal(cached.evidence[0].observed_ts,r.evidence[0].observed_ts);
});
test('whole-job, source daily and provider minute admission denies before transport without resetting caps',async()=>{
 const store=db();let calls=0;const denied=await native.collectNativeEvmFinalizedContext({...args(store),request_admit:()=>({allowed:false,status:'WHOLE_JOB_CAP'}),fetch_impl:()=>{calls++;}});assert.equal(denied.status,'WHOLE_JOB_CAP');assert.equal(calls,0);
 const t=transport();for(let i=0;i<3;i++){const r=await native.collectNativeEvmFinalizedContext({...args(store),run_id:'burst'+i,strict_fresh_manual:true,fetch_impl:t.fetch});assert.equal(r.status,'CLOSED');}
 const last=await native.collectNativeEvmFinalizedContext({...args(store),run_id:'burst-denied',strict_fresh_manual:true,fetch_impl:t.fetch});assert.equal(last.status,'ROLLING_60S_CAP_REACHED');assert.equal(t.calls.length,6);
 store.sql.prepare("UPDATE report2_evidence_source_daily SET attempts=720 WHERE source='CHAIN_RPC'").run();const day=await native.collectNativeEvmFinalizedContext({...args(store),run_id:'day-denied',strict_fresh_manual:true,now:NOW+60001,clock:()=>NOW+60001,fetch_impl:t.fetch});assert.equal(day.network_calls,0);assert.equal(t.calls.length,6);assert.equal(store.sql.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='CHAIN_RPC'").get().attempts,720);
});
test('malformed or duplicated RPC replies and wrong chain stop before receipt request',async()=>{
 for(const mutate of [(rows,msg)=>msg[0].method==='eth_chainId'?[...rows,clone(rows[0])]:rows,rows=>rows.map(r=>r.id===1?{...r,result:'0x5'}:r),rows=>rows.map(r=>r.id===2?{...r,result:{...r.result,transactions:[r.result.transactions[0],r.result.transactions[0]]}}:r)]){
  const t=transport(proof(),mutate),r=await native.collectNativeEvmFinalizedContext({...args(db()),fetch_impl:t.fetch});assert.notEqual(r.status,'CLOSED');assert.equal(t.calls.length,1);assert.equal(r.evidence.length,0);
 }
});
test('missing selected receipt is unknown state with no evidence rather than zero native activity',async()=>{
 const t=transport(proof(),(rows,msg)=>msg[0].method==='eth_getTransactionReceipt'?rows.map(r=>({...r,result:null})):rows),r=await native.collectNativeEvmFinalizedContext({...args(db()),fetch_impl:t.fetch});assert.equal(r.status,'EXACT_SELECTED_TRANSACTION_RECEIPT_REQUIRED');assert.equal(r.evidence.length,0);assert.equal(r.network_calls,2);
});
test('bounded provider denial is cached as backoff without repeated network or false closure',async()=>{
 const store=db();let calls=0;const fetch_impl=async()=>{calls++;return new Response('[]',{status:429});};const r=await native.collectNativeEvmFinalizedContext({...args(store),fetch_impl});assert.notEqual(r.status,'CLOSED');const next=await native.collectNativeEvmFinalizedContext({...args(store),run_id:'backoff',fetch_impl});assert.equal(next.status,'SOURCE_ACCESS_OR_RATE_BACKOFF');assert.equal(next.network_calls,0);assert.equal(calls,1);
});
test('invalid cached row is reread and expired original block is not renewed to current source time',async()=>{
 const store=db(),t=transport();await native.collectNativeEvmFinalizedContext({...args(store),fetch_impl:t.fetch});const cache=store.sql.prepare("SELECT payload_json FROM report2_evidence_source_cache WHERE asset_key LIKE 'native-evm-finalized-context%ETH-USDT'").get(),p=JSON.parse(cache.payload_json);p.evidence[0].burned_base_units='1';store.sql.prepare("UPDATE report2_evidence_source_cache SET payload_json=? WHERE asset_key LIKE 'native-evm-finalized-context%ETH-USDT'").run(JSON.stringify(p));
 const fresh=await native.collectNativeEvmFinalizedContext({...args(store),run_id:'tamper-reread',fetch_impl:t.fetch});assert.equal(fresh.status,'CLOSED');assert.equal(fresh.network_calls,2);
 const late=await native.collectNativeEvmFinalizedContext({...args(db()),run_id:'late',now:NOW+7*60000,clock:()=>NOW+7*60000,fetch_impl:transport().fetch});assert.notEqual(late.status,'CLOSED');assert.equal(late.evidence.length,0);
});
test('aggregate transport count equals actual guard count including optional pageview, calendar and schedule routes',async()=>{
 const store=db(),calls=[];const now=Date.now(),r=await collectCandidateEvidenceV2({db:store,contract:'ADA-USDT',asset_identity:id('cardano'),run_id:'aggregate-optional-count',now,clock:()=>now,max_requests:28,request_admit:()=>({allowed:true,status:'RESERVED'}),fetch_impl:async(url)=>{calls.push(String(url));return new Response('{}',{status:502});}});
 assert.ok(calls.some(u=>u.includes('wikimedia.org')));assert.equal(r.network_calls,calls.length);assert.equal(r.network_calls,r.shared_http_envelope.actual_http);assert.ok(r.network_calls<=28);
});
test('assembled canonical report renders both neutral native blocks with unchanged score, direction and publication state',async()=>{
 if(!process.env.REPORT2_NATIVE_MODULE_ROOT)return;
 const {buildRuntimeCanonicalBundle}=await import(new URL('canonical-runtime-adapter.mjs',root)),{confirmedBlockContextFacts,auditRenderedBlockResults}=await import(new URL('block-result-context.mjs',root)),r=normalize(),input={contract:'ETH-USDT',run_id:'CONTROLLED_NATIVE_RECEIPTS_NO_MAIN',snapshot_id:'CONTROLLED_NATIVE_RECEIPTS_NO_MAIN:ETH',observed_ts:NOW,discovery_row:{current_price:10},publication_shadow:{entry_signal:{state:'REJECTED',direction:'LONG'}}},before=buildRuntimeCanonicalBundle(input),after=buildRuntimeCanonicalBundle({...input,internal_market_context:{internal_only:true,evidence_v2:{...r,block_coverage:auditCandidateBlocks({evidence:r.evidence,sources:{CHAIN_EVENTS:{...r,network_calls:2,receipts:[{http_status:200,status:'RECEIVED'}]}},decision_ts:NOW})},candidate_context:{asset_identity:id('ethereum')}}});
 assert.deepEqual(after.canonical.scores,before.canonical.scores);assert.equal(after.canonical.direction,before.canonical.direction);assert.equal(after.canonical.state,before.canonical.state);assert.deepEqual(after.block_rendered_results.used_context_block_ids.sort(),['N03','N04']);assert.match(after.manual.text,/Сжигание базовой комиссии/);assert.match(after.manual.text,/Подтверждённый перевод/);
 const stale=clone(after.canonical);stale.observed_ts=NOW+6*60000+1;assert.equal(confirmedBlockContextFacts(stale).length,0);assert.equal(auditRenderedBlockResults({canonical:stale,manual:after.manual}).used_context_block_ids.length,0);
});
test('a truly empty bounded native block is cached with original finality clock and never becomes market zero-flow evidence',async()=>{
 const store=db(),p=proof('avalanche');p.block.transaction_count=0;p.samples=[];const tr=transport(p),a={...args(store),contract:'AVAX-USDT',asset_identity:id('avalanche')},r=await native.collectNativeEvmFinalizedContext({...a,fetch_impl:tr.fetch});assert.equal(r.status,'CLOSED');assert.equal(r.evidence.length,0);assert.equal(r.network_calls,1);const cached=await native.collectNativeEvmFinalizedContext({...a,run_id:'empty-cache',fetch_impl:()=>{throw Error('REPEATED_EMPTY_NATIVE_HTTP');}});assert.equal(cached.status,'CLOSED');assert.equal(cached.evidence.length,0);assert.equal(cached.network_calls,0);assert.equal(cached.source_ts,r.source_ts);assert.equal(cached.observed_ts,r.observed_ts);assert.equal(cached.summary.net_market_flow_verified,false);
});
