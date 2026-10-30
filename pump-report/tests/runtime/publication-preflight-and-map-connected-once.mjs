import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MemoryStore} from '../../runtime/store.mjs';
import {createDelivery} from '../../runtime/delivery.mjs';
import {createPumpRunner} from '../../runtime/runner.mjs';
import {preparePumpPublication,revalidatePumpCard} from '../../runtime/worker.mjs';
import {sendSavedTelegram} from '../../runtime/telegram-send.mjs';
import {selectZones,assessPublicationMap} from '../../analytics/zones.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';

// The private original is read only by ROOT. No raw input is printed or copied
// into this test. Refresh responses and transport latency below are controlled,
// not claimed as an historical replay of the missing provider response.
const privateFile=process.argv[2];assert.ok(privateFile,'PRIVATE_ROOT_PACKET_REQUIRED');
const packet=JSON.parse(readFileSync(privateFile,'utf8')),original=packet.idol.first_original;
assert.equal(original.analysis.instrument.native_symbol,'IDOL-USDT');assert.equal(original.analysis.ready,true);
globalThis.fetch=async()=>{throw Error('UNEXPECTED_REAL_NETWORK');};
const sha=s=>createHash('sha256').update(s).digest('hex'),frozen=JSON.stringify(original);
const originalExpiry=Math.min(...['price','candles','orderbook'].map(k=>original.input.facts[k].expires_ts));
const observedFailure=originalExpiry+339;
function setup(){
  const store=new MemoryStore(),c={now:original.analysis.analysis_ts,source_calls:0,source_http:0,fetches:0,TG_reserved:0,TG_finalized:0};
  const clock=()=>c.now;
  const sources={getCore:async args=>{
    assert.equal(args.purpose,'DELIVERY');assert.equal(args.force_refresh,true);assert.deepEqual(args.only_facts,['price','orderbook']);
    c.source_calls++;c.source_http+=2;c.now=observedFailure;
    return {facts:Object.fromEntries(['price','orderbook'].map(k=>{const f=structuredClone(original.input.facts[k]);f.event_ts=c.now-100;f.received_ts=c.now;f.expires_ts=f.event_ts+START_PROFILE.freshness_ms[k];f.fact_id+=':CONTROLLED_REFRESH';f.evidence_ref+=':CONTROLLED_REFRESH';return [k,f];}))};
  }};
  const budget={reserve:async()=>{c.TG_reserved++;return {state:'RESERVED'};},finalize:async(r,m)=>{c.TG_finalized++;r.state=m.network_attempted===false?'CHARGED_NO_NETWORK':'CONFIRMED';}};
  const fetch_impl=async(url,args)=>{assert.ok(url.startsWith('https://api.telegram.org/botCONTROLLED/'));c.fetches++;const b=JSON.parse(args.body);c.now+=500;return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:9001,chat:{id:b.chat_id},text:b.text,date:Math.floor(c.now/1000)}})};};
  const send=async({text,recipient,card_id})=>sendSavedTelegram({budget,fetch_impl,token:'CONTROLLED',recipient,text,card:await store.get('pump:card:'+card_id),clock});
  return {store,c,clock,sources,budget,send};
}
async function save(ctx,a,input){const key='pump:analysis:'+sha(JSON.stringify(a));await ctx.store.set(key,{analysis:a,input,saved_ts:ctx.clock(),implementation_sha256:original.implementation_sha256,evidence_class:'CONTROLLED_OFFLINE_FIXTURE'});return key;}
const baseline=setup(),oldA=structuredClone(original.analysis),oldI=structuredClone(original.input),oldKey=await save(baseline,oldA,oldI);
const oldDelivery=createDelivery({store:baseline.store,send:baseline.send,recipient:'CONTROLLED_RECIPIENT',clock:baseline.clock,revalidate:card=>revalidatePumpCard({card,store:baseline.store,sources:baseline.sources,clock:baseline.clock})});
const queuedOld=await oldDelivery.enqueue({...oldA,source_input_key:oldKey},{mode:'AUTO',expires_ts:originalExpiry});
const oldResult=await oldDelivery.dispatch(queuedOld.card_id);assert.equal(oldResult.state,'STALE');assert.equal(baseline.c.now-originalExpiry,339);assert.equal(baseline.c.fetches,0);assert.equal(baseline.c.TG_reserved,0);
const after=setup(),delivery=createDelivery({store:after.store,send:after.send,recipient:'CONTROLLED_RECIPIENT',clock:after.clock,
  prepare:args=>preparePumpPublication({...args,sources:after.sources,clock:after.clock}),
  revalidate:(card,ctx)=>revalidatePumpCard({card,store:after.store,sources:after.sources,clock:after.clock,prepared_input:ctx?.prepared_input??null})});
