import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerInstrumentExcluded,ownerPublicationRefusal} from '../../contracts/index.mjs';
import {ACCEPTANCE_240,recordPurpose} from '../../contracts/run-purpose.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {createDelivery,textHash} from '../../runtime/delivery.mjs';
import {createPumpRunner} from '../../runtime/runner.mjs';
import {createOutcomeJournal} from '../../runtime/outcome-journal.mjs';
import {createPumpWorker} from '../../runtime/worker.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';

const now=Date.parse('2026-10-25T15:08:00Z');
const plan=minimum=>({potential_pct:{minimum,maximum:20,basis:'GROSS_ENTRY_TO_EXIT_NOT_EXECUTED_PROFIT'}});
const analysis={ready:true,automatic_eligible:true,instrument:{instrument_id:'BINGX:USDT_M:SOL-USDT',native_symbol:'SOL-USDT',base:'SOL'},wave_id:'ARTIFICIAL_OWNER_WAVE',plan:plan(10),card_text:'Искусственная карточка SOL. Карта ликвидаций недоступна.'};
function sender(){const store=new MemoryStore();let sends=0,rechecks=0;const delivery=createDelivery({store,clock:()=>now,recipient:'123',revalidate:async()=>{rechecks++;return {valid:true};},send:async()=>{sends++;return {ok:true,status:200,body:{ok:true,result:{message_id:321,chat:{id:123}}}};}});return {store,delivery,get sends(){return sends;},get rechecks(){return rechecks;}};}

