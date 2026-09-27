import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical as capturedCanonical} from '../../liquidation/liquidation-extension/integration/tests/merged-unified-fixture.mjs';
import * as pub from '../files/src/canonical-publication.mjs';
import {formatManualReport} from '../files/src/manual-report-formatter.mjs';
function frame(event='WAIT',edit=()=>{}) {const c=capturedCanonical(event);edit(c);c.analytical_fingerprint=pub.canonicalFingerprint(c);return c;}
function presentations(c,event='WAIT') {return {canonical:c,lifecycle_event:event,direction:c.direction,manual_text:formatManualReport(c).text,telegram_text:pub.renderCanonicalTelegram({canonical:c,lifecycle_event:event}).text};}
test('R020 R029 R059: full manual and actual sender agree on fractional score presentation',()=>{
 const c=frame('WAIT',c=>{c.scores.overall_0_100=72.3;c.scores.coin_interest_0_100=73.1;});
 const p=presentations(c);assert.equal(pub.validatePresentation(p).status,'CLOSED');
 assert.match(p.manual_text,/РАННИЕ КАНДИДАТЫ ДО ДВИЖЕНИЯ/);assert.match(p.manual_text,/Общая оценка: 72 из 100/);
});
test('R020: unavailable overall score is unavailable in both full report and Telegram',()=>{
 const c=frame('OBSERVE',c=>{c.scores.overall_0_100=null;});const p=presentations(c,'OBSERVE');
 assert.match(p.manual_text,/Общая оценка: не подтверждена/);assert.match(p.telegram_text,/Общая оценка: не подтверждена/);
 assert.equal(pub.validatePresentation(p).status,'CLOSED');
});
test('R006 R028 R059: actual full manual preserves trigger, cancellation, expiry and recheck separately',()=>{
 const c=frame(),r=pub.renderCanonicalManual({canonical:c,lifecycle_event:'WAIT'});
 assert.match(r.text,/РАННИЕ КАНДИДАТЫ ДО ДВИЖЕНИЯ/);assert.match(r.text,/Условие входа: цена >= 1,15 USDT/);
 assert.match(r.text,/Отмена ожидания: цена ниже 1,05 USDT/);assert.match(r.text,/Следующая автоматическая проверка:/);
 assert.match(r.text,/Условие действительно до:/);
});
test('R023: oversize WAIT is rejected without removing risk or silently expanding 850 limit',()=>{
 const c=frame('WAIT',c=>{c.trigger.cancel_condition='цена ниже 1,05 USDT; '+ 'подтверждение риска '.repeat(80);});
 const before=JSON.stringify(c),r=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'WAIT'});
 assert.equal(r.ok,false);assert.equal(r.max_length,850);assert.equal(r.text,null);assert.equal(JSON.stringify(c),before);
});
test('R022: oversize ENTRY is rejected at 1100 without deleting cancellation',()=>{
 const c=frame('ENTRY',c=>{c.invalidation='цена ниже 1,05 USDT; '+ 'подтверждение риска '.repeat(80);});
 const r=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'ENTRY'});assert.equal(r.ok,false);assert.equal(r.max_length,1100);
});
test('R019: OI window and units have Russian presentation',()=>{
 const c=frame('OBSERVE',c=>{c.liquidations=null;c.metadata.oi_window_receipts={'1h':{status:'CLOSED',change_pct:-2.39,unit:'CONTRACTS',window_start_ts:c.observed_ts-3600000,window_end_ts:c.observed_ts}};});
 const r=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'});assert.equal(r.ok,true);assert.match(r.text,/за 1 ч/);assert.doesNotMatch(r.text,/CONTRACTS|projected|canonical result|\b1h\b/);
});
test('R059: direction must be correct in each presentation, never only the concatenation',()=>{
 const c=frame(),p=presentations(c);p.manual_text=p.manual_text.replace('Направление: покупка','Направление: не закрыто');
 assert.equal(pub.validatePresentation(p).status,'NOT_CLOSED');
});
test('R059: a changed cancellation cannot pass just because scores and direction match',()=>{
 const c=frame(),p=presentations(c);p.telegram_text=p.telegram_text.replace('цена ниже 1,05 USDT','цена ниже 0,50 USDT');
 assert.equal(pub.validatePresentation(p).status,'NOT_CLOSED');
});
test('R080 R081: absolute OI and monetary flow cannot be mislabeled as percentages',()=>{
 const c=frame('OBSERVE',c=>{c.liquidations=null;c.source_receipts=[{status:'CLOSED',metric:'OPEN_INTEREST',venue:'HTX',value:120000,unit:'CONTRACTS',window:'1h'},{status:'CLOSED',metric:'SPOT_TAKER_DELTA',venue:'Bybit',value:2500,unit:'USDT',window:'1h'}];});
 const tg=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'}),m=formatManualReport(c);assert(tg.ok&&m.ok);
 for(const output of [tg.text,m.text]){assert.match(output,/120000 контракты/);assert.match(output,/2500 USDT/);assert.doesNotMatch(output,/120000(?:,00)?%|2500(?:,00)?%/);}
});
test('R025 R026 R059: legacy projected levels are factual prices in the full manual as well',()=>{
 const c=frame('ENTRY',c=>{c.liquidations={status:'CLOSED',pump:{is_pump:true},above:[{price:1.3,distance_pct:14}],below:[{price:1.0,distance_pct:-12}]};});
 const tg=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'ENTRY'}),m=formatManualReport(c);assert(tg.ok&&m.ok);
 for(const output of [tg.text,m.text]){assert.match(output,/выше: 1,3 USDT/);assert.match(output,/ниже: 1 USDT/);}
});
