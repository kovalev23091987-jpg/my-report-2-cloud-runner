import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const a=JSON.parse(fs.readFileSync(process.argv[2])),sha=s=>createHash('sha256').update(s).digest('hex');
assert.equal(a.status,'ADMITTED_ONE_AFFECTED_RELAY_GUARD_QUALIFICATION');assert(Date.now()<a.expires_ts);
const phase=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json'));assert.equal(phase.lease.owner,a.own_lease.owner);assert(!phase.lease.released);
const source=fs.readFileSync(a.driver_path,'utf8');assert.equal(sha(source),a.driver_sha256);
fs.writeFileSync(a.private_attempt,JSON.stringify({started_ts:Date.now(),actual_API:0,actual_SQL:0}),{flag:'wx',mode:0o600});
const body={sql:"SELECT '中文' AS ARTIFICIAL_NO_DATABASE",params:['цена']},bodyText=JSON.stringify(body),id='F629:ARTIFICIAL:1';
const frame={tag:'F629_PRIVATE_D1_REQUEST_V1',id,method:'POST',path:'/accounts/70ee0af85191ea470e74c7383fdec772/d1/database/057a2847-2cc4-4e52-8534-1be1596d21d5/query',body,request_body_sha256:sha(bodyText),request_body_bytes:Buffer.byteLength(bodyText)};
const actual={status:503,success:false,result:null,errors:[{code:0,message:'ARTIFICIAL_RESPONSE_'+('汉字'.repeat(90000))}],messages:[]};
const run=async kind=>{
  let calls=0,writes=0,reply='';const memory=new Map();
  const tools={async exec_command(){return {session_id:1,output:JSON.stringify(kind==='HASH_MISMATCH'?{...frame,request_body_sha256:'0'.repeat(64)}:frame)+'\n'};},
    async mcp__codex_apps__cloudflare_api_work_execute(){calls++;if(kind==='DEADLINE')await new Promise(r=>setTimeout(r,80));return {structuredContent:actual,content:[],isError:false};},
    async write_stdin(r){if(r.chars==='\u0003')return {exit_code:1,output:''};writes++;reply+=r.chars;if(!reply.endsWith('\n'))return {session_id:1,output:''};const p=JSON.parse(reply);assert.equal(p.id,id);assert.equal(p.request_body_sha256,frame.request_body_sha256);
      if(kind==='DEADLINE')return {exit_code:1,output:''};assert.equal(p.status,503);assert.deepEqual(JSON.parse(Buffer.from(p.body_b64,'base64').toString('utf8')),actual);
      return kind==='DUPLICATE'?{session_id:1,output:JSON.stringify(frame)+'\n'}:{exit_code:0,output:JSON.stringify({status:'ARTIFICIAL_DONE_NOT_NATIVE_ACCEPTANCE'})+'\n'};
    }};
  const driver=Function('tools','store','notify','return ('+source+');')(tools,(k,v)=>memory.set(k,v),()=>{});
  const result=await driver({mode:'ACTUAL_ADMITTED_NATIVE',command:'ARTIFICIAL_NOT_EXECUTED',workdir:'.',expires_ts:Date.now()+(kind==='DEADLINE'?50:30000),maximum_requests:2,connector_link_id:'ARTIFICIAL_NO_CONNECTOR'});
  if(kind==='ROUNDTRIP'){assert.equal(result.status,'PROCESS_COMPLETED');assert.equal(calls,1);assert(writes>=2);assert.equal(result.native_acceptance_requires_private_result,true);}
  if(kind==='DUPLICATE'){assert.equal(result.error,'ROOT_RPC_REPLAY_REFUSED_BEFORE_CONNECTOR');assert.equal(calls,1);}
  if(kind==='HASH_MISMATCH'){assert.equal(result.error,'ROOT_RPC_BODY_BINDING_MISMATCH');assert.equal(calls,0);}
  if(kind==='DEADLINE'){assert.equal(result.status,'FAILED_OR_UNKNOWN_NO_RETRY');assert.equal(calls,1);}
  return {case:kind,status:'PASS',mock_connector_calls:calls,mock_stdin_writes:writes};
};
const result={schema:'ROOT_F630_AFFECTED_RELAY_GUARD_RESULT_V1',status:'RUNNING',fixture_class:'ARTIFICIAL_TOOLS_NO_DATABASE_OR_CONNECTOR',actual_Cloudflare_HTTP:0,native_SQL:0,market_HTTP:0,Telegram:0,engine:0,cases:[]};
try{for(const k of ['ROUNDTRIP','DUPLICATE','HASH_MISMATCH','DEADLINE'])result.cases.push(await run(k));result.status='PASS';}
catch(error){result.status='FAIL';result.error=String(error.message).slice(0,300);process.exitCode=1;}
finally{result.completed_ts=Date.now();fs.writeFileSync(a.proof_path,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));}
