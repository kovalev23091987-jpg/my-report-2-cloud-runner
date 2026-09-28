import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyDeliveryCohort} from '../files/src/prospective-delivery-cohort.mjs';

const base={publication_id:'PUB1',wave_id:'W1',direction:'LONG'};
test('K42 analytical ENTRY without an exact delivery acknowledgement stays prospective',()=>{
 for(const row of [{}, {telegram_dispatch_id:'D1',telegram_message_id:'0',telegram_confirmed_ts:1000},{telegram_dispatch_id:'D1',telegram_message_id:'7'}])assert.equal(classifyDeliveryCohort({...base,...row}).cohort_type,'ANALYTICAL_PROSPECTIVE');
});
test('K43 exact positive Telegram ACK produces one confirmed wave outcome',()=>{
 const out=classifyDeliveryCohort({...base,telegram_dispatch_id:'D1',telegram_message_id:'7',telegram_confirmed_ts:1000,manual_delivery_ack_id:'M1',manual_confirmed_ts:1001});assert.equal(out.cohort_type,'TELEGRAM_CONFIRMED');assert.equal(out.delivery_channels.telegram_confirmed,true);assert.equal(out.delivery_channels.manual_confirmed,true);assert.equal(out.one_wave_one_outcome,true);assert.equal(out.outcome_wave_key,'W1|LONG|PUB1');
});
