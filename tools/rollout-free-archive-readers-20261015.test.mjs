import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('the checked-in disabled reader request performs no Cloudflare/GitHub/SQL or activation',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'report2-free-reader-disabled-'));
 try{
  await fs.mkdir(path.join(dir,'checkpoints'));await fs.writeFile(path.join(dir,'checkpoints/FREE_ARCHIVE_READER_ROLLOUT_REQUEST_20261015.json'),JSON.stringify({execute:false}));
  await fs.writeFile(path.join(dir,'deny-network.mjs'),"globalThis.fetch=async()=>{await (await import('node:fs/promises')).writeFile('unexpected-network','1');throw Error('NETWORK_DENIED');};");
  execFileSync(process.execPath,['--import',path.join(dir,'deny-network.mjs'),fileURLToPath(new URL('./rollout-free-archive-readers-20261015.mjs',import.meta.url))],{cwd:dir,env:{PATH:process.env.PATH,GITHUB_TOKEN:'test-only'},stdio:'pipe'});
  const out=JSON.parse(await fs.readFile(path.join(dir,'audit-output/free-archive-reader-rollout/proof.json'),'utf8'));assert.equal(out.status,'FREE_ARCHIVE_READER_ROLLOUT_NOT_REQUESTED');assert.equal(out.cloudflare_HTTP,0);assert.equal(out.github_HTTP,0);assert.equal(out.D1,0);assert.equal(out.writer_enabled,false);await assert.rejects(fs.access(path.join(dir,'unexpected-network')),{code:'ENOENT'});
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('manual reader preparation needs no checked-in request and a mismatched main refuses before network',async()=>{
 for(const mismatch of [false,true]){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'report2-current-reader-'));try{
  await fs.writeFile(path.join(dir,'deny-network.mjs'),"globalThis.fetch=async()=>{throw Error('UNEXPECTED_NETWORK');};");const head='a'.repeat(40);
  let failed=false;try{execFileSync(process.execPath,['--import',path.join(dir,'deny-network.mjs'),fileURLToPath(new URL('./rollout-free-archive-readers-20261015.mjs',import.meta.url))],{cwd:dir,env:{PATH:process.env.PATH,GITHUB_TOKEN:'fixture',GITHUB_REPOSITORY:'kovalev23091987-jpg/my-report-2-cloud-runner',GITHUB_REF:'refs/heads/main',GITHUB_SHA:mismatch?'b'.repeat(40):head,EXPECTED_MAIN:head,CONNECTED_RUN:'123',BORROW_EXISTING_OWNER:'OWN',REPORT2_CURRENT_READER_REPAIR:'true',EXECUTE_READER_REPAIR:'false'},stdio:'pipe'});}catch{failed=true;}
  assert.equal(failed,mismatch);const p=JSON.parse(await fs.readFile(path.join(dir,'audit-output/free-archive-reader-rollout/proof.json'),'utf8'));assert.equal(p.github_HTTP,0);assert.equal(p.cloudflare_HTTP,0);assert.equal(p.D1,0);assert.equal(p.writer_enabled,false);assert.equal(p.status,mismatch?'FREE_ARCHIVE_READER_ROLLOUT_NOT_CLOSED':'FREE_ARCHIVE_READER_ROLLOUT_NOT_REQUESTED');if(mismatch)assert.equal(p.reason,'EXACT_CURRENT_MAIN_READER_REPAIR_REQUEST_REQUIRED');
 }finally{await fs.rm(dir,{recursive:true,force:true});}}
});
