import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'..');
const expectedWorker='c1d3bd22f5739050688d87f58bab1bb2c3fe612a128427b19c492a631fe6158d';
const run=(args,{cwd=repo}={})=>{
 const result=spawnSync(process.execPath,args,{cwd,encoding:'utf8',stdio:'pipe'});
 if(result.status!==0)throw new Error(`FAILED node ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
 return result.stdout.trim();
};
const checks=[
 'files/byk-quota-budget.mjs','files/runner-main.mjs','files/src/worker.js',
 'files/src/canonical-runtime-adapter.mjs','files/src/pump-liquidation-zones.mjs',
 'files/src/manual-report-formatter.mjs','files/src/telegram-compact-formatter.mjs',
 'files/src/liquidation-extension/runner-extension.mjs','files/src/liquidation-extension/htx-liquidation-route.mjs',
];
for(const rel of checks)run(['--check',path.join(here,rel)]);
const tests=fs.readdirSync(path.join(here,'tests')).filter(x=>x.endsWith('.test.mjs')).sort().map(x=>path.join(here,'tests',x));
run(['--test',...tests]);
const generation=JSON.parse(fs.readFileSync(path.join(here,'GENERATION.json'),'utf8'));
if(generation.schedule_minutes!==18||generation.scheduled_runs_per_day!==80||generation.worst_case_31_day_requests_with_three_manual_runs_daily!==12865)throw Error('GENERATION_QUOTA_MATH_MISMATCH');
const sourceRuntime=process.argv[2]?path.resolve(process.argv[2]):null;
let overlay=null;
if(sourceRuntime){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'report2-current-generation-'));
 const runtime=path.join(temp,'runtime');
 fs.cpSync(sourceRuntime,runtime,{recursive:true});
 overlay=JSON.parse(run([path.join(here,'apply-runtime-overlay.mjs'),runtime]));
 const worker=fs.readFileSync(path.join(runtime,'src/worker.js'));
 const actual=createHash('sha256').update(worker).digest('hex');
 if(actual!==expectedWorker||overlay.worker_sha256!==expectedWorker)throw Error(`OVERLAY_WORKER_HASH_MISMATCH:${actual}`);
 if(!fs.existsSync(path.join(runtime,'byk-quota-budget.mjs')))throw Error('OVERLAY_QUOTA_MODULE_MISSING');
 for(const rel of ['runner-main.mjs','byk-quota-budget.mjs','src/worker.js'])run(['--check',path.join(runtime,rel)]);
 fs.rmSync(temp,{recursive:true,force:true});
}
console.log(JSON.stringify({status:'CURRENT_GENERATION_VALIDATED',generation:generation.generation,tests:'PASS',syntax:'PASS',schedule_minutes:18,scheduled_runs_per_day:80,worst_case_31_day_requests:12865,overlay:overlay?'PASS':'NOT_REQUESTED'}));
