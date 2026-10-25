import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../runtime/store.mjs';
import {createUnifiedBudget} from '../../runtime/budget.mjs';
import {createDelivery} from '../../runtime/delivery.mjs';
import {sendSavedTelegram} from '../../runtime/telegram-send.mjs';
import {analyzePump} from '../../analytics/index.mjs';
import {input,T} from '../analytics/fixtures.mjs';

test('Telegram CAS latency cannot send an expired card; timely HTTP keeps its matched late ACK and text mismatch remains UNKNOWN',async()=>{
  const run=async({cas_delay,ack_delay,mismatch=false})=>{
    let now=T,calls=0;const store=new MemoryStore();
    const real=createUnifiedBudget({store,run_id:'ARTIFICIAL_HTTP_START',mode:'MANUAL',clock:()=>now,policies:{TELEGRAM:{version:'ARTIFICIAL',evidence_ref:'ARTIFICIAL_ONLY',project_daily_cap:27,project_monthly_cap:837,per_minute_cap:1}},protected_reserves:{http_by_provider:{TELEGRAM:0},delivery_http:0,outcomes_http:0},admission:{provider_policy_version:'ARTIFICIAL',expires_ts:T+100000}});
    const budget={...real,reserve:async args=>{const r=await real.reserve(args);now+=cas_delay;return r;}};
    const delivery=createDelivery({store,recipient:'ARTIFICIAL',clock:()=>now,revalidate:async()=>({valid:true}),send:async({text,recipient,card_id})=>sendSavedTelegram({budget,token:'ARTIFICIAL_TOKEN',recipient,text,card:await store.get('pump:card:'+card_id),clock:()=>now,fetch_impl:async()=>{calls++;now+=ack_delay;return Response.json({ok:true,result:{message_id:123,chat:{id:'ARTIFICIAL'},text:mismatch==='NULL'?null:mismatch?'ARTIFICIAL_MISMATCH':text}});}})});
    const card=await delivery.enqueue(analyzePump(input()),{mode:'MANUAL',expires_ts:T+5});
    const result=await delivery.dispatch(card.card_id),saved=await store.get('pump:card:'+card.card_id);
    return {result,saved,calls,budget:real.summary()};
  };
  const expired=await run({cas_delay:10,ack_delay:0});assert.equal(expired.calls,0);assert.equal(expired.result.state,'ERROR');assert.equal(expired.budget.total,1);assert.equal(expired.budget.unknown,0);assert.equal(expired.budget.receipts[0].network_attempted,false);assert.equal(expired.saved.receipt,undefined);
  const timely=await run({cas_delay:1,ack_delay:10});assert.equal(timely.calls,1);assert.equal(timely.result.state,'SENT');assert.ok(timely.saved.receipt.http_started_ts<timely.saved.expires_ts);assert.ok(timely.saved.receipt.http_ack_received_ts>timely.saved.expires_ts);assert.equal(timely.saved.receipt.text_hash,timely.saved.text_hash);assert.equal(timely.budget.receipts[0].network_attempted,true);
  const mismatch=await run({cas_delay:1,ack_delay:1,mismatch:true});assert.equal(mismatch.calls,1);assert.equal(mismatch.result.state,'UNKNOWN');assert.equal(mismatch.saved.message_id,null);
  const nullEcho=await run({cas_delay:1,ack_delay:1,mismatch:'NULL'});assert.equal(nullEcho.calls,1);assert.equal(nullEcho.result.state,'UNKNOWN');assert.equal(nullEcho.saved.message_id,null);
});
