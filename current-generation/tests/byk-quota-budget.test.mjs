import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BYK_OFFICIAL_MONTHLY_QUOTA,
  BYK_OPERATIONAL_MONTHLY_CAP,
  BYK_SCHEDULED_MONTHLY_CAP,
  BYK_MAX_REQUESTS_PER_DEEP_CHECK,
  evaluateBykQuotaAdmission,
  installBykQuotaLedger,
} from '../files/byk-quota-budget.mjs';

test('quota constants preserve official headroom and a manual reserve',()=>{
 assert.equal(BYK_OFFICIAL_MONTHLY_QUOTA,15000);
 assert.equal(BYK_OPERATIONAL_MONTHLY_CAP,13500);
 assert.equal(BYK_SCHEDULED_MONTHLY_CAP,12900);
 assert.equal(BYK_MAX_REQUESTS_PER_DEEP_CHECK,5);
 assert.equal(BYK_OPERATIONAL_MONTHLY_CAP-BYK_SCHEDULED_MONTHLY_CAP,600);
 assert.equal(BYK_OFFICIAL_MONTHLY_QUOTA-BYK_OPERATIONAL_MONTHLY_CAP,1500);
});

test('scheduled runs stop at their cap while manual runs can use the reserve',()=>{
 assert.equal(evaluateBykQuotaAdmission({source:'schedule',units:5,used_total:12900,used_scheduled:12900}).status,'SCHEDULED_MONTHLY_CAP_EXHAUSTED');
 assert.equal(evaluateBykQuotaAdmission({source:'manual',units:5,used_total:12900,used_scheduled:12900}).allowed,true);
});

test('all sources stop at the operational cap before the official quota',()=>{
 for(const source of ['schedule','manual']){
  const result=evaluateBykQuotaAdmission({source,units:5,used_total:13500,used_scheduled:0});
  assert.equal(result.allowed,false);
  assert.equal(result.status,'OPERATIONAL_MONTHLY_CAP_EXHAUSTED');
 }
});

test('a reservation can never exceed one deep-check maximum',()=>{
 for(const units of [0,6,1.5,NaN])assert.equal(evaluateBykQuotaAdmission({source:'manual',units}).status,'INVALID_REQUEST_UNITS');
});

test('quota ledger installation sends complete DDL statements through one batch',async()=>{
 const seen=[];
 const db={
  prepare(sql){return {sql};},
  async batch(statements){seen.push(...statements.map(x=>x.sql));return [];},
  async exec(){throw new Error('MULTI_STATEMENT_EXEC_MUST_NOT_BE_USED');},
 };
 await installBykQuotaLedger(db);
 assert.equal(seen.length,3);
 assert.match(seen[0],/^CREATE TABLE IF NOT EXISTS report2_byk_monthly_usage\([\s\S]+\)$/);
 assert.match(seen[1],/^CREATE TABLE IF NOT EXISTS report2_byk_reservations\([\s\S]+\)$/);
 assert.match(seen[2],/^CREATE INDEX IF NOT EXISTS idx_report2_byk_reservations_month[\s\S]+\)$/);
});
