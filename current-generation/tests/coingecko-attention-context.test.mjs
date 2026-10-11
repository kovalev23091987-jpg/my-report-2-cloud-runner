import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEvidenceV2} from '../files/src/evidence-source-adapters.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';

test('CoinGecko exact PENGU trending presence stays neutral and rejects corrupted identity or clock',()=>{
 const now=Date.now(),hash='a'.repeat(64);
 const row=buildEvidenceV2({provider_id:'COINGECKO_ATTENTION',upstream_id:'COINGECKO_SITE_SEARCH',asset_id:'solana:2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',htx_contract:'PENGU-USDT',block_id:'N06',metric_family:'COINGECKO_TRENDING_SEARCH_CONTEXT',origin_event_id:'pudgy-penguins:'+now,dependency_group:'COINGECKO_SITE_SEARCH:pudgy-penguins:'+now,source_ts:now,observed_ts:now,expires_at:now+3600000,coverage_status:'TOP_LIST_PRESENCE_ONLY',coverage_fraction:0,directional_strength:null,risk_strength:null,unit:'list_rank',value:5,extra:{coin_id:'pudgy-penguins',rank:5,source_clock_policy:'OBSERVATION_TIME_NO_PROVIDER_EVENT_CLOCK',provider_role:'ADDITIONAL_ATTENTION_CONTEXT',directional_vote:false,unique_traders_claim:false,score_contribution:0,entry_authorized:false,trending_body_sha256:hash,identity_body_sha256:hash}});
 const accepted=consumeBlockResultContext({contract:'PENGU-USDT',evidence:[row],now});
 assert.equal(accepted.facts.length,1);assert.match(accepted.facts[0].value,/месте 5/);
 assert.equal(consumeEvidenceV2([row],{base_interest:70,decision_ts:now}).adjustment,0);
 for(const altered of [{asset_id:'solana:other'},{coin_id:'other'},{source_ts:now-86400000},{rank:0},{trending_body_sha256:'bad'}]){
  const rejected=consumeBlockResultContext({contract:'PENGU-USDT',evidence:[{...row,...altered}],now});assert.equal(rejected.facts.length,0);
 }
});

test('saved CoinGecko list can bind exact native NEAR, ETH and SOL without a ticker guess',()=>{
 const now=Date.now(),hash='b'.repeat(64),cases=[['NEAR','near','near',9],['ETH','ethereum','ethereum',10],['SOL','solana','solana',15]];
 for(const [symbol,chain,coinId,rank] of cases){
  const row=buildEvidenceV2({provider_id:'COINGECKO_ATTENTION',upstream_id:'COINGECKO_SITE_SEARCH',asset_id:`${chain}:native:mainnet`,htx_contract:`${symbol}-USDT`,block_id:'N06',metric_family:'COINGECKO_TRENDING_SEARCH_CONTEXT',origin_event_id:coinId+':'+now,dependency_group:'COINGECKO_SITE_SEARCH:'+coinId+':'+now,source_ts:now,observed_ts:now,expires_at:now+3600000,coverage_status:'TOP_LIST_PRESENCE_ONLY',coverage_fraction:0,directional_strength:null,risk_strength:null,unit:'list_rank',value:rank,extra:{coin_id:coinId,chain,native_asset_id:`${chain}:mainnet`,rank,source_clock_policy:'OBSERVATION_TIME_NO_PROVIDER_EVENT_CLOCK',provider_role:'ADDITIONAL_ATTENTION_CONTEXT',directional_vote:false,unique_traders_claim:false,score_contribution:0,entry_authorized:false,trending_body_sha256:hash,identity_body_sha256:null}});
  assert.equal(consumeBlockResultContext({contract:`${symbol}-USDT`,evidence:[row],now}).facts.length,1);
  assert.equal(consumeBlockResultContext({contract:`${symbol}-USDT`,evidence:[{...row,coin_id:'other'}],now}).facts.length,0);
  assert.equal(consumeEvidenceV2([row],{base_interest:70,decision_ts:now}).adjustment,0);
 }
});
