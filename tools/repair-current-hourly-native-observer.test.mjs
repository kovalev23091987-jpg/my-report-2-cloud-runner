import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
test('unqualified hourly observer release refuses before GitHub/Cloudflare transport, SQL or provider requests',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'report2-hourly-release-disabled-'));try{
 const script=`globalThis.fetch=async()=>{throw Error('FORBIDDEN_NETWORK')};await import(${JSON.stringify(new URL('./repair-current-hourly-native-observer.mjs',import.meta.url).href)});`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:dir,env:{PATH:process.env.PATH,GITHUB_TOKEN:'offline-control',GITHUB_REPOSITORY:'kovalev23091987-jpg/my-report-2-cloud-runner',GITHUB_SHA:'a'.repeat(40),OBSERVER_HEAD:'a'.repeat(40),GITHUB_REF:'refs/heads/feature',CONNECTED_RUN:'42'},encoding:'utf8'});
 assert.equal(result.status,1,result.stderr);const p=JSON.parse(fs.readFileSync(path.join(dir,'audit-output/hourly-native-observer/proof.json'),'utf8'));assert.equal(p.reason,'EXACT_HOURLY_OBSERVER_RELEASE_ACCESS_REQUIRED');assert.equal(p.github_HTTP,0);assert.equal(p.cloudflare_HTTP,0);assert.equal(p.D1,0);assert.equal(p.sourceHTTP,0);assert.equal(p.production_scope_changed,false);
 }finally{fs.rmSync(dir,{recursive:true});}
});
test('hourly release has no D1 or source credentials, no direct invocation, and keeps the exact pinned dry build and false default',()=>{
 const y=fs.readFileSync(new URL('../.github/workflows/current-hourly-native-observer-repair.yml',import.meta.url),'utf8');assert.match(y,/github.ref == 'refs\/heads\/main'/);assert.match(y,/default: false/);assert.match(y,/wrangler@4\.151\.0 deploy --dry-run/);assert.doesNotMatch(y,/D1_BRIDGE|D1_API_TOKEN|TELEGRAM_BOT_TOKEN|runner-main|--test-scheduled/);
});
