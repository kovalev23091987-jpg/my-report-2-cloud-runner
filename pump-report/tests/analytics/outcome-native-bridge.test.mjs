import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createPumpSources} from '../../sources/index.mjs';
import {createNativeRelativeCandleQualification} from '../../sources/native-relative-qualification.mjs';
import {analyzePump,RULES_VERSION} from '../../analytics/index.mjs';
import {evaluateOutcome} from '../../analytics/outcome.mjs';
import {plusTenPrice} from '../../analytics/math.mjs';
import {createPumpRunner} from '../../runtime/runner.mjs';
import {createOutcomeJournal} from '../../runtime/outcome-journal.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {createUnifiedBudget} from '../../runtime/budget.mjs';
import {textHash} from '../../runtime/delivery.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {CANDLE_CCXT_TIME_BASIS} from '../../contracts/index.mjs';
import {input,T,MINUTE} from './fixtures.mjs';

const ORIGINAL_RULES='pump-analytics-v1-tz2-20261025',BASE=Date.parse('2026-10-25T07:00:00Z'),HORIZON=14400000;
function atInput(at){
  const x=input(),delta=at-T;x.mode='MANUAL';x.analysis_ts=at;x.run_id='ARTIFICIAL_K_'+at;
  for(const f of Object.values(x.facts)){f.fact_id+=':K:'+at;f.event_ts+=delta;f.received_ts+=delta;f.expires_ts+=delta;}
  for(const r of x.facts.candles.value){r.open_ts+=delta;r.close_ts+=delta;}
  return x;
}
async function bridge({offset=0,boundaryHigh=false}={}){
  const t0=BASE+offset;let now=t0;const store=new MemoryStore(),clock=()=>now,requests=[],histories=[];
  const initial=atInput(t0),computed=analyzePump(initial);assert.equal(computed.ready,true);
  // An explicitly artificial saved historical v1 snapshot. No old engine/test
  // replay and no real SENT240 market values or message receipt are imported.
  const original={...computed,rules_version:ORIGINAL_RULES};
  const journal=createOutcomeJournal({store,profile:START_PROFILE,clock,evidence_class:'ARTIFICIAL'});
  async function remember(analysis,sourceInput){
    const key='pump:analysis:'+await textHash(JSON.stringify(analysis));
    await store.set(key,{analysis, input:sourceInput, saved_ts:clock()});await journal.remember(analysis,sourceInput,key);return key;
  }
  const originalKey=await remember(original,initial),journalKey='pump:journal:'+original.instrument.instrument_id+':'+original.wave_id;
  const signalKey='pump:signal:'+original.instrument.instrument_id+':'+original.wave_id;
  now=t0+1000;
  await store.set('pump:card:ARTIFICIAL_K_ORIGINAL',{state:'SENT',analysis:{...original,source_input_key:originalKey},created_ts:t0,updated_ts:now,
    message_id:'424242',receipt:{confirmed_ts:now,evidence:'ARTIFICIAL_MEMORY_ONLY_NOT_A_REAL_MESSAGE'}});
  await journal.publication('ARTIFICIAL_K_ORIGINAL');
  const first=await store.get(signalKey);assert.equal(first.origin.rules_version,ORIGINAL_RULES);
  const originalOrigin=structuredClone(first.origin),originalAnchor=structuredClone((await store.get(journalKey)).frozen_anchor);
  now=t0+MINUTE;
  const latestInput=atInput(now);latestInput.previous_wave=structuredClone(original.next_wave);latestInput.facts.price.value=105;
  const last=latestInput.facts.candles.value.at(-1);last.close=105;last.low=104.9;
  const latest=analyzePump(latestInput);assert.equal(latest.ready,true,JSON.stringify(latest.reasons));assert.equal(latest.rules_version,RULES_VERSION);assert.notEqual(latest.rules_version,ORIGINAL_RULES);assert.equal(latest.wave_id,original.wave_id);
  const latestKey=await remember(latest,latestInput);await journal.sync(journalKey);
  const qualification=createNativeRelativeCandleQualification(initial.instrument);
  const sources=createPumpSources({identityRegistry:[{instrument:initial.instrument,native_contract_id:'ARTIFICIAL_K_ONLY',qualifications:{candles:qualification}}],clock,
    broker:{async request(request){
      requests.push(structuredClone(request));const url=new URL(request.url);assert.equal(url.pathname,'/openApi/swap/v3/quote/klines');
      const start=Number(url.searchParams.get('startTime')),end=Math.ceil((t0+HORIZON)/MINUTE)*MINUTE;
      assert.equal(start,Math.floor(t0/MINUTE)*MINUTE);assert.equal(request.provider,'BINGX');assert.equal(request.family,'USDT_M');
      const count=(end-start)/MINUTE,data=Array.from({length:count},(_,i)=>({time:start+i*MINUTE,open:'112',high:boundaryHigh&&i===0?'125':'121',low:'111',close:'112',volume:'7.500'}));
      return {ok:true,status:200,data:{code:0,data},received_ts:clock(),receipt_id:'ARTIFICIAL_K_HISTORY_'+requests.length,cache_hit:false};
    }}});
  // Observe the real SOURCE output without replacing its loader or rows.
  const load=sources.getOutcomeHistory;sources.getOutcomeHistory=async args=>{const h=await load(args);histories.push(structuredClone(h));return h;};
  const budget=createUnifiedBudget({store,run_id:'ARTIFICIAL_K_BUDGET',mode:'AUTO',clock,policies:{},protected_reserves:{http_by_provider:{},delivery_http:0,outcomes_http:0},admission:null});
  const forbid=async()=>{throw Error('K_MUST_NOT_ENQUEUE_OR_SEND');};
  const runner=createPumpRunner({store,sources,analyzePump,evaluateOutcome,budget,delivery:{enqueue:forbid,dispatch:forbid,drain:forbid},clock,evidence_class:'ARTIFICIAL'});
  now=t0+HORIZON+MINUTE;
  return {store,journal,runner,requests,histories,t0,original,latest,latestInput,latestKey,signalKey,journalKey,originalOrigin,originalAnchor,
    async replayLatest(){await journal.remember(latest,latestInput,latestKey);await journal.sync(journalKey);},
    async verifyOrigin(){const s=await store.get(signalKey);assert.deepEqual(s.origin,originalOrigin);assert.equal(s.t0,t0);assert.equal(s.reference_price,original.reference_price);assert.equal(s.rules_version,ORIGINAL_RULES);assert.deepEqual((await store.get(journalKey)).frozen_anchor,originalAnchor);return s;}};
}
function verifyNativeHistory(h,expected){
  const f=h.facts.candles;assert.equal(f.status,'USABLE');assert.equal(f.purpose,'HISTORICAL_OUTCOME');assert.equal(f.expires_ts,null);assert.equal(f.value.length,expected);assert.equal(h.coverage.complete,true);assert.equal(h.coverage.time_qualified,true);assert.equal(h.coverage.time_basis,CANDLE_CCXT_TIME_BASIS);assert.equal(h.coverage.absolute_base_amount_qualified,false);assert.equal(h.coverage.absolute_USD_amount_qualified,false);
  for(const r of f.value){assert.equal(r.volume_base,null);assert.equal(r.turnover_quote,null);assert.equal(r.volume_native,7.5);assert.equal(r.native_volume_decimal,'7.500');assert.equal(r.native_quantity_unit,'UNKNOWN');assert.equal(r.native_time_semantics,'OPEN_TIME');assert.equal(r.native_time,r.open_ts);assert.equal(r.time_evidence_ref,h.coverage.time_evidence_ref);}
  assert.equal(f.event_ts,f.value.at(-1).close_ts);assert.ok(f.event_ts<=f.received_ts);
}
function verifySingleV1Cohort(q,{miss=0,unknown=0}={}){
  assert.equal(q.status,'CURRENT');assert.equal(q.independent_waves,1);assert.equal(q.mature_waves,1);assert.equal(q.pending_waves,0);assert.equal(q.mature_outcomes.hit,0);assert.equal(q.mature_outcomes.miss,miss);assert.equal(q.mature_outcomes.unknown,unknown);
  assert.equal(q.cohorts.length,1);assert.equal(q.cohorts[0].rules_version,ORIGINAL_RULES);assert.equal(q.cohorts[0].independent_waves,1);assert.equal(q.cohorts[0].mode,'MANUAL');assert.equal(q.cohorts[0].publication,'SENT');assert.equal(q.cohorts[0].map_mode,'NO_MAP');assert.equal(q.cohorts[0].evidence_class,'ARTIFICIAL');assert.equal(q.probability.value_pct,null);
}
async function evidence(name,data){await writeFile(new URL('../../handoffs/analytics/package-k/'+name+'.json',import.meta.url),JSON.stringify({evidence_class:'ARTIFICIAL',native_HTTP:0,native_SQL:0,Telegram:0,...data},null,2)+'\n');}

