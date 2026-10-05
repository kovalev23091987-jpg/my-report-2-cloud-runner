import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {installSourceAllowances} from '../files/src/liquidation-extension/install-source-allowances.mjs';
class Statement{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}bind(...args){return new Statement(this.db,this.sql,args);}async run(){const d=this.db.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(d.changes)}};}}
const T=Date.parse('2026-10-05T20:43:00Z');
function database(){const raw=new DatabaseSync(':memory:');return {raw,prepare:s=>new Statement(raw,s),batch:async a=>{raw.exec('BEGIN');try{const r=[];for(const s of a)r.push(await s.run());raw.exec('COMMIT');return r;}catch(e){raw.exec('ROLLBACK');throw e;}}};}
test('bounded source setup preserves used units and every unrequested provider',async()=>{
 const db=database(),all=await installSourceAllowances({db,now:T});assert.equal(all.providers.length,5);
 db.raw.prepare('UPDATE report2_liq_source_allowance_shadow SET used_units=123,version=7 WHERE provider=?').run('HYPERLIQUID');
 db.raw.prepare('UPDATE report2_liq_source_allowance_shadow SET used_units=9,version=3 WHERE provider=?').run('GTRADE');
 const before=db.raw.prepare('SELECT * FROM report2_liq_source_allowance_shadow WHERE provider=?').get('HYPERLIQUID');
 const one=await installSourceAllowances({db,now:T+1000,provider_filter:['GTRADE']});assert.deepEqual(one.providers,['GTRADE']);assert.deepEqual(Object.keys(one.bindings),['GTRADE']);
 assert.deepEqual(db.raw.prepare('SELECT * FROM report2_liq_source_allowance_shadow WHERE provider=?').get('HYPERLIQUID'),before);
 const g=db.raw.prepare('SELECT used_units,version,allowance_units FROM report2_liq_source_allowance_shadow WHERE provider=?').get('GTRADE');assert.equal(g.used_units,9);assert.equal(g.version,3);assert.equal(g.allowance_units,4000);
 const indexes=db.raw.prepare('PRAGMA index_list(report2_liq_source_reservation_shadow)').all();assert.ok(indexes.some(i=>i.name==='idx_report2_liq_reservation_provider_time'));
 const plan=db.raw.prepare('EXPLAIN QUERY PLAN SELECT SUM(reserved_units) FROM report2_liq_source_reservation_shadow WHERE provider=? AND created_ts>=? AND created_ts<?').all('GTRADE',T-1000,T+1000);assert.ok(plan.some(i=>i.detail.includes('idx_report2_liq_reservation_provider_time')));
});
test('unconfigured, duplicate or empty source filters cannot create new allowances',async()=>{
 for(const provider_filter of [[],['GTRADE','GTRADE'],['UNREVIEWED'],['OXARCHIVE']])await assert.rejects(installSourceAllowances({db:database(),now:T,provider_filter}),/SOURCE_ALLOWANCE_PROVIDER_FILTER_INVALID/);
});

test('old generation usage is reconciled once without double scanning or reducing counters',async()=>{
 const db=database();const setup=await installSourceAllowances({db,now:T,provider_filter:['GTRADE']});
 const scope=setup.bindings.GTRADE.scope_id;
 db.raw.prepare('INSERT INTO report2_liq_source_reservation_shadow VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('old',scope,'GTRADE','BTC-USDT','prior',21,0,1,T-1000,'f','RESERVED_NOT_REFUNDED');
 const queries=[];const prepare=db.prepare;db.prepare=sql=>{queries.push(sql);return prepare(sql);};
 await installSourceAllowances({db,now:T,provider_filter:['GTRADE']});
 assert.equal(db.raw.prepare('SELECT used_units FROM report2_liq_source_allowance_shadow WHERE scope_id=?').get(scope).used_units,21);
 const query=queries.find(q=>q.includes('WITH prior'));assert.ok(query);
 const plan=db.raw.prepare('EXPLAIN QUERY PLAN '+query).all(scope,'GTRADE',Date.parse('2026-10-01T00:00:00Z'),Date.parse('2026-11-01T00:00:00Z'));
 assert.equal(plan.filter(p=>p.detail.includes('SEARCH report2_liq_source_reservation_shadow')).length,1);
 await installSourceAllowances({db,now:T+1000,provider_filter:['GTRADE']});
 assert.equal(db.raw.prepare('SELECT used_units,version FROM report2_liq_source_allowance_shadow WHERE scope_id=?').get(scope).version,1);
});
