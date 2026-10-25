import test from 'node:test';
import assert from 'node:assert/strict';
import {input as fixture,T,MINUTE,instrument as template,zone} from './fixtures.mjs';
import {createFact,emptyMap} from '../../contracts/index.mjs';
import {analyzePump,evaluateOutcome} from '../../analytics/index.mjs';
import {createPumpRunner} from '../../runtime/runner.mjs';
import {createDelivery} from '../../runtime/delivery.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {createUnifiedBudget} from '../../runtime/budget.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';

const DAY=Date.parse('2026-10-25T09:00:00Z'); // Entirely artificial; 12:00 Moscow.
function harness({count=1,start=DAY,weak=[],map=[],unknown=false,dayGrowth=25}={}){
  let now=start;const store=new MemoryStore(),calls=[],sends=[],models=new Map();
  const instruments=Array.from({length:count},(_,i)=>({...template,instrument_id:'ARTIFICIAL:E:I'+i,asset_id:'ARTIFICIAL:E:A'+i,native_symbol:'COIN'+i+'-USDT',base:'COIN'+i}));
  function reset(at=now){for(const [i,instrument] of instruments.entries()){
    const scale=weak.includes(i)?0.4:1,raw=fixture(),price=v=>100+(v-100)*scale;
    const rows=raw.facts.candles.value.map(r=>({...r,open_ts:r.open_ts+at-T,close_ts:r.close_ts+at-T,open:price(r.open),high:price(r.high),low:price(r.low),close:price(r.close)}));
    models.set(instrument.instrument_id,{rows,price:rows.at(-1).close,dayGrowth:weak.includes(i)?5:dayGrowth});}}
  reset();
  const fact=(ins,kind,value,unit,event_ts=now)=>createFact({fact_id:'ARTIFICIAL:E:'+ins.instrument_id+':'+kind+':'+now,instrument_id:ins.instrument_id,kind,value,unit,event_ts,received_ts:now,
    expires_ts:now+(kind==='orderbook'?15000:kind==='price'||kind==='ticker_24h'?30000:90000),source:'ARTIFICIAL_E_FIXTURE',primary_provider:'ARTIFICIAL_E_FIXTURE',venue:'BINGX',status:'USABLE',origin:'OBSERVED',evidence_ref:'ARTIFICIAL_NOT_NATIVE'});
  const sources={
    async getCatalog(){calls.push({kind:'catalog',at:now});return {instruments,unqualified:[],coverage:{status:'COMPLETE',evidence:'ARTIFICIAL'}};},
    async getOverview({instruments:requested}){calls.push({kind:'overview',at:now});return {coverage:{status:'COMPLETE'},observations:requested.map(ins=>{const m=models.get(ins.instrument_id);return {instrument:ins,reported_change_pct:m.dayGrowth,facts:{price:fact(ins,'price',m.price,'USDT_PER_BASE'),ticker_24h:fact(ins,'ticker_24h',{open:m.price/(1+m.dayGrowth/100),last:m.price},'USDT_ROLLING_24H')}};})};},
    async getCore({instrument:ins}){calls.push({kind:'core',instrument:ins.instrument_id,at:now});const m=models.get(ins.instrument_id);return {facts:{price:fact(ins,'price',m.price,'USDT_PER_BASE'),
      candles:fact(ins,'candles',structuredClone(m.rows),'OHLC_USDT_VOLUME_BASE',m.rows.at(-1).close_ts),orderbook:fact(ins,'orderbook',{asks:[[m.price+0.1,1000],[m.price+0.2,1000]],bids:[[m.price-0.1,1000],[m.price-0.2,1000]]},'USDT_PRICE_BASE_QUANTITY')},coverage:{status:'COMPLETE',facts:{}}};},
    async getOptional(){calls.push({kind:'optional',at:now});return {facts:{}};},
    async getLiquidations({instrument:ins}){calls.push({kind:'map',at:now});const i=instruments.indexOf(ins);return map.includes(i)?{status:'PARTIAL',zones:[zone('ARTIFICIAL_E_MAP',125,126,{asset_id:ins.asset_id,event_ts:now,received_ts:now,expires_ts:now+120000})],coverage:{scope:'ARTIFICIAL'}}:emptyMap('NOT_CHECKED_BUDGET','ARTIFICIAL_MAP_BUDGET_EXHAUSTED');},
    async getOutcomeHistory(){calls.push({kind:'outcome_history',at:now});return {facts:{candles:{value:[]}}};}
  };
  const budget=createUnifiedBudget({store,run_id:'ARTIFICIAL_E_BUDGET',mode:'AUTO',clock:()=>now,policies:{},protected_reserves:{http_by_provider:{},delivery_http:0,outcomes_http:0},admission:null});
  const delivery=createDelivery({store,recipient:'ARTIFICIAL_E_CHAT',clock:()=>now,revalidate:async card=>({valid:Boolean(await store.get(card.analysis.source_input_key))}),send:async payload=>{
    sends.push({...payload,at:now});if(unknown)throw Error('ARTIFICIAL_ACK_LOST');return {ok:true,status:200,body:{ok:true,result:{message_id:100+sends.length,chat:{id:'ARTIFICIAL_E_CHAT'}}}};}});
  const runner=createPumpRunner({store,sources,analyzePump,evaluateOutcome,budget,delivery,clock:()=>now});
  function advance(minutes,price=112){const previous=now;now+=minutes*MINUTE;for(const model of models.values()){
    for(let t=previous;t<now;t+=MINUTE){const open=model.rows.at(-1).close;model.rows.push({open_ts:t,close_ts:t+MINUTE,closed:true,open,high:Math.max(open,price)+0.1,low:Math.min(open,price)-0.1,close:price,volume_base:300,turnover_quote:null});}
    model.price=price;}}
  return {runner,delivery,store,sources,budget,instruments,models,calls,sends,clock:()=>now,setClock:t=>{now=t;},reset,advance};
}
const signalKey=a=>'pump:signal:'+a.instrument.instrument_id+':'+a.wave_id;
async function dueSignal(f){
  const key='pump:signal:ARTIFICIAL_E_DUE',t0=f.clock()-5*60*MINUTE;
  await f.store.set(key,{signal_id:key,instrument:f.instruments[0],wave_id:'ARTIFICIAL_E_DUE',t0,reference_price:100,rules_version:'ARTIFICIAL',mode:'AUTO',map_mode:'WITHOUT_MAP',deadline_ts:t0+4*60*MINUTE});
  await f.store.set('pump:outcomes-pending',[key]);
}

