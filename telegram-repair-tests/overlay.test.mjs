import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {applyTelegramRuntimeOverlay} from '../apply-telegram-runtime-overlay.mjs';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
test('overlay checks every base before any writes, is idempotent, and never touches the Worker',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tg-overlay-'));fs.mkdirSync(path.join(dir,'src'));
  try {
    fs.writeFileSync(path.join(dir,'src/worker.js'),'fixture worker');
    const names=['v3-early-sidecar.mjs','v3-telegram-lifecycle-sidecar.mjs'];
    for(const name of names)fs.writeFileSync(path.join(dir,'src',name),'old\n');
    const m={schema:'telegram-runtime-overlay-v1',worker_sha256:sha('fixture worker'),files:names.map(name=>({path:'src/'+name,before_sha256:sha('old\n'),after_sha256:sha('new\n'),edits:[{start:0,end:1,old:'old\n',new:'new\n'}]}))};
    const manifest=path.join(dir,'manifest.json');fs.writeFileSync(manifest,JSON.stringify(m));
    fs.writeFileSync(path.join(dir,'src',names[1]),'different\n');
    await assert.rejects(applyTelegramRuntimeOverlay(dir,manifest),/RUNTIME_BASE_CHANGED/);
    assert.equal(fs.readFileSync(path.join(dir,'src',names[0]),'utf8'),'old\n');
    fs.writeFileSync(path.join(dir,'src',names[1]),'old\n');
    await applyTelegramRuntimeOverlay(dir,manifest);await applyTelegramRuntimeOverlay(dir,manifest);
    assert.equal(fs.readFileSync(path.join(dir,'src/worker.js'),'utf8'),'fixture worker');
    assert.equal(fs.readFileSync(path.join(dir,'src',names[1]),'utf8'),'new\n');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
