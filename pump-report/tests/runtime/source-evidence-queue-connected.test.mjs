import test from 'node:test';
import assert from 'node:assert/strict';
import {BINGX_IDENTITY_REGISTRY} from '../../registry/index.mjs';
import {createReviewedNativeScopeRegistry} from '../../registry/native-reviewed550.mjs';
import {createSourceEvidenceAdmission} from '../../runtime/source-evidence-admission.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {createPumpRunner} from '../../runtime/runner.mjs';
import {createUnifiedBudget} from '../../runtime/budget.mjs';
import {createDelivery} from '../../runtime/delivery.mjs';
import {analyzePump,evaluateOutcome} from '../../analytics/index.mjs';
import {input,T,fact} from '../analytics/fixtures.mjs';
import {emptyMap} from '../../contracts/index.mjs';

test('unknown native units stay in bulk discovery and cannot monopolize deep checks ahead of a qualified coin',async()=>{
  const registry=createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY),assess=createSourceEvidenceAdmission(registry);
  const good=registry.resolve({native_symbol:'1INCH-USDT'}).instrument,bad=registry.resolve({native_symbol:'1000SHIB-USDT'}).instrument;
  assert.equal(assess(good).eligible,true);assert.deepEqual(assess(bad),{eligible:false,reason:'NATIVE_CORE_UNIT_EVIDENCE_REQUIRED',market_data_checked:false});
  const store=new MemoryStore(),core=[],bulk=[];
  await store.set('pump:candidate-queue',{[bad.instrument_id]:{instrument_id:bad.instrument_id,first_seen:T-3600000,next_check_ts:T-1,movement_event_ts:T}});
  const relabel=(f,i)=>({...structuredClone(f),instrument_id:i.instrument_id});
  const sources={getCatalog:async()=>({instruments:[bad,good],unqualified:[],coverage:{status:'CHECKED'}}),
    getOverview:async({instruments})=>{bulk.push(instruments.map(i=>i.instrument_id));return {observations:instruments.map(i=>({instrument:i,reported_change_pct:30,facts:{price:relabel(fact('price',112,'USDT_PER_BASE'),i)}})),coverage:{status:'CHECKED'}};},
    getCore:async({instrument})=>{core.push(instrument.instrument_id);assert.equal(instrument.instrument_id,good.instrument_id);return {facts:Object.fromEntries(Object.entries(input().facts).map(([k,f])=>[k,relabel(f,good)])),coverage:{status:'CHECKED'}};},
    getLiquidations:async()=>emptyMap(),getOptional:async()=>({facts:{}})};
  const budget=createUnifiedBudget({store,run_id:'ARTIFICIAL_SOURCE_EVIDENCE',mode:'AUTO',clock:()=>T,policies:{},protected_reserves:{http_by_provider:{},delivery_http:0,outcomes_http:0},admission:{}});
  const delivery=createDelivery({store,clock:()=>T,recipient:'ARTIFICIAL',revalidate:async()=>({valid:false}),send:async()=>{assert.fail('NO DELIVERY IN THIS CASE');}});
  const runner=createPumpRunner({store,sources,budget,delivery,analyzePump,evaluateOutcome,clock:()=>T,assess_source_evidence:assess});
  const result=await runner.execute({mode:'AUTO',run_id:'ARTIFICIAL_SOURCE_EVIDENCE',publish:false});
  assert.equal(result.status,'INCOMPLETE');assert.deepEqual(result.errors,[{reason:'SOURCE_EVIDENCE_PENDING',count:1}]);assert.equal(result.discovery_result,'INCOMPLETE_COVERAGE_OR_RESOURCES');assert.deepEqual(core,[good.instrument_id]);
  assert.deepEqual(bulk[0],[bad.instrument_id,good.instrument_id]);assert.equal(result.catalog_coverage.delivery_eligible_verified_count,2);
  assert.deepEqual(result.source_evidence_coverage,{eligible_for_deep_check:1,temporarily_deferred:1,reason_counts:{NATIVE_CORE_UNIT_EVIDENCE_REQUIRED:1},not_an_asset_exclusion:true,current_CORE_proven:false});
  assert.ok((await store.get('pump:candidate-queue'))[bad.instrument_id]);
  const before=core.length,manual=await runner.checkInstrument(bad,{mode:'MANUAL',run_id:'ARTIFICIAL_MANUAL',publish:true});
  assert.equal(manual.status,'DEFERRED_SOURCE_EVIDENCE');assert.equal(manual.source_coverage.status,'NOT_CHECKED');assert.equal(manual.delivery,null);assert.equal(core.length,before);
});
