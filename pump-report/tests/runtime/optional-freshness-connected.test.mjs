import test from 'node:test';
import assert from 'node:assert/strict';
import {input,T,instrument} from '../analytics/fixtures.mjs';
import {analyzePump,evaluateOutcome} from '../../analytics/index.mjs';
import {emptyMap} from '../../contracts/index.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {createDelivery} from '../../runtime/delivery.mjs';
import {createPumpRunner} from '../../runtime/runner.mjs';
import {revalidatePumpCard} from '../../runtime/worker.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';

// Artificial prices and clock only. Exercise the real runner, engine, immutable
// outbox and publication recheck; no provider, native SQL or Telegram IO.
test('one supplemental deadline prioritizes the map and leaves mandatory freshness for the same saved-card publication',async()=>{
  for(const mapFails of [false,true]){
    let now=T;const original=input(),store=new MemoryStore(),events=[],sent=[];
    const sources={
      async getOverview(){return {observations:[{instrument,facts:{price:structuredClone(original.facts.price)}}]};},
      async getCore(args){
        const facts=structuredClone(original.facts);
        if(args.force_refresh){events.push('RECHECK');now+=2000;for(const key of ['price','orderbook']){facts[key].event_ts=now;facts[key].received_ts=now;facts[key].expires_ts=now+START_PROFILE.freshness_ms[key];}return {facts:{price:facts.price,orderbook:facts.orderbook}};}
        return {facts,coverage:{status:'USABLE'}};
      },
      async getLiquidations(args){events.push('MAP');assert.equal(args.deadline_ts,T+7500);now=args.deadline_ts;if(mapFails)throw Object.assign(Error('ARTIFICIAL_TIMEOUT'),{code:'SOURCE_DEADLINE_EXPIRED'});return emptyMap('TIMEOUT','ARTIFICIAL_TIMEOUT');},
      async getOptional(args){events.push('OPTIONAL');assert.equal(args.deadline_ts,T+7500);assert.equal(now,args.deadline_ts);return {facts:{},coverage:{status:'NOT_CHECKED',reason:'SOURCE_DEADLINE_EXPIRED'}};}
    };
    const budget={setMode(){},summary(){throw Error('UNEXPECTED_WHOLE_RUN');}};
    const delivery=createDelivery({store,clock:()=>now,recipient:'ARTIFICIAL',revalidate:card=>revalidatePumpCard({card,store,sources,clock:()=>now}),send:async payload=>{sent.push(payload);return {ok:true,status:200,body:{ok:true,result:{message_id:876,chat:{id:'ARTIFICIAL'}}}};}});
    const runner=createPumpRunner({store,sources,analyzePump,evaluateOutcome,budget,delivery,clock:()=>now});
    const result=await runner.checkInstrument(instrument,{run_id:'ARTIFICIAL_OPTIONAL_BOUND_'+mapFails,mode:'MANUAL',publish:true});
    assert.equal(result.analysis.ready,true,JSON.stringify(result.analysis.reasons));assert.equal(result.delivery.state,'SENT');
    assert.deepEqual(events,['MAP','OPTIONAL','RECHECK']);assert.equal(sent.length,1);assert.ok(now<original.facts.orderbook.expires_ts);
    const saved=await store.get('pump:card:'+result.delivery.card_id);assert.equal(saved.text,sent[0].text);assert.equal(saved.receipt.text_hash,saved.text_hash);assert.equal(saved.receipt.message_id,'876');
    const recorded=await store.get(result.analysis_key);assert.equal(recorded.input.facts.orderbook.event_ts,T);assert.equal(recorded.input.facts.orderbook.expires_ts,T+15000,'original snapshot clocks were not extended');
  }
});