test('E01 real runner checks three ready candidates without a fixed-two ceiling',async()=>{
  const f=harness({count:3}),r=await f.runner.execute({mode:'AUTO',run_id:'E01'});assert.equal(r.checked.length,3);assert.equal(r.checked.filter(x=>x.analysis.ready).length,3);assert.equal(f.sends.length,3);
  assert.equal(new Set(r.checked.map(x=>x.analysis.instrument.instrument_id)).size,3);assert.equal(f.budget.summary().total,0,'sources are in-memory artificial facts, no provider attempt');
});
test('E02 manual below every automatic threshold uses the real core and can publish a qualified plan',async()=>{
  const f=harness({weak:[0]}),r=await f.runner.execute({mode:'MANUAL',symbol:'COIN0',request_id:'E02',run_id:'E02'}),a=r.manual_result.analysis;
  assert.equal(a.current_threshold_passed,false);assert.equal(a.automatic_eligible,false);assert.equal(a.ready,true,JSON.stringify(a.reasons));assert.equal(r.manual_result.delivery.state,'SENT');assert.equal(f.sends.length,1);
});
test('E03 retained wave survives a five-minute retreat below thresholds and preserves published original t0/P0',async()=>{
  const f=harness(),first=await f.runner.execute({mode:'AUTO',run_id:'E03_FIRST'}),a=first.checked[0].analysis,original=await f.store.get(signalKey(a));
  f.advance(5,105);f.models.get(f.instruments[0].instrument_id).dayGrowth=5;
  const second=await f.runner.execute({mode:'AUTO',run_id:'E03_SECOND'}),b=second.checked[0].analysis,saved=await f.store.get(signalKey(b));
  assert.equal(b.current_threshold_passed,false);assert.equal(b.automatic_eligible,true);assert.equal(b.ready,true,JSON.stringify(b.reasons));assert.equal(b.wave_id,a.wave_id);assert.equal(b.next_wave.expires_ts,a.next_wave.expires_ts);assert.equal(b.reference_price,105);
  assert.equal(saved.t0,original.t0);assert.equal(saved.reference_price,original.reference_price);assert.equal(saved.deadline_ts,original.deadline_ts);assert.equal(f.sends.length,1);
});
test('E04 no-map budget absence remains nonblocking through core, stored text, dispatch and receipt',async()=>{
  const f=harness(),r=await f.runner.execute({mode:'AUTO',run_id:'E04'}),a=r.checked[0].analysis,id=r.checked[0].delivery.card_id,card=await f.store.get('pump:card:'+id);
  assert.equal(a.ready,true);assert.equal(a.liquidations.map_mode,'WITHOUT_MAP');assert.equal(card.state,'SENT');assert.equal(card.text,f.sends[0].text);assert.equal(card.text_hash,f.sends[0].text_hash);assert.equal(card.receipt.message_id,'101');assert.match(card.text,/Карта ликвидаций недоступна/);
});
test('E05 AUTO and statistics make zero source calls outside the Moscow daytime window',async()=>{
  for(const time of ['2026-10-25T06:59:00Z','2026-10-25T17:00:00Z','2026-10-25T23:00:00Z']){
    const f=harness({start:Date.parse(time)});await dueSignal(f);const r=await f.runner.execute({mode:'AUTO',run_id:'E05'});assert.equal(r.status,'OUTSIDE_AUTOMATIC_WINDOW');assert.deepEqual(await f.runner.checkOutcomes({run_id:'E05_STATS'}),[]);assert.equal(f.calls.length,0);assert.equal(f.sends.length,0);
  }
});
test('E06 a manual night request may publish but cannot trigger automatic outcome collection',async()=>{
  const f=harness({start:Date.parse('2026-10-25T23:00:00Z')});await dueSignal(f);const r=await f.runner.execute({mode:'MANUAL',symbol:'COIN0',request_id:'E06',run_id:'E06'});
  assert.equal(r.manual_result.delivery.state,'SENT');assert.equal(f.sends.length,1);assert.equal(f.calls.filter(c=>c.kind==='outcome_history').length,0);assert.deepEqual(r.outcomes,[]);
});
test('E07 possible-send UNKNOWN is durable and never retried by the same or a later run',async()=>{
  const f=harness({unknown:true}),first=await f.runner.execute({mode:'AUTO',run_id:'E07_FIRST'}),id=first.checked[0].delivery.card_id;
  assert.equal(first.checked[0].delivery.state,'UNKNOWN');await f.delivery.dispatch(id);await f.runner.execute({mode:'AUTO',run_id:'E07_SECOND'});assert.equal(f.sends.length,1);assert.equal((await f.store.get('pump:card:'+id)).state,'UNKNOWN');
});
test('E08 stale evening card is not sent at night and morning analysis recalculates a new wave',async()=>{
  const evening=Date.parse('2026-10-25T16:59:00Z'),f=harness({start:evening}),r=await f.runner.checkInstrument(f.instruments[0],{run_id:'E08_EVENING',mode:'AUTO',publish:false}),a=r.analysis;
  const old=await f.delivery.enqueue({...a,source_input_key:r.analysis_key},{mode:'AUTO',expires_ts:evening+15000});
  f.setClock(Date.parse('2026-10-25T17:01:00Z'));assert.equal((await f.delivery.dispatch(old.card_id)).state,'STALE');assert.equal(f.sends.length,0);
  const morning=Date.parse('2026-10-26T07:00:00Z');f.setClock(morning);f.reset(morning);const result=await f.runner.execute({mode:'AUTO',run_id:'E08_MORNING'}),b=result.checked[0].analysis;
  assert.equal(b.ready,true);assert.equal(b.analysis_ts,morning);assert.notEqual(b.wave_id,a.wave_id);assert.notEqual(result.checked[0].delivery.card_id,old.card_id);assert.equal(f.sends.length,1);assert.equal((await f.store.get('pump:card:'+old.card_id)).state,'STALE');
});
test('E09 REQUIREMENT possible-send UNKNOWN must register the immutable original for separate outcome tracking',async()=>{
  const f=harness({unknown:true}),r=await f.runner.execute({mode:'AUTO',run_id:'E09'}),a=r.checked[0].analysis,signal=await f.store.get(signalKey(a));
  assert.ok(signal,'ROOT_DEFECT_1: UNKNOWN card has no original signal; possible-send waves must not disappear from statistics');assert.equal(signal.t0,a.analysis_ts);assert.equal(signal.reference_price,a.reference_price);assert.ok((await f.store.get('pump:outcomes-pending')).includes(signalKey(a)));
});
test('E10 REQUIREMENT a terminal never-sent wave must register first READY as a separate UNSENT original',async()=>{
  const f=harness(),first=await f.runner.execute({mode:'AUTO',run_id:'E10_FIRST',publish:false}),a=first.checked[0].analysis;assert.equal(a.ready,true);assert.equal(await f.store.get(signalKey(a)),null,'active never-sent wave is not prematurely counted');
  f.advance(241,112);const expired=await f.runner.execute({mode:'AUTO',run_id:'E10_EXPIRED',publish:false});assert.equal(expired.checked[0].analysis.wave_state,'EXPIRED');assert.ok((await f.store.get('pump:wave:'+a.instrument.instrument_id)).expires_ts<=f.clock());const signal=await f.store.get(signalKey(a));
  assert.ok(signal,'ROOT_DEFECT_2: terminal never-sent FIRST_READY original is absent');assert.equal(signal.t0,a.analysis_ts);assert.equal(signal.reference_price,a.reference_price);assert.equal(f.sends.length,0);
});
test('E11 SENT manual/auto and partial-map/no-map originals retain distinct modes and map states',async()=>{
  const f=harness({count:2,weak:[1],map:[1]}),auto=await f.runner.execute({mode:'AUTO',run_id:'E11_AUTO'});assert.equal(auto.checked.length,1);
  const manual=await f.runner.execute({mode:'MANUAL',symbol:'COIN1',request_id:'E11_MANUAL',run_id:'E11_MANUAL'});
  const a=await f.store.get(signalKey(auto.checked[0].analysis)),m=await f.store.get(signalKey(manual.manual_result.analysis));
  assert.equal(a.mode,'AUTO');assert.equal(a.map_mode,'WITHOUT_MAP');assert.equal(m.mode,'MANUAL');assert.equal(m.map_mode,'WITH_MAP');assert.equal(m.map_status,'PARTIAL');assert.equal((await f.store.get('pump:outcomes-pending')).length,2);
});
