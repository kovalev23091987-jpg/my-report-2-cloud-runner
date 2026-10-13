import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {collectFinalizedChainEvents,TRANSFER_TOPIC} from '../files/src/finalized-chain-events.mjs';
import {collectEvidenceRouteBlock} from '../files/src/candidate-evidence-v2-runtime.mjs';
const T=Date.parse('2026-10-13T16:48:00Z'),a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40),hash='0x'+'1'.repeat(64),word=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),block={number:'0x100',hash,timestamp:'0x'+Math.floor((T-1000)/1000).toString(16)};
function db(){const sql=new DatabaseSync(':memory:');return{sql,prepare(q){return{args:[],bind(...p){this.args=p;return this;},async first(){return sql.prepare(q).get(...this.args)||null;},async run(){return sql.prepare(q).run(...this.args);}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};}
function fixture(){let calls=0,headers=0;const fetch_impl=async(url,init)=>{calls++;if(url==='https://fixture.invalid')return new Response('{}');const q=JSON.parse(init.body);let body;
 if(Array.isArray(q)){headers++;body=[{id:1,result:url.includes('bsc')?'0x38':'0x1'},{id:2,result:block}];}
 else if(q.method==='eth_getLogs')body={id:q.id,result:[{address:q.params[0].address,removed:false,transactionHash:hash,blockHash:hash,blockNumber:block.number,logIndex:'0x0',topics:[TRANSFER_TOPIC,word(1),word(2)],data:word(100)}]};
 else body={id:q.id,result:block};return new Response(JSON.stringify(body));};return{fetch_impl,get calls(){return calls;},get headers(){return headers;}};}
const params=(memory,f,patch={})=>({db:memory,contract:'ABC-USDT',asset_identity:{chain:'ethereum',contract_or_mint:a},run_id:'LINKED_SAME_RUN',now:T,clock:()=>T,request_admit:()=>({allowed:true}),fetch_impl:f.fetch_impl,...patch});
test('the real saved WLD admission shape5+2+4 now fits10 by reusing only its same-run network header',async()=>{
 const memory=db(),f=fixture(),first=await collectFinalizedChainEvents(params(memory,f));assert.equal(first.network_calls,3);assert.equal(first.admission.attempts,4);
 const out=await collectEvidenceRouteBlock({routes:[{name:'JOINT_FLOW'},{name:'SECTOR'},{name:'CHAIN_EVENTS'}],params:params(memory,f,{contract:'DEF-USDT',asset_identity:{chain:'ethereum',contract_or_mint:b},now:T+60000,clock:()=>T+60000}),max_requests:10,collectors:{JOINT_FLOW:async p=>{for(let i=0;i<5;i++){assert.equal(p.request_admit({attempts:1}).allowed,true);await p.fetch_impl('https://fixture.invalid');}return{status:'CLOSED',evidence:[],network_calls:5};},SECTOR:async p=>{for(let i=0;i<2;i++){assert.equal(p.request_admit({attempts:1}).allowed,true);await p.fetch_impl('https://fixture.invalid');}return{status:'CLOSED',evidence:[],network_calls:2};},CHAIN_EVENTS:collectFinalizedChainEvents}});
 const r=out.results.CHAIN_EVENTS;assert.equal(r.status,'CLOSED');assert.equal(r.shared_header_reused,true);assert.equal(r.admission.attempts,3);assert.equal(out.reserved_requests,10);assert.equal(out.network_calls,9);assert.equal(f.headers,1);assert.equal(r.evidence[0].htx_contract,'DEF-USDT');assert.equal(r.evidence[0].source_ts,T-1000);assert.equal(r.receipts[0].original_received_ts,T);assert.equal(r.receipts[0].actual_http,0);memory.sql.close();
});
test('foreign run, DB, network, expired header or missing run ID cannot share primary acquisition',async()=>{
 for(const kind of ['run','db','network','expired','missing']){
  const memory=db(),other=db(),f=fixture();await collectFinalizedChainEvents(params(memory,f));
  const patch={contract:'DEF-USDT',asset_identity:{chain:kind==='network'?'bsc':'ethereum',contract_or_mint:b},strict_fresh_manual:true};
  if(kind==='run')patch.run_id='OTHER_RUN';if(kind==='db')patch.db=other;if(kind==='expired'){patch.now=T+120001;patch.clock=()=>T+120001;}if(kind==='missing')patch.run_id=undefined;
  const r=await collectFinalizedChainEvents(params(memory,f,patch));assert.equal(r.shared_header_reused,false);assert.equal(f.headers,2);assert.equal(r.admission.attempts,4);memory.sql.close();other.sql.close();
 }
});
