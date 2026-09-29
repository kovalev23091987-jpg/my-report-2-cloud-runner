import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {formatLiquidationRunSummary} from '../files/src/manual-run-summary.mjs';

const scan={universe_total:364,scanned:364,errors:0,stale:0};
test('standalone liquidation result has a ready report with separated calculated zones',()=>{
 const message=formatLiquidationRunSummary({status:'CLOSED',scan,preliminary_candidates:[{contract:'WLD-USDT'},{contract:'PUMP-USDT'}],verified_candidate:'WLD-USDT',
  liquidation_lines:['Сильные ликвидации выше: 0,53 USDT — крупная; расчётная вероятная зона.','gTrade WLD — ниже: 0,46 USDT; ограниченная выборка.']});
 assert.match(message,/ЛИКВИДАЦИОННЫЙ БЛОК/u);
 assert.match(message,/WLD-USDT/u);
 assert.match(message,/расчётная вероятная зона/u);
 assert.match(message,/gTrade WLD/u);
 assert.match(message,/не подтверждённый вход/u);
 assert.doesNotMatch(message,/GitHub|DEGRADED|доступ к базе/u);
});
test('partial market scan cannot be presented as a complete liquidation result',()=>{
 assert.equal(formatLiquidationRunSummary({status:'CLOSED',scan:{...scan,scanned:363},verified_candidate:'WLD-USDT'}),null);
 assert.equal(formatLiquidationRunSummary({status:'NOT_CLOSED',scan,verified_candidate:'WLD-USDT'}),null);
});
test('standalone command writes the canonical artifact without starting Telegram',()=>{
 const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
 const branch=runner.slice(runner.indexOf('if(commandIntent.matched){'),runner.indexOf('await worker.scheduled('));
 assert.match(branch,/formatLiquidationRunSummary/u);
 assert.match(branch,/fs\.writeFile\('report2-run-result\.json',JSON\.stringify\(liquidationRunOutput/u);
 assert.match(branch,/telegram_started:false/u);
});
