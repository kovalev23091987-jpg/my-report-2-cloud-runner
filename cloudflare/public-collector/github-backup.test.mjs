import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runBackupCollector,loadExactCollector} from './github-backup.mjs';

const BUCKET=Date.UTC(2026,8,29,11,0);
const fake=row=>({prepare(){return{bind(){return{first:async()=>row}}}}});
test('backup loads the same bounded collector tail as the deployed primary',()=>{
  const source=fs.readFileSync(new URL('./injected-worker-tail.js',import.meta.url),'utf8');
  assert.equal(typeof loadExactCollector(source),'function');
  assert.match(source,/report2-public-collector-v9-retained-price-checks-20261009/);
});
test('backup skips a completed primary without contacting public APIs',async()=>{
  let count=0,clock=BUCKET+3*60_000;
  const result=await runBackupCollector({db:fake({state:'CLOSED'}),now:()=>clock,sleep:async ms=>{clock+=ms},collector:async()=>{count++}});
  assert.equal(result.status,'PRIMARY_CLOSED');assert.equal(count,0);
});
test('a completed primary is inspected at the first minute without waiting until the third minute',async()=>{
 let clock=BUCKET+60_000,sleeps=0,calls=0;const r=await runBackupCollector({db:fake({state:'CLOSED'}),now:()=>clock,sleep:async ms=>{sleeps++;clock+=ms;},collector:async()=>{calls++;}});assert.equal(r.status,'PRIMARY_CLOSED');assert.equal(sleeps,0);assert.equal(calls,0);assert.equal(clock,BUCKET+60_000);
});
test('primary completion during the bounded wait is read back before a backup attempt',async()=>{
 let clock=BUCKET+60_000,reads=0,calls=0;const db={prepare(){return {bind(){return {first:async()=>++reads===1?{state:'STARTED',lease_until:BUCKET+190_000}:{state:'CLOSED'}}}}}};
 const r=await runBackupCollector({db,now:()=>clock,sleep:async ms=>{clock+=ms;},collector:async()=>{calls++;}});assert.equal(r.status,'PRIMARY_CLOSED');assert.equal(reads,2);assert.equal(calls,0);assert.equal(clock,BUCKET+180_000);
});
test('backup reclaims only the same live slot after the primary lease expires',async()=>{
  let clock=BUCKET+3*60_000,seen=null;
  const result=await runBackupCollector({db:fake({state:'STARTED',lease_until:BUCKET+3*60_000+10_000}),now:()=>clock,sleep:async ms=>{clock+=ms},collector:async(controller,env)=>{seen={controller,env}}});
  assert.equal(result.status,'BACKUP_ATTEMPTED');assert.equal(seen.controller.scheduledTime,BUCKET);
  assert.equal(seen.env.DELIVERY_ENABLED,'0');assert.equal(seen.env.CALIBRATION_APPLY_ENABLED,'0');
  assert.equal(clock,BUCKET+3*60_000+11_000);
});
test('backup refuses expired and overlong leases',async()=>{
  let count=0;
  const collector=async()=>{count++};
  const late=await runBackupCollector({db:fake(null),now:()=>BUCKET+4*60_000+30_000,collector});
  const lease=await runBackupCollector({db:fake({state:'STARTED',lease_until:BUCKET+5*60_000}),now:()=>BUCKET+3*60_000,collector});
  assert.equal(late.status,'SLOT_TOO_LATE');assert.equal(lease.status,'PRIMARY_LEASE_UNSAFE');assert.equal(count,0);
});

