import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnifiedBudget,createRequestBroker,utcDay,utcMonth} from '../../runtime/budget.mjs';
import {createPumpRunner} from '../../runtime/runner.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {createDelivery} from '../../runtime/delivery.mjs';
import {analyzePump,evaluateOutcome} from '../../analytics/index.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {input,T} from '../analytics/fixtures.mjs';

// Isolated artificial clock/store/HTTP/TG fixtures. No native IO or capacity test.
const protected_reserves={http_by_provider:{BINGX:102,TELEGRAM:6},delivery_http:24,outcomes_http:24};
function context({now=T-60000}={}){
  const store=new MemoryStore(),events=[],day=utcDay(now),month=utcMonth(now),version='preserved-test-pool';let time=now;
  const policies={BINGX:{version,evidence_ref:'CONTROLLED_SOURCE_WINDOW',allowed_hosts:['example.invalid'],allowed_paths:['/fact'],project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10,per_second_cap:1,qualification_attempt_cap:24}};
  const budget=createUnifiedBudget({store,run_id:'CONTROLLED_WINDOW',mode:'MANUAL',clock:()=>time,policies,protected_reserves,admission:{provider_policy_version:version,expires_ts:T+900000,run_purpose:'ACCEPTANCE_TEST'}});
  const broker=createRequestBroker({budget,store,clock:()=>time,sleep_impl:async ms=>{events.push({kind:'WAIT',ms,ts:time});time+=ms;},fetch_impl:async()=>{events.push({kind:'HTTP',ts:time});return new Response('{"code":0}',{status:200});}});
  const request=()=>broker.request({provider:'BINGX',url:'https://example.invalid/fact',cache_key:'uncached:'+events.length,ttl_ms:0});
  return {store,budget,broker,events,day,month,version,request,clock:()=>time};
}

test('cold candidate waits for rolling quota before fresh facts and completes ten charged calls without changing old spent or unknowns',async()=>{
  const c=context(),{store,budget,broker,events,day,month,version,clock,request}=c;
  const oldUnknown={OLD_HTTP_UNKNOWN:{provider:'BINGX',cost:2,ts:T-3600000}};
  await store.set('pump:resources',{schema:'PUMP_SHARED_RESOURCE_V1',days:{[day]:22},providers:{BINGX:{days:{[day]:17},months:{[month]:17},qualification_totals:{[version]:12},recent:[{ts:clock(),cost:10}]}},outstanding:{},unknown:oldUnknown});
  const raw=input();for(const bar of raw.facts.candles.value.slice(-5))bar.volume_base=3000;
  const sources={
    getOverview:async()=>{events.push({kind:'OVERVIEW',ts:clock()});await request();return {observations:[{instrument:raw.instrument,facts:{price:raw.facts.price}}]};},
    getDayGrowth:async()=>{await request();return {facts:{}};},
    getCore:async()=>{for(let n=0;n<4;n++)await request();events.push({kind:'CORE',ts:clock()});return {facts:raw.facts,coverage:{status:'USABLE'}};},
    getOptional:async()=>{await request();await request();return {facts:{}};},
    getLiquidations:async()=>raw.liquidations
  };
  const delivery=createDelivery({store,clock,recipient:'CONTROLLED',revalidate:async()=>{await request();await request();assert.ok(clock()<raw.facts.orderbook.expires_ts);return {valid:true};},send:async()=>({ok:true,status:200,body:{ok:true,result:{message_id:987,chat:{id:'CONTROLLED'},date:Math.floor(clock()/1000)}}})});
  let assertions=0;
  const runner=createPumpRunner({store,sources,delivery,budget,analyzePump,evaluateOutcome,profile:START_PROFILE,clock,evidence_class:'ARTIFICIAL',run_purpose:'ACCEPTANCE_TEST',await_source_window:args=>broker.awaitProviderWindow(args)});
  const result=await runner.checkInstrument(raw.instrument,{run_id:'CONTROLLED_WINDOW',mode:'MANUAL',assert_execution:async()=>{assertions++;}});
  assert.equal(events[0].kind,'WAIT');assert.equal(events[0].ms,60000);assert.equal(events.find(e=>e.kind==='OVERVIEW').ts,T);
  assert.equal(events.filter(e=>e.kind==='HTTP').length,10);assert.equal(budget.summary().total,10);assert.equal(assertions>=3,true);
  assert.equal(result.analysis.ready,true,JSON.stringify(result.analysis.reasons));assert.equal(result.delivery.state,'SENT');
  const state=await store.get('pump:resources');assert.equal(state.days[day],32);assert.equal(state.providers.BINGX.days[day],27);assert.equal(state.providers.BINGX.months[month],27);assert.equal(state.providers.BINGX.qualification_totals[version],22);assert.deepEqual(state.unknown,oldUnknown);assert.deepEqual(state.outstanding,{});assert.deepEqual(budget.summary().protected_reserves,protected_reserves);
  assert.equal(state.providers.BINGX.recent.reduce((n,r)=>n+r.cost,0),10);assert.ok(clock()-T<15000);
});

test('window deadline and backoff stop before any provider attempt or counter mutation',async()=>{
  const c=context(),{store,broker,budget,clock,day,month,version,events}=c;
  const seed={schema:'PUMP_SHARED_RESOURCE_V1',days:{[day]:22},providers:{BINGX:{days:{[day]:17},months:{[month]:17},qualification_totals:{[version]:12},recent:[{ts:clock(),cost:10}]}},outstanding:{},unknown:{RETAINED:{cost:2}}};
  await store.set('pump:resources',seed);
  await assert.rejects(broker.awaitProviderWindow({provider:'BINGX',cost:10,deadline_ts:clock()+1000}),{code:'SOURCE_WINDOW_DEADLINE_EXPIRED'});
  assert.deepEqual(await store.get('pump:resources'),seed);assert.equal(events.length,0);
  seed.providers.BINGX.backoff_until=clock()+30000;await store.set('pump:resources',seed);
  await assert.rejects(broker.awaitProviderWindow({provider:'BINGX',cost:10}),{code:'PROVIDER_BACKOFF'});
  assert.deepEqual(await store.get('pump:resources'),seed);assert.equal(budget.summary().total,0);assert.equal(events.length,0);
});