let prepared=null;
const realPrepare=delivery.preparePublication;
delivery.preparePublication=async args=>{const p=await realPrepare(args);if(p?.accepted){prepared=p;after.c.now+=2000;}return p;};
const f=original.input.facts,core=after.sources.getCore;
const runnerSources={getOverview:async()=>({observations:[{facts:{price:f.price,ticker_24h:f.ticker_24h}}]}),
  getDayGrowth:async()=>({facts:{growth_24h:f.growth_24h,price_structure:f.price_structure}}),
  getCore:async args=>args.purpose==='DELIVERY'?core(args):({facts:{price:f.price,candles:f.candles,orderbook:f.orderbook},coverage:{status:'CONTROLLED'}}),
  getLiquidations:async()=>structuredClone(original.input.liquidations),
  getOptional:async()=>({facts:{trades:f.trades,funding:f.funding,open_interest:f.open_interest}})};
let retained=0;
const runner=createPumpRunner({store:after.store,sources:runnerSources,delivery,clock:after.clock,
  analyzePump:(await import('../../analytics/index.mjs')).analyzePump,evaluateOutcome:()=>{throw Error('NO_OUTCOME_COLLECTION');},
  budget:{setMode:()=>{},admitCandidate:async()=>({allowed:true})},profile:START_PROFILE,evidence_class:'OBSERVED',run_purpose:'PRODUCTION',
  retained_features:{implementation_sha256:original.implementation_sha256,evidence_class:'CONTROLLED_OFFLINE_FIXTURE',remember:async()=>{retained++;}}});
if(original.input.previous_wave)await after.store.set('pump:wave:'+original.analysis.instrument.instrument_id,original.input.previous_wave);
const answer=await runner.checkInstrument(original.analysis.instrument,{run_id:original.analysis.run_id,mode:'AUTO',publish:true});
assert.equal(prepared.accepted,true);assert.equal(prepared.analysis.ready,true);assert.equal(prepared.input.publication_preflight.purpose,'DELIVERY');
assert.ok(prepared.input.facts.orderbook.expires_ts>originalExpiry);assert.equal(prepared.analysis.next_wave.created_ts,original.analysis.next_wave.created_ts);
const key=answer.analysis_key,sent=answer.delivery,expires=Math.min(...['price','candles','orderbook'].map(k=>prepared.input.facts[k].expires_ts));
assert.equal(sent.state,'SENT');assert.equal(sent.receipt_readback,true);assert.equal(answer.bookkeeping_error,undefined);assert.equal(retained,1);
assert.equal(after.c.fetches,1);assert.equal(after.c.TG_reserved,1);assert.equal(after.c.TG_finalized,1);assert.equal(after.c.source_calls,1);assert.equal(after.c.source_http,baseline.c.source_http);
const card=await after.store.get('pump:card:'+sent.card_id),stored=await after.store.get(key),{source_input_key,...savedAnalysis}=card.analysis;
assert.equal(source_input_key,key);assert.deepEqual(savedAnalysis,stored.analysis);assert.equal(card.text,stored.analysis.card_text);assert.equal(card.text_hash,sha(card.text));assert.ok(card.receipt.http_started_ts<expires);assert.ok(card.created_ts>=stored.saved_ts);
assert.equal(card.receipt.liquidation_freshness.map_mode,'WITHOUT_MAP');assert.equal(card.receipt.liquidation_freshness.fresh_at_ACK,true);
await assert.rejects(()=>delivery.dispatch(sent.card_id,{preparation_token:prepared.preparation_token}),/PUBLICATION_PREPARATION_TOKEN_NOT_OWNED/);
assert.equal((await delivery.preparePublication({analysis:prepared.analysis,input:prepared.input})).skipped,true);assert.equal(after.c.source_calls,1);
const duplicate=await delivery.enqueue({...prepared.analysis,source_input_key:key},{mode:'AUTO',expires_ts:expires});assert.equal(duplicate.duplicate,true);assert.equal((await delivery.dispatch(duplicate.card_id)).state,'SENT');assert.equal(after.c.fetches,1);
assert.equal(JSON.stringify(original),frozen);

