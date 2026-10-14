import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {nativeSectorValidationPlan,reserveNativeSectorValidationBatch} from '../../tools/native-sector-validation-admission-20261014.mjs';
const now=1791980500000,day='2026-10-14';
function db(){const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,state TEXT,started_ts INTEGER,unknown_ops INTEGER)');return{raw,prepare(sql){return{bind(...args){this.args=args;return this;},async run(){return{meta:{changes:raw.prepare(sql).run(...this.args).changes}};}};}};}
const reserve=(d,batch,n)=>reserveNativeSectorValidationBatch(d,{batch,id:`NATIVE_SECTOR_VALIDATE:${batch}:${n}:1`,now});
test('both disjoint missing batches share one day family and preserve all original reservations',async()=>{
 const d=db();try{assert.equal(await reserve(d,'INITIAL_NATIVE4',1),true);assert.equal(await reserve(d,'INITIAL_NATIVE4',2),false);assert.equal(await reserve(d,'REMAINING_NATIVE7',3),true);assert.equal(await reserve(d,'REMAINING_NATIVE7',4),false);assert.equal(await reserve(d,'INITIAL_NATIVE4',5),false);assert.deepEqual({...d.raw.prepare('SELECT COUNT(*) AS count,SUM(reserve_rows_read) AS reads,SUM(reserve_rows_written) AS writes FROM report2_runner_budget_ledger_shadow').get()},{count:2,reads:16000,writes:800});}finally{d.raw.close();}
});
test('the already completed legacy initial4 counts and cannot be repeated under a new label',async()=>{
 const d=db();try{d.raw.prepare("INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,?,8000,400,'FINALIZED',?,0)").run('NATIVE_SECTOR_VALIDATE:38563182999:1',day,now-1000);assert.equal(await reserve(d,'INITIAL_NATIVE4',1),false);assert.equal(await reserve(d,'REMAINING_NATIVE7',2),true);assert.equal(await reserve(d,'REMAINING_NATIVE7',3),false);assert.equal(d.raw.prepare('SELECT reserve_rows_read FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?').get('NATIVE_SECTOR_VALIDATE:38563182999:1').reserve_rows_read,8000);}finally{d.raw.close();}
});
test('remaining7 requires the original batch and budget exhaustion or unknown usage forbids admission',async()=>{
 for(const mode of ['NO_INITIAL','READ_CAP','WRITE_CAP','UNKNOWN']){
  const d=db();try{if(mode!=='NO_INITIAL')d.raw.prepare("INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,?,?,?, 'FINALIZED',?,?)").run('NATIVE_SECTOR_VALIDATE:100:1',day,mode==='READ_CAP'?3500000:8000,mode==='WRITE_CAP'?70000:400,now-1000,mode==='UNKNOWN'?1:0);assert.equal(await reserve(d,'REMAINING_NATIVE7',2),false,mode);}finally{d.raw.close();}
 }
 const a=nativeSectorValidationPlan(),b=nativeSectorValidationPlan('REMAINING_NATIVE7');assert.equal(a.symbols.length,4);assert.equal(b.symbols.length,7);assert.equal(a.symbols.some(s=>b.symbols.includes(s)),false);assert.ok(b.cold_scheduled_D1_with_two_once_batches.rows_read<3500000&&b.cold_scheduled_D1_with_two_once_batches.rows_written<70000);assert.throws(()=>nativeSectorValidationPlan('ALIAS'),/EXACT_MISSING_BATCH_REQUIRED/);
});
