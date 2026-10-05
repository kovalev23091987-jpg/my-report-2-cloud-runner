import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {collectFinalizedChainEvents,decodeFinalizedSolanaTransaction,decodeFinalizedNativeSolanaTransaction,SOLANA_SYSTEM_PROGRAM} from '../files/src/finalized-chain-events.mjs';
import {consumeBlockResultContext,auditRenderedBlockResults} from '../files/src/block-result-context.mjs';
import {formatManualReport} from '../files/src/manual-report-formatter.mjs';

class Statement{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}bind(...args){return new Statement(this.db,this.sql,args);}async run(){return this.db.sqlite.prepare(this.sql).run(...this.args);}async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}}
class DB{constructor(){this.sqlite=new DatabaseSync(':memory:');}prepare(sql){return new Statement(this,sql);}async batch(rows){this.sqlite.exec('BEGIN');try{const out=[];for(const row of rows)out.push(await row.run());this.sqlite.exec('COMMIT');return out;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}}

const NOW=Date.parse('2026-10-01T00:00:00Z'),MINT='JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',SIG='1'.repeat(64);
const transaction={slot:123,blockTime:NOW/1000-30,meta:{err:null,preTokenBalances:[{accountIndex:0,mint:MINT,uiTokenAmount:{amount:'100'}},{accountIndex:1,mint:MINT,uiTokenAmount:{amount:'0'}}],postTokenBalances:[{accountIndex:0,mint:MINT,uiTokenAmount:{amount:'50'}},{accountIndex:1,mint:MINT,uiTokenAmount:{amount:'50'}}]}};

test('Solana finalized balance movement closes the transfer block without inventing direction',()=>{
 const rows=decodeFinalizedSolanaTransaction({transaction,mint:MINT,signature:SIG,observed_ts:NOW,contract:'JUP-USDT'});
 assert.equal(rows.length,1);assert.equal(rows[0].block_id,'N04');assert.equal(rows[0].amount_base_units,'50');assert.equal(rows[0].finality_status,'FINAL');assert.equal(rows[0].directional_strength,null);
});

test('Solana finalized collector actually calls signatures and one exact transaction',async()=>{
 const methods=[];const fetch_impl=async(_url,options)=>{const body=JSON.parse(options.body);methods.push(body.method);const result=body.method==='getSignaturesForAddress'?[{signature:SIG,err:null,slot:123}]:transaction;return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}),{status:200,headers:{'content-type':'application/json'}});};
 const result=await collectFinalizedChainEvents({db:new DB(),fetch_impl,request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'JUP-USDT',run_id:'R',asset_identity:{chain:'solana',contract_or_mint:MINT},now:NOW,clock:()=>NOW});
 assert.equal(result.status,'CLOSED');assert.equal(result.network_calls,2);assert.deepEqual(methods,['getSignaturesForAddress','getTransaction']);assert.equal(result.evidence[0].block_id,'N04');
});

test('shared Solana transfer consumer reaches the approved report without score or market-flow claims',()=>{
 const evidence=decodeFinalizedSolanaTransaction({transaction,mint:MINT,signature:SIG,observed_ts:NOW,contract:'JUP-USDT'});
 const context=consumeBlockResultContext({evidence,contract:'JUP-USDT',now:NOW});
 assert.equal(context.facts.length,1);assert.equal(context.facts[0].block_id,'N04');assert.equal(context.facts[0].score_contribution,0);assert.equal(context.facts[0].directional_vote,false);
 assert.match(context.facts[0].value,/50 минимальных единиц.*принадлежность биржам и направление рынка не установлены/);
 const canonical=JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical;
 canonical.observed_ts=NOW;canonical.metadata.contract='JUP-USDT';canonical.metadata.internal_market_context.evidence_v2.evidence=evidence;
 const scores=structuredClone(canonical.scores),direction=canonical.direction,state=canonical.state;
 canonical.metadata.supporting_context={facts:context.facts};
 const manual=formatManualReport(canonical),use=auditRenderedBlockResults({canonical,manual});
 assert.equal(manual.ok,true);assert.ok(manual.text.includes(context.facts[0].label));assert.ok(use.used_context_block_ids.includes('N04'));
 assert.deepEqual(canonical.scores,scores);assert.equal(canonical.direction,direction);assert.equal(canonical.state,state);
});

test('shared consumer accepts arbitrary exact token mints and Unicode futures, not a ticker allowlist',()=>{
 const mint='9'.repeat(44),contract='哈基米-USDT',tx=structuredClone(transaction);
 for(const row of [...tx.meta.preTokenBalances,...tx.meta.postTokenBalances])row.mint=mint;
 const evidence=decodeFinalizedSolanaTransaction({transaction:tx,mint,signature:SIG,observed_ts:NOW,contract});
 assert.equal(consumeBlockResultContext({evidence,contract,now:NOW}).facts.length,1);
});

