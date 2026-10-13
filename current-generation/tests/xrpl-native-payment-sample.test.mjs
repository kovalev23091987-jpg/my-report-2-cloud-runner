import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {gunzipSync} from 'node:zlib';import {pathToFileURL} from 'node:url';import {DatabaseSync} from 'node:sqlite';
const root=process.env.REPORT2_NEW_SOURCE_ROOT?pathToFileURL(path.resolve(process.env.REPORT2_NEW_SOURCE_ROOT)+'/'):new URL('../files/src/',import.meta.url),load=name=>import(new URL(name,root));
const {normalizeXrplNativePayments,collectXrplNativePayments}=await load('xrpl-native-payments.mjs');const {consumeBlockResultContext}=await load('block-result-context.mjs');const {consumeEvidenceV2}=await load('evidence-v2.mjs');const {writeEvidenceSourceCache,installEvidenceSourceStore}=await load('evidence-source-store.mjs');const {planCandidateEvidenceRoutes,orderEvidenceDependencyRoutes}=await load('candidate-evidence-v2-runtime.mjs');
const actual=JSON.parse(gunzipSync(fs.readFileSync(new URL('../../checkpoints/actual-native-primary-connected-37575766314.json.gz',import.meta.url)))),proof=actual.result.evidence[0].native_ledger_pair_payload,T=actual.decision_ts,identity={chain:'xrp',asset_kind:'NATIVE',native_asset_id:'xrp:mainnet',contract_or_mint:null};
const {nativeRpcQuotaReceipt,nativeRpcQuotaWait,fetchNativeLedgerSupply}=await load('native-ledger-supply.mjs');
const {collectChainSupplyEvidence}=await load('chain-supply-evidence.mjs');
// Controlled transaction rows use actual validated header chronology. They
// are decoder/admission regressions, never a new actual payment acceptance.
const tx=(id='1',delivered='1234567')=>({tx_json:{TransactionType:'Payment',Account:'r'+'1'.repeat(25),Destination:'r'+'2'.repeat(25),DeliverMax:'999999999999',Flags:131072},hash:id.repeat(64),metaData:{TransactionResult:'tesSUCCESS',TransactionIndex:0,delivered_amount:delivered}});
function params(rows=[tx()]){const ledger_payload=structuredClone(proof.current_payload);ledger_payload.result.ledger.transactions=rows;return{contract:'XRP-USDT',identity,ledger_payload,supply_pair_proof:proof,observed_ts:T};}
function db(){const s=new DatabaseSync(':memory:');return{prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async run(){return s.prepare(sql).run(...this.args);},async first(){return s.prepare(sql).get(...this.args)||null;}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};}
test('successful native payments use delivered_amount even when DeliverMax is larger; consumer and score remain neutral',()=>{
 const r=normalizeXrplNativePayments(params());assert.equal(r.status,'CLOSED');assert.equal(r.evidence[0].native_payments[0].delivered_drops,'1234567');assert.equal(r.evidence[0].source_ts,1791350411000);assert.equal(r.evidence[0].block_id,'N04');assert.equal(r.evidence[0].exchange_labels_verified,false);
 const facts=consumeBlockResultContext({contract:'XRP-USDT',evidence:r.evidence,now:T});assert.equal(facts.facts.length,1);assert(facts.facts[0].value.includes('1,234567 XRP'));assert(!facts.facts[0].value.includes('999999'));
 assert.equal(consumeEvidenceV2(r.evidence,{base_interest:91,decision_ts:T}).final_interest,91);
 const tampered=structuredClone(r.evidence[0]);tampered.native_payments[0].delivered_drops='999999';assert.equal(consumeBlockResultContext({contract:'XRP-USDT',evidence:[tampered],now:T}).facts.length,0);
});
test('issued currencies, failed or unavailable delivery amounts and stated Amount never become native payments',()=>{
 for(const mutate of [t=>t.metaData.delivered_amount={currency:'USD',issuer:'r'+'3'.repeat(25),value:'100'},t=>t.metaData.delivered_amount='unavailable',t=>delete t.metaData.delivered_amount,t=>t.metaData.TransactionResult='tecPATH_DRY',t=>t.tx_json.TransactionType='OfferCreate']){const t=tx();mutate(t);assert.equal(normalizeXrplNativePayments(params([t])).evidence.length,0);}
});
test('exact ledger hash, header clock, parent proof and fresh source bound are compulsory',()=>{
 for(const mutate of [p=>p.contract='OTHER-USDT',p=>p.identity={...identity,contract_or_mint:'wrapped'},p=>p.ledger_payload.result.validated=false,p=>p.ledger_payload.result.ledger.ledger_hash='f'.repeat(64),p=>p.ledger_payload.result.ledger.transaction_hash='f'.repeat(64),p=>p.observed_ts=1791350411000-1,p=>p.observed_ts=1791350411000+20*60_000+1]){const p=params();mutate(p);assert.equal(normalizeXrplNativePayments(p).evidence.length,0);}
 const p=params(['not expanded']);const r=normalizeXrplNativePayments(p);assert.equal(r.check_completed,false);assert.equal(r.status,'EXPANDED_VALIDATED_LEDGER_SCHEMA_REQUIRED');
});
test('native route depends on supply first and collects one admitted exact ledger without renewing source clocks',async()=>{
 const memory=db();await installEvidenceSourceStore(memory);await writeEvidenceSourceCache(memory,{source:'XRPL_NATIVE_SUPPLY',asset_key:'xrp:native:mainnet',observed_ts:T,expires_ts:T+20*60_000,payload:actual.result});let calls=0;
 const p={db:memory,contract:'XRP-USDT',asset_identity:identity,run_id:'CONTROLLED_NATIVE_PAYMENTS',now:T,clock:()=>T,request_admit:()=>({allowed:true}),fetch_impl:async(url,init)=>{calls++;assert.equal(url,'https://xrplcluster.com/');const q=JSON.parse(init.body);assert.equal(q.params[0].ledger_hash,proof.current_payload.result.ledger_hash);assert.equal(q.params[0].transactions,true);return new Response(JSON.stringify(params().ledger_payload));}};
 const a=await collectXrplNativePayments(p),b=await collectXrplNativePayments({...p,run_id:'CACHED',now:T+1});assert.equal(a.network_calls,1);assert.equal(a.status,'CLOSED');assert.equal(b.network_calls,0);assert.equal(b.evidence[0].source_ts,a.evidence[0].source_ts);assert.equal(calls,1);
 assert(planCandidateEvidenceRoutes(p).routes.some(r=>r.name==='CHAIN_EVENTS'));const ordered=orderEvidenceDependencyRoutes([{name:'CHAIN_EVENTS'},{name:'LARGE_TRADES'},{name:'CHAIN_SUPPLY'}],identity);assert(ordered.findIndex(r=>r.name==='CHAIN_SUPPLY')<ordered.findIndex(r=>r.name==='CHAIN_EVENTS'));
 const missingDb=db();await installEvidenceSourceStore(missingDb);const absent=await collectXrplNativePayments({...p,db:missingDb,strict_fresh_manual:true});assert.equal(absent.network_calls,0);
});
test('unknown or malformed public quota is not zero/unlimited; original reset and bounded load backoff are explicit',()=>{
 assert.equal(nativeRpcQuotaReceipt(new Response('{}'),{},T),null);
 const response=new Response('{}',{headers:{'RateLimit-Limit':'20','RateLimit-Remaining':'0','RateLimit-Reset':'120','RateLimit-Identity':'sensitive identity is not retained'}}),q=nativeRpcQuotaReceipt(response,{},T);
 assert.equal(q.retry_after_ts,T+120000);assert.equal(nativeRpcQuotaWait(q,T+1),T+120000);assert.equal(nativeRpcQuotaWait(q,T+120000),null);assert.equal(q.published_daily_allowance,null);assert(!JSON.stringify(q).includes('sensitive'));
 assert.equal(nativeRpcQuotaReceipt(new Response('{}',{headers:{'RateLimit-Remaining':'','RateLimit-Reset':'not a number'}}),{},T),null);
 const fallback=nativeRpcQuotaReceipt(new Response('overloaded',{status:503}),null,T);assert.equal(fallback.retry_after_ts,T+60000);assert.equal(fallback.wait_basis,'CONSERVATIVE_60S_LOAD_BACKOFF');
 assert.equal(nativeRpcQuotaWait({...q,observed_ts:T+1},T),null);
});
test('a binding zero-quota header stops dependent native ledger requests and the next collector spends no caller slot',async()=>{
 const memory=db();let calls=0,grants=0;const base={db:memory,contract:'XRP-USDT',asset_identity:identity,run_id:'QUOTA1',now:T,clock:()=>T,request_admit:()=>{grants++;return{allowed:true};},fetch_impl:async()=>{calls++;return new Response(JSON.stringify(proof.network),{headers:{'RateLimit-Limit':'20','RateLimit-Remaining':'0','RateLimit-Reset':'120'}});}};
 const first=await collectChainSupplyEvidence(base);assert.equal(first.status,'PROVIDER_RATE_LIMIT_WAIT');assert.equal(first.network_calls,1);assert.equal(first.receipts[0].provider_quota.remaining,0);assert.equal(first.evidence.length,0);
 const second=await collectChainSupplyEvidence({...base,run_id:'QUOTA2',now:T+1});assert.equal(second.status,'PROVIDER_RATE_LIMIT_WAIT');assert.equal(second.network_calls,0);assert.equal(calls,1);assert.equal(grants,1);
 const stored=await memory.prepare('SELECT count(*) n FROM report2_evidence_source_cache WHERE source=?1').bind('XRPL_NATIVE_SUPPLY').first();assert.equal(stored.n,0);
});
test('XRP supply and N04 payment share provider backoff; exhausted daily parent/child preserve caller slots',async()=>{
 for(const exhausted of ['provider','child','parent']){
  const memory=db();await installEvidenceSourceStore(memory);await writeEvidenceSourceCache(memory,{source:'XRPL_NATIVE_SUPPLY',asset_key:'xrp:native:mainnet',observed_ts:T,expires_ts:T+1200000,payload:actual.result});let calls=0,grants=0;
  if(exhausted==='provider'){const q=nativeRpcQuotaReceipt(new Response('{}',{status:429,headers:{'Retry-After':'60'}}),null,T);await writeEvidenceSourceCache(memory,{source:'XRPL_PUBLIC_RATE_LIMIT',asset_key:'xrplcluster.com',observed_ts:T,expires_ts:q.retry_after_ts,payload:{provider_quota:q}});}
  else await memory.prepare('INSERT INTO report2_evidence_source_daily VALUES(?1,?2,?3,?4,?5)').bind(exhausted==='child'?'XRPL_NATIVE_SUPPLY':'CHAIN_RPC',new Date(T).toISOString().slice(0,10),exhausted==='child'?24:720,'prior',T).run();
  const out=await collectXrplNativePayments({db:memory,contract:'XRP-USDT',asset_identity:identity,run_id:'PAYMENT',now:T+1,clock:()=>T+1,request_admit:()=>{grants++;return{allowed:true};},fetch_impl:async()=>{calls++;throw Error('not admitted');}});assert.equal(out.network_calls,0);assert.equal(out.status,exhausted==='provider'?'PROVIDER_RATE_LIMIT_WAIT':'SOURCE_DAILY_CAP_REACHED');assert.equal(calls,0);assert.equal(grants,0);
 }
});
