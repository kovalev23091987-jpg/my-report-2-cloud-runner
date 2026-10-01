import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {collectFinalizedChainEvents,decodeFinalizedSolanaTransaction} from '../files/src/finalized-chain-events.mjs';

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
 const result=await collectFinalizedChainEvents({db:new DB(),fetch_impl,request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'JUP-USDT',run_id:'R',asset_identity:{chain:'solana',contract_or_mint:MINT},now:NOW});
 assert.equal(result.status,'CLOSED');assert.equal(result.network_calls,2);assert.deepEqual(methods,['getSignaturesForAddress','getTransaction']);assert.equal(result.evidence[0].block_id,'N04');
});
