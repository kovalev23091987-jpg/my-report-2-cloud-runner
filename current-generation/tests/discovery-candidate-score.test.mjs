import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scoreDiscoveryCandidate,compareDiscoveryCandidates} from '../files/src/discovery-candidate-score.mjs';

const worker=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');
const overlay=fs.readFileSync(new URL('../apply-runtime-overlay.mjs',import.meta.url),'utf8');

test('funding is optional and contributes no more than five points',()=>{
  const base=scoreDiscoveryCandidate({core_liquidity:true,non_funding_anomaly_count:3,directional_market_route:true,oi_building:true,momentum_confirmed:true,relative_strength_confirmed:true,fresh:true});
  const supported=scoreDiscoveryCandidate({core_liquidity:true,non_funding_anomaly_count:3,directional_market_route:true,oi_building:true,momentum_confirmed:true,relative_strength_confirmed:true,funding_directionally_supportive:true,fresh:true});
  assert.equal(base.funding_required,false);
  assert.equal(base.score_0_100,90);
  assert.equal(supported.score_0_100,95);
  assert.equal(supported.components.funding_bonus,5);
});

test('funding without an independent directional route adds zero',()=>{
  const result=scoreDiscoveryCandidate({early_liquidity:true,non_funding_anomaly_count:2,funding_directionally_supportive:true,fresh:true});
  assert.equal(result.components.funding_bonus,0);
  assert.equal(result.funding_can_create_candidate,false);
});

test('a fully qualified candidate remains eligible and scores 95 without funding',()=>{
  const result=scoreDiscoveryCandidate({core_liquidity:true,non_funding_anomaly_count:4,directional_market_route:true,oi_building:true,momentum_confirmed:true,relative_strength_confirmed:true,fresh:true});
  assert.equal(result.score_0_100,95);
  assert.equal(result.components.funding_bonus,0);
  assert.equal(result.funding_required,false);
});

test('market quality outranks a weaker candidate with funding',()=>{
  const rows=[
    {contract:'FUNDED-USDT',selection_score_0_100:58,long_watch:true,non_funding_anomaly_flags_count:2,turnover_24h_usdt:900000},
    {contract:'BEST-USDT',selection_score_0_100:88,long_watch:true,non_funding_anomaly_flags_count:4,turnover_24h_usdt:300000},
  ];
  rows.sort(compareDiscoveryCandidates);
  assert.equal(rows[0].contract,'BEST-USDT');
});

test('worker admission cannot be created by funding and enforces the 100k HTX floor',()=>{
  assert.match(worker,/const MINIMUM_LIVE_TURNOVER_USDT=100000/u);
  assert.match(worker,/turnover>=MINIMUM_LIVE_TURNOVER_USDT/u);
  assert.doesNotMatch(worker,/fundingExtremeContextRecall/u);
  assert.doesNotMatch(worker,/fundingDirectionalRoutes/u);
  assert.match(worker,/fundingDirectionallySupportive=\(longWatch&&negativeFundingTail\)\|\|\(shortWatch&&positiveFundingTail\)/u);
});

test('production overlay includes the candidate score module',()=>{
  assert.match(overlay,/'src\/discovery-candidate-score\.mjs'/u);
});
