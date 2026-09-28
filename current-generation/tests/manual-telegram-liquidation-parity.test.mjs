import test from 'node:test';
import assert from 'node:assert/strict';
import {formatManualReport} from '../files/src/manual-report-formatter.mjs';
import {formatTelegramCompact} from '../files/src/telegram-compact-formatter.mjs';
const canonical={
 status:'CLOSED',snapshot_time_utc:'2026-09-27T15:00:00.000Z',observed_ts:1790521200000,state:'OBSERVE',direction:'LONG',
 scores:{overall_0_100:70,coin_interest_0_100:72,entry_readiness_0_100:null},reasons:[],source_receipts:[],hard_gates:[],
 candidates:[{contract:'FIL-USDT'}],metadata:{contract:'FIL-USDT',supporting_context:{facts:[]}},early_candidate:null,
 free_sources:{registry:{entries:[]},entry_funnel:{blockers:[],blocker_details:[],has_unknown_reason:false}},
 liquidations:{status:'CLOSED',pump:{is_pump:true},above:[{price:110,distance_pct:10,selection_role:'NEAREST_STRONG',liquidated_side:'SELLERS'}],below:[{price:90,distance_pct:-10,selection_role:'NEAREST_STRONG',liquidated_side:'BUYERS'}]},
 changes_from_previous:[]
};
test('same verified liquidation levels are present in manual report and Telegram formatter',()=>{
 const manual=formatManualReport(canonical),telegram=formatTelegramCompact(canonical);
 assert.equal(manual.ok,true);assert.equal(telegram.ok,true);
 for(const price of ['110','90']){assert.match(manual.text,new RegExp(price));assert.match(telegram.message,new RegExp(price));}
 assert.match(manual.text,/ЛИКВИДАЦИИ/);assert.match(telegram.message,/Ликвидации:/);
});
test('ETC snapshot change presents settlement-rate unit before terminology validation',()=>{
 const etc={...canonical,candidates:[{contract:'ETC-USDT'}],metadata:{...canonical.metadata,contract:'ETC-USDT'},changes_from_previous:['Ставка изменилась на 0,01 rate_per_settlement']};
 const manual=formatManualReport(etc),telegram=formatTelegramCompact(etc);
 assert.equal(manual.ok,true);assert.equal(telegram.ok,true);
 assert.match(manual.text,/ставка за расчётный период/i);assert.match(telegram.message,/ставка за расчётный период/i);
 assert.doesNotMatch(manual.text,/rate_per_settlement/i);assert.doesNotMatch(telegram.message,/rate_per_settlement/i);
});
