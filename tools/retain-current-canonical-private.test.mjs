import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {buildNoWorkReceipt} from './report2-no-work-receipt.mjs';

const head='a'.repeat(40),run='38715699578';
const receipt=buildNoWorkReceipt([
 'SCHEDULED_TWO_CANDIDATE_ADMISSION '+JSON.stringify({status:'NOT_DUE',claimed:false,due:false,last_success_ts:1792056389245,next_due_ts:1792058789245}),
 'TRIGGERED_ENTRY_RECHECK_ADMISSION '+JSON.stringify({status:'NO_FRESH_EXACT_SENT_TRIGGER',claimed:false,entry_authorized:false,source_http:0})
].join('\n'),{head,source_cloud_run:run});
async function execute(files){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'report2-copy-outcome-'));
 try{
  await fs.mkdir(path.join(dir,'runtime'));
  for(const [name,value] of Object.entries(files))await fs.writeFile(path.join(dir,'runtime',name),JSON.stringify(value));
  await fs.writeFile(path.join(dir,'deny-network.mjs'),"globalThis.fetch=async()=>{await (await import('node:fs/promises')).writeFile('network-attempt','1');throw Error('UNEXPECTED_NETWORK');};");
  execFileSync(process.execPath,['--import',path.join(dir,'deny-network.mjs'),fileURLToPath(new URL('./retain-current-canonical-private.mjs',import.meta.url))],{cwd:dir,env:{PATH:process.env.PATH,GITHUB_SHA:head,GITHUB_RUN_ID:run,REPORT2_CANONICAL_PRIVATE_COPY_ENABLED:'1'},stdio:'pipe'});
  const result=JSON.parse(await fs.readFile(path.join(dir,'runtime/private-canonical-archive-receipt.json'),'utf8'));
  await assert.rejects(fs.access(path.join(dir,'network-attempt')),{code:'ENOENT'});return result;
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
test('exact no-work outcome skips archive admission without a false copy failure or network',async()=>{
 const result=await execute({'report2-no-work-receipt.json':receipt});
 assert.equal(result.status,'NO_CANONICAL_COPY_EXACT_NO_WORK');assert.equal(result.no_work_receipt_verified,true);
 assert.deepEqual(result.D1,{requests:0,rows_read:0,rows_written:0,unknown_ops:0});assert.equal(result.admission,undefined);
});
test('missing, foreign or malformed no-work outcomes remain failures and never use source limits',async()=>{
 for(const files of [{},{'report2-no-work-receipt.json':{...receipt,source_cloud_run:'1'}},{'report2-no-work-receipt.json':{...receipt,task_writes:1}}]){
  assert.equal((await execute(files)).status,'PRIVATE_ARCHIVE_COPY_NOT_CLOSED');
 }
});
test('a present report still follows its original candidate selection path',async()=>{
 const result=await execute({'report2-run-result.json':{head,run_id:'original',status:'CLOSED',candidates:[]}});
 assert.equal(result.status,'NO_PUBLICATIONS');assert.equal(result.source_run_id,'original');assert.equal(result.no_work_receipt_verified,undefined);
});
