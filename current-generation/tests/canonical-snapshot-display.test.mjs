import test from 'node:test';
import assert from 'node:assert/strict';
import {displaySnapshotChange,hasInternalTerminology} from '../files/src/canonical-display.mjs';
import {formatTelegramCompact} from '../files/src/telegram-compact-formatter.mjs';
import {formatManualReport} from '../files/src/manual-report-formatter.mjs';

test('real UNI snapshot units remain readable without exposing internal terms',()=>{
 const raw='С 2026-09-28T20:33:11.710Z по 2026-09-29T08:36:34.249Z: рыночный показатель (Gate Public Futures) изменился с -87.8613 pct_long_minus_short_of_total до 52.9653 pct_long_minus_short_of_total.';
 const strength='сила к BTC (OKX Spot Public V5) изменилась с -0.920672 percentage_points до 1.86079 percentage_points.';
 const average='сила к ETH (OKX Spot Public V5) изменилась с -0.381613 average_percentage_points до 0.127635 average_percentage_points.';
 for(const rendered of [displaySnapshotChange(raw),displaySnapshotChange(strength),displaySnapshotChange(average)]){
  assert.equal(hasInternalTerminology(rendered),false);
  assert.doesNotMatch(rendered,/\b[A-Z]{2,}_[A-Z0-9_]{2,}\b/iu);
 }
 assert.match(displaySnapshotChange(raw),/перевеса покупателей над продавцами/);
 assert.match(displaySnapshotChange(strength),/процентного пункта/);
 assert.match(displaySnapshotChange(average),/среднего процентного пункта/);
});

test('snapshot units do not disable either existing report formatter',()=>{
 const canonical={status:'CLOSED',state:'REJECTED',direction:null,snapshot_time_utc:'2026-09-29T08:36:34.249Z',candidates:[{contract:'UNI-USDT'}],scores:{overall_0_100:null,coin_interest_0_100:null,entry_readiness_0_100:null},reasons:[],hard_gates:[],liquidations:{status:'NOT_CLOSED'},changes_from_previous:[
  'рыночный показатель (Gate Public Futures) изменился с -87.8613 pct_long_minus_short_of_total до 52.9653 pct_long_minus_short_of_total.',
  'сила к BTC (OKX Spot Public V5) изменилась с -0.920672 percentage_points до 1.86079 percentage_points.',
  'сила к ETH (OKX Spot Public V5) изменилась с -0.381613 average_percentage_points до 0.127635 average_percentage_points.',
 ]};
 assert.equal(formatTelegramCompact(canonical).status,'READY');
 assert.equal(formatManualReport(canonical).status,'READY');
});
