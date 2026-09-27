import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),bundle=path.dirname(here),repo=path.resolve(process.argv[2]||'.'),runtime=path.resolve(process.argv[3]||'runtime');
if(Number(process.versions.node.split('.')[0])!==24)throw Error('NODE_24_REQUIRED');
const output=path.join(bundle,'proof','full-validation-'+new Date().toISOString().replace(/[-:.]/g,''));fs.mkdirSync(output,{recursive:true});
const proof={schema:'POSTV7_FULL_OFFLINE_VALIDATION_V1',node:process.version,started_at:new Date().toISOString(),runtime,worker_sha256:createHash('sha256').update(fs.readFileSync(path.join(runtime,'src/worker.js'))).digest('hex'),steps:[],production_changed:false,actual_user_telegram:false,live_source_refresh:false};
const env={...process.env,REPORT2_TEST_RUNTIME:runtime,REPORT2_POST_V7_UNIFIED_ENABLED:'0',REPORT2_LIQUIDATION_EXTENSION_MODE:'OFF',REPORT2_V3_TELEGRAM_NETWORK_ENABLED:'0',REPORT2_TELEGRAM_OUTPUT_ENABLED:'0',REPORT2_TELEGRAM_SHADOW_DECISION_AUTO:'0',REPORT2_TRADING_EXECUTION_ENABLED:'0',REPORT2_VALIDATED_SIGNAL_ENABLED:'0',REPORT2_LIVE_PROBABILITY_ENABLED:'0'};
function run(name,cmd,args,cwd){
 const r=spawnSync(cmd,args,{cwd,env,encoding:'utf8',timeout:180000,maxBuffer:50000000});const text=(r.stdout||'')+(r.stderr||'');const file=path.join(output,name+'.log');fs.writeFileSync(file,text);
 const count=k=>Number(text.match(new RegExp('^# '+k+' (\\d+)$','m'))?.[1]??0);
 const row={name,exit:r.status,signal:r.signal??null,log:path.relative(bundle,file),sha256:createHash('sha256').update(text).digest('hex')};
 if(args.includes('--test'))row.tests={tests:count('tests'),pass:count('pass'),fail:count('fail'),skip:count('skipped')};proof.steps.push(row);
 if(r.status!==0||row.tests?.fail>0||row.tests?.tests===0)throw Error('VALIDATION_STEP_FAILED:'+name+':'+row.log);
 console.log(JSON.stringify(row));return text;
}
const tests=dir=>fs.readdirSync(dir).filter(n=>n.endsWith('.test.mjs')).sort().map(n=>path.join(dir,n));
try{
 run('prepare-inherited',process.execPath,[path.join(here,'prepare-inherited.mjs'),repo,runtime],repo);
 run('runtime-sdk','npm',['ci','--ignore-scripts','--no-audit','--no-fund'],path.join(runtime,'src/liquidation-extension'));
 run('full-worker-import',process.execPath,['--input-type=module','-e',`globalThis.fetch=()=>{throw Error('NO_NETWORK_DURING_IMPORT')};await import(${JSON.stringify(pathToFileURL(path.join(runtime,'src/worker.js')).href)});console.log('FULL_WORKER_IMPORT_PASS')`],repo);
 run('post-v7-retained',process.execPath,['--test','--test-reporter=tap',...tests(path.join(bundle,'post-v7/tests'))],bundle);
 run('liquidation-sdk','npm',['ci','--ignore-scripts','--no-audit','--no-fund'],path.join(bundle,'liquidation/liquidation-extension'));
 run('liquidation-retained-204-and-33',process.execPath,['verify-all.mjs'],path.join(bundle,'liquidation/liquidation-extension'));
 run('final-reconciliation',process.execPath,['--test','--test-reporter=tap',...tests(path.join(bundle,'final-reconciliation/tests'))],bundle);
 run('v7-retained',process.execPath,['--test','--test-reporter=tap',...tests(path.join(repo,'early-surfacing-v7/tests'))],repo);
 run('tz-retained',process.execPath,['--test','--test-reporter=tap',path.join(repo,'telegram-tz-reconciliation-fix/overlay/tests/telegram-tz-formatter.test.mjs'),path.join(repo,'telegram-tz-reconciliation-fix/overlay/tests/adaptive-budget.test.mjs')],repo);
 run('telegram-retained',process.execPath,['--test','--test-reporter=tap',...tests(path.join(runtime,'telegram-repair-tests'))],runtime);
 const retained=['entry-signal-router.test.mjs','closed-minute-decomposition.test.mjs','early-to-fastmove-e2e.test.mjs','canonical-runtime-adapter.test.mjs','pump-liquidation-zones.test.mjs'].map(n=>path.join(repo,'unified-entry-signal-delta/overlay/tests',n));
 run('entry-candles-liquidation-retained',process.execPath,['--test','--test-reporter=tap',...retained],repo);
 const excluded=['deep-check-journal.CHECKPOINT-full-evidence-shadow-production.test.mjs','deep-check-journal.CHECKPOINT-shadow-decision-layer-production.test.mjs','deep-check-journal.CHECKPOINT-shadow-outcome-calibration-production.test.mjs','htx-liquidation-budget.test.mjs','v3-telegram-lifecycle-sidecar.test.mjs','v3-telegram-lifecycle-sidecar-sqlite.test.mjs','v3-early-sidecar-budget.test.mjs','v3-r88-adaptive-budget.test.mjs'];
 proof.inherited_historical_exclusions=excluded;
 const inherited=tests(path.join(runtime,'tests')).filter(f=>!excluded.includes(path.basename(f)));proof.inherited_test_files=inherited.length;
 run('inherited-production-regression',process.execPath,['--test','--test-reporter=tap',...inherited],runtime);
 proof.status='OFFLINE_FULL_CANDIDATE_VERIFIED_NOT_DEPLOYED';
}catch(e){proof.status='NOT_CLOSED';proof.error=String(e.message||e);process.exitCode=1;}
proof.completed_at=new Date().toISOString();fs.writeFileSync(path.join(output,'VERIFICATION.json'),JSON.stringify(proof,null,2)+'\n');fs.writeFileSync(path.join(bundle,'proof','LATEST_FULL_VALIDATION.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({status:proof.status,proof:path.join(output,'VERIFICATION.json'),error:proof.error??null}));
