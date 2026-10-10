import test from 'node:test';import assert from 'node:assert/strict';import {planHtxColdHistoryBackfill as plan} from './htx-cold-history-backfill-plan.mjs';
const contracts=Array.from({length:102},(_,i)=>`T${String(i).padStart(3,'0')}-USDT`),census={schema:'HTX_RETAINED_102_FACTUAL_HISTORY_GAP_CENSUS_V1',status:'PARTIAL_VERIFIED_RETAINED_EVIDENCE_ONLY',rows:contracts.map(contract=>({contract}))};
test('two official requests per archive stay inside explicit reservation',()=>{const r=plan({census,window_end_day:'2026-10-03',source_http_reservation:16});assert.equal(r.status,'BOUNDED_ACQUISITION_PLAN_CLOSED');assert.equal(r.planned.length,8);assert.equal(r.planned_source_http,16);assert.ok(r.planned.every(x=>x.archive_url.endsWith('.zip')&&x.checksum_url.endsWith('.zip.CHECKSUM')&&x.availability_unproven&&x.price_or_volume_qualified===false));});
test('verified assets rotate behind assets with fewer retained days',()=>{const verified=contracts.slice(0,8).map(contract=>({contract,archive_day:'2026-10-03',status:'CLOSED_PRICE_HISTORY'})),r=plan({census,window_end_day:'2026-10-03',verified,source_http_reservation:16});assert.deepEqual(r.planned.map(x=>x.contract),contracts.slice(8,16));assert.ok(r.planned.every(x=>x.archive_day==='2026-10-03'));});
test('duplicate, foreign, malformed and over-cap receipts fail closed',()=>{const good={contract:contracts[0],archive_day:'2026-10-03',status:'CLOSED_PRICE_HISTORY'};for(const args of [{verified:[good,good]},{verified:[{...good,contract:'BTC-USD'}]},{verified:[{...good,status:'HTTP_200'}]},{source_http_reservation:18},{window_days:31}])assert.equal(plan({census,window_end_day:'2026-10-03',...args}).status,'NOT_CLOSED');});
test('complete exact 30-day receipt grid produces no acquisition claim',()=>{const verified=contracts.flatMap(contract=>Array.from({length:30},(_,i)=>({contract,archive_day:new Date(Date.UTC(2026,9,3)-i*86400000).toISOString().slice(0,10),status:'CLOSED_PRICE_HISTORY'}))),r=plan({census,window_end_day:'2026-10-03',verified});assert.equal(r.status,'REQUESTED_WINDOW_ALREADY_VERIFIED');assert.equal(r.planned_source_http,0);assert.equal(r.sourceHTTP,0);assert.equal(r.project_complete,false);});

test('three checksum-and-grid-verified original archives are not fetched again or relabelled price-qualified',()=>{
 const verified=contracts.slice(0,3).map(contract=>({contract,archive_day:'2026-10-03',status:'CHECKSUM_AND_1440_MINUTE_GRID_VERIFIED_PRICE_API_NOT_CROSSCHECKED'}));
 const r=plan({census,window_end_day:'2026-10-03',verified,source_http_reservation:6});
 assert.equal(r.status,'BOUNDED_ACQUISITION_PLAN_CLOSED');
 assert.equal(r.verified_slots,3);
 assert.deepEqual(r.planned.map(x=>x.contract),contracts.slice(3,6));
 assert.ok(r.planned.every(x=>x.price_or_volume_qualified===false));
 assert.equal(r.sourceHTTP,0);
});
