import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {savedStatisticsOnce} from '../../operator/saved-statistics-once.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('new saved-statistics client enforces old LOOKUP10 with provider zero and a durable fixed guard before its only artificial POST',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pump-saved-stats-guard-')),at=1792959600000,artifact={manifest:{implementation_pin:{sha256:'a'.repeat(64)}},modules:{'runtime/provider-policy.mjs':"export const PROVIDER_STAGE = 'SAVED_STATISTICS_AUDIT_SINGLE';"}},art=JSON.stringify(artifact),a={schema:'PUMP_SAVED_STATISTICS_SINGLE_ADMISSION_V1',status:'ADMITTED_NOT_SPENT',run_id:'pump-saved-statistics-audit-20261025-one',endpoint:'https://my-report-2-hub.kovalev23091987.workers.dev/pump/statistics-audit',native_family:'LOOKUP',max_LOOKUP_runs_day:10,provider_attempts_max:0,Telegram_attempts:0,expires_ts:at+60000,own_lease:{owner:'CODEX:ACTIVE105_SOURCE_RELIABILITY:1792956686000',expires_ts:at+120000},authority_main:'b'.repeat(40),direct_full_implementation_authority_sha256:'c'.repeat(64),artifact_sha256:hash(art),implementation_sha256:'a'.repeat(64)};
 const files={admission_file:path.join(dir,'admission'),artifact_file:path.join(dir,'artifact'),control_key_file:path.join(dir,'key'),attempt_file:path.join(dir,'attempt'),output_file:path.join(dir,'output')};
 await fs.writeFile(files.artifact_file,art);await fs.writeFile(files.control_key_file,'ARTIFICIAL_PRIVATE_KEY',{mode:0o600});let calls=0;
 const invoke=options=>savedStatisticsOnce({...files,execute:true,clock:()=>at,fetch_impl:async(url,options)=>{calls++;assert.ok(await fs.readFile(files.attempt_file));assert.equal(options.redirect,'manual');assert.deepEqual(JSON.parse(options.body),{grant_id:a.run_id});return new Response(JSON.stringify({status:'ARTIFICIAL_ONLY',native_receipt:{state:'FINALIZED'}}),{status:200});},...options});
 await fs.writeFile(files.admission_file,JSON.stringify({...a,max_LOOKUP_runs_day:11}));await assert.rejects(invoke(),/EXACT_SAVED_STATISTICS_ADMISSION/);assert.equal(calls,0);
 await fs.writeFile(files.admission_file,JSON.stringify(a));const q=await invoke();assert.equal(calls,1);assert.equal(q.provider_HTTP,0);assert.equal(q.status,'REPLY_SAVED_NO_RETRY');assert.doesNotMatch(JSON.stringify(q),/ARTIFICIAL_PRIVATE_KEY/);await assert.rejects(invoke(),/ALREADY_EXISTS/);assert.equal(calls,1);
});
