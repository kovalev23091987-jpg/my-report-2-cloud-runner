import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,ensureSourceSchemaOnce} from '../files/src/evidence-source-store.mjs';
import {installProviderMinuteLedger,reserveProviderMinuteUnits} from '../files/src/provider-minute-ledger.mjs';
class DB{
 constructor(){this.raw=new DatabaseSync(':memory:');this.ddl=0;this.batches=0;this.unknown=0;this.fail=false;}
 usageSnapshot(){return{unknown_ops:this.unknown};}
 prepare(sql){const db=this;let args=[];return{bind(...a){args=a;return this;},async run(){if(/^CREATE/.test(sql)){db.ddl++;if(db.fail){db.fail=false;throw new TypeError('controlled connection loss');}}const r=db.raw.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};},async first(){return db.raw.prepare(sql).get(...args)??null;}};}
 async batch(rows){this.batches++;return Promise.all(rows.map(r=>r.run()));}
}
test('two simultaneous callers install one schema, then real quota reservations retain the original combined caps',async()=>{
 const db=new DB();await Promise.all([installEvidenceSourceStore(db),installEvidenceSourceStore(db)]);await Promise.all([installProviderMinuteLedger(db),installProviderMinuteLedger(db)]);assert.equal(db.ddl,8);assert.equal(db.batches,1);
 await installEvidenceSourceStore(db);await installProviderMinuteLedger(db);assert.equal(db.ddl,8);
 const now=1791920400000,a=await reserveEvidenceSourceAttempts(db,{source:'SOURCE',reservation_id:'a',attempts:3,daily_cap:5,now}),b=await reserveEvidenceSourceAttempts(db,{source:'SOURCE',reservation_id:'b',attempts:3,daily_cap:5,now});assert(a.allowed);assert(!b.allowed);
 const c=await reserveProviderMinuteUnits(db,{provider:'COINGECKO',reservation_id:'c',units:5,cap:9,now}),d=await reserveProviderMinuteUnits(db,{provider:'COINGECKO',reservation_id:'d',units:5,cap:9,now});assert(c.allowed);assert(!d.allowed);db.raw.close();
});
test('a failed installation is never remembered as ready and a distinct database must install independently',async()=>{
 const first=new DB();first.fail=true;await assert.rejects(installProviderMinuteLedger(first));await installProviderMinuteLedger(first);const count=first.ddl;await installProviderMinuteLedger(first);assert.equal(first.ddl,count);
 const second=new DB();await installProviderMinuteLedger(second);assert.equal(second.ddl,3);assert.notEqual(first.raw,second.raw);first.raw.close();second.raw.close();
});
test('an ambiguous native acknowledgment cannot produce remembered schema readiness or refund its unknown operation',async()=>{
 const db=new DB();let calls=0;const install=async()=>{calls++;db.unknown++;};
 await assert.rejects(ensureSourceSchemaOnce(db,'ambiguous',install),/NATIVE_USAGE_NOT_CLOSED/);await assert.rejects(ensureSourceSchemaOnce(db,'ambiguous',install),/NATIVE_USAGE_NOT_CLOSED/);assert.equal(calls,2);assert.equal(db.unknown,2);db.raw.close();
});
