import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAssetAddress,validateAssetIdentity,normalizeOkxDepthLevel,normalizeSourceTime,isFresh,cacheKey,createRefreshCoordinator} from '../files/src/asset-identity-cache.mjs';

test('K07: Solana case is exact while EVM address format is normalized',()=>{
  const sol=normalizeAssetAddress({chain_id:'solana:mainnet',address:'AbC123'});assert.equal(sol.address_normalized,'AbC123');assert.equal(sol.case_sensitive,true);
  assert.equal(validateAssetIdentity({registry:{htx_contract:'X-USDT',canonical_asset_id:'x',chain_id:'solana:mainnet',address:'AbC123'},chain_id:'solana:mainnet',address:'abc123'}).matched,false);
  const evm=normalizeAssetAddress({chain_id:'eip155:1',address:'0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'});assert.equal(evm.address_normalized,'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
});

test('K07: same ticker or wrong venue instrument never closes identity',()=>{
  const registry={htx_contract:'ABC-USDT',canonical_asset_id:'chain:address',chain_id:'eip155:1',address:'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',venue_instruments:{COINBASE:'ABC-USD'}};
  assert.equal(validateAssetIdentity({registry,chain_id:'eip155:1',address:'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',venue:'COINBASE',instrument_id:'ABC-USD'}).status,'EXACT_ASSET_IDENTITY_MISMATCH');
  assert.equal(validateAssetIdentity({registry,chain_id:'eip155:1',address:registry.address,venue:'COINBASE',instrument_id:'OTHER-USD'}).status,'VENUE_INSTRUMENT_MISMATCH');
});

test('K07: OKX non-unit contract size applies multiplier exactly once',()=>{
  const linear=normalizeOkxDepthLevel({price:20,contracts:10,side:'bid',instrument:{contract_value:0.1,contract_multiplier:2,contract_value_currency:'SOL',base:'SOL'}});
  assert.equal(linear.base_quantity,2);assert.equal(linear.quote_usd,40);assert.equal(linear.multiplier_applied_once,true);
  const inverse=normalizeOkxDepthLevel({price:20,contracts:10,side:'ask',instrument:{contract_value:100,contract_multiplier:1,contract_value_currency:'USD',base:'SOL'}});
  assert.equal(inverse.quote_usd,1000);assert.equal(inverse.base_quantity,50);
});

test('K07: stale/future/missing timestamps are explicit and live snapshots without source time stay limited',()=>{
  assert.equal(normalizeSourceTime({source_ts:100000,received_ts:1000,now:1000}).status,'NOT_CLOSED');
  const limited=normalizeSourceTime({source_ts:null,received_ts:1000,now:1000,live_snapshot_without_source_time:true});assert.equal(limited.time_semantics,'LIVE_AT_FETCH_TIME_UNVERIFIED');
  assert.equal(isFresh({source_ts:1},{metric:'EXECUTION_BOOK',now:40_000}).status,'STALE');
});

test('K07: cache is checked before fetch, shares one in-flight refresh and backoff is bounded',async()=>{
  let now=1000,calls=0,release;const coordinator=createRefreshCoordinator({clock:()=>now}),key=cacheKey({source:'OKX',asset_or_instrument:'SOL-USDT-SWAP',metric:'BOOK',window:'LIVE',schema_version:'v1'});
  const fetcher=()=>{calls++;return new Promise(resolve=>{release=()=>resolve({ok:true});});};
  const a=coordinator.refresh(key,fetcher,{ttl_ms:1000}),b=coordinator.refresh(key,fetcher,{ttl_ms:1000});release();
  assert.equal((await a).status,'REFRESHED');assert.equal((await b).status,'REFRESHED');assert.equal(calls,1);
  assert.equal(coordinator.get(key).status,'HIT');
  now=3000;const failed=await coordinator.refresh(key,async()=>{throw new Error('timeout');},{ttl_ms:1000});assert.equal(failed.status,'REFRESH_FAILED');
  assert.equal((await coordinator.refresh(key,async()=>{calls++;},{ttl_ms:1000})).status,'BACKOFF');
});
