import test from 'node:test';
import assert from 'node:assert/strict';
import {input as artificialInput,T,instrument} from '../analytics/fixtures.mjs';
import {analyzePump,evaluateOutcome} from '../../analytics/index.mjs';
import {createPumpSources} from '../../sources/index.mjs';
import {createUnifiedBudget,createRequestBroker} from '../../runtime/budget.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {createDelivery} from '../../runtime/delivery.mjs';
import {createPumpRunner} from '../../runtime/runner.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';

// Entirely artificial market values. This proves component wiring, not native
// provider meaning, quota, prices, production storage or Telegram delivery.
function assembled({dayGrowth=26.6,onFetch=null}={}){
  const raw=artificialInput(),store=new MemoryStore(),calls=[],sent=[];
  const policies={BINGX:{version:'ARTIFICIAL',evidence_ref:'ARTIFICIAL',allowed_hosts:['open-api.bingx.com'],allowed_paths:['/openApi/swap/*'],project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:100}};
  const budget=createUnifiedBudget({store,run_id:'ARTIFICIAL_RUN',mode:'AUTO',clock:()=>T,policies,protected_reserves:{http_by_provider:{BINGX:0},delivery_http:0,outcomes_http:0},admission:{provider_policy_version:'ARTIFICIAL',expires_ts:T+100000}});
  const broker=createRequestBroker({store,budget,clock:()=>T,fetch_impl:async url=>{
    const kind=new URL(url).pathname.split('/').at(-1);calls.push(kind);if(onFetch)await onFetch({kind,store});let data;
    if(kind==='contracts')data=[{symbol:'TEST-USDT',asset:'TEST',currency:'USDT',contractId:'ARTIFICIAL_TEST',status:1}];
    else if(kind==='ticker')data=[{symbol:'TEST-USDT',lastPrice:'112',openPrice:String(112/(1+dayGrowth/100)),priceChangePercent:String(dayGrowth),closeTime:T,quoteVolume:'100000'}];
    else if(kind==='price')data=[{symbol:'TEST-USDT',price:'112',time:T}];
    else if(kind==='depth')data={T,bidsCoin:raw.facts.orderbook.value.bids,asksCoin:raw.facts.orderbook.value.asks};
    else if(kind==='klines')data=raw.facts.candles.value.map(r=>({time:r.open_ts,open:r.open,close:r.close,high:r.high,low:r.low,volume:r.volume_base}));
    else throw Error('Unexpected artificial route '+kind);
    return new Response(JSON.stringify({code:0,data}),{status:200,headers:{'content-type':'application/json'}});
  }});
  const entry={instrument,native_contract_id:'ARTIFICIAL_TEST',qualifications:{candles:{time:{semantics:'OPEN_TIME',evidence_ref:'ARTIFICIAL_ONLY'},volume:{unit:'BASE_ASSET',evidence_ref:'ARTIFICIAL_ONLY'}},orderbook:{fields:'COIN',unit:'BASE_ASSET',evidence_ref:'ARTIFICIAL_ONLY'},ticker_24h:{window:'ROLLING_24H',evidence_ref:'ARTIFICIAL_ONLY'}}};
  const sources=createPumpSources({broker,identityRegistry:[entry],clock:()=>T,profile:START_PROFILE});
  const delivery=createDelivery({store,clock:()=>T,recipient:'ARTIFICIAL_RECIPIENT',revalidate:async card=>({valid:Boolean(await store.get(card.analysis.source_input_key))}),send:async payload=>{sent.push(payload);return {ok:true,status:200,body:{ok:true,result:{message_id:123,chat:{id:'ARTIFICIAL_RECIPIENT'}}}};}});
  const runner=createPumpRunner({store,sources,analyzePump,evaluateOutcome,budget,delivery,profile:START_PROFILE,clock:()=>T});
  return {runner,store,calls,sent,budget};
}
test('artificial wire response reaches the real engine, immutable outbox and matched receipt',async()=>{
  const f=assembled();const result=await f.runner.execute({mode:'MANUAL',symbol:'TEST',request_id:'ARTIFICIAL_MANUAL'});
  assert.ok(result.manual_result.analysis,JSON.stringify(result));
  assert.equal(result.manual_result.analysis.ready,true,JSON.stringify(result.manual_result.analysis.reasons));
  assert.equal(result.manual_result.delivery.state,'SENT');assert.equal(f.sent.length,1);
  assert.match(f.sent[0].text,/ликвидац/i);assert.ok(!f.calls.includes('price'),'shared overview LAST reused');
  const saved=await f.store.get('pump:card:'+result.manual_result.delivery.card_id);assert.equal(saved.text,f.sent[0].text);assert.equal(saved.receipt.message_id,'123');
  assert.equal((await f.store.get('pump:outcomes-pending')).length,1);
  assert.deepEqual(await f.store.get('pump:active-instruments'),[],'manual request does not create automatic follow-up');
  assert.deepEqual(await f.store.get('pump:candidate-queue'),{});
});
test('automatic discovery and an overlapping manual check share data and one publication',async()=>{
  const f=assembled();await f.runner.enqueueManual('TEST',{request_id:'ARTIFICIAL_QUEUED'});
  const result=await f.runner.execute({mode:'AUTO',run_id:'ARTIFICIAL_AUTO'});
  assert.equal(result.manual.length,1);assert.equal(result.checked.length,0,'the just-completed manual check also satisfies this candidate turn');
  await f.runner.checkInstrument(instrument,{run_id:'ARTIFICIAL_AUTO',mode:'AUTO',publish:true});
  assert.equal(f.sent.length,1);
  assert.equal(f.calls.filter(x=>x==='ticker').length,1);assert.equal(f.calls.filter(x=>x==='klines').length,1);
});
test('a simultaneous executor cannot take a still-owned run lease',async()=>{
  const f=assembled();await f.store.set('pump:executor',{owner:'ARTIFICIAL_OTHER',expires_ts:T+10000});
  const result=await f.runner.execute({mode:'MANUAL',symbol:'TEST',request_id:'ARTIFICIAL_BUSY'});
  assert.equal(result.status,'QUEUED');assert.equal(f.calls.length,0);assert.equal(f.sent.length,0);
});
test('a manual idempotency key cannot be reused for a different coin',async()=>{const f=assembled();await f.runner.enqueueManual('TEST',{request_id:'ARTIFICIAL_SAME'});assert.equal((await f.runner.enqueueManual('OTHER',{request_id:'ARTIFICIAL_SAME'})).status,'REQUEST_ID_CONFLICT');assert.equal((await f.store.get('pump:manual:ARTIFICIAL_SAME')).symbol,'TEST');});

