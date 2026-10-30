import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {analyzePump} from '../../analytics/index.mjs';
import {input,fact,zone,T,MINUTE} from './fixtures.mjs';

export function maximal({unicode=false,relative=true,allContext=true}={}){
  const x=input(),first=analyzePump(x),text=unicode?'🚀'.repeat(200):'LONG_SOURCE_LABEL_'.repeat(30);
  x.instrument.native_symbol=text;
  x.previous_wave=structuredClone(first.next_wave);
  x.previous_wave.confirmed_pivots.push(...[104,107,110].map((price,i)=>({kind:'HIGH',price,event_ts:T-(30-i)*MINUTE,known_ts:T-(27-i)*MINUTE,fact_id:'ARTIFICIAL_PRIOR_'+i})));
  x.liquidations={status:'PARTIAL',reason:'ARTIFICIAL_MAXIMUM_PRESENTATION',coverage:{scope:'ARTIFICIAL_ONLY'},zones:[]};
  // Disjoint providers prevent artificial merging: all six selected zones stay.
  for(let i=0;i<3;i++)for(const side of ['UP','DOWN']){
    const lo=side==='UP'?113+i*15:104-i*12;
    const item=zone(side+i,lo,lo+0.2,{source:text,primary_provider:'ARTIFICIAL_'+side+i,venue:text,model_id:text,model_version:text,
      magnitude_value:1.234567891234e300,magnitude_unit:relative?'RELATIVE_INTENSITY':'UNQUALIFIED_UNIT_'.repeat(20),
      relative_scale:relative?{scale_id:text,model_version:text}:null,event_ts:T-299000,received_ts:T,expires_ts:T+1000,
      limitations:['PARTIAL_SOURCE_COVERAGE','OVERLAPPING_COVERAGE_NOT_SUMMED','RETURNED_BINS_ONLY']});
    x.liquidations.zones.push(item,{...structuredClone(item),zone_id:side+i+'_SECOND',lower:lo+0.1,upper:lo+0.3});
  }
  if(allContext){
    x.facts.trades=fact('trades',[{trade_id:'B',event_ts:T-1000,price:112,quantity_base:123456789,aggressor_side:'BUY'},{trade_id:'S',event_ts:T,price:112,quantity_base:987654321,aggressor_side:'SELL'}],'USDT_PRICE_BASE_QUANTITY');
    x.facts.open_interest=fact('open_interest',1.23456789e290,'CONTRACTS');
    x.facts.funding=fact('funding',{rate:0.000123456789,period_ms:28800000},'RATE_FRACTION_PER_ACTUAL_PERIOD');
    x.facts.market_context=fact('market_context',{returns:[{role:'CANDIDATE',return_pct:12.123456,start_ts:T-15*MINUTE,end_ts:T},{role:'BTC',return_pct:1.123456,start_ts:T-15*MINUTE,end_ts:T},{role:'ETH',return_pct:-1.123456,start_ts:T-15*MINUTE,end_ts:T}]},'RETURN_PERCENT_SAME_WINDOW');
    for(const k of ['trades','open_interest','funding','market_context']){x.facts[k].source=text;x.facts[k].venue=text;}
  }
  return x;
}
function required(a){
  assert.equal(a.ready,true,JSON.stringify(a.reasons));assert.equal(a.plan.entry_zones.length,3);assert.equal(a.liquidations.zones_up.length,3);assert.equal(a.liquidations.zones_down.length,3);
  assert.ok(a.card_text.length<=4096,'Telegram card has '+a.card_text.length+' UTF-16 units');
  assert.match(a.card_text,/Покупка на откате/);assert.match(a.card_text,/Фиксация всей позиции/);assert.match(a.card_text,/Размер:/);assert.match(a.card_text,/пересмотреть план/);assert.match(a.card_text,/Карта неполная/);assert.match(a.card_text,/вероятность пока не оценена/);assert.equal(a.probability.value_pct,null);
  for(const z of [...a.plan.entry_zones,a.plan.exit_zone,...a.liquidations.zones_up,...a.liquidations.zones_down])for(const v of [z.lower,z.upper])assert.ok(a.card_text.includes(Number(v.toPrecision(10)).toString()),'missing selected price '+v);
}
async function save(name,a){await writeFile(new URL('../../handoffs/analytics/package-g/'+name+'.txt',import.meta.url),a.card_text+'\n');await writeFile(new URL('../../handoffs/analytics/package-g/'+name+'.json',import.meta.url),JSON.stringify({evidence:'ARTIFICIAL_PRESENTATION_ONLY',characters:a.card_text.length,analysis:a},null,2)+'\n');}
test('G01 maximum three entries, six relative-scale zones and every optional context fit one complete Telegram card',async()=>{const a=analyzePump(maximal());required(a);await save('relative-max',a);});
test('G02 long opaque source-unit labels cannot make a ready card exceed Telegram size',async()=>{const a=analyzePump(maximal({relative:false}));required(a);assert.match(a.card_text,/Краткая версия/);await save('opaque-unit-max',a);});
test('G03 Unicode source/model/symbol labels cannot overflow or leave unpaired UTF-16 surrogates',async()=>{
  const a=analyzePump(maximal({unicode:true}));required(a);assert.equal(a.card_text.isWellFormed(),true);await save('unicode-max',a);
});
test('G04 odd UTF-16 source prefixes in optional-context sentences remain valid Unicode',()=>{
  const x=maximal({unicode:true});for(const k of ['trades','open_interest','funding','market_context'])x.facts[k].source='X'+'🚀'.repeat(200);const a=analyzePump(x);required(a);assert.equal(a.card_text.isWellFormed(),true);
});
test('G05 compact relative map retains short-history and unconfirmed-return warnings, model basis, source clocks and all prices',async()=>{
  const x=maximal();x.previous_wave.state='SHARP_PULLBACK_UNCONFIRMED';x.previous_wave.reclaim_level=114;x.previous_wave.reclaim_breached=true;x.previous_wave.impulse.baseline_status='SHORT_HISTORY';
  const a=analyzePump(x);required(a);assert.equal(a.wave_state,'SHARP_PULLBACK_UNCONFIRMED');assert.match(a.card_text,/История сравнения короче/);assert.match(a.card_text,/Возврат не подтверждён/);assert.match(a.card_text,/расчётная, модель/);assert.match(a.card_text,/МСК \(299 с назад\)/);assert.match(a.card_text,/не сумма/);assert.match(a.card_text,/шкала/);await save('relative-with-warnings',a);
});
test('G06 compaction never converts an opaque or relative source unit into a monetary estimate',()=>{
  const a=analyzePump(maximal({relative:false}));required(a);const map=a.card_text.split('\n').filter(s=>s.startsWith('Ликвидации')).join('\n');assert.match(map,/UNQUALIFIED_UNIT_/);assert.doesNotMatch(map,/e\+300 USDT/);
});
test('G07 no-map card preserves all three entries and facts without a hidden map gate',()=>{
  const x=maximal();x.liquidations={status:'NOT_CHECKED_BUDGET',reason:'ARTIFICIAL_EXHAUSTED',zones:[],coverage:null};const a=analyzePump(x);assert.equal(a.ready,true);assert.equal(a.plan.entry_zones.length,3);assert.ok(a.card_text.length<=4096);assert.match(a.card_text,/Карта ликвидаций недоступна/);assert.equal(a.probability.value_pct,null);
});
test('G08 compact card keeps a smaller supported position limit and observable invalidation',()=>{
  const x=maximal({relative:false});x.facts.orderbook.value={asks:[[112.1,7]],bids:[[111.9,7]]};const a=analyzePump(x);required(a);assert.equal(a.plan.position_limit_usdt,700);assert.match(a.card_text,/Размер: до 700 USDT/);assert.ok(a.card_text.includes(String(a.plan.invalidation.price)));
});
test('G09 observed positions retain their observed basis rather than being renamed modeled liquidations',()=>{
  const x=maximal({relative:false});for(const z of x.liquidations.zones){z.basis_type='OBSERVED_POSITION';z.event_ts=T-119000;z.model_id=null;z.model_version=null;z.magnitude_unit='USDT';}
  const a=analyzePump(x);required(a);assert.match(a.card_text,/наблюдаемые позиции/);assert.doesNotMatch(a.card_text,/расчётная, модель/);
});
