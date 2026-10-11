import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.env.REPORT2_UNIFIED_MODULE_ROOT;
if(!root){
 test('assembled runtime is required for shared spot/futures context', {skip:'encrypted production runtime not assembled'},()=>{});
}else{
 const src=pathToFileURL(path.resolve(root)+'/');
 const [{buildSpotFuturesMarketContext},{formatManualReport,selectSupportingContextFacts},{renderCanonicalTelegram,canonicalFingerprint},{spotSnapshotForTest},{formatTelegramCompact}]=await Promise.all(
  ['canonical-runtime-adapter.mjs','manual-report-formatter.mjs','canonical-publication.mjs','worker.js','telegram-compact-formatter.mjs'].map(name=>import(new URL(name,src)))
 );
 const fixture=JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical;
 const T=fixture.observed_ts,contract=fixture.metadata.contract;
 const component=(market,clock=T-10_000)=>({execution_status:'FULFILLED',available_ts:T-5_000,data:{
  market,contract,requested_symbol:contract,symbol:contract.replace('-','').toLowerCase(),contract_info:{contract_code:contract},
  health:{depth:true,info:true},depth_bbo:{best_bid:100,best_ask:100.2,source_ts:clock},
 }});
 const args=()=>({contract,observed_ts:T,spot_component:component('HTX Spot'),futures_component:component('HTX USDT-M Futures',T-12_000)});

 test('original same-depth clocks yield one neutral HTX comparison and approved report text',()=>{
  const input=args(),before=structuredClone(input),receipt=buildSpotFuturesMarketContext(input);
  assert.equal(receipt.status,'CLOSED_COMPARABLE_PRICE_AND_SPREAD');
  assert.equal(receipt.independent_venue_count,1);
  assert.equal(receipt.network_calls,0);
  assert.equal(receipt.score_contribution,0);
  assert.equal(receipt.directional_vote,false);
  assert.equal(receipt.entry_authorized,false);
  assert.equal(receipt.comparison.source_skew_ms,2_000);
  assert.equal(JSON.stringify(input),JSON.stringify(before));
  const canonical=structuredClone(fixture);
  canonical.state='OBSERVE';canonical.direction='LONG';
  canonical.reasons=canonical.reasons||[];
  canonical.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:T+600_000,next_recheck_ts:T+60_000,cancel_condition:'price<1'};
  canonical.metadata.supporting_context={facts:[]};
  canonical.analytical_fingerprint=canonicalFingerprint(canonical);
  const compactCanonical={status:'CLOSED',state:'OBSERVE',observed_ts:T,candidates:[{contract}],scores:{overall_0_100:70,coin_interest_0_100:70,entry_readiness_0_100:null},reasons:[],metadata:{contract,supporting_context:{facts:[]}}};
  const baselineCompact=formatTelegramCompact(compactCanonical);
  assert.equal(baselineCompact.ok,true,baselineCompact.status);
  const baselineTelegram=['ORIGINAL_V5_20261006','ORIGINAL_BRIEF_20261007'].map(context_policy=>renderCanonicalTelegram({canonical,lifecycle_event:'OBSERVE',context_policy}));
  canonical.metadata.supporting_context.facts.push(receipt.fact);
  canonical.analytical_fingerprint=canonicalFingerprint(canonical);
  const manual=formatManualReport(canonical);
  assert.equal(manual.ok,true,manual.status);
  assert.match(manual.text,/Сверка спота и фьючерсов/);
  compactCanonical.metadata.supporting_context.facts.push(receipt.fact);
  assert.equal(formatTelegramCompact(compactCanonical).message,baselineCompact.message);
  for(const [i,context_policy] of ['ORIGINAL_V5_20261006','ORIGINAL_BRIEF_20261007'].entries()){
   const telegram=renderCanonicalTelegram({canonical,lifecycle_event:'OBSERVE',context_policy});
   assert.equal(telegram.ok,true,telegram.status);
   assert.equal(telegram.text,baselineTelegram[i].text,'approved Telegram wording stays unchanged');
  }
 });
 test('foreign, stale, future and incomplete books retain only the verified market; skewed pairs do not compare',()=>{
  const changes=[
   [a=>a.spot_component.data.symbol='otherusdt','FUTURES_ONLY'],
   [a=>a.futures_component.data.contract_info.contract_code='OTHER-USDT','SPOT_ONLY'],
   [a=>a.spot_component.data.depth_bbo.source_ts=T-300_001,'FUTURES_ONLY'],
   [a=>a.spot_component.data.depth_bbo.source_ts=T+1,'FUTURES_ONLY'],
   [a=>a.spot_component.data.health.depth=false,'FUTURES_ONLY'],
   [a=>a.spot_component.data.depth_bbo.best_ask=99,'FUTURES_ONLY'],
  ];
  for(const [change,expected] of changes){const input=args();change(input);const receipt=buildSpotFuturesMarketContext(input);assert.equal(receipt.status,expected);assert.equal(receipt.comparison,null);assert.match(receipt.fact.value,/котировка не подтверждена/);assert.equal(receipt.fact.score_contribution,0);}
  const skewed=args();skewed.spot_component.data.depth_bbo.source_ts=T-80_000;
  const skew=buildSpotFuturesMarketContext(skewed);
  assert.equal(skew.status,'SOURCE_CLOCKS_NOT_ALIGNED');assert.equal(skew.comparison,null);assert.equal(skew.fact,null);
  const noSpot=buildSpotFuturesMarketContext({...args(),spot_component:null});
  assert.equal(noSpot.status,'FUTURES_ONLY');assert.match(noSpot.fact.value,/спотовая котировка не подтверждена/);
  const noFutures=buildSpotFuturesMarketContext({...args(),futures_component:null});
  assert.equal(noFutures.status,'SPOT_ONLY');assert.match(noFutures.fact.value,/фьючерсная котировка не подтверждена/);
  const missing=buildSpotFuturesMarketContext({...args(),spot_component:null,futures_component:null});
  assert.equal(missing.status,'NO_FRESH_EXACT_DEPTH_PAIR');assert.equal(missing.fact,null);
  const canonical=structuredClone(fixture);canonical.metadata.supporting_context={facts:[noSpot.fact]};
  const manual=formatManualReport(canonical);
  assert.equal(manual.ok,true,manual.status);assert.match(manual.text,/Котировка доступного рынка HTX/);
  const crowded=Array.from({length:25},(_,i)=>({source:'test',label:`Факт ${i}`,value:'проверен'}));crowded.push(noSpot.fact);
  const selected=selectSupportingContextFacts(crowded);
  assert.equal(selected.length,24);assert.ok(selected.includes(noSpot.fact),'existing 24-line report budget retains useful single-market fact');
 });
 test('spot original depth prices are kept separate from a disagreeing ticker without extra HTTP',async()=>{
  const now=Date.now(),depthTs=now-10_000;
  const calls=[];
  const spot=await spotSnapshotForTest({symbol:contract,_fetch_json:async url=>{
   calls.push(url);
   if(url.includes('/market/detail/merged'))return{ok:true,data:{status:'ok',ts:now,tick:{close:101,bid:[90,1],ask:[110,1]}}};
   if(url.includes('/market/depth'))return{ok:true,data:{status:'ok',ts:depthTs,tick:{ts:depthTs,bids:[[100,20]],asks:[[100.2,20]]}}};
   return{ok:false,data:null,error:'CONTROLLED_MISSING_OPTIONAL_HISTORY'};
  }});
  assert.equal(calls.length,4);
  assert.equal(spot.bbo.best_bid,90);
  assert.equal(spot.depth_bbo.best_bid,100);
  assert.equal(spot.depth_bbo.best_ask,100.2);
  assert.equal(spot.depth_bbo.source_ts,depthTs);
 });
}