// A still-valid map at the first check expires while the durable Telegram
// reservation awaits. The final guard must retain the charge and do zero HTTP.
const t=1800000000000,instrument={instrument_id:'BINGX:USDT_M:CONTROLLED',asset_id:'ASSET:CONTROLLED',venue:'BINGX',market_type:'PERPETUAL',quote:'USDT',settle:'USDT'};
const common={asset_id:instrument.asset_id,basis_type:'EXTERNAL_MODEL',source:'CONTROLLED',primary_provider:'CONTROLLED',venue:'BINGX',market_id:'CONTROLLED-USDT',evidence_ref:'CONTROLLED',price_currency:'USDT',model_id:'CONTROLLED',model_version:'1',usable:true,event_ts:t-1000,received_ts:t-500,expires_ts:t+25000,native_expires_ts:t+299000};
const map=selectZones({status:'USABLE',zones:[{...common,zone_id:'UP',lower:110,upper:112},{...common,zone_id:'DOWN',lower:88,upper:90}]},instrument,100,1,t,START_PROFILE);
const mapped={instrument,reference_price:100,liquidations:map};assert.equal(assessPublicationMap(mapped,{at:t,profile:START_PROFILE}).valid,true);
let now=t,http=0,charged=0,finalized=null;
const lateBudget={reserve:async()=>{charged++;now+=26000;return {state:'RESERVED'};},finalize:async(r,m)=>{finalized=m;r.state='CHARGED_NO_NETWORK';}};
await assert.rejects(()=>sendSavedTelegram({budget:lateBudget,fetch_impl:async()=>{http++;throw Error('SHOULD_NOT_FETCH');},token:'CONTROLLED',recipient:'CONTROLLED',text:'CONTROLLED_MAP',card:{mode:'MANUAL',card_id:'CONTROLLED',expires_ts:t+90000,analysis:mapped},clock:()=>now}),/DISPLAYED_MAP_EXPIRED_BEFORE_TELEGRAM_HTTP/);
assert.equal(http,0);assert.equal(charged,1);assert.equal(finalized.network_attempted,false);
let transportCalls=0;
const ackBudget={reserve:async()=>({state:'RESERVED'}),finalize:async(r)=>{r.state='CONFIRMED';}};now=t;
const ack=await sendSavedTelegram({budget:ackBudget,fetch_impl:async()=>{transportCalls++;now=t+26000;return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:9002}})};},token:'CONTROLLED',recipient:'CONTROLLED',text:'CONTROLLED_MAP',card:{mode:'MANUAL',card_id:'CONTROLLED_ACK',expires_ts:t+90000,analysis:mapped},clock:()=>now});
assert.equal(transportCalls,1);assert.equal(ack.liquidation_freshness.fresh_at_HTTP_start,true);assert.equal(ack.liquidation_freshness.fresh_at_ACK,false);
console.log(JSON.stringify({schema:'ROOT_PUBLICATION_PREFLIGHT_MAP_COUPLED_CASE_V1',status:'PASS',affected_cases:1,baseline_IDOL_STALE_339ms_reproduced:true,new_original_SENT:true,same_source_HTTP_attempts:after.c.source_http,old_source_clocks_unchanged:true,preparation_one_use_and_original_bound:true,duplicate_SENT_HTTP:0,known_SENT_preparation_HTTP:0,no_map_allowed:true,map_expires_during_reserve_HTTP:0,charged_reserve_not_refunded:true,late_ACK_not_mislabeled_fresh:true,actual_provider_HTTP:0,native_SQL:0,actual_Telegram:0,controlled_transport_calls:after.c.fetches+transportCalls}));
