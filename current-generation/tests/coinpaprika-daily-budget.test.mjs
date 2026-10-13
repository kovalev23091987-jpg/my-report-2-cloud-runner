import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_POLICIES} from '../files/src/evidence-source-adapters.mjs';
import {PAUSED_BLOCKS} from '../files/src/evidence-v2.mjs';
import {TWO_CANDIDATE_PLAN} from '../files/src/two-candidate-policy.mjs';
import {BYK_PLAN,HTTP_LIMITS} from '../files/src/unified-budget.mjs';

test('approved CoinPaprika budget covers both finalists and manual reserve inside the free monthly allowance',()=>{
 const sector=SOURCE_POLICIES.COINPAPRIKA_SECTOR,identity=SOURCE_POLICIES.COINPAPRIKA_HTX_IDENTITY;
 assert.ok(PAUSED_BLOCKS.N02,'Restoring supply requires recalculating its extra ticker route');
 const invocations=TWO_CANDIDATE_PLAN.scheduled_cycles_per_day+Math.max(TWO_CANDIDATE_PLAN.manual_full_commands_per_day,BYK_PLAN.categories.manual_full.daily)+TWO_CANDIDATE_PLAN.manual_coin_commands_per_day+TWO_CANDIDATE_PLAN.burst_deep_checks_per_day;
 const requests=invocations*2*5; // Cold catalogs, metadata, directory, members and quotes; no cache saving assumed.
 assert.equal(invocations,50);assert.equal(requests,500);assert.ok(sector.daily_cap>=requests);
 assert.equal(sector.monthly_module_bound,sector.daily_cap*31);
 assert.ok((sector.daily_cap+identity.daily_cap)*31<=sector.official_free_monthly_requests);
 assert.equal((sector.daily_cap+identity.daily_cap)*31,16244);
 assert.equal(HTTP_LIMITS.whole_job,164);assert.equal(TWO_CANDIDATE_PLAN.scheduled_interval_minutes,40);
 assert.equal(SOURCE_POLICIES.COINGECKO_SECTOR.daily_cap,48);assert.equal(identity.daily_cap,12);
});
