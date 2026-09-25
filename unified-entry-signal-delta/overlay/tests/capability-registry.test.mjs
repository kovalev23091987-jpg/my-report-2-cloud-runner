import test from 'node:test';import assert from 'node:assert/strict';
import {sourceExhaustion,resolveCrossVenueConflict,verifyHtxExecutionIdentity,rankCapabilitySources} from '../src/capability-registry.mjs';

test('DATA_MISSING only after source exhaustion',()=>{let r=sourceExhaustion({metric:'spot_flow',attempts:[{source:'HTX',status:'RATE_LIMITED'}]});assert.equal(r.status,'SOURCE_TOOL_UNAVAILABLE_THIS_RUN');r=sourceExhaustion({metric:'spot_flow',attempts:[{source:'HTX',status:'RATE_LIMITED'},{source:'OKX',status:'TIMEOUT'},{source:'Binance',status:'UNSUPPORTED'}]});assert.equal(r.status,'SOURCE_EXHAUSTED');});
test('fallback can close after primary rate limit',()=>{const r=sourceExhaustion({metric:'spot_flow',attempts:[{source:'HTX',status:'RATE_LIMITED'},{source:'OKX',status:'CLOSED',value:7.1,timestamp:1}]});assert.equal(r.status,'CLOSED');assert.equal(r.source,'OKX');});
test('cross venue conflict is not averaged',()=>{const r=resolveCrossVenueConflict({metric:'oi',rows:[{source:'HTX',status:'CLOSED',value:100},{source:'Bybit',status:'CLOSED',value:140}]});assert.equal(r.status,'CONFLICT');assert.equal(r.consensus,null);assert.equal(r.averaged,false);assert.equal(r.third_source_required,true);});
test('HTX symbol mismatch fails closed',()=>{const r=verifyHtxExecutionIdentity({contract_code:'ABC-USDT',htx_contract_code:'ABD-USDT',market_type:'FUTURES',tradable:true,status:'CLOSED'});assert.equal(r.status,'NOT_CLOSED');});

test('data-first analytical router can rank fresher more complete OKX before HTX',()=>{
  const now=10_000_000;
  const caps=[
    {source:'HTX',connected:true,coverage_pct:55,completeness_pct:55,authority_rank:1,source_ts:now-50_000,max_age_ms:120_000,health:'OK'},
    {source:'OKX',connected:true,coverage_pct:100,completeness_pct:100,authority_rank:2,source_ts:now-1_000,max_age_ms:120_000,health:'OK'},
    {source:'Binance',connected:true,coverage_pct:90,completeness_pct:92,authority_rank:3,source_ts:now-2_000,max_age_ms:120_000,health:'OK'},
  ];
  const ranked=rankCapabilitySources({metric:'spot_flow',capabilities:caps,now});
  assert.equal(ranked[0].source,'OKX');
  const r=sourceExhaustion({metric:'spot_flow',capabilities:caps,now,attempts:[
    {source:'OKX',status:'CLOSED',value:8.4,source_ts:now-1_000,max_age_ms:120_000},
    {source:'HTX',status:'CLOSED',value:7.9,source_ts:now-50_000,max_age_ms:120_000},
  ]});
  assert.equal(r.status,'CLOSED');assert.equal(r.source,'OKX');assert.equal(r.selection.dynamic,true);
});

test('stale timeout and rate-limited facts never become zero or selected',()=>{
  const now=20_000_000;
  const caps=[
    {source:'HTX',connected:true,coverage_pct:100,completeness_pct:100,authority_rank:1,source_ts:now-999_999,max_age_ms:60_000,health:'OK'},
    {source:'OKX',connected:true,coverage_pct:100,completeness_pct:100,authority_rank:2,source_ts:now-2_000,max_age_ms:60_000,health:'TIMEOUT'},
    {source:'Binance',connected:true,coverage_pct:90,completeness_pct:90,authority_rank:3,source_ts:now-1_000,max_age_ms:60_000,health:'OK'},
  ];
  const r=sourceExhaustion({metric:'spot_flow',capabilities:caps,now,attempts:[
    {source:'HTX',status:'CLOSED',value:0,source_ts:now-999_999,max_age_ms:60_000},
    {source:'OKX',status:'TIMEOUT',value:0,source_ts:now-2_000,max_age_ms:60_000},
    {source:'Binance',status:'CLOSED',value:4.2,source_ts:now-1_000,max_age_ms:60_000},
  ]});
  assert.equal(r.status,'CLOSED');assert.equal(r.source,'Binance');assert.equal(r.value,4.2);
  assert.ok(r.trail.every(x=>x.value!==0||x.status!=='CLOSED'));
});

test('Hyperliquid allowlist name is not an active source without factual capability/attempt receipt',()=>{
  const now=30_000_000;
  const ranked=rankCapabilitySources({metric:'smart_money',capabilities:[{source:'ByKaranteli',connected:true,coverage_pct:80,completeness_pct:80,authority_rank:2,source_ts:now-1000,max_age_ms:60_000,health:'OK'}],now});
  const hl=ranked.find(x=>x.source==='Hyperliquid');
  assert.equal(hl.usable,false);assert.equal(hl.connected,false);
  const r=sourceExhaustion({metric:'smart_money',capabilities:[{source:'ByKaranteli',connected:true,coverage_pct:80,completeness_pct:80,authority_rank:2,source_ts:now-1000,max_age_ms:60_000,health:'OK'}],now,attempts:[{source:'ByKaranteli',status:'CLOSED',value:1,source_ts:now-1000,max_age_ms:60_000}]});
  assert.equal(r.source,'ByKaranteli');assert.equal(r.trail.some(x=>x.source==='Hyperliquid'&&x.active===true),false);
});

test('third independent source can resolve a divergence without averaging',()=>{
  const r=resolveCrossVenueConflict({metric:'oi',tolerance_pct:5,rows:[
    {source:'HTX',status:'CLOSED',value:100,authority_rank:1},
    {source:'Bybit',status:'CLOSED',value:141,authority_rank:2},
    {source:'OKX',status:'CLOSED',value:102,authority_rank:3},
  ]});
  assert.equal(r.status,'RESOLVED_BY_THIRD_SOURCE');assert.equal(r.consensus,100);assert.equal(r.consensus_source,'HTX');assert.equal(r.averaged,false);assert.equal(r.outliers[0].source,'Bybit');
});
