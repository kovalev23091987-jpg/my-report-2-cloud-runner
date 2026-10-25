import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {manualResponseText} from './manual-response.mjs';

const [command,value,outputArg]=process.argv.slice(2);
const privateDir=new URL('../.private/',import.meta.url);
const keyPath=process.env.PUMP_CONTROL_KEY_FILE??new URL('control-key',privateDir);
const privateResultPath=outputArg??new URL('results/'+Date.now()+'-'+command+'.json',privateDir);
if(!keyPath||!['manual','result','summary','summary-check','probe','map-probe','day-probe','metadata-probe','integration-check','health','delivery-check'].includes(command))throw Error('USAGE: PUMP_CONTROL_KEY_FILE=private-path node manual-cli.mjs manual SYMBOL [private-result-path]');
const key=fs.readFileSync(keyPath,'utf8').trim();
const base='https://my-report-2-hub.kovalev23091987.workers.dev';
const route={manual:'/pump/manual',result:'/pump/manual-result',summary:'/pump/summary','summary-check':'/pump/summary','delivery-check':'/pump/delivery-check','map-probe':'/pump/map-probe','day-probe':'/pump/day-probe','metadata-probe':'/pump/metadata-probe','integration-check':'/pump/integration-check',probe:'/pump/source-probe',health:'/pump/health'}[command];
const payload=command==='manual'?{symbol:value,request_id:process.env.PUMP_REQUEST_ID??randomUUID()}:command==='result'?{request_id:value}:command==='summary'?{max_records:Number(value??40)}:command==='summary-check'?{grant_id:value,max_records:4}:command==='probe'?{kind:value,symbol:'BTC-USDT'}:command==='delivery-check'?{diagnostic_id:value}:['map-probe','day-probe'].includes(command)?{probe_id:value}:['integration-check','metadata-probe'].includes(command)?{grant_id:value}:null;
const started_ts=Date.now();
const response=await fetch(base+route,{method:payload?'POST':'GET',headers:{'content-type':'application/json','x-pump-control-key':key},body:payload?JSON.stringify(payload):undefined,redirect:'error',signal:AbortSignal.timeout(90000)});
const raw=await response.text(),received_ts=Date.now();let body;try{body=JSON.parse(raw);}catch{body={error:'INVALID_RUNTIME_JSON'};}
const envelope={url:base+route,http_status:response.status,started_ts,received_ts,raw_sha256:createHash('sha256').update(raw).digest('hex'),body};
if(!outputArg)fs.mkdirSync(new URL('results/',privateDir),{recursive:true,mode:0o700});
fs.writeFileSync(privateResultPath,JSON.stringify(envelope),{mode:0o600});
fs.chmodSync(privateResultPath,0o600);
console.log(JSON.stringify({http_status:response.status,status:body.status??null,error:body.error??null,run_id:body.run_id??null,request_id:body.request_id??null,version:body.version??null,provider_stage:body.provider_stage??null,started_ts,received_ts,private_result_path:privateResultPath??null,raw_sha256:envelope.raw_sha256,native_receipt:body.native_receipt??null,source_http_status:body.response?.status??null,provider_code:body.response?.data?.code??null}));
const analysis=body.manual_result?.analysis??body.result?.analysis;
if(['manual','result','integration-check'].includes(command))console.log('\n'+(command==='integration-check'?'Приёмочная проверка без отправки в Telegram.\n':'')+(body.manual_response_text??manualResponseText(response.ok?body.manual_result??body.result??body:{status:'ERROR',reason:body.error})));
else if(analysis?.card_text)console.log('\n'+analysis.card_text);
if(['summary','summary-check'].includes(command)&&body.result)console.log(JSON.stringify(body.result,null,2));
if(!response.ok)process.exitCode=1;
