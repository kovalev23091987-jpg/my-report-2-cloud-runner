import test from 'node:test';
import assert from 'node:assert/strict';
import {formatManualReport} from '../files/src/manual-report-formatter.mjs';
import {formatTelegramCompact} from '../files/src/telegram-compact-formatter.mjs';
const base={status:'CLOSED',snapshot_time_utc:'2026-09-27T16:00:00.000Z',state:'OBSERVE',direction:'LONG',scores:{overall_0_100:70,coin_interest_0_100:71,entry_readiness_0_100:null},reasons:[],source_receipts:[],hard_gates:[],candidates:[{contract:'FIL-USDT'}],metadata:{contract:'FIL-USDT',supporting_context:{facts:[]}},early_candidate:null,free_sources:{registry:{entries:[]},entry_funnel:{blockers:[],blocker_details:[],has_unknown_reason:false}},liquidations:{status:'NOT_CLOSED'},changes_from_previous:[]};
test('internal supplemental sources do not alter approved report surfaces',()=>{
 const beforeManual=formatManualReport(base),beforeTelegram=formatTelegramCompact(base);
 const internal={...base,metadata:{...base.metadata,internal_market_context:{internal_only:true,deribit:{source:'DERIBIT',market_regime:'RISK_OFF_ELEVATED'},coinlobster:{source:'COINLOBSTER',whale_radar:[{coin:'FIL',multiple:7}]}}}};
 const afterManual=formatManualReport(internal),afterTelegram=formatTelegramCompact(internal);
 assert.equal(afterManual.text,beforeManual.text);assert.equal(afterTelegram.message,beforeTelegram.message);
 assert.doesNotMatch(afterManual.text,/Deribit|CoinLobster/i);assert.doesNotMatch(afterTelegram.message,/Deribit|CoinLobster/i);
});
