import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {preflightDiagnosticReads as preflight} from '../../runner/diagnostic-sql-preflight.mjs';
const schema=JSON.parse(fs.readFileSync(new URL('./fixtures/retained-native-diagnostic-columns-20261009.json',import.meta.url)));
test('the original invalid column is rejected locally before any D1 usage or connection',()=>{
 assert.throws(()=>preflight({schema,statements:['SELECT outcome_id,outcome_status,computed_ts,raw_return_pct,raw_favourable_move_pct,raw_adverse_move_pct FROM v3_early_outcome_journal WHERE outcome_id=?1 LIMIT 1']}),/no such column: raw_favourable_move_pct/);
});
test('exact bounded reads compile from measured native row columns without claiming native costs',()=>{
 const r=preflight({schema,statements:['SELECT * FROM scan_runs WHERE ts_bucket=?1 AND ts=?2 LIMIT 1','SELECT * FROM v3_early_feature_snapshot WHERE contract_code=?1 AND ts_bucket=?2 AND observed_ts=?3 LIMIT 1','SELECT state_key,status,updated_ts FROM tz101_entry_area_calibration_state WHERE state_key=?1 LIMIT 1','SELECT outcome_id,outcome_status,computed_ts,raw_return_pct,mfe_pct,mae_pct FROM v3_early_outcome_journal WHERE outcome_id=?1 LIMIT 1']});assert.equal(r.statements,4);assert.equal(r.D1,0);assert.equal(r.native_cost_estimated,false);assert.equal(r.native_query_plan_verified,false);assert.equal(r.native_current_schema_verified,false);
});
test('writes, multiple statements, unbounded queries and altered identifiers never compile as read diagnostics',()=>{
 for(const sql of ['UPDATE scan_runs SET ts=0','SELECT * FROM scan_runs','SELECT * FROM scan_runs LIMIT 1; DELETE FROM scan_runs','SELECT * FROM scan_runs LIMIT 1 -- ignored','SELECT * FROM absent_table LIMIT 1'])assert.throws(()=>preflight({schema,statements:[sql]}));
 assert.throws(()=>preflight({schema:{...schema,tables:{'bad;DROP': ['x']}},statements:['SELECT x FROM bad LIMIT 1']}),/COLUMNS_INVALID/);
});
test('missing original columns cannot be replaced with assumed names',()=>{
 assert.throws(()=>preflight({schema:{...schema,tables:{v3_early_outcome_journal:['outcome_id']}},statements:['SELECT outcome_id,raw_return_pct FROM v3_early_outcome_journal LIMIT 1']}),/no such column: raw_return_pct/);
});
