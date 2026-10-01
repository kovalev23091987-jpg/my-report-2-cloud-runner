import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {formatManualRunSummary} from '../files/src/manual-run-summary.mjs';
const captured=JSON.parse(fs.readFileSync(new URL('./fixtures/btw-main-future-context-20261001.json',import.meta.url),'utf8'));

test('real rejected BTW manual output retains its future-liquidation context without an entry plan',()=>{
 const text=formatManualRunSummary(captured);
 assert.match(text,/ЛИКВИДАЦИОННЫЙ БЛОК/u);
 assert.match(text,/Сильные ликвидации выше: уровни будущих ликвидаций не получены/u);
 assert.match(text,/Сильные ликвидации ниже: уровни будущих ликвидаций не получены/u);
 assert.match(text,/отсутствие данных, а не нулевые ликвидации/u);
 assert.match(text,/Действие сейчас: не входить/u);
 assert.doesNotMatch(text,/Уровень входа:|Первая цель:/u);
});

test('manual context requires the exact current run and cannot borrow a scheduled or foreign result',()=>{
 for(const mutate of [d=>d.source='schedule',d=>d.run_id='OTHER_RUN',d=>d.candidates[0].run_id='OTHER_RUN',d=>d.candidates[0].canonical.run_id='OTHER_RUN',d=>d.candidates[0].canonical.status='NOT_CLOSED',d=>d.candidates[0].contract='BTC-USDT']){
  const d=structuredClone(captured);mutate(d);assert.doesNotMatch(formatManualRunSummary(d),/ЛИКВИДАЦИОННЫЙ БЛОК/u);
 }
});
