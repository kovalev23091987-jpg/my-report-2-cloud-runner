import test from 'node:test';
import assert from 'node:assert/strict';
import {consumeExistingSourceReceipts} from '../src/existing-source-consumer.mjs';
import {normalizeGoPlusTokenSecurity} from '../src/goplus-security-adapter.mjs';
import {normalizeSolanaSignatures} from '../src/solana-rpc-adapter.mjs';
import {normalizeDexPoolObservation,dedupeDexPoolConfirmations} from '../src/dex-pool-bridge.mjs';
import {normalizeDefiLlamaContext} from '../src/provider-context-normalizers.mjs';

const NOW=1_800_000_000_000;

test('GoPlus normalized receipt closes Supporting Risk consumer without hard gate or directional vote',()=>{
 const g=normalizeGoPlusTokenSecurity({result:{'0xdac17f958d2ee523a2206206994597c13d831ec7':{is_honeypot:'0',cannot_buy:'0',cannot_sell_all:'0'}}},{chain:'1',contract_or_mint:'0xdAC17F958D2ee523a2206206994597C13D831ec7',observed_ts:NOW});
 const c=consumeExistingSourceReceipts({goplus:g});
 assert.equal(c.status,'CLOSED');assert.equal(c.blocks.supporting_risk.status,'CLOSED');assert.equal(c.no_new_hard_gate,true);assert.equal(c.no_directional_vote,true);assert.equal(c.facts[0].source,'GoPlus');
});

test('Solana normalized signatures close onchain context only',()=>{
 const s=normalizeSolanaSignatures({result:[{signature:'abc',slot:1,err:null,blockTime:1700000000,confirmationStatus:'finalized'}]},{mint:'So11111111111111111111111111111111111111112'});
 const c=consumeExistingSourceReceipts({solana:s});
 assert.equal(c.blocks.onchain.status,'CLOSED');assert.equal(c.blocks.onchain.facts[0].value,1);assert.equal(c.blocks.onchain.facts[0].directional_vote,false);
});

test('DEX same pool from two providers is one independent confirmation',()=>{
 const a=normalizeDexPoolObservation({provider:'DEX Screener',chain:'ethereum',pool_address:'0x1111111111111111111111111111111111111111',token_contract_or_mint:'0x2222222222222222222222222222222222222222',liquidity_usd:100000,volume_usd:50000,buys:10,sells:8,observed_ts:NOW});
 const b=normalizeDexPoolObservation({provider:'GeckoTerminal',chain:'ethereum',pool_address:'0x1111111111111111111111111111111111111111',token_contract_or_mint:'0x2222222222222222222222222222222222222222',liquidity_usd:99000,volume_usd:49000,buys:11,sells:9,observed_ts:NOW});
 assert.equal(dedupeDexPoolConfirmations([a,b])[0].independent_confirmation_count,1);
 const c=consumeExistingSourceReceipts({dex:[a,b]});
 assert.equal(c.blocks.dex_context.facts.length,1);assert.equal(c.blocks.dex_context.facts[0].provider_observation_count,2);assert.equal(c.blocks.dex_context.facts[0].buy_count_is_net_inflow,false);
});

test('DefiLlama closes protocol context but TVL is not inferred as inflow',()=>{
 const d=normalizeDefiLlamaContext({protocol:'aave',chain:'ethereum',tvl_usd:123456,observed_ts:NOW});
 const c=consumeExistingSourceReceipts({defillama:d});
 assert.equal(c.blocks.protocol_context.status,'CLOSED');assert.equal(c.blocks.protocol_context.facts[0].tvl_growth_is_inflow,false);
});

test('missing receipts produce no consumer facts and no invented zero',()=>{
 const c=consumeExistingSourceReceipts({});assert.equal(c.status,'NOT_CLOSED');assert.equal(c.facts.length,0);
});
