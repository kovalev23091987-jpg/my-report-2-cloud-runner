import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildNoWorkReceipt,auditNoWorkReceipt} from './report2-no-work-receipt.mjs';

const head='a'.repeat(40);
const log=[
  'SCHEDULED_TWO_CANDIDATE_ADMISSION {"status":"NOT_DUE","claimed":false,"due":false,"last_success_ts":1000,"next_due_ts":2000}',
  'TRIGGERED_ENTRY_RECHECK_ADMISSION {"claimed":false,"entry_authorized":false,"source_http":0,"status":"NO_FRESH_EXACT_SENT_TRIGGER"}'
].join('\n');

test('builds an exact bounded no-work receipt',()=>{
  const r=buildNoWorkReceipt(log,{head,source_cloud_run:'38011772185'});
  assert.equal(r.status,'NO_WORK_NOT_DUE_NO_FRESH_TRIGGER');
  assert.equal(r.exact_SENT,0);
  assert.equal(r.actual_ENTRY,0);
  assert.deepEqual(r.audit_added,{sourceHTTP:0,D1:0,Telegram:0});
});

test('audits exact head and cloud-run binding',()=>{
  const receipt=buildNoWorkReceipt(log,{head,source_cloud_run:'38011772185'});
  const audit=auditNoWorkReceipt({receipt,expected_head:head,expected_cloud_run:'38011772185'});
  assert.equal(audit.status,'EXACT_NO_WORK_NOT_DUE_NO_FRESH_TRIGGER_VERIFIED');
});

test('rejects a due analytics run',()=>{
  assert.throws(()=>buildNoWorkReceipt(log.replace('"due":false','"due":true'),{head,source_cloud_run:'1'}),/EXACT_NOT_DUE/);
});

test('rejects a trigger-bearing run',()=>{
  assert.throws(()=>buildNoWorkReceipt(log.replace('NO_FRESH_EXACT_SENT_TRIGGER','CLAIMED'),{head,source_cloud_run:'1'}),/EXACT_NO_FRESH_TRIGGER/);
});

test('rejects head or cloud-run mismatch',()=>{
  const receipt=buildNoWorkReceipt(log,{head,source_cloud_run:'38011772185'});
  assert.throws(()=>auditNoWorkReceipt({receipt,expected_head:'b'.repeat(40),expected_cloud_run:'38011772185'}),/BINDING/);
  assert.throws(()=>auditNoWorkReceipt({receipt,expected_head:head,expected_cloud_run:'2'}),/BINDING/);
});

test('verifier accepts an exact no-work artifact without canonical report',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'report2-no-work-'));
  const receipt=buildNoWorkReceipt(log,{head,source_cloud_run:'38011772185'});
  fs.writeFileSync(path.join(dir,'report2-no-work-receipt.json'),JSON.stringify(receipt));
  execFileSync(process.execPath,['tools/verify-same-run-delivery-artifact.mjs',dir,head,'38011772185']);
  const audit=JSON.parse(fs.readFileSync(path.join(dir,'automatic-delivery-audit.json')));
  assert.equal(audit.status,'EXACT_NO_WORK_NOT_DUE_NO_FRESH_TRIGGER_VERIFIED');
  fs.rmSync(dir,{recursive:true,force:true});
});
