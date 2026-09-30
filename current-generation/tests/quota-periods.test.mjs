import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {utcMonthKey,installBykQuotaLedger,makeBykReserve} from '../files/byk-quota-budget.mjs';
import {installProviderMinuteLedger,reserveProviderMinuteUnits} from '../files/src/provider-minute-ledger.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts} from '../files/src/evidence-source-store.mjs';
import {installSourceAllowances} from '../files/src/liquidation-extension/install-source-allowances.mjs';
function database(){const sql=new DatabaseSync(':memory:');return{sql,prepare(query){return{args:[],bind(...args){this.args=args;return this;},async run(){const r=sql.prepare(query).run(...this.args);return{success:true,meta:{changes:Number(r.changes)}};},async first(){return sql.prepare(query).get(...this.args)||null;}};},async batch(statements){sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};}
const midnight=Date.parse('2026-10-01T00:00:00Z');
test('internal UTC monthly reset is 03:00 owner local time, not local midnight',()=>{
 assert.equal(utcMonthKey(Date.parse('2026-10-01T00:00:00+03:00')),'2026-09');
 assert.equal(utcMonthKey(Date.parse('2026-10-01T02:59:59.999+03:00')),'2026-09');
 assert.equal(utcMonthKey(Date.parse('2026-10-01T03:00:00+03:00')),'2026-10');
});
test('exhausted Byk internal September balance stays exhausted until UTC boundary and is preserved in October',async()=>{
 const db=database();await installBykQuotaLedger(db);let now=midnight-1;const reserve=makeBykReserve(db,{source:'manual',clock:()=>now});await reserve({contract:'TAO-USDT',run_id:'SEED',units:1});db.sql.prepare("UPDATE report2_byk_monthly_usage SET used_total=13500,used_manual=13500 WHERE month_key='2026-09'").run();
 assert.equal((await reserve({contract:'TAO-USDT',run_id:'DENIED',units:1})).allowed,false);
 now=midnight;const fresh=await reserve({contract:'TAO-USDT',run_id:'NEW_MONTH',units:1});assert.equal(fresh.allowed,true);assert.equal(fresh.month_key,'2026-10');assert.equal(fresh.usage.used_total,1);assert.equal(db.sql.prepare("SELECT used_total FROM report2_byk_monthly_usage WHERE month_key='2026-09'").get().used_total,13500);db.sql.close();
});
test('rolling sixty-second quota crosses the calendar boundary without resetting',async()=>{
 const db=database();await installProviderMinuteLedger(db);const reserve=(id,now,units)=>reserveProviderMinuteUnits(db,{provider:'COINALYZE',reservation_id:id,units,now,cap:30});
 assert.equal((await reserve('BEFORE',midnight-15000,30)).allowed,true);assert.equal((await reserve('AT_MIDNIGHT',midnight,1)).status,'ROLLING_60S_CAP_REACHED');assert.equal((await reserve('STILL_ROLLING',midnight+44999,1)).allowed,false);assert.equal((await reserve('AFTER_60_SECONDS',midnight+45000,1)).allowed,true);db.sql.close();
});
test('daily source ceiling creates a new UTC day without refunding previous charged attempts',async()=>{
 const db=database();await installEvidenceSourceStore(db);const reserve=(id,now)=>reserveEvidenceSourceAttempts(db,{source:'FIXTURE_DAILY',reservation_id:id,attempts:2,daily_cap:2,now});assert.equal((await reserve('DAY1',midnight-1)).allowed,true);assert.equal((await reserve('DAY1_FULL',midnight-1)).allowed,false);assert.equal((await reserve('DAY2',midnight)).allowed,true);const rows=db.sql.prepare('SELECT day_utc,attempts FROM report2_evidence_source_daily ORDER BY day_utc').all();assert.deepEqual(rows.map(r=>[r.day_utc,r.attempts]),[['2026-09-30',2],['2026-10-01',2]]);db.sql.close();
});
test('native monthly operational allowance rollover preserves old spend and does not change any provider cap',async()=>{
 const db=database(),old=await installSourceAllowances({db,now:midnight-1});const oldScope=old.bindings.HYPERLIQUID.scope_id;db.sql.prepare('UPDATE report2_liq_source_allowance_shadow SET used_units=allowance_units WHERE scope_id=?').run(oldScope);await installSourceAllowances({db,now:midnight-1});assert.equal(db.sql.prepare('SELECT used_units FROM report2_liq_source_allowance_shadow WHERE scope_id=?').get(oldScope).used_units,10000);
 const next=await installSourceAllowances({db,now:midnight});assert.notEqual(next.bindings.HYPERLIQUID.scope_id,oldScope);assert.equal(next.window_start_ts,midnight);assert.deepEqual(next.provider_operational_caps,old.provider_operational_caps);assert.equal(db.sql.prepare('SELECT used_units FROM report2_liq_source_allowance_shadow WHERE scope_id=?').get(next.bindings.HYPERLIQUID.scope_id).used_units,0);assert.equal(next.automatic_topup,false);db.sql.close();
});