test('K01 real SOURCE 240/241 native-relative history closes MISS through ROOT journal and materialized summary at original v1 target',async()=>{
  const receipts=[];
  for(const offset of [0,123]){
    const h=await bridge({offset}),[outcome]=await h.runner.checkOutcomes({run_id:'ARTIFICIAL_K01_'+offset});assert.ok(outcome);verifyNativeHistory(h.histories[0],offset?241:240);
    assert.equal(outcome.status,'MISS');assert.equal(outcome.t0,h.t0);assert.equal(outcome.reference_price,h.original.reference_price);assert.equal(outcome.target_price,plusTenPrice(h.original.reference_price));assert.equal(outcome.rules_version,ORIGINAL_RULES);
    assert.equal(outcome.coverage.no_hit_period_covered,true);if(offset){assert.equal(outcome.coverage.complete,false);assert.equal(outcome.drawdown_total_pct,null);assert.equal(outcome.coverage.boundary_candles_excluded,2);}else assert.equal(outcome.coverage.complete,true);
    assert.ok(121>plusTenPrice(h.latest.reference_price),'wrongly replacing old P0 with latest J would turn this history into a false HIT');
    await h.verifyOrigin();const q=await h.runner.getSummary();verifySingleV1Cohort(q,{miss:1});assert.deepEqual(await h.store.get('pump:outcomes-pending'),[]);assert.equal(h.requests.length,1);
    receipts.push({offset,rows:h.histories[0].facts.candles.value.length,outcome,summary:q});
  }
  await evidence('complete-miss',{variants:receipts});
});
test('K02 a boundary high from true SOURCE history remains UNKNOWN through ROOT instead of becoming a false HIT',async()=>{
  const h=await bridge({offset:123,boundaryHigh:true}),[outcome]=await h.runner.checkOutcomes({run_id:'ARTIFICIAL_K02'});verifyNativeHistory(h.histories[0],241);
  assert.equal(h.histories[0].facts.candles.value[0].high_is_exact_period_hit_eligible,false);assert.equal(outcome.status,'UNKNOWN');assert.equal(outcome.hit_ts,null);assert.equal(outcome.hit_interval,null);assert.ok(outcome.reasons.includes('BOUNDARY_HIGH_NOT_PROOF'));assert.equal(outcome.target_price,plusTenPrice(h.original.reference_price));assert.equal(outcome.rules_version,ORIGINAL_RULES);
  await h.verifyOrigin();const q=await h.runner.getSummary();verifySingleV1Cohort(q,{unknown:1});assert.deepEqual(await h.store.get('pump:outcomes-pending'),[h.signalKey]);assert.equal(h.requests.length,1);await evidence('boundary-high',{outcome,summary:q});
});
test('K03 repeated latest J update and resolved-outcome replay retain one original v1 cohort without a second history load',async()=>{
  const h=await bridge();await h.replayLatest();const [outcome]=await h.runner.checkOutcomes({run_id:'ARTIFICIAL_K03'});assert.equal(outcome.status,'MISS');verifyNativeHistory(h.histories[0],240);
  const before=await h.runner.getSummary();verifySingleV1Cohort(before,{miss:1});const beforeAggregate=await h.store.get('pump:materialized-summary:v1'),beforeIndex=await h.store.get('pump:summary-record-index');
  await h.replayLatest();await h.replayLatest();assert.deepEqual(await h.runner.checkOutcomes({run_id:'ARTIFICIAL_K03_REPLAY'}),[]);
  const after=await h.runner.getSummary();verifySingleV1Cohort(after,{miss:1});assert.deepEqual(after.mature_outcomes,before.mature_outcomes);assert.deepEqual(after.cohorts,before.cohorts);assert.equal(h.requests.length,1);assert.deepEqual(await h.store.get('pump:summary-record-index'),beforeIndex);assert.equal((await h.store.get('pump:materialized-summary:v1')).records_applied,beforeAggregate.records_applied);
  const j=await h.store.get(h.journalKey);assert.equal(j.analyses.length,2);assert.ok(j.analyses.some(a=>a.origin.rules_version===RULES_VERSION));assert.ok(j.analyses.some(a=>a.origin.rules_version===ORIGINAL_RULES));await h.verifyOrigin();await evidence('same-wave-replay',{outcome,before,after,source_history_requests:h.requests.length,unique_saved_analyses:j.analyses.length,summary_records:beforeIndex.length});
});