test('stale, foreign, unfinalized or malformed Solana movements cannot be rendered',()=>{
 const rows=decodeFinalizedSolanaTransaction({transaction,mint:MINT,signature:SIG,observed_ts:NOW,contract:'JUP-USDT'});
 for(const mutate of [r=>r.asset_id='solana:OTHER',r=>r.tx_hash='invalid',r=>r.origin_event_id='another',r=>r.block_ref='1.5',r=>r.amount_base_units='-1',r=>r.amount_base_units='0',r=>r.quantity_units='USD',r=>r.finality_status='PROVISIONAL',r=>r.source_ts=NOW-20*60_000-1,r=>r.source_ts=NOW+1,r=>r.upstream_id='FOREIGN_RPC',r=>r.event_is_not_market_direction=false,r=>r.coverage_fraction=1,r=>r.directional_strength=.5]){
  const evidence=structuredClone(rows);mutate(evidence[0]);assert.equal(consumeBlockResultContext({evidence,contract:'JUP-USDT',now:NOW}).facts.length,0);
 }
 const duplicated=[...rows,...structuredClone(rows)];assert.equal(consumeBlockResultContext({evidence:duplicated,contract:'JUP-USDT',now:NOW}).facts.length,1);
 assert.equal(consumeBlockResultContext({evidence:rows,contract:'SOL-USDT',now:NOW}).facts.length,0);
});

test('imbalanced Solana balance changes do not masquerade as neutral transfers or proved burns',()=>{
 const tx=structuredClone(transaction);tx.meta.postTokenBalances[1].uiTokenAmount.amount='60';
 const evidence=decodeFinalizedSolanaTransaction({transaction:tx,mint:MINT,signature:SIG,observed_ts:NOW,contract:'JUP-USDT'});
 assert.equal(evidence[0].block_id,'N02');assert.equal(consumeBlockResultContext({evidence,contract:'JUP-USDT',now:NOW}).facts.length,0);
});

test('native SOL uses exact finalized System Program transfers with lamport units',()=>{
 const nativeTx={slot:321,blockTime:NOW/1000-10,meta:{err:null,innerInstructions:[]},transaction:{message:{instructions:[{program:'system',parsed:{type:'transfer',info:{source:'A'.repeat(32),destination:'B'.repeat(32),lamports:123456}}}]}}};
 const evidence=decodeFinalizedNativeSolanaTransaction({transaction:nativeTx,signature:SIG,observed_ts:NOW,contract:'SOL-USDT'});
 assert.equal(evidence.length,1);assert.equal(evidence[0].asset_id,'solana:native:mainnet');assert.equal(evidence[0].amount_base_units,'123456');assert.equal(evidence[0].quantity_units,'LAMPORTS');assert.equal(evidence[0].exchange_labels_verified,false);
 const context=consumeBlockResultContext({evidence,contract:'SOL-USDT',now:NOW});assert.equal(context.facts.length,1);assert.equal(context.facts[0].block_id,'N04');assert.match(context.facts[0].value,/123 456 лампортов|123456 лампортов/u);
 assert.deepEqual(decodeFinalizedNativeSolanaTransaction({transaction:nativeTx,signature:SIG,observed_ts:NOW,contract:'WSOL-USDT'}),[]);
});

test('native SOL collector is a shared exact-native adapter and uses only two public RPC calls',async()=>{
 const nativeTx={slot:321,blockTime:NOW/1000-10,meta:{err:null,innerInstructions:[]},transaction:{message:{instructions:[{program:'system',parsed:{type:'transfer',info:{source:'A'.repeat(32),destination:'B'.repeat(32),lamports:25}}}]}}};
 const methods=[];const fetch_impl=async(_url,options)=>{const body=JSON.parse(options.body);methods.push(body);const result=body.method==='getSignaturesForAddress'?[{signature:SIG,err:null,slot:321,confirmationStatus:'finalized'}]:nativeTx;return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}),{status:200});};
 const result=await collectFinalizedChainEvents({db:new DB(),fetch_impl,request_admit:p=>{assert.equal(p.attempts,4);return{allowed:true,status:'RESERVED'};},contract:'SOL-USDT',run_id:'NATIVE',asset_identity:{chain:'solana',asset_kind:'NATIVE',native_asset_id:'solana:mainnet',contract_or_mint:null},now:NOW,clock:()=>NOW});
 assert.equal(result.status,'CLOSED');assert.equal(result.network_calls,2);assert.equal(methods[0].params[0],SOLANA_SYSTEM_PROGRAM);assert.deepEqual(methods.map(x=>x.method),['getSignaturesForAddress','getTransaction']);assert.equal(result.evidence[0].block_id,'N04');
});
