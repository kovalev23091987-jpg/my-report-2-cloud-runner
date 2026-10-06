import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {collectHtxPublicRiskEvidence,HTX_PUBLIC_RISK_EVIDENCE_VERSION} from '../files/src/htx-public-risk-evidence.mjs';
import {validateEvidenceV2} from '../files/src/evidence-v2.mjs';
const gz=fs.readFileSync(new URL('./fixtures/actual-risk-cache-expiry.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(gz).digest('hex'),'5467ef3c3891352aa09a6803b34a7d3b0c443bc9f9c006d78172d420b631a5d8');
const fixture=JSON.parse(gunzipSync(gz));assert.equal(fixture.sourceHTTP,0);assert.equal(fixture.proofs_combined_as_one_live_acceptance,false);
function retainedCacheDb(row,{asset=true,shared=true}={}){
 const packet={version:HTX_PUBLIC_RISK_EVIDENCE_VERSION,status:'CLOSED',internal_only:true,observed_ts:row.cache_read_ts,evidence:row.evidence,receipts:row.source_checks.receipts};
 const headers={version:HTX_PUBLIC_RISK_EVIDENCE_VERSION,run_id:row.run_id,observed_ts:row.cache_read_ts,source_ts:row.evidence[0].source_ts};
 return {batch:async()=>[],prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async first(){
  assert.match(sql,/FROM report2_evidence_source_cache/);
  const key=this.args[1],cutoff=this.args[2],expiry=row.evidence[0].expires_at;
  if(expiry<=cutoff)return null;
  if(asset&&key===row.contract)return{payload_json:JSON.stringify(packet)};
  if(shared&&key==='ALL_HTX_LINEAR_SWAPS_V2')return{payload_json:JSON.stringify(headers)};
  return null;
 }}}};
}
test('actual retained BR risk facts were valid when cache was read but expired before the same canonical decision',()=>{
 const row=fixture.rows.find(r=>r.contract==='BR-USDT');
 assert.equal(row.source_run,37408724152);
 for(const e of row.evidence){assert.equal(validateEvidenceV2(e,{decision_ts:row.cache_read_ts}).usable,true);assert.equal(validateEvidenceV2(e,{decision_ts:row.decision_ts}).reason,'EVIDENCE_EXPIRED');}
 assert.equal(row.evidence[0].expires_at-row.cache_read_ts,4644);
});
test('near-expiry exact and shared retained BR caches require existing three-request admission instead of relabelled fresh facts',async()=>{
 const row=fixture.rows.find(r=>r.contract==='BR-USDT');
 for(const asset of [true,false]){
  const admitted=[];
  const result=await collectHtxPublicRiskEvidence({db:retainedCacheDb(row,{asset}),contract:row.contract,run_id:row.run_id,now:row.cache_read_ts,request_admit:args=>{admitted.push(args);return{allowed:false,status:'TEST_BUDGET_BLOCKED'};},fetch_impl:()=>{throw Error('NO_SOURCE_HTTP_ALLOWED');}});
  assert.equal(admitted.length,1);assert.equal(admitted[0].attempts,3);assert.equal(admitted[0].lane,'background');
  assert.equal(result.status,'TEST_BUDGET_BLOCKED');assert.equal(result.network_calls,0);assert.deepEqual(result.evidence,[]);
 }
});
test('separate actual earlier QNT cache remains useful at its original clock with zero HTTP and unchanged expiry',async()=>{
 const row=fixture.rows.find(r=>r.contract==='QNT-USDT');assert.equal(row.source_run,37403854284);
 const result=await collectHtxPublicRiskEvidence({db:retainedCacheDb(row),contract:row.contract,run_id:row.run_id,now:row.cache_read_ts,request_admit:()=>{throw Error('VALID_CACHE_SHOULD_NOT_SPEND');},fetch_impl:()=>{throw Error('NO_SOURCE_HTTP_ALLOWED');}});
 assert.equal(result.cache_status,'HIT');assert.equal(result.network_calls,0);assert.deepEqual(result.evidence,row.evidence);
 for(const e of result.evidence){assert.equal(validateEvidenceV2(e,{decision_ts:row.decision_ts}).usable,true);assert.equal(e.expires_at,e.source_ts+3600000);}
});
