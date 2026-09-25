import test from 'node:test';import assert from 'node:assert/strict';
import {buildCanonicalAnalyticalResult,canonicalParity} from '../src/canonical-analytical-result.mjs';
import {formatTelegramCompact} from '../src/telegram-compact-formatter.mjs';
import {formatManualReport} from '../src/manual-report-formatter.mjs';
const TS=1_800_000_000_000;
function canonical(state='WAIT_FOR_TRIGGER'){
 return buildCanonicalAnalyticalResult({snapshot_id:'snap-1',run_id:'run-1',observed_ts:TS,universe:['AAA-USDT'],candidates:[{contract:'AAA-USDT'}],state,direction:'LONG',overall_score_0_100:82,coin_interest_score_0_100:86,entry_readiness_score_0_100:71,
 reasons:[{label:'Открытый интерес за 1 час',value:'+8.2%',venue:'HTX'},{label:'Ставка финансирования',value:'-0.031%',venue:'HTX'},{label:'Спотовые покупки',value:'+1.8 млн USDT',venue:'OKX'}],
 source_receipts:[{metric:'oi',source:'HTX',status:'CLOSED'}],hard_gates:[{gate:'turnover',status:'CLOSED'}],current_price:1.02,
 trigger:{metric:'price',operator:'>=',value:1.05,timeframe:'5м',expires_ts:TS+3600000,cancel_condition:'цена ниже 0.98',next_recheck_ts:TS+300000},
 early_candidate:{items:[{contract:'AAA-USDT',operational_priority_0_100:88,reason:'ранняя аномалия объёма + поглощение'}]},microstructure:{status:'CLOSED',reason:'поглощение продаж'},data_quality:{status:'CLOSED'},changes_from_previous:['открытый интерес +3.1 п.п.']});
}
test('same snapshot canonical analytics are identical while Telegram and manual formatter remain different',()=>{const c=canonical();const copy=structuredClone(c);assert.equal(canonicalParity(c,copy).equal,true);const tg=formatTelegramCompact(c);const manual=formatManualReport(c);assert.equal(tg.ok,true);assert.equal(manual.ok,true);assert.equal(tg.analytical_fingerprint,manual.analytical_fingerprint);assert.notEqual(tg.message,manual.text);assert.match(manual.text,/РАННИЕ КАНДИДАТЫ ДО ДВИЖЕНИЯ/);assert.match(tg.message,/Снимок:/);});
test('same snapshot mismatch is detected',()=>{const a=canonical();const b=structuredClone(a);b.state='OBSERVE';const p=canonicalParity(a,b);assert.equal(p.equal,false);assert.ok(p.mismatches.includes('state'));});
test('Telegram uses required score labels, Russian trading terms and stays within WAIT limit',()=>{const tg=formatTelegramCompact(canonical());assert.equal(tg.ok,true);assert.match(tg.message,/Общая оценка: 82 из 100/);assert.match(tg.message,/Монета интересна: 86 из 100/);assert.match(tg.message,/Готовность ко входу: 71 из 100/);assert.ok(tg.length<=850);assert.doesNotMatch(tg.message,/\b(?:LONG|SHORT|OI|Funding|Spot flow|Spread|Slippage|Data Quality)\b/);assert.doesNotMatch(tg.message,/автоматическая торговля выключена|не вероятность/i);});
test('manual report always includes empty early-candidate section',()=>{const c=canonical('OBSERVE');c.early_candidate={items:[]};const m=formatManualReport(c);assert.match(m.text,/РАННИЕ КАНДИДАТЫ ДО ДВИЖЕНИЯ/);assert.match(m.text,/Подтверждённых ранних кандидатов нет/);});
