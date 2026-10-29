import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readCurrentSelectedRunAnalysisPacket} from '../../operator/current-analysis-selected-run-packet.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const [admissionPath,attemptPath,resultPath]=process.argv.slice(2),a=JSON.parse(readFileSync(admissionPath,'utf8'));
assert.equal(a.status,'ADMITTED_NOT_SPENT');assert.ok(Date.now()<a.expires_ts&&Date.now()<a.own_lease.expires_ts);
assert.equal(sha(readFileSync(new URL(import.meta.url))),a.case_sha256);
assert.equal(sha(readFileSync(new URL('../../operator/current-analysis-selected-run-packet.mjs',import.meta.url))),a.helper_sha256);
const fd=openSync(attemptPath,'wx',0o600);closeSync(fd);
writeFileSync(attemptPath,JSON.stringify({state:'STARTED',no_auto_retry:true}));
const at=1793276167033,valid={after_install_ts:1793275566938,implementation_sha256:'a'.repeat(64),expected_recipient_sha256:'b'.repeat(64)},checks=[];
const invalid=[['null_cutoff',{after_install_ts:null}],['missing_cutoff',{after_install_ts:undefined}],['zero_cutoff',{after_install_ts:0}],['negative_cutoff',{after_install_ts:-1}],['fractional_cutoff',{after_install_ts:1.5}],['NaN_cutoff',{after_install_ts:NaN}],['infinite_cutoff',{after_install_ts:Infinity}],['future_cutoff',{after_install_ts:at+1}],['invalid_pin',{implementation_sha256:'x'}],['invalid_recipient',{expected_recipient_sha256:null}]];
try{
  for(const [name,patch] of invalid){let reads=0;const store={get:async()=>{reads++;throw Error('UNEXPECTED_READ');},scanPrefix:async()=>{reads++;throw Error('UNEXPECTED_READ');}};
    await assert.rejects(readCurrentSelectedRunAnalysisPacket({store,admission:{...valid,...patch},clock:()=>at}),{message:'EXACT_CURRENT_PACKET_SCOPE_REQUIRED'});
    assert.equal(reads,0);checks.push({name,status:'PASS',store_reads:reads});
  }
  let reads=0;const out=await readCurrentSelectedRunAnalysisPacket({store:{get:async key=>{reads++;return key==='pump:candidate-queue'?{}:null;},scanPrefix:async()=>{reads++;return[];}},admission:valid,clock:()=>at});
  assert.equal(out.selected_run_binding.status,'NO_BOUND_CURRENT_ORIGINAL');assert.equal(reads,4);assert.equal(out.observation.first_genuine_same_original_SENT_observed,false);
  checks.push({name:'valid_scope_reaches_unchanged_body',status:'PASS',store_reads:reads});
  const r={schema:'ROOT_SELECTED_RUN_SCOPE_GUARD_CASE_V1',status:'PASS',evidence_class:'CONTROLLED_ONLY_NOT_NATIVE',checks,Node:1,helper_calls:checks.length,accepted_nine_previous_cases_replayed:0,analytics_engine:0,build:0,native_SQL:0,Cloudflare_HTTP:0,market_HTTP:0,Telegram:0,first_genuine_AUTO_SENT:false};
  writeFileSync(resultPath,JSON.stringify(r,null,2)+'\n');writeFileSync(attemptPath,JSON.stringify({state:'COMPLETED',result_sha256:sha(readFileSync(resultPath)),no_auto_retry:true}));
  process.stdout.write(JSON.stringify({status:'PASS',new_guard_cases:checks.length,Node:1,old_nine_replayed:0,real_IO:0,result_sha256:sha(readFileSync(resultPath))}));
}catch(error){writeFileSync(attemptPath,JSON.stringify({state:'FAILED_NO_RETRY',reason:error.message,no_auto_retry:true}));throw error;}
