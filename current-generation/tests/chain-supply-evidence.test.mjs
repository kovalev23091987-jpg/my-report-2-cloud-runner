import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeChainSupply,collectChainSupplyEvidence} from '../files/src/chain-supply-evidence.mjs';
import {DatabaseSync} from 'node:sqlite';
import {validateEvidenceV2,consumeEvidenceV2} from '../files/src/evidence-v2.mjs';

const sol='So11111111111111111111111111111111111111112';

test('K16 chain supply requires an exact supported chain and address',()=>{
 const row=normalizeChainSupply({contract:'ABC-USDT',identity:{chain:'solana',contract_or_mint:'ABC'},current:{supply:'1',decimals:0,finalized:true},observed_ts:1000});
 assert.equal(row.status,'EXACT_ASSET_IDENTITY_REQUIRED');assert.equal(row.evidence.length,0);
});

test('K16 first finalized supply observation is context only and direction neutral',()=>{
 const row=normalizeChainSupply({contract:'SOL-USDT',identity:{chain:'solana',contract_or_mint:sol,identity_method:'DUAL_PROVIDER_DOMINANT_ADDRESS'},current:{supply:'1000000000000000000000000',decimals:9,block_ref:10,source_ts:900,finalized:true},observed_ts:1000});
 assert.equal(row.status,'CLOSED');assert.equal(row.evidence[0].metric_family,'TOTAL_SUPPLY_OBSERVATION');assert.equal(row.evidence[0].directional_strength,null);assert.equal(row.evidence[0].risk_strength,null);assert.equal(row.evidence[0].coverage_fraction,0);assert.equal(validateEvidenceV2(row.evidence[0],{decision_ts:1100}).usable,true);assert.equal(consumeEvidenceV2(row.evidence,{base_interest:70,decision_ts:1100}).adjustment,0);
});

test('K16 exact base-unit delta is retained without Number precision loss',()=>{
 const row=normalizeChainSupply({contract:'SOL-USDT',identity:{chain:'solana',contract_or_mint:sol},previous:{chain:'solana',address:sol,supply:'999999999999999999999999',decimals:9,source_ts:900,block_ref:10,finalized:true},current:{supply:'1000000000000000000000001',decimals:9,block_ref:11,source_ts:1000,finalized:true},observed_ts:1100});
 assert.equal(row.evidence[0].metric_family,'SUPPLY_INCREASE');assert.equal(row.evidence[0].supply_delta_base_units,'2');assert.equal(row.evidence[0].block_id,'N02');assert.equal(row.evidence[0].coverage_fraction,0);
});

test('K16 burn delta maps to N03 but cannot invent a short or long vote',()=>{
 const address='0x0000000000000000000000000000000000000001';
 const row=normalizeChainSupply({contract:'ABC-USDT',identity:{chain:'ethereum',contract_or_mint:address},previous:{chain:'ethereum',address,supply:'100',decimals:0,source_ts:900,block_ref:'0xf',finalized:true},current:{supply:'90',decimals:0,block_ref:'0x10',source_ts:1000,finalized:true},observed_ts:1100});
 assert.equal(row.evidence[0].block_id,'N03');assert.equal(row.evidence[0].metric_family,'SUPPLY_DECREASE');assert.equal(row.evidence[0].directional_strength,null);assert.equal(row.evidence[0].risk_strength,null);
});

test('K16 Solana identity remains case-sensitive across observations',()=>{
 const altered=`s${sol.slice(1)}`;
 const row=normalizeChainSupply({contract:'SOL-USDT',identity:{chain:'solana',contract_or_mint:sol},previous:{chain:'solana',address:altered,supply:'90',decimals:9},current:{supply:'100',decimals:9,block_ref:12,source_ts:1000,finalized:true},observed_ts:1100});
 assert.equal(row.evidence[0].metric_family,'TOTAL_SUPPLY_OBSERVATION');assert.equal(row.evidence[0].supply_delta_base_units,null);
});

test('missing decimal metadata is unknown and cannot produce a supply delta',()=>{
 const address='0x0000000000000000000000000000000000000001',row=normalizeChainSupply({contract:'ABC-USDT',identity:{chain:'ethereum',contract_or_mint:address},previous:{chain:'ethereum',address,supply:'10',decimals:0},current:{supply:'11',decimals:null,block_ref:'0x10',source_ts:1000,finalized:true},observed_ts:1100});
 assert.equal(row.summary.decimals,null);assert.equal(row.summary.supply_delta_base_units,null);assert.equal(row.evidence[0].metric_family,'TOTAL_SUPPLY_OBSERVATION');
});
test('EVM supply and decimals bind reversed batch responses at one finalized block within three HTTP',async()=>{
 const sqlite=new DatabaseSync(':memory:'),db={prepare(query){return{args:[],bind(...args){this.args=args;return this;},async run(){return sqlite.prepare(query).run(...this.args);},async first(){return sqlite.prepare(query).get(...this.args)||null;}};},async batch(rows){const values=[];for(const row of rows)values.push(await row.run());return values;}},T=Date.parse('2026-09-30T00:00:00Z'),bodies=[];
 const fetch_impl=async(url,init)=>{const body=JSON.parse(init.body);bodies.push(body);if(Array.isArray(body)){assert.equal(body.length,2);assert.ok(body.every(x=>x.method==='eth_call'&&x.params[1]==='0x123'));return new Response(JSON.stringify([{jsonrpc:'2.0',id:2,result:'0x12'},{jsonrpc:'2.0',id:1,result:'0xde0b6b3a7640000'}]));}return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:body.method==='eth_chainId'?'0x1':{number:'0x123',timestamp:'0x'+Math.floor((T-60000)/1000).toString(16)}}));};
 const out=await collectChainSupplyEvidence({db,fetch_impl,request_admit:()=>({allowed:true}),contract:'ABC-USDT',asset_identity:{chain:'ethereum',contract_or_mint:'0x0000000000000000000000000000000000000001'},run_id:'BATCH',now:T,clock:()=>T});
 assert.equal(out.status,'CLOSED');assert.equal(out.summary.decimals,18);assert.equal(out.summary.total_supply_base_units,'1000000000000000000');assert.equal(out.evidence[0].source_ts,T-60000);assert.equal(out.network_calls,3);assert.equal(bodies.length,3);sqlite.close();
});
