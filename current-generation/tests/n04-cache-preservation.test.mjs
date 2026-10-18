import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const load=n=>import(process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${n}`):new URL(`../files/src/${n}`,import.meta.url));
const {collectFinalizedChainEvents,TRANSFER_TOPIC}=await load('finalized-chain-events.mjs');
const {collectNativeEvmFinalizedContext}=await load('native-evm-finalized-context.mjs');
const {collectXrplNativePayments}=await load('xrpl-native-payments.mjs');
const {installEvidenceSourceStore,writeEvidenceSourceCache}=await load('evidence-source-store.mjs');
const {consumeBlockResultContext,auditRenderedBlockResults}=await load('block-result-context.mjs');
const {formatManualReport}=await load('manual-report-formatter.mjs');
const {canonicalFingerprint,renderCanonicalTelegram}=await load('canonical-publication.mjs');
const raw=JSON.parse(gunzipSync(fs.readFileSync(new URL('../../checkpoints/native-evm-connected-37651164902/native-evm-current-raw.json.gz',import.meta.url))));
const xrpl=JSON.parse(gunzipSync(fs.readFileSync(new URL('../../checkpoints/actual-native-primary-connected-37575766314.json.gz',import.meta.url))));
const nativeId=chain=>({chain,asset_kind:'NATIVE',native_asset_id:chain+':mainnet',contract_or_mint:null});
const T=1791390020679,H='0x'+'1'.repeat(64),A='0x'+'a'.repeat(40),word=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
function database(){
 const sqlite=new DatabaseSync(':memory:'),log=[];let unknown=0,hook=()=>{};
 const d={sqlite,log,setHook:f=>hook=f,setUnknown:n=>unknown=n,usageSnapshot:()=>({unknown_ops:unknown}),prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async run(){return exec('run',sql,this.args);},async first(){return exec('first',sql,this.args);},async all(){return{results:exec('all',sql,this.args)};}};},async batch(rows){const result=[];for(const row of rows)result.push(await row.run());return result;}};
 function exec(method,sql,args){log.push({method,sql,args,after_unknown:unknown!==0});hook('before',sql,args);const stmt=sqlite.prepare(sql),r=method==='first'?stmt.get(...args)||null:method==='all'?stmt.all(...args):stmt.run(...args);hook('after',sql,args);return r;}
 return d;
}
async function params(kind,d){
 let now=T,contract='BNB-USDT',identity=nativeId('bsc'),index=0,calls=0;
 const block={number:'0x100',hash:H,timestamp:'0x'+Math.floor((T-1000)/1000).toString(16)};
 if(kind==='evm-token'){contract='ABC-USDT';identity={chain:'ethereum',asset_kind:'TOKEN',contract_or_mint:A};}
 if(kind==='sol-native'){contract='SOL-USDT';identity=nativeId('solana');}
 if(kind==='sol-token'){contract='JUP-USDT';identity={chain:'solana',asset_kind:'TOKEN',contract_or_mint:'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'};}
 if(kind==='xrpl'){
  now=xrpl.decision_ts;contract='XRP-USDT';identity=nativeId('xrp');
  await writeEvidenceSourceCache(d,{source:'XRPL_NATIVE_SUPPLY',asset_key:'xrp:native:mainnet',observed_ts:now,expires_ts:now+1200000,payload:xrpl.result});
 }
 const p={db:d,contract,asset_identity:identity,run_id:'CONTROLLED_N04_'+kind,now,clock:()=>now,request_admit:()=>({allowed:true}),fetch_impl:async(url,options)=>{
  calls++;const q=JSON.parse(options.body);
  if(kind==='native-original'){const r=raw.raw[index++];assert.equal(url,r.url);assert.deepEqual(q,r.request);return new Response(JSON.stringify(r.payload),{status:r.http_status});}
  if(kind==='xrpl'){
   const payload=structuredClone(xrpl.result.evidence[0].native_ledger_pair_payload.current_payload);
   payload.result.ledger.transactions=[{tx_json:{TransactionType:'Payment',Account:'r'+'1'.repeat(25),Destination:'r'+'2'.repeat(25)},hash:'1'.repeat(64),metaData:{TransactionResult:'tesSUCCESS',TransactionIndex:0,delivered_amount:'1234567'}}];
   return new Response(JSON.stringify(payload));
  }
  if(kind==='evm-token'){
   const result=Array.isArray(q)?[{id:1,result:'0x1'},{id:2,result:block}]:{id:q.id,result:q.method==='eth_getLogs'?[{address:A,removed:false,transactionHash:H,blockHash:H,blockNumber:block.number,logIndex:'0x0',topics:[TRANSFER_TOPIC,word(1),word(2)],data:word(100)}]:block};
   return new Response(JSON.stringify(result));
  }
  const mint=identity.contract_or_mint,transaction=kind==='sol-native'?{slot:321,blockTime:Math.floor(now/1000)-10,meta:{err:null,innerInstructions:[]},transaction:{message:{instructions:[{program:'system',parsed:{type:'transfer',info:{source:'A'.repeat(32),destination:'B'.repeat(32),lamports:25}}}]}}}:{slot:321,blockTime:Math.floor(now/1000)-10,meta:{err:null,preTokenBalances:[{accountIndex:0,mint,uiTokenAmount:{amount:'100'}},{accountIndex:1,mint,uiTokenAmount:{amount:'0'}}],postTokenBalances:[{accountIndex:0,mint,uiTokenAmount:{amount:'50'}},{accountIndex:1,mint,uiTokenAmount:{amount:'50'}}]},transaction:{message:{accountKeys:['A','B']}}};
  const result=q.method==='getSignaturesForAddress'?[{signature:'1'.repeat(64),err:null,slot:321,confirmationStatus:'finalized'}]:transaction;
  return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
 }};
 return{p,calls:()=>calls};
}
async function setup(){const d=database();await installEvidenceSourceStore(d);return d;}
function injectCache(d,mode,predicate=()=>true){
 let count=0;d.setHook((phase,sql,args)=>{
  if(sql.startsWith('INSERT INTO report2_evidence_source_cache')&&predicate(args)&&phase===(mode==='unknown-ack'?'after':'before')){
   count++;if(mode!=='known-error')d.setUnknown(1);if(mode!=='unknown-ack')throw Error('CONTROLLED_OPTIONAL_CACHE_FAILURE');
  }
 });return()=>count;
}
function noLater(d){assert.equal(d.log.filter(r=>r.after_unknown).length,0);}
const expectedCalls={'native-original':2,'evm-token':3,'sol-native':2,'sol-token':2,xrpl:1};
for(const kind of Object.keys(expectedCalls))for(const mode of ['known-error','unknown-error','unknown-ack'])test(`${kind} qualified original-clock fact survives ${mode} optional result cache`,async()=>{
 const d=await setup();try{
  const {p,calls}=await params(kind,d);d.log.length=0;const failures=injectCache(d,mode),r=await collectFinalizedChainEvents(p);
  assert.equal(r.status,'CLOSED');assert.equal(r.network_calls,expectedCalls[kind]);assert.equal(calls(),r.network_calls);assert.ok(r.evidence.length);assert.equal(failures(),1);noLater(d);
  assert.equal(r.cache_write_receipts.at(-1).status,mode==='unknown-ack'?'CACHE_WRITE_UNCLOSED_NATIVE_USAGE':'CACHE_WRITE_FAILED_VALID_RESPONSE_RETAINED');
  const facts=consumeBlockResultContext({contract:p.contract,evidence:r.evidence,now:p.now}).facts.filter(f=>f.block_id==='N04');assert.ok(facts.length);
  for(const e of r.evidence){assert.equal(e.score_contribution??0,0);assert.ok(e.source_ts<p.now);assert.equal(e.observed_ts,p.now);}
  const used=d.sqlite.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='CHAIN_RPC'").get().attempts;
  assert.equal(used,kind==='native-original'?2:kind==='evm-token'||kind==='sol-native'?4:expectedCalls[kind]);
  if(kind==='native-original')assert.equal(r.evidence[0].source_ts,1791390018000);
 }finally{d.sqlite.close();}
});
for(const collect of [collectFinalizedChainEvents,collectNativeEvmFinalizedContext,collectXrplNativePayments])test(`${collect.name} existing native unknown refuses before any SQL or transport`,async()=>{
 const d=await setup();try{const {p,calls}=await params('native-original',d);d.setUnknown(1);d.log.length=0;const r=await collect(p);assert.equal(r.network_calls,0);assert.equal(calls(),0);assert.equal(d.log.length,0);}finally{d.sqlite.close();}
});
for(const stage of ['first-cache-read','source-day-read','provider-minute-read'])test(`N04 unknown ${stage} stops the next SQL, grants and transport`,async()=>{
 const d=await setup();let fired=false;try{
  const {p,calls}=await params('native-original',d);let grants=0;p.request_admit=()=>{grants++;return{allowed:true};};d.log.length=0;
  d.setHook((phase,sql)=>{if(!fired&&phase==='after'&&(stage==='first-cache-read'?sql.startsWith('SELECT observed_ts'):stage==='source-day-read'?sql.startsWith('SELECT attempts'):sql.startsWith('SELECT COALESCE(SUM(units)'))){fired=true;d.setUnknown(1);}});
  const r=await collectFinalizedChainEvents(p);assert.equal(fired,true);assert.equal(r.network_calls,0);assert.equal(calls(),0);assert.equal(grants,0);noLater(d);
 }finally{d.sqlite.close();}
});
for(const kind of ['evm-token','sol-native','sol-token','xrpl'])test(`${kind} unknown reservation readback cannot authorize the next source call`,async()=>{
 const d=await setup();let fired=false;try{const {p,calls}=await params(kind,d);d.log.length=0;d.setHook((phase,sql)=>{if(!fired&&phase==='after'&&sql.startsWith('SELECT source,attempts FROM report2_evidence_source_reservation')){fired=true;d.setUnknown(1);}});const r=await collectFinalizedChainEvents(p);assert.equal(fired,true);assert.equal(r.network_calls,0);assert.equal(calls(),0);noLater(d);assert.ok(d.sqlite.prepare('SELECT sum(attempts) n FROM report2_evidence_source_daily').get().n>0);}finally{d.sqlite.close();}
});
for(const kind of ['native-original','xrpl'])test(`${kind} observed429 and original retry survive failed optional backoff cache`,async()=>{
 const d=await setup();try{
  const {p}=await params(kind,d);const failures=injectCache(d,'unknown-error');let calls=0;
  p.fetch_impl=async()=>{calls++;return new Response('[]',{status:429,headers:{'Retry-After':'60'}});};
  const r=await collectFinalizedChainEvents(p);assert.equal(r.network_calls,1);assert.equal(calls,1);assert.equal(r.evidence.length,0);assert.equal(failures(),1);assert.equal(r.receipts[0].http_status,429);noLater(d);
  if(kind==='xrpl'){assert.equal(r.status,'PROVIDER_RATE_LIMIT_WAIT');assert.equal(r.receipts[0].provider_quota.retry_after_ts,p.now+60000);}
 }finally{d.sqlite.close();}
});
for(const mode of ['known-error','unknown-error','unknown-ack'])test(`XRPL valid payment survives ${mode} quota-cache failure without losing original retry`,async()=>{
 const d=await setup();try{const {p}=await params('xrpl',d),original=p.fetch_impl;let calls=0;p.fetch_impl=async(...args)=>{calls++;const r=await original(...args);return new Response(await r.text(),{headers:{'RateLimit-Limit':'20','RateLimit-Remaining':'0','RateLimit-Reset':'60'}});};d.log.length=0;const failures=injectCache(d,mode,args=>args[0]==='XRPL_PUBLIC_RATE_LIMIT'),r=await collectFinalizedChainEvents(p);assert.equal(r.status,'CLOSED');assert.equal(r.network_calls,1);assert.equal(calls,1);assert.equal(failures(),1);assert.equal(r.evidence.length,1);assert.equal(r.receipts[0].provider_quota.retry_after_ts,p.now+60000);assert.equal(r.cache_write_receipts.length,2);assert.equal(r.cache_write_receipts[1].status,mode==='known-error'?'CACHE_WRITE_COMPLETED':'CACHE_WRITE_SKIPPED_UNCLOSED_NATIVE_USAGE');noLater(d);}finally{d.sqlite.close();}
});
test('retained BNB facts reach manual and V5 Telegram; owner brief keeps its existing exclusion',async()=>{
 const d=await setup();try{
  const {p}=await params('native-original',d);injectCache(d,'known-error');const r=await collectFinalizedChainEvents(p),facts=consumeBlockResultContext({contract:p.contract,now:p.now,evidence:r.evidence}).facts;
  const c=structuredClone(JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical);
  c.observed_ts=p.now;c.snapshot_id=`S392:${p.contract}:${p.now}`;c.metadata.contract=p.contract;c.metadata.internal_market_context.evidence_v2.evidence=r.evidence;c.metadata.internal_market_context.decision_ts=p.now;c.metadata.supporting_context={facts};c.direction='LONG';c.state='OBSERVE';c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:p.now+600000,next_recheck_ts:p.now+60000,cancel_condition:'price<1'};c.analytical_fingerprint=canonicalFingerprint(c);
  const manual=formatManualReport(c);assert.equal(manual.ok,true);
  for(const policy of ['ORIGINAL_V5_20261006','ORIGINAL_BRIEF_20261007']){const telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:policy});assert.equal(telegram.ok,true);const audit=auditRenderedBlockResults({canonical:c,manual,telegram});if(policy==='ORIGINAL_V5_20261006')assert.ok(r.evidence.every(e=>audit.telegram_context_receipts.some(x=>x.evidence_id===e.evidence_id||x.evidence_ids?.includes(e.evidence_id))));else assert.equal(audit.telegram_context_receipts.filter(x=>x.block_id==='N04').length,0);}
 }finally{d.sqlite.close();}
});
