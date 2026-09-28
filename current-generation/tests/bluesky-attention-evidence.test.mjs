import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBlueskyAttention} from '../files/src/bluesky-attention-evidence.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';

const address='0x514910771af9ca656af840dff83e8264ecf986ca',identity={chain:'ethereum',contract_or_mint:address};
const post=(uri,did,body)=>({uri,cid:`cid-${uri}`,author:{did},record:{text:body,createdAt:'2026-09-28T00:00:00Z'},indexedAt:'2026-09-28T00:00:01Z'});

test('K16 Bluesky counts unique exact-address authors and deduplicates posts',()=>{
 const payload={posts:[post('a','did:plc:1',`watch ${address}`),post('a','did:plc:1',`watch ${address}`),post('b','did:plc:1',`again ${address}`),post('c','did:plc:2',`new ${address.toUpperCase()}`),post('d','did:plc:3','LINK only')]};
 const row=normalizeBlueskyAttention({contract:'LINK-USDT',identity,payload,window_start:0,window_end:1000,history_windows:30,history_days:7,observed_ts:1100});
 assert.equal(row.status,'CLOSED');assert.equal(row.summary.unique_authors,2);assert.equal(row.summary.original_posts,3);assert.equal(row.evidence[0].coverage_fraction,1);assert.equal(row.evidence[0].directional_strength,null);assert.equal(consumeEvidenceV2(row.evidence,{base_interest:70,decision_ts:1200}).adjustment,0);
});

test('K16 Bluesky remains warming before thirty windows over seven days',()=>{
 const row=normalizeBlueskyAttention({contract:'LINK-USDT',identity,payload:{posts:[]},window_start:0,window_end:1000,history_windows:29,history_days:7,observed_ts:1100});assert.equal(row.evidence[0].coverage_status,'WARMING_OR_SATURATED');assert.equal(row.evidence[0].coverage_fraction,0);
});

test('K16 Bluesky rejects ticker-only identity and preserves Solana case',()=>{
 assert.equal(normalizeBlueskyAttention({contract:'LINK-USDT',identity:{chain:'ethereum',contract_or_mint:'LINK'},payload:{posts:[]},window_start:0,window_end:1,observed_ts:2}).status,'EXACT_ASSET_IDENTITY_REQUIRED');
 const mint='So11111111111111111111111111111111111111112',row=normalizeBlueskyAttention({contract:'SOL-USDT',identity:{chain:'solana',contract_or_mint:mint},payload:{posts:[post('a','did:plc:1',mint.toLowerCase())]},window_start:0,window_end:1,observed_ts:2});assert.equal(row.summary.original_posts,0);
});
