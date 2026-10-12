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
 const [{buildSpotFuturesMarketContext,buildSpotFuturesJointConclusion,buildSpotExecutionCostContext},{formatManualReport,selectSupportingContextFacts},{renderCanonicalTelegram,canonicalFingerprint},{spotSnapshotForTest},{formatTelegramCompact},{APPROVED_HTX_SCOPE,APPROVED_HTX_ANALYSIS_CONTRACTS,approvedHtxAnalysisAssetForContract},{plainSpotFuturesJointConclusion}]=await Promise.all(
  ['canonical-runtime-adapter.mjs','manual-report-formatter.mjs','canonical-publication.mjs','worker.js','telegram-compact-formatter.mjs','approved-htx-analysis-scope.mjs','telegram-plain-facts.mjs'].map(name=>import(new URL(name,src)))
 );
 const fixture=JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical;
 const T=fixture.observed_ts,contract=fixture.metadata.contract;
 const component=(market,clock=T-10_000)=>({execution_status:'FULFILLED',available_ts:T-5_000,data:{
  market,contract,requested_symbol:contract,symbol:contract.replace('-','').toLowerCase(),contract_info:{contract_code:contract},
  health:{depth:true,info:true},depth_bbo:{best_bid:100,best_ask:100.2,source_ts:clock},
 }});
 const args=()=>({contract,observed_ts:T,spot_component:component('HTX Spot'),futures_component:component('HTX USDT-M Futures',T-12_000)});

 test('spot comparison is limited to the exact approved 105-asset HTX analysis universe',()=>{
  assert.equal(APPROVED_HTX_SCOPE.approved_assets,105);
  assert.equal(APPROVED_HTX_ANALYSIS_CONTRACTS.length,105);
  for(const row of APPROVED_HTX_ANALYSIS_CONTRACTS){
   const exact=row.contract_code;
   assert.equal(approvedHtxAnalysisAssetForContract(exact),row.asset_symbol);
   const approved={contract:exact,observed_ts:T,spot_component:{...component('HTX Spot'),data:{...component('HTX Spot').data,contract:exact,requested_symbol:exact,symbol:exact.replace('-','').toLowerCase()}},futures_component:{...component('HTX USDT-M Futures'),data:{...component('HTX USDT-M Futures').data,contract:exact,requested_symbol:exact,contract_info:{contract_code:exact}}}};
   const receipt=buildSpotFuturesMarketContext(approved);
   assert.equal(receipt.status,'CLOSED_COMPARABLE_PRICE_AND_SPREAD',exact);
   assert.equal(receipt.approved_manifest_sha256,APPROVED_HTX_SCOPE.manifest_sha256);
  }
  for(const foreign of ['FAKE-USDT','STOCK-USDT','AAVEUSDT','']){
   const wrong={...args(),contract:foreign};
   wrong.spot_component.data.requested_symbol=foreign;
   wrong.spot_component.data.symbol=foreign.replace('-','').toLowerCase();
   wrong.futures_component.data.contract=foreign;
   wrong.futures_component.data.contract_info.contract_code=foreign;
   const receipt=buildSpotFuturesMarketContext(wrong);
   assert.equal(receipt.status,'NOT_IN_APPROVED_HTX_ANALYSIS_UNIVERSE',foreign);
   assert.equal(receipt.fact,null);
   assert.equal(receipt.network_calls,0);
  }
 });

 test('original same-depth clocks yield one neutral HTX comparison and the same bounded conclusion in manual and Telegram',()=>{
  const input=args(),before=structuredClone(input),receipt=buildSpotFuturesMarketContext(input);
  assert.equal(receipt.status,'CLOSED_COMPARABLE_PRICE_AND_SPREAD');
  assert.equal(receipt.independent_venue_count,1);
  assert.equal(receipt.network_calls,0);
  assert.equal(receipt.score_contribution,0);
  assert.equal(receipt.directional_vote,false);
  assert.equal(receipt.entry_authorized,false);
  assert.deepEqual(receipt.spot_exempt_blocks,['N11']);
  assert.equal(Object.hasOwn(receipt.applicability_not_block_coverage,'N11'),false);
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
  const summary=buildSpotFuturesJointConclusion({market_context:receipt,block_context:{facts:[]},evidence:[],contract,observed_ts:T});
  assert.equal(summary.field,'SPOT_FUTURES_JOINT_CONCLUSION');
  assert.match(summary.value,/совместная выборка последних сделок не подтверждена/);
  canonical.metadata.canonical_runtime_adapter='canonical-runtime-adapter-v18-spot-futures-joint-output-20261012';
  canonical.metadata.supporting_context.blocks={spot_futures_market:receipt};
  canonical.metadata.supporting_context.facts.push(receipt.fact,summary);
  canonical.analytical_fingerprint=canonicalFingerprint(canonical);
  const manual=formatManualReport(canonical);
  assert.equal(manual.ok,true,manual.status);
  assert.match(manual.text,/Сверка спота и фьючерсов/);
  assert.match(manual.text,/Сводный вывод по споту и фьючерсам/);
  compactCanonical.metadata.canonical_runtime_adapter=canonical.metadata.canonical_runtime_adapter;
  compactCanonical.metadata.supporting_context.blocks={spot_futures_market:receipt};
  compactCanonical.metadata.supporting_context.facts.push(receipt.fact,summary);
  compactCanonical.observed_ts=T;
  const compact=formatTelegramCompact(compactCanonical);
  assert.equal(compact.ok,true,compact.status);
  assert.match(compact.message,/Сводный вывод по споту и фьючерсам/);
  assert.notEqual(compact.message,baselineCompact.message);
  for(const [i,context_policy] of ['ORIGINAL_V5_20261006','ORIGINAL_BRIEF_20261007'].entries()){
   const telegram=renderCanonicalTelegram({canonical,lifecycle_event:'OBSERVE',context_policy});
   assert.equal(telegram.ok,true,telegram.status);
   assert.match(telegram.text,/Сводный вывод по споту и фьючерсам/);
   assert.ok(telegram.text.includes(`${summary.label}: ${summary.value} — ХТХ.`));
   assert.notEqual(telegram.text,baselineTelegram[i].text);
  }
  const altered=structuredClone(canonical);
  altered.metadata.supporting_context.facts.find(f=>f.field==='SPOT_FUTURES_JOINT_CONCLUSION').source_ts=T-301_000;
  assert.equal(plainSpotFuturesJointConclusion(altered),null,'stale summary cannot reach Telegram');
 });
 test('disagreeing recent spot/futures trades produce a cautious shared conclusion',()=>{
  const market=buildSpotFuturesMarketContext(args()),evidence_id='N12:CONTROLLED:HTX';
  const row={evidence_id,htx_contract:contract,block_id:'N12',metric_family:'ACTUAL_TAKER_TRADES_BOUNDED_MULTI_MARKET',independent_venue_count:1,coverage_status:'BOUNDED_MULTIMARKET_DISAGREEMENT',observed_ts:T,source_ts:T-5000,components:[{venue:'HTX',market:'FUTURES'},{venue:'HTX',market:'SPOT'}]};
  const conclusion=buildSpotFuturesJointConclusion({market_context:market,block_context:{facts:[{block_id:'N12',field:row.metric_family,evidence_id,observed_ts:T}]},evidence:[row],contract,observed_ts:T});
  assert.match(conclusion.value,/последние сделки двух рынков расходятся/);
  assert.match(conclusion.value,/общий рыночный вывод по этим данным не установлен/);
  assert.equal(conclusion.score_contribution,0);
  assert.equal(conclusion.entry_authorized,false);
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
  assert.equal(skew.status,'SOURCE_CLOCKS_NOT_ALIGNED');assert.equal(skew.comparison,null);assert.match(skew.fact.value,/снимки разделяют 70 с/);assert.match(skew.fact.value,/процентную разницу цен не рассчитываем/);
  const asyncConclusion=buildSpotFuturesJointConclusion({market_context:skew,block_context:{facts:[]},contract,observed_ts:T});
  assert.match(asyncConclusion.value,/спот.*фьючерсы.*70 с/);assert.doesNotMatch(asyncConclusion.value,/дороже|дешевле/);
  const asyncCanonical=structuredClone(fixture);asyncCanonical.metadata.canonical_runtime_adapter='canonical-runtime-adapter-v18-spot-futures-joint-output-20261012';
  asyncCanonical.metadata.supporting_context={blocks:{spot_futures_market:skew},facts:[skew.fact,asyncConclusion]};
  const asyncManual=formatManualReport(asyncCanonical);assert.equal(asyncManual.ok,true);assert.match(asyncManual.text,/Разновременные котировки спота и фьючерсов/);assert.match(asyncManual.text,/спот.*фьючерсы.*70 с/);
  const asyncTelegram=plainSpotFuturesJointConclusion(asyncCanonical);assert.match(asyncTelegram,/спот.*фьючерсы.*70 с/);
  const noSpot=buildSpotFuturesMarketContext({...args(),spot_component:null});
  assert.equal(noSpot.status,'FUTURES_ONLY');assert.match(noSpot.fact.value,/спотовая котировка не подтверждена/);
  const bounded=buildSpotFuturesJointConclusion({market_context:noSpot,block_context:{facts:[]},contract,observed_ts:T});
  assert.match(bounded.value,/свежая котировка есть только для фьючерсов/);
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
  assert.equal(spot.spot_execution_reference.requested_notional_usdt,500);
  assert.equal(spot.spot_execution_reference.source_ts,depthTs);
  assert.equal(spot.spot_execution_reference.buy.fully_filled,true);
  assert.equal(spot.spot_execution_reference.sell.fully_filled,true);
  const pair=buildSpotFuturesMarketContext({contract,observed_ts:now,spot_component:{execution_status:'FULFILLED',data:spot},futures_component:component('HTX USDT-M Futures',depthTs)});
  const cost=buildSpotExecutionCostContext({contract,observed_ts:now,spot_component:{execution_status:'FULFILLED',data:spot},market_context:pair});
  assert.equal(cost.status,'SPOT_EXECUTION_REFERENCE_CLOSED');
  assert.equal(cost.fact.block_id,'N16');
  assert.equal(cost.fact.telegram_eligible,false);
  assert.equal(cost.fact.source_ts,depthTs);
  assert.equal(cost.network_calls,0);
  assert.equal(cost.score_contribution,0);
  const crowdedFacts=[...Array.from({length:28},(_,i)=>({source:'test',label:`Факт ${i}`,value:'проверен'})),pair.fact,cost.fact];
  const reserved=selectSupportingContextFacts(crowdedFacts);
  assert.equal(reserved.length,24);
  assert.ok(reserved.includes(pair.fact));
  assert.ok(reserved.includes(cost.fact));
  const manualCanonical=structuredClone(fixture);manualCanonical.metadata.supporting_context={facts:[cost.fact]};
  const manual=formatManualReport(manualCanonical);
  assert.equal(manual.ok,true,manual.status);
  assert.match(manual.text,/Спотовый ориентир издержек для 500 USDT/);
  assert.equal(manual.text.includes('Измеренная глубина стакана'),false);
  const tampered=structuredClone(spot);
  tampered.spot_execution_reference.buy.impact_bps=100;
  assert.equal(buildSpotExecutionCostContext({contract,observed_ts:now,spot_component:{execution_status:'FULFILLED',data:tampered},market_context:pair}).status,'SPOT_EXECUTION_REFERENCE_NOT_CLOSED');
  assert.equal(buildSpotExecutionCostContext({contract,observed_ts:now,spot_component:{execution_status:'FULFILLED',data:spot},market_context:{...pair,spot:null}}).status,'SPOT_EXECUTION_REFERENCE_NOT_CLOSED');
 });
 test('approved non-ASCII contract retains its exact spot query symbol',async()=>{
  const exact='哈基米-USDT',calls=[];
  assert.equal(approvedHtxAnalysisAssetForContract(exact),'哈基米');
  const spot=await spotSnapshotForTest({symbol:exact,_fetch_json:async url=>{calls.push(url);return{ok:false,data:null,error:'CONTROLLED_NO_SAVED_MARKET_RESPONSE'};}});
  assert.equal(calls.length,4);
  for(const url of calls)assert.equal(new URL(url).searchParams.get('symbol'),'哈基米usdt');
  assert.equal(spot.requested_symbol,exact);
  assert.equal(spot.symbol,'哈基米usdt');
  assert.equal(spot.health.depth,false);
 });
}
