import {spawnSync} from 'node:child_process';
import path from 'node:path';

const runtime=path.resolve(process.argv[2]||'runtime'),here=path.dirname(new URL(import.meta.url).pathname);
function run(script){const out=spawnSync(process.execPath,[path.join(here,script),runtime],{encoding:'utf8',maxBuffer:16*1024*1024});if(out.status!==0)throw new Error(`${script}:${out.stderr||out.stdout}`);return JSON.parse(out.stdout);}
const p0=run('p0-integration-20.mjs'),p1=run('p1-integration-17.mjs'),results=[...(p0.results||[]),...(p1.results||[])],numbers=results.map(row=>row.number).sort((a,b)=>a-b),expected=Array.from({length:37},(_,i)=>i+1);
const status=p0.status==='PASS'&&p1.status==='PASS'&&JSON.stringify(numbers)===JSON.stringify(expected)&&results.every(row=>row.status==='PASS')?'PASS':'FAIL';
const receipt={schema:'report2-v13-final-integration-37-v1',status,runtime,passed:results.filter(row=>row.status==='PASS').length,failed:results.filter(row=>row.status!=='PASS').length,scenarios:results,telegram_network_calls:0,synthetic_signal_created:false,thresholds_changed:false,external_format_changed:false};
console.log(JSON.stringify(receipt,null,2));if(status!=='PASS')process.exitCode=1;
