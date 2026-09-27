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
  assert.equal(manifest.completeness.status,'INCOMPLETE');
  assert.ok(manifest.completeness.blocking_missing.length>=1);
  assert.equal(manifest.runtime_capture.status,'BLOCKED_GITHUB_CONTENTS_WRITE_PERMISSION');
  assert.equal(manifest.runtime_capture.tz101_entry_area_calibration_present,false);
  for(const status of Object.values(manifest.required_historical_fixtures))assert.match(status,/NOT_PRESENT|NOT_CAPTURED/);
});
