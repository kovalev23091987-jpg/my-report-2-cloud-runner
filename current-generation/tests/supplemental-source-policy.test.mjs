import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MONTHLY_DEEP_CHECKS,
  SUPPLEMENTAL_SOURCES,
  SOURCE_RESPONSIBILITY_GROUPS,
  sourceBudgetView,
  paidCoinLobsterMonthlyCredits,
  rotatingLane,
  validateSupplementalRequest,
  responsibilityForSource,
  policyForSource,
  dedupeSupplementalFacts,
  SUPPLEMENTAL_D1_WORST_PER_RUN,
  D1_BURST_RESERVATION,
} from '../files/src/supplemental-source-policy.mjs';

test('31 day budget includes 72 scheduled, three reports and five coin analyses daily', () => {
  assert.equal(MAX_MONTHLY_DEEP_CHECKS, 2480);
});

test('rotating liquidation lanes preserve the 50 request hot envelope', () => {
  const view = sourceBudgetView();
  assert.deepEqual(view.hot_request_budget, { existing:44, supplemental_lane_max:5, reserve:1, limit:50 });
  for (const id of ['LIGHTER','GMX','GTRADE','LIQFLOW_HL_NATIVE']) {
    const row = view.rows.find(x => x.id === id);
    assert.ok(row.worst_case_monthly_calls <= 3220);
  }
  const liqflow = view.rows.find(x => x.id === 'LIQFLOW_HL_NATIVE');
  assert.equal(liqflow.within_known_monthly_quota, true);
  assert.ok(liqflow.provider_quota_headroom > 46_000);
});

test('0xArchive requires its key and then uses the official one-credit bounded route', () => {
  const result=validateSupplementalRequest({source_id:'OXARCHIVE',request_count:1});
  assert.equal(result.allowed,false);
  assert.equal(result.reason,'API_KEY_REQUIRED');
  assert.equal(validateSupplementalRequest({source_id:'OXARCHIVE',request_count:1,secret_configured:true}).allowed,true);
  assert.equal(SUPPLEMENTAL_SOURCES.OXARCHIVE.credits_per_assigned_run,1);
  assert.equal(SUPPLEMENTAL_SOURCES.OXARCHIVE.module_monthly_credit_cap,5000);
});

test('CoinLobster keyless layer is admitted while paid worst-case credit use is explicit', () => {
  assert.equal(validateSupplementalRequest({source_id:'COINLOBSTER',request_count:2}).allowed,true);
  assert.equal(paidCoinLobsterMonthlyCredits({callsPerReport:2,creditsPerCall:50}),248000);
  assert.equal(SUPPLEMENTAL_SOURCES.COINLOBSTER.free_key_monthly_credits,250);
  const row=sourceBudgetView().rows.find(x=>x.id==='COINLOBSTER');
  assert.equal(row.worst_case_monthly_calls,2976);
});

test('supplemental D1 rows fit both per-run burst and 80-run daily budget with wide margin',()=>{
  const view=sourceBudgetView().d1_incremental_budget;
  assert.deepEqual(SUPPLEMENTAL_D1_WORST_PER_RUN,{rows_read:8,rows_written:8});
  assert.ok(view.rows_read<D1_BURST_RESERVATION.rows_read);
  assert.ok(view.rows_written<D1_BURST_RESERVATION.rows_written);
  assert.equal(view.projected_daily_rows_read,640);
  assert.equal(view.projected_daily_rows_written,640);
  assert.ok(view.projected_daily_rows_read<3_500_000);
  assert.ok(view.projected_daily_rows_written<70_000);
});

test('Deribit hourly background uses four calls and 2976 monthly calls at 31 days',()=>{
  const row=sourceBudgetView().rows.find(x=>x.id==='DERIBIT');
  assert.equal(row.worst_case_monthly_calls,2976);
  assert.equal(row.directional_vote,false);
});

test('onchain and DEX sources require exact asset identity', () => {
  assert.equal(validateSupplementalRequest({source_id:'GOPLUS',request_count:1}).reason,'EXACT_ASSET_IDENTITY_REQUIRED');
  assert.equal(validateSupplementalRequest({source_id:'GOPLUS',request_count:1,exact_identity:true}).allowed,true);
  assert.equal(validateSupplementalRequest({source_id:'DEX_PAIR',request_count:2,exact_identity:true}).allowed,true);
});

test('Bitget remains conditional instead of duplicating every run', () => {
  assert.equal(SUPPLEMENTAL_SOURCES.BITGET.disposition,'CONDITIONAL_CROSS_VENUE_FALLBACK');
  assert.equal(validateSupplementalRequest({source_id:'BITGET',request_count:3}).reason,'SOURCE_CONDITION_NOT_CLOSED');
  assert.equal(validateSupplementalRequest({source_id:'BITGET',request_count:3,condition_closed:true}).allowed,true);
});

test('rotation uses LiqFlow during the public pilot or with its later key', () => {
  assert.equal(rotatingLane(3,{liqflowAvailable:false}),'LIGHTER');
  assert.equal(rotatingLane(3,{liqflowAvailable:true}),'LIQFLOW_HL_NATIVE');
  assert.equal(rotatingLane(3,{liqflowKeyConfigured:true}),'LIQFLOW_HL_NATIVE');
});

test('all fourteen requested sources have exactly one primary responsibility',()=>{
  const ids=Object.values(SOURCE_RESPONSIBILITY_GROUPS).flatMap(x=>x.sources);
  assert.equal(ids.length,14);assert.equal(new Set(ids).size,14);
  for(const id of ids){assert.ok(responsibilityForSource(id));assert.ok(policyForSource(id));}
});

test('same-family duplicate facts cannot multiply influence',()=>{
  const rows=dedupeSupplementalFacts([
    {source_id:'DEX_PAIR',contract:'FIL-USDT',metric_family:'DEX_ACTIVITY',pool_key:'solana:x'},
    {source_id:'SOLANA_RPC',contract:'FIL-USDT',metric_family:'DEX_ACTIVITY',pool_key:'solana:x'},
    {source_id:'COINLOBSTER',contract:'FIL-USDT',metric_family:'WHALE_FLOW'},
  ]);
  assert.equal(rows.length,2);
});
