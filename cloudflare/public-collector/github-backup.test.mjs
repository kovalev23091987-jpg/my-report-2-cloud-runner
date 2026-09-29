import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runBackupCollector,loadExactCollector} from './github-backup.mjs';

const BUCKET=Date.UTC(2026,8,29,11,0);
const fake=row=>({prepare(){return{bind(){return{first:async()=>row}}}}});
test('backup loads the same bounded collector tail as the deployed primary',()=>{
  const source=fs.readFileSync(new URL('./injected-worker-tail.js',import.meta.url),'utf8');
  assert.equal(typeof loadExactCollector(source),'function');
  assert.match(source,/report2-public-collector-v5-backup-lease-20260929/);
});
test('backup skips a completed primary without contacting public APIs',async()=>{
  let count=0,clock=BUCKET+3*60_000;
  const result=await runBackupCollector({db:fake({state:'CLOSED'}),now:()=>clock,sleep:async ms=>{clock+=ms},collector:async()=>{count++}});
  assert.equal(result.status,'PRIMARY_CLOSED');assert.equal(count,0);
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
