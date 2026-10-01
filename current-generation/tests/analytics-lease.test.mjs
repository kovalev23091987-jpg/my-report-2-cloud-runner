import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {installRuntimeControl,claimAnalyticsLease,assertAnalyticsFence,renewAnalyticsLease,finishAnalyticsLease,putImmutableSnapshot} from '../files/src/analytics-lease.mjs';

class D1Statement{
  constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}
  bind(...args){return new D1Statement(this.db,this.sql,args);}
  async run(){return this.db.sqlite.prepare(this.sql).run(...this.args);}
  async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}
}
class D1{constructor(){this.sqlite=new DatabaseSync(':memory:');}prepare(sql){return new D1Statement(this,sql);}async batch(rows){this.sqlite.exec('BEGIN IMMEDIATE');try{const out=[];for(const row of rows)out.push(await row.run());this.sqlite.exec('COMMIT');return out;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}}

test('K02: two simultaneous analytics actors receive at most one lease',async()=>{
  const db=new D1();await installRuntimeControl(db);
  const [a,b]=await Promise.all([
    claimAnalyticsLease(db,{actor:'GITHUB_ACTIONS',generation:'G',run_id:'A',now:1000}),
    claimAnalyticsLease(db,{actor:'GITHUB_ACTIONS',generation:'G',run_id:'B',now:1000}),
  ]);
  assert.equal([a,b].filter(x=>x.claimed).length,1);
});

test('K02: an expired fencing token cannot renew, finish or authorize writes',async()=>{
  const db=new D1();await installRuntimeControl(db);
  const old=await claimAnalyticsLease(db,{actor:'GITHUB_ACTIONS',generation:'G',run_id:'OLD',now:1000,lease_ms:10});
  const fresh=await claimAnalyticsLease(db,{actor:'GITHUB_ACTIONS',generation:'G',run_id:'NEW',now:1011,lease_ms:100});
  assert.equal(fresh.claimed,true);
  assert.equal((await assertAnalyticsFence(db,old,{now:1012})).allowed,false);
  assert.equal((await renewAnalyticsLease(db,old,{now:1012})).allowed,false);
  assert.equal((await finishAnalyticsLease(db,old,{now:1012})).finished,false);
  assert.equal((await assertAnalyticsFence(db,fresh,{now:1012})).allowed,true);
});

test('K02: immutable snapshot repeats are no-op and changed payload conflicts',async()=>{
  const db=new D1();await installRuntimeControl(db);
  const key={actor:'HUB_PUBLIC_COLLECTOR',generation:'G',bucket:10,shard:0,payload_json:'{}'};
  assert.equal((await putImmutableSnapshot(db,{...key,payload_hash:'aaa'})).status,'STORED_OR_IDENTICAL_NOOP');
  assert.equal((await putImmutableSnapshot(db,{...key,payload_hash:'aaa'})).status,'STORED_OR_IDENTICAL_NOOP');
  assert.equal((await putImmutableSnapshot(db,{...key,payload_hash:'bbb'})).status,'IMMUTABLE_SNAPSHOT_CONFLICT');
});

test('K02: runner releases a claimed analytics lease before fatal exit',()=>{
  const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
  const catchStart=runner.indexOf('main().catch(async(error) =>');
  const cleanupAwait=runner.indexOf('await cleanupClaimedAnalyticsLease()',catchStart);
  const exitCode=runner.indexOf('process.exitCode=1',catchStart);
  assert.ok(catchStart>0,'fatal handler must be asynchronous');
  assert.ok(cleanupAwait>catchStart,'fatal handler must await analytics lease cleanup');
  assert.ok(exitCode>cleanupAwait,'failure status must be set only after cleanup');
  assert.equal(runner.includes('process.exit(1)'),false,'runner must not terminate before asynchronous cleanup');
});
