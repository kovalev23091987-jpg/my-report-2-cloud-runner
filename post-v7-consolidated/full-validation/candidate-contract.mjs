import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const bundle=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(process.argv[2]||'.');
const base='f7c5c77acfc2640c2c9b396d61560d33bf4fa263';
const worker='940bb12428f320bf248fadd2acd45399af705e144440750973551e5a935f7cc2';
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>{const r=spawnSync('git',args,{cwd:repo,encoding:'utf8'});if(r.status!==0)throw Error('GIT_CHECK_FAILED:'+args[0]);return r.stdout.trim();};
const manifest=JSON.parse(fs.readFileSync(path.join(bundle,'CONTENT_MANIFEST.json'),'utf8'));
if(manifest.base!==base||manifest.worker_sha256!==worker)throw Error('WRONG_RELEASE');
for(const f of manifest.files){const p=path.join(bundle,f.path);if(!fs.lstatSync(p).isFile()||fs.lstatSync(p).isSymbolicLink()||hash(fs.readFileSync(p))!==f.sha256)throw Error('BUNDLE_HASH:'+f.path);}
const workflow=fs.readFileSync(path.join(repo,'.github/workflows/report2.yml'),'utf8');
for(const text of ['cron: "2,14,26,38,50 * * * *"','REPORT2_D1_RUNS_PER_DAY: "120"','REPORT2_D1_MAX_DAILY_READS: "3500000"','REPORT2_D1_MAX_DAILY_WRITES: "70000"','REPORT2_POST_V7_UNIFIED_ENABLED: "0"','REPORT2_LIQUIDATION_EXTENSION_MODE: "OFF"','REPORT2_ANALYTICS_ACTOR: "GITHUB_ACTIONS"',worker,'post-v7-consolidated/full-validation/apply-all-runtime.mjs runtime'])if(!workflow.includes(text))throw Error('SCHEDULE_SAFETY_CONTRACT:'+text);
for(const f of manifest.repository_replacements){if(hash(fs.readFileSync(path.join(repo,f.path)))!==f.sha256)throw Error('REPOSITORY_REPLACEMENT:'+f.path);}
if(process.env.CI==='true'){
 if(git('rev-parse','HEAD^')!==base||git('rev-parse','refs/remotes/origin/main')!==base)throw Error('EXACT_CURRENT_MAIN_REQUIRED');
 const inventory=new Set([...manifest.files.map(f=>'post-v7-consolidated/'+f.path),'post-v7-consolidated/CONTENT_MANIFEST.json']);
 const tracked=git('ls-files','post-v7-consolidated/').split('\n').filter(Boolean);
 if(tracked.length!==inventory.size||tracked.some(f=>!inventory.has(f)))throw Error('TRACKED_BUNDLE_INVENTORY_MISMATCH');
 const changed=git('diff','--name-only',base,'HEAD').split('\n').filter(Boolean);
 const allowed=new Set(manifest.repository_replacements.map(f=>f.path));
 for(const f of changed)if(!f.startsWith('post-v7-consolidated/')&&!allowed.has(f))throw Error('PROTECTED_PATH_CHANGED:'+f);
 if(!process.env.GITHUB_REF?.startsWith('refs/heads/post-v7-consolidated-candidate-20260927-'))throw Error('CANDIDATE_BRANCH_REQUIRED');
}
console.log(JSON.stringify({status:'CANDIDATE_CONTRACT_PASS',base,worker_sha256:worker,files:manifest.files.length,production_changed:false}));
