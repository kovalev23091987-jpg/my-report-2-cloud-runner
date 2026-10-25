import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../runtime/store.mjs';
import {createUnifiedBudget,createRequestBroker,RESOURCE_LIMITS} from '../../runtime/budget.mjs';
import {candidatePriority,analysisQueueEvidence} from '../../runtime/candidate-priority.mjs';
import {createPumpRunner} from '../../runtime/runner.mjs';
const T=Date.parse('2026-10-25T10:00:00Z');
function setup({store=new MemoryStore(),time={now:T},fetch_impl}={}){
  const budget=createUnifiedBudget({store,run_id:crypto.randomUUID(),mode:'MANUAL',clock:()=>time.now,
    policies:{BINGX:{version:'CONTROLLED_RELIABILITY_ONLY',evidence_ref:'ARTIFICIAL_ONLY',project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:100,allowed_hosts:['example.test'],allowed_paths:['/quote']}},
    protected_reserves:{http_by_provider:{BINGX:0},delivery_http:0,outcomes_http:0},admission:{provider_policy_version:'CONTROLLED_RELIABILITY_ONLY',expires_ts:T+7200000}});
  return {store,time,budget,broker:createRequestBroker({store,budget,clock:()=>time.now,fetch_impl})};
}
const req=(symbol='A')=>({provider:'BINGX',url:'https://example.test/quote?symbol='+symbol,cache_key:symbol,ttl_ms:30000});
test('repeated temporary errors survive restart, suppress calls, and recover without cost refunds',async()=>{
  let calls=0;const time={now:T},store=new MemoryStore(),fetch_impl=async()=>{calls++;if(calls===1)return Response.json({error:'down'},{status:503});if(calls===2)throw Error('lost ACK');return Response.json({code:0});};
  let f=setup({store,time,fetch_impl});await f.broker.request(req());
  await assert.rejects(f.broker.request(req('B')),{code:'PROVIDER_BACKOFF'});assert.equal(calls,1);
  time.now+=60000;f=setup({store,time,fetch_impl});await assert.rejects(f.broker.request(req()));
  const failed=await store.get('pump:resources');assert.equal(failed.providers.BINGX.consecutive_temporary_failures,2);assert.equal(failed.providers.BINGX.backoff_until,time.now+120000);assert.equal(failed.days['2026-10-25'],2);assert.equal(Object.keys(failed.unknown).length,1);
  time.now+=119999;await assert.rejects(f.broker.request(req('B')),{code:'PROVIDER_BACKOFF'});assert.equal(calls,2);
  time.now++;await f.broker.request(req('B'));const recovered=await store.get('pump:resources');assert.equal(recovered.providers.BINGX.consecutive_temporary_failures,0);assert.equal(recovered.days['2026-10-25'],3);assert.equal(Object.keys(recovered.unknown).length,1);
});
test('Retry-After is retained even beyond the engineering temporary-backoff ceiling',async()=>{
  let calls=0;const f=setup({fetch_impl:async()=>{calls++;return Response.json({error:'down'},{status:503,headers:{'retry-after':'3600'}});}});
  await f.broker.request(req());assert.equal((await f.store.get('pump:resources')).providers.BINGX.backoff_until,T+3600000);
  await assert.rejects(f.broker.request(req('B')),{code:'PROVIDER_BACKOFF'});assert.equal(calls,1);
});
test('exact-route absence has a finite per-coin negative TTL and preserves original receipt clocks',async()=>{
  let calls=0;const time={now:T},store=new MemoryStore(),fetch_impl=async url=>{calls++;return new URL(url).searchParams.get('symbol')==='A'?Response.json({error:'not found'},{status:404}):Response.json({code:0});};
  let f=setup({store,time,fetch_impl});const absent=await f.broker.request(req());time.now+=1000;
  f=setup({store,time,fetch_impl});const same=await f.broker.request(req());assert.equal(same.negative_cache_hit,true);assert.equal(same.receipt_id,absent.receipt_id);assert.equal(same.received_ts,T);assert.match(same.negative_reason,/NOT_ASSET_CLASSIFICATION/);assert.equal(calls,1);
  await f.broker.request(req('B'));assert.equal(calls,2);
  time.now=T+3600000;await f.broker.request(req());assert.equal(calls,3);assert.equal((await store.get('pump:resources')).days['2026-10-25'],3);
});
test('HTTP-200 business errors are neither a positive cache entry nor guessed unsupported coins',async()=>{
  let calls=0;const f=setup({fetch_impl:async()=>{calls++;return Response.json({code:100003,msg:'clock error'});}});
  const a=await f.broker.request(req()),b=await f.broker.request(req());assert.equal(calls,2);assert.equal(a.semantic_status,'UNQUALIFIED_ERROR');assert.equal(b.cache_hit,false);assert.equal(await f.store.get('pump:negative-cache:BINGX:A:https://example.test/quote?symbol=A'),null);
  const generic=setup({fetch_impl:async()=>Response.json({success:false})});assert.equal((await generic.broker.request(req())).semantic_status,'UNQUALIFIED_ERROR');
});
test('candidate ordering uses fresh entry proximity and confirmed facts while waiting prevents starvation',()=>{
  const base={first_seen:T,last_checked_ts:T,movement_event_ts:T,confirmed_core_count:3,core_expires_ts:T+30000,price_expires_ts:T+30000};
  const near={...base,entry_distance_pct:0.1},far={...base,entry_distance_pct:20};assert.ok(candidatePriority(near,T).score>candidatePriority(far,T).score);
  assert.ok(candidatePriority(near,T).score>candidatePriority({...near,confirmed_core_count:0},T).score);
  assert.ok(candidatePriority(near,T).score>candidatePriority({...near,movement_event_ts:T-14400000},T).score);
  const old={first_seen:T-7200000,last_checked_ts:T-7200000};assert.ok(candidatePriority(old,T).score>candidatePriority(near,T).score,'an old waiting candidate eventually outranks all bounded preferences');
  assert.equal(candidatePriority({...near,price_expires_ts:T-1},T).entry_proximity,0);assert.equal(candidatePriority({...near,core_expires_ts:T-1},T).confirmed_data_fraction,0);
});
test('only a qualified ready plan supplies entry proximity; stale or refused plans cannot claim it',()=>{
  const fact={status:'USABLE',value:100,event_ts:T,received_ts:T,expires_ts:T+1000},input={analysis_ts:T,facts:{price:fact,candles:{...fact,value:[]},orderbook:{...fact,value:{}}}};
  const analysis={ready:true,instrument:{base:'TEST'},plan:{entry_zones:[{lower:99,upper:101}],potential_pct:{minimum:12,basis:'GROSS_ENTRY_TO_EXIT_NOT_EXECUTED_PROFIT'}},next_wave:{impulse:{end_ts:T-60000}}};
  assert.equal(analysisQueueEvidence(analysis,input).entry_distance_pct,0);assert.equal(analysisQueueEvidence({...analysis,ready:false},input).entry_distance_pct,null);
  assert.equal(analysisQueueEvidence({...analysis,plan:{...analysis.plan,potential_pct:{...analysis.plan.potential_pct,minimum:9}}},input).entry_distance_pct,null);
});
test('the actual automatic queue consumer applies priority to the next checked candidate',async()=>{
  const store=new MemoryStore(),ids=['FAR','NEAR'],instruments=ids.map(base=>({base,native_symbol:base+'-USDT',instrument_id:'BINGX:USDT_M:'+base,asset_id:'CRYPTO:'+base,venue:'BINGX',market_type:'PERPETUAL',quote:'USDT',settle:'USDT',classification_status:'VERIFIED_CRYPTO'}));
  const fact={status:'USABLE',kind:'price',value:100,event_ts:T,received_ts:T,expires_ts:T+30000};
  await store.set('pump:candidate-queue',Object.fromEntries(instruments.map((i,n)=>[i.instrument_id,{instrument_id:i.instrument_id,first_seen:T,last_checked_ts:T-300000,next_check_ts:T-1,movement_event_ts:T-60000,confirmed_core_count:3,core_expires_ts:T+30000,entry_zones:[{lower:n?99:80,upper:n?101:81}],entry_distance_pct:n?0:19,price_expires_ts:T+30000}])));
  const seen=[];let spent=0;const sources={getCatalog:async()=>({instruments,coverage:{status:'USABLE'}}),getOverview:async({instruments:selected})=>({observations:selected.map(instrument=>({instrument,facts:{price:fact}})),coverage:{status:'USABLE'}}),getCore:async({instrument})=>{seen.push(instrument.base);spent=164;return {facts:{price:fact},coverage:{status:'USABLE'}};}};
  const budget={setMode(){},summary:()=>({total:spent,lanes:{hot:spent,background:0,statistics:0},limits:RESOURCE_LIMITS,mode:'AUTO'})},delivery={drain:async()=>[]};
  const runner=createPumpRunner({store,sources,budget,delivery,clock:()=>T,analyzePump:()=>({ready:false,status:'WAITING',wave_state:null,reasons:[]}),evaluateOutcome:()=>({})});
  await runner.execute({mode:'AUTO',run_id:'ARTIFICIAL_QUEUE',publish:false});assert.deepEqual(seen,['NEAR']);assert.equal((await store.get('pump:candidate-queue'))[instruments[0].instrument_id].last_checked_ts,T-300000,'unserved candidate retains its waiting clock');
});
