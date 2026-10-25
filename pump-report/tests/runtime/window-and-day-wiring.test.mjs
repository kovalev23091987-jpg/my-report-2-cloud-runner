import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../runtime/store.mjs';
import {createUnifiedBudget,createRequestBroker} from '../../runtime/budget.mjs';
import {createPumpRunner} from '../../runtime/runner.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {T,instrument} from '../analytics/fixtures.mjs';

const policy={version:'ARTIFICIAL_WINDOW',evidence_ref:'ARTIFICIAL_ONLY',project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10,per_second_cap:1,allowed_hosts:['example.test'],allowed_paths:['/price']};
function budget(store,clock,strict=true){return createUnifiedBudget({store,run_id:crypto.randomUUID(),mode:'AUTO',clock,policies:{TEST:policy},admission:{provider_policy_version:policy.version,expires_ts:clock()+3600000,strict_automatic_window:strict},protected_reserves:{http_by_provider:{TEST:6},delivery_http:2,outcomes_http:2}});}
test('a paced automatic request crossing20:00 Moscow cannot dispatch, while explicit manual work remains available',async()=>{
  let at=Date.parse('2026-10-25T16:59:59.500Z'),calls=0;const store=new MemoryStore(),b=budget(store,()=>at),broker=createRequestBroker({budget:b,store,clock:()=>at,sleep_impl:async ms=>{at+=ms;},fetch_impl:async()=>{calls++;return Response.json({ok:true});}});
  const request=cache_key=>({provider:'TEST',url:'https://example.test/price',cache_key});await broker.request(request('before-close'));
  await assert.rejects(broker.request(request('paced-after-close')),{code:'BUDGET_AUTOMATIC_WINDOW_CLOSED'});assert.equal(calls,1);assert.equal(b.summary().total,1);
  b.setMode('STATISTICS');await assert.rejects(b.reserve({provider:'TEST',request_id:'automatic-statistics'}),{code:'BUDGET_AUTOMATIC_WINDOW_CLOSED'});
  b.setMode('MANUAL');await broker.request(request('explicit-manual'));assert.equal(calls,2);assert.equal(b.summary().total,2);
});
test('automatic source cache reads are refused at night and operator checks do not inherit an automatic-only gate',async()=>{
  const at=Date.parse('2026-10-25T17:00:00Z'),store=new MemoryStore();let calls=0;const b=budget(store,()=>at),broker=createRequestBroker({budget:b,store,clock:()=>at,fetch_impl:async()=>{calls++;return Response.json({ok:true});}});
  await store.set('pump:cache:TEST:hot:https://example.test/price',{ok:true,received_ts:at,data:{ok:true}});
  await assert.rejects(broker.request({provider:'TEST',url:'https://example.test/price',cache_key:'hot',ttl_ms:60000}),{code:'BUDGET_AUTOMATIC_WINDOW_CLOSED'});assert.equal(calls,0);
  const operator=createRequestBroker({budget:budget(store,()=>at,false),store,clock:()=>at,fetch_impl:async()=>{calls++;return Response.json({ok:true});}});await operator.request({provider:'TEST',url:'https://example.test/price',cache_key:'operator'});assert.equal(calls,1);
});
test('an old waiting candidate eventually precedes active waves, and day history precedes the freshest core book',async()=>{
  const store=new MemoryStore(),b=budget(store,()=>T),trace=[],inputs=[];
  const active={...instrument,instrument_id:'ARTIFICIAL:ACTIVE',native_symbol:'ACTIVE-USDT',base:'ACTIVE'},waiting={...instrument,instrument_id:'ARTIFICIAL:WAITING',native_symbol:'WAITING-USDT',base:'WAITING'};
  await store.set('pump:active-instruments',[active.instrument_id]);await store.set('pump:candidate-queue',{[active.instrument_id]:{instrument_id:active.instrument_id,first_seen:T-5*60000,active_wave:true,next_check_ts:T},[waiting.instrument_id]:{instrument_id:waiting.instrument_id,first_seen:T-200*60000,active_wave:false,next_check_ts:T}});
  const sources={async getCatalog(){return {instruments:[active,waiting],unqualified:[],coverage:{status:'CHECKED'}};},async getOverview(){return {observations:[],coverage:{status:'CHECKED'}};},async getDayGrowth({instrument:i}){trace.push('day:'+i.base);return {facts:{growth_24h:{instrument_id:i.instrument_id,kind:'growth_24h',status:'NOT_CHECKED',reason:'ARTIFICIAL_ONLY'}}};},async getCore({instrument:i}){trace.push('core:'+i.base);return {facts:{},coverage:{status:'CHECKED'}};}};
  const runner=createPumpRunner({store,sources,budget:b,clock:()=>T,profile:START_PROFILE,delivery:{async drain(){return [];}},evaluateOutcome:()=>{throw Error('no outcome should be requested');},analyzePump:i=>{inputs.push(i);return {instrument:i.instrument,analysis_ts:i.analysis_ts,mode:i.mode,ready:false,wave_id:null,status:'WAITING',reasons:['ARTIFICIAL_ONLY']};}});
  const result=await runner.execute({mode:'AUTO',publish:false});assert.equal(result.checked.length,2);assert.equal(result.checked[0].analysis.instrument.instrument_id,waiting.instrument_id);assert.deepEqual(trace,['day:WAITING','core:WAITING','day:ACTIVE','core:ACTIVE']);assert.ok(inputs.every(i=>i.facts.growth_24h.instrument_id===i.instrument.instrument_id));
});
