import fs from 'node:fs';
import {createHash} from 'node:crypto';

const [command,value,privateResultPath]=process.argv.slice(2);
const keyPath=process.env.PUMP_CONTROL_KEY_FILE;
if(!keyPath||!['manual','result','probe','health'].includes(command))throw Error('USAGE: PUMP_CONTROL_KEY_FILE=private-path node manual-cli.mjs manual SYMBOL [private-result-path]');
const key=fs.readFileSync(keyPath,'utf8').trim();
const base='https://my-report-2-hub.kovalev23091987.workers.dev';
const route={manual:'/pump/manual',result:'/pump/manual-result',probe:'/pump/source-probe',health:'/pump/health'}[command];
const payload=command==='manual'?{symbol:value}:command==='result'?{request_id:value}:command==='probe'?{kind:value,symbol:'BTC-USDT'}:null;
const started_ts=Date.now();
const response=await fetch(base+route,{method:payload?'POST':'GET',headers:{'content-type':'application/json','x-pump-control-key':key},body:payload?JSON.stringify(payload):undefined,redirect:'error',signal:AbortSignal.timeout(90000)});
const raw=await response.text(),received_ts=Date.now();let body;try{body=JSON.parse(raw);}catch{body={error:'INVALID_RUNTIME_JSON'};}
const envelope={url:base+route,http_status:response.status,started_ts,received_ts,raw_sha256:createHash('sha256').update(raw).digest('hex'),body};
if(privateResultPath)fs.writeFileSync(privateResultPath,JSON.stringify(envelope),{mode:0o600});
console.log(JSON.stringify({http_status:response.status,status:body.status??null,error:body.error??null,run_id:body.run_id??null,request_id:body.request_id??null,version:body.version??null,provider_stage:body.provider_stage??null,started_ts,received_ts,private_result_path:privateResultPath??null,raw_sha256:envelope.raw_sha256,native_receipt:body.native_receipt??null,source_http_status:body.response?.status??null,provider_code:body.response?.data?.code??null}));
if(!response.ok)process.exitCode=1;
