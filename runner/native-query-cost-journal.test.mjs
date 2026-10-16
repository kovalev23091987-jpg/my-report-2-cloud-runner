import test from 'node:test';import assert from 'node:assert/strict';
import {NativeQueryCostJournal,nativeQueryTarget} from './native-query-cost-journal.mjs';
test('bounded journal marks overflow, keeps monotonic attempts and exports no SQL or values',()=>{
 const j=new NativeQueryCostJournal({binding:'A1',max_statements:2});for(let i=0;i<3;i++)j.record({operation:'run',sql:'UPDATE alpha SET secret=?1',usage:{measured:true,rows_read:i,rows_written:2}});
 const s=j.snapshot();assert.equal(s.attempted_statements,3);assert.equal(s.recorded_statements,2);assert.equal(s.overflow,true);assert.equal(s.additional_SQL,0);assert(!JSON.stringify(s).includes('secret'));assert(!JSON.stringify(s).includes('UPDATE'));
 s.receipts[0].rows_read=999;assert.equal(j.snapshot().receipts[0].rows_read,0);assert.throws(()=>new NativeQueryCostJournal({binding:'A1',max_statements:513}),/BOUNDED/);
});
test('missing counters stay null and INSERT OR IGNORE targets remain distinct',()=>{
 const j=new NativeQueryCostJournal({binding:'bridge'});j.record({operation:'batch',sql:'INSERT OR IGNORE INTO ledger(x) VALUES(?)',usage:{measured:false,rows_read:4}});const r=j.snapshot().receipts[0];assert.equal(r.target,'ledger');assert.equal(r.rows_read,4);assert.equal(r.rows_written,null);assert.equal(r.unknown,true);assert.match(r.sql_sha256,/^[a-f0-9]{64}$/);assert.equal(nativeQueryTarget('SELECT 1'),'OTHER');
});
