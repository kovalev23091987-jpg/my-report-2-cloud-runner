import test from 'node:test';
import assert from 'node:assert/strict';
import { wilson95, entryAreaReadiness, ENTRY_AREA_REQUIRED } from './readiness-lib.mjs';

test('Wilson interval is bounded and centered on observed hit rate', () => {
  const w = wilson95(60, 100);
  assert.equal(w.p, 0.6);
  assert.ok(w.lower < 0.6 && w.upper > 0.6);
  assert.ok(w.lower >= 0 && w.upper <= 1);
});

test('entry-area readiness preserves existing 80 train + 40 holdout threshold', () => {
  const rows = Array.from({length: ENTRY_AREA_REQUIRED - 1}, (_,i)=>({sample_id:`S${i}`,observed_ts:1000+i*10,outcome_scan_ts:2000+i*10}));
  const r = entryAreaReadiness(rows);
  assert.equal(r.status, 'NOT_VALIDATED_INSUFFICIENT_PROSPECTIVE_SAMPLE');
  assert.equal(r.required_samples, 120);
});

test('entry-area readiness is data-ready but explicitly not validated at 120 chronological samples', () => {
  const rows = Array.from({length: ENTRY_AREA_REQUIRED}, (_,i)=>({sample_id:`S${i}`,observed_ts:1000+i*10,outcome_scan_ts:2000+i*10}));
  const r = entryAreaReadiness(rows);
  assert.equal(r.status, 'CALIBRATION_DATA_READY_NOT_VALIDATED');
  assert.equal(r.train_samples, 80);
  assert.equal(r.holdout_samples, 40);
  assert.equal(r.validated_out_of_sample, false);
});

test('duplicate sample fails closed', () => {
  const r = entryAreaReadiness([
    {sample_id:'X',observed_ts:1000,outcome_scan_ts:2000},
    {sample_id:'X',observed_ts:1010,outcome_scan_ts:2010},
  ], {minTrain:1,minHoldout:1});
  assert.equal(r.status, 'NOT_VALIDATED_DUPLICATE_SAMPLE');
});
