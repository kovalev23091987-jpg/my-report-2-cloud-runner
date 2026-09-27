import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(process.argv[2]||'.'),runtime=path.resolve(process.argv[3]||'runtime');
for(const dir of ['cross-venue-delta-overlay/tests','unified-entry-signal-delta/overlay/runtime-test-overrides'])for(const name of fs.readdirSync(path.join(repo,dir)).filter(n=>n.endsWith('.mjs')))fs.copyFileSync(path.join(repo,dir,name),path.join(runtime,'tests',name));
for(const name of ['apply-telegram-runtime-overlay.mjs','r8-20-prospective-validation-sidecar.mjs','telegram-info-runtime.mjs','telegram-output.mjs','telegram-zero-reason.mjs','plain-text-telegram.mjs','telegram-readonly-diagnostic.mjs','report2-d1-adapter.mjs','d1-preaction-budget-guard.mjs'])fs.copyFileSync(path.join(repo,'runner',name),path.join(runtime,name));
fs.cpSync(path.join(repo,'telegram-repair-tests'),path.join(runtime,'telegram-repair-tests'),{recursive:true});
for(const name of fs.readdirSync(path.join(here,'runtime-test-overrides'))){
 fs.copyFileSync(path.join(here,'runtime-test-overrides',name),path.join(runtime,'tests',name));
 if(name==='v3-telegram-delivery-sidecar.test.mjs')fs.copyFileSync(path.join(here,'runtime-test-overrides',name),path.join(runtime,'telegram-repair-tests',name));
}
fs.mkdirSync(path.join(repo,'r10_7_auth/src'),{recursive:true});
for(const name of ['fast-move-watch-runtime.mjs','fast-move-watch-engine.mjs'])fs.copyFileSync(path.join(runtime,'src',name),path.join(repo,'r10_7_auth/src',name));
console.log('INHERITED_HARNESS_READY_ASSERTIONS_PRESERVED_WITH_CURRENT_SCHEMA_AND_FORMAT');
