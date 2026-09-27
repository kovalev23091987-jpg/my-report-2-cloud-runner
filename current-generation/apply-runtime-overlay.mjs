import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url));
const runtime=path.resolve(process.argv[2]||'runtime');
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const expectedInput='940bb12428f320bf248fadd2acd45399af705e144440750973551e5a935f7cc2';
const input=path.join(runtime,'src/worker.js');
if(!fs.existsSync(input)||sha(input)!==expectedInput)throw Error('CURRENT_GENERATION_INPUT_RUNTIME_MISMATCH');
const files=[
 'runner-main.mjs',
 'byk-quota-budget.mjs',
 'src/worker.js',
 'src/canonical-display.mjs',
 'src/native-liquidation-guard.mjs',
 'src/reason-registry.mjs',
 'src/pump-liquidation-zones.mjs',
 'src/canonical-runtime-adapter.mjs',
 'src/telegram-compact-formatter.mjs',
 'src/manual-report-formatter.mjs',
 'src/liquidation-extension/runner-extension.mjs',
 'src/liquidation-extension/htx-liquidation-route.mjs'
];
for(const rel of files){const from=path.join(here,'files',rel),to=path.join(runtime,rel);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}
console.log(JSON.stringify({status:'CURRENT_GENERATION_APPLIED',generation:'MY_REPORT_2_CURRENT_20260927_LIQ_ALL_HTX_EXCEPT_BTC_ETH_V1',worker_sha256:sha(input),schedule_minutes:18,native_liquidation_extension:'OFF'}));