test('an abandoned manual job resumes under a newly acquired executor and leaves only its durable result',async()=>{const f=assembled();await f.runner.enqueueManual('TEST',{request_id:'RECOVERED'});await f.store.atomic('pump:manual:RECOVERED',job=>({state:{...job,status:'PROCESSING',executor_owner:'EXPIRED_OWNER',started_ts:T-200000},result:true}));await f.store.set('pump:executor',{owner:'EXPIRED_OWNER',expires_ts:T-1});const r=await f.runner.execute({mode:'AUTO'});assert.equal(r.manual[0].request_id,'RECOVERED');assert.equal(f.sent.length,1);assert.deepEqual(await f.store.get('pump:manual-queue'),[]);assert.equal((await f.runner.getManualResult('RECOVERED')).analysis.ready,true);assert.equal((await f.store.get('pump:manual:RECOVERED')).status,'COMPLETE');});
test('loss of executor ownership during source IO prevents publication and preserves the newer owner',async()=>{const f=assembled({onFetch:async({kind,store})=>{if(kind==='depth')await store.set('pump:executor',{owner:'NEW_OWNER',expires_ts:T+120000});}});await assert.rejects(f.runner.execute({mode:'MANUAL',symbol:'TEST',request_id:'LOST_OWNER'}),{code:'EXECUTOR_LEASE_EXPIRED'});assert.equal(f.sent.length,0);assert.equal((await f.store.get('pump:executor')).owner,'NEW_OWNER');});
