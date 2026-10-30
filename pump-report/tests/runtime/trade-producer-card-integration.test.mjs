import test from 'node:test';
import assert from 'node:assert/strict';
import {createPumpSources} from '../../sources/index.mjs';
import {analyzePump,evaluateOutcome} from '../../analytics/index.mjs';
import {createPumpRunner} from '../../runtime/runner.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {createDelivery,textHash} from '../../runtime/delivery.mjs';
import {createOutcomeJournal} from '../../runtime/outcome-journal.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {input,T} from '../analytics/fixtures.mjs';

// New cross-package ABI qualification. Artificial core facts and broker reply;
// no market request, native storage or actual Telegram call/receipt is made.
test('recent quoteQty producer reaches real analytics, original card, receipt and bounded work with no BASE conversion',async()=>{
  const raw=input();for(const row of raw.facts.candles.value.slice(-5))row.volume_base=3000;
  const store=new MemoryStore(),calls=[],sent=[],entry={instrument:raw.instrument,native_contract_id:'CONTROLLED_TEST',qualifications:{}};
  const optional=createPumpSources({identityRegistry:[entry],clock:()=>T,profile:START_PROFILE,broker:{async request(r){calls.push(r);assert.match(r.url,/\/quote\/trades\?/);return {ok:true,status:200,received_ts:T,receipt_id:'CONTROLLED_QUOTE_REPLY',data:{code:0,data:[{id:'1',time:T-2000,price:'112',quoteQty:'1000',qty:'UNKNOWN_BASE',isBuyerMaker:false},{id:'2',time:T,price:'112',quoteQty:'2000',qty:'UNKNOWN_BASE',isBuyerMaker:true}]}};}}});
  const sources={getCore:async()=>({facts:raw.facts,coverage:{status:'USABLE'}}),getOverview:async()=>({observations:[{instrument:raw.instrument,facts:{price:raw.facts.price}}]}),getOptional:args=>optional.getOptional(args),getLiquidations:async()=>raw.liquidations};
  const delivery=createDelivery({store,clock:()=>T,recipient:'123',revalidate:async card=>({valid:Boolean(await store.get(card.analysis.source_input_key))}),send:async payload=>{sent.push(payload);return {ok:true,status:200,body:{ok:true,result:{message_id:654,chat:{id:123},date:Math.floor(T/1000)}}};}});
  const runner=createPumpRunner({store,sources,delivery,analyzePump,evaluateOutcome,clock:()=>T,budget:{setMode(){}},evidence_class:'ARTIFICIAL',run_purpose:'ACCEPTANCE_TEST'});
  const result=await runner.checkInstrument(raw.instrument,{run_id:'CONTROLLED_CROSS_PACKAGE',mode:'MANUAL',publish:true});
  assert.equal(calls.length,1);assert.equal(result.analysis.ready,true,JSON.stringify(result.analysis.reasons));assert.equal(result.analysis.trade_context.buy_usdt,1000);assert.equal(result.analysis.trade_context.sell_usdt,2000);assert.equal(result.analysis.trade_context.netflow_usdt,-1000);assert.equal(result.analysis.trade_context.base_quantity_qualified,false);assert.ok(result.analysis.plan.potential_pct.minimum>=10);
  assert.match(result.analysis.card_text,/покупки 1000, продажи 2000 USDT/);assert.doesNotMatch(result.analysis.card_text,/BTC|ETH|BASE|quantity_base|Размер: до|абсолютная единица/);assert.match(result.analysis.card_text,/Карта ликвидаций недоступна/);
  assert.equal(sent.length,1);assert.equal(result.delivery.state,'SENT');assert.equal(result.delivery.message_id,'654');const card=await store.get('pump:card:'+result.delivery.card_id);assert.equal(card.text,sent[0].text);assert.equal(await textHash(card.text),card.text_hash);assert.equal(card.receipt.text_hash,card.text_hash);assert.equal(card.publication_registered,true);assert.equal((await delivery.pending()).length,0);
  const saved=await store.get(result.analysis_key);assert.equal(saved.input.facts.trades.evidence_ref,'CONTROLLED_QUOTE_REPLY');assert.equal(saved.input.facts.trades.coverage.complete,false);assert.equal(saved.input.facts.trades.coverage.base_quantity_derived,false);assert.ok(saved.input.facts.trades.value.every(row=>!Object.hasOwn(row,'quantity_base')));
  const view=await createOutcomeJournal({store,clock:()=>T,profile:START_PROFILE}).summary();assert.equal(view.independent_waves,0);assert.equal(view.probability.value_pct,null);assert.equal(view.excluded_records_by_purpose.ACCEPTANCE_TEST,1);
});
