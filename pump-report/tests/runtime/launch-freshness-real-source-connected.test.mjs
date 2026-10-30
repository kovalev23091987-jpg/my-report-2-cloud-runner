import test from 'node:test';
import assert from 'node:assert/strict';
import {input,T,instrument} from '../analytics/fixtures.mjs';
import {analyzePump,evaluateOutcome} from '../../analytics/index.mjs';
import {createPumpSources} from '../../sources/index.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {createUnifiedBudget,createRequestBroker} from '../../runtime/budget.mjs';
import {createPumpRunner} from '../../runtime/runner.mjs';
import {createDelivery} from '../../runtime/delivery.mjs';
import {revalidatePumpCard} from '../../runtime/worker.mjs';

test('F563 sources, real broker, AF engine and saved-card delivery remain connected when a supplemental response arrives after its shared deadline',async()=>{
  let now=T;const sample=input(),store=new MemoryStore(),calls=[],sent=[];
  const budget=createUnifiedBudget({store,run_id:'ARTIFICIAL_CONNECTED_LAUNCH',mode:'MANUAL',clock:()=>now,policies:{BINGX:{version:'ARTIFICIAL',evidence_ref:'ARTIFICIAL_ONLY',allowed_hosts:['open-api.bingx.com'],allowed_paths:['/openApi/swap/*'],project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10,per_second_cap:1}},protected_reserves:{http_by_provider:{BINGX:0},delivery_http:0,outcomes_http:0},admission:{provider_policy_version:'ARTIFICIAL',expires_ts:T+120000}});
  const broker=createRequestBroker({store,budget,clock:()=>now,sleep_impl:async ms=>{now+=ms;},fetch_impl:async url=>{
    const kind=new URL(url).pathname.split('/').at(-1);calls.push(kind);let data;
    if(kind==='ticker')data=[{symbol:'TEST-USDT',lastPrice:'112',closeTime:now,priceChangePercent:'24'}];
    else if(kind==='price')data=[{symbol:'TEST-USDT',price:'112',time:now}];
    else if(kind==='depth')data={T:now,bidsCoin:sample.facts.orderbook.value.bids,asksCoin:sample.facts.orderbook.value.asks};
    else if(kind==='klines')data=sample.facts.candles.value.map(r=>({time:r.open_ts,open:r.open,high:r.high,low:r.low,close:r.close,volume:r.volume_base}));
    else if(kind==='trades'){now+=7000;data=[];}
    else throw Error('UNEXPECTED_ARTIFICIAL_ROUTE:'+kind);
    return Response.json({code:0,data});
  }});
  const entry={instrument,native_contract_id:'ARTIFICIAL_TEST',qualifications:{candles:{time:{semantics:'OPEN_TIME',evidence_ref:'ARTIFICIAL_ONLY'},volume:{unit:'BASE_ASSET',evidence_ref:'ARTIFICIAL_ONLY'}},orderbook:{fields:'COIN',unit:'BASE_ASSET',evidence_ref:'ARTIFICIAL_ONLY'}}};
  const sources=createPumpSources({broker,identityRegistry:[entry],clock:()=>now});
  const delivery=createDelivery({store,clock:()=>now,recipient:'ARTIFICIAL',revalidate:card=>revalidatePumpCard({card,store,sources,clock:()=>now}),send:async payload=>{sent.push(payload);return {ok:true,status:200,body:{ok:true,result:{message_id:987,chat:{id:'ARTIFICIAL'}}}};}});
  const runner=createPumpRunner({store,sources,budget,delivery,analyzePump,evaluateOutcome,clock:()=>now,await_source_window:args=>broker.awaitProviderWindow(args)});
  const result=await runner.checkInstrument(instrument,{run_id:'ARTIFICIAL_CONNECTED_LAUNCH',mode:'MANUAL',publish:true});
  assert.equal(result.analysis.ready,true,JSON.stringify(result.analysis.reasons));assert.ok(result.analysis.plan.potential_pct.minimum>=10);
  assert.equal(result.analysis.activity.details.status,'OBSERVED_CLOSED_WINDOW_MEASUREMENTS');assert.equal(result.delivery.state,'SENT');assert.equal(sent.length,1);
  assert.deepEqual(calls,['ticker','klines','depth','trades','price','depth']);assert.equal(budget.summary().total,6);
  const original=await store.get(result.analysis_key);assert.equal(original.input.facts.trades.reason,'SOURCE_DEADLINE_EXPIRED');assert.equal(original.input.facts.orderbook.event_ts,T+2000);assert.equal(original.input.facts.orderbook.expires_ts,T+17000);
  const card=await store.get('pump:card:'+result.delivery.card_id);assert.equal(card.text,sent[0].text);assert.equal(card.receipt.message_id,'987');assert.equal(card.receipt.text_hash,card.text_hash);assert.ok(now<card.expires_ts);
});
