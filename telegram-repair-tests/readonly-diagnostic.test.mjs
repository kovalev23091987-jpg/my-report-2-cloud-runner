import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pipelineDB,seedHandoff,seedWave} from './pipeline-db.mjs';

async function withDiagnostic(measured,check) {
  const db=pipelineDB();seedHandoff(db);seedWave(db);
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'telegram-diagnosis-'));
  const cwd=process.cwd(),fetch=globalThis.fetch,environment={...process.env};let calls=0;
  fs.mkdirSync(path.join(temporary,'runtime/src'),{recursive:true});
  for(const name of ['worker.js','v3-early-sidecar.mjs','v3-telegram-lifecycle-sidecar.mjs','v3-telegram-lifecycle.mjs','v3-telegram-runtime.mjs'])
    fs.writeFileSync(path.join(temporary,'runtime/src',name),'fingerprint fixture');
  globalThis.fetch=async(url,options)=>{
    calls++;const q=JSON.parse(options.body);assert.equal(q.op,'all');assert.match(q.sql,/^SELECT\s/i);
    const rows=db.sqlite.prepare(q.sql).all(...q.params);
    return new Response(JSON.stringify({ok:true,result:{success:true,results:rows},usage:{measured,rows_read:rows.length,rows_written:0}}));
  };
  Object.assign(process.env,{REPORT2_D1_BRIDGE_URL:'https://local-fixture.invalid',REPORT2_D1_BRIDGE_TOKEN:'fixture-only',GITHUB_SHA:'fixture-head'});
  process.chdir(temporary);
  try {
    await check(()=>import('../telegram-readonly-diagnostic.mjs?measured='+measured),temporary,()=>calls);
  } finally {
    process.chdir(cwd);globalThis.fetch=fetch;
    for(const key of Object.keys(process.env))if(!(key in environment))delete process.env[key];
    Object.assign(process.env,environment);db.close();fs.rmSync(temporary,{recursive:true,force:true});
  }
}
test('read-only production diagnostic executes actual deployed-schema SELECTs and never sends',async()=>{
  await withDiagnostic(true,async(load,dir,calls)=>{
    await load();const proof=JSON.parse(fs.readFileSync(path.join(dir,'telegram-readonly-diagnosis.json')));
    assert.equal(proof.head,'fixture-head');assert.equal(proof.production_writes,false);assert.equal(proof.network_send,false);
    assert.equal(proof.usage.rows_written,0);assert.equal(proof.usage.unknown_ops,0);assert.ok(calls()<=16);
    assert.equal(proof.evidence[0].deep.contract_code,'RAY-USDT');assert.equal(proof.evidence[0].early.length,1);
  });
});
test('diagnostic stops when D1 read usage is unproven and publishes no success proof',async()=>{
  await withDiagnostic(false,async(load,dir,calls)=>{
    await assert.rejects(load(),/READ_ONLY_USAGE_NOT_PROVEN/);assert.equal(calls(),1);
    assert.equal(fs.existsSync(path.join(dir,'telegram-readonly-diagnosis.json')),false);
  });
});
