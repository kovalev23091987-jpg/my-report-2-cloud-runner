import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {analyzePump,RULES_VERSION} from '../../analytics/index.mjs';
import {input,fact,T} from './fixtures.mjs';

test('S01 owner removal ignores strong weak and malformed incoming benchmark context without changing P/Q plan or explanations',async()=>{
  const x=input();x.run_purpose='ACCEPTANCE_TEST';for(const r of x.facts.candles.value.slice(-5))r.volume_base=3000;
  x.facts.trades=fact('trades',[{trade_id:'S1',event_ts:T-2000,price:112,quantity_base:1,aggressor_side:'SELL'},{trade_id:'S2',event_ts:T,price:112,quantity_base:1,aggressor_side:'SELL'}],'USDT_PRICE_BASE_QUANTITY');
  const baseline=analyzePump(x);assert.equal(baseline.ready,true,JSON.stringify(baseline.reasons));assert.equal(baseline.rules_version,RULES_VERSION);assert.ok(baseline.plan.potential_pct.minimum>=10);assert.deepEqual(baseline.user_narrative.reasons.map(f=>f.code),[baseline.wave_state,'TRADE_PRICE_RESPONSE']);
  const variants=[];for(const [name,value]of [['strong-market',{schema_version:'BINGX_CLOSED_RETURN_CONTEXT_V1',returns:[{role:'CANDIDATE',return_pct:12},{role:'BTC',return_pct:99},{role:'ETH',return_pct:88}]}],['falling-market',{schema_version:'BINGX_CLOSED_RETURN_CONTEXT_V1',returns:[{role:'CANDIDATE',return_pct:12},{role:'BTC',return_pct:-90},{role:'ETH',return_pct:-95}]}],['old-label-only',{returns:[{role:'CANDIDATE',return_pct:12},{role:'BTC',return_pct:1}]}],['malformed-legs',{schema_version:'BINGX_CLOSED_RETURN_CONTEXT_V1',returns:[null]}]]){const y=structuredClone(x);y.facts.market_context=fact('market_context',value,'RETURN_PERCENT_SAME_WINDOW');const frozen=structuredClone(y),a=analyzePump(y);assert.deepEqual(a,baseline,name);assert.deepEqual(y,frozen);assert.ok(!a.findings.some(f=>f.code==='RELATIVE_RETURN'));assert.equal(a.optional_context?.market_context,undefined);assert.equal(a.relative_context_diagnostic,undefined);variants.push(name);}
  for(const name of ['context','index','presentation']){const s=await readFile(new URL('../../analytics/'+name+'.mjs',import.meta.url),'utf8');assert.doesNotMatch(s,/qualifyRelativeContext|market_context|relative_context|RELATIVE_RETURN/);}
  for(const p of [/ТЕСТ — приёмочная проверка/,/Подтверждённый рост/,/Будущее событие для статистики — \+10% за 4 часа/,/Покупка на откате/,/Фиксация всей позиции/,/Карта ликвидаций недоступна/,/пересмотреть план/,/В полученной выборке/])assert.match(baseline.card_text,p);assert.doesNotMatch(baseline.card_text,/BTC|ETH|За одинаковое закрытое окно/);
  await writeFile(new URL('../../handoffs/analytics/package-s/owner-removal-artificial.json',import.meta.url),JSON.stringify({evidence:'ARTIFICIAL_ONLY',variants,baseline,whole_analysis_deep_equal_for_all:true,provider_HTTP:0,native_SQL:0,Telegram:0},null,2)+'\n');
});
