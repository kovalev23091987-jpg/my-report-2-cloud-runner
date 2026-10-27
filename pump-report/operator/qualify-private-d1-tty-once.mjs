import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const a=JSON.parse(fs.readFileSync(process.argv[2])),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(a.status,'ADMITTED_ONE_ARTIFICIAL_TTY_TRANSPORT');assert(Date.now()<a.expires_ts&&a.expires_ts<=a.own_lease.expires_ts);
const lease=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json')).lease;assert.equal(lease.owner,a.own_lease.owner);assert(!lease.released);
assert.equal(sha(fs.readFileSync(a.core_path)),a.core_sha256);assert(process.stdin.isTTY);
fs.writeFileSync(a.private_attempt,JSON.stringify({started_ts:Date.now(),fixture:'ARTIFICIAL_TTY_NO_DATABASE'}),{flag:'wx',mode:0o600});
const {createF629Relay,F629_URL}=await import(pathToFileURL(path.resolve(a.core_path)));
const oldRaw=process.stdin.isRaw===true;process.stdin.setRawMode(true);
const relay=createF629Relay({input:process.stdin,output:process.stdout});
const proof={schema:'ROOT_F629_ARTIFICIAL_TTY_TRANSPORT_V1',fixture_class:'ARTIFICIAL_REQUEST_AND_RESPONSE_NO_DATABASE',status:'RUNNING',native_SQL:0,actual_Cloudflare_HTTP:0,market_HTTP:0,Telegram:0};
try{
  const r=await relay.fetch(F629_URL,{method:'POST',redirect:'manual',headers:{Authorization:'ARTIFICIAL_DO_NOT_SERIALIZE'},body:JSON.stringify({sql:"SELECT 'ARTIFICIAL_ONLY_NO_DATABASE' AS proof",params:[]}),signal:AbortSignal.timeout(20000)});
  assert.equal(r.status,503);assert.equal(await r.text(),'ARTIFICIAL_EXACT_BYTES_NO_ACK_NO_META');assert.equal(relay.state().calls,1);assert.equal(relay.state().pending,false);
  Object.assign(proof,{status:'PASS',actual_TTY_raw_noecho:true,exact_fake_status_and_bytes_preserved:true,SQL_was_not_executed:true});
}catch(error){proof.status='FAIL';proof.error=String(error.message).slice(0,180);process.exitCode=1;}
finally{relay.close();process.stdin.setRawMode(oldRaw);process.stdin.pause();process.stdin.unref();proof.completed_ts=Date.now();fs.writeFileSync(a.proof_path,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));}
