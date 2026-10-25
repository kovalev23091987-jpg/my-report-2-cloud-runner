import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../runtime/store.mjs';
import {createUnifiedBudget,createRequestBroker} from '../../runtime/budget.mjs';
import {DISCOVERY_PLAN,futureDiscoveryHttp} from '../../runtime/discovery-reserve.mjs';
const start=Date.parse('2026-10-25T07:00:00Z');
test('future daylight scans retain their exact two-call slots before opening and stop at the exclusive close',()=>{
  assert.equal(futureDiscoveryHttp(start-1,DISCOVERY_PLAN),240);
  assert.equal(futureDiscoveryHttp(start,DISCOVERY_PLAN),238);
  assert.equal(futureDiscoveryHttp(start+300000,DISCOVERY_PLAN),236);
  assert.equal(futureDiscoveryHttp(Date.parse('2026-10-25T16:54:59Z'),DISCOVERY_PLAN),2);
  assert.equal(futureDiscoveryHttp(Date.parse('2026-10-25T16:55:00Z'),DISCOVERY_PLAN),0);
  assert.equal(futureDiscoveryHttp(Date.parse('2026-10-25T17:00:00Z'),DISCOVERY_PLAN),0);
});
function make(store,time,{mode='AUTO',month=27900}={}){return createUnifiedBudget({store,clock:()=>time.now,mode,run_id:crypto.randomUUID(),policies:{BINGX:{version:'ARTIFICIAL_DAY',evidence_ref:'ARTIFICIAL_ONLY',project_daily_cap:900,project_monthly_cap:month,per_minute_cap:100,allowed_hosts:['open-api.bingx.com'],allowed_paths:['/openApi/swap/*']}},protected_reserves:{http_by_provider:{BINGX:102,TELEGRAM:6},delivery_http:24,outcomes_http:24},admission:{provider_policy_version:'ARTIFICIAL_DAY',expires_ts:start+86400000,discovery:DISCOVERY_PLAN}});}
test('early deep bursts cannot consume the later120 light discovery scans',async()=>{
  const store=new MemoryStore(),time={now:start};let discovery=0,deep=0;
  for(let tick=0;tick<120;tick++){
    time.now=start+tick*300000+1;const b=make(store,time);
    for(const path of ['contracts','ticker']){const r=await b.reserve({provider:'BINGX',family:'USDT_M',purpose:'DISCOVERY',request_id:'D'+tick+path});await b.finalize(r);discovery++;}
    for(let n=0;n<100;n++)try{const r=await b.reserve({provider:'BINGX',family:'USDT_M',candidate_id:'ARTIFICIAL_CANDIDATE',request_id:'C'+tick+'-'+n});await b.finalize(r);deep++;}catch(e){assert.ok(['PROTECTED_DAY_RESERVE','RUN_MANUAL_RESERVE_PROTECTED','CANDIDATE_HTTP_EXHAUSTED','RUN_HTTP_EXHAUSTED'].includes(e.code),e.code);break;}
  }
  assert.equal(discovery,240);assert.ok(deep>0);const state=await store.get('pump:resources');assert.equal(state.days['2026-10-25'],discovery+deep);assert.ok(discovery+deep+156<=900);
});
test('a manual request and a month limit also retain capacity for future bulk scans without HTTP',async()=>{
  const store=new MemoryStore(),time={now:start};await store.set('pump:resources',{days:{'2026-10-25':614},providers:{BINGX:{days:{'2026-10-25':614},months:{'2026-10':614},recent:[]}},outstanding:{},unknown:{OLD_UNKNOWN:{cost:1}}});
  const b=make(store,time,{mode:'MANUAL'});await assert.rejects(b.reserve({provider:'BINGX',request_id:'DEEP_MANUAL'}),{code:'PROTECTED_DAY_RESERVE'});
  assert.equal((await store.get('pump:resources')).days['2026-10-25'],614);assert.ok((await store.get('pump:resources')).unknown.OLD_UNKNOWN);
  const another=new MemoryStore();await assert.rejects(make(another,time,{mode:'MANUAL',month:238}).reserve({provider:'BINGX',request_id:'MONTH'}),{code:'PROVIDER_MONTH_EXHAUSTED'});
});
test('discovery cannot disguise a per-symbol, foreign, or deep request as a bulk scan',async()=>{
  const store=new MemoryStore(),time={now:start},budget=make(store,time);let calls=0;
  const broker=createRequestBroker({store,budget,clock:()=>time.now,fetch_impl:async()=>{calls++;return Response.json({code:0});}});
  for(const url of ['https://open-api.bingx.com/openApi/swap/v2/quote/ticker?symbol=SOL-USDT','https://open-api.bingx.com/openApi/swap/v3/quote/klines'])await assert.rejects(broker.request({provider:'BINGX',family:'USDT_M',purpose:'DISCOVERY',url,cache_key:url}),{code:'INVALID_DISCOVERY_SCOPE'});
  await assert.rejects(budget.reserve({provider:'BINGX',family:'USDT_M',purpose:'DISCOVERY',candidate_id:'SOL',request_id:'DISGUISED'}),{code:'INVALID_DISCOVERY_SCOPE'});assert.equal(calls,0);assert.equal(budget.summary().total,0);
});
