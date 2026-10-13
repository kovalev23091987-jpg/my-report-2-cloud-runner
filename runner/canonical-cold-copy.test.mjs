import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {CANONICAL_COPY_POLICY,canonicalCopyCandidates,reserveCanonicalCopyBudget,copyCanonicalReport,canonicalProducerInMainHistory} from './canonical-cold-copy.mjs';
const T=1791920400000,H='a'.repeat(40),R='saved-original-run';
function row(ch='a'){
 const publication_id='PUB:'+ch.repeat(40),contract_code=ch==='a'?'APR-USDT':'STRK-USDT',snapshot_id='S392:'+contract_code+':'+T,analytical_fingerprint=ch.repeat(64);
 const canonical={contract:contract_code,run_id:R,snapshot_id,observed_ts:T,analytical_fingerprint};
 return{publication_id,run_id:R,snapshot_id,contract_code,observed_ts:T,analytical_fingerprint,canonical_json:JSON.stringify(canonical),presentation_inputs_json:'{"original":"yes"}',telegram_text:'original delivered text',manual_text:'original report text',extra_column:'preserve unknown original columns'};
}
function report(){return{status:'CLOSED',head:H,run_id:R,candidates:['a','b'].map(ch=>{const r=row(ch);return{...r,contract:r.contract_code,canonical:JSON.parse(r.canonical_json)};})};}
function db(sql){const raw=new DatabaseSync(':memory:');raw.exec(sql);const usage={requests:0,rows_read:0,rows_written:0,unknown_ops:0};return{raw,storage_bytes:1000,usageSnapshot:()=>({...usage}),prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){usage.requests++;const r=raw.prepare(sql).get(...args);usage.rows_read+=r?1:0;return r??null;},async run(){usage.requests++;const r=raw.prepare(sql).run(...args);usage.rows_written+=Number(r.changes);return{meta:{changes:Number(r.changes)}};}};},async query(sql){const r=await this.prepare(sql).first();return{results:[r]};}};}
const ledger='CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,state TEXT,started_ts INTEGER,unknown_ops INTEGER);';
test('a later main commit preserves an original producer revision only after exact ancestry proof; forks and unknown revisions fail closed',()=>{
 const later='b'.repeat(40);assert(canonicalProducerInMainHistory({producer_head:H,main_head:H}));assert(canonicalProducerInMainHistory({producer_head:H,main_head:later,comparison:{status:'ahead',merge_base_commit:{sha:H}}}));
 for(const comparison of [null,{status:'diverged',merge_base_commit:{sha:H}},{status:'ahead',merge_base_commit:{sha:later}},{status:'behind',merge_base_commit:{sha:H}}])assert(!canonicalProducerInMainHistory({producer_head:H,main_head:later,comparison}));
});
test('a saved report must bind every publication before any private copy; no stale, duplicate or over-two adoption',()=>{
 assert.equal(canonicalCopyCandidates(report(),H).candidates.length,2);
 for(const alter of [r=>r.head='c'.repeat(40),r=>r.status='NOT_DUE',r=>r.candidates[1].run_id='other',r=>r.candidates[1].publication_id=r.candidates[0].publication_id,r=>r.candidates[1].canonical.snapshot_id='other',r=>r.candidates.push(r.candidates[0])]){const r=report();alter(r);assert.equal(canonicalCopyCandidates(r,H).candidates.length,0);}
});
test('atomic source-account reservation cannot race another caller, repeat a run or spend past the daily archive pool',async()=>{
 const d=db(ledger),day=new Date(T).toISOString().slice(0,10);
 d.raw.prepare('INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,?,?,?,?,?,?)').run('existing',day,3500000-CANONICAL_COPY_POLICY.reservation.rows_read,100,'RESERVED',T,0);
 const [a,b]=await Promise.all([1,2].map(n=>reserveCanonicalCopyBudget(d,{reservation_id:'CANONICAL_COLD_COPY:'+n+':1',now:T})));assert.equal(Number(a.allowed)+Number(b.allowed),1);assert.equal((await reserveCanonicalCopyBudget(d,{reservation_id:'CANONICAL_COLD_COPY:1:1',now:T})).allowed,false);
 d.raw.exec('DELETE FROM report2_runner_budget_ledger_shadow');for(let i=0;i<47;i++)d.raw.prepare('INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,?,?,?,?,?,?)').run('CANONICAL_COLD_COPY:'+i+':1',day,5000,80,'RESERVED',T,0);
 assert.equal((await reserveCanonicalCopyBudget(d,{reservation_id:'CANONICAL_COLD_COPY:48:1',now:T})).allowed,false);d.raw.close();
});
test('unmeasured completed D1 use or exhausted write reserve blocks copy reservation without resetting anything',async()=>{
 for(const [writes,unknown] of [[70000,0],[1,1],[1,null]]){const d=db(ledger),day=new Date(T).toISOString().slice(0,10);d.raw.prepare('INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,?,?,?,?,?,?)').run('existing',day,1,writes,'FINALIZED',T,unknown);assert.equal((await reserveCanonicalCopyBudget(d,{reservation_id:'CANONICAL_COLD_COPY:1:1',now:T})).allowed,false);assert.equal(d.raw.prepare('SELECT COUNT(*) AS n FROM report2_runner_budget_ledger_shadow').get().n,1);d.raw.close();}
});
test('two original rows and a later presentation revision are durably readable; source rows and clocks stay unchanged',async()=>{
 const rows=['a','b'].map(row),cols=Object.keys(rows[0]);
 const source=db('CREATE TABLE canonical_publication_shadow('+cols.map(k=>k+(k==='observed_ts'?' INTEGER':' TEXT')).join(',')+');');for(const r of rows)source.raw.prepare('INSERT INTO canonical_publication_shadow VALUES('+cols.map(()=>'?').join(',')+')').run(...Object.values(r));
 const cold=db(fs.readFileSync(new URL('../cloudflare/free-history/003_canonical_cold_archive.sql',import.meta.url),'utf8'));
 const candidates=canonicalCopyCandidates(report(),H).candidates,first=await copyCanonicalReport({source_db:source,archive_db:cold,candidates,now:T+1000});assert.equal(first.records.length,2);assert.equal(first.records[0].observed_ts,T);assert.equal(first.main_rows_modified,0);assert(first.records.every(r=>r.private_reader_verified&&!Object.hasOwn(r,'payload_gzip_base64')));
 assert.deepEqual(source.raw.prepare('SELECT * FROM canonical_publication_shadow ORDER BY publication_id').all().map(r=>({...r})),rows);
 source.raw.prepare('UPDATE canonical_publication_shadow SET telegram_text=? WHERE publication_id=?').run('later exact revision',rows[0].publication_id);
 const second=await copyCanonicalReport({source_db:source,archive_db:cold,candidates,now:T+2000});assert.notEqual(second.records[0].raw_sha256,first.records[0].raw_sha256);assert.equal(cold.raw.prepare('SELECT COUNT(*) AS n FROM report2_canonical_cold_archive_v1').get().n,3);source.raw.close();cold.raw.close();
});
test('changed source binding and storage limit do not replace the original or fake a successful archive',async()=>{
 const r=row(),cols=Object.keys(r),source=db('CREATE TABLE canonical_publication_shadow('+cols.map(k=>k+(k==='observed_ts'?' INTEGER':' TEXT')).join(',')+');');source.raw.prepare('INSERT INTO canonical_publication_shadow VALUES('+cols.map(()=>'?').join(',')+')').run(...Object.values(r));
 const cold=db(fs.readFileSync(new URL('../cloudflare/free-history/003_canonical_cold_archive.sql',import.meta.url),'utf8')),candidates=canonicalCopyCandidates(report(),H).candidates.slice(0,1);
 cold.storage_bytes=400000000;await assert.rejects(copyCanonicalReport({source_db:source,archive_db:cold,candidates}),/STORAGE_GUARD/);assert.equal(cold.raw.prepare('SELECT COUNT(*) AS n FROM report2_canonical_cold_archive_v1').get().n,0);
 source.raw.prepare('UPDATE canonical_publication_shadow SET snapshot_id=?').run('mismatch');await assert.rejects(copyCanonicalReport({source_db:source,archive_db:cold,candidates}),/BINDING_MISMATCH/);source.raw.close();cold.raw.close();
});
