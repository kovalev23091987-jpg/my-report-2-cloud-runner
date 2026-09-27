import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {applyAfterUnified} from './apply-after-unified.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);const out=path.join(root,'.verification/merged-unified');
fs.rmSync(out,{force:true,recursive:true});fs.cpSync(path.join(here,'fixtures/base-runtime'),out,{recursive:true});
for(const name of fs.readdirSync(path.join(here,'fixtures/postv7-canonical')))fs.copyFileSync(path.join(here,'fixtures/postv7-canonical',name),path.join(out,'src',name));
fs.copyFileSync(path.join(here,'fixtures/postv7-worker/src/worker.js'),path.join(out,'src/worker.js'));
fs.copyFileSync(path.join(here,'fixtures/postv7-worker/runner-main.mjs'),path.join(out,'runner-main.mjs'));
for(const name of fs.readdirSync(path.join(here,'fixtures/postv7-delivery-base')))fs.copyFileSync(path.join(here,'fixtures/postv7-delivery-base',name),path.join(out,'src',name));
for(const name of ['v3-telegram-runtime.mjs','v3-pipeline-health-runtime.mjs','recheck-scheduler.mjs'])fs.copyFileSync(path.join(here,'unified-delivery',name),path.join(out,'src',name));
const proof=applyAfterUnified(out);fs.writeFileSync(path.join(here,'proof/merged-unified-apply.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({status:proof.status,files:proof.files.length,expected_worker:proof.expected_worker_sha256,source_mode_default_off:proof.source_mode_default_off,full_worker_import_proven:false}));
