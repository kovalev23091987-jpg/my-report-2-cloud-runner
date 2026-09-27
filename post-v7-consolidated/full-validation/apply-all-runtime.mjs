import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),bundle=path.dirname(here);
const runtime=path.resolve(process.argv[2]||'runtime'),repo=path.resolve(process.argv[3]||'.');
const BASE='f7c5c77acfc2640c2c9b396d61560d33bf4fa263';
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function run(cmd,args,cwd=repo){const r=spawnSync(cmd,args,{cwd,encoding:'utf8',timeout:120000,maxBuffer:20000000});if(r.status!==0)throw Error(`STEP_FAILED:${cmd} ${args.join(' ')}\n${r.stderr||r.stdout}`);return r.stdout;}
if(!fs.existsSync(path.join(runtime,'package.json')))throw Error('DECRYPTED_OR_VERIFIED_AUTHORITATIVE_RUNTIME_REQUIRED');
if(fs.existsSync(path.join(runtime,'full-runtime-reconciliation-proof.json')))throw Error('FRESH_RUNTIME_REQUIRED');
const savedWorkflow=path.join(here,'base-report2.yml');
if(sha(savedWorkflow)!=='fa9490aa77153688b622165fe792ca12eea415f8819ff54508a58209d93c115d')throw Error('BASE_WORKFLOW_CHANGED');
const savedRunner=path.join(here,'post-v7-runner-before-liquidation.mjs');
if(sha(savedRunner)!=='2354d4d84e28b2db2cabef5d1fe8233b6842f8bf02d8a2050df0d9c1498157cb')throw Error('POSTV7_RUNNER_CHANGED');
const workflow=fs.readFileSync(savedWorkflow,'utf8');
let count=0;
for(const raw of workflow.split('\n')){
 const line=raw.trim(),copy=line.match(/^cp (runner\/\S+) runtime\/(\S+)$/);
 if(copy){fs.copyFileSync(copy[1]==='runner/runner-main.mjs'?savedRunner:path.join(repo,copy[1]),path.join(runtime,copy[2]));continue;}
 const overlay=line.match(/^node (\S+) runtime(?: (\S+))?$/);
 if(overlay){run(process.execPath,[path.join(repo,overlay[1]),runtime,...(overlay[2]?[path.join(repo,overlay[2])]:[])]);count++;}
}
if(count!==15||sha(path.join(runtime,'src/worker.js'))!=='a2b3c2d364202b3cbbd3a40407733cb5d385f01b70e43786066fbeb84bb25225')throw Error('EXACT_V7_RECONSTRUCTION_FAILED');
run(process.execPath,[path.join(bundle,'post-v7/overlay/apply-post-v7-unified-overlay.mjs'),runtime]);
run(process.execPath,[path.join(bundle,'liquidation/liquidation-extension/integration/apply-after-unified.mjs'),runtime]);
run(process.execPath,[path.join(bundle,'final-reconciliation/apply-runtime-overlay.mjs'),runtime]);
run(process.execPath,[path.join(repo,'current-generation/apply-runtime-overlay.mjs'),runtime]);
console.log(JSON.stringify({status:'FULL_COMBINED_RUNTIME_RECONSTRUCTED',base:BASE,production_overlays:count,worker_sha256:sha(path.join(runtime,'src/worker.js')),source_mode_default:'OFF',production_changed:true}));
