import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPumpSources} from '../../sources/index.mjs';
import {START_PROFILE as P} from '../../profile/start-v1.mjs';

test('actual core request125 closes the oldest searched impulse baseline; short121/open-bar responses remain incomplete', async () => {
  const registry=JSON.parse(fs.readFileSync(new URL('../../sources/registry-curated13-native-relative-v1.json',import.meta.url),'utf8'));
  const entry=registry.instruments.find(e=>e.instrument.base==='SOL');
  const step=P.candle_interval_ms,end=Math.floor(1792953801000/step)*step,received=end+1000;
  const rows=Array.from({length:125},(_,i)=>({time:end-(125-i)*step,open:'10',high:'11',low:'9',close:'10.5',volume:'100'}));
  const oldestImpulseEnd=end-P.wave_search_ms,baselineEnd=oldestImpulseEnd-P.impulse_window_ms;
  const baselineStart=baselineEnd-P.volume_baseline_ms;
  const baselineCount=values=>values.filter(r=>r.open_ts>=baselineStart&&r.close_ts<=baselineEnd).length;
  for(const variant of ['full125','short121','openAtCutoff']){
    const returned=variant==='full125'?rows:variant==='short121'?rows.slice(-121):[...rows.slice(1),{...rows.at(-1),time:end}];
    const calls=[];
    const sources=createPumpSources({identityRegistry:[entry],clock:()=>received,broker:{async request(request){
      calls.push(request);const url=new URL(request.url);
      assert.equal(url.pathname,'/openApi/swap/v3/quote/klines');
      assert.equal(url.searchParams.get('limit'),'125'); assert.equal(url.searchParams.get('startTime'),String(end-125*step));
      assert.equal(url.searchParams.get('endTime'),String(end-1)); assert.equal(url.searchParams.get('interval'),'1m');
      assert.equal(url.searchParams.get('symbol'),'SOL-USDT');assert.equal(request.ttl_ms,90000);assert.equal(request.method,'GET');
      return {ok:true,status:200,data:{code:0,data:returned},received_ts:received,receipt_id:'SYNTHETIC_HISTORY125_'+variant};
    }}});
    const result=await sources.getCore({instrument:entry.instrument,only_facts:['candles']}),fact=result.facts.candles;
    assert.equal(calls.length,1);assert.equal(fact.status,'USABLE');
    assert.equal(fact.coverage.expected_rows,125); assert.equal(fact.event_ts,end);
    assert.equal(fact.received_ts,received);assert.equal(fact.expires_ts,end+P.freshness_ms.candles);
    assert.ok(fact.value.every(r=>r.closed&&r.close_ts<=end&&r.close_ts<=received));
    assert.equal(fact.value.some(r=>r.open_ts===end),false);
    if(variant==='full125'){
      assert.equal(fact.value.length,125);assert.equal(fact.coverage.complete,true);assert.equal(baselineCount(fact.value),60);
    }else{
      assert.equal(fact.value.length,variant==='short121'?121:124);
      assert.equal(fact.coverage.complete,false);assert.equal(fact.reason,'SHORT_CONTIGUOUS_HISTORY');
      assert.equal(fact.coverage.history_state,'SHORT_CONTIGUOUS_HISTORY');
      if(variant==='short121')assert.equal(baselineCount(fact.value),56);
    }
  }
});
