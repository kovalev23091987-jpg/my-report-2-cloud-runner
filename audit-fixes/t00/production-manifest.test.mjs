import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const manifest=JSON.parse(fs.readFileSync(path.join(repo,'audit-fixes/t00/PRODUCTION_MANIFEST.json'),'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('K00: production identity and exact worker override match V4',()=>{
  assert.equal(manifest.production.commit,'2d0a80d93bc67b8a79b5d2609bdf83128be7a1ba');
  assert.equal(manifest.production.expected_worker_sha256,'c25939859bbe3f02a7f3479d1f0f656b4877c06dd72f18e372e4927289ba5a97');
  assert.equal(sha(path.join(repo,'current-generation/files/src/worker.js')),manifest.production.expected_worker_sha256);
  assert.equal(manifest.production.observed_run_head_sha,manifest.production.commit);
});

test('K00: all recorded overlay and module hashes still match',()=>{
  assert.equal(manifest.reconstruction.production_overlays.length,15);
  assert.equal(manifest.reconstruction.final_overlays.length,4);
  for(const item of [...manifest.reconstruction.production_overlays,...manifest.reconstruction.final_overlays])assert.equal(sha(path.join(repo,item.entrypoint)),item.sha256,item.entrypoint);
  for(const [relative,expected] of Object.entries(manifest.repository_effective_override_modules))assert.equal(sha(path.join(repo,relative)),expected,relative);
  for(const [relative,expected] of Object.entries(manifest.migrations))assert.equal(sha(path.join(repo,relative)),expected,relative);
  assert.equal(sha(path.join(repo,manifest.dependencies.lockfile)),manifest.dependencies.lockfile_sha256);
});

test('K00: unavailable production evidence is explicit, never synthesized',()=>{
  assert.match(manifest.completeness.status,/INCOMPLETE|PARTIAL/);
  assert.ok(manifest.completeness.blocking_missing.length>=1);
  for(const status of Object.values(manifest.required_historical_fixtures))assert.match(status,/NOT_PRESENT|NOT_CAPTURED/);
});

test('K00: authorized decrypted runtime matches the production worker and includes TZ10.1',()=>{
  assert.equal(manifest.runtime_capture.status,'CAPTURED_AUTHORIZED_DECRYPTED_RUNTIME');
  assert.equal(manifest.runtime_capture.capture_run_id,36359352694);
  assert.equal(manifest.runtime_capture.worker_sha256,manifest.production.expected_worker_sha256);
  assert.equal(manifest.runtime_capture.tz101_entry_area_calibration_present,true);
  assert.deepEqual(manifest.runtime_capture.tz101_tests,{node:'PASS',d1_schema:'PASS'});
  assert.ok(Object.hasOwn(manifest.runtime_capture.files,'src/tz101-entry-area-calibration.mjs'));
});

test('K00: controlled D1 inventory is read-only and cannot enter the report cycle',()=>{
  const capture=fs.readFileSync(path.join(repo,'audit-fixes/t00/capture-d1-inventory.mjs'),'utf8');
  const workflow=fs.readFileSync(path.join(repo,'.github/workflows/report2.yml'),'utf8');
  assert.doesNotMatch(capture,/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b\s+(?:INTO|TABLE|INDEX|VIEW|TRIGGER)?/i);
  assert.match(capture,/changed_db:false,rows_written:0/);
  assert.match(workflow,/inputs\.reason != 'T00_RUNTIME_EXPORT' && inputs\.reason != 'T00_D1_INVENTORY'/);
  assert.match(workflow,/REPORT2_TELEGRAM_OUTPUT_ENABLED:.*controlled_no_telegram.*'0'/);
});
