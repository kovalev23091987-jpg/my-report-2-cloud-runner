import test from 'node:test';
import assert from 'node:assert/strict';
import {createPumpSources} from '../../sources/index.mjs';
import {createUnifiedBudget,createRequestBroker,utcDay} from '../../runtime/budget.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {BINGX_IDENTITY_REGISTRY} from '../../registry/index.mjs';

test('real Source to broker path cannot start HTTP when the durable budget reservation completes past the shared deadline',async()=>{
  const start=1800000000000,store=new MemoryStore();let now=start,fetches=0;
  const budget=createUnifiedBudget({store,run_id:'ARTIFICIAL_POST_RESERVE_DEADLINE',mode:'MANUAL',clock:()=>now,policies:{BINGX:{version:'ARTIFICIAL',evidence_ref:'ARTIFICIAL_ONLY',allowed_hosts:['open-api.bingx.com'],allowed_paths:['/openApi/swap/*'],project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10,per_second_cap:1}},protected_reserves:{http_by_provider:{BINGX:0},delivery_http:0,outcomes_http:0},admission:{provider_policy_version:'ARTIFICIAL',expires_ts:start+100000}});
  const slow={...budget,async reserve(args){const receipt=await budget.reserve(args);now+=10;return receipt;}};
  const broker=createRequestBroker({store,budget:slow,clock:()=>now,fetch_impl:async()=>{fetches++;throw Error('LATE_HTTP_FORBIDDEN');}});
  const source=createPumpSources({broker,identityRegistry:BINGX_IDENTITY_REGISTRY,clock:()=>now}),instrument=BINGX_IDENTITY_REGISTRY.find(e=>e.instrument.native_symbol==='SOL-USDT').instrument;
  const result=await source.getOptional({instrument,deadline_ts:start+5});
  assert.equal(fetches,0);assert.equal(result.facts.trades.reason,'SOURCE_DEADLINE_EXPIRED');assert.equal(result.deadline_status,'TIMEOUT');
  const resources=await store.get('pump:resources');assert.equal(resources.days[utcDay(start)],1,'the issued conservative charge is not refunded');assert.deepEqual(resources.outstanding,{});assert.deepEqual(resources.unknown,{});
  const summary=budget.summary();assert.equal(summary.total,1);assert.equal(summary.receipts.length,1);assert.equal(summary.receipts[0].state,'CONFIRMED');assert.equal(summary.receipts[0].network_attempted,false);
});