test('BTC and ETH aliases are excluded; unrelated assets retain their crypto identity',()=>{
  for(const x of ['BTC','eth','BTC-USDT','ETH/USDT',{asset_id:'BINGX_UNDERLYING:BTC'},{instrument_id:'BINGX:USDT_M:101:ETH-USDT'}])assert.equal(ownerInstrumentExcluded(x),true);
  for(const x of ['SOL','WBTC','BTCB','BETH',{base:'SOL',classification_status:'VERIFIED_CRYPTO'}])assert.equal(ownerInstrumentExcluded(x),false);
});
test('both delivery modes reject excluded assets, unknown and partly below10pct plans before saving or sending',async()=>{
  for(const mode of ['MANUAL','AUTO'])for(const a of [{...analysis,instrument:{base:'BTC'}},{...analysis,instrument:{base:'ETH'}},{...analysis,plan:plan(9.99)},{...analysis,plan:plan(null)},{...analysis,plan:{potential_pct:{minimum:10,maximum:20}}}]){
    const f=sender();await assert.rejects(f.delivery.enqueue(a,{mode,expires_ts:now+10000}),{code:ownerPublicationRefusal(a)});assert.equal(f.sends,0);assert.equal(f.store.rows.size,0);
  }
  const f=sender(),queued=await f.delivery.enqueue(analysis,{mode:'MANUAL',expires_ts:now+10000});assert.equal((await f.delivery.dispatch(queued.card_id)).state,'SENT');assert.equal(f.sends,1);
});
test('a card queued by an older worker is suppressed before recheck and Telegram without changing saved text or hash',async()=>{
  for(const old of [{...analysis,instrument:{base:'BTC'}},{...analysis,instrument:{base:'ETH'}},{...analysis,plan:plan(9.99)}]){
    const f=sender(),card={card_id:'ARTIFICIAL_LEGACY_CARD',state:'READY',mode:'MANUAL',analysis:old,text:old.card_text,text_hash:await textHash(old.card_text),recipient:'123',expires_ts:now+10000};
    await f.store.set('pump:card:'+card.card_id,card);const r=await f.delivery.dispatch(card.card_id),saved=await f.store.get('pump:card:'+card.card_id);
    assert.equal(r.state,'SUPPRESSED');assert.equal(saved.reason,ownerPublicationRefusal(old));assert.equal(saved.text,card.text);assert.equal(saved.text_hash,card.text_hash);assert.equal(f.rechecks,0);assert.equal(f.sends,0);
  }
});
test('manual commands and direct runner checks for BTC/ETH stop before provider IO or queue creation',async()=>{
  let calls=0;const store=new MemoryStore(),runner=createPumpRunner({store,sources:{getCore(){calls++;throw Error('Forbidden provider IO');}},analyzePump(){throw Error('Forbidden analysis');},evaluateOutcome(){},budget:{},delivery:{}});
  for(const symbol of ['BTC','ETH']){
    assert.equal((await runner.execute({mode:'MANUAL',symbol,request_id:symbol})).status,'OWNER_ASSET_DELIVERY_EXCLUDED');
    assert.equal((await runner.checkInstrument({base:symbol},{mode:'AUTO',run_id:symbol})).status,'OWNER_ASSET_DELIVERY_EXCLUDED');
  }
  assert.equal(calls,0);assert.equal(store.rows.size,0);
});
test('authenticated excluded manual endpoints stop before any native SQL reservation',async()=>{
  let sql=0;const worker=createPumpWorker(),env={PUMP_CONTROL_KEY:'ARTIFICIAL',DATA_DB:{prepare(){sql++;throw Error('Forbidden SQL');}}};
  for(const symbol of ['BTC','ETH']){const r=await worker.fetch(new Request('https://artificial/pump/manual',{method:'POST',headers:{'x-pump-control-key':'ARTIFICIAL'},body:JSON.stringify({symbol})}),env,{});assert.equal(r.status,400);assert.equal((await r.json()).status,'OWNER_ASSET_DELIVERY_EXCLUDED');}
  assert.equal(sql,0);
});
test('production materialization excludes acceptance240, future tests and unclassified rows while retaining immutable raw originals and old aggregate',async()=>{
  const store=new MemoryStore(),legacy={historical_counter:1};await store.set('pump:materialized-summary:v1',legacy);
  const base={instrument_id:'ARTIFICIAL:SOL',asset_id:'ARTIFICIAL:SOL',wave_id:'wave-production',signal_id:'signal-production',t0:now-1000,reference_price:100,rules_version:'ARTIFICIAL',profile_version:'ARTIFICIAL',mode:'MANUAL',map_mode:'NO_MAP',evidence_class:'OBSERVED',run_purpose:'PRODUCTION',ready:true};
  const origins=[{...base,...Object.fromEntries(['instrument_id','wave_id','t0'].map(k=>[k,ACCEPTANCE_240[k]]))},base,{...base,wave_id:'test',run_purpose:'ACCEPTANCE_TEST'},{...base,wave_id:'unknown',run_purpose:'UNCLASSIFIED'},{...base,wave_id:'fixture',evidence_class:'ARTIFICIAL'}],originals=[];
  for(const origin of origins){const payload={origin,publication:{state:'SENT',message_id:'240',receipt_ref:'ARTIFICIAL'},outcome:null},key='pump:summary-record:'+await textHash(JSON.stringify(payload)),row={record_id:key,recorded_ts:now,...payload};await store.set(key,row);originals.push([key,JSON.stringify(row)]);}
  await store.set('pump:summary-record-index',originals.map(([k])=>k));const journal=createOutcomeJournal({store,profile:START_PROFILE,clock:()=>now});
  for(let n=0;n<5;n++)await journal.catchUp({max_records:1,maturity_limit:0});
  const view=await journal.summary();assert.equal(view.run_purpose,'PRODUCTION');assert.equal(view.independent_waves,1);assert.equal(view.publication_counts.sent,1);assert.equal(view.source_cursor,5);assert.deepEqual(view.excluded_records_by_purpose,{ACCEPTANCE_TEST:2,UNCLASSIFIED:1,NON_OBSERVED:1});
  assert.equal(recordPurpose({origin:origins[0]}),'ACCEPTANCE_TEST');assert.equal((await journal.summary()).independent_waves,1,'replay does not duplicate the cohort');
  assert.deepEqual(await store.get('pump:materialized-summary:v1'),legacy);for(const [key,bytes]of originals)assert.equal(JSON.stringify(await store.get(key)),bytes);
});
test('historical acceptance240 is retained but never starts another BTC outcome collection',async()=>{
  const store=new MemoryStore(),key='ARTIFICIAL_PENDING240',signal={signal_id:key,instrument:{base:'BTC'},deadline_ts:now-1,origin:{instrument_id:ACCEPTANCE_240.instrument_id,wave_id:ACCEPTANCE_240.wave_id,t0:ACCEPTANCE_240.t0}};
  await store.set(key,signal);await store.set('pump:outcomes-pending',[key]);let history=0;
  const runner=createPumpRunner({store,sources:{getCore(){},getOutcomeHistory(){history++;throw Error('Forbidden BTC collection');}},analyzePump(){},evaluateOutcome(){},budget:{setMode(){},summary(){return {total:0,lanes:{statistics:0},limits:{lanes:{statistics:12},http_per_run:164}};}},delivery:{},clock:()=>now});
  const results=await runner.checkOutcomes({run_id:'ARTIFICIAL_OWNER'});assert.equal(results[0].status,'SKIPPED_NON_PRODUCTION');assert.equal(history,0);assert.deepEqual(await store.get(key),signal);assert.deepEqual(await store.get('pump:outcomes-pending'),[key]);
});
