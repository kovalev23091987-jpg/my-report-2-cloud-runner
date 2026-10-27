import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MemoryStore} from '../../runtime/store.mjs';
import {createPumpRunner} from '../../runtime/runner.mjs';
import {createDelivery} from '../../runtime/delivery.mjs';
import {revalidatePumpCard} from '../../runtime/worker.mjs';
import {createRetainedCapsuleWriter} from '../../runtime/retained-capsules.mjs';
import {analyzePump,evaluateOutcome} from '../../analytics/index.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {selectOutcomeAnchor} from '../../analytics/anchors.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),lease=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
assert.equal(a.status,'ADMITTED_ONE_ARTIFICIAL_AFFECTED_CASE');assert.equal(a.max_cases,1);
assert.ok(Date.now()<a.expires_ts&&a.expires_ts<=a.own_lease.expires_ts&&lease.owner===a.own_lease.owner&&!lease.released);
for(const [p,h]of Object.entries(a.frozen_sources))assert.equal(digest(fs.readFileSync(p)),h,p);
const bytes=fs.readFileSync(a.private_originals);assert.equal(digest(bytes),a.private_originals_sha256);
const observed=JSON.parse(bytes).requested_analyses.find(row=>row.instrument_id==='BINGX:USDT_M:101418:AIN-USDT');
const original=structuredClone(observed.original),input=original.input,instrument=input.instrument;
assert.equal(original.analysis.ready,true);assert.equal(original.analysis.automatic_eligible,true);
assert.equal(observed.delivery_trace.reason,'MANDATORY_FACT_EXPIRED_BEFORE_PUBLICATION');
fs.writeFileSync(a.proof_path+'.attempt',JSON.stringify({started_ts:Date.now(),cases:1,authority_main:a.authority_main}),{flag:'wx',mode:0o600});
// One historical input, artificial latency/fresh recheck and fake Telegram ACK.
// Nothing here is an actual historical replay result, native IO or delivery.
let now=input.analysis_ts,engine_calls=0,forced_rechecks=0,feature_calls=0;
const events=[],sent=[],store=new MemoryStore(),clock=()=>now;
await store.set('pump:wave:'+instrument.instrument_id,input.previous_wave);
const realFeatures=createRetainedCapsuleWriter({store,implementation_sha256:'a'.repeat(64),evidence_class:'ARTIFICIAL'});
const features={...realFeatures,async remember(key){
  feature_calls++;events.push('FEATURES');
  if(feature_calls===1){assert.equal(sent.length,1,'expensive derived work follows publication');now+=7000;throw Object.assign(Error('ARTIFICIAL_POST_SEND_INTERRUPTION'),{code:'ARTIFICIAL_POST_SEND_INTERRUPTION'});}
  return realFeatures.remember(key);
}};
const sources={
  async getCatalog(){return {instruments:[],coverage:{status:'INCOMPLETE',reason:'ARTIFICIAL_RECOVERY_ONLY'}};},
  async getOverview(){return {observations:[{instrument,facts:{price:structuredClone(input.facts.price)}}]};},
  async getCore(args){
    if(args.force_refresh){forced_rechecks++;events.push('FRESH_PRICE_BOOK');now+=1000;const facts={};for(const key of ['price','orderbook']){facts[key]={...structuredClone(input.facts[key]),event_ts:now,received_ts:now,expires_ts:now+START_PROFILE.freshness_ms[key]};}return {facts};}
    return {facts:structuredClone(input.facts),coverage:{status:'ARTIFICIAL_FROM_FROZEN_ORIGINAL'}};
  },
  async getLiquidations(){return structuredClone(input.liquidations);},
  async getOptional(){return {facts:{},coverage:{status:'ARTIFICIAL_ALREADY_FROZEN'}};}
};
const budget={setMode(){},summary(){return {mode:'AUTO',total:0,lanes:{hot:0,statistics:0},limits:{http_per_run:164,manual_http_run_reserve:0,lanes:{hot:164,statistics:0}}};}};
const delivery=createDelivery({store,clock,recipient:'ARTIFICIAL',revalidate:card=>revalidatePumpCard({card,store,sources,clock}),send:async payload=>{events.push('FAKE_ACK');sent.push({...payload,at:now});return {ok:true,status:200,body:{ok:true,result:{message_id:876,chat:{id:'ARTIFICIAL'},text:payload.text}}};}});
const runner=createPumpRunner({store,sources,analyzePump:(...args)=>{engine_calls++;return analyzePump(...args);},evaluateOutcome,budget,delivery,clock,evidence_class:'ARTIFICIAL',run_purpose:input.run_purpose,retained_features:features});
const checked=await runner.checkInstrument(instrument,{run_id:input.run_id,mode:'AUTO',publish:true});
assert.equal(checked.analysis.ready,true);assert.equal(checked.analysis.automatic_eligible,true);
assert.equal(checked.delivery.state,'SENT');assert.equal(checked.bookkeeping_error,'ARTIFICIAL_POST_SEND_INTERRUPTION');
assert.equal(forced_rechecks,1);assert.ok(sent[0].at<input.facts.orderbook.expires_ts);
assert.ok(now>input.facts.orderbook.expires_ts,'postwork latency exceeds the remaining original book TTL');
assert.deepEqual(events,['FRESH_PRICE_BOOK','FAKE_ACK','FEATURES']);
const saved=await store.get(checked.analysis_key),cardKey='pump:card:'+checked.delivery.card_id;
assert.deepEqual(saved.input.facts,input.facts,'original clocks and values unchanged');
assert.equal(saved.analysis.analysis_ts,input.analysis_ts);assert.equal(saved.analysis.reference_price,original.analysis.reference_price);
assert.equal((await store.get(cardKey)).publication_registered,undefined);
const beforeRepair=await store.get('pump:journal:'+instrument.instrument_id+':'+checked.analysis.wave_id);
assert.equal(beforeRepair.analyses.length,1);assert.ok(beforeRepair.analyses[0].recorded_ts<=sent[0].at);
// Same outbox, next executor: journal repair reads the immutable original and
// cannot resend the durable SENT card or roll a newer wave/candidate back.
await store.set('pump:wave:'+instrument.instrument_id,{state:'ARTIFICIAL_NEWER_WAVE'});
await runner.execute({mode:'AUTO',run_id:'ARTIFICIAL_RECEIPT_RECOVERY',publish:true});
assert.equal(sent.length,1);assert.equal(forced_rechecks,1);assert.equal(engine_calls,2);
assert.deepEqual(await store.get('pump:wave:'+instrument.instrument_id),{state:'ARTIFICIAL_NEWER_WAVE'});
const card=await store.get(cardKey),journal=await store.get('pump:journal:'+instrument.instrument_id+':'+checked.analysis.wave_id);
assert.equal(card.state,'SENT');assert.equal(card.publication_registered,true);assert.equal(card.text,sent[0].text);
assert.equal(card.receipt.message_id,'876');assert.equal(card.receipt.text_hash,card.text_hash);
assert.equal(journal.analyses[0].origin.t0,input.analysis_ts);assert.equal(journal.analyses[0].origin.reference_price,original.analysis.reference_price);
assert.equal(journal.publications[0].state,'SENT');assert.equal(journal.publications[0].analysis_id,checked.analysis_key);
const anchor=selectOutcomeAnchor({...journal,as_of_ts:now});assert.equal(anchor.status,'ELIGIBLE');assert.equal(anchor.publication.state,'SENT');
assert.equal(journal.frozen_anchor.analysis_id,checked.analysis_key);assert.equal(journal.analyses[0].recorded_ts,beforeRepair.analyses[0].recorded_ts);
assert.equal(await store.get('pump:quarantine:pump:journal:'+instrument.instrument_id+':'+checked.analysis.wave_id),null);
assert.deepEqual((await store.get(checked.analysis_key)).input.facts,input.facts);
const result={schema:'PUMP_PUBLICATION_CRITICAL_PATH_AFFECTED_V1',status:'PASS_ARTIFICIAL_NOT_NATIVE_DELIVERY',authority_main:a.authority_main,
  cases:1,runner_engine_calls:engine_calls,publication_engine_calls:1,artificial_fresh_price_book_rechecks:1,fake_send_calls:1,
  sent_before_original_mandatory_expiry:true,post_send_interruption_preserves_returned_SENT:true,next_executor_recovers_same_original_journal:true,
  original_T0_reference_price_and_fact_clocks_preserved:true,lean_journal_recorded_before_publication:true,anchor_ELIGIBLE_and_frozen:true,no_quarantine:true,newer_wave_preserved:true,duplicate_send:false,
  strategy_profile_TTL_card_expiry_HTTP_caps_unchanged:true,market_HTTP:0,native_SQL:0,Telegram:0,completed_ts:Date.now()};
fs.writeFileSync(a.proof_path,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));
