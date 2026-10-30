import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const load=n=>import(process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${n}`):new URL(`../files/src/${n}`,import.meta.url));
const {collectFinalizedChainEvents,FINALIZED_CHAIN_EVENTS_VERSION,decodeFinalizedSolanaTransaction,decodeFinalizedNativeSolanaTransaction}=await load('finalized-chain-events.mjs');
const {collectXrplNativePayments,normalizeXrplNativePayments,XRPL_PAYMENTS_VERSION}=await load('xrpl-native-payments.mjs');
const {installEvidenceSourceStore,writeEvidenceSourceCache}=await load('evidence-source-store.mjs');
const {consumeBlockResultContext}=await load('block-result-context.mjs');
// Retained BTW facts keep their historical source clocks. The result/cache
// envelope is controlled: the original full producer response is not retained.
const btw=JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url)));
const original=btw.canonical.metadata.internal_market_context.evidence_v2.evidence.filter(r=>r.block_id==='N04'&&r.producer==='FINALIZED_ERC20_EVENTS');
assert.ok(original.length);
const T=Math.max(...original.map(r=>r.observed_ts))+1,TTL=1200000,SIG='1'.repeat(64),MINT='JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
function database(){
 const sqlite=new DatabaseSync(':memory:');let unknown=0,hook=()=>{};const log=[];
 return{sqlite,log,markUnknown:()=>unknown=1,setHook:f=>hook=f,usageSnapshot:()=>({unknown_ops:unknown}),prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async first(){log.push({sql,after_unknown:unknown>0});const r=sqlite.prepare(sql).get(...this.args)||null;hook(sql,this.args);return r;},async run(){log.push({sql,after_unknown:unknown>0});return sqlite.prepare(sql).run(...this.args);}};},async batch(rows){const out=[];for(const r of rows)out.push(await r.run());return out;}};
}
const tokenTransaction={slot:321,blockTime:Math.floor(T/1000)-10,meta:{err:null,preTokenBalances:[{accountIndex:0,mint:MINT,uiTokenAmount:{amount:'100'}},{accountIndex:1,mint:MINT,uiTokenAmount:{amount:'0'}}],postTokenBalances:[{accountIndex:0,mint:MINT,uiTokenAmount:{amount:'50'}},{accountIndex:1,mint:MINT,uiTokenAmount:{amount:'50'}}]}};
const nativeTransaction={slot:321,blockTime:Math.floor(T/1000)-10,meta:{err:null,innerInstructions:[]},transaction:{message:{instructions:[{program:'system',parsed:{type:'transfer',info:{source:'A'.repeat(32),destination:'B'.repeat(32),lamports:25}}}]}}};
const modes={
 evm:{contract:original[0].htx_contract,identity:{asset_kind:'TOKEN',chain:original[0].chain,contract_or_mint:original[0].token_address},evidence:original,summary:{mode:'TOKEN_TRANSFER',chain:original[0].chain,scope:'LAST_256_FINALIZED_BLOCKS_ONE_TIMED_EVENT_BLOCK',confirmed_timed_events:original.length}},
 'sol-token':{contract:'JUP-USDT',identity:{asset_kind:'TOKEN',chain:'solana',contract_or_mint:MINT},evidence:decodeFinalizedSolanaTransaction({transaction:tokenTransaction,mint:MINT,signature:SIG,observed_ts:T,contract:'JUP-USDT'}),summary:{mode:'TOKEN_TRANSFER',scope:'LAST_20_FINALIZED_SIGNATURES_ONE_TRANSACTION',matching_signatures:1,sampled_signature:SIG,confirmed_timed_events:1}},
 'sol-native':{contract:'SOL-USDT',identity:{asset_kind:'NATIVE',chain:'solana',native_asset_id:'solana:mainnet',contract_or_mint:null},evidence:decodeFinalizedNativeSolanaTransaction({transaction:nativeTransaction,signature:SIG,observed_ts:T,contract:'SOL-USDT'}),summary:{mode:'NATIVE_TRANSFER',scope:'LAST_20_FINALIZED_SYSTEM_PROGRAM_SIGNATURES_UP_TO_THREE_TRANSACTIONS',sampled_signatures:[SIG],confirmed_timed_events:1}},
};
async function setup(kind,mutate=r=>r){
 const d=database();await installEvidenceSourceStore(d);const c=modes[kind],{contract,identity}=c;
 const key=kind==='sol-native'?`FINAL_EVENTS:${FINALIZED_CHAIN_EVENTS_VERSION}:${contract}:solana:NATIVE_TRANSFER`:`FINAL_EVENTS:${FINALIZED_CHAIN_EVENTS_VERSION}:${contract}:${identity.chain}:TOKEN_TRANSFER:${identity.contract_or_mint}`;
 await writeEvidenceSourceCache(d,{source:'CHAIN_RPC',asset_key:key,observed_ts:T,expires_ts:T+TTL,payload:mutate({version:FINALIZED_CHAIN_EVENTS_VERSION,status:'CLOSED',evidence:structuredClone(c.evidence),summary:structuredClone(c.summary)})});
 let grants=0,calls=0;const p={db:d,contract,asset_identity:identity,run_id:'N04_CACHE_SCOPE',now:T,clock:()=>T,request_admit:()=>{grants++;return{allowed:false,status:'CONTROLLED_CALLER_DENIED'};},fetch_impl:async()=>{calls++;throw Error('LIVE_SOURCE_FORBIDDEN');}};
 return{d,p,counts:()=>({grants,calls})};
}
for(const kind of Object.keys(modes))test(`${kind} exact cache keeps original facts and existing consumer without a new attempt`,async()=>{
 const {d,p,counts}=await setup(kind);try{const r=await collectFinalizedChainEvents(p);assert.deepEqual(r.evidence,modes[kind].evidence);assert.deepEqual(counts(),{grants:0,calls:0});assert.equal(r.network_calls,0);assert.ok(consumeBlockResultContext({contract:p.contract,evidence:r.evidence,now:T}).facts.length);}finally{d.sqlite.close();}
});
const mutations={
 'foreign contract':r=>{r.evidence[0].htx_contract='FOREIGN-USDT';return r;},
 'foreign asset':r=>{r.evidence[0].asset_id='foreign:token';return r;},
 'foreign provider':r=>{r.evidence[0].provider_id='OTHER';return r;},
 'future observed clock':r=>{r.evidence[0].observed_ts=T+1;return r;},
 'future knowledge clock':r=>{r.evidence[0].first_known_ts=T+1;return r;},
 'expired original inside live envelope':r=>{r.evidence[0].expires_at=T-1;return r;},
};
for(const kind of Object.keys(modes))for(const [name,mutate] of Object.entries(mutations))test(`${kind} rejects ${name} without suppressing normal admission`,async()=>{
 const {d,p,counts}=await setup(kind,r=>{const one={...r,evidence:[r.evidence[0]]};return mutate(one);});try{const r=await collectFinalizedChainEvents(p);assert.equal(r.evidence.length,0);assert.equal(r.status,'CONTROLLED_CALLER_DENIED');assert.deepEqual(counts(),{grants:1,calls:0});}finally{d.sqlite.close();}
});
test('a valid original sibling survives one foreign cache row without refreshing its source clock',async()=>{
 const {d,p,counts}=await setup('evm',r=>{r.evidence.push({...structuredClone(r.evidence[0]),asset_id:'foreign'});return r;});try{const r=await collectFinalizedChainEvents(p);assert.deepEqual(r.evidence,original);assert.deepEqual(counts(),{grants:0,calls:0});}finally{d.sqlite.close();}
});
test('Solana mint comparison remains case sensitive',async()=>{
 const {d,p,counts}=await setup('sol-token',r=>{r.evidence[0].token_address=MINT.toLowerCase();return r;});try{const r=await collectFinalizedChainEvents(p);assert.equal(r.evidence.length,0);assert.deepEqual(counts(),{grants:1,calls:0});}finally{d.sqlite.close();}
});
test('a verified empty bounded EVM query stays cached without inventing a zero-flow fact',async()=>{
 const {d,p,counts}=await setup('evm',r=>({...r,evidence:[],summary:{...r.summary,confirmed_timed_events:0,matching_logs:0,empty_sample:true,finalized_block:'0x100',window_start_block:'0x1'}}));try{const r=await collectFinalizedChainEvents(p);assert.equal(r.status,'CLOSED');assert.deepEqual(r.evidence,[]);assert.deepEqual(counts(),{grants:0,calls:0});}finally{d.sqlite.close();}
});
test('an unqualified empty CLOSED cache must not hide an admitted query',async()=>{
 const {d,p,counts}=await setup('evm',r=>({...r,evidence:[],summary:{}}));try{const r=await collectFinalizedChainEvents(p);assert.equal(r.status,'CONTROLLED_CALLER_DENIED');assert.deepEqual(counts(),{grants:1,calls:0});}finally{d.sqlite.close();}
});
test('unknown invalid-cache read cost stops before a subsequent SQL or provider admission',async()=>{
 const {d,p,counts}=await setup('evm',r=>mutations['foreign contract']({...r,evidence:[r.evidence[0]]}));try{d.log.length=0;d.setHook(sql=>{if(sql.startsWith('SELECT observed_ts'))d.markUnknown();});const r=await collectFinalizedChainEvents(p);assert.equal(r.status,'ADMISSION_LEDGER_UNAVAILABLE_NATIVE_USAGE');assert.ok(d.log.every(x=>!x.after_unknown));assert.deepEqual(counts(),{grants:0,calls:0});assert.equal(d.usageSnapshot().unknown_ops,1);}finally{d.sqlite.close();}
});
const xrpl=JSON.parse(gunzipSync(fs.readFileSync(new URL('../../checkpoints/actual-native-primary-connected-37575766314.json.gz',import.meta.url)))),XT=xrpl.decision_ts,xIdentity={chain:'xrp',asset_kind:'NATIVE',native_asset_id:'xrp:mainnet',contract_or_mint:null};
const xProof=xrpl.result.evidence[0].native_ledger_pair_payload,xLedger=structuredClone(xProof.current_payload);
// Original validated header with a controlled expanded payment, as in the
// established decoder tests; this is not a newly acquired native payment.
xLedger.result.ledger.transactions=[{tx_json:{TransactionType:'Payment',Account:'r'+'1'.repeat(25),Destination:'r'+'2'.repeat(25)},hash:'1'.repeat(64),metaData:{TransactionResult:'tesSUCCESS',TransactionIndex:0,delivered_amount:'1234567'}}];
const xResult=normalizeXrplNativePayments({contract:'XRP-USDT',identity:xIdentity,ledger_payload:xLedger,supply_pair_proof:xProof,observed_ts:XT});
async function xSetup(mutate=r=>r){
 const d=database();await installEvidenceSourceStore(d);
 await writeEvidenceSourceCache(d,{source:'XRPL_NATIVE_SUPPLY',asset_key:'xrp:native:mainnet',observed_ts:XT,expires_ts:XT+TTL,payload:xrpl.result});
 await writeEvidenceSourceCache(d,{source:'CHAIN_RPC',asset_key:`XRPL_NATIVE_PAYMENTS:${XRPL_PAYMENTS_VERSION}:XRP-USDT`,observed_ts:XT,expires_ts:XT+TTL,payload:{...mutate(structuredClone(xResult)),version:XRPL_PAYMENTS_VERSION}});
 let grants=0,calls=0;const p={db:d,contract:'XRP-USDT',asset_identity:xIdentity,run_id:'XRP_CACHE_SCOPE',now:XT,clock:()=>XT,request_admit:()=>{grants++;return{allowed:false,status:'CONTROLLED_CALLER_DENIED'};},fetch_impl:async()=>{calls++;throw Error('LIVE_SOURCE_FORBIDDEN');}};return{d,p,counts:()=>({grants,calls})};
}
test('XRPL valid original-clock payment cache retains the immutable delivered amount and consumer',async()=>{
 const {d,p,counts}=await xSetup();try{const r=await collectXrplNativePayments(p);assert.deepEqual(r.evidence,xResult.evidence);assert.equal(consumeBlockResultContext({contract:p.contract,evidence:r.evidence,now:XT}).facts.length,1);assert.deepEqual(counts(),{grants:0,calls:0});}finally{d.sqlite.close();}
});
for(const [name,mutate] of Object.entries({
 'foreign contract':r=>{r.evidence[0].htx_contract='OTHER-USDT';return r;},
 'foreign asset':r=>{r.evidence[0].asset_id='foreign';return r;},
 'future observed clock':r=>{r.evidence[0].observed_ts=XT+1;return r;},
 'future knowledge clock':r=>{r.evidence[0].first_known_ts=XT+1;return r;},
 'expired original':r=>{r.evidence[0].expires_at=XT-1;return r;},
 'changed delivered amount':r=>{r.evidence[0].native_payments[0].delivered_drops='999999';return r;},
}))test(`XRPL rejects ${name} cache before normally admitted fallback`,async()=>{
 const {d,p,counts}=await xSetup(mutate);try{const r=await collectXrplNativePayments(p);assert.equal(r.evidence.length,0);assert.equal(r.status,'CONTROLLED_CALLER_DENIED');assert.deepEqual(counts(),{grants:1,calls:0});}finally{d.sqlite.close();}
});
test('XRPL current error negative cache retains its existing no-spend backoff',async()=>{
 const {d,p,counts}=await xSetup(()=>({status:'SOURCE_ERROR',evidence:[],internal_only:true}));try{const r=await collectXrplNativePayments(p);assert.equal(r.status,'SOURCE_ERROR');assert.deepEqual(r.evidence,[]);assert.deepEqual(counts(),{grants:0,calls:0});}finally{d.sqlite.close();}
});
