import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSourcifyAbi} from '../files/src/sourcify-abi-evidence.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';

const address='0x514910771af9ca656af840dff83e8264ecf986ca';
const payload={chainId:'1',address:'0x514910771AF9Ca656af840dff83E8264EcF986CA',match:'exact_match',matchId:'1',verifiedAt:'2026-01-01T00:00:00Z',abi:[{type:'function',name:'totalSupply'},{type:'function',name:'mint'},{type:'event',name:'Transfer'}]};

test('K16 Sourcify exact verified ABI becomes N17 schema context only',()=>{
 const row=normalizeSourcifyAbi({contract:'LINK-USDT',identity:{chain:'ethereum',contract_or_mint:address},payload,observed_ts:1000});
 assert.equal(row.status,'CLOSED');assert.equal(row.evidence[0].block_id,'N17');assert.equal(row.evidence[0].has_total_supply,true);assert.equal(row.evidence[0].has_transfer_event,true);assert.equal(row.evidence[0].directional_strength,null);assert.equal(row.evidence[0].risk_strength,null);assert.equal(consumeEvidenceV2(row.evidence,{base_interest:70,decision_ts:1100}).adjustment,0);
});

test('K16 Sourcify wrong address, wrong chain or absent ABI fails closed',()=>{
 assert.equal(normalizeSourcifyAbi({contract:'LINK-USDT',identity:{chain:'ethereum',contract_or_mint:address},payload:{...payload,chainId:'56'},observed_ts:1000}).status,'NOT_VERIFIED_OR_IDENTITY_MISMATCH');
 assert.equal(normalizeSourcifyAbi({contract:'LINK-USDT',identity:{chain:'ethereum',contract_or_mint:address},payload:{...payload,address:'0x0000000000000000000000000000000000000001'},observed_ts:1000}).status,'NOT_VERIFIED_OR_IDENTITY_MISMATCH');
 assert.equal(normalizeSourcifyAbi({contract:'LINK-USDT',identity:{chain:'ethereum',contract_or_mint:address},payload:{...payload,abi:[]},observed_ts:1000}).status,'NOT_VERIFIED_OR_IDENTITY_MISMATCH');
});

test('K16 Sourcify never guesses from a Solana mint or ticker',()=>{
 const row=normalizeSourcifyAbi({contract:'SOL-USDT',identity:{chain:'solana',contract_or_mint:'So11111111111111111111111111111111111111112'},payload,observed_ts:1000});assert.equal(row.status,'EXACT_EVM_IDENTITY_REQUIRED');assert.equal(row.evidence.length,0);
});
